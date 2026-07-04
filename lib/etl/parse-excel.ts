import * as XLSX from "xlsx";
import { formatDateObjectAsBusinessDate } from "./date";

export interface ParsedExcelSheet {
  sheetName: string;
  rows: Record<string, unknown>[];
}

const HEADER_HINTS = [
  "商品id",
  "宝贝id",
  "商品名称",
  "宝贝名称",
  "统计日期",
  "日期",
  "搜索词",
  "关键词",
  "访客数",
  "商品访客数",
  "支付买家数",
  "支付人数",
  "支付金额",
  "成交金额",
  "计划id",
  "主体id",
  "点击量",
  "花费",
  "投入产出比",
  "roi",
];

const normalizeCell = (value: unknown): unknown => {
  if (value instanceof Date) return formatDateObjectAsBusinessDate(value) ?? "";
  return value;
};

const compact = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\|（）()［\][\]【】]/g, "")
    .replace(/　/g, "");

const rowHeaderScore = (row: unknown[]): number => {
  const cells = row.map(compact).filter(Boolean);
  if (cells.length === 0) return 0;
  return cells.reduce((score, cell) => {
    const matched = HEADER_HINTS.some((hint) => {
      const normalizedHint = compact(hint);
      return cell === normalizedHint || cell.includes(normalizedHint) || normalizedHint.includes(cell);
    });
    return score + (matched ? 1 : 0);
  }, 0);
};

const chooseHeaderRowIndex = (rows: unknown[][]): number => {
  let bestIndex = 0;
  let bestScore = -1;

  rows.slice(0, 20).forEach((row, index) => {
    const score = rowHeaderScore(row);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestScore > 0 ? bestIndex : 0;
};

const normalizeHeader = (value: unknown, index: number, used: Set<string>): string => {
  const base = String(value ?? "").trim() || `__EMPTY_${index}`;
  let next = base;
  let suffix = 1;
  while (used.has(next)) {
    suffix += 1;
    next = `${base}_${suffix}`;
  }
  used.add(next);
  return next;
};

const rowsFromSheet = (sheet: XLSX.WorkSheet): Record<string, unknown>[] => {
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (rawRows.length === 0) return [];

  const headerIndex = chooseHeaderRowIndex(rawRows);
  const usedHeaders = new Set<string>();
  const headers = rawRows[headerIndex].map((value, index) => normalizeHeader(value, index, usedHeaders));

  return rawRows.slice(headerIndex + 1).map((row) =>
    Object.fromEntries(
      headers.map((header, index) => [header, normalizeCell(row[index])]),
    ),
  );
};

const readableScore = (text: string): number => {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const replacement = (text.match(/\uFFFD/g) ?? []).length;
  const mojibake = (text.match(/[ÈÕÆÚ³¡¾°Ãû×Ö¼Æ»®]/g) ?? []).length;
  return cjk * 2 - replacement * 10 - mojibake;
};

const readWorkbook = async (file: File): Promise<XLSX.WorkBook> => {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name)) {
    const utf8Text = new TextDecoder("utf-8").decode(buffer);
    const gbText = new TextDecoder("gb18030").decode(buffer);
    const text = readableScore(gbText) > readableScore(utf8Text) ? gbText : utf8Text;
    return XLSX.read(text, { type: "string", cellDates: true });
  }
  return XLSX.read(buffer, { type: "buffer", cellDates: true });
};

export const parseExcelWorkbook = async (file: File): Promise<ParsedExcelSheet[]> => {
  const workbook = await readWorkbook(file);

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    return {
      sheetName,
      rows: rowsFromSheet(sheet),
    };
  });
};
