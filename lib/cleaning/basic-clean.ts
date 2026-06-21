import type { ParsedDataResult } from "@/lib/data-source/parse-and-map";
import type { RawDataRow } from "@/lib/parsers/shared";
import type {
  FieldMappingResult,
  FieldQualityStatus,
  FieldQualitySummary,
  StandardMetricField,
} from "@/types/metrics";

export interface CleanedDataResult {
  headers: string[];
  rows: RawDataRow[];
  mapping: FieldMappingResult;
  fieldStatus: Record<StandardMetricField, FieldQualityStatus>;
  fieldQuality: Record<StandardMetricField, FieldQualitySummary>;
  removedSummaryRows: number;
}

const isEmptyValue = (value: unknown): boolean =>
  value === null || value === undefined || `${value}`.trim() === "";

const normalizeNumberText = (value: unknown): string =>
  `${value}`.replace(/,/g, "").replace(/\s+/g, "");

const amountFields = new Set<StandardMetricField>([
  "sales_amount",
  "refund_amount",
  "avg_order_value",
  "ad_spend",
  "ad_sales_amount",
  "direct_sales_amount",
  "indirect_sales_amount",
]);

const numericFields = new Set<StandardMetricField>([
  "visitors",
  "paid_buyers",
  "favorites",
  "cart_additions",
  "ad_clicks",
]);

const textFields = new Set<StandardMetricField>([
  "platform",
  "date",
  "product_id",
  "product_name",
]);

const percentageFields = new Set<StandardMetricField>(["conversion_rate"]);

const cleanNumber = (raw: unknown): number | null => {
  if (isEmptyValue(raw)) return null;
  const text = normalizeNumberText(raw);
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

const cleanAmount = (raw: unknown): number | null => {
  if (isEmptyValue(raw)) return null;
  const text = `${raw}`
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/[¥￥元]/g, "");
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const cleanPercentage = (raw: unknown): number | null => {
  if (isEmptyValue(raw)) return null;

  const text = `${raw}`.replace(/\s+/g, "");
  const hasPercentSign = text.includes("%");
  const value = Number(text.replace(/%/g, ""));
  if (!Number.isFinite(value)) return null;

  const normalized = hasPercentSign || value > 1 ? value / 100 : value;
  return normalized >= 0 ? normalized : null;
};

const cleanFieldValue = (field: StandardMetricField, raw: unknown): string | number | null => {
  if (isEmptyValue(raw)) return null;
  if (percentageFields.has(field)) return cleanPercentage(raw);
  if (amountFields.has(field)) return cleanAmount(raw);
  if (numericFields.has(field)) return cleanNumber(raw);
  if (textFields.has(field)) return `${raw}`.trim();
  return null;
};

const summaryLabels = /^(合计|总计|汇总|全部|全店合计|总览)$/i;

const removeSummaryRows = (
  rows: RawDataRow[],
  mapping: FieldMappingResult,
): { rows: RawDataRow[]; removedCount: number } => {
  const productNameField = mapping.product_name.rawField;
  if (mapping.product_name.status !== "matched" || !productNameField) {
    return { rows, removedCount: 0 };
  }

  const hasNormalProductRow = rows.some((row) => {
    const value = `${row[productNameField] ?? ""}`.trim();
    return value !== "" && !summaryLabels.test(value);
  });

  if (!hasNormalProductRow) return { rows, removedCount: 0 };

  const filteredRows = rows.filter((row) => {
    const value = `${row[productNameField] ?? ""}`.trim();
    return !summaryLabels.test(value);
  });

  return { rows: filteredRows, removedCount: rows.length - filteredRows.length };
};

const createQualitySummary = (
  status: FieldQualityStatus,
  validCount: number,
  missingCount: number,
  invalidCount: number,
): FieldQualitySummary => ({ status, validCount, missingCount, invalidCount });

export const cleanBasicData = (data: ParsedDataResult): CleanedDataResult => {
  const summaryFiltered = removeSummaryRows(data.rows, data.mapping);
  const cleanedRows = summaryFiltered.rows.map((row) => ({ ...row }));
  const fieldQuality = {} as Record<StandardMetricField, FieldQualitySummary>;
  const fieldStatus = {} as Record<StandardMetricField, FieldQualityStatus>;

  (Object.entries(data.mapping) as Array<[
    StandardMetricField,
    FieldMappingResult[StandardMetricField],
  ]>).forEach(([field, match]) => {
    if (match.status !== "matched" || !match.rawField) {
      fieldStatus[field] = "missing";
      fieldQuality[field] = createQualitySummary("missing", 0, cleanedRows.length, 0);
      return;
    }

    let validCount = 0;
    let missingCount = 0;
    let invalidCount = 0;

    cleanedRows.forEach((row) => {
      const rawValue = row[match.rawField as string];

      if (isEmptyValue(rawValue)) {
        row[match.rawField as string] = null;
        missingCount += 1;
        return;
      }

      const cleanedValue = cleanFieldValue(field, rawValue);
      row[match.rawField as string] = cleanedValue;

      if (cleanedValue === null) {
        invalidCount += 1;
      } else {
        validCount += 1;
      }
    });

    let status: FieldQualityStatus;
    if (validCount === 0 && invalidCount > 0) {
      status = "invalid";
    } else if (validCount === 0) {
      status = "missing";
    } else if (invalidCount > 0 || missingCount > 0) {
      status = "partial";
    } else {
      status = "valid";
    }

    fieldStatus[field] = status;
    fieldQuality[field] = createQualitySummary(status, validCount, missingCount, invalidCount);
  });

  return {
    headers: data.headers,
    rows: cleanedRows,
    mapping: data.mapping,
    fieldStatus,
    fieldQuality,
    removedSummaryRows: summaryFiltered.removedCount,
  };
};
