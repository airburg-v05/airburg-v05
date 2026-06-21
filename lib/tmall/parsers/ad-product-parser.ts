import { parseNumber, type RawRecord } from "../normalizers";
import { parseTmallTableFile } from "./table-parser";
import { buildSourceHealth, readDate, readId, type ParserResult } from "./parser-utils";

export interface AdProductRecord {
  date: string | null;
  planId: string | null;
  productId: string | null;
  adSpend: number;
  impressions: number;
  clicks: number;
  adTransactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  favoriteCartCount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
}

const toRecord = (row: RawRecord): AdProductRecord => ({
  date: readDate(row["日期"]),
  planId: readId(row["计划ID"]),
  productId: readId(row["主体ID"]),
  adSpend: parseNumber(row["花费"]),
  impressions: parseNumber(row["展现量"]),
  clicks: parseNumber(row["点击量"]),
  adTransactionAmount: parseNumber(row["总成交金额"]),
  directTransactionAmount: parseNumber(row["直接成交金额"]),
  indirectTransactionAmount: parseNumber(row["间接成交金额"]),
  favoriteCartCount: parseNumber(row["总收藏加购数"]),
  guidedVisitors: parseNumber(row["引导访问人数"]),
  guidedProspects: parseNumber(row["引导访问潜客数"]),
  newBuyers: parseNumber(row["成交新客数"]),
  memberJoinCount: parseNumber(row["入会量"]),
});

export const parseAdProductSource = async (
  file: File,
): Promise<ParserResult<AdProductRecord>> => {
  const table = await parseTmallTableFile(file);
  const records = table.rows.map(toRecord).filter((record) => record.date && record.productId);
  const health = buildSourceHealth(
    "ad_product",
    file,
    table,
    records,
    (record) => record.date,
    (record) => record.productId,
  );

  return {
    health,
    records: health.status === "parsed" ? records : [],
  };
};

