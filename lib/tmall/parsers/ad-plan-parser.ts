import { parseNumber, type RawRecord } from "../normalizers";
import { parseTmallTableFile } from "./table-parser";
import { buildSourceHealth, readDate, readId, type ParserResult } from "./parser-utils";

export interface AdPlanRecord {
  date: string | null;
  planId: string | null;
  planName: string | null;
  sceneId: string | null;
  sceneName: string | null;
  adSpend: number;
  impressions: number;
  clicks: number;
  transactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
  memberFirstBuyers: number;
}

const toRecord = (row: RawRecord): AdPlanRecord => ({
  date: readDate(row["日期"]),
  planId: readId(row["计划ID"]),
  planName: row["计划名字"] ? `${row["计划名字"]}`.trim() : null,
  sceneId: readId(row["场景ID"]),
  sceneName: row["场景名字"] ? `${row["场景名字"]}`.trim() : null,
  adSpend: parseNumber(row["花费"]),
  impressions: parseNumber(row["展现量"]),
  clicks: parseNumber(row["点击量"]),
  transactionAmount: parseNumber(row["总成交金额"]),
  directTransactionAmount: parseNumber(row["直接成交金额"]),
  indirectTransactionAmount: parseNumber(row["间接成交金额"]),
  guidedVisitors: parseNumber(row["引导访问人数"]),
  guidedProspects: parseNumber(row["引导访问潜客数"]),
  newBuyers: parseNumber(row["成交新客数"]),
  memberJoinCount: parseNumber(row["入会量"]),
  memberFirstBuyers: parseNumber(row["会员首购人数"]),
});

export const parseAdPlanSource = async (
  file: File,
): Promise<ParserResult<AdPlanRecord>> => {
  const table = await parseTmallTableFile(file);
  const records = table.rows.map(toRecord).filter((record) => record.date && record.planId);
  const health = buildSourceHealth(
    "ad_plan",
    file,
    table,
    records,
    (record) => record.date,
    (record) => record.planId,
  );

  return {
    health,
    records: health.status === "parsed" ? records : [],
  };
};

