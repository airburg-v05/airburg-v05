import { matchField } from "@/lib/metrics/field-map";
import { parseCSV } from "@/lib/parsers/csv";
import { parseExcel } from "@/lib/parsers/excel";
import type { RawDataRow } from "@/lib/parsers/shared";
import type { FieldMappingResult } from "@/types/metrics";

export interface ParsedDataResult {
  headers: string[];
  rows: RawDataRow[];
  mapping: FieldMappingResult;
  unmappedFields: string[];
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_ROW_COUNT = 100_000;

const getFileExtension = (filename: string): string => {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : "";
};

const buildUnmappedFields = (headers: string[], mapping: FieldMappingResult): string[] => {
  const mappedSet = new Set(
    Object.values(mapping)
      .map((item) => item.rawField)
      .filter((name): name is string => Boolean(name)),
  );

  return headers.filter((header) => !mappedSet.has(header));
};

export const parseAndMap = async (file: File): Promise<ParsedDataResult> => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("文件超过 25MB。请先拆分文件后再上传，避免浏览器卡死。");
  }

  const extension = getFileExtension(file.name);
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    throw new Error("暂时只支持 .csv、.xls 和 .xlsx 文件。");
  }

  const parseResult =
    extension === "xlsx" || extension === "xls"
      ? await parseExcel(file)
      : await parseCSV(file);

  if (parseResult.headers.length === 0) {
    throw new Error("没有识别到有效表头，请检查文件内容和导出格式。");
  }

  if (parseResult.rows.length === 0) {
    throw new Error("文件中没有识别到有效数据行。");
  }

  if (parseResult.rows.length > MAX_ROW_COUNT) {
    throw new Error("文件数据超过 10 万行。请按月份或日期拆分后再分析。");
  }

  const mapping = matchField(parseResult.headers);

  return {
    headers: parseResult.headers,
    rows: parseResult.rows,
    mapping,
    unmappedFields: buildUnmappedFields(parseResult.headers, mapping),
  };
};
