import type { TmallStoreTrendSectionViewModel } from "@/lib/tmall/view-models/store-trend-section";
import { formatTrendDateRange } from "./trend-format";

interface TrendSummaryProps {
  section: TmallStoreTrendSectionViewModel;
}

const formatPointCount = (value: number): string => `${value} 个日期点`;

export function TrendSummary({ section }: TrendSummaryProps) {
  const businessSinglePoint = section.readiness.singlePointSources.includes("business_product");
  const planTrendReady = section.readiness.adPlanPointCount >= 2;

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm leading-6 text-blue-800">{section.summaryText}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {section.coverageItems.map((item) => (
          <div key={item.key} className="rounded-xl bg-white/75 px-3 py-3 ring-1 ring-blue-100">
            <p className="text-xs font-medium text-blue-700">{item.label}</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{formatPointCount(item.pointCount)}</p>
            <p className="mt-1 text-xs text-slate-500">{formatTrendDateRange(item.dateRange)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs leading-5 text-blue-700 sm:flex-row sm:flex-wrap">
        {businessSinglePoint ? <span>经营数据只有 1 个日期点，只展示当日值。</span> : null}
        {planTrendReady ? <span>计划推广报表有多日数据，可查看推广趋势。</span> : null}
      </div>
    </div>
  );
}
