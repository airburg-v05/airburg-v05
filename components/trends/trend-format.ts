import type { TmallTrendUnit } from "@/lib/tmall/view-models/trends";

export const formatTrendValue = (value: number | null, unit: TmallTrendUnit): string => {
  if (value === null || !Number.isFinite(value)) return "--";

  if (unit === "currency") {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (unit === "integer") {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  }

  if (unit === "rate") {
    return `${(value * 100).toFixed(2)}%`;
  }

  return `${value.toFixed(2)} 倍`;
};

export const formatTrendChange = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
};

export const formatTrendDate = (value: string | null): string => value ?? "--";

export const formatTrendDateRange = (range: {
  start: string | null;
  end: string | null;
}): string => {
  if (!range.start) return "--";
  if (!range.end || range.start === range.end) return range.start;
  return `${range.start} 至 ${range.end}`;
};
