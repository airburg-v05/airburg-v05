import {
  buildStoreTrendSeries,
  buildTrendReadiness,
  getTrendDateCoverage,
  type TmallTrendDateCoverage,
  type TmallTrendMetricKey,
  type TmallTrendReadiness,
  type TmallTrendSeries,
  type TmallTrendSource,
} from "./trends";
import type { TmallAnalysisDisplayResult, TmallDateRange } from "../../../types/tmall";

export type TmallStoreTrendCardStatus = "empty" | "insufficient" | "ready";

export interface TmallStoreTrendCardViewModel {
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
  status: TmallStoreTrendCardStatus;
  statusText: string;
}

export interface TmallStoreTrendCoverageItem {
  key: string;
  label: string;
  pointCount: number;
  dateRange: TmallDateRange;
}

export interface TmallStoreTrendSectionViewModel {
  cards: TmallStoreTrendCardViewModel[];
  coverage: TmallTrendDateCoverage;
  readiness: TmallTrendReadiness;
  coverageItems: TmallStoreTrendCoverageItem[];
  summaryText: string;
}

interface StoreTrendCardConfig {
  metricKey: TmallTrendMetricKey;
  title: string;
  description: string;
}

const STORE_TREND_CARD_CONFIGS: StoreTrendCardConfig[] = [
  {
    metricKey: "gmv",
    title: "GMV",
    description: "来自生意参谋商品表，按日期汇总支付金额。",
  },
  {
    metricKey: "gsv",
    title: "GSV",
    description: "来自生意参谋商品表，按日期汇总支付金额减成功退款金额。",
  },
  {
    metricKey: "visitors",
    title: "商品访客数合计",
    description: "来自生意参谋商品表，按日期汇总商品访客数。",
  },
  {
    metricKey: "conversionRate",
    title: "支付转化率",
    description: "按每日支付买家数合计除以商品访客数合计重新计算。",
  },
  {
    metricKey: "adSpend",
    title: "推广花费",
    description: "来自计划推广报表，按日期汇总计划推广花费。",
  },
  {
    metricKey: "adRoi",
    title: "推广投入产出比",
    description: "来自计划推广报表，按每日推广成交金额除以推广花费重新计算。",
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
  status: TmallStoreTrendCardStatus;
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
  config: StoreTrendCardConfig,
): TmallStoreTrendCardViewModel => {
  const series = buildStoreTrendSeries(result, config.metricKey);
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

export const buildTmallStoreTrendSection = (
  result: TmallAnalysisDisplayResult,
): TmallStoreTrendSectionViewModel => {
  const coverage = getTrendDateCoverage(result);
  const readiness = buildTrendReadiness(result);
  const coverageItems: TmallStoreTrendCoverageItem[] = [
    {
      key: "businessProduct",
      label: "经营数据",
      pointCount: coverage.businessProduct.dateCount,
      dateRange: coverage.businessProduct.dateRange,
    },
    {
      key: "adProduct",
      label: "商品推广数据",
      pointCount: coverage.adProduct.dateCount,
      dateRange: coverage.adProduct.dateRange,
    },
    {
      key: "adPlan",
      label: "计划推广数据",
      pointCount: coverage.adPlan.dateCount,
      dateRange: coverage.adPlan.dateRange,
    },
    {
      key: "afterSalesApplyDate",
      label: "售后申请数据",
      pointCount: coverage.afterSalesApplyDate.dateCount,
      dateRange: coverage.afterSalesApplyDate.dateRange,
    },
  ];

  return {
    cards: STORE_TREND_CARD_CONFIGS.map((config) => buildTrendCard(result, config)),
    coverage,
    readiness,
    coverageItems,
    summaryText:
      "不同数据源日期范围可能不同。经营趋势只使用生意参谋商品数据，店铺推广趋势使用计划推广数据。系统不会用计划推广 7 日数据补齐经营趋势。",
  };
};
