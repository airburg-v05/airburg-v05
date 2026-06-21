"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StoreRecord } from "@/lib/v05/domain/models";
import {
  V05_IMPORT_PLATFORM_OPTIONS,
  V05_IMPORT_SOURCE_LABELS,
  V05_IMPORT_SOURCE_TYPES,
  detectV05TmallBatchFiles,
  loadV05ImportContext,
  runV05BrowserTmallBatchImport,
  validateV05NewStoreName,
  type V05BatchDetectedFile,
  type V05BatchDetectionResult,
  type V05BatchImportResult,
  type V05ImportPlatformOption,
  type V05ImportStoreInput,
} from "@/lib/v05/import";
import type { ReimportContext } from "@/lib/v05/data-quality";
import { saveTmallAnalysisResult } from "@/lib/storage/tmall-analysis-storage";
import type { TmallSourceType } from "@/types/tmall";

interface TmallBatchImportWorkbenchProps {
  idFactory?: () => string;
  reimportContext?: ReimportContext | null;
}

type MessageTone = "success" | "error" | "info";

const emptyDetection: V05BatchDetectionResult = {
  files: [],
  filesBySourceType: {},
  missingSourceTypes: V05_IMPORT_SOURCE_TYPES,
  duplicateSourceTypes: [],
  unknownFileCount: 0,
  errorFileCount: 0,
  canImport: false,
  blockingReasons: ["请选择四类天猫报表文件。"],
};

const toneClass: Record<MessageTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

const statusTone = (status: V05BatchDetectedFile["status"]): string => {
  if (status === "identified") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "duplicate") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-rose-50 text-rose-700 ring-rose-100";
};

const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const formatCount = (value: number | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("zh-CN") : "--";

const createBrowserStoreId = (): string => {
  if (globalThis.crypto?.randomUUID) return `tmall-store-${globalThis.crypto.randomUUID()}`;
  return `tmall-store-${Date.now().toString(36)}`;
};

const normalizeStoreInput = (store: StoreRecord): V05ImportStoreInput => ({
  platformCode: store.platformCode,
  storeId: store.storeId,
  storeName: store.storeName,
});

const sourceStatusLabel = (sourceType: TmallSourceType, detection: V05BatchDetectionResult): string => {
  const file = detection.files.find((item) => item.sourceType === sourceType);
  if (!file) return "待选择";
  if (file.status === "identified") return "已识别";
  if (file.status === "duplicate") return "重复";
  if (file.status === "unknown") return "未识别";
  return "读取失败";
};

export function TmallBatchImportWorkbench({
  idFactory = createBrowserStoreId,
  reimportContext = null,
}: TmallBatchImportWorkbenchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<V05ImportPlatformOption>(V05_IMPORT_PLATFORM_OPTIONS[0]!);
  const [selectedStoreId, setSelectedStoreId] = useState(reimportContext?.storeId ?? "tmall-default-store");
  const [pendingStore, setPendingStore] = useState<V05ImportStoreInput | null>(null);
  const [newStoreName, setNewStoreName] = useState("");
  const [detection, setDetection] = useState<V05BatchDetectionResult>(emptyDetection);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<V05BatchImportResult | null>(null);
  const [message, setMessage] = useState<{ tone: MessageTone; text: string } | null>(null);

  const refreshContext = async () => {
    setIsLoadingContext(true);
    try {
      const context = await loadV05ImportContext();
      setStores(context.stores);
      setActiveDatasetId(context.activeDatasetId);
      if (!context.stores.some((store) => store.storeId === selectedStoreId) && !pendingStore) {
        setSelectedStoreId(context.stores[0]?.storeId ?? "tmall-default-store");
      }
    } catch {
      setMessage({ tone: "error", text: "读取本地 V2 店铺状态失败，请刷新页面后重试。" });
    } finally {
      setIsLoadingContext(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadV05ImportContext()
      .then((context) => {
        if (cancelled) return;
        setStores(context.stores);
        setActiveDatasetId(context.activeDatasetId);
        if (reimportContext?.platformCode) {
          const nextPlatform = V05_IMPORT_PLATFORM_OPTIONS.find(
            (platform) => platform.platformCode === reimportContext.platformCode,
          );
          if (nextPlatform) setSelectedPlatform(nextPlatform);
        }
        setSelectedStoreId((currentStoreId) =>
          context.stores.some((store) => store.storeId === (reimportContext?.storeId ?? currentStoreId))
            ? reimportContext?.storeId ?? currentStoreId
            : context.stores[0]?.storeId ?? "tmall-default-store",
        );
      })
      .catch(() => {
        if (!cancelled) setMessage({ tone: "error", text: "读取本地 V2 店铺状态失败，请刷新页面后重试。" });
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reimportContext]);

  const availableStores = useMemo(() => {
    if (!pendingStore) return stores;
    const exists = stores.some(
      (store) => store.platformCode === pendingStore.platformCode && store.storeId === pendingStore.storeId,
    );
    return exists
      ? stores
      : [
        ...stores,
        {
          schemaVersion: "airburg_storage_v2" as const,
          platformCode: pendingStore.platformCode,
          storeId: pendingStore.storeId,
          storeName: pendingStore.storeName,
          status: "active" as const,
          createdAt: "",
          updatedAt: "",
        },
      ];
  }, [pendingStore, stores]);

  const selectedStore = useMemo(() => {
    if (pendingStore?.storeId === selectedStoreId) return pendingStore;
    const record = availableStores.find((store) => store.storeId === selectedStoreId);
    return record ? normalizeStoreInput(record) : null;
  }, [availableStores, pendingStore, selectedStoreId]);

  const storeValidation = useMemo(
    () => validateV05NewStoreName(newStoreName, stores),
    [newStoreName, stores],
  );

  const canImport =
    selectedPlatform.enabled &&
    selectedStore &&
    detection.canImport &&
    !isDetecting &&
    !isImporting;

  const handleSelectFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setMessage(null);
    setResult(null);
    if (fileArray.length === 0) {
      setDetection(emptyDetection);
      return;
    }
    setIsDetecting(true);
    try {
      const nextDetection = await detectV05TmallBatchFiles(fileArray);
      setDetection(nextDetection);
      setMessage({
        tone: nextDetection.canImport ? "success" : "error",
        text: nextDetection.canImport
          ? "四类报表已完整识别，可以点击导入。"
          : nextDetection.blockingReasons[0] ?? "文件识别未通过，请调整后重新选择。",
      });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddStore = () => {
    if (!storeValidation.valid) {
      setMessage({ tone: "error", text: storeValidation.error ?? "店铺名称不符合规则。" });
      return;
    }
    const store: V05ImportStoreInput = {
      platformCode: "tmall",
      storeId: idFactory(),
      storeName: storeValidation.value,
      isNew: true,
    };
    setPendingStore(store);
    setSelectedStoreId(store.storeId);
    setNewStoreName("");
    setMessage({ tone: "info", text: "新店铺已加入本次导入，导入成功后才会写入本地数据。" });
  };

  const handleImport = async () => {
    if (!canImport || !selectedStore) {
      setMessage({
        tone: "error",
        text: detection.blockingReasons[0] ?? "请先选择平台、店铺并完整识别四类报表。",
      });
      return;
    }

    setIsImporting(true);
    setMessage(null);
    try {
      const filesBySourceType = V05_IMPORT_SOURCE_TYPES.reduce((record, sourceType) => {
        record[sourceType] = detection.filesBySourceType[sourceType]!;
        return record;
      }, {} as Record<TmallSourceType, File>);
      const importResult = await runV05BrowserTmallBatchImport({
        store: selectedStore,
        filesBySourceType,
        compatibilityWriter: saveTmallAnalysisResult,
      });
      setResult(importResult);
      setMessage({
        tone: importResult.status === "success" || importResult.status === "already_imported" ? "success" : "error",
        text: importResult.message,
      });
      if (importResult.status === "success") {
        setPendingStore(null);
        await refreshContext();
        setSelectedStoreId(importResult.storeId);
      }
    } catch {
      setMessage({ tone: "error", text: "导入失败，请检查文件是否来自同一平台和店铺后重试。" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">平台和店铺</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              当前只开放天猫导入；每次导入必须绑定到一个明确店铺。
            </p>
          </div>
          <div className="text-xs text-slate-400">
            Active V2：{activeDatasetId ? "已存在" : "暂无"}
          </div>
        </div>

        {reimportContext ? (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            本次重新导入会创建新批次，不会修改原批次。
            <span className="ml-2 font-mono text-xs text-blue-700">
              {reimportContext.sourceBatchId}
            </span>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <div>
            <label className="text-xs font-semibold text-slate-500">选择平台</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-2">
              {V05_IMPORT_PLATFORM_OPTIONS.map((platform) => (
                <button
                  key={platform.platformCode}
                  type="button"
                  disabled={!platform.enabled || isImporting}
                  onClick={() => setSelectedPlatform(platform)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                    selectedPlatform.platformCode === platform.platformCode
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-600"
                  } ${!platform.enabled ? "cursor-not-allowed opacity-50" : "hover:border-blue-200"}`}
                >
                  <span className="block font-semibold">{platform.label}</span>
                  <span className="mt-1 block text-xs">{platform.statusLabel}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div>
              <label htmlFor="v05-store-select" className="text-xs font-semibold text-slate-500">
                选择店铺
              </label>
              <select
                id="v05-store-select"
                value={selectedStoreId}
                disabled={isLoadingContext || isImporting}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                {availableStores.map((store) => (
                  <option key={`${store.platformCode}:${store.storeId}`} value={store.storeId}>
                    {store.storeName}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                新店铺会在导入成功后进入 V2，本地旧天猫数据不会被清空。
              </p>
            </div>

            <div>
              <label htmlFor="v05-new-store-name" className="text-xs font-semibold text-slate-500">
                添加天猫店铺
              </label>
              <div className="mt-2 flex min-w-0 gap-2">
                <input
                  id="v05-new-store-name"
                  type="text"
                  value={newStoreName}
                  disabled={isImporting}
                  onChange={(event) => setNewStoreName(event.target.value)}
                  placeholder="输入店铺名称"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  disabled={isImporting || !newStoreName.trim()}
                  onClick={handleAddStore}
                  className="shrink-0 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  添加
                </button>
              </div>
              {newStoreName.trim() && !storeValidation.valid ? (
                <p className="mt-2 text-xs text-rose-600">{storeValidation.error}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">批量选择文件</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              一次选择四类天猫报表，系统会自动识别来源。每类来源本次只允许一个文件。
            </p>
          </div>
          <button
            type="button"
            disabled={isImporting}
            onClick={() => {
              setDetection(emptyDetection);
              setResult(null);
              setMessage(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            清空选择
          </button>
        </div>

        <input
          ref={inputRef}
          id="v05-batch-file-input"
          type="file"
          multiple
          accept=".csv,.xls,.xlsx"
          disabled={isImporting}
          onChange={(event) => {
            if (event.target.files) void handleSelectFiles(event.target.files);
          }}
          className="sr-only"
        />
        <label
          htmlFor="v05-batch-file-input"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (isImporting) return;
            void handleSelectFiles(event.dataTransfer.files);
          }}
          className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50"
        >
          <span className="text-sm font-semibold text-blue-800">
            点击选择多个文件，或拖拽到这里
          </span>
          <span className="mt-2 text-xs leading-5 text-slate-500">
            支持 CSV / XLS / XLSX；文件只在当前浏览器内解析。
          </span>
        </label>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {V05_IMPORT_SOURCE_TYPES.map((sourceType) => (
            <div key={sourceType} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-800">{V05_IMPORT_SOURCE_LABELS[sourceType]}</p>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                  {sourceStatusLabel(sourceType, detection)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {detection.files.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_auto] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              <span>文件</span>
              <span>识别来源</span>
              <span>状态</span>
            </div>
            <div className="divide-y divide-slate-100">
              {detection.files.map((file) => (
                <div
                  key={file.temporaryId}
                  className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_auto] gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatFileSize(file.fileSize)} · {file.rowCount === null ? "--" : `${file.rowCount} 行`}
                    </p>
                  </div>
                  <div className="min-w-0 text-slate-600">
                    <p className="truncate">{file.sourceLabel}</p>
                    {file.headerRowNumber ? (
                      <p className="mt-1 text-xs text-slate-400">表头第 {file.headerRowNumber} 行</p>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-col items-end">
                    <span className={`rounded-full px-2 py-1 text-xs ring-1 ${statusTone(file.status)}`}>
                      {file.status === "identified"
                        ? "可导入"
                        : file.status === "duplicate"
                          ? "重复"
                          : file.status === "unknown"
                            ? "未识别"
                            : "失败"}
                    </span>
                    {file.error ? (
                      <p className="mt-2 max-w-[12rem] break-words text-right text-xs leading-5 text-rose-600">
                        {file.error}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">导入操作与结果</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              点击一次导入后，将自动完成解析、聚合、V2 staging、readback 和激活。
            </p>
          </div>
          <button
            type="button"
            disabled={!canImport}
            onClick={() => void handleImport()}
            className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
          >
            {isImporting ? "导入中..." : isDetecting ? "识别中..." : "导入"}
          </button>
        </div>

        {detection.blockingReasons.length > 0 && !detection.canImport ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {detection.blockingReasons[0]}
          </div>
        ) : null}

        {message ? (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${toneClass[message.tone]}`}>
            {message.text}
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">导入状态</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{result.status}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">店铺</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={result.storeName}>
                {result.storeName}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">事实记录</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatCount(
                  result.recordCounts.businessProductFacts +
                    result.recordCounts.adProductFacts +
                    result.recordCounts.adPlanFacts,
                )}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-400">Legacy 兼容</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {result.legacyCompatibilitySaved ? "已同步默认店铺" : "未写入旧 key"}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
