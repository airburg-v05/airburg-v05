"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DatabaseIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/utils/format";

interface TmallDataContextExtraItem {
  label: string;
  value: string | number | null | undefined;
}

interface TmallDataContextBarProps {
  analysisTimestamp: string;
  selectedDate: string | null;
  sourceCount: number;
  totalSourceCount?: number;
  dataQualityWarningCount: number;
  extraItems?: TmallDataContextExtraItem[];
  qualityLinkHref?: string;
  availableDates?: string[];
  onDateChange?: (date: string) => void;
}

const formatValue = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? "--" : String(value);

export function TmallDataContextBar({
  analysisTimestamp,
  selectedDate,
  sourceCount,
  totalSourceCount = 4,
  dataQualityWarningCount,
  extraItems = [],
  qualityLinkHref = "/upload",
  availableDates = [],
  onDateChange,
}: TmallDataContextBarProps) {
  const canSelectDate = !!onDateChange && availableDates.length > 1;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm shadow-slate-200/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <DatabaseIcon className="h-4 w-4" />
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs leading-5 text-slate-600">
            <ContextItem label="当前经营日期">
              {canSelectDate ? (
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  value={selectedDate ?? ""}
                  onChange={(event) => onDateChange?.(event.target.value)}
                >
                  {availableDates.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold text-slate-900">{selectedDate ?? "--"}</span>
              )}
            </ContextItem>
            <ContextItem label="分析时间">
              <span className="font-semibold text-slate-900">{formatDateTime(analysisTimestamp)}</span>
            </ContextItem>
            <ContextItem label="数据源">
              <span className="font-semibold text-slate-900">
                {sourceCount}/{totalSourceCount}
              </span>
            </ContextItem>
            <ContextItem label="质量提醒">
              <span className="font-semibold text-slate-900">{dataQualityWarningCount} 条</span>
            </ContextItem>
            {extraItems.map((item) => (
              <ContextItem key={item.label} label={item.label}>
                <span className="font-semibold text-slate-900">{formatValue(item.value)}</span>
              </ContextItem>
            ))}
          </div>
        </div>

        <Link href={qualityLinkHref} className="secondary-button justify-center px-3 py-2 text-xs">
          查看数据质量
        </Link>
      </div>
    </section>
  );
}

function ContextItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-slate-400">{label}：</span>
      {children}
    </span>
  );
}
