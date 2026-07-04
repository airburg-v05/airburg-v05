import type {
  BIDataPoint,
  BIMetricKey,
  BIMetricValue,
  BITimeRange,
  ChartModel,
  ChartSeries,
  KPICard,
  PlatformAgg,
  SeriesAgg,
  UIState,
} from "./bi.types";
import {
  aggregateSearchProductMetricByDate,
  aggregateSearchTotalKeywords,
  aggregateSearchTotalMetricByDate,
  centerWordFilter,
  hasBrandModelTokens,
  normalizeBrandModelFilter,
} from "./brand-model-semantic";
import { buildPlatformAggs, buildSeriesAggs, filterBIDataPoints } from "./bi.selector";
import type { BIHomeDataSource, BIHomeSeriesDefinition, BIHomeTargetDefinition } from "./bi.data-source";
import { selectedMonthForBI } from "./bi.data-source";
import type { BISearchProductKeyword, BISearchTotalKeyword } from "./search-keyword.types";
import {
  deriveTargetMetricValue,
  getTargetMetricDefinitionByKey,
} from "./target-metric-definitions";

export type HomeBIChartMode = "mtd" | "dly";

export type HomeBIMetricTone = "red" | "green";

export interface HomeBIKpiCard extends KPICard {
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number;
  statusTone: HomeBIMetricTone;
  unit: string;
  coreSeriesId: string | null;
  sourceStatus: "real" | "missing" | "series_unconfigured";
}

export interface HomeBIViewModel {
  state: UIState;
  selectedStores: string[];
  selectedPlatforms: string[];
  selectedSeries: string | null;
  timeRange: BITimeRange;
  kpiCards: HomeBIKpiCard[];
  selectedKpi: HomeBIKpiCard;
  mtdChartModel: ChartModel;
  dlyChartModel: ChartModel;
  chartModel: ChartModel;
  platformSummary: PlatformAgg[];
  seriesSummary: SeriesAgg[];
  dataStatus: BIHomeDataSource["dataStatus"];
  safeWarnings: string[];
  notices: string[];
  isEmpty: boolean;
  isCorrupted: boolean;
}

interface MetricDefinition {
  title: string;
  metricKey: BIMetricKey;
  sourceMetric: string | null;
  targetMetricKey: string | null;
  unit: string;
  format: "money" | "integer" | "percent" | "ratio" | "days" | "plain";
  seriesId?: string | null;
}

const PLATFORM_ORDER = ["tmall", "jd", "douyin", "pdd", "youzan"] as const;

const PLATFORM_LABELS: Record<string, string> = {
  tmall: "天猫",
  jd: "京东",
  douyin: "抖音",
  pdd: "拼多多",
  youzan: "有赞",
};

export const HOME_BI_KPI_DEFINITIONS: MetricDefinition[] = [
  { title: "GMV", metricKey: "GMV", sourceMetric: "gmv", targetMetricKey: "gmv", unit: "元", format: "money" },
  { title: "GSV", metricKey: "GSV", sourceMetric: "gsv", targetMetricKey: "gsv", unit: "元", format: "money" },
  { title: "去退费比", metricKey: "去退费比", sourceMetric: "adSpendRateAfterRefund", targetMetricKey: "adSpendRateAfterRefund", unit: "%", format: "percent" },
  { title: "品牌词访客", metricKey: "品牌词访客", sourceMetric: null, targetMetricKey: "brandVisitors", unit: "人", format: "integer" },
  { title: "品牌词支付人数", metricKey: "品牌词支付人数", sourceMetric: null, targetMetricKey: "brandPaidBuyers", unit: "人", format: "integer" },
  { title: "GEO搜索占比", metricKey: "GEO搜索占比", sourceMetric: null, targetMetricKey: "geoSearchShare", unit: "%", format: "percent" },
  { title: "投入产出比", metricKey: "投入产出比", sourceMetric: "adRoi", targetMetricKey: "adRoi", unit: "倍", format: "ratio" },
  { title: "退货率（总）", metricKey: "退货率（总）", sourceMetric: "refundRate", targetMetricKey: "refundRate", unit: "%", format: "percent" },
  { title: "发货退货率", metricKey: "发货退货率", sourceMetric: "shippedRefundRate", targetMetricKey: "shippedRefundRate", unit: "%", format: "percent" },
  { title: "已签收退货率", metricKey: "已签收退货率", sourceMetric: "signedRefundRate", targetMetricKey: "signedRefundRate", unit: "%", format: "percent" },
  { title: "MTD周转", metricKey: "MTD周转", sourceMetric: null, targetMetricKey: "mtdTurnover", unit: "天", format: "days" },
  { title: "同区履约率", metricKey: "同区履约率", sourceMetric: null, targetMetricKey: "regionalFulfillmentRate", unit: "%", format: "percent" },
  { title: "推广点击单价", metricKey: "推广点击单价", sourceMetric: "cpc", targetMetricKey: "cpc", unit: "元", format: "money" },
  { title: "客单价", metricKey: "客单价", sourceMetric: "averageOrderValue", targetMetricKey: "averageOrderValue", unit: "元", format: "money" },
  { title: "转化率", metricKey: "转化率", sourceMetric: "conversionRate", targetMetricKey: "conversionRate", unit: "%", format: "percent" },
  { title: "推广花费", metricKey: "推广花费", sourceMetric: "adSpend", targetMetricKey: "adSpend", unit: "元", format: "money" },
  { title: "直接成交占比", metricKey: "直接成交占比", sourceMetric: "directTransactionShare", targetMetricKey: "directTransactionShare", unit: "%", format: "percent" },
];

const RETURN_RATE_TITLES = new Set(["退货率（总）", "发货退货率", "已签收退货率"]);
const BRAND_VISITORS_TITLE = "品牌词访客";
const BRAND_BUYERS_TITLE = "品牌词支付人数";
const GEO_SEARCH_SHARE_TITLE = "GEO搜索占比";
const BRAND_METRIC_TITLES = new Set([BRAND_VISITORS_TITLE, BRAND_BUYERS_TITLE, GEO_SEARCH_SHARE_TITLE]);
const BRAND_MODEL_PROMPT = "请先设置品牌词 / 中心词";
const BRAND_MODEL_DESCRIPTION = "品牌词 / 中心词 union 口径，同一搜索词只计一次";
const LOWER_IS_BETTER_TITLES = new Set([
  "去退费比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "MTD周转",
  "推广点击单价",
]);

const emptyChartSeries = (id: string, name: string, xAxis: string[]): ChartSeries => ({
  id,
  name,
  entityLevel: "series",
  entityId: id,
  points: xAxis.map((date) => ({ date, value: null })),
});

const finiteOrNull = (value: unknown): BIMetricValue =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const safeDivide = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const safeDividePositiveDenominator = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const sumMetric = (points: BIDataPoint[], metricKey: string): number | null => {
  let hasValue = false;
  const total = points.reduce((sum, point) => {
    const value = finiteOrNull(point.metrics[metricKey]);
    if (value === null) return sum;
    hasValue = true;
    return sum + value;
  }, 0);
  return hasValue ? total : null;
};

const aggregateMetric = (points: BIDataPoint[], sourceMetric: string | null): number | null => {
  if (sourceMetric === null) return null;
  if (sourceMetric === "gmv") return sumMetric(points, "gmv");
  if (sourceMetric === "gsv") return sumMetric(points, "gsv");
  if (sourceMetric === "visitors") return sumMetric(points, "visitors");
  if (sourceMetric === "paidBuyers") return sumMetric(points, "paidBuyers");
  if (sourceMetric === "adSpend") return sumMetric(points, "adSpend");

  const gmv = sumMetric(points, "gmv");
  const gsv = sumMetric(points, "gsv");
  const paidBuyers = sumMetric(points, "paidBuyers");
  const visitors = sumMetric(points, "visitors");
  const adSpend = sumMetric(points, "adSpend");
  const adRevenue = sumMetric(points, "adRevenue");
  const adClicks = sumMetric(points, "adClicks");
  const refundAmount = sumMetric(points, "refundAmount");
  const shippedRefundAmount = sumMetric(points, "shippedRefundAmount");
  const signedRefundAmount = sumMetric(points, "signedRefundAmount");
  const directTransactionAmount = sumMetric(points, "directTransactionAmount");
  const indirectTransactionAmount = sumMetric(points, "indirectTransactionAmount");
  const totalTransactionAmount = sumMetric(points, "totalTransactionAmount");
  const afterRefundGsv = gsv !== null && refundAmount !== null ? gsv - refundAmount : null;
  const directTransactionFallbackDenominator =
    directTransactionAmount !== null && indirectTransactionAmount !== null
      ? directTransactionAmount + indirectTransactionAmount
      : null;

  if (sourceMetric === "conversionRate") return safeDivide(paidBuyers, visitors);
  if (sourceMetric === "averageOrderValue") return safeDivide(gmv, paidBuyers);
  if (sourceMetric === "adRoi") return safeDivide(adRevenue, adSpend);
  if (sourceMetric === "cpc") return safeDivide(adSpend, adClicks);
  if (sourceMetric === "adSpendRateAfterRefund") return safeDividePositiveDenominator(adSpend, afterRefundGsv);
  if (sourceMetric === "refundRate") return safeDivide(refundAmount, gsv);
  if (sourceMetric === "shippedRefundRate") return safeDivide(shippedRefundAmount, gsv);
  if (sourceMetric === "signedRefundRate") return safeDivide(signedRefundAmount, gsv);
  if (sourceMetric === "directTransactionShare") {
    return safeDividePositiveDenominator(
      directTransactionAmount,
      totalTransactionAmount ?? directTransactionFallbackDenominator,
    );
  }
  if (sourceMetric === "seriesGmv") return gmv ?? gsv;
  if (sourceMetric === "seriesGsvOrGmv") return gsv ?? gmv;
  return null;
};

const formatNumber = (value: number | null, maximumFractionDigits = 2): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(value);

const formatValue = (value: number | null, format: MetricDefinition["format"]): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  if (format === "percent") return `${formatNumber(value * 100, 2)}%`;
  if (format === "ratio") return `${formatNumber(value, 2)}`;
  if (format === "days") return `${formatNumber(value, 2)}天`;
  return formatNumber(value, format === "integer" ? 0 : 2);
};

const formatDifference = (value: number | null, format: MetricDefinition["format"]): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatValue(value, format)}`;
};

const activeTarget = (
  source: BIHomeDataSource,
  definition: MetricDefinition,
  state: UIState,
  seriesId: string | null,
): BIHomeTargetDefinition | null => {
  if (!definition.targetMetricKey) return null;
  const periodType = state.timeRange.mode === "day" ? "daily" : state.timeRange.mode === "month" ? "monthly" : null;
  if (!periodType) return null;
  const selectedDate = state.timeRange.endDate ?? source.selectedDate;
  const periodValue = periodType === "daily" ? selectedDate : selectedMonthForBI(selectedDate);
  if (!periodValue) return null;

  return source.targets.find((target) => {
    if (target.status !== "active") return false;
    if (target.metricKey !== definition.targetMetricKey) return false;
    if (target.periodType !== periodType) return false;
    if (target.periodValue !== periodValue) return false;
    if (seriesId) return target.scope === "series" && target.seriesId === seriesId;
    return target.scope === "company" || target.scope === "store";
  }) ?? null;
};

const directionForDefinition = (definition: MetricDefinition): BIHomeTargetDefinition["direction"] =>
  LOWER_IS_BETTER_TITLES.has(definition.title) || getTargetMetricDefinitionByKey(definition.targetMetricKey ?? "")?.direction === "budget"
    ? "lower_is_better"
    : "higher_is_better";

const targetMetricValuesForState = (state: UIState): Record<string, number> => {
  const values: Record<string, number> = {};
  HOME_BI_KPI_DEFINITIONS.forEach((definition) => {
    if (!definition.targetMetricKey) return;
    const value = state.targetDrafts[definition.title] ?? state.targetDrafts[definition.targetMetricKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      values[definition.targetMetricKey] = value;
    }
  });
  return values;
};

const draftTargetForDefinition = (
  definition: MetricDefinition,
  state: UIState,
): BIHomeTargetDefinition | null => {
  const targetMetricKey = definition.targetMetricKey;
  if (!targetMetricKey) return null;
  const targetDefinition = getTargetMetricDefinitionByKey(targetMetricKey);
  if (targetDefinition?.targetRule === "unsupported") return null;
  const value = targetDefinition?.targetRule === "derived"
    ? deriveTargetMetricValue(targetMetricKey, targetMetricValuesForState(state)).value
    : finiteOrNull(state.targetDrafts[definition.title] ?? state.targetDrafts[targetMetricKey]);
  if (value === null || value <= 0) return null;
  return {
    targetId: `draft-${definition.title}`,
    scope: "company",
    platformCode: null,
    storeId: null,
    seriesId: null,
    productId: null,
    periodType: state.timeRange.mode === "day" ? "daily" : "monthly",
    periodValue: state.timeRange.endDate ?? "",
    metricKey: targetMetricKey,
    targetValue: value,
    direction: directionForDefinition(definition),
    status: "active",
  };
};

const targetProgress = (
  actual: number | null,
  target: BIHomeTargetDefinition | null,
): { progressRate: number | null; gapValue: number | null } => {
  if (actual === null || !target || !Number.isFinite(target.targetValue) || target.targetValue <= 0) {
    return { progressRate: null, gapValue: null };
  }

  if (target.direction === "higher_is_better") {
    return {
      progressRate: safeDivide(actual, target.targetValue),
      gapValue: actual - target.targetValue,
    };
  }

  return {
    progressRate: actual === 0 ? 1 : safeDivide(target.targetValue, actual),
    gapValue: target.targetValue - actual,
  };
};

const normalizeState = (state: UIState, source: BIHomeDataSource): UIState => {
  const selectedDate = source.selectedDate;
  return {
    ...state,
    timeRange: {
      ...state.timeRange,
      startDate: state.timeRange.startDate ?? selectedDate,
      endDate: state.timeRange.endDate ?? selectedDate,
    },
  };
};

const globalStateForHomeKpi = (state: UIState): UIState => ({
  ...state,
  selectedSeries: null,
});

const seriesMetricKey = (seriesId: string): BIMetricKey => `series:${seriesId}` as BIMetricKey;

const seriesMetricDefinitions = (source: BIHomeDataSource): MetricDefinition[] =>
  source.seriesDefinitions
    .slice()
    .sort((left, right) =>
      `${left.platformName ?? left.platformCode}${left.storeName ?? left.storeId}${left.seriesName}${left.seriesId}`.localeCompare(
        `${right.platformName ?? right.platformCode}${right.storeName ?? right.storeId}${right.seriesName}${right.seriesId}`,
      ),
    )
    .map((series) => ({
      title: series.seriesName,
      metricKey: seriesMetricKey(series.seriesId),
      sourceMetric: "seriesGsvOrGmv",
      targetMetricKey: "gsv",
      unit: "元",
      format: "money" as const,
      seriesId: series.seriesId,
    }));

const metricDefinitionsForSource = (source: BIHomeDataSource): MetricDefinition[] => [
  ...HOME_BI_KPI_DEFINITIONS,
  ...seriesMetricDefinitions(source),
];

const matchingSeriesById = (
  source: BIHomeDataSource,
  seriesId: string | null | undefined,
): BIHomeSeriesDefinition | null =>
  seriesId ? source.seriesDefinitions.find((series) => series.seriesId === seriesId) ?? null : null;

const filteredBasePoints = (source: BIHomeDataSource, state: UIState): BIDataPoint[] =>
  filterBIDataPoints(source.points, state);

const filteredSeriesPoints = (
  source: BIHomeDataSource,
  state: UIState,
  seriesId: string | null,
): BIDataPoint[] =>
  filterBIDataPoints(source.seriesPoints, {
    ...state,
    selectedSeries: seriesId,
  });

const effectiveSearchDate = (date: string | null, source: BIHomeDataSource): string =>
  date || source.selectedDate || "未标日期";

const searchDateInRange = (date: string | null, source: BIHomeDataSource, state: UIState): boolean => {
  const effectiveDate = effectiveSearchDate(date, source);
  if (effectiveDate === "未标日期") return true;
  if (state.timeRange.startDate && effectiveDate < state.timeRange.startDate) return false;
  if (state.timeRange.endDate && effectiveDate > state.timeRange.endDate) return false;
  return true;
};

const filteredSearchTotalKeywords = (
  source: BIHomeDataSource,
  state: UIState,
): BISearchTotalKeyword[] => {
  const selectedStores = new Set(state.selectedStores);
  return source.searchTotalKeywords.filter((row) => {
    if (state.selectedPlatform && row.platformCode !== state.selectedPlatform) return false;
    if (selectedStores.size > 0 && !selectedStores.has(row.storeId)) return false;
    return searchDateInRange(row.date, source, state);
  });
};

const filteredSearchProductKeywords = (
  source: BIHomeDataSource,
  state: UIState,
): BISearchProductKeyword[] => {
  const selectedStores = new Set(state.selectedStores);
  const excludedProductIds = new Set(state.excludedProductIds);
  return source.searchProductKeywords.filter((row) => {
    if (state.selectedPlatform && row.platformCode !== state.selectedPlatform) return false;
    if (selectedStores.size > 0 && !selectedStores.has(row.storeId)) return false;
    if (excludedProductIds.has(row.productId)) return false;
    return searchDateInRange(row.date, source, state);
  });
};

const brandMetricValue = ({
  source,
  state,
  title,
  basePoints,
}: {
  source: BIHomeDataSource;
  state: UIState;
  title: string;
  basePoints: BIDataPoint[];
}): number | null => {
  if (!BRAND_METRIC_TITLES.has(title)) return null;
  if (!hasBrandModelTokens(state.brandModelFilter)) return null;
  const aggregate = aggregateSearchTotalKeywords(filteredSearchTotalKeywords(source, state), state.brandModelFilter);
  if (title === BRAND_VISITORS_TITLE) return aggregate.visitors;
  if (title === BRAND_BUYERS_TITLE) return aggregate.buyers;
  const totalPaidBuyers = sumMetric(basePoints, "paidBuyers");
  return safeDivide(aggregate.buyers, totalPaidBuyers);
};

const brandMetricDescription = (state: UIState, value: number | null): string => {
  if (!hasBrandModelTokens(state.brandModelFilter)) return BRAND_MODEL_PROMPT;
  return value === null ? "当前搜索词数据不足，缺失值不按 0 计算" : BRAND_MODEL_DESCRIPTION;
};

const mergeDateAxis = (...dateGroups: Array<Array<string | null | undefined>>): string[] =>
  Array.from(
    new Set(
      dateGroups
        .flat()
        .filter((date): date is string => Boolean(date)),
    ),
  ).sort();

const lineFromMetricMap = ({
  id,
  name,
  xAxis,
  valuesByDate,
}: {
  id: string;
  name: string;
  xAxis: string[];
  valuesByDate: Map<string, number | null>;
}): ChartSeries => ({
  id,
  name,
  entityLevel: "series",
  entityId: id,
  points: xAxis.map((date) => ({
    date,
    value: valuesByDate.get(date) ?? null,
  })),
});

export const buildHomeBIKpiCards = (source: BIHomeDataSource, state: UIState): HomeBIKpiCard[] => {
  const normalizedState = normalizeState(state, source);
  const globalState = globalStateForHomeKpi(normalizedState);
  const basePoints = filteredBasePoints(source, globalState);
  const definitions = metricDefinitionsForSource(source);

  return definitions.map((definition) => {
    const series = matchingSeriesById(source, definition.seriesId);
    const points = series
      ? filteredSeriesPoints(source, globalState, series.seriesId)
      : basePoints;
    const actual = BRAND_METRIC_TITLES.has(definition.title)
      ? brandMetricValue({ source, state: globalState, title: definition.title, basePoints })
      : aggregateMetric(points, definition.sourceMetric);
    const targetState = series ? normalizedState : globalState;
    const targetDefinition = getTargetMetricDefinitionByKey(definition.targetMetricKey ?? "");
    const supportsPersistedTarget = targetDefinition?.targetRule === "required";
    const monthlyTarget = supportsPersistedTarget && targetState.timeRange.mode === "month"
      ? activeTarget(source, definition, targetState, series?.seriesId ?? null)
      : null;
    const periodTarget = supportsPersistedTarget ? activeTarget(source, definition, targetState, series?.seriesId ?? null) : null;
    const draftTarget = draftTargetForDefinition(definition, targetState);
    const displayTarget = draftTarget ?? periodTarget;
    const { progressRate, gapValue } = targetProgress(actual, displayTarget);
    const progress = progressRate === null ? 0 : Math.max(0, Math.min(progressRate * 100, 999));
    const hasTarget = !!displayTarget;
    const sourceStatus: HomeBIKpiCard["sourceStatus"] =
      series && series.productIds.length === 0
        ? "series_unconfigured"
        : actual === null
          ? "missing"
          : "real";
    const description =
      BRAND_METRIC_TITLES.has(definition.title)
        ? brandMetricDescription(globalState, actual)
        : sourceStatus === "series_unconfigured"
        ? "待配置系列"
        : targetDefinition?.targetRule === "unsupported"
          ? "暂不支持目标，当前仅展示实际值"
        : sourceStatus === "missing"
          ? "当前来源不足，缺失值不按 0 计算"
          : "真实导入数据";
    const card: KPICard = {
      id: definition.seriesId ? `home-bi-kpi-series-${definition.seriesId}` : `home-bi-kpi-${definition.title}`,
      metricKey: definition.metricKey,
      title: definition.title,
      value: sourceStatus === "series_unconfigured" ? "--" : formatValue(actual, definition.format),
      rawValue: actual,
      tone: actual === null ? "neutral" : "positive",
      linkedChartSeriesIds: series?.seriesId ? [series.seriesId] : [],
      linkedSeriesIds: series?.seriesId ? [series.seriesId] : [],
      description,
    };

    return {
      ...card,
      mtdTarget: (draftTarget ?? monthlyTarget) ? formatValue((draftTarget ?? monthlyTarget)?.targetValue ?? null, definition.format) : "--",
      totalTarget: displayTarget ? formatValue(displayTarget.targetValue, definition.format) : "--",
      difference: hasTarget ? formatDifference(gapValue, definition.format) : "--",
      completionRate: progressRate === null ? "--" : formatValue(progressRate, "percent"),
      progress,
      statusTone: progressRate !== null && progressRate >= 1 ? "green" : "red",
      unit: definition.unit,
      coreSeriesId: series?.seriesId ?? null,
      sourceStatus,
    };
  });
};

const datesForPoints = (points: BIDataPoint[]): string[] =>
  Array.from(new Set(points.map((point) => point.businessDate).filter(Boolean))).sort();

const pointsForDate = (points: BIDataPoint[], date: string): BIDataPoint[] =>
  points.filter((point) => point.businessDate === date);

const lineFromPoints = ({
  id,
  name,
  points,
  metric,
  xAxis,
}: {
  id: string;
  name: string;
  points: BIDataPoint[];
  metric: string | null;
  xAxis: string[];
}): ChartSeries => ({
  id,
  name,
  entityLevel: "series",
  entityId: id,
  points: xAxis.map((date) => ({
    date,
    value: aggregateMetric(pointsForDate(points, date), metric),
  })),
});

const buildHomeBrandTrendChart = (
  source: BIHomeDataSource,
  state: UIState,
  title: string,
  mode: HomeBIChartMode,
): ChartModel => {
  const globalState = globalStateForHomeKpi(state);
  const basePoints = filteredBasePoints(source, globalState);
  const totalRows = filteredSearchTotalKeywords(source, globalState);
  const productRows = filteredSearchProductKeywords(source, globalState);
  const filter = globalState.brandModelFilter;
  const metric = title === BRAND_VISITORS_TITLE ? "visitors" : "buyers";

  if (title === GEO_SEARCH_SHARE_TITLE) {
    const brandBuyersByDate = aggregateSearchTotalMetricByDate(totalRows, filter, source.selectedDate, "buyers");
    const xAxis = mergeDateAxis(Array.from(brandBuyersByDate.keys()), datesForPoints(basePoints));
    const geoByDate = new Map(
      xAxis.map((date) => [
        date,
        safeDivide(brandBuyersByDate.get(date) ?? null, sumMetric(pointsForDate(basePoints, date), "paidBuyers")),
      ]),
    );
    return chartWithLines({
      id: `home-bi-chart-brand-geo-${mode}`,
      metricKey: state.selectedMetric,
      title: `${GEO_SEARCH_SHARE_TITLE} · 品牌词占比趋势`,
      xAxis,
      lines: [
        lineFromMetricMap({
          id: "geo-search-share",
          name: GEO_SEARCH_SHARE_TITLE,
          xAxis,
          valuesByDate: geoByDate,
        }),
      ],
    });
  }

  const totalByDate = aggregateSearchTotalMetricByDate(totalRows, filter, source.selectedDate, metric);
  const centerWordValueMaps = (normalizeBrandModelFilter(filter).centerWordGroups ?? [])
    .slice(0, 3)
    .map((group) => ({
      group,
      valuesByDate: aggregateSearchTotalMetricByDate(totalRows, centerWordFilter(group), source.selectedDate, metric),
    }));
  const seriesValueMaps = source.seriesDefinitions
    .slice()
    .sort((left, right) => left.seriesName.localeCompare(right.seriesName))
    .slice(0, 3)
    .map((series) => ({
      series,
      valuesByDate: aggregateSearchProductMetricByDate(productRows, filter, series.productIds, source.selectedDate, metric),
    }));
  const xAxis = mergeDateAxis(
    Array.from(totalByDate.keys()),
    ...centerWordValueMaps.map((item) => Array.from(item.valuesByDate.keys())),
    ...seriesValueMaps.map((item) => Array.from(item.valuesByDate.keys())),
  );
  const lines: ChartSeries[] = [
    lineFromMetricMap({
      id: "brand-total",
      name: "品牌词合计",
      xAxis,
      valuesByDate: totalByDate,
    }),
    ...centerWordValueMaps.map((item) =>
      lineFromMetricMap({
        id: `center-word-${item.group.id}`,
        name: `中心词-${item.group.centerWord}`,
        xAxis,
        valuesByDate: item.valuesByDate,
      }),
    ),
    ...seriesValueMaps.map((item) =>
      lineFromMetricMap({
        id: `brand-series-${item.series.seriesId}`,
        name: `品牌词-${item.series.seriesName}`,
        xAxis,
        valuesByDate: item.valuesByDate,
      }),
    ),
  ];

  return chartWithLines({
    id: `home-bi-chart-brand-${title}-${mode}`,
    metricKey: state.selectedMetric,
    title: `${title} · 品牌词趋势对比`,
    xAxis,
    lines,
  });
};

const chartTitle = (source: BIHomeDataSource, state: UIState, mode: HomeBIChartMode): string => {
  const selectedSeries = matchingSeriesById(source, state.selectedSeries);
  const metric = selectedSeries?.seriesName ?? String(state.selectedMetric);
  const suffix = mode === "mtd" ? "MTD计划 VS 实际" : "DLY日维度参考";
  if (RETURN_RATE_TITLES.has(metric)) return `${metric} · 多退货率趋势对比`;
  if (selectedSeries) return `${metric} · 平台系列销售对比`;
  return `${metric} · ${suffix}`;
};

const chartWithLines = ({
  id,
  metricKey,
  title,
  xAxis,
  lines,
}: {
  id: string;
  metricKey: BIMetricKey;
  title: string;
  xAxis: string[];
  lines: ChartSeries[];
}): ChartModel => ({
  id,
  metricKey,
  title,
  xAxis,
  series: lines,
  lines,
  empty: xAxis.length === 0 || lines.every((line) => line.points.every((point) => point.value === null)),
});

export const buildHomeBIChartModel = (
  source: BIHomeDataSource,
  state: UIState,
  mode: HomeBIChartMode,
): ChartModel => {
  const normalizedState = normalizeState(state, source);
  const globalState = globalStateForHomeKpi(normalizedState);
  const definitions = metricDefinitionsForSource(source);
  const selectedSeries = matchingSeriesById(source, normalizedState.selectedSeries);
  const selectedTitle = selectedSeries?.seriesName ?? String(normalizedState.selectedMetric);
  const definition = definitions.find((item) => item.metricKey === normalizedState.selectedMetric)
    ?? HOME_BI_KPI_DEFINITIONS[0];

  if (RETURN_RATE_TITLES.has(selectedTitle)) {
    const points = filteredBasePoints(source, globalState);
    const xAxis = datesForPoints(points);
    const lines = [
      lineFromPoints({ id: "return-total", name: "总退货率", points, metric: "refundRate", xAxis }),
      lineFromPoints({ id: "return-shipped", name: "发货退货率", points, metric: "shippedRefundRate", xAxis }),
      lineFromPoints({ id: "return-signed", name: "已签收退货率", points, metric: "signedRefundRate", xAxis }),
    ];
    return chartWithLines({
      id: `home-bi-chart-${selectedTitle}-${mode}`,
      metricKey: normalizedState.selectedMetric,
      title: chartTitle(source, normalizedState, mode),
      xAxis,
      lines,
    });
  }

  if (BRAND_METRIC_TITLES.has(selectedTitle)) {
    return buildHomeBrandTrendChart(source, normalizedState, selectedTitle, mode);
  }

  if (selectedSeries) {
    const seriesPoints = filteredSeriesPoints(source, normalizedState, selectedSeries.seriesId);
    const xAxis = datesForPoints(seriesPoints);
    const lines = PLATFORM_ORDER.map((platformCode) =>
      lineFromPoints({
        id: `${platformCode}-${selectedTitle}`,
        name: `${PLATFORM_LABELS[platformCode]}-${selectedTitle}`,
        points: seriesPoints.filter((point) => point.platformCode === platformCode),
        metric: "seriesGsvOrGmv",
        xAxis,
      }),
    );
    return chartWithLines({
      id: `home-bi-chart-${selectedTitle}-${mode}`,
      metricKey: normalizedState.selectedMetric,
      title: chartTitle(source, normalizedState, mode),
      xAxis,
      lines,
    });
  }

  const points = filteredBasePoints(source, globalState);
  const xAxis = datesForPoints(points);
  const actualLine = lineFromPoints({
    id: "actual",
    name: "实际",
    points,
    metric: definition.sourceMetric,
    xAxis,
  });
  const targetDefinition = getTargetMetricDefinitionByKey(definition.targetMetricKey ?? "");
  const target = draftTargetForDefinition(definition, globalState)
    ?? (targetDefinition?.targetRule === "required" ? activeTarget(source, definition, globalState, null) : null);
  const targetLine: ChartSeries | null = target
    ? {
      id: "target",
      name: "目标",
      entityLevel: "series",
      entityId: "target",
      points: xAxis.map((date) => ({ date, value: target.targetValue })),
    }
    : null;

  return chartWithLines({
    id: `home-bi-chart-${selectedTitle}-${mode}`,
    metricKey: normalizedState.selectedMetric,
    title: chartTitle(source, normalizedState, mode),
    xAxis,
    lines: targetLine ? [actualLine, targetLine] : [actualLine],
  });
};

export const buildHomeBIViewModel = (
  source: BIHomeDataSource,
  state: UIState,
): HomeBIViewModel => {
  const normalizedState = normalizeState(state, source);
  const globalState = globalStateForHomeKpi(normalizedState);
  const kpiCards = buildHomeBIKpiCards(source, normalizedState);
  const selectedKpi = kpiCards.find((card) => card.metricKey === normalizedState.selectedMetric) ?? kpiCards[0];
  const mtdChartModel = buildHomeBIChartModel(source, normalizedState, "mtd");
  const dlyChartModel = buildHomeBIChartModel(source, normalizedState, "dly");
  const basePoints = filteredBasePoints(source, globalState);
  const seriesPoints = filterBIDataPoints(source.seriesPoints, globalState);

  return {
    state: normalizedState,
    selectedStores: normalizedState.selectedStores,
    selectedPlatforms: normalizedState.selectedPlatform ? [normalizedState.selectedPlatform] : [],
    selectedSeries: normalizedState.selectedSeries,
    timeRange: normalizedState.timeRange,
    kpiCards,
    selectedKpi,
    mtdChartModel,
    dlyChartModel,
    chartModel: mtdChartModel,
    platformSummary: buildPlatformAggs(basePoints),
    seriesSummary: buildSeriesAggs(seriesPoints),
    dataStatus: source.dataStatus,
    safeWarnings: source.safeWarnings,
    notices: source.notices,
    isEmpty: source.points.length === 0,
    isCorrupted: source.mode === "corrupted" || source.mode === "error",
  };
};
