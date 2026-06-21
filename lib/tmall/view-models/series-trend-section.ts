import {
  buildSeriesTrendSeries,
  type TmallTrendMetricKey,
  type TmallTrendSeries,
  type TmallTrendSource,
} from "./trends";
import type { TmallAnalysisDisplayResult } from "../../../types/tmall";

export type TmallSeriesTrendCardStatus = "empty" | "insufficient" | "ready";

export interface TmallSeriesTrendCardViewModel {
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
  status: TmallSeriesTrendCardStatus;
  statusText: string;
}

export interface TmallSeriesTrendSectionViewModel {
  seriesName: string;
  productIds: string[];
  cards: TmallSeriesTrendCardViewModel[];
  businessPointCount: number;
  adProductPointCount: number;
  summaryText: string;
}

interface SeriesTrendCardConfig {
  metricKey: TmallTrendMetricKey;
  title: string;
  description: string;
}

const SERIES_TREND_CARD_CONFIGS: SeriesTrendCardConfig[] = [
  {
    metricKey: "gmv",
    title: "GMV",
    description: "来自生意参谋商品表，按当前系列商品 ID 汇总支付金额。",
  },
  {
    metricKey: "gsv",
    title: "GSV",
    description: "来自生意参谋商品表，按当前系列商品 ID 汇总支付金额减成功退款金额。",
  },
  {
    metricKey: "visitors",
    title: "商品访客数合计",
    description: "来自生意参谋商品表，按当前系列商品 ID 汇总商品访客数。",
  },
  {
    metricKey: "conversionRate",
    title: "支付转化率",
    description: "按当前系列每日支付买家数合计除以商品访客数合计重新计算。",
  },
  {
    metricKey: "adSpend",
    title: "推广花费",
    description: "来自商品推广报表，按当前系列商品 ID 汇总推广花费。",
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
  status: TmallSeriesTrendCardStatus;
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
  productIds: string[],
  config: SeriesTrendCardConfig,
): TmallSeriesTrendCardViewModel => {
  const series = buildSeriesTrendSeries(result, productIds, config.metricKey);
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

export const buildTmallSeriesTrendSection = (
  result: TmallAnalysisDisplayResult,
  productIds: string[],
  seriesName: string,
): TmallSeriesTrendSectionViewModel => {
  const normalizedProductIds = [...new Set(productIds.map(String).filter(Boolean))];
  const cards = SERIES_TREND_CARD_CONFIGS.map((config) =>
    buildTrendCard(result, normalizedProductIds, config),
  );
  const businessPointCount = cards.find((card) => card.metricKey === "gmv")?.pointCount ?? 0;
  const adProductPointCount = cards.find((card) => card.metricKey === "adSpend")?.pointCount ?? 0;

  return {
    seriesName,
    productIds: normalizedProductIds,
    cards,
    businessPointCount,
    adProductPointCount,
    summaryText:
      "当前系列趋势基于所选系列内的商品 ID 计算。经营趋势使用生意参谋商品数据，系列推广趋势使用商品推广报表。系统不会使用计划推广报表补齐系列趋势。如果当前系列只有 1 个日期点，系统只展示当日值，不解释为趋势。",
  };
};
