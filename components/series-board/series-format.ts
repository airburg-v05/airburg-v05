import type { SeriesMetricFormat } from "@/lib/tmall/view-models/series-board";
import type { TmallDateRange } from "@/types/tmall";

export const formatMoney = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

export const formatInteger = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);

export const formatPercent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${(value * 100).toFixed(2)}%`;

export const formatRoi = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(2)} 倍`;

export const formatMetricValue = (value: number | null, format: SeriesMetricFormat): string => {
  if (format === "currency") return formatMoney(value);
  if (format === "integer") return formatInteger(value);
  if (format === "rate") return formatPercent(value);
  return formatRoi(value);
};

export const formatDateRange = (range: TmallDateRange): string => {
  if (!range.start) return "--";
  if (!range.end || range.end === range.start) return range.start;
  return `${range.start} 至 ${range.end}`;
};
