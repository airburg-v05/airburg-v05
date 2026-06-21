import type { FieldMatch, FieldMappingResult, StandardMetricField } from "@/types/metrics";

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\u4e00-\u9fff0-9a-zA-Z]+/g, "");

const fieldCandidates: Record<StandardMetricField, string[]> = {
  platform: ["平台", "店铺平台", "数据来源"],
  date: ["日期", "统计日期", "时间", "数据日期"],
  product_id: [
    "商品ID",
    "宝贝ID",
    "商品id",
    "item_id",
    "主体ID",
    "商品编号",
    "sku_id",
    "SKU ID",
    "SPU ID",
  ],
  product_name: ["商品名称", "宝贝名称", "商品标题", "主体名称", "product_name"],
  visitors: ["商品访客数", "访客数", "UV", "商品访客", "商品访客人数"],
  sales_amount: [
    "支付金额",
    "成交金额",
    "支付子订单金额",
    "支付金额(元)",
    "GMV",
    "支付GMV",
    "销售额",
    "成交金额(元)",
  ],
  refund_amount: ["成功退款金额", "退款金额", "售后退款金额"],
  paid_buyers: ["支付买家数", "支付人数", "成交买家数", "成交人数", "购买人数"],
  conversion_rate: [
    "商品支付转化率",
    "支付转化率",
    "成交转化率",
    "下单转化率",
    "转化率",
    "支付率",
  ],
  avg_order_value: ["客单价", "支付客单价", "成交客单价", "客单", "平均客单价"],
  favorites: ["收藏数", "收藏人数", "收藏", "关注人数", "商品收藏数", "收藏人数(人)"],
  cart_additions: ["加购数", "加购人数", "加入购物车人数", "加购件数", "购物车人数", "加购"],
  ad_spend: ["花费", "推广花费", "消耗", "推广消耗"],
  ad_clicks: ["点击量", "点击数", "推广点击量", "核心位置点击量"],
  ad_sales_amount: ["总成交金额", "推广成交金额", "全站交易额", "总订单金额"],
  direct_sales_amount: ["直接成交金额", "直接成交额"],
  indirect_sales_amount: ["间接成交金额", "间接成交额"],
};

const normalizedCandidates = Object.fromEntries(
  Object.entries(fieldCandidates).map(([field, candidates]) => [
    field,
    candidates.map(normalizeText),
  ]),
) as Record<StandardMetricField, string[]>;

const normalizeHeaders = (rawHeaders: string[]) =>
  rawHeaders
    .map((header) => ({ raw: header, normalized: normalizeText(header) }))
    .filter((item) => item.normalized.length > 0);

const isFuzzyMatch = (header: string, candidate: string): boolean => {
  if (header === candidate) return true;
  if (candidate.length >= 2 && header.includes(candidate)) return true;
  return header.length >= 4 && candidate.includes(header);
};

export const matchField = (rawHeaders: string[]): FieldMappingResult => {
  const normalizedHeaders = normalizeHeaders(rawHeaders);

  return (Object.keys(fieldCandidates) as StandardMetricField[]).reduce(
    (result, field) => {
      const candidates = normalizedCandidates[field];
      const exactMatches = normalizedHeaders.filter((item) => candidates.includes(item.normalized));

      let rawField: string | null = null;
      let status: FieldMatch["status"] = "missing";

      if (exactMatches.length === 1) {
        rawField = exactMatches[0].raw;
        status = "matched";
      } else if (exactMatches.length > 1) {
        status = "ambiguous";
      } else {
        const fuzzyMatches = normalizedHeaders.filter((item) =>
          candidates.some((candidate) => isFuzzyMatch(item.normalized, candidate)),
        );

        if (fuzzyMatches.length === 1) {
          rawField = fuzzyMatches[0].raw;
          status = "matched";
        } else if (fuzzyMatches.length > 1) {
          status = "ambiguous";
        }
      }

      result[field] = { rawField, status };
      return result;
    },
    {} as FieldMappingResult,
  );
};
