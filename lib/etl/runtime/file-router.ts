import type { ParsedExcelSheet } from "../parse-excel";
import type { ETLSourceType } from "./context";

const compact = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_\-:：/\\|（）()［\][\]【】]/g, "")
    .replace(/　/g, "");

const HEADER_ALIASES: Record<string, string[]> = {
  productId: [
    "商品ID",
    "商品id",
    "商品id(主键)",
    "宝贝ID",
    "宝贝id",
    "宝贝id(主键)",
    "产品ID",
    "产品id",
    "主商品ID",
    "主体ID",
    "主体id",
    "productId",
    "product_id",
    "itemId",
    "item_id",
  ],
  productName: ["商品名称", "商品名", "宝贝名称", "宝贝标题", "商品标题", "标题", "产品名称", "主体名称", "productName", "name"],
  planId: ["计划ID", "计划id", "推广计划ID", "推广计划id", "planId", "plan_id"],
  planName: ["计划名字", "计划名称", "推广计划名称", "planName", "plan_name"],
  date: ["日期", "统计日期", "业务日期", "时间", "下载周期", "报表日期", "date"],
  gmv: ["GMV", "成交金额", "交易金额", "支付金额", "支付子订单金额", "销售额", "下单金额", "引导支付金额", "总预售成交金额", "gmv"],
  gsv: ["GSV", "净销售额", "净成交金额", "成功成交金额", "支付金额", "支付子订单金额", "gsv"],
  visitors: ["访客", "访客数", "搜索词访客数", "商品访客", "商品访客数", "引导访客数", "UV", "uv", "visitors"],
  buyers: ["支付买家", "支付买家数", "支付人数", "成交人数", "引导支付买家数", "买家数", "buyers", "paidBuyers"],
  spend: ["推广花费", "花费", "消耗", "总花费", "spend", "adSpend"],
  clicks: ["点击", "点击量", "点击数", "clicks"],
  roi: ["ROI", "投入产出比", "投产比", "roi"],
  directTransactionAmount: ["直接成交金额", "直接成交", "直接成交额", "直接支付金额", "直接成交支付金额", "directTransactionAmount"],
  indirectTransactionAmount: ["间接成交金额", "间接成交", "间接成交额", "间接支付金额", "indirectTransactionAmount"],
  totalTransactionAmount: ["总成交金额", "总成交", "总成交额", "成交金额", "支付金额", "totalTransactionAmount"],
  keyword: ["搜索词", "关键词", "引流搜索词", "词根", "keyword", "searchTerm"],
  refundAmount: ["退款金额", "成功退款金额", "申请退款金额", "退货退款金额", "退款总额", "退给买家金额", "refundAmount"],
  refundReason: ["退款原因", "售后原因", "买家申请原因", "refundReason"],
  refundStatus: ["退款状态", "售后状态", "货物状态", "发货状态", "签收状态", "refundStatus"],
  refundCompletedAt: ["退款完结时间", "退款成功时间", "成功退款时间", "refundCompletedAt"],
  refundAppliedAt: ["退款申请时间", "申请退款时间", "售后申请时间", "refundAppliedAt"],
  shipmentStatus: ["货物状态", "发货状态", "售后类型", "shipmentStatus"],
  signedStatus: ["签收状态", "收货状态", "货物状态", "signedStatus"],
};

export const normalizeFieldName = (fieldName: string): string => compact(fieldName);

export const findField = (row: Record<string, unknown>, canonicalField: keyof typeof HEADER_ALIASES): string | null => {
  const aliases = new Set(HEADER_ALIASES[canonicalField].map(compact));
  return Object.keys(row).find((field) => aliases.has(compact(field))) ?? null;
};

const collectFields = (sheets: ParsedExcelSheet[]): Set<string> => {
  const fields = new Set<string>();
  sheets.forEach((sheet) => {
    sheet.rows.slice(0, 20).forEach((row) => {
      Object.keys(row).forEach((field) => fields.add(compact(field)));
    });
  });
  return fields;
};

const hasAlias = (fields: Set<string>, canonicalField: keyof typeof HEADER_ALIASES): boolean =>
  HEADER_ALIASES[canonicalField].some((alias) => fields.has(compact(alias)));

export const detectFileType = (sheets: ParsedExcelSheet[]): ETLSourceType => {
  const fields = collectFields(sheets);
  const hasProductId = hasAlias(fields, "productId");
  const hasProductName = hasAlias(fields, "productName");
  const hasKeyword = hasAlias(fields, "keyword");
  const hasDate = hasAlias(fields, "date");
  const hasPlanId = hasAlias(fields, "planId");
  const hasBusinessMetric = hasAlias(fields, "gmv") || hasAlias(fields, "gsv") || hasAlias(fields, "buyers");
  const hasTrafficMetric = hasAlias(fields, "visitors");
  const hasPlanMetric = hasAlias(fields, "spend") || hasAlias(fields, "roi") || hasAlias(fields, "clicks");
  const hasAfterSalesSignal =
    hasAlias(fields, "refundReason") ||
    hasAlias(fields, "refundStatus") ||
    Array.from(fields).some((field) => /售后|退款原因|退款状态|货物状态|退款完结时间|退款申请时间|买家实际支付金额|收件|物流|电话/.test(field)) ||
    (!hasProductId && hasAlias(fields, "refundAmount"));

  if (hasAfterSalesSignal) return "after_sales";
  if (hasProductId && hasKeyword) return "search_product";
  if (!hasProductId && hasKeyword && hasTrafficMetric) return "search_total";
  if (hasProductId && hasDate && hasPlanMetric) return "plan_metric";
  if (!hasProductId && hasDate && hasPlanMetric && hasPlanId) return "plan_metric";
  if (!hasProductId && hasDate && hasPlanMetric) return "unsupported_plan_summary";
  if (hasProductId && hasDate && (hasBusinessMetric || hasTrafficMetric)) return "product_metric";
  if (hasProductId && hasProductName) return "product_dimension";
  return "unknown";
};
