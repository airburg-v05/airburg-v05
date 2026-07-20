import dataContract from "@/docs/project/V2_HOME_DATA_CONTRACT.json";
import {
  buildHomeBIViewModel,
  type HomeBIKpiCard,
} from "@/lib/bi/bi.home-view-model";
import {
  loadHomeBIDataSource,
  type BIHomeDataSource,
  type BIHomeSeriesDefinition,
} from "@/lib/bi/bi.data-source";
import { createDefaultBIState } from "@/lib/bi/bi.store";
import type { BIDataPoint, BITimeRange, UIState } from "@/lib/bi/bi.types";
import {
  deriveTargetMetricValue,
  getTargetMetricDefinitionByKey,
} from "@/lib/bi/target-metric-definitions";
import type { BrandModelFilter } from "@/lib/bi/search-keyword.types";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  saveCrossPageDebugContextPatch,
  type DebugContextTempSeriesItem,
} from "@/lib/persistence/debug-context-persistence";
import { loadActiveRuntimeDatasetSnapshot } from "@/lib/persistence/runtime-dataset-persistence";
import { loadActiveTargetDrafts } from "@/lib/persistence/target-drafts-persistence";
import type { TargetDraftRecord } from "@/lib/persistence/target-drafts-persistence.types";
import {
  ALLOWED_PLATFORM_CODES,
  type PlatformCode,
  type StoreScope,
} from "@/lib/v05/domain/models";
import {
  V2_HOME_METRIC_KEYS,
  type V2HomeChartMode,
  type V2HomeChartPair,
  type V2HomeComparisonMode,
  type V2HomeContextPatch,
  type V2HomeDataHealthSummary,
  type V2HomeLoadOptions,
  type V2HomeLoadResult,
  type V2HomeMetricAvailability,
  type V2HomeMetricCard,
  type V2HomeMetricContract,
  type V2HomeMetricFormat,
  type V2HomeMetricKey,
  type V2HomeMetricSourceStatus,
  type V2HomeReconciliationSummary,
  type V2HomeScope,
  type V2HomeSeriesGsvCard,
  type V2HomeTargetOverlay,
  type V2HomeTargetRule,
  type V2HomeTimeRange,
  type V2HomeTimeRangeMode,
  type V2HomeViewModel,
} from "@/types/v2/home";

type ContractMetricRow = {
  metricKey: string;
  displayName: string;
  unit: string;
  format: string;
  availability: string;
  semanticStatus: string;
};

const CONTRACT_ROWS = dataContract.metrics as ContractMetricRow[];

const LEGACY_TITLE_BY_KEY: Partial<Record<V2HomeMetricKey, string>> = {
  gmv: "GMV",
  gsv: "GSV",
  adRoi: "投入产出比",
  adSpendRateAfterRefund: "去退费比",
  directTransactionShare: "直接成交占比",
  brandVisitors: "品牌词访客",
  brandPaidBuyers: "品牌词支付人数",
  refundRate: "退货率（总）",
  shippedRefundRate: "发货退货率",
  signedRefundRate: "已签收退货率",
  averageOrderValue: "客单价",
  conversionRate: "转化率",
  adSpend: "推广花费",
  cpc: "推广点击单价",
  mtdTurnover: "MTD周转",
  regionalFulfillmentRate: "同区履约率",
};

const PLATFORM_LABELS: Record<string, string> = {
  tmall: "天猫",
  jd: "京东",
  douyin: "抖音",
  pdd: "拼多多",
  youzan: "有赞",
};

const DEFAULT_BRAND_FILTER: BrandModelFilter = {
  brandWords: ["空气堡", "Airburg", "AIRBURG"],
  modelWords: [],
  centerWordGroups: [],
};

const SAFE_SKIPPED_CODE_PATTERN = /unsupported|unrecognized|unknown_source|skipped/i;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_DAYS = 366;

const hasBrandFilter = (filter: BrandModelFilter | undefined): boolean =>
  Boolean(
    filter &&
      (filter.brandWords.length > 0 ||
        filter.modelWords.length > 0 ||
        (filter.centerWordGroups?.length ?? 0) > 0),
  );

const isMetricFormat = (value: string): value is V2HomeMetricFormat =>
  value === "money" || value === "integer" || value === "percent" || value === "ratio" || value === "days";

const isAvailability = (value: string): value is V2HomeMetricAvailability =>
  value === "AVAILABLE" ||
  value === "AVAILABLE_WITH_BRAND_FILTER" ||
  value === "PENDING_IMPLEMENTATION" ||
  value === "UNAVAILABLE";

export const V2_HOME_METRIC_CONTRACTS: V2HomeMetricContract[] = V2_HOME_METRIC_KEYS.map((metricKey) => {
  const row = CONTRACT_ROWS.find((item) => item.metricKey === metricKey);
  if (!row || !isMetricFormat(row.format) || !isAvailability(row.availability)) {
    throw new Error(`v2_home_metric_contract_invalid:${metricKey}`);
  }
  return {
    metricKey,
    title: row.displayName,
    unit: row.unit,
    format: row.format,
    availability: row.availability,
    semanticStatus: row.semanticStatus,
  };
});

export const V2_HOME_CHART_PAIRS: V2HomeChartPair[] = [
  {
    id: "gmv-gsv",
    label: "GMV vs GSV",
    leftMetricKey: "gmv",
    rightMetricKey: "gsv",
    leftLabel: "GMV",
    rightLabel: "GSV",
    leftUnit: "元",
    rightUnit: "元",
    dualAxis: false,
  },
  {
    id: "gsv-ad-spend",
    label: "GSV vs 推广花费",
    leftMetricKey: "gsv",
    rightMetricKey: "adSpend",
    leftLabel: "GSV",
    rightLabel: "推广花费",
    leftUnit: "元",
    rightUnit: "元",
    dualAxis: false,
  },
  {
    id: "ad-spend-roi",
    label: "推广花费 vs ROI",
    leftMetricKey: "adSpend",
    rightMetricKey: "adRoi",
    leftLabel: "推广花费",
    rightLabel: "ROI",
    leftUnit: "元",
    rightUnit: "倍",
    dualAxis: true,
  },
  {
    id: "refund-rate-spend-rate",
    label: "退货率 vs 去退费比",
    leftMetricKey: "refundRate",
    rightMetricKey: "adSpendRateAfterRefund",
    leftLabel: "退货率",
    rightLabel: "去退费比",
    leftUnit: "%",
    rightUnit: "%",
    dualAxis: false,
  },
  {
    id: "refund-stage-rates",
    label: "发货退货率 vs 已签收退货率",
    leftMetricKey: "shippedRefundRate",
    rightMetricKey: "signedRefundRate",
    leftLabel: "发货退货率",
    rightLabel: "已签收退货率",
    leftUnit: "%",
    rightUnit: "%",
    dualAxis: false,
  },
  {
    id: "brand-visitors-buyers",
    label: "品牌词访客 vs 品牌词支付人数",
    leftMetricKey: "brandVisitors",
    rightMetricKey: "brandPaidBuyers",
    leftLabel: "品牌词访客",
    rightLabel: "品牌词支付人数",
    leftUnit: "人",
    rightUnit: "人",
    dualAxis: false,
  },
];

const parseDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (value: string, days: number): string => {
  const date = parseDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const inclusiveDayCount = (startDate: string, endDate: string): number => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
};

export const validateV2HomeTimeRange = (range: V2HomeTimeRange): string | null => {
  if (!parseDate(range.startDate) || !parseDate(range.endDate)) return "请选择完整的开始和结束日期。";
  if (range.startDate > range.endDate) return "开始日期不能晚于结束日期。";
  if (inclusiveDayCount(range.startDate, range.endDate) > MAX_CUSTOM_RANGE_DAYS) {
    return "自定义时间范围最长 1 年。";
  }
  return null;
};

export const resolveV2HomeTimeRangePreset = (
  mode: V2HomeTimeRangeMode,
  datasetRange: { startDate: string; endDate: string },
  currentRange?: V2HomeTimeRange,
): V2HomeTimeRange => {
  const anchor = datasetRange.endDate;
  const anchorDate = parseDate(anchor);
  if (!anchorDate || mode === "custom") {
    return currentRange ?? { mode: "custom", ...datasetRange };
  }
  if (mode === "day") return { mode, startDate: anchor, endDate: anchor };
  if (mode === "week") {
    const day = anchorDate.getUTCDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    return {
      mode,
      startDate: addDays(anchor, -daysFromMonday),
      endDate: addDays(anchor, 6 - daysFromMonday),
    };
  }
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const nextMonth = new Date(`${monthStart}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  return { mode, startDate: monthStart, endDate: formatDate(nextMonth) };
};

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const formatNumber = (value: number, maximumFractionDigits: number): string =>
  new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);

export const formatV2HomeMetricValue = (
  value: number | null,
  format: V2HomeMetricFormat,
  signed = false,
): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const sign = signed && value > 0 ? "+" : "";
  if (format === "percent") return `${sign}${formatNumber(value * 100, 2)}%`;
  if (format === "ratio") return `${sign}${formatNumber(value, 2)}`;
  if (format === "days") return `${sign}${formatNumber(value, 2)}天`;
  return `${sign}${formatNumber(value, format === "integer" ? 0 : 2)}`;
};

const uniqueText = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();

const debugSeriesDefinitions = (items: DebugContextTempSeriesItem[]): BIHomeSeriesDefinition[] => {
  const groups = new Map<string, BIHomeSeriesDefinition>();
  items.forEach((item) => {
    const platformCode = item.platformCode.trim() || "tmall";
    const storeId = item.storeId.trim();
    const seriesName = item.seriesName.trim();
    const seriesId = (item.seriesId || item.id || seriesName).trim();
    const productId = item.productId.trim();
    if (!storeId || !seriesName || !seriesId || !productId) return;
    const key = `${platformCode}:${storeId}:${seriesId}`;
    const current = groups.get(key);
    if (current) {
      current.productIds = uniqueText([...current.productIds, productId]);
      return;
    }
    groups.set(key, {
      platformCode,
      platformName: item.platformName || PLATFORM_LABELS[platformCode] || platformCode,
      storeId,
      storeName: item.storeName || storeId,
      seriesId,
      seriesName,
      productIds: [productId],
    });
  });
  return Array.from(groups.values()).sort((left, right) =>
    `${left.storeName}${left.seriesName}`.localeCompare(`${right.storeName}${right.seriesName}`),
  );
};

const seriesPointsForDefinitions = (
  points: BIDataPoint[],
  definitions: BIHomeSeriesDefinition[],
): BIDataPoint[] =>
  points.flatMap((point) =>
    definitions
      .filter(
        (series) =>
          series.platformCode === point.platformCode &&
          series.storeId === point.storeId &&
          Boolean(point.productId) &&
          series.productIds.includes(point.productId ?? ""),
      )
      .map((series) => ({ ...point, seriesId: series.seriesId, seriesName: series.seriesName })),
  );

const mergeDebugSeries = (
  source: BIHomeDataSource,
  items: DebugContextTempSeriesItem[],
): BIHomeDataSource => {
  const definitions = [...debugSeriesDefinitions(items), ...source.seriesDefinitions].reduce<BIHomeSeriesDefinition[]>(
    (result, item) => {
      const key = `${item.platformCode}:${item.storeId}:${item.seriesId}`;
      if (!result.some((current) => `${current.platformCode}:${current.storeId}:${current.seriesId}` === key)) {
        result.push({ ...item, productIds: uniqueText(item.productIds) });
      }
      return result;
    },
    [],
  );
  return {
    ...source,
    seriesDefinitions: definitions,
    seriesPoints: seriesPointsForDefinitions(source.points, definitions),
  };
};

const pointHasOperatingMetric = (point: BIDataPoint): boolean =>
  [
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
  ].some((key) => finiteOrNull(point.metrics[key]) !== null);

const businessDatesFromSource = (source: BIHomeDataSource): string[] =>
  Array.from(
    new Set(
      source.points
        .filter(pointHasOperatingMetric)
        .map((point) => point.businessDate)
        .filter(Boolean),
    ),
  ).sort();

const hasRangeOverlap = (
  range: Pick<V2HomeTimeRange, "startDate" | "endDate">,
  datasetRange: { startDate: string; endDate: string },
): boolean => range.endDate >= datasetRange.startDate && range.startDate <= datasetRange.endDate;

const normalizeSelectedRange = (
  candidate: V2HomeTimeRange | null,
  datasetRange: { startDate: string; endDate: string },
): V2HomeTimeRange => {
  if (!candidate || validateV2HomeTimeRange(candidate) || !hasRangeOverlap(candidate, datasetRange)) {
    return { mode: "custom", ...datasetRange };
  }
  return candidate;
};

const isPlatformCode = (value: string): value is PlatformCode =>
  (ALLOWED_PLATFORM_CODES as readonly string[]).includes(value);

const buildScope = (
  source: BIHomeDataSource,
  selectedPlatformInput: string | null | undefined,
  selectedStoreInput: string[] | undefined,
): V2HomeScope => {
  const canonicalStoreScopes = Array.from(
    source.points.reduce((result, point) => {
      if (!point.storeId || !isPlatformCode(point.platformCode)) return result;
      const key = `${point.platformCode}:${point.storeId}`;
      if (!result.has(key)) {
        result.set(key, { platformCode: point.platformCode, storeId: point.storeId } satisfies StoreScope);
      }
      return result;
    }, new Map<string, StoreScope>()),
  ).map(([, scope]) => scope);

  const platforms = uniqueText(canonicalStoreScopes.map((scope) => scope.platformCode));
  const selectedPlatform = selectedPlatformInput && platforms.includes(selectedPlatformInput)
    ? selectedPlatformInput
    : platforms.length === 1
      ? platforms[0]
      : null;
  const storeScopes = canonicalStoreScopes.filter(
    (scope) => !selectedPlatform || scope.platformCode === selectedPlatform,
  );
  const availableStoreIds = storeScopes.map((scope) => scope.storeId);
  const validRequestedStores = uniqueText(selectedStoreInput ?? []).filter((storeId) => availableStoreIds.includes(storeId));
  const selectedStoreIds = validRequestedStores.length > 0 ? validRequestedStores : availableStoreIds;

  const pointForStore = (scope: StoreScope): BIDataPoint | undefined =>
    source.points.find(
      (point) => point.platformCode === scope.platformCode && point.storeId === scope.storeId,
    );

  return {
    brandId: "airburg",
    brandName: "空气堡",
    selectedPlatform,
    selectedStoreIds,
    platformOptions: platforms.map((platformCode) => ({
      id: platformCode,
      label: PLATFORM_LABELS[platformCode] ?? platformCode,
      platformCode,
      storeId: null,
    })),
    storeOptions: storeScopes.map((scope) => ({
      id: scope.storeId,
      label: pointForStore(scope)?.storeName?.trim() || scope.storeId,
      platformCode: scope.platformCode,
      storeId: scope.storeId,
    })),
  };
};

const stateForScopeAndRange = ({
  scope,
  range,
  baseState,
  targetDrafts,
}: {
  scope: V2HomeScope;
  range: V2HomeTimeRange;
  baseState: UIState;
  targetDrafts: Record<string, number>;
}): UIState => ({
  ...baseState,
  selectedPlatform: scope.selectedPlatform,
  selectedStores: scope.selectedStoreIds,
  selectedSeries: null,
  selectedMetric: "GMV",
  timeRange: {
    mode: range.mode,
    startDate: range.startDate,
    endDate: range.endDate,
  },
  targetDrafts,
  brandModelFilter: hasBrandFilter(baseState.brandModelFilter)
    ? baseState.brandModelFilter
    : DEFAULT_BRAND_FILTER,
});

const monthForRange = (range: V2HomeTimeRange): string => range.endDate.slice(0, 7);

const targetMonthForRange = (range: V2HomeTimeRange): string | null => {
  const startMonth = range.startDate.slice(0, 7);
  const endMonth = range.endDate.slice(0, 7);
  return startMonth === endMonth ? endMonth : null;
};

const recordsToDraftMap = (records: TargetDraftRecord[]): Record<string, number> => {
  const values: Record<string, number> = {};
  records.forEach((record) => {
    const definition = getTargetMetricDefinitionByKey(record.metricKey);
    if (!definition || record.status !== "active") return;
    values[record.metricKey] = record.targetValue;
    values[definition.title] = record.targetValue;
  });
  return values;
};

const loadPlatformTargetRecords = async (
  scope: V2HomeScope,
  range: V2HomeTimeRange,
): Promise<TargetDraftRecord[]> => {
  if (!scope.selectedPlatform || scope.selectedStoreIds.length !== 1) return [];
  const targetMonth = targetMonthForRange(range);
  if (!targetMonth) return [];
  const result = await loadActiveTargetDrafts({
    scope: "platform",
    platformCode: scope.selectedPlatform,
    storeId: scope.selectedStoreIds[0],
    month: targetMonth,
  });
  return result.status === "ok" ? result.records : [];
};

const targetRuleForMetric = (metricKey: V2HomeMetricKey): V2HomeTargetRule => {
  if (metricKey === "brandKeywordPaidShare") return "unsupported";
  return getTargetMetricDefinitionByKey(metricKey)?.targetRule ?? "unsupported";
};

const targetRawValue = (
  metricKey: V2HomeMetricKey,
  targetDrafts: Record<string, number>,
): number | null => {
  const rule = targetRuleForMetric(metricKey);
  if (rule === "unsupported") return null;
  if (rule === "derived") return finiteOrNull(deriveTargetMetricValue(metricKey, targetDrafts).value);
  return finiteOrNull(targetDrafts[metricKey]);
};

const targetMonthBounds = (month: string): { startDate: string; endDate: string } => {
  const startDate = `${month}-01`;
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return { startDate, endDate: formatDate(date) };
};

const mtdTargetRawValue = (
  targetValue: number | null,
  month: string,
  range: V2HomeTimeRange,
): number | null => {
  if (targetValue === null || targetValue <= 0) return null;
  const monthRange = targetMonthBounds(month);
  const overlapStart = range.startDate > monthRange.startDate ? range.startDate : monthRange.startDate;
  const overlapEnd = range.endDate < monthRange.endDate ? range.endDate : monthRange.endDate;
  const overlapDays = inclusiveDayCount(overlapStart, overlapEnd);
  const monthDays = inclusiveDayCount(monthRange.startDate, monthRange.endDate);
  if (overlapDays <= 0 || monthDays <= 0) return null;
  return targetValue * (overlapDays / monthDays);
};

const targetOverlayForMetric = ({
  contract,
  legacyCard,
  targetDrafts,
  range,
}: {
  contract: V2HomeMetricContract;
  legacyCard: HomeBIKpiCard | null;
  targetDrafts: Record<string, number>;
  range: V2HomeTimeRange;
}): V2HomeTargetOverlay => {
  const rule = targetRuleForMetric(contract.metricKey);
  const totalRaw = targetRawValue(contract.metricKey, targetDrafts);
  const mtdRaw = mtdTargetRawValue(totalRaw, monthForRange(range), range);
  const hasTarget = totalRaw !== null;
  return {
    rule,
    mtdTarget: formatV2HomeMetricValue(mtdRaw, contract.format),
    totalTarget: formatV2HomeMetricValue(totalRaw, contract.format),
    difference: hasTarget ? legacyCard?.difference ?? "--" : "--",
    completionRate: hasTarget ? legacyCard?.completionRate ?? "--" : "--",
    progress: hasTarget && legacyCard && legacyCard.completionRate !== "--"
      ? Math.max(0, Math.min(100, legacyCard.progress))
      : null,
  };
};

const sourceStatusForMetric = (
  contract: V2HomeMetricContract,
  actual: number | null,
): V2HomeMetricSourceStatus => {
  if (contract.availability === "PENDING_IMPLEMENTATION") return "pending";
  if (contract.availability === "UNAVAILABLE") return "unavailable";
  return actual === null ? "missing" : "real";
};

const noteForMetric = (
  contract: V2HomeMetricContract,
  sourceStatus: V2HomeMetricSourceStatus,
): string | null => {
  if (contract.metricKey === "brandKeywordPaidShare") {
    return "指标语义已确定，数据实现待后续专门任务完成。";
  }
  if (sourceStatus === "unavailable") return "当前数据源暂不支持此指标。";
  if (sourceStatus === "missing" && contract.availability === "AVAILABLE_WITH_BRAND_FILTER") {
    return "当前品牌搜索资产未命中可用数据。";
  }
  if (sourceStatus === "missing") return "当前范围暂无可计算数据。";
  return null;
};

const metricCards = ({
  source,
  state,
  range,
  targetDrafts,
}: {
  source: BIHomeDataSource;
  state: UIState;
  range: V2HomeTimeRange;
  targetDrafts: Record<string, number>;
}): V2HomeMetricCard[] => {
  const viewModel = buildHomeBIViewModel(source, state);
  return V2_HOME_METRIC_CONTRACTS.map((contract) => {
    const legacyTitle = LEGACY_TITLE_BY_KEY[contract.metricKey];
    const legacyCard = legacyTitle
      ? viewModel.kpiCards.find((card) => !card.coreSeriesId && card.title === legacyTitle) ?? null
      : null;
    const actual = contract.availability === "PENDING_IMPLEMENTATION" || contract.availability === "UNAVAILABLE"
      ? null
      : finiteOrNull(legacyCard?.rawValue);
    const sourceStatus = sourceStatusForMetric(contract, actual);
    return {
      ...contract,
      actual: formatV2HomeMetricValue(actual, contract.format),
      actualRaw: actual,
      sourceStatus,
      note: noteForMetric(contract, sourceStatus),
      target: targetOverlayForMetric({ contract, legacyCard, targetDrafts, range }),
    };
  });
};

const metricsByKeyForRange = (
  source: BIHomeDataSource,
  state: UIState,
  range: V2HomeTimeRange,
): Map<V2HomeMetricKey, number | null> => {
  const viewModel = buildHomeBIViewModel(source, {
    ...state,
    timeRange: {
      mode: range.mode,
      startDate: range.startDate,
      endDate: range.endDate,
    },
    targetDrafts: {},
  });
  return new Map(
    V2_HOME_METRIC_CONTRACTS.map((contract) => {
      if (contract.availability === "PENDING_IMPLEMENTATION" || contract.availability === "UNAVAILABLE") {
        return [contract.metricKey, null] as const;
      }
      const title = LEGACY_TITLE_BY_KEY[contract.metricKey];
      const card = title
        ? viewModel.kpiCards.find((item) => !item.coreSeriesId && item.title === title)
        : null;
      return [contract.metricKey, finiteOrNull(card?.rawValue)] as const;
    }),
  );
};

const chartModel = ({
  source,
  state,
  datasetDates,
  selectedRange,
  chartMode,
  chartPairId,
}: {
  source: BIHomeDataSource;
  state: UIState;
  datasetDates: string[];
  selectedRange: V2HomeTimeRange;
  chartMode: V2HomeChartMode;
  chartPairId: string | undefined;
}) => {
  const pair = V2_HOME_CHART_PAIRS.find((item) => item.id === chartPairId) ?? V2_HOME_CHART_PAIRS[0];
  const dates = datasetDates.filter(
    (date) => date >= selectedRange.startDate && date <= selectedRange.endDate,
  );
  const points = dates.map((date) => {
    const range: V2HomeTimeRange = chartMode === "mtd"
      ? { ...selectedRange, endDate: date }
      : { mode: "day", startDate: date, endDate: date };
    const values = metricsByKeyForRange(source, state, range);
    const leftValue = values.get(pair.leftMetricKey) ?? null;
    const rightValue = values.get(pair.rightMetricKey) ?? null;
    const leftContract = V2_HOME_METRIC_CONTRACTS.find((item) => item.metricKey === pair.leftMetricKey)!;
    const rightContract = V2_HOME_METRIC_CONTRACTS.find((item) => item.metricKey === pair.rightMetricKey)!;
    return {
      date,
      dateLabel: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
      leftValue,
      rightValue,
      leftFormatted: formatV2HomeMetricValue(leftValue, leftContract.format),
      rightFormatted: formatV2HomeMetricValue(rightValue, rightContract.format),
    };
  });
  return {
    mode: chartMode,
    pair,
    availablePairs: V2_HOME_CHART_PAIRS,
    points,
    empty: points.length === 0 || points.every((point) => point.leftValue === null && point.rightValue === null),
  };
};

const seriesCards = async ({
  source,
  state,
  scope,
  range,
}: {
  source: BIHomeDataSource;
  state: UIState;
  scope: V2HomeScope;
  range: V2HomeTimeRange;
}): Promise<V2HomeSeriesGsvCard[]> => {
  const eligibleDefinitions = source.seriesDefinitions
    .filter(
      (series) =>
        (!scope.selectedPlatform || series.platformCode === scope.selectedPlatform) &&
        scope.selectedStoreIds.includes(series.storeId) &&
        series.productIds.length > 0,
    )
    .slice(0, 5);
  if (eligibleDefinitions.length === 0) return [];

  const actualViewModel = buildHomeBIViewModel(source, { ...state, targetDrafts: {} });
  return Promise.all(
    eligibleDefinitions.map(async (series) => {
      const targetMonth = targetMonthForRange(range);
      const targetResult = targetMonth
        ? await loadActiveTargetDrafts({
            scope: "series",
            platformCode: series.platformCode,
            storeId: series.storeId,
            seriesId: series.seriesId,
            month: targetMonth,
          })
        : null;
      const targetDrafts = targetResult?.status === "ok" ? recordsToDraftMap(targetResult.records) : {};
      const targetViewModel = buildHomeBIViewModel(source, { ...state, targetDrafts });
      const actualCard = actualViewModel.kpiCards.find((card) => card.coreSeriesId === series.seriesId) ?? null;
      const targetCard = targetViewModel.kpiCards.find((card) => card.coreSeriesId === series.seriesId) ?? null;
      const totalTarget = finiteOrNull(targetDrafts.gsv);
      const mtdTarget = targetMonth ? mtdTargetRawValue(totalTarget, targetMonth, range) : null;
      return {
        seriesId: series.seriesId,
        seriesName: series.seriesName,
        href: `/v2/series-board?seriesId=${encodeURIComponent(series.seriesId)}`,
        actual: formatV2HomeMetricValue(finiteOrNull(actualCard?.rawValue), "money"),
        actualRaw: finiteOrNull(actualCard?.rawValue),
        mtdTarget: formatV2HomeMetricValue(mtdTarget, "money"),
        totalTarget: formatV2HomeMetricValue(totalTarget, "money"),
        difference: totalTarget !== null ? targetCard?.difference ?? "--" : "--",
        completionRate: totalTarget !== null ? targetCard?.completionRate ?? "--" : "--",
        progress:
          totalTarget !== null && targetCard && targetCard.completionRate !== "--"
            ? Math.max(0, Math.min(100, targetCard.progress))
            : null,
      };
    }),
  );
};

const dataHealthSummary = (
  snapshotResult: Awaited<ReturnType<typeof loadActiveRuntimeDatasetSnapshot>>,
): V2HomeDataHealthSummary => {
  if (snapshotResult.status !== "ok") {
    return {
      missingSourceCount: 0,
      safeSkippedCount: 0,
      dedupedRecordCount: 0,
      nonComputableMetricCount: V2_HOME_METRIC_CONTRACTS.filter(
        (metric) => metric.availability === "PENDING_IMPLEMENTATION" || metric.availability === "UNAVAILABLE",
      ).length,
      filesParsed: 0,
      filesFailed: 0,
      safeIssueCodes: [],
    };
  }
  const { snapshot } = snapshotResult;
  return {
    missingSourceCount: Object.values(snapshot.sourceCoverage).filter((item) => !item.present).length,
    safeSkippedCount: snapshot.safeIssues
      .filter((issue) => SAFE_SKIPPED_CODE_PATTERN.test(issue.code))
      .reduce((sum, issue) => sum + issue.safeCount, 0),
    dedupedRecordCount: snapshot.importSummary.dedupedRecords,
    nonComputableMetricCount: V2_HOME_METRIC_CONTRACTS.filter(
      (metric) => metric.availability === "PENDING_IMPLEMENTATION" || metric.availability === "UNAVAILABLE",
    ).length,
    filesParsed: snapshot.importSummary.filesParsed,
    filesFailed: snapshot.importSummary.filesFailed,
    safeIssueCodes: uniqueText(snapshot.safeIssues.map((issue) => issue.code)).slice(0, 5),
  };
};

const comparisonState = (mode: V2HomeComparisonMode) => ({
  mode,
  available: false as const,
  message: mode === "none" ? "未开启对比" : "当前范围暂无可比数据",
});

const reconciliationSummary = (
  source: BIHomeDataSource,
  state: UIState,
): V2HomeReconciliationSummary => {
  const viewModel = buildHomeBIViewModel(source, { ...state, targetDrafts: {} });
  const sumPlatformMetric = (metricKey: string): number | null => {
    let sawValue = false;
    const total = viewModel.platformSummary.reduce((sum, platform) => {
      const value = finiteOrNull(platform.metrics[metricKey]);
      if (value === null) return sum;
      sawValue = true;
      return sum + value;
    }, 0);
    return sawValue ? total : null;
  };
  const metricValue = (metricKey: V2HomeMetricKey): number | null =>
    metricsByKeyForRange(source, state, {
      mode: state.timeRange.mode,
      startDate: state.timeRange.startDate ?? "",
      endDate: state.timeRange.endDate ?? "",
    }).get(metricKey) ?? null;

  return {
    gmv: sumPlatformMetric("gmv"),
    gsv: sumPlatformMetric("gsv"),
    visitors: sumPlatformMetric("visitors"),
    paidBuyers: sumPlatformMetric("paidBuyers"),
    adSpend: sumPlatformMetric("adSpend"),
    clicks: sumPlatformMetric("adClicks"),
    refundAmount: sumPlatformMetric("refundAmount"),
    adSpendRateAfterRefund: metricValue("adSpendRateAfterRefund"),
    directTransactionShare: metricValue("directTransactionShare"),
  };
};

export const loadV2HomeViewModel = async (
  options: V2HomeLoadOptions = {},
): Promise<V2HomeLoadResult> => {
  try {
    const [sourceResult, debugResult] = await Promise.all([
      loadHomeBIDataSource({ includeV05Persistence: false }),
      loadCrossPageDebugContext(),
    ]);
    if (!sourceResult.dataStatus.hasRealData || sourceResult.points.length === 0) {
      return {
        status: "empty",
        message: "当前尚未导入经营数据",
        uploadHref: "/v2/upload",
      };
    }

    const debugSnapshot = debugResult.status === "ok" ? debugResult.snapshot : null;
    const source = mergeDebugSeries(
      sourceResult,
      debugSnapshot?.pages.series.temporarySeriesProductIds ?? [],
    );
    const snapshotResult = await loadActiveRuntimeDatasetSnapshot();
    const datasetDates = businessDatesFromSource(source);
    if (datasetDates.length === 0) {
      return {
        status: "error",
        message: "当前经营数据缺少可用日期范围。",
      };
    }
    const datasetRange = {
      startDate: datasetDates[0],
      endDate: datasetDates[datasetDates.length - 1],
    };

    let baseState = createDefaultBIState();
    if (debugSnapshot) baseState = mergeDebugContextIntoUIState(baseState, debugSnapshot, "home");
    baseState = {
      ...baseState,
      brandModelFilter: hasBrandFilter(baseState.brandModelFilter)
        ? baseState.brandModelFilter
        : DEFAULT_BRAND_FILTER,
    };

    const debugRange: V2HomeTimeRange | null = baseState.timeRange.startDate && baseState.timeRange.endDate
      ? {
          mode: baseState.timeRange.mode,
          startDate: baseState.timeRange.startDate,
          endDate: baseState.timeRange.endDate,
        }
      : null;
    const requestedRange = options.timeRange ?? debugRange;
    if (options.timeRange) {
      const error = validateV2HomeTimeRange(options.timeRange);
      if (error) return { status: "error", message: error };
    }
    const selectedRange = normalizeSelectedRange(requestedRange, datasetRange);
    const scope = buildScope(
      source,
      options.selectedPlatform !== undefined ? options.selectedPlatform : baseState.selectedPlatform,
      options.selectedStoreIds ?? baseState.selectedStores,
    );
    const platformTargetRecords = await loadPlatformTargetRecords(scope, selectedRange);
    const targetDrafts = recordsToDraftMap(platformTargetRecords);
    const state = stateForScopeAndRange({
      scope,
      range: selectedRange,
      baseState,
      targetDrafts,
    });
    const chartMode = options.chartMode ?? debugSnapshot?.pages.home.chartMode ?? "mtd";
    const comparisonMode = options.comparisonMode ?? "none";
    const metrics = metricCards({ source, state, range: selectedRange, targetDrafts });
    const viewModel: V2HomeViewModel = {
      status: "ready",
      dataStatusLabel: source.dataStatus.label,
      scope,
      dataset: {
        activeDatasetId: snapshotResult.status === "ok" ? snapshotResult.snapshot.activeDatasetId : null,
        sourceLabel: source.dataStatus.label,
        restoredFromPersistence: source.dataStatus.label.includes("恢复"),
        dateRange: datasetRange,
        updatedAt: snapshotResult.status === "ok" ? snapshotResult.snapshot.updatedAt : null,
      },
      timeRange: selectedRange,
      comparison: comparisonState(comparisonMode),
      metrics,
      keySeries: await seriesCards({ source, state, scope, range: selectedRange }),
      chart: chartModel({
        source,
        state,
        datasetDates,
        selectedRange,
        chartMode,
        chartPairId: options.chartPairId,
      }),
      dataHealth: dataHealthSummary(snapshotResult),
      reconciliation: reconciliationSummary(source, state),
      preferencePersistence: "LOCAL_UI_PREFERENCE",
    };
    return { status: "ready", viewModel };
  } catch {
    return {
      status: "error",
      message: "经营数据暂时无法读取，请刷新后重试。",
    };
  }
};

export const saveV2HomeContext = async (patch: V2HomeContextPatch): Promise<boolean> => {
  const legacyMetric = LEGACY_TITLE_BY_KEY[patch.selectedMetric] ?? "GMV";
  const range: BITimeRange = {
    mode: patch.timeRange.mode,
    startDate: patch.timeRange.startDate,
    endDate: patch.timeRange.endDate,
  };
  const result = await saveCrossPageDebugContextPatch({
    selectedPlatform: patch.selectedPlatform,
    selectedStores: patch.selectedStoreIds,
    timeRange: range,
    selectedMetric: legacyMetric,
    chartMode: patch.chartMode,
    pages: {
      home: {
        selectedMetric: legacyMetric,
        chartMode: patch.chartMode,
      },
    },
  });
  return result.status === "saved";
};
