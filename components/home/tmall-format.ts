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
