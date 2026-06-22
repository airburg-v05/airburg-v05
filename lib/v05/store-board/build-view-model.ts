import type {
  StoreBoardBuildInput,
  StoreBoardMetricKey,
  StoreBoardViewModel,
  LegacyStoreBoardBuildInput,
} from "./contracts";
import {
  buildAdSummary,
  buildAfterSalesSummary,
  buildLegacyAfterSalesSummary,
  buildLegacyProductTop,
  buildLegacyStoreTrendPoints,
  buildStoreMetricCards,
  buildV2ProductTop,
  buildV2StoreTrendPoints,
  filterLegacyAdPlanFacts,
  filterLegacyBusinessFacts,
  filterV2AdPlanFacts,
  filterV2AdProductFacts,
  filterV2BusinessFacts,
  aggregateLegacyMetrics,
  aggregateV2Metrics,
} from "./metrics";
import {
  buildLegacyStoreTargetProgress,
  buildV2StoreTargetProgress,
} from "./targets";
import {
  activeStores,
  buildLegacyDefaultStoreRecord,
  buildStoreContext,
  DEFAULT_TMALL_STORE_ID,
  findStore,
  storeKey,
} from "./store-context";
import {
  buildStoreBoardDateRange,
  legacyDatesForStoreAnalysis,
  v2DatesForStore,
} from "./date-range";
import { buildV2StoreSeriesProgress } from "./series-progress";

const TREND_METRIC_OPTIONS: Array<{ key: StoreBoardMetricKey; label: string }> = [
  { key: "gmv", label: "GMV" },
  { key: "gsv", label: "GSV" },
  { key: "visitors", label: "访客" },
  { key: "paidBuyers", label: "买家" },
  { key: "conversionRate", label: "转化率" },
  { key: "adSpend", label: "推广花费" },
];

const sourceWarningCount = (dataset: StoreBoardBuildInput["dataset"]): number =>
  new Set([
    ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
    ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
  ]).size;

const invalidDateRange = (selectedPeriod: StoreBoardViewModel["dateRange"]["selectedPeriod"]) => ({
  selectedPeriod,
  selectedDate: null,
  start: null,
  end: null,
  naturalDayCount: 0,
  dataDayCount: 0,
  valid: false,
  error: null,
  coverageText: "当前没有可用经营日期。",
});

export const buildEmptyStoreBoardViewModel = (message = "当前没有可用经营数据。"): StoreBoardViewModel => ({
  mode: "empty",
  title: "店铺看板",
  description: "请选择已导入数据的店铺查看经营、趋势、系列和商品表现。",
  statusLabel: "暂无数据",
  statusTone: "slate",
  storeContext: null,
  defaultDate: null,
  availableDates: [],
  dateRange: invalidDateRange("day"),
  metrics: buildStoreMetricCards({
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
  productTop: [],
  seriesProgress: [],
  adSummary: { hasAdData: false, adSpend: null, adSalesAmount: null, adRoi: null, planCount: 0 },
  afterSalesSummary: {
    hasAfterSalesData: false,
    refundAmount: null,
    refundOrderCount: null,
    afterSalesApplyCount: null,
    pendingCount: null,
    distributionCount: 0,
  },
  dataStatus: {
    activeDatasetStatus: "暂无数据",
    storeCount: 0,
    warningCount: 0,
    issueCodes: [],
    qualityHref: "/upload",
  },
  primaryActions: [{ label: "数据导入", href: "/upload", tone: "blue" }],
  notices: [message],
  isEmpty: true,
});

export const buildInvalidStoreBoardViewModel = ({
  platformCode,
  storeId,
  message,
}: {
  platformCode: string | null;
  storeId: string | null;
  message?: string;
}): StoreBoardViewModel => ({
  ...buildEmptyStoreBoardViewModel(message ?? "当前店铺没有可安全读取的数据，请从首页或导入记录进入有效店铺。"),
  mode: "invalid_store",
  statusLabel: "店铺不可用",
  statusTone: "amber",
  primaryActions: [
    { label: "返回首页", href: "/home", tone: "blue" },
    {
      label: "查看导入记录",
      href: `/upload/history?${new URLSearchParams({
        ...(platformCode ? { platform: platformCode } : {}),
        ...(storeId ? { storeId } : {}),
      }).toString()}`,
      tone: "slate",
    },
  ],
});

export const buildV2StoreBoardViewModel = ({
  dataset,
  platformCode,
  storeId,
  selectedPeriod,
  selectedDate,
  customDateRange,
}: StoreBoardBuildInput): StoreBoardViewModel => {
  const stores = activeStores(dataset);
  const store = findStore(stores, platformCode, storeId);
  if (!store) {
    return buildInvalidStoreBoardViewModel({
      platformCode,
      storeId,
      message: "未找到当前店铺的数据。请从首页选择已导入的店铺进入。",
    });
  }
  const currentStoreKey = storeKey(store);
  const availableDates = v2DatesForStore({ dataset, platformCode, storeId });
  const dateRange = buildStoreBoardDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });
  const businessFacts = filterV2BusinessFacts({
    dataset,
    range: dateRange,
    platformFilter: platformCode,
    storeFilter: currentStoreKey,
  });
  const adPlanFacts = filterV2AdPlanFacts({
    dataset,
    range: dateRange,
    platformFilter: platformCode,
    storeFilter: currentStoreKey,
  });
  const adProductFacts = filterV2AdProductFacts({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
  });
  const metrics = aggregateV2Metrics({ businessFacts, adPlanFacts });
  const warningCount = sourceWarningCount(dataset);
  const scopedSeries = dataset.series.filter(
    (item) => item.platformCode === platformCode && item.storeId === storeId,
  );

  return {
    mode: "v2_valid",
    title: "店铺看板",
    description: "按当前店铺和日期范围查看经营表现、推广、售后、系列和商品入口。",
    statusLabel: "多店铺店铺数据",
    statusTone: warningCount > 0 ? "amber" : "blue",
    storeContext: buildStoreContext({ dataset, store }),
    defaultDate: availableDates[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildStoreMetricCards(metrics),
    trendMetricOptions: TREND_METRIC_OPTIONS,
    trendPoints: buildV2StoreTrendPoints({ dataset, range: dateRange, platformCode, storeId }),
    targetProgress: buildV2StoreTargetProgress({
      targets: dataset.targets,
      businessFacts,
      adPlanFacts,
      selectedPeriod,
      range: dateRange,
      platformCode,
      storeId,
    }),
    productTop: buildV2ProductTop({ businessFacts, adProductFacts }),
    seriesProgress: buildV2StoreSeriesProgress({
      series: scopedSeries,
      businessFacts,
      adPlanFacts,
      targets: dataset.targets,
      selectedPeriod,
      range: dateRange,
    }),
    adSummary: buildAdSummary(adPlanFacts),
    afterSalesSummary: buildAfterSalesSummary({ dataset, range: dateRange, platformCode, storeId }),
    dataStatus: {
      activeDatasetStatus: "多店铺数据可用",
      storeCount: stores.length,
      warningCount,
      issueCodes: Array.from(
        new Set([
          ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
          ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
        ]),
      ).slice(0, 5),
      qualityHref: `/upload/quality?${new URLSearchParams({ platform: platformCode, storeId }).toString()}`,
    },
    primaryActions: [
      { label: "目标设置", href: "/targets", tone: "blue" },
      { label: "数据导入", href: "/upload", tone: "slate" },
    ],
    notices: [
      dateRange.coverageText,
      businessFacts.length === 0
        ? "当前范围没有经营商品数据，请切换日期或查看数据质量。"
        : "当前仅展示所选店铺数据，不与其他店铺合并。",
    ],
    isEmpty: businessFacts.length === 0,
  };
};

export const buildLegacyStoreBoardViewModel = ({
  analysis,
  targets,
  selectedPeriod,
  selectedDate,
  customDateRange,
  fallbackNotice,
}: LegacyStoreBoardBuildInput): StoreBoardViewModel => {
  const availableDates = legacyDatesForStoreAnalysis(analysis);
  const dateRange = buildStoreBoardDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });
  const businessFacts = filterLegacyBusinessFacts({ analysis, range: dateRange });
  const adPlanFacts = filterLegacyAdPlanFacts({ analysis, range: dateRange });
  const metrics = aggregateLegacyMetrics({ productFacts: businessFacts, adPlanFacts });
  const store = buildLegacyDefaultStoreRecord();

  return {
    mode: fallbackNotice ? "v2_corrupted_with_legacy_fallback" : "legacy_fallback",
    title: "店铺看板",
    description: "当前显示旧版天猫默认店铺数据，完成新数据导入后可查看多店铺店铺看板。",
    statusLabel: "旧版单店数据",
    statusTone: "amber",
    storeContext: buildStoreContext({ dataset: null, store }),
    defaultDate: availableDates[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildStoreMetricCards(metrics),
    trendMetricOptions: TREND_METRIC_OPTIONS,
    trendPoints: buildLegacyStoreTrendPoints({ analysis, range: dateRange }),
    targetProgress: buildLegacyStoreTargetProgress({
      targets,
      analysis,
      selectedPeriod,
      range: dateRange,
    }),
    productTop: buildLegacyProductTop({ analysis, range: dateRange }),
    seriesProgress: [],
    adSummary: {
      hasAdData: adPlanFacts.length > 0,
      adSpend: metrics.adSpend,
      adSalesAmount: metrics.adSalesAmount,
      adRoi: metrics.adRoi,
      planCount: new Set(adPlanFacts.map((fact) => fact.planId)).size,
    },
    afterSalesSummary: buildLegacyAfterSalesSummary({ analysis, range: dateRange }),
    dataStatus: {
      activeDatasetStatus: "旧版单店数据",
      storeCount: 1,
      warningCount: analysis.dataQualityWarnings.length,
      issueCodes: analysis.dataQualityWarnings.slice(0, 5).map((_warning, index) => `legacy_warning_${index + 1}`),
      qualityHref: "/upload/quality?platform=tmall&storeId=tmall-default-store",
    },
    primaryActions: [
      { label: "目标设置", href: "/targets", tone: "blue" },
      { label: "数据导入", href: "/upload", tone: "slate" },
    ],
    notices: [
      ...(fallbackNotice ? [fallbackNotice] : []),
      "当前显示旧版单店数据，不会自动迁移或写入多店铺数据。",
      dateRange.coverageText,
    ],
    isEmpty: businessFacts.length === 0,
  };
};

export const isLegacyDefaultStoreRequest = ({
  platformCode,
  storeId,
}: {
  platformCode: string | null;
  storeId: string | null;
}): boolean =>
  (!platformCode || platformCode === "tmall") &&
  (!storeId || storeId === DEFAULT_TMALL_STORE_ID);
