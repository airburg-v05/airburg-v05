export const formatNumber = (value: number, maximumFractionDigits = 2): string =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(value);

export const formatCurrency = (value: number): string => `¥${formatNumber(value)}`;

export const formatRate = (value: number | null): string =>
  value === null || Number.isNaN(value) ? "--" : `${(value * 100).toFixed(2)}%`;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDateTime = (isoText: string): string =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoText));
