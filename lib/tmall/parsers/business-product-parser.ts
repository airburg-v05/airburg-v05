import { parseNumber, safeDivide, type RawRecord } from "../normalizers";
import { parseTmallTableFile } from "./table-parser";
import { buildSourceHealth, readDate, readId, type ParserResult } from "./parser-utils";

export interface BusinessProductRecord {
  date: string | null;
  productId: string | null;
  productName: string | null;
  visitors: number;
  pageViews: number;
  paidBuyers: number;
  gmv: number;
  refundSuccessAmount: number;
  gsv: number;
  refundRate: number | null;
  conversionRate: number | null;
  avgOrderValue: number | null;
  favorites: number;
  cartAdditions: number;
  orderBuyers: number;
  orderAmount: number;
  searchVisitors: number;
  searchPaidBuyers: number;
}

const toRecord = (row: RawRecord): BusinessProductRecord => {
  const visitors = parseNumber(row["商品访客数"]);
  const paidBuyers = parseNumber(row["支付买家数"]);
  const gmv = parseNumber(row["支付金额"]);
  const refundSuccessAmount = parseNumber(row["成功退款金额"]);
  const gsv = gmv - refundSuccessAmount;

  return {
    date: readDate(row["统计日期"]),
    productId: readId(row["商品ID"]),
    productName: row["商品名称"] ? `${row["商品名称"]}`.trim() : null,
    visitors,
    pageViews: parseNumber(row["商品浏览量"]),
    paidBuyers,
    gmv,
    refundSuccessAmount,
    gsv,
    refundRate: safeDivide(refundSuccessAmount, gmv),
    conversionRate: safeDivide(paidBuyers, visitors),
    avgOrderValue: safeDivide(gmv, paidBuyers),
    favorites: parseNumber(row["商品收藏人数"]),
    cartAdditions: parseNumber(row["商品加购人数"]),
    orderBuyers: parseNumber(row["下单买家数"]),
    orderAmount: parseNumber(row["下单金额"]),
    searchVisitors: parseNumber(row["搜索引导访客数"]),
    searchPaidBuyers: parseNumber(row["搜索引导支付买家数"]),
  };
};

export const parseBusinessProductSource = async (
  file: File,
): Promise<ParserResult<BusinessProductRecord>> => {
  const table = await parseTmallTableFile(file);
  const records = table.rows.map(toRecord).filter((record) => record.date && record.productId);
  const health = buildSourceHealth(
    "business_product",
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

