import type { ProductMetricFormat } from "@/lib/tmall/view-models/product-board";

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

export const formatHours = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(1)} 小时`;

export const formatMetricValue = (value: number | null, format: ProductMetricFormat): string => {
  if (format === "currency") return formatMoney(value);
  if (format === "integer") return formatInteger(value);
  if (format === "rate") return formatPercent(value);
  return formatRoi(value);
};
