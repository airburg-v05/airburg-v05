import type { PlatformCode, StoreRecord, V2Dataset } from "../domain/models";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import type {
  HomeCommandCenterBuildInput,
  HomeCommandCenterDatePoint,
  HomeCommandCenterMetricKey,
  HomeCommandCenterViewModel,
  LegacyHomeCommandCenterBuildInput,
} from "./contracts";
import {
  buildHomeCommandCenterDateRange,
  isDateInRange,
  sortBusinessDatesDesc,
} from "./date-range";
import {
  aggregateLegacyMetrics,
  aggregateV2Metrics,
  buildMetricCards,
  buildTrendPoints,
  filterLegacyAdPlanFacts,
  filterLegacyBusinessFacts,
  filterV2AdPlanFacts,
  filterV2BusinessFacts,
  legacyDatesForAnalysis,
  v2DatesForDataset,
} from "./metrics";
import {
  buildPlatformOptions,
  buildStoreOptions,
  normalizeStoreFilter,
  platformLabel,
} from "./store-ranking";
import { buildStorePerformance } from "./store-ranking";
import { buildLegacyTargetProgress, buildV2TargetProgress } from "./targets";

const TREND_METRIC_OPTIONS: Array<{ key: HomeCommandCenterMetricKey; label: string }> = [
  { key: "gmv", label: "GMV" },
  { key: "gsv", label: "GSV" },
  { key: "visitors", label: "访客" },
  { key: "paidBuyers", label: "买家" },
  { key: "conversionRate", label: "转化率" },
  { key: "adSpend", label: "推广花费" },
];

const DEFAULT_STORE_ID = "tmall:tmall-default-store";

const storeKey = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `${store.platformCode}:${store.storeId}`;

const sourceWarningCount = (dataset: V2Dataset): number =>
  new Set([
    ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
    ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
  ]).size;

const activeStores = (dataset: V2Dataset): StoreRecord[] =>
  dataset.stores.filter((store) => store.status === "active");

const v2DailyAggregates = ({
  dataset,
  range,
  platformFilter,
  storeFilter,
}: {
  dataset: V2Dataset;
  range: ReturnType<typeof buildHomeCommandCenterDateRange>;
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}): HomeCommandCenterDatePoint[] => {
  const dates = sortBusinessDatesDesc(
    dataset.businessProductFacts
      .map((fact) => fact.businessDate)
      .filter((date) => isDateInRange(date, range)),
  ).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const dayRange = {
        ...range,
        selectedDate: date,
        start: date,
        end: date,
        naturalDayCount: 1,
        dataDayCount: 1,
        valid: true,
        error: null,
        coverageText: "单日数据。",
      };
      const businessFacts = filterV2BusinessFacts({
        dataset,
        range: dayRange,
        platformFilter,
        storeFilter,
      });
      const adPlanFacts = filterV2AdPlanFacts({
        dataset,
        range: dayRange,
        platformFilter,
        storeFilter,
      });
      const metrics = aggregateV2Metrics({ businessFacts, adPlanFacts });
      return {
        date,
        gmv: metrics.hasBusinessData ? metrics.gmv : null,
        gsv: metrics.hasBusinessData ? metrics.gsv : null,
        visitors: metrics.hasBusinessData ? metrics.visitors : null,
        paidBuyers: metrics.hasBusinessData ? metrics.paidBuyers : null,
        conversionRate: metrics.conversionRate,
        adSpend: metrics.adSpend,
      };
    }),
  );
};

const legacyDailyAggregates = ({
  analysis,
  range,
}: {
  analysis: TmallStoredAnalysisResult;
  range: ReturnType<typeof buildHomeCommandCenterDateRange>;
}): HomeCommandCenterDatePoint[] => {
  const dates = sortBusinessDatesDesc(
    analysis.productDailyFacts
      .map((fact) => fact.date)
      .filter((date) => isDateInRange(date, range)),
  ).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const dayRange = {
        ...range,
        selectedDate: date,
        start: date,
        end: date,
        naturalDayCount: 1,
        dataDayCount: 1,
        valid: true,
        error: null,
        coverageText: "单日数据。",
      };
      const productFacts = filterLegacyBusinessFacts({ analysis, range: dayRange });
      const adPlanFacts = filterLegacyAdPlanFacts({ analysis, range: dayRange });
      const metrics = aggregateLegacyMetrics({ productFacts, adPlanFacts });
      return {
        date,
        gmv: metrics.hasBusinessData ? metrics.gmv : null,
        gsv: metrics.hasBusinessData ? metrics.gsv : null,
        visitors: metrics.hasBusinessData ? metrics.visitors : null,
        paidBuyers: metrics.hasBusinessData ? metrics.paidBuyers : null,
        conversionRate: metrics.conversionRate,
        adSpend: metrics.adSpend,
      };
    }),
  );
};

const storeCountForFilters = (
  stores: StoreRecord[],
  platformFilter: PlatformCode | "all",
  storeFilter: string | "all",
): number =>
  stores.filter(
    (store) =>
      (platformFilter === "all" || store.platformCode === platformFilter) &&
      (storeFilter === "all" || storeKey(store) === storeFilter),
  ).length;

export const buildHomeCommandCenterViewModel = ({
  dataset,
  selectedPeriod,
  selectedDate,
  customDateRange,
  platformFilter,
  storeFilter,
}: HomeCommandCenterBuildInput): HomeCommandCenterViewModel => {
  const stores = activeStores(dataset);
  const normalizedPlatform = stores.some((store) => store.platformCode === platformFilter)
    ? platformFilter
    : "all";
  const normalizedStore = normalizeStoreFilter({
    stores,
    platformFilter: normalizedPlatform,
    storeFilter,
  });
  const availableDates = v2DatesForDataset(dataset);
  const dateRange = buildHomeCommandCenterDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });
  const businessFacts = filterV2BusinessFacts({
    dataset,
    range: dateRange,
    platformFilter: normalizedPlatform,
    storeFilter: normalizedStore,
  });
  const adPlanFacts = filterV2AdPlanFacts({
    dataset,
    range: dateRange,
    platformFilter: normalizedPlatform,
    storeFilter: normalizedStore,
  });
  const aggregate = aggregateV2Metrics({ businessFacts, adPlanFacts });
  const platforms = new Set(stores.map((store) => store.platformCode));
  const warningCount = sourceWarningCount(dataset);
  const storePerformance = buildStorePerformance({
    dataset,
    range: dateRange,
    selectedPeriod,
    platformFilter: normalizedPlatform,
    storeFilter: normalizedStore,
  });
  const targetProgress = buildV2TargetProgress({
    targets: dataset.targets,
    businessFacts,
    adPlanFacts,
    selectedPeriod,
    range: dateRange,
    selectedPlatform: normalizedPlatform,
    selectedStore: normalizedStore,
  });

  return {
    mode: "v2_valid",
    title: "经营命令中心",
    description: "汇总当前范围内的跨店铺经营表现、目标进度和优先入口。",
    statusLabel: "多店铺数据",
    statusTone: warningCount > 0 ? "amber" : "blue",
    platformOptions: buildPlatformOptions(stores),
    storeOptions: buildStoreOptions(stores, normalizedPlatform),
    selectedPlatform: normalizedPlatform,
    selectedStore: normalizedStore,
    defaultDate: availableDates[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildMetricCards(aggregate),
    trendMetricOptions: TREND_METRIC_OPTIONS,
    trendPoints: v2DailyAggregates({
      dataset,
      range: dateRange,
      platformFilter: normalizedPlatform,
      storeFilter: normalizedStore,
    }),
    targetProgress,
    storePerformance,
    dataStatus: {
      activeDatasetStatus: "多店铺数据可用",
      platformCount: platforms.size,
      storeCount: storeCountForFilters(stores, normalizedPlatform, normalizedStore),
      warningCount,
      issueCodes: Array.from(
        new Set([
          ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
          ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
        ]),
      ).slice(0, 5),
      qualityHref: "/upload/quality",
    },
    primaryActions: [
      { label: "目标设置", href: "/targets", tone: "blue" },
      { label: "数据导入", href: "/upload", tone: "slate" },
    ],
    notices: [
      dateRange.coverageText,
      targetProgress.length === 0 ? "当前周期暂无目标。" : "目标进度仅展示可安全匹配当前周期的目标。",
    ],
    isEmpty: businessFacts.length === 0,
  };
};

export const buildLegacyHomeCommandCenterViewModel = ({
  analysis,
  targets,
  selectedPeriod,
  selectedDate,
  customDateRange,
}: LegacyHomeCommandCenterBuildInput): HomeCommandCenterViewModel => {
  const availableDates = legacyDatesForAnalysis(analysis);
  const dateRange = buildHomeCommandCenterDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });
  const productFacts = filterLegacyBusinessFacts({ analysis, range: dateRange });
  const adPlanFacts = filterLegacyAdPlanFacts({ analysis, range: dateRange });
  const aggregate = aggregateLegacyMetrics({ productFacts, adPlanFacts });
  const targetProgress = buildLegacyTargetProgress({
    targets,
    analysis,
    selectedPeriod,
    range: dateRange,
  });
  const warningCount = analysis.dataQualityWarnings.length;
  const storeGmv = aggregate.hasBusinessData ? aggregate.gmv : null;

  return {
    mode: "legacy_fallback",
    title: "经营命令中心",
    description: "当前显示旧版单店数据，完成新数据导入后可查看多店铺汇总。",
    statusLabel: "旧版单店数据",
    statusTone: "amber",
    platformOptions: [
      { value: "tmall", label: "天猫" },
    ],
    storeOptions: [
      { value: DEFAULT_STORE_ID, label: "天猫 · 天猫默认店铺", platformCode: "tmall" },
    ],
    selectedPlatform: "tmall",
    selectedStore: DEFAULT_STORE_ID,
    defaultDate: availableDates[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildMetricCards(aggregate),
    trendMetricOptions: TREND_METRIC_OPTIONS,
    trendPoints: legacyDailyAggregates({ analysis, range: dateRange }),
    targetProgress,
    storePerformance: [
      {
        key: DEFAULT_STORE_ID,
        platformCode: "tmall",
        platformLabel: platformLabel("tmall"),
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        canOpenStoreBoard: true,
        storeBoardHref: "/store-board?platform=tmall&storeId=tmall-default-store",
        historyHref: "/upload/history?platform=tmall&storeId=tmall-default-store",
        gmv: storeGmv,
        gsv: aggregate.hasBusinessData ? aggregate.gsv : null,
        contributionRate: storeGmv === null ? null : 1,
        visitors: aggregate.hasBusinessData ? aggregate.visitors : null,
        paidBuyers: aggregate.hasBusinessData ? aggregate.paidBuyers : null,
        conversionRate: aggregate.conversionRate,
        adSpend: aggregate.adSpend,
        adRoi: aggregate.adRoi,
        targetProgressRate: targetProgress[0]?.progressRate ?? null,
        href: "/store-board?platform=tmall&storeId=tmall-default-store",
      },
    ],
    dataStatus: {
      activeDatasetStatus: "旧版单店数据",
      platformCount: 1,
      storeCount: 1,
      warningCount,
      issueCodes: analysis.dataQualityWarnings.slice(0, 5).map((_warning, index) => `legacy_warning_${index + 1}`),
      qualityHref: "/upload/quality",
    },
    primaryActions: [
      { label: "目标设置", href: "/targets", tone: "blue" },
      { label: "数据导入", href: "/upload", tone: "slate" },
    ],
    notices: [
      "当前显示旧版单店数据，完成新数据导入后可查看多店铺汇总。",
      dateRange.coverageText,
      targetProgress.length === 0 ? "当前周期暂无目标。" : "目标进度仅展示可安全匹配当前周期的目标。",
    ],
    isEmpty: productFacts.length === 0,
  };
};

export const buildEmptyHomeCommandCenterViewModel = (): HomeCommandCenterViewModel => ({
  mode: "empty",
  title: "经营命令中心",
  description: "当前还没有可用经营数据，请先完成数据导入。",
  statusLabel: "暂无数据",
  statusTone: "slate",
  platformOptions: [{ value: "all", label: "全部平台" }],
  storeOptions: [{ value: "all", label: "全部店铺", platformCode: "all" }],
  selectedPlatform: "all",
  selectedStore: "all",
  defaultDate: null,
  availableDates: [],
  dateRange: {
    selectedPeriod: "day",
    selectedDate: null,
    start: null,
    end: null,
    naturalDayCount: 0,
    dataDayCount: 0,
    valid: false,
    error: null,
    coverageText: "当前没有可用经营日期。",
  },
  metrics: buildMetricCards({
    hasBusinessData: false,
    hasAdPlanData: false,
    gmv: 0,
    gsv: 0,
    refundSuccessAmount: 0,
    visitors: 0,
    paidBuyers: 0,
    conversionRate: null,
    adSpend: null,
    adSalesAmount: null,
    adRoi: null,
  }),
  trendMetricOptions: TREND_METRIC_OPTIONS,
  trendPoints: [],
  targetProgress: [],
  storePerformance: [],
  dataStatus: {
    activeDatasetStatus: "暂无数据",
    platformCount: 0,
    storeCount: 0,
    warningCount: 0,
    issueCodes: [],
    qualityHref: "/upload",
  },
  primaryActions: [{ label: "数据导入", href: "/upload", tone: "blue" }],
  notices: ["当前没有经营数据，请先前往数据导入。"],
  isEmpty: true,
});
