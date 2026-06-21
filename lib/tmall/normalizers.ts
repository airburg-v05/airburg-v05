export type RawRecord = Record<string, unknown>;

export const normalizeHeader = (value: unknown): string =>
  `${value ?? ""}`
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, "")
    .trim();

export const normalizeText = (value: unknown): string => `${value ?? ""}`.trim();

export const isEmptyValue = (value: unknown): boolean => normalizeText(value) === "";

export const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  let text = `${value}`.trim();
  if (!text) return null;
  if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, "");
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(text)) return null;
  return text;
};

export const parseNumber = (value: unknown): number => {
  if (isEmptyValue(value)) return 0;
  const text = normalizeText(value)
    .replace(/[,%￥¥]/g, "")
    .replace(/\s+/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseRatio = (value: unknown): number | null => {
  if (isEmptyValue(value)) return null;
  const text = normalizeText(value).replace(/\s+/g, "");
  const hasPercent = text.includes("%");
  const parsed = Number(text.replace("%", ""));
  if (!Number.isFinite(parsed)) return null;
  return hasPercent ? parsed / 100 : parsed;
};

export const safeDivide = (numerator: number, denominator: number): number | null => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
};

export const parseDateTime = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text
    .replace(/\//g, "-")
    .replace("年", "-")
    .replace("月", "-")
    .replace("日", "")
    .trim();

  const date = new Date(normalized.length === 10 ? `${normalized}T00:00:00` : normalized.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const toDateKey = (value: unknown): string | null => {
  const date = parseDateTime(value);
  if (!date) return null;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const hoursBetween = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / 36e5;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
};

export const getField = (row: RawRecord, header: string): unknown => row[header];

export const countBy = <T>(items: T[], getKey: (item: T) => string | null): Map<string, number> => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

export const mapToDistribution = (counts: Map<string, number>) =>
  [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, "zh-CN"));

