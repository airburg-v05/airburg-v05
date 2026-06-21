"use client";

import { type ChangeEvent } from "react";
import { AlertIcon, CheckIcon, CloseIcon, UploadIcon } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { TMALL_REQUIRED_HEADERS, TMALL_SOURCE_LABELS } from "@/lib/tmall/source-types";
import { formatFileSize } from "@/lib/utils/format";
import type { TmallDetectedSourceType, TmallSourceType } from "@/types/tmall";

export type TmallUploadSlotStatus =
  | "empty"
  | "checking"
  | "success"
  | "warning"
  | "error";

export interface TmallUploadSlotState {
  file: File | null;
  fileName: string | null;
  fileSize: number | null;
  status: TmallUploadSlotStatus;
  detectedSourceType: TmallDetectedSourceType | null;
  encoding: string | null;
  headerRowNumber: number | null;
  rowCount: number | null;
  missingRequiredFields: string[];
  warnings: string[];
  error: string | null;
}

interface TmallSourceUploadCardProps {
  sourceType: TmallSourceType;
  slot: TmallUploadSlotState;
  onFileSelect: (sourceType: TmallSourceType, file: File | null) => void;
  onRemove: (sourceType: TmallSourceType) => void;
}

const sourceDescriptions: Record<TmallSourceType, string> = {
  business_product: "经营侧商品表现，提供 GMV、GSV、访客、支付买家等基础经营指标。",
  ad_product: "商品推广粒度，提供主体 ID、花费、成交金额、点击和人群相关推广指标。",
  ad_plan: "计划推广粒度，提供计划 ID、计划名称、计划花费和计划成交金额。",
  after_sales: "售后聚合数据，只进入退款数量、退款金额、状态分布等安全汇总。",
};

const sourceAccepts: Record<TmallSourceType, string> = {
  business_product: ".xls,.xlsx",
  ad_product: ".csv",
  ad_plan: ".csv",
  after_sales: ".xls,.xlsx",
};

const requiredHeaderLabels = (sourceType: TmallSourceType): string[] =>
  sourceType === "after_sales"
    ? ["售后单据标识", "售后时间", "售后状态", "商品标识", "金额字段"]
    : TMALL_REQUIRED_HEADERS[sourceType];

const statusView: Record<
  TmallUploadSlotStatus,
  { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  empty: { label: "未选择", tone: "neutral" },
  checking: { label: "待识别", tone: "info" },
  success: { label: "识别成功", tone: "success" },
  warning: { label: "存在警告", tone: "warning" },
  error: { label: "识别失败", tone: "danger" },
};

const detectedLabel = (sourceType: TmallDetectedSourceType | null): string => {
  if (!sourceType) return "--";
  if (sourceType === "unknown") return "未知数据源";
  return TMALL_SOURCE_LABELS[sourceType];
};

export function TmallSourceUploadCard({
  sourceType,
  slot,
  onFileSelect,
  onRemove,
}: TmallSourceUploadCardProps) {
  const status = statusView[slot.status];
  const inputId = `tmall-${sourceType}-file`;
  const displayError =
    sourceType === "after_sales" && slot.error?.includes("缺少必需字段")
      ? "文件识别失败，请检查售后导出文件是否完整。"
      : slot.error;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFileSelect(sourceType, event.currentTarget.files?.[0] ?? null);
    event.currentTarget.value = "";
  };

  return (
    <article className="flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{TMALL_SOURCE_LABELS[sourceType]}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{sourceDescriptions[sourceType]}</p>
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {requiredHeaderLabels(sourceType).map((field) => (
          <span
            key={field}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
          >
            {field}
          </span>
        ))}
      </div>

      {sourceType === "after_sales" ? (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
          售后明细只做安全聚合，不展示、不保存个人、交易、配送或沟通类隐私字段。
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
        <input
          id={inputId}
          type="file"
          accept={sourceAccepts[sourceType]}
          className="sr-only"
          onChange={handleChange}
        />

        {slot.fileName ? (
          <div className="flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                slot.status === "error"
                  ? "bg-rose-100 text-rose-700"
                  : slot.status === "warning"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {slot.status === "error" ? (
                <AlertIcon className="h-5 w-5" />
              ) : (
                <CheckIcon className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-slate-900">{slot.fileName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {slot.fileSize === null ? "--" : formatFileSize(slot.fileSize)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label htmlFor={inputId} className="secondary-button min-h-9 cursor-pointer px-3 py-1.5 text-xs">
                  重新选择
                </label>
                <button
                  type="button"
                  className="secondary-button min-h-9 px-3 py-1.5 text-xs"
                  onClick={() => onRemove(sourceType)}
                >
                  <CloseIcon className="h-4 w-4" />
                  移除
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <UploadIcon className="mx-auto h-8 w-8 text-blue-600" />
            <p className="mt-3 text-sm font-semibold text-slate-900">选择对应报表文件</p>
            <p className="mt-1 text-xs text-slate-500">
              {sourceAccepts[sourceType].replaceAll(".", "").toUpperCase()}，系统会按内容识别来源
            </p>
            <label htmlFor={inputId} className="primary-button mt-4 cursor-pointer">
              选择文件
            </label>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <MetaItem label="实际识别" value={detectedLabel(slot.detectedSourceType)} />
        <MetaItem label="编码" value={slot.encoding ?? "--"} />
        <MetaItem label="表头行" value={slot.headerRowNumber === null ? "--" : `第 ${slot.headerRowNumber} 行`} />
        <MetaItem label="数据行" value={slot.rowCount === null ? "--" : `${slot.rowCount} 行`} />
      </div>

      {slot.missingRequiredFields.length > 0 ? (
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {sourceType === "after_sales"
            ? "缺少售后必需字段，请检查导出文件是否完整。"
            : `缺少必需字段：${slot.missingRequiredFields.join("、")}`}
        </div>
      ) : null}

      {displayError ? (
        <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {displayError}
        </div>
      ) : null}

      {slot.warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {slot.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-700">{value}</p>
    </div>
  );
}
