import {
  buildProductTrendSeries,
  type TmallTrendMetricKey,
  type TmallTrendSeries,
  type TmallTrendSource,
} from "./trends";
import type { TmallAnalysisDisplayResult } from "../../../types/tmall";

export type TmallProductTrendCardStatus = "empty" | "insufficient" | "ready";

export interface TmallProductTrendCardViewModel {
  id: string;
  metricKey: TmallTrendMetricKey;
  title: string;
  description: string;
  series: TmallTrendSeries;
  latestDate: string | null;
  latestValue: number | null;
  previousDate: string | null;
  previousValue: number | null;
  changeRate: number | null;
  pointCount: number;
  sourceLabel: string;
  status: TmallProductTrendCardStatus;
  statusText: string;
}

export interface TmallProductTrendSectionViewModel {
  productId: string;
  cards: TmallProductTrendCardViewModel[];
  businessPointCount: number;
  adProductPointCount: number;
  summaryText: string;
}

interface ProductTrendCardConfig {
  metricKey: TmallTrendMetricKey;
  title: string;
  description: string;
}

const PRODUCT_TREND_CARD_CONFIGS: ProductTrendCardConfig[] = [
  {
    metricKey: "gmv",
    title: "GMV",
    description: "来自生意参谋商品表，按当前商品 ID 汇总支付金额。",
  },
  {
    metricKey: "gsv",
    title: "GSV",
    description: "来自生意参谋商品表，按当前商品 ID 汇总支付金额减成功退款金额。",
  },
  {
    metricKey: "visitors",
    title: "商品访客数",
    description: "来自生意参谋商品表，按当前商品 ID 汇总商品访客数。",
  },
  {
    metricKey: "conversionRate",
    title: "支付转化率",
    description: "按当前商品每日支付买家数除以商品访客数重新计算。",
  },
  {
    metricKey: "adSpend",
    title: "推广花费",
    description: "来自商品推广报表，按当前商品 ID 汇总推广花费。",
  },
  {
    metricKey: "adRoi",
    title: "推广投入产出比",
    description: "来自商品推广报表，按每日推广成交金额除以推广花费重新计算。",
  },
];

const SOURCE_LABELS: Record<TmallTrendSource, string> = {
  business_product: "生意参谋商品表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales_apply: "售后申请日期",
  after_sales_success: "退款完结日期",
  after_sales_payment: "订单付款日期",
};

const safeNumber = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

const calculateChangeRate = (
  current: number | null,
  previous: number | null,
): number | null => {
  if (current === null || previous === null || previous === 0) return null;
  const value = (current - previous) / previous;
  return Number.isFinite(value) ? value : null;
};

const statusFromSeries = (series: TmallTrendSeries): {
  status: TmallProductTrendCardStatus;
  statusText: string;
} => {
  if (series.pointCount === 0) {
    return { status: "empty", statusText: "暂无趋势数据" };
  }

  if (series.pointCount === 1) {
    return {
      status: "insufficient",
      statusText: "当前指标只有 1 个日期点，暂不适合观察趋势",
    };
  }

  return { status: "ready", statusText: "可观察趋势" };
};

const buildTrendCard = (
  result: TmallAnalysisDisplayResult,
  productId: string,
  config: ProductTrendCardConfig,
): TmallProductTrendCardViewModel => {
  const series = buildProductTrendSeries(result, productId, config.metricKey);
  const points = [...series.points].sort((first, second) =>
    first.date.localeCompare(second.date),
  );
  const latest = points[points.length - 1] ?? null;
  const previous = points[points.length - 2] ?? null;
  const latestValue = latest ? safeNumber(latest.value) : null;
  const previousValue = previous ? safeNumber(previous.value) : null;
  const status = statusFromSeries(series);

  return {
    id: config.metricKey,
    metricKey: config.metricKey,
    title: config.title,
    description: config.description,
    series: {
      ...series,
      points,
    },
    latestDate: latest?.date ?? null,
    latestValue,
    previousDate: previous?.date ?? null,
    previousValue,
    changeRate: calculateChangeRate(latestValue, previousValue),
    pointCount: series.pointCount,
    sourceLabel: SOURCE_LABELS[series.source],
    status: status.status,
    statusText: status.statusText,
  };
};

export const buildTmallProductTrendSection = (
  result: TmallAnalysisDisplayResult,
  productId: string,
): TmallProductTrendSectionViewModel => {
  const normalizedProductId = String(productId);
  const cards = PRODUCT_TREND_CARD_CONFIGS.map((config) =>
    buildTrendCard(result, normalizedProductId, config),
  );
  const businessPointCount = cards.find((card) => card.metricKey === "gmv")?.pointCount ?? 0;
  const adProductPointCount = cards.find((card) => card.metricKey === "adSpend")?.pointCount ?? 0;

  return {
    productId: normalizedProductId,
    cards,
    businessPointCount,
    adProductPointCount,
    summaryText:
      "当前商品趋势基于所选商品 ID 的多日数据计算。经营趋势使用生意参谋商品数据，商品推广趋势使用商品推广报表。系统不会使用计划推广报表补齐单个商品趋势。如果当前商品只有 1 个日期点，系统只展示当日值，不解释为趋势。",
  };
};
