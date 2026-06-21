export type RawDataRow = Record<string, unknown>;

export interface ParseResult {
  headers: string[];
  rows: RawDataRow[];
}

const HEADER_KEYWORDS = [
  "商品",
  "宝贝",
  "访客",
  "金额",
  "买家",
  "订单",
  "支付",
  "转化",
  "加购",
  "收藏",
  "销售",
  "退款",
  "花费",
  "点击",
  "GMV",
];

export const normalizeText = (value: unknown): string => `${value ?? ""}`.trim();

const isRowEmpty = (row: unknown[]): boolean =>
  !row.some((cell) => normalizeText(cell) !== "");

const scoreHeaderCandidate = (row: unknown[]): number => {
  const values = row.map(normalizeText).filter(Boolean);
  if (values.length < 3) return 0;

  const keywordHits = values.filter((value) =>
    HEADER_KEYWORDS.some((keyword) => value.toUpperCase().includes(keyword.toUpperCase())),
  ).length;

  if (keywordHits === 0) return 0;
  return values.length * 2 + keywordHits * 5;
};

const findHeaderRowIndex = (rows: unknown[][]): number => {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 20).forEach((row, index) => {
    const score = scoreHeaderCandidate(row);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  if (bestIndex >= 0) return bestIndex;
  return rows.findIndex((row) => Array.isArray(row) && !isRowEmpty(row));
};

interface HeaderEntry {
  name: string;
  columnIndex: number;
}

const buildHeaderEntries = (headerRow: unknown[]): HeaderEntry[] => {
  const nameCounts = new Map<string, number>();

  return headerRow.flatMap((value, columnIndex) => {
    const baseName = normalizeText(value);
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

export const buildParseResult = (rows: unknown[][]): ParseResult => {
  if (rows.length === 0) return { headers: [], rows: [] };

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) return { headers: [], rows: [] };

  const headerEntries = buildHeaderEntries(rows[headerRowIndex] ?? []);
  if (headerEntries.length === 0) return { headers: [], rows: [] };

  const parsedRows = rows
    .slice(headerRowIndex + 1)
    .map((row) => {
      if (!Array.isArray(row)) return {};

      return headerEntries.reduce<RawDataRow>((record, header) => {
        record[header.name] = row[header.columnIndex] ?? "";
        return record;
      }, {});
    })
    .filter((row) => Object.values(row).some((value) => normalizeText(value) !== ""));

  return {
    headers: headerEntries.map((entry) => entry.name),
    rows: parsedRows,
  };
};
