import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { TMALL_SOURCE_LABELS } from "@/lib/tmall/source-types";
import type {
  TmallAnalysisDisplayResult,
  TmallDateRange,
  TmallSourceType,
} from "@/types/tmall";

interface TmallDateAlignmentProps {
  result: TmallAnalysisDisplayResult;
}

const sourceOrder: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const formatDateRange = (range: TmallDateRange): string => {
  if (!range.start) return "--";
  if (!range.end || range.end === range.start) return range.start;
  return `${range.start} 至 ${range.end}`;
};

const getRangeMode = (range: TmallDateRange): string => {
  if (!range.start) return "无日期";
  if (!range.end || range.start === range.end) return "单日";
  return "多日";
};

const getCommonRange = (ranges: TmallDateRange[]): TmallDateRange => {
  const validRanges = ranges.filter((range) => range.start && range.end) as Array<{
    start: string;
    end: string;
  }>;

  if (validRanges.length < 2) return { start: null, end: null };

  const start = validRanges.map((range) => range.start).sort().at(-1) ?? null;
  const end = validRanges.map((range) => range.end).sort()[0] ?? null;

  if (!start || !end || start > end) return { start: null, end: null };
  return { start, end };
};

export function TmallDateAlignment({ result }: TmallDateAlignmentProps) {
  const parsedRanges = sourceOrder
    .filter((sourceType) => result.sourceHealth[sourceType].status === "parsed")
    .map((sourceType) => result.dateRanges[sourceType]);
  const commonRange = getCommonRange(parsedRanges);
  const dateWarnings = result.dataQualityWarnings.filter((warning) =>
    warning.startsWith("date_alignment:"),
  );

  return (
    <SectionCard
      title="日期范围对齐"
      description="用于判断本次结果是单日分析、多日分析，还是多来源日期存在错位。"
      action={
        dateWarnings.length > 0 ? (
          <StatusPill tone="warning">{dateWarnings.length} 条日期提醒</StatusPill>
        ) : (
          <StatusPill tone="success">日期可用</StatusPill>
        )
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sourceOrder.map((sourceType) => {
          const range = result.dateRanges[sourceType];
          return (
            <div key={sourceType} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium text-slate-500">{TMALL_SOURCE_LABELS[sourceType]}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateRange(range)}</p>
              <p className="mt-1 text-xs text-slate-500">{getRangeMode(range)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        <p>
          日期交集：
          <span className="font-semibold text-slate-900">{formatDateRange(commonRange)}</span>
        </p>
        {dateWarnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            {dateWarnings.map((warning) => (
              <li key={warning}>{warningText(warning)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">当前来源日期没有发现明显错位。</p>
        )}
      </div>
    </SectionCard>
  );
}

function warningText(warning: string): string {
  if (warning === "date_alignment:business_product_ad_product_no_simple_overlap") {
    return "生意参谋商品报表与商品推广报表没有简单日期重叠，跨源对比需要谨慎。";
  }

  if (warning === "date_alignment:ad_product_ad_plan_range_different") {
    return "商品推广报表与计划推广报表日期范围不同，推广金额核对可能出现口径差异。";
  }

  return warning;
}
