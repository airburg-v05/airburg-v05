"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  TmallDateAlignment,
} from "@/components/upload/tmall-date-alignment";
import { TmallDataQualityList } from "@/components/upload/tmall-data-quality-list";
import { TmallJoinQualityPanel } from "@/components/upload/tmall-join-quality";
import { TmallReconciliationCard } from "@/components/upload/tmall-reconciliation-card";
import { TmallSourceHealthGrid } from "@/components/upload/tmall-source-health-grid";
import { UploadDataQualityCenter } from "@/components/upload/upload-data-quality-center";
import {
  TmallSourceUploadCard,
  type TmallUploadSlotState,
} from "@/components/upload/tmall-source-upload-card";
import { TmallUploadActions } from "@/components/upload/tmall-upload-actions";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  clearTmallAnalysisResult,
  saveTmallAnalysisResult,
  TMALL_ANALYSIS_STORAGE_EVENT,
  TMALL_ANALYSIS_STORAGE_KEY,
} from "@/lib/storage/tmall-analysis-storage";
import { parseTmallStoredAnalysisResult } from "@/lib/storage/tmall-analysis-validator";
import { parseTmallTableFile } from "@/lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "@/lib/tmall/pipeline/run-tmall-four-source-analysis";
import { TMALL_SOURCE_LABELS, TMALL_SOURCE_TYPES } from "@/lib/tmall/source-types";
import { buildTmallUploadDataQualityCenter } from "@/lib/tmall/view-models/upload-data-quality-center";
import { formatDateTime } from "@/lib/utils/format";
import type {
  TmallDetectedSourceType,
  TmallFourSourceAnalysisResult,
  TmallSourceType,
} from "@/types/tmall";

type ResultOrigin = "none" | "stored" | "current";

const emptySlot = (): TmallUploadSlotState => ({
  file: null,
  fileName: null,
  fileSize: null,
  status: "empty",
  detectedSourceType: null,
  encoding: null,
  headerRowNumber: null,
  rowCount: null,
  missingRequiredFields: [],
  warnings: [],
  error: null,
});

const createEmptySlots = (): Record<TmallSourceType, TmallUploadSlotState> => ({
  business_product: emptySlot(),
  ad_product: emptySlot(),
  ad_plan: emptySlot(),
  after_sales: emptySlot(),
});

const extensionOf = (filename: string): string => filename.split(".").pop()?.toLowerCase() ?? "";

const expectedExtensions: Record<TmallSourceType, string[]> = {
  business_product: ["xls", "xlsx"],
  ad_product: ["csv"],
  ad_plan: ["csv"],
  after_sales: ["xls", "xlsx"],
};

const detectedSourceLabel = (sourceType: TmallDetectedSourceType): string =>
  sourceType === "unknown" ? "未知数据源" : TMALL_SOURCE_LABELS[sourceType];

const validateExtension = (sourceType: TmallSourceType, file: File): string | null => {
  const extension = extensionOf(file.name);
  if (!expectedExtensions[sourceType].includes(extension)) {
    return `${TMALL_SOURCE_LABELS[sourceType]} 只支持 ${expectedExtensions[sourceType]
      .map((item) => `.${item}`)
      .join(" / ")} 文件。`;
  }

  if (file.size > 30 * 1024 * 1024) {
    return "文件超过 30MB，请先按日期或店铺导出范围拆分。";
  }

  return null;
};

const validSlot = (slot: TmallUploadSlotState): boolean =>
  !!slot.file && (slot.status === "success" || slot.status === "warning");

const subscribeTmallStorage = (callback: () => void): (() => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(TMALL_ANALYSIS_STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TMALL_ANALYSIS_STORAGE_EVENT, callback);
  };
};

const getTmallStorageSnapshot = (): string | null =>
  window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY);

const getServerStorageSnapshot = (): undefined => undefined;

export default function UploadPage() {
  const [slots, setSlots] = useState<Record<TmallSourceType, TmallUploadSlotState>>(createEmptySlots);
  const [currentResult, setCurrentResult] = useState<TmallFourSourceAnalysisResult | null>(null);
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pageMessage, setPageMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const rawStoredResult = useSyncExternalStore(
    subscribeTmallStorage,
    getTmallStorageSnapshot,
    getServerStorageSnapshot,
  );
  const storedAnalysisState = useMemo(() => parseTmallStoredAnalysisResult(rawStoredResult), [rawStoredResult]);
  const storedResult = storedAnalysisState.result;
  const result = selectionDirty ? (storedResult ?? null) : (currentResult ?? storedResult ?? null);
  const resultOrigin: ResultOrigin = !selectionDirty && currentResult ? "current" : storedResult ? "stored" : "none";
  const dataQualityCenterAnalysisStatus = result ? "valid" : storedAnalysisState.status;
  const uploadDataQualityCenter = useMemo(
    () =>
      buildTmallUploadDataQualityCenter({
        analysisStatus: dataQualityCenterAnalysisStatus,
        analysis: result,
        selectedDate: null,
      }),
    [dataQualityCenterAnalysisStatus, result],
  );

  const validFileCount = useMemo(
    () => Object.values(slots).filter(validSlot).length,
    [slots],
  );
  const hasBlockingFileError = Object.values(slots).some((slot) => slot.status === "error");
  const blockedReason = hasBlockingFileError
    ? "当前有识别失败的文件，请先替换或移除后再分析。"
    : validFileCount === 0
      ? "请至少选择一个识别成功的来源。"
      : null;

  const updateSlot = (sourceType: TmallSourceType, nextSlot: TmallUploadSlotState) => {
    setSlots((current) => ({
      ...current,
      [sourceType]: nextSlot,
    }));
  };

  const markSelectionChanged = () => {
    setSelectionDirty(true);
    setCurrentResult(null);
  };

  const handleFileSelect = async (sourceType: TmallSourceType, file: File | null) => {
    setPageMessage(null);
    if (!file) {
      updateSlot(sourceType, emptySlot());
      return;
    }

    markSelectionChanged();
    const extensionError = validateExtension(sourceType, file);
    updateSlot(sourceType, {
      ...emptySlot(),
      fileName: file.name,
      fileSize: file.size,
      status: "checking",
    });

    if (extensionError) {
      updateSlot(sourceType, {
        ...emptySlot(),
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        error: extensionError,
      });
      return;
    }

    try {
      const table = await parseTmallTableFile(file);
      const baseSlot = {
        ...emptySlot(),
        fileName: file.name,
        fileSize: file.size,
        detectedSourceType: table.detectedSourceType,
        encoding: table.encoding,
        headerRowNumber: table.headerRowNumber,
        rowCount: table.rows.length,
        missingRequiredFields: table.missingRequiredFields,
      };

      if (table.detectedSourceType === "unknown") {
        updateSlot(sourceType, {
          ...baseSlot,
          status: "error",
          error: `该文件未识别为“${TMALL_SOURCE_LABELS[sourceType]}”，请检查表头或重新导出。`,
        });
        return;
      }

      if (table.detectedSourceType !== sourceType) {
        updateSlot(sourceType, {
          ...baseSlot,
          status: "error",
          error: `该文件实际识别为“${detectedSourceLabel(table.detectedSourceType)}”，与当前“${TMALL_SOURCE_LABELS[sourceType]}”位置不一致，请重新选择。`,
        });
        return;
      }

      if (table.missingRequiredFields.length > 0) {
        updateSlot(sourceType, {
          ...baseSlot,
          status: "error",
          error: `缺少必需字段：${table.missingRequiredFields.join("、")}。`,
        });
        return;
      }

      const warnings = [
        table.rows.length === 0 ? "识别到表头，但没有可分析的数据行。" : null,
        table.summaryRowCount > 0 ? `检测到 ${table.summaryRowCount} 行合计/汇总行。` : null,
      ].filter((warning): warning is string => !!warning);

      updateSlot(sourceType, {
        ...baseSlot,
        file,
        status: warnings.length > 0 ? "warning" : "success",
        warnings,
      });
    } catch (error) {
      updateSlot(sourceType, {
        ...emptySlot(),
        fileName: file.name,
        fileSize: file.size,
        status: "error",
        error: error instanceof Error ? error.message : "文件识别失败，请检查导出格式。",
      });
    }
  };

  const handleAnalyze = async () => {
    setPageMessage(null);

    if (blockedReason || isAnalyzing) {
      setPageMessage({
        type: "error",
        text: blockedReason ?? "当前正在分析，请稍候。",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const analysis: TmallFourSourceAnalysisResult = await runTmallFourSourceAnalysis({
        businessProductFile: validSlot(slots.business_product) ? slots.business_product.file : null,
        adProductFile: validSlot(slots.ad_product) ? slots.ad_product.file : null,
        adPlanFile: validSlot(slots.ad_plan) ? slots.ad_plan.file : null,
        afterSalesFile: validSlot(slots.after_sales) ? slots.after_sales.file : null,
      });

      saveTmallAnalysisResult(analysis);
      setCurrentResult(analysis);
      setSelectionDirty(false);
      setPageMessage({
        type: "success",
        text: "四源分析完成，安全聚合结果已保存到当前浏览器。",
      });
    } catch (error) {
      setPageMessage({
        type: "error",
        text: error instanceof Error ? error.message : "分析失败，请检查文件格式和数据内容。",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearSelection = () => {
    markSelectionChanged();
    setSlots(createEmptySlots());
    setPageMessage(null);
  };

  const handleRemoveSource = (sourceType: TmallSourceType) => {
    markSelectionChanged();
    updateSlot(sourceType, emptySlot());
  };

  const handleClearStoredResult = () => {
    const confirmed = window.confirm("确认清除当前浏览器保存的天猫四源聚合结果吗？");
    if (!confirmed) return;

    clearTmallAnalysisResult();
    setCurrentResult(null);
    setSelectionDirty(false);
    setPageMessage({
      type: "success",
      text: "本地保存结果已清除。",
    });
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫四源数据上传"
        title="天猫数据上传"
        description="上传生意参谋商品报表、商品推广报表、计划推广报表和售后报表，系统会在浏览器本地完成识别、聚合和质量检查。"
      />

      <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-blue-800">
        <p className="font-semibold text-blue-900">安全边界</p>
        <ul className="mt-2 grid gap-2 md:grid-cols-3">
          <li>文件不上传服务器，只在当前浏览器中解析。</li>
          <li>售后个人、交易、配送和沟通类敏感明细不会长期保存在浏览器中。</li>
          <li>当前版本仅进行本地数据分析，不调用外部 AI 服务。</li>
        </ul>
      </section>

      <UploadDataQualityCenter center={uploadDataQualityCenter} />

      <section className="grid gap-5 lg:grid-cols-2">
        {TMALL_SOURCE_TYPES.map((sourceType) => (
          <TmallSourceUploadCard
            key={sourceType}
            sourceType={sourceType}
            slot={slots[sourceType]}
            onFileSelect={(nextSourceType, file) => void handleFileSelect(nextSourceType, file)}
            onRemove={handleRemoveSource}
          />
        ))}
      </section>

      <TmallUploadActions
        validFileCount={validFileCount}
        blockedReason={blockedReason}
        isAnalyzing={isAnalyzing}
        hasResult={!!result}
        isHistoryResult={resultOrigin === "stored"}
        onAnalyze={() => void handleAnalyze()}
        onClearSelection={handleClearSelection}
        onClearStoredResult={handleClearStoredResult}
      />

      {pageMessage ? (
        <div
          className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
            pageMessage.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {pageMessage.type === "success" ? (
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <p>{pageMessage.text}</p>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-6">
          {selectionDirty && storedResult ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800">
              当前文件选择已经变化，下方仍展示上次保存的分析结果。点击“开始四源分析”后才会更新。
            </div>
          ) : null}

          <div
            className={`rounded-2xl border px-5 py-4 ${
              resultOrigin === "current"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-sm font-semibold text-emerald-900">
              {resultOrigin === "stored" ? "已恢复上次安全聚合结果" : "本次四源分析完成"}
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-700">
              分析时间：{formatDateTime(result.analysisTimestamp)}。刷新页面后只恢复聚合结果，不恢复文件对象。
            </p>
          </div>

          <TmallSourceHealthGrid result={result} />
          <TmallDateAlignment result={result} />
          <TmallJoinQualityPanel joinQuality={result.joinQuality} />
          <TmallReconciliationCard reconciliation={result.reconciliation} />
          <TmallDataQualityList warnings={result.dataQualityWarnings} />
        </div>
      ) : storedAnalysisState.status === "corrupted" ? (
        <TmallCorruptedResultState />
      ) : (
        <section className="panel p-8 text-center">
          <p className="text-sm font-semibold text-slate-900">暂无分析结果</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            请选择至少一个天猫报表来源，识别成功后点击“开始四源分析”。
          </p>
        </section>
      )}
    </div>
  );
}
