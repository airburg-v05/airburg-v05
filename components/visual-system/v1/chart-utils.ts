import type { ChartPoint, ChartSeries } from "@/lib/bi/bi.types";

export const BI_CHART_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f59e0b", "#0891b2", "#475569", "#be185d"];

const DAY_MS = 24 * 60 * 60 * 1000;

const dateToUtcTime = (date: string | null | undefined): number | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return time;
};

export const dateAxisFromTimeRange = (startDate: string | null | undefined, endDate: string | null | undefined): string[] => {
  const start = dateToUtcTime(startDate);
  const end = dateToUtcTime(endDate);
  if (start === null || end === null || start > end) return [];
  const dayCount = Math.round((end - start) / DAY_MS) + 1;
  if (dayCount <= 0 || dayCount > 370) return [];
  return Array.from({ length: dayCount }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
};

export const dateAxisWithTimeRangeFallback = (
  dates: string[],
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  fallbackDate?: string | null,
): string[] => {
  if (dates.length > 0) return dates;
  const rangeAxis = dateAxisFromTimeRange(startDate, endDate);
  if (rangeAxis.length > 0) return rangeAxis;
  return fallbackDate ? [fallbackDate] : [];
};

export const finiteChartValue = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const finiteChartValues = (lines: ChartSeries[]): number[] =>
  lines.flatMap((line) => line.points.flatMap((point) => {
    const value = finiteChartValue(point.value);
    return value === null ? [] : [value];
  }));

export const chartMaxValue = (lines: ChartSeries[]): number => {
  const values = finiteChartValues(lines);
  if (values.length === 0) return 1;
  const max = Math.max(...values);
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
};

export const formatAxisValue = (value: number): string => {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(value % 100000000 === 0 ? 0 : 1)}亿`;
  if (abs >= 10000) return `${(value / 10000).toFixed(value % 10000 === 0 ? 0 : 1)}万`;
  if (abs >= 1000) return `${Math.round(value).toLocaleString("zh-CN")}`;
  if (abs >= 10) return `${Number(value.toFixed(1))}`;
  return `${Number(value.toFixed(2))}`;
};

export const compactDateLabel = (date: string): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(5);
  return date || "--";
};

export const pointHasValue = (point: ChartPoint): boolean => finiteChartValue(point.value) !== null;
