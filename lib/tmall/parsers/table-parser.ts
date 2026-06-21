import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { TmallDetectedSourceType } from "../../../types/tmall";
import { detectTmallSource } from "../source-detection";
import { normalizeHeader, normalizeText, type RawRecord } from "../normalizers";

interface HeaderEntry {
  name: string;
  columnIndex: number;
}

export interface TmallParsedTable {
  headers: string[];
  rows: RawRecord[];
  encoding: string | null;
  sheetNames: string[];
  headerRowNumber: number | null;
  summaryRowCount: number;
  detectedSourceType: TmallDetectedSourceType;
  missingRequiredFields: string[];
}

const HEADER_KEYWORDS = [
  "商品",
  "访客",
  "金额",
  "买家",
  "计划",
  "主体",
  "退款",
  "订单",
  "日期",
  "时间",
  "展现",
  "点击",
  "转化",
];

const isEmptyRow = (row: unknown[]): boolean => !row.some((cell) => normalizeText(cell) !== "");

const scoreHeaderRow = (row: unknown[]): number => {
  const cells = row.map(normalizeHeader).filter(Boolean);
  if (cells.length < 2) return 0;

  const keywordHits = cells.filter((cell) =>
    HEADER_KEYWORDS.some((keyword) => cell.includes(keyword)),
  ).length;

  return cells.length * 2 + new Set(cells).size + keywordHits * 8;
};

const findHeaderRowIndex = (rows: unknown[][]): number => {
  const limit = Math.min(rows.length, 30);
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < limit; index += 1) {
    const score = scoreHeaderRow(rows[index] ?? []);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  if (bestIndex >= 0) return bestIndex;
  return rows.findIndex((row) => Array.isArray(row) && !isEmptyRow(row));
};

const buildHeaderEntries = (headerRow: unknown[]): HeaderEntry[] => {
  const nameCounts = new Map<string, number>();

  return headerRow.flatMap((value, columnIndex) => {
    const baseName = normalizeHeader(value);
    if (!baseName) return [];

    const nextCount = (nameCounts.get(baseName) ?? 0) + 1;
    nameCounts.set(baseName, nextCount);

    return [
      {
        name: nextCount === 1 ? baseName : `${baseName}__${nextCount}`,
        columnIndex,
      },
    ];
  });
};

const rowsToTable = (
  rows: unknown[][],
  encoding: string | null,
  sheetNames: string[],
): TmallParsedTable => {
  if (rows.length === 0) {
    return {
      headers: [],
      rows: [],
      encoding,
      sheetNames,
      headerRowNumber: null,
      summaryRowCount: 0,
      detectedSourceType: "unknown",
      missingRequiredFields: [],
    };
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  const headerEntries = buildHeaderEntries(rows[headerRowIndex] ?? []);
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((row) => Array.isArray(row) && !isEmptyRow(row));

  const parsedRows = dataRows.map((row) =>
    headerEntries.reduce<RawRecord>((record, header) => {
      record[header.name] = row[header.columnIndex] ?? "";
      return record;
    }, {}),
  );

  const summaryRowCount = dataRows.filter((row) =>
    row.some((cell) => /合计|总计|汇总/.test(normalizeText(cell))),
  ).length;
  const headers = headerEntries.map((entry) => entry.name);
  const detected = detectTmallSource(headers);

  return {
    headers,
    rows: parsedRows,
    encoding,
    sheetNames,
    headerRowNumber: headerRowIndex >= 0 ? headerRowIndex + 1 : null,
    summaryRowCount,
    detectedSourceType: detected.sourceType,
    missingRequiredFields: detected.missingRequiredFields,
  };
};

const countReplacementCharacters = (text: string): number => text.match(/\uFFFD/g)?.length ?? 0;

const decodeCandidate = (buffer: ArrayBuffer, encoding: string): string | null => {
  try {
    return new TextDecoder(encoding, { fatal: encoding === "utf-8" }).decode(buffer);
  } catch {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      return null;
    }
  }
};

const parseCsvRows = (text: string): unknown[][] => {
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: false,
  }) as { data?: unknown[] };

  return (result.data ?? []).filter(Array.isArray);
};

const parseCsv = (buffer: ArrayBuffer): TmallParsedTable => {
  const candidates = ["utf-8", "gb18030", "gbk"];
  const scored = candidates.flatMap((encoding) => {
    const text = decodeCandidate(buffer, encoding);
    if (!text) return [];

    const rows = parseCsvRows(text);
    const table = rowsToTable(rows, encoding, []);
    const sourceScore = table.detectedSourceType === "unknown" ? 0 : 100;
    const replacementPenalty = countReplacementCharacters(text) * 20;
    const headerScore = table.headers.length;

    return [
      {
        table,
        score: sourceScore + headerScore - replacementPenalty,
      },
    ];
  });

  scored.sort((first, second) => second.score - first.score);
  return scored[0]?.table ?? rowsToTable([], "utf-8", []);
};

const parseExcel = (buffer: ArrayBuffer): TmallParsedTable => {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return rowsToTable([], null, []);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: true,
    defval: "",
    raw: false,
  });

  return rowsToTable(rows, null, workbook.SheetNames);
};

export const parseTmallTableFile = async (file: File): Promise<TmallParsedTable> => {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") return parseCsv(buffer);
  return parseExcel(buffer);
};
