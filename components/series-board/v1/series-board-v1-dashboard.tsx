"use client";

import { useEffect, useMemo, useState } from "react";
import type { BIDataPoint, BIMetricValue, ChartSeries, UIState } from "@/lib/bi/bi.types";
import {
  aggregateSearchProductKeywords,
  aggregateSearchProductMetricByDate,
  effectiveKeywordDate,
  hasBrandModelTokens,
} from "@/lib/bi/brand-model-semantic";
import {
  createEmptyHomeBIDataSource,
  loadHomeBIDataSource,
  type BIHomeDataSource,
} from "@/lib/bi/bi.data-source";
import { createDefaultBIState } from "@/lib/bi/bi.store";
import {
  createBoardTargetKpiDefinitions,
  deriveTargetMetricValue,
  formatTargetMetricValue,
  getAllUnsupportedTargetMetricDefinitions,
  targetMetricValuesFromDrafts,
  type BoardTargetKpiDefinition,
  type TargetMetricDefinition,
} from "@/lib/bi/target-metric-definitions";
import {
  loadActiveTargetDrafts,
  saveTargetDrafts,
} from "@/lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftRecord,
} from "@/lib/persistence/target-drafts-persistence.types";
import type { BISearchProductKeyword, BrandModelFilter } from "@/lib/bi/search-keyword.types";
import { BIChartCard } from "@/components/visual-system/v1/bi-chart";
import { dateAxisWithTimeRangeFallback } from "@/components/visual-system/v1/chart-utils";
import { BrandModelFilterPopover } from "@/components/visual-system/v1/brand-model-filter-popover";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";
import {
  V1Sidebar,
  V1TimeRangePopover,
  V1TopBar,
  v1DatasetDateRangeFromDates,
  v1MonthRangeForMonth,
  v1ResolveTimeRangeForDataset,
  v1TimeRangeSourceLabel,
  v1WeekRangeForWeek,
  type V1ChartMode,
} from "@/components/visual-system/v1/visual-system";

type PeriodLabel = "日" | "周" | "月" | "自定义";
type PopupKind = "series" | "remark" | "target" | "brandModel" | null;
type Tone = "green" | "red" | "neutral";

interface StoreOption {
  storeId: string;
  storeName: string;
  platformCode: string;
  platformName: string;
}

interface SeriesProductRef {
  seriesId: string;
  seriesName: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  remark: string;
  source: "data" | "temp";
}

interface TempSeriesItem extends SeriesProductRef {
  id: string;
}

type SeriesKpiDefinition = BoardTargetKpiDefinition;
type TargetMessage = { tone: "info" | "success" | "warning"; text: string } | null;

interface SeriesKpiCard {
  key: string;
  title: string;
  value: string;
  rawValue: BIMetricValue;
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number;
  tone: Tone;
  description: string | null;
}

interface ProductContribution {
  key: string;
  rank: number;
  productName: string;
  productId: string;
  platformName: string;
  storeName: string;
  gmv: number | null;
  share: number | null;
  adSpend: number | null;
  roi: number | null;
  conversionRate: number | null;
}

const PLATFORM_OPTIONS = [
  { code: "tmall", name: "天猫" },
  { code: "jd", name: "京东" },
  { code: "pdd", name: "拼多多" },
  { code: "douyin", name: "抖音" },
  { code: "youzan", name: "有赞" },
];

const SERIES_METRIC_KEY_OVERRIDES: Record<string, string> = {
  gmv: "seriesGmv",
  gsv: "seriesGsv",
  refundRate: "returnRateTotal",
  shippedRefundRate: "returnRateShipped",
  signedRefundRate: "returnRateSigned",
  directTransactionShare: "directSalesShare",
};

const SERIES_TITLE_OVERRIDES: Record<string, string> = {
  gmv: "系列GMV",
  gsv: "系列GSV",
};

const SERIES_KPIS: SeriesKpiDefinition[] = createBoardTargetKpiDefinitions(
  "series",
  SERIES_METRIC_KEY_OVERRIDES,
  SERIES_TITLE_OVERRIDES,
);

const SERIES_TARGET_FIELDS = SERIES_KPIS.filter((definition) => definition.showInTargetInput);
const SERIES_DERIVED_TARGET_FIELDS = SERIES_KPIS.filter((definition) => definition.targetRule === "derived");
const TARGET_UNSUPPORTED_INPUT_KEYS = new Set(["mtdTurnover", "regionalFulfillmentRate", "shippedRefundRate", "signedRefundRate", "cpc"]);
const SERIES_UNSUPPORTED_TARGET_FIELDS = getAllUnsupportedTargetMetricDefinitions()
  .filter((definition) => TARGET_UNSUPPORTED_INPUT_KEYS.has(definition.metricKey));
const NO_STORE_SELECTED = "__airburg_series_no_store_selected__";
const BRAND_SERIES_KPI_KEYS = new Set(["brandVisitors", "brandPaidBuyers", "geoSearchShare"]);
const BRAND_MODEL_PROMPT = "请先设置品牌词 / 中心词";
const SERIES_PRODUCTS_PROMPT = "请先在系列设置中维护商品ID";
const BRAND_MODEL_DESCRIPTION = "品牌词 / 中心词 union 口径，同一搜索词只计一次";
const DEFAULT_TARGET_MONTH = "2026-06";
const FULL_SERIES_KPI_KEYS = [
  "seriesGmv",
  "seriesGsv",
  "adRoi",
  "adSpendRateAfterRefund",
  "directSalesShare",
  "brandVisitors",
  "brandPaidBuyers",
  "geoSearchShare",
  "returnRateTotal",
  "returnRateShipped",
  "returnRateSigned",
  "averageOrderValue",
  "conversionRate",
  "adSpend",
  "cpc",
] as const;
const DISPLAY_SERIES_KPI_KEYS = FULL_SERIES_KPI_KEYS;
const DISPLAY_SERIES_KPI_KEY_SET = new Set<string>(DISPLAY_SERIES_KPI_KEYS);

const createInitialState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "seriesGmv",
  brandModelFilter: {
    brandWords: [],
    modelWords: [],
    centerWordGroups: [],
  },
  timeRange: {
    mode: "day",
    startDate: null,
    endDate: null,
  },
});

const safeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sumMetric = (points: BIDataPoint[], metricKey: string): number | null => {
  let hasValue = false;
  const total = points.reduce((sum, point) => {
    const value = safeNumber(point.metrics[metricKey]);
    if (value === null) return sum;
    hasValue = true;
    return sum + value;
  }, 0);
  return hasValue ? total : null;
};

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;

const ratioWithPositiveDenominator = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;

const formatNumber = (value: number | null, options?: { percent?: boolean; digits?: number }): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const digits = options?.digits ?? (Math.abs(value) >= 100 ? 0 : 2);
  const normalized = options?.percent ? value * 100 : value;
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : Math.min(digits, 2),
  }).format(normalized);
  return options?.percent ? `${formatted}%` : formatted;
};

const formatKpiValue = (definition: SeriesKpiDefinition, value: number | null): string => {
  if (value === null) return "--";
  if (definition.unit === "%") return formatNumber(value, { percent: true, digits: 2 });
  return formatNumber(value, { digits: definition.unit === "倍" ? 2 : 0 });
};

const parseTarget = (value: string): number | null => {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const monthValueFromDate = (date: string | null): string =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : DEFAULT_TARGET_MONTH;

const formatTargetInputValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

const createSeriesTargetId = ({
  platformCode,
  storeId,
  seriesId,
  month,
  metricKey,
}: {
  platformCode: string;
  storeId: string;
  seriesId: string;
  month: string;
  metricKey: string;
}) => `series:${platformCode}:${storeId}:${seriesId}:${month}:${metricKey}`;

const uniqueTextList = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const parseDate = (date: string | null): Date | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const weekRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const day = parsed.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(parsed, offsetToMonday);
  return { startDate: formatDate(monday), endDate: formatDate(addDays(monday, 6)) };
};

const monthRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const inDateRange = (point: BIDataPoint, state: UIState): boolean => {
  const { startDate, endDate } = state.timeRange;
  if (startDate && point.businessDate < startDate) return false;
  if (endDate && point.businessDate > endDate) return false;
  return true;
};

const rangeText = (state: UIState): string =>
  state.timeRange.startDate && state.timeRange.endDate
    ? `${state.timeRange.startDate} ~ ${state.timeRange.endDate}`
    : "--";

const DATASET_RANGE_METRIC_KEYS = [
  "gmv",
  "gsv",
  "visitors",
  "paidBuyers",
  "adSpend",
  "adRevenue",
  "adClicks",
  "directTransactionAmount",
  "indirectTransactionAmount",
  "totalTransactionAmount",
] as const;

const hasDatasetRangeMetric = (point: BIDataPoint): boolean =>
  DATASET_RANGE_METRIC_KEYS.some((key) => typeof point.metrics[key] === "number" && Number.isFinite(point.metrics[key]));

const datasetDateRangeForSource = (source: BIHomeDataSource) => {
  const primaryRange = v1DatasetDateRangeFromDates([
    ...source.points.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.seriesPoints.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.searchTotalKeywords.map((keyword) => keyword.date),
    ...source.searchProductKeywords.map((keyword) => keyword.date),
  ]);
  return primaryRange ?? v1DatasetDateRangeFromDates(source.points.map((point) => point.businessDate));
};

const buildStoreOptions = (source: BIHomeDataSource): StoreOption[] => {
  const options = new Map<string, StoreOption>();
  source.points.forEach((point) => {
    if (!point.storeId) return;
    options.set(point.storeId, {
      storeId: point.storeId,
      storeName: point.storeName?.trim() || point.storeId,
      platformCode: point.platformCode,
      platformName: point.platformName?.trim() || point.platformCode,
    });
  });
  source.seriesDefinitions.forEach((series) => {
    if (options.has(series.storeId)) return;
    options.set(series.storeId, {
      storeId: series.storeId,
      storeName: series.storeName?.trim() || series.storeId,
      platformCode: series.platformCode,
      platformName: series.platformName?.trim() || series.platformCode,
    });
  });
  return Array.from(options.values()).sort((left, right) =>
    `${left.platformName}${left.storeName}`.localeCompare(`${right.platformName}${right.storeName}`),
  );
};

const buildSeriesRefs = (source: BIHomeDataSource, tempItems: TempSeriesItem[]): SeriesProductRef[] => {
  const fromData = source.seriesDefinitions.flatMap((series) =>
    series.productIds.map((productId) => ({
      seriesId: series.seriesId,
      seriesName: series.seriesName,
      platformCode: series.platformCode,
      platformName: series.platformName ?? series.platformCode,
      storeId: series.storeId,
      storeName: series.storeName ?? series.storeId,
      productId,
      remark: "",
      source: "data" as const,
    })),
  );
  return [...fromData, ...tempItems];
};

const metricValue = (points: BIDataPoint[], key: string): number | null => {
  const gmv = sumMetric(points, "gmv");
  const gsv = sumMetric(points, "gsv");
  const visitors = sumMetric(points, "visitors");
  const paidBuyers = sumMetric(points, "paidBuyers");
  const adSpend = sumMetric(points, "adSpend");
  const adRevenue = sumMetric(points, "adRevenue");
  const adClicks = sumMetric(points, "adClicks");
  const refundAmount = sumMetric(points, "refundAmount");
  const directTransactionAmount = sumMetric(points, "directTransactionAmount");
  const indirectTransactionAmount = sumMetric(points, "indirectTransactionAmount");
  const totalTransactionAmount = sumMetric(points, "totalTransactionAmount");
  const afterRefundGsv = gsv !== null && refundAmount !== null ? gsv - refundAmount : null;
  const directTransactionFallbackDenominator =
    directTransactionAmount !== null && indirectTransactionAmount !== null
      ? directTransactionAmount + indirectTransactionAmount
      : null;

  switch (key) {
    case "seriesGmv":
      return gmv;
    case "seriesGsv":
      return gsv;
    case "adRoi":
      return ratio(adRevenue, adSpend);
    case "returnRateTotal":
      return ratio(refundAmount, gsv);
    case "adSpendRateAfterRefund":
      return ratioWithPositiveDenominator(adSpend, afterRefundGsv);
    case "cpc":
      return ratio(adSpend, adClicks);
    case "averageOrderValue":
      return ratio(gmv, paidBuyers);
    case "conversionRate":
      return ratio(paidBuyers, visitors);
    case "adSpend":
      return adSpend;
    case "directSalesShare":
      return ratioWithPositiveDenominator(
        directTransactionAmount,
        totalTransactionAmount ?? directTransactionFallbackDenominator,
      );
    default:
      return null;
  }
};

const selectedSeriesRefs = (
  refs: SeriesProductRef[],
  selectedSeriesName: string | null,
  selectedStores: string[],
): SeriesProductRef[] => {
  const storeSet = new Set(selectedStores.filter((store) => store !== NO_STORE_SELECTED));
  if (!selectedSeriesName || storeSet.size === 0) return [];
  return refs.filter((ref) => ref.seriesName === selectedSeriesName && storeSet.has(ref.storeId));
};

const resolveSeriesTargetContext = (refs: SeriesProductRef[]) => {
  const contexts = new Map<string, Pick<SeriesProductRef, "platformCode" | "storeId" | "seriesId" | "seriesName">>();
  refs.forEach((ref) => {
    if (!ref.platformCode || !ref.storeId || !ref.seriesId) return;
    const key = `${ref.platformCode}:${ref.storeId}:${ref.seriesId}`;
    contexts.set(key, {
      platformCode: ref.platformCode,
      storeId: ref.storeId,
      seriesId: ref.seriesId,
      seriesName: ref.seriesName,
    });
  });
  return contexts.size === 1 ? Array.from(contexts.values())[0] : null;
};

const scopedSeriesPoints = (
  source: BIHomeDataSource,
  refs: SeriesProductRef[],
  state: UIState,
): BIDataPoint[] => {
  if (refs.length === 0) return [];
  const refKeys = new Set(refs.map((ref) => `${ref.platformCode}:${ref.storeId}:${ref.productId}`));
  const storeSet = new Set(state.selectedStores.filter((store) => store !== NO_STORE_SELECTED));
  return source.points.filter((point) => {
    if (!point.productId || !point.storeId) return false;
    if (!storeSet.has(point.storeId)) return false;
    if (!refKeys.has(`${point.platformCode}:${point.storeId}:${point.productId}`)) return false;
    return inDateRange(point, state);
  });
};

const searchKeywordInDateRange = (
  row: BISearchProductKeyword,
  source: BIHomeDataSource,
  state: UIState,
): boolean => {
  const date = effectiveKeywordDate(row.date, source.selectedDate);
  if (date === "未标日期") return true;
  if (state.timeRange.startDate && date < state.timeRange.startDate) return false;
  if (state.timeRange.endDate && date > state.timeRange.endDate) return false;
  return true;
};

const scopedSearchProductKeywords = (
  source: BIHomeDataSource,
  refs: SeriesProductRef[],
  state: UIState,
): BISearchProductKeyword[] => {
  const refKeys = new Set(refs.map((ref) => `${ref.platformCode}:${ref.storeId}:${ref.productId}`));
  if (refKeys.size === 0) return [];
  return source.searchProductKeywords.filter((row) => {
    if (!refKeys.has(`${row.platformCode}:${row.storeId}:${row.productId}`)) return false;
    return searchKeywordInDateRange(row, source, state);
  });
};

interface SeriesBrandMetrics {
  visitors: number | null;
  buyers: number | null;
  geoSearchShare: number | null;
  description: string | null;
}

const buildSeriesBrandMetrics = (
  source: BIHomeDataSource,
  refs: SeriesProductRef[],
  points: BIDataPoint[],
  state: UIState,
): SeriesBrandMetrics => {
  if (refs.length === 0) {
    return { visitors: null, buyers: null, geoSearchShare: null, description: SERIES_PRODUCTS_PROMPT };
  }
  if (!hasBrandModelTokens(state.brandModelFilter)) {
    return { visitors: null, buyers: null, geoSearchShare: null, description: BRAND_MODEL_PROMPT };
  }
  const productIds = refs.map((ref) => ref.productId);
  const aggregate = aggregateSearchProductKeywords(
    scopedSearchProductKeywords(source, refs, state),
    state.brandModelFilter,
    productIds,
  );
  const totalPaidBuyers = sumMetric(points, "paidBuyers");
  return {
    visitors: aggregate.visitors,
    buyers: aggregate.buyers,
    geoSearchShare: ratio(aggregate.buyers, totalPaidBuyers),
    description: aggregate.matchedRowCount > 0 ? BRAND_MODEL_DESCRIPTION : "当前系列暂无品牌词搜索数据",
  };
};

const buildKpiCards = (
  points: BIDataPoint[],
  targetDrafts: Record<string, number>,
  brandMetrics: SeriesBrandMetrics,
): SeriesKpiCard[] => {
  const targetMetricValues = targetMetricValuesFromDrafts(SERIES_KPIS, targetDrafts);
  return SERIES_KPIS.map((definition) => {
    const rawValue =
      definition.key === "brandVisitors"
        ? brandMetrics.visitors
        : definition.key === "brandPaidBuyers"
          ? brandMetrics.buyers
          : definition.key === "geoSearchShare"
          ? brandMetrics.geoSearchShare
            : metricValue(points, definition.key);
    const target = definition.targetRule === "derived"
      ? deriveTargetMetricValue(definition.metricKey, targetMetricValues).value
      : definition.targetRule === "required"
        ? targetDrafts[definition.title] ?? null
        : null;
    const progress = rawValue !== null && target ? Math.min(Math.abs((rawValue / target) * 100), 999) : 0;
    const difference = rawValue !== null && target ? rawValue - target : null;
    const reached =
      rawValue !== null && target
        ? definition.direction === "lower"
          ? rawValue <= target
          : definition.direction === "higher"
            ? rawValue >= target
            : rawValue <= target
        : false;
    return {
      key: definition.key,
      title: definition.title,
      value: formatKpiValue(definition, rawValue),
      rawValue,
      mtdTarget: target ? formatKpiValue(definition, target) : "--",
      totalTarget: target ? formatKpiValue(definition, target) : "--",
      difference: difference === null ? "--" : formatKpiValue(definition, difference),
      completionRate: target && rawValue !== null ? `${formatNumber(rawValue / target, { percent: true, digits: 2 })}` : "--",
      progress,
      tone: target && rawValue !== null ? (reached ? "green" : "red") : "neutral",
      description: BRAND_SERIES_KPI_KEYS.has(definition.key) ? brandMetrics.description : null,
    };
  });
};

const buildChartLines = (
  source: BIHomeDataSource,
  points: BIDataPoint[],
  refs: SeriesProductRef[],
  state: UIState,
  selectedSeriesName: string | null,
  selectedMetric: string,
): { xAxis: string[]; lines: ChartSeries[]; title: string; empty: boolean } => {
  const dates = Array.from(new Set(points.map((point) => point.businessDate))).sort();
  const xAxis = dateAxisWithTimeRangeFallback(dates, state.timeRange.startDate, state.timeRange.endDate, source.selectedDate);
  const selectedDefinition = SERIES_KPIS.find((kpi) => kpi.key === selectedMetric) ?? SERIES_KPIS[0];

  if (BRAND_SERIES_KPI_KEYS.has(selectedMetric)) {
    return buildBrandSeriesChart({
      source,
      points,
      refs,
      state,
      selectedSeriesName,
      selectedMetric,
    });
  }

  if (selectedMetric === "returnRateTotal" || selectedMetric === "returnRateShipped" || selectedMetric === "returnRateSigned") {
    const names = [
      ["return-total", "总退货率", "returnRateTotal"],
      ["return-shipped", "发货退货率", "returnRateShipped"],
      ["return-signed", "已签收退货率", "returnRateSigned"],
    ] as const;
    return {
      xAxis,
      title: `${selectedDefinition.title} · 退货率趋势对比`,
      empty: points.length === 0,
      lines: names.map(([id, name, key]) => ({
        id,
        name,
        entityLevel: "series",
        entityId: selectedSeriesName ?? "unconfigured",
        points: xAxis.map((date) => ({
          date,
          value: metricValue(points.filter((point) => point.businessDate === date), key),
        })),
      })),
    };
  }

  const lines = PLATFORM_OPTIONS.map((platform) => ({
    id: `${platform.code}-${selectedMetric}`,
    name: `${platform.name}-${selectedSeriesName ?? "未配置系列"}`,
    entityLevel: "series" as const,
    entityId: `${platform.code}:${selectedSeriesName ?? "unconfigured"}`,
    points: xAxis.map((date) => ({
      date,
      value: metricValue(
        points.filter((point) => point.platformCode === platform.code && point.businessDate === date),
        selectedMetric,
      ),
    })),
  }));

  return {
    xAxis,
    lines,
    title: `${selectedDefinition.title} · 平台 × 系列趋势`,
    empty: points.length === 0,
  };
};

const buildContributions = (points: BIDataPoint[]): ProductContribution[] => {
  const grouped = new Map<string, BIDataPoint[]>();
  points.forEach((point) => {
    if (!point.productId || !point.storeId) return;
    const key = `${point.platformCode}:${point.storeId}:${point.productId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  });
  const totalGmv = sumMetric(points, "gmv");
  return Array.from(grouped.entries())
    .map(([key, productPoints]) => {
      const first = productPoints[0];
      const gmv = sumMetric(productPoints, "gmv");
      const adSpend = sumMetric(productPoints, "adSpend");
      return {
        key,
        rank: 0,
        productName: first?.productName || first?.productId || "--",
        productId: first?.productId || "--",
        platformName: first?.platformName || first?.platformCode || "--",
        storeName: first?.storeName || first?.storeId || "--",
        gmv,
        share: ratio(gmv, totalGmv),
        adSpend,
        roi: ratio(sumMetric(productPoints, "adRevenue"), adSpend),
        conversionRate: ratio(sumMetric(productPoints, "paidBuyers"), sumMetric(productPoints, "visitors")),
      };
    })
    .sort((left, right) => (right.gmv ?? -1) - (left.gmv ?? -1) || left.productName.localeCompare(right.productName))
    .slice(0, 8)
    .map((item, index) => ({ ...item, rank: index + 1 }));
};

const chartLineFromDateValues = (
  id: string,
  name: string,
  entityId: string,
  xAxis: string[],
  valuesByDate: Map<string, number | null>,
): ChartSeries => ({
  id,
  name,
  entityLevel: "series",
  entityId,
  points: xAxis.map((date) => ({
    date,
    value: valuesByDate.get(date) ?? null,
  })),
});

const buildBrandSeriesChart = ({
  source,
  points,
  refs,
  state,
  selectedSeriesName,
  selectedMetric,
}: {
  source: BIHomeDataSource;
  points: BIDataPoint[];
  refs: SeriesProductRef[];
  state: UIState;
  selectedSeriesName: string | null;
  selectedMetric: string;
}): { xAxis: string[]; lines: ChartSeries[]; title: string; empty: boolean } => {
  const selectedDefinition = SERIES_KPIS.find((kpi) => kpi.key === selectedMetric) ?? SERIES_KPIS[0];
  const productIds = refs.map((ref) => ref.productId);
  const rows = scopedSearchProductKeywords(source, refs, state);
  const dateCandidates = [
    ...points.map((point) => point.businessDate),
    ...rows.map((row) => effectiveKeywordDate(row.date, source.selectedDate)),
  ];
  const xAxis = Array.from(new Set(dateCandidates.filter(Boolean))).sort();
  const fallbackAxis = dateAxisWithTimeRangeFallback(xAxis, state.timeRange.startDate, state.timeRange.endDate, source.selectedDate);

  if (refs.length === 0 || !hasBrandModelTokens(state.brandModelFilter)) {
    return {
      xAxis: fallbackAxis,
      title: "当前系列暂无品牌词趋势",
      empty: true,
      lines: [
        chartLineFromDateValues(
          `brand-series-${selectedMetric}`,
          selectedDefinition.title,
          selectedSeriesName ?? "unconfigured",
          fallbackAxis,
          new Map(),
        ),
      ],
    };
  }

  if (selectedMetric === "geoSearchShare") {
    const buyersByDate = aggregateSearchProductMetricByDate(rows, state.brandModelFilter, productIds, source.selectedDate, "buyers");
    const geoByDate = new Map(
      fallbackAxis.map((date) => [
        date,
        ratio(
          buyersByDate.get(date) ?? null,
          sumMetric(points.filter((point) => point.businessDate === date), "paidBuyers"),
        ),
      ]),
    );
    return {
      xAxis: fallbackAxis,
      title: `${selectedDefinition.title} · 当前系列品牌词趋势`,
      empty: Array.from(geoByDate.values()).every((value) => value === null),
      lines: [
        chartLineFromDateValues(
          "series-brand-geo",
          "当前系列GEO搜索占比",
          selectedSeriesName ?? "unconfigured",
          fallbackAxis,
          geoByDate,
        ),
      ],
    };
  }

  const metric = selectedMetric === "brandVisitors" ? "visitors" : "buyers";
  const valuesByDate = aggregateSearchProductMetricByDate(rows, state.brandModelFilter, productIds, source.selectedDate, metric);
  return {
    xAxis: fallbackAxis,
    title: `${selectedDefinition.title} · 当前系列品牌词趋势`,
    empty: Array.from(valuesByDate.values()).every((value) => value === null),
    lines: [
      chartLineFromDateValues(
        `series-brand-${metric}`,
        selectedDefinition.title,
        selectedSeriesName ?? "unconfigured",
        fallbackAxis,
        valuesByDate,
      ),
    ],
  };
};

function Sidebar() {
  return (
    <V1Sidebar
      activeLabel="系列看板"
      ariaLabel="系列看板导航"
      itemTestId="series-board-v1-nav-item"
      sidebarTestId="series-board-v1-sidebar"
    />
  );
}

function TopBar() {
  return <V1TopBar title="系列看板" />;
}

function KpiCard({ card, selected, onClick }: { card: SeriesKpiCard; selected: boolean; onClick: () => void }) {
  const missing = card.rawValue === null || card.value === "--";
  const progressColor = missing ? "bg-slate-300" : card.tone === "green" ? "bg-emerald-500" : card.tone === "red" ? "bg-rose-500" : "bg-slate-400";
  const resultTone = missing ? "font-semibold text-slate-500" : card.tone === "green" ? "font-semibold text-emerald-700" : card.tone === "red" ? "font-semibold text-rose-700" : "font-semibold text-slate-500";
  const helperText = missing ? "暂无可计算数据" : card.description;
  return (
    <button
      type="button"
      data-testid="series-board-v1-kpi-card"
      data-kpi-title={card.title}
      aria-pressed={selected}
      title={`${card.title}: 当前 ${card.value}; MTD目标 ${card.mtdTarget}; 总目标 ${card.totalTarget}; 差值 ${card.difference}; 完成率 ${card.completionRate}`}
      className={`h-[170px] min-w-0 overflow-hidden rounded-xl border p-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition ${
        selected ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200" : "border-slate-200/80 bg-white hover:bg-slate-50/80"
      }`}
      onClick={onClick}
    >
      <p className="break-words text-sm font-semibold text-slate-950">{card.title}</p>
      <p className="mt-1.5 break-words text-xl font-semibold leading-6 text-slate-950">{card.value}</p>
      {helperText ? <p className="mt-1 min-h-4 break-words text-[10px] font-semibold text-slate-500">{helperText}</p> : null}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(card.progress, 100)}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-4 text-slate-700">
        <div className="min-w-0">
          <dt>MTD目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.mtdTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>总目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.totalTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>差值</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.difference}</dd>
        </div>
        <div className="min-w-0">
          <dt>完成率</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.completionRate}</dd>
        </div>
      </dl>
    </button>
  );
}

function Controls({
  state,
  storeOptions,
  seriesNames,
  selectedSeriesName,
  selectedProductCount,
  storeMenuOpen,
  onToggleStoreMenu,
  onToggleStore,
  onSelectAllStores,
  onClearStores,
  onSelectSeries,
  onOpenPopup,
  onPeriodChange,
  onDayDateChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
}: {
  state: UIState;
  storeOptions: StoreOption[];
  seriesNames: string[];
  selectedSeriesName: string | null;
  selectedProductCount: number;
  storeMenuOpen: boolean;
  onToggleStoreMenu: () => void;
  onToggleStore: (storeId: string) => void;
  onSelectAllStores: () => void;
  onClearStores: () => void;
  onSelectSeries: (seriesName: string | null) => void;
  onOpenPopup: (kind: PopupKind) => void;
  onPeriodChange: (period: PeriodLabel) => void;
  onDayDateChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
}) {
  const selectedStoreIds = new Set(state.selectedStores);
  const selectedStoreCount = storeOptions.filter((option) => selectedStoreIds.has(option.storeId)).length;
  const selectedPlatforms = uniqueTextList(
    storeOptions.filter((option) => selectedStoreIds.has(option.storeId)).map((option) => option.platformName),
  );
  const selectedStoreNames = uniqueTextList(
    storeOptions.filter((option) => selectedStoreIds.has(option.storeId)).map((option) => option.storeName),
  );
  const platformText = selectedPlatforms.length > 0 ? selectedPlatforms.join(" / ") : "天猫";
  const selectedStoreText =
    selectedStoreNames.length === 1 ? selectedStoreNames[0] : selectedStoreCount > 0 ? `${selectedStoreCount} 个店铺` : "未选择店铺";
  const seriesText = selectedSeriesName ? `当前系列：${selectedSeriesName}` : "当前系列：未选择系列";
  const productCountText = selectedProductCount > 0 ? `${selectedProductCount} 个商品ID` : "未维护商品ID";
  const scopeBreadcrumb = `${platformText} / ${selectedStoreText} / ${seriesText} / ${productCountText}`;

  return (
    <section
      className="border-b border-slate-200 bg-white px-4 py-2"
      data-testid="series-board-v1-control"
      data-problem-ids="PVM2-001 PVM2-002 PVM2-004 PVM2-006 PVM2-007 PVM2-013"
    >
      <div className="space-y-1.5">
        <div data-testid="series-board-v1-business-toolbar" className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">店铺：</span>
            <button
              type="button"
              aria-expanded={storeMenuOpen}
                data-testid="series-board-v1-target-store"
                className="inline-flex min-h-8 w-[min(220px,70vw)] items-center justify-between gap-4 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              onClick={onToggleStoreMenu}
            >
                <span className="truncate">目标店铺</span>
              <span aria-hidden="true">▾</span>
            </button>
            {storeMenuOpen ? (
              <div className="absolute left-0 top-11 z-30 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">目标店铺</p>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onSelectAllStores}>
                      全部选择
                    </button>
                    <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onClearStores}>
                      清空选择
                    </button>
                  </div>
                </div>
                {storeOptions.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-500">暂无可选店铺</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {storeOptions.map((option) => (
                      <label key={option.storeId} className="flex items-start gap-2 rounded-xl border border-slate-200/80 px-2 py-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                          checked={selectedStoreIds.has(option.storeId)}
                          onChange={() => onToggleStore(option.storeId)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-slate-950">{option.storeName}</span>
                          <span className="block truncate text-xs text-slate-500">{option.platformName} · {option.storeId}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            </div>
            <span className="text-xs font-semibold text-slate-600">平台：{platformText}</span>
            <span className="text-xs font-semibold text-slate-600">店铺 {storeOptions.length} / 已选 {selectedStoreCount}</span>
            <label className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-600">
              当前系列：
              <select
                data-testid="series-board-v1-series-selector"
                className="h-8 w-[min(220px,70vw)] rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                value={selectedSeriesName ?? ""}
                onChange={(event) => onSelectSeries(event.target.value || null)}
              >
                {seriesNames.length === 0 ? (
                  <option value="">请先维护商品ID</option>
                ) : (
                  <>
                    <option value="">请选择系列</option>
                    {seriesNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
            <span className="text-xs font-semibold text-slate-600">已维护 {selectedProductCount} 个商品ID</span>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          <button
            type="button"
              className="min-h-8 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            onClick={() => onOpenPopup("series")}
          >
            系列设置
          </button>
            <button type="button" className="min-h-8 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)]" onClick={() => onOpenPopup("remark")}>
            商家备注
          </button>
          <button
            type="button"
            data-testid="series-board-v1-brand-model-filter-button"
              className="min-h-8 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            onClick={() => onOpenPopup("brandModel")}
          >
            品牌词筛选
          </button>
            <button type="button" className="min-h-8 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)]" onClick={() => onOpenPopup("target")}>
            系列目标
          </button>
          </div>
        </div>
        <div data-testid="series-board-v1-time-scope-toolbar" className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-slate-200/80 pt-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
          <V1TimeRangePopover
            testId="series-board-v1-time-range-popover"
              variant="split"
            mode={state.timeRange.mode}
            startDate={state.timeRange.startDate}
            endDate={state.timeRange.endDate}
            rangeLabel={rangeText(state)}
            onPeriodChange={onPeriodChange}
            onDayChange={onDayDateChange}
            onWeekChange={onWeekChange}
            onMonthChange={onMonthChange}
            onCustomDateChange={onCustomDateChange}
          />
            <span className="text-xs font-semibold text-slate-600">{rangeText(state)}</span>
          </div>
          <p
            data-testid="series-board-v1-dimension-scope"
            data-scope-variant="breadcrumb"
            className="min-w-0 truncate text-xs font-semibold text-slate-600"
            title={`范围：${scopeBreadcrumb}`}
          >
            <span className="text-slate-900">范围：</span>{scopeBreadcrumb}
          </p>
        </div>
      </div>
    </section>
  );
}

function SeriesSettingsPopover({
  items,
  storeOptions,
  onAdd,
  onRemove,
  onClose,
}: {
  items: TempSeriesItem[];
  storeOptions: StoreOption[];
  onAdd: (items: TempSeriesItem[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [seriesName, setSeriesName] = useState("空气净化器");
  const [platformCode, setPlatformCode] = useState("tmall");
  const [storeId, setStoreId] = useState(storeOptions[0]?.storeId ?? "");
  const [productIds, setProductIds] = useState("");
  const [remark, setRemark] = useState("");
  const selectedPlatform = PLATFORM_OPTIONS.find((platform) => platform.code === platformCode);
  const selectedStore = storeOptions.find((store) => store.storeId === storeId);

  const handleAdd = () => {
    const ids = uniqueTextList(productIds.split(/\s+/));
    if (!seriesName.trim() || !selectedStore || ids.length === 0) return;
    const normalizedSeriesName = seriesName.trim();
    const existingSeriesId = items.find(
      (item) =>
        item.platformCode === platformCode &&
        item.storeId === selectedStore.storeId &&
        item.seriesName === normalizedSeriesName,
    )?.seriesId;
    const stableSeriesId =
      existingSeriesId ?? `temp-series-${platformCode}-${selectedStore.storeId}-${normalizedSeriesName}-${Date.now()}`;
    onAdd(
      ids.map((productId) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${productId}`,
        seriesId: stableSeriesId,
        seriesName: normalizedSeriesName,
        platformCode,
        platformName: selectedPlatform?.name ?? platformCode,
        storeId: selectedStore.storeId,
        storeName: selectedStore.storeName,
        productId,
        remark: remark.trim(),
        source: "temp",
      })),
    );
    setProductIds("");
    setRemark("");
  };

  return (
    <aside
      data-testid="series-board-v1-series-settings"
      className="absolute left-4 top-28 z-20 w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">系列 + 商品清单</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            先定义系列，再把同店铺商品 ID 加入清单；配置保存在本浏览器的跨页面调试上下文。
          </p>
        </div>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-500">1. 系列信息</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-800">
          系列名称
          <input className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={seriesName} onChange={(event) => setSeriesName(event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-800">
          平台
          <select className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={platformCode} onChange={(event) => setPlatformCode(event.target.value)}>
            {PLATFORM_OPTIONS.map((platform) => (
              <option key={platform.code} value={platform.code}>{platform.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">
          店铺
          <select className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="">请选择店铺</option>
            {storeOptions.map((store) => (
              <option key={store.storeId} value={store.storeId}>{store.platformName} · {store.storeName}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-800">
          商品备注
          <input className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2" value={remark} onChange={(event) => setRemark(event.target.value)} />
        </label>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200/80 bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-slate-500">2. 商品 ID 清单</p>
        <label className="text-sm font-semibold text-slate-800">
          商品ID
          <textarea
            className="mt-1 min-h-28 w-full rounded-xl border border-slate-200/80 p-3"
            placeholder="支持多行粘贴，每行一个商品ID"
            value={productIds}
            onChange={(event) => setProductIds(event.target.value)}
          />
        </label>
      <div className="mt-3 flex justify-end">
        <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={handleAdd}>
          添加到当前系列商品清单
        </button>
      </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700">已维护商品清单</p>
          <span className="text-xs font-semibold text-slate-500">同系列按商品 ID 去看板聚合</span>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-700">
          <span>平台 / 店铺</span>
          <span>商品ID</span>
          <span>商品备注</span>
          <span>操作</span>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm font-semibold text-slate-500">请在系列设置中维护商品ID。</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                <span className="min-w-0 truncate">{item.platformName} · {item.storeName}</span>
                <span className="min-w-0 truncate">{item.productId}</span>
                <span className="min-w-0 truncate">{item.remark || "--"}</span>
                <button type="button" className="text-sm font-semibold text-rose-700" onClick={() => onRemove(item.id)}>移除</button>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function MerchantRemarkDialog({
  draft,
  saved,
  onDraftChange,
  onSave,
  onClose,
}: {
  draft: string;
  saved: string[];
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        data-testid="series-board-v1-merchant-remark"
        className="w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">商家备注</h2>
          <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>关闭</button>
        </div>
        <p className="mb-4 text-sm font-semibold text-slate-600">当前导入数据暂无商家备注字段，后续字段接入后生效。</p>
        <label className="block text-sm font-semibold text-slate-800">
          商家备注关键词
          <textarea
            className="mt-2 min-h-44 w-full rounded-xl border border-slate-200/80 p-3"
            placeholder="支持多行粘贴，每行一个关键词"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {saved.length === 0 ? (
            <span className="text-sm font-semibold text-slate-500">暂无已添加关键词。</span>
          ) : (
            saved.map((keyword) => (
              <span key={keyword} className="rounded-full border border-slate-200/80 px-2 py-1 text-xs font-semibold text-slate-700">{keyword}</span>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>取消</button>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={onSave}>保存</button>
        </div>
      </section>
    </div>
  );
}

function SeriesTargetPopover({
  values,
  derivedFields,
  unsupportedFields,
  month,
  message,
  canSave,
  onChange,
  onMonthChange,
  onSave,
  onClose,
}: {
  values: Record<string, string>;
  derivedFields: BoardTargetKpiDefinition[];
  unsupportedFields: TargetMetricDefinition[];
  month: string;
  message: TargetMessage;
  canSave: boolean;
  onChange: (label: string, value: string) => void;
  onMonthChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const messageClass =
    message?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : message?.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const inputValues = Object.fromEntries(
    SERIES_TARGET_FIELDS.map((field) => [field.title, parseTarget(values[field.title] ?? "")]).filter(([, value]) => value !== null),
  ) as Record<string, number>;
  const metricValues = targetMetricValuesFromDrafts(SERIES_TARGET_FIELDS, inputValues);
  return (
    <aside
      data-testid="series-board-v1-series-target"
      className="absolute right-4 top-28 z-20 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">系列目标</h2>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>关闭</button>
      </div>
      <p className="mb-3 text-xs font-semibold text-slate-500">
        目标草稿保存在本浏览器，仅影响目标、差值、完成率和进度条，不改变真实实际值。
      </p>
      <label className="mb-3 block text-xs font-semibold text-slate-600">
        目标月份
        <input
          type="month"
          className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm font-semibold text-slate-950"
          value={month}
          onChange={(event) => onMonthChange(event.target.value || DEFAULT_TARGET_MONTH)}
        />
      </label>
      {message ? (
        <p className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${messageClass}`}>{message.text}</p>
      ) : null}
      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">需要填写的目标</p>
          <div className="space-y-2">
            {SERIES_TARGET_FIELDS.map((field) => (
              <label key={field.title} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm font-semibold text-slate-800">
                <span>{field.title}</span>
                <span className="flex items-center gap-2">
                  <input
                    className="w-28 rounded-xl border border-slate-200/80 px-2 py-1.5 text-right"
                    value={values[field.title] ?? ""}
                    onChange={(event) => onChange(field.title, event.target.value)}
                  />
                  <span className="w-8 text-slate-600">{field.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">自动推导的目标</p>
          <div className="space-y-2">
            {derivedFields.map((field) => {
              const derived = deriveTargetMetricValue(field.metricKey, metricValues);
              return (
                <div key={field.metricKey} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-900">
                    <span>{field.title}</span>
                    <span>{formatTargetMetricValue(derived.value, field.format)}{derived.value !== null && field.unit !== "%" ? field.unit : ""}</span>
                  </div>
                  <p className="mt-1">{field.deriveFormula}</p>
                  <p className="mt-1 text-slate-500">
                    {derived.value === null && derived.missingDependencies.length === 0
                      ? "仅展示说明，不写入目标草稿。"
                      : derived.missingDependencies.length > 0
                        ? `缺少：${derived.missingDependencies.join("、")}`
                        : "依赖已满足，保存后目标展示会使用该推导值。"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">已隐藏的目标</p>
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
            title={unsupportedFields.map((field) => `${field.title}: ${field.unsupportedReason ?? "暂不开放输入"}`).join("；")}
          >
            {unsupportedFields.length} 项暂不开放普通输入，保留为信息说明，不写入目标草稿。
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>取消</button>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSave}
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </aside>
  );
}

function ProductContributionTop({ items }: { items: ProductContribution[] }) {
  const maxShare = Math.max(0.01, ...items.map((item) => item.share ?? 0));
  return (
    <section data-testid="series-board-v1-product-top" className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">系列内商品贡献 TOP</h2>
        <span className="text-xs font-semibold text-slate-500">按当前系列 GMV 降序，缺失 GMV 按名称稳定排序</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-4 text-sm font-semibold text-slate-500">
          当前系列暂无商品贡献数据。
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.key} className="grid gap-2 rounded-xl border border-slate-200/80 p-3 lg:grid-cols-[48px_1.2fr_2fr_1.1fr] lg:items-center">
              <div className="text-lg font-semibold text-slate-900">#{item.rank}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{item.productName}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{item.productId}</p>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                  <span>{item.platformName} · {item.storeName}</span>
                  <span>{formatNumber(item.share, { percent: true, digits: 2 })}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(((item.share ?? 0) / maxShare) * 100, 100)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                <span>GMV {formatNumber(item.gmv)}</span>
                <span>推广花费 {formatNumber(item.adSpend)}</span>
                <span>ROI {formatNumber(item.roi, { digits: 2 })}</span>
                <span>转化率 {formatNumber(item.conversionRate, { percent: true, digits: 2 })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function SeriesBoardV1Dashboard() {
  const [biState, setBiState] = useState<UIState>(() => createInitialState());
  const [dataSource, setDataSource] = useState<BIHomeDataSource>(() => createEmptyHomeBIDataSource("loading", "读取中"));
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [popup, setPopup] = useState<PopupKind>(null);
  const [tempSeriesItems, setTempSeriesItems] = useState<TempSeriesItem[]>([]);
  const [selectedSeriesName, setSelectedSeriesName] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<V1ChartMode>("mtd");
  const [debugContextReady, setDebugContextReady] = useState(false);
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, number>>({});
  const [targetMonth, setTargetMonth] = useState(DEFAULT_TARGET_MONTH);
  const [targetMessage, setTargetMessage] = useState<TargetMessage>(null);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkKeywords, setRemarkKeywords] = useState<string[]>([]);

  const storeOptions = useMemo(() => buildStoreOptions(dataSource), [dataSource]);
  const datasetDateRange = useMemo(() => datasetDateRangeForSource(dataSource), [dataSource]);
  const timeRangeSourceLabel = useMemo(
    () => v1TimeRangeSourceLabel(biState.timeRange, datasetDateRange),
    [biState.timeRange, datasetDateRange],
  );
  const allStoreIds = useMemo(() => storeOptions.map((option) => option.storeId), [storeOptions]);
  const allRefs = useMemo(() => buildSeriesRefs(dataSource, tempSeriesItems), [dataSource, tempSeriesItems]);
  const seriesNames = useMemo(() => uniqueTextList(allRefs.map((ref) => ref.seriesName)), [allRefs]);
  const effectiveSelectedSeriesName = seriesNames.includes(selectedSeriesName ?? "")
    ? selectedSeriesName
    : null;

  useEffect(() => {
    let active = true;

    loadCrossPageDebugContext()
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") {
          const page = result.snapshot.pages.series;
          setBiState((state) => mergeDebugContextIntoUIState(state, result.snapshot, "series"));
          setChartMode(page.chartMode);
          setTempSeriesItems(page.temporarySeriesProductIds);
          setSelectedSeriesName(page.currentSeriesName ?? page.temporarySeriesProductIds[0]?.seriesName ?? null);
        }
        setDebugContextReady(true);
      })
      .catch(() => {
        if (active) setDebugContextReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadHomeBIDataSource()
      .then((nextSource) => {
        if (!active) return;
        setDataSource(nextSource);
        const nextStoreIds = buildStoreOptions(nextSource).map((option) => option.storeId);
        const nextSeriesNames = uniqueTextList(buildSeriesRefs(nextSource, []).map((ref) => ref.seriesName));
        const nextMonth = monthValueFromDate(nextSource.selectedDate);
        setTargetMonth((current) => (current === DEFAULT_TARGET_MONTH ? nextMonth : current));
        setSelectedSeriesName((current) => current ?? nextSeriesNames[0] ?? null);
        setBiState((state) => ({
          ...state,
          selectedStores: state.selectedStores.length > 0 ? state.selectedStores : nextStoreIds,
          timeRange: v1ResolveTimeRangeForDataset(state.timeRange, datasetDateRangeForSource(nextSource)).timeRange,
        }));
      })
      .catch(() => {
        if (!active) return;
        setDataSource(createEmptyHomeBIDataSource("error", "读取失败"));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!debugContextReady || !datasetDateRange) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setBiState((state) => {
        const resolved = v1ResolveTimeRangeForDataset(state.timeRange, datasetDateRange);
        if (resolved.source !== "dataset") return state;
        return { ...state, timeRange: resolved.timeRange };
      });
    });
    return () => {
      active = false;
    };
  }, [datasetDateRange, debugContextReady]);

  useEffect(() => {
    if (!debugContextReady) return;
    void saveCrossPageDebugContextPatch({
      selectedPlatform: biState.selectedPlatform,
      selectedStores: biState.selectedStores,
      timeRange: biState.timeRange,
      brandModelFilter: biState.brandModelFilter,
      centerWordGroups: biState.brandModelFilter?.centerWordGroups,
      selectedMetric: biState.selectedMetric,
      chartMode,
      pages: {
        series: {
          selectedMetric: biState.selectedMetric,
          chartMode,
          currentSeriesName: selectedSeriesName,
          temporarySeriesProductIds: tempSeriesItems.map((item) => ({ ...item, source: "temp" as const })),
        },
      },
    });
  }, [
    biState.brandModelFilter,
    biState.selectedMetric,
    biState.selectedPlatform,
    biState.selectedStores,
    biState.timeRange,
    chartMode,
    debugContextReady,
    selectedSeriesName,
    tempSeriesItems,
  ]);

  const selectedRefs = useMemo(
    () => selectedSeriesRefs(allRefs, effectiveSelectedSeriesName, biState.selectedStores),
    [allRefs, biState.selectedStores, effectiveSelectedSeriesName],
  );
  const seriesTargetContext = useMemo(() => resolveSeriesTargetContext(selectedRefs), [selectedRefs]);
  const seriesPoints = useMemo(() => scopedSeriesPoints(dataSource, selectedRefs, biState), [biState, dataSource, selectedRefs]);
  const brandMetrics = useMemo(
    () => buildSeriesBrandMetrics(dataSource, selectedRefs, seriesPoints, biState),
    [biState, dataSource, selectedRefs, seriesPoints],
  );
  const allCards = useMemo(() => buildKpiCards(seriesPoints, targetDrafts, brandMetrics), [brandMetrics, seriesPoints, targetDrafts]);
  const cards = useMemo(
    () => DISPLAY_SERIES_KPI_KEYS
      .map((key) => allCards.find((card) => card.key === key))
      .filter((card): card is SeriesKpiCard => Boolean(card)),
    [allCards],
  );
  const selectedCard = cards.find((card) => card.key === biState.selectedMetric) ?? cards[0];

  useEffect(() => {
    if (DISPLAY_SERIES_KPI_KEY_SET.has(String(biState.selectedMetric))) return;
    void Promise.resolve().then(() => {
      setBiState((state) => ({ ...state, selectedMetric: "seriesGmv" }));
    });
  }, [biState.selectedMetric]);

  const chart = useMemo(
    () => buildChartLines(dataSource, seriesPoints, selectedRefs, biState, effectiveSelectedSeriesName, selectedCard?.key ?? "seriesGmv"),
    [biState, dataSource, effectiveSelectedSeriesName, selectedCard?.key, selectedRefs, seriesPoints],
  );
  const contributions = useMemo(() => buildContributions(seriesPoints), [seriesPoints]);
  const hasConfiguredSeries = selectedRefs.length > 0;

  useEffect(() => {
    let active = true;
    if (!seriesTargetContext) {
      Promise.resolve().then(() => {
        if (!active) return;
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({
          tone: "warning",
          text: "请选择单个店铺和当前系列后设置目标。",
        });
      });
      return () => {
        active = false;
      };
    }

    loadActiveTargetDrafts({
      scope: "series",
      platformCode: seriesTargetContext.platformCode,
      storeId: seriesTargetContext.storeId,
      seriesId: seriesTargetContext.seriesId,
      month: targetMonth,
    })
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") {
          const nextDrafts: Record<string, number> = {};
          const nextInputs: Record<string, string> = {};
          result.records.forEach((record) => {
            const field = SERIES_TARGET_FIELDS.find((definition) => definition.metricKey === record.metricKey);
            if (!field) return;
            nextDrafts[field.title] = record.targetValue;
            nextInputs[field.title] = formatTargetInputValue(record.targetValue);
          });
          setTargetDrafts(nextDrafts);
          setTargetInputs(nextInputs);
          setTargetMessage({ tone: "success", text: "已恢复当前系列的目标草稿。" });
          return;
        }
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({
          tone: result.status === "corrupted" ? "warning" : "info",
          text: result.status === "corrupted" ? "目标草稿版本不兼容，已安全忽略。" : "当前系列和月份暂无目标草稿。",
        });
      })
      .catch(() => {
        if (!active) return;
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({ tone: "warning", text: "目标草稿读取失败，当前仅显示实际值。" });
      });

    return () => {
      active = false;
    };
  }, [seriesTargetContext, targetMonth]);

  const handlePeriodChange = (period: PeriodLabel) => {
    const selectedDate = datasetDateRange?.endDate ?? dataSource.selectedDate;
    if (period === "日") {
      setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: selectedDate, endDate: selectedDate } }));
      return;
    }
    if (period === "周") {
      setBiState((state) => ({ ...state, timeRange: { mode: "week", ...weekRangeForDate(selectedDate) } }));
      return;
    }
    if (period === "月") {
      setBiState((state) => ({ ...state, timeRange: { mode: "month", ...monthRangeForDate(selectedDate) } }));
      return;
    }
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom" } }));
  };

  const handleCustomDateChange = (field: "startDate" | "endDate", value: string) => {
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom", [field]: value || null } }));
  };

  const handleDayDateChange = (value: string) => {
    const date = value.trim() || null;
    setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: date, endDate: date } }));
  };

  const handleWeekChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "week", ...v1WeekRangeForWeek(value) } }));
  };

  const handleMonthChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "month", ...v1MonthRangeForMonth(value) } }));
  };

  const handleToggleStore = (storeId: string) => {
    setBiState((state) => {
      const selected = new Set(state.selectedStores.filter((id) => id !== NO_STORE_SELECTED));
      if (selected.has(storeId)) selected.delete(storeId);
      else selected.add(storeId);
      const nextStores = Array.from(selected);
      return { ...state, selectedStores: nextStores.length > 0 ? nextStores : [NO_STORE_SELECTED] };
    });
  };

  const handleSaveTargets = async () => {
    if (!seriesTargetContext) {
      setTargetMessage({
        tone: "warning",
        text: "请选择单个店铺和当前系列后设置目标。",
      });
      return;
    }

    const nextDrafts = Object.fromEntries(
      Object.entries(targetInputs)
        .filter(([label]) => SERIES_TARGET_FIELDS.some((field) => field.title === label))
        .map(([label, value]) => [label, parseTarget(value)] as const)
        .filter(([, value]) => value !== null),
    ) as Record<string, number>;

    const now = new Date().toISOString();
    const records: TargetDraftRecord[] = [];
    SERIES_TARGET_FIELDS.forEach((field) => {
      const value = parseTarget(targetInputs[field.title] ?? "");
      if (value === null) return;
      records.push({
        schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
        targetId: createSeriesTargetId({
          platformCode: seriesTargetContext.platformCode,
          storeId: seriesTargetContext.storeId,
          seriesId: seriesTargetContext.seriesId,
          month: targetMonth,
          metricKey: field.metricKey,
        }),
        scope: "series",
        platformCode: seriesTargetContext.platformCode,
        storeId: seriesTargetContext.storeId,
        seriesId: seriesTargetContext.seriesId,
        productId: null,
        month: targetMonth,
        metricKey: field.metricKey,
        targetValue: value,
        unit: field.unit,
        createdAt: now,
        updatedAt: now,
        status: "active",
      });
    });

    if (records.length > 0) {
      const result = await saveTargetDrafts(records);
      if (result.status !== "saved") {
        setTargetMessage({
          tone: "warning",
          text: "系列目标草稿保存失败，请检查目标值和单位。",
        });
        return;
      }
    }

    setTargetDrafts(nextDrafts);
    setTargetMessage({ tone: "success", text: "已保存当前系列目标草稿，刷新后可继续查看。" });
    setPopup(null);
  };

  const handleSaveBrandModelFilter = (filter: BrandModelFilter) => {
    setBiState((state) => ({
      ...state,
      brandModelFilter: filter,
    }));
    setPopup(null);
  };

  return (
    <div data-testid="series-board-v1-dashboard" className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px]">
          <Controls
            state={biState}
            storeOptions={storeOptions}
            seriesNames={seriesNames}
            selectedSeriesName={effectiveSelectedSeriesName}
            selectedProductCount={selectedRefs.length}
            storeMenuOpen={storeMenuOpen}
            onToggleStoreMenu={() => setStoreMenuOpen((open) => !open)}
            onToggleStore={handleToggleStore}
            onSelectAllStores={() => setBiState((state) => ({ ...state, selectedStores: allStoreIds }))}
            onClearStores={() => setBiState((state) => ({ ...state, selectedStores: [NO_STORE_SELECTED] }))}
            onSelectSeries={setSelectedSeriesName}
            onOpenPopup={setPopup}
            onPeriodChange={handlePeriodChange}
            onDayDateChange={handleDayDateChange}
            onWeekChange={handleWeekChange}
            onMonthChange={handleMonthChange}
            onCustomDateChange={handleCustomDateChange}
          />
          {popup === "series" ? (
            <SeriesSettingsPopover
              items={tempSeriesItems}
              storeOptions={storeOptions}
              onAdd={(items) => {
                setTempSeriesItems((current) => [...current, ...items]);
                setSelectedSeriesName(items[0]?.seriesName ?? selectedSeriesName);
              }}
              onRemove={(id) => setTempSeriesItems((current) => current.filter((item) => item.id !== id))}
              onClose={() => setPopup(null)}
            />
          ) : null}
          {popup === "remark" ? (
            <MerchantRemarkDialog
              draft={remarkDraft}
              saved={remarkKeywords}
              onDraftChange={setRemarkDraft}
              onSave={() => {
                setRemarkKeywords(uniqueTextList(remarkDraft.split(/\s+/)));
                setPopup(null);
              }}
              onClose={() => setPopup(null)}
            />
          ) : null}
          {popup === "target" ? (
            <SeriesTargetPopover
              values={targetInputs}
              derivedFields={SERIES_DERIVED_TARGET_FIELDS}
              unsupportedFields={SERIES_UNSUPPORTED_TARGET_FIELDS}
              month={targetMonth}
              message={targetMessage}
              canSave={Boolean(seriesTargetContext)}
              onChange={(label, value) => setTargetInputs((inputs) => ({ ...inputs, [label]: value }))}
              onMonthChange={setTargetMonth}
              onSave={handleSaveTargets}
              onClose={() => setPopup(null)}
            />
          ) : null}
          {popup === "brandModel" ? (
            <BrandModelFilterPopover
              value={biState.brandModelFilter}
              testId="series-board-v1-brand-model-filter-popover"
              onSave={handleSaveBrandModelFilter}
              onClear={() =>
                setBiState((state) => ({
                  ...state,
                  brandModelFilter: { brandWords: [], modelWords: [], centerWordGroups: [] },
                }))
              }
              onClose={() => setPopup(null)}
            />
          ) : null}

          <div className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="mr-3 text-slate-900">{dataSource.dataStatus.label}</span>
            <span data-testid="series-board-time-range-source-label" className="mr-3 text-blue-700">{timeRangeSourceLabel}</span>
            {hasConfiguredSeries
              ? `当前系列：${effectiveSelectedSeriesName} · 已维护 ${selectedRefs.length} 个商品ID`
              : "请先在系列设置中添加商品ID。"}
          </div>

          <section data-testid="series-board-v1-kpi-section" className="px-4 py-3" data-problem-ids="PVM2-002 PVM2-007">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">系列指标</h2>
              <div className="text-xs font-semibold text-slate-500">当前系列商品 ID 过滤后展示当前值、目标、差值、完成率和进度</div>
            </div>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label="系列 KPI 指标卡片">
              {cards.map((card) => (
                <KpiCard
                  key={card.key}
                  card={hasConfiguredSeries ? card : { ...card, value: "--", rawValue: null, difference: "--", completionRate: "--", progress: 0 }}
                  selected={selectedCard?.key === card.key}
                  onClick={() => setBiState((state) => ({ ...state, selectedMetric: card.key }))}
                />
              ))}
            </section>
          </section>
          <section data-testid="series-board-v1-chart-section" className="px-4 py-3" data-problem-ids="PVM2-004 PVM2-005 PVM2-007">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">系列趋势与商品贡献</h2>
              <div className="text-xs font-semibold text-slate-500">MTD / DLY 单图切换，品牌词按当前系列已维护商品计算</div>
            </div>
            {!hasConfiguredSeries ? (
              <div className="mb-4 rounded-xl border border-dashed border-slate-200/80 bg-white px-4 py-5 text-sm font-semibold text-slate-600">
                请在系列设置中维护商品ID。系列未配置时，KPI 和趋势图保持安全空状态。
              </div>
            ) : null}

          <div className="grid gap-4 pb-3">
            <BIChartCard
              chart={{ ...chart, empty: !hasConfiguredSeries || chart.empty }}
              mode={chartMode}
              onModeChange={setChartMode}
              variant={chartMode === "mtd" ? "line" : "bar"}
              description="缺失平台不按 0 计算；商家备注字段未接入时仅保存条件。"
              emptyText="当前系列暂无可展示趋势"
              testId="series-board-v1-chart-panel"
              modeSwitchTestId="series-board-v1-chart-mode-switch"
            />
            <ProductContributionTop items={hasConfiguredSeries ? contributions : []} />
          </div>
          </section>
          </div>
        </div>
      </main>
    </div>
  );
}
