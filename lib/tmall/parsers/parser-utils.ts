import type { TmallSourceHealth, TmallSourceType } from "../../../types/tmall";
import { detectExpectedTmallSource } from "../source-detection";
import { normalizeId, toDateKey } from "../normalizers";
import type { TmallParsedTable } from "./table-parser";

export interface ParserResult<TRecord> {
  health: TmallSourceHealth;
  records: TRecord[];
}

export const createMissingSourceHealth = (
  expectedSourceType: TmallSourceType,
): TmallSourceHealth => ({
  sourceType: expectedSourceType,
  expectedSourceType,
  status: "missing",
  fileName: null,
  encoding: null,
  sheetNames: [],
  headerRowNumber: null,
  headers: [],
  rowCount: 0,
  missingRequiredFields: [],
  invalidDateCount: 0,
  invalidIdCount: 0,
  summaryRowCount: 0,
  unknownStatuses: [],
  warningTypes: ["source_missing"],
});

export const buildSourceHealth = <TRecord>(
  expectedSourceType: TmallSourceType,
  file: File,
  table: TmallParsedTable,
  records: TRecord[],
  getDate: (record: TRecord) => string | null,
  getId: (record: TRecord) => string | null,
  extra?: {
    unknownStatuses?: string[];
    warningTypes?: string[];
  },
): TmallSourceHealth => {
  const detection = detectExpectedTmallSource(table.headers, expectedSourceType);
  const status =
    detection.sourceType === expectedSourceType && detection.missingRequiredFields.length === 0
      ? "parsed"
      : "unknown";
  const invalidDateCount = records.filter((record) => !getDate(record)).length;
  const invalidIdCount = records.filter((record) => !getId(record)).length;

  return {
    sourceType: detection.sourceType,
    expectedSourceType,
    status,
    fileName: file.name,
    encoding: table.encoding,
    sheetNames: table.sheetNames,
    headerRowNumber: table.headerRowNumber,
    headers: table.headers,
    rowCount: table.rows.length,
    missingRequiredFields: detection.missingRequiredFields,
    invalidDateCount,
    invalidIdCount,
    summaryRowCount: table.summaryRowCount,
    unknownStatuses: extra?.unknownStatuses ?? [],
    warningTypes: [
      ...(status === "unknown" ? ["source_unrecognized"] : []),
      ...(invalidDateCount > 0 ? ["invalid_date"] : []),
      ...(invalidIdCount > 0 ? ["invalid_id"] : []),
      ...(table.summaryRowCount > 0 ? ["summary_rows_detected"] : []),
      ...(extra?.warningTypes ?? []),
    ],
  };
};

export const readDate = (value: unknown): string | null => toDateKey(value);

export const readId = (value: unknown): string | null => normalizeId(value);

