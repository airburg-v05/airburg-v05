import type {
  OwnedAdProductFact,
  OwnedBusinessProductFact,
  SeriesRecord,
  StoreRecord,
  V2Dataset,
} from "../domain/models";
import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import {
  buildLegacyDefaultStoreRecord,
  buildStoreContext,
  DEFAULT_TMALL_STORE_ID,
  findStore,
  historyHrefForStore,
  storeBoardHref,
} from "../store-board/store-context";
import {
  buildSeriesBoardDateRange,
  legacyDatesForSeries,
  v2DatesForActiveSeries,
  v2DatesForSeries,
} from "./date-range";
import {
  aggregateSeriesMetrics,
  buildSeriesMetricCards,
  buildV2SeriesProductRows,
  buildV2SeriesTrendPoints,
  filterLegacySeriesBusinessFacts,
  filterV2SeriesAdProductFacts,
  filterV2SeriesBusinessFacts,
  filterV2SeriesAfterSalesRangeAggregates,
  formatMoney,
  safeDivide,
  safeSum,
} from "./metrics";
import {
  buildLegacySeriesTargetProgress,
  buildV2SeriesTargetProgress,
} from "./targets";
import type {
  LegacySeriesBoardBuildInput,
  SeriesBoardBuildInput,
  SeriesBoardDateRangeState,
  SeriesBoardProductRow,
  SeriesBoardSeriesOption,
  SeriesBoardStoreContext,
  SeriesBoardViewModel,
} from "./contracts";
import { buildTrendPoints, sortBusinessDatesDesc } from "../home-command-center";

const TREND_METRIC_OPTIONS = [
  { key: "gmv", label: "GMV" },
  { key: "gsv", label: "GSV" },
  { key: "visitors", label: "访客" },
  { key: "paidBuyers", label: "买家" },
  { key: "conversionRate", label: "转化率" },
  { key: "adSpend", label: "推广花费" },
] as const;

const activeStores = (dataset: V2Dataset): StoreRecord[] =>
  dataset.stores
    .filter((store) => store.status === "active")
    .sort((left, right) =>
      left.platformCode.localeCompare(right.platformCode) ||
      (left.storeName || left.storeId).localeCompare(right.storeName || right.storeId, "zh-CN") ||
      left.storeId.localeCompare(right.storeId),
    );

const invalidDateRange = (selectedPeriod: SeriesBoardDateRangeState["selectedPeriod"]): SeriesBoardDateRangeState => ({
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

const sourceWarningCount = (dataset: V2Dataset): number =>
  new Set([
    ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
    ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
  ]).size;

const storeContextForSeries = ({
  dataset,
  store,
}: {
  dataset: V2Dataset | null;
  store: StoreRecord;
}): SeriesBoardStoreContext => {
  const base = buildStoreContext({ dataset, store });
  return {
    ...base,
    availableStores: base.availableStores.map((item) => ({
      ...item,
      href: `/series-board?${new URLSearchParams({
        platform: item.platformCode,
        storeId: item.value.split(":")[1] ?? "",
      }).toString()}`,
    })),
    storeBoardHref: storeBoardHref(store),
    manageSeriesHref: `/series-board/manage?${new URLSearchParams({
      platform: store.platformCode,
      storeId: store.storeId,
    }).toString()}`,
    historyHref: historyHrefForStore(dataset, store),
    qualityHref: `/upload/quality?${new URLSearchParams({
      platform: store.platformCode,
      storeId: store.storeId,
    }).toString()}`,
  };
};

const emptyMetrics = () =>
  buildSeriesMetricCards({
    hasBusinessData: false,
    hasAdData: false,
    gmv: 0,
    gsv: 0,
    refundSuccessAmount: 0,
    visitors: 0,
    paidBuyers: 0,
    conversionRate: null,
    adSpend: null,
    adSalesAmount: null,
    adRoi: null,
  });

export const buildEmptySeriesBoardViewModel = (message = "当前没有可用系列数据。"): SeriesBoardViewModel => ({
  mode: "empty",
  title: "系列看板",
  description: "请选择已创建的店铺系列查看经营、推广、目标和趋势。",
  statusLabel: "暂无数据",
  statusTone: "slate",
  storeContext: null,
  selectedSeriesId: null,
  selectedSeriesName: null,
  selectedSeriesProductCount: 0,
  seriesOptions: [],
  defaultDate: null,
  availableDates: [],
  dateRange: invalidDateRange("day"),
  metrics: emptyMetrics(),
  trendMetricOptions: [...TREND_METRIC_OPTIONS],
  trendPoints: [],
  targetProgress: [],
  productRows: [],
  dataStatus: {
    activeDatasetStatus: "暂无数据",
    storeCount: 0,
    seriesCount: 0,
    warningCount: 0,
    issueCodes: [],
    qualityHref: "/upload",
  },
  primaryActions: [{ label: "数据导入", href: "/upload", tone: "blue" }],
  notices: [message],
  isEmpty: true,
});

export const buildInvalidSeriesBoardViewModel = ({
  mode,
  platformCode,
  storeId,
  message,
}: {
  mode: "invalid_store" | "invalid_series" | "corrupted" | "no_series";
  platformCode: string | null;
  storeId: string | null;
  message: string;
}): SeriesBoardViewModel => ({
  ...buildEmptySeriesBoardViewModel(message),
  mode,
  statusLabel:
    mode === "invalid_store"
      ? "店铺不可用"
      : mode === "invalid_series"
        ? "系列不可用"
        : mode === "no_series"
          ? "暂无启用系列"
          : "数据不可用",
  statusTone: mode === "corrupted" ? "rose" : "amber",
  primaryActions: [
    {
      label: mode === "no_series" || mode === "invalid_series" ? "管理系列" : "返回店铺看板",
      href:
        mode === "no_series" || mode === "invalid_series"
          ? `/series-board/manage?${new URLSearchParams({
            ...(platformCode ? { platform: platformCode } : {}),
            ...(storeId ? { storeId } : {}),
          }).toString()}`
          : `/store-board?${new URLSearchParams({
            ...(platformCode ? { platform: platformCode } : {}),
            ...(storeId ? { storeId } : {}),
          }).toString()}`,
      tone: "blue",
    },
    { label: "数据导入", href: "/upload", tone: "slate" },
  ],
});

const sortedActiveSeries = (series: readonly SeriesRecord[]): SeriesRecord[] =>
  [...series]
    .filter((item) => item.status === "active")
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.seriesId.localeCompare(right.seriesId));

const seriesOptionsFor = ({
  series,
  selectedStore,
}: {
  series: readonly SeriesRecord[];
  selectedStore: Pick<StoreRecord, "platformCode" | "storeId">;
}): SeriesBoardSeriesOption[] =>
  sortedActiveSeries(
    series.filter((item) => item.platformCode === selectedStore.platformCode && item.storeId === selectedStore.storeId),
  ).map((item) => ({
    seriesId: item.seriesId,
    name: item.name,
    productCount: item.productIds.length,
    href: `/series-board?${new URLSearchParams({
      platform: item.platformCode,
      storeId: item.storeId,
      seriesId: item.seriesId,
    }).toString()}`,
  }));

const issueCodesFor = (dataset: V2Dataset): string[] =>
  Array.from(
    new Set([
      ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
      ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
    ]),
  ).slice(0, 5);

export const buildV2SeriesBoardViewModel = ({
  dataset,
  platformCode,
  storeId,
  seriesId,
  selectedPeriod,
  selectedDate,
  customDateRange,
}: SeriesBoardBuildInput): SeriesBoardViewModel => {
  const stores = activeStores(dataset);
  const store = findStore(stores, platformCode, storeId);
  if (!store) {
    return buildInvalidSeriesBoardViewModel({
      mode: "invalid_store",
      platformCode,
      storeId,
      message: "未找到当前店铺的数据。请从首页或店铺看板选择已导入店铺进入。",
    });
  }

  const scopedOptions = seriesOptionsFor({ series: dataset.series, selectedStore: store });
  if (scopedOptions.length === 0) {
    return {
      ...buildInvalidSeriesBoardViewModel({
        mode: "no_series",
        platformCode,
        storeId,
        message: "当前店铺还没有启用的系列，请先到系列管理页创建或启用系列。",
      }),
      storeContext: storeContextForSeries({ dataset, store }),
      dataStatus: {
        activeDatasetStatus: "多店铺数据可用",
        storeCount: stores.length,
        seriesCount: 0,
        warningCount: sourceWarningCount(dataset),
        issueCodes: issueCodesFor(dataset),
        qualityHref: `/upload/quality?${new URLSearchParams({ platform: platformCode, storeId }).toString()}`,
      },
    };
  }

  const selectedSeriesId = seriesId ?? scopedOptions[0]!.seriesId;
  const selectedSeries = dataset.series.find(
    (item) =>
      item.status === "active" &&
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.seriesId === selectedSeriesId,
  );
  if (!selectedSeries) {
    return {
      ...buildInvalidSeriesBoardViewModel({
        mode: "invalid_series",
        platformCode,
        storeId,
        message: "当前系列不存在、已停用，或不属于当前店铺。请返回系列列表重新选择。",
      }),
      storeContext: storeContextForSeries({ dataset, store }),
      seriesOptions: scopedOptions,
    };
  }

  const availableDates = v2DatesForSeries({
    dataset,
    platformCode,
    storeId,
    productIds: selectedSeries.productIds,
  });
  const dateRange = buildSeriesBoardDateRange({ selectedPeriod, selectedDate, customDateRange, availableDates });
  const businessFacts = filterV2SeriesBusinessFacts({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productIds: selectedSeries.productIds,
  });
  const adProductFacts = filterV2SeriesAdProductFacts({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productIds: selectedSeries.productIds,
  });
  const metrics = aggregateSeriesMetrics({ businessFacts, adProductFacts });
  const productRows = buildV2SeriesProductRows({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productIds: selectedSeries.productIds,
  });
  const warningCount = sourceWarningCount(dataset);
  const afterSales = filterV2SeriesAfterSalesRangeAggregates({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productIds: selectedSeries.productIds,
  });

  return {
    mode: selectedSeries.productIds.length === 0 ? "empty_series" : "v2_valid",
    title: "系列看板",
    description: "按当前店铺的用户自定义系列查看经营、推广、目标、趋势和商品组成。",
    statusLabel: warningCount > 0 ? "有数据提示" : "多店铺系列数据",
    statusTone: warningCount > 0 ? "amber" : "blue",
    storeContext: storeContextForSeries({ dataset, store }),
    selectedSeriesId: selectedSeries.seriesId,
    selectedSeriesName: selectedSeries.name,
    selectedSeriesProductCount: selectedSeries.productIds.length,
    seriesOptions: scopedOptions,
    defaultDate: availableDates[0] ?? v2DatesForActiveSeries({ dataset, platformCode, storeId })[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildSeriesMetricCards(metrics),
    trendMetricOptions: [...TREND_METRIC_OPTIONS],
    trendPoints: buildV2SeriesTrendPoints({ dataset, range: dateRange, platformCode, storeId, productIds: selectedSeries.productIds }),
    targetProgress: buildV2SeriesTargetProgress({
      targets: dataset.targets,
      metrics,
      selectedPeriod,
      range: dateRange,
      platformCode,
      storeId,
      seriesId: selectedSeries.seriesId,
    }),
    productRows,
    dataStatus: {
      activeDatasetStatus: "多店铺数据可用",
      storeCount: stores.length,
      seriesCount: scopedOptions.length,
      warningCount,
      issueCodes: issueCodesFor(dataset),
      qualityHref: `/upload/quality?${new URLSearchParams({ platform: platformCode, storeId }).toString()}`,
    },
    primaryActions: [
      { label: "管理系列", href: `/series-board/manage?${new URLSearchParams({ platform: platformCode, storeId }).toString()}`, tone: "blue" },
      { label: "返回店铺看板", href: storeBoardHref(store), tone: "slate" },
    ],
    notices: [
      dateRange.coverageText,
      selectedSeries.productIds.length === 0
        ? "当前系列尚未添加商品。"
        : "当前只展示所选店铺和所选系列商品，不与其他店铺或系列合并。",
      adProductFacts.length === 0 ? "当前范围没有商品推广数据，推广指标显示为 --。" : "推广指标仅使用商品推广数据。",
      afterSales.length > 0 ? `当前范围有安全售后汇总，退款金额 ${formatMoney(safeSum(afterSales, (item) => item.refundAmount))}。` : "当前范围暂无安全售后汇总。",
    ],
    isEmpty: selectedSeries.productIds.length === 0 || (businessFacts.length === 0 && adProductFacts.length === 0),
  };
};

const legacyGroupToSeries = (group: TmallSeriesGroup): SeriesRecord => ({
  schemaVersion: "airburg_storage_v2",
  seriesId: group.id,
  platformCode: "tmall",
  storeId: DEFAULT_TMALL_STORE_ID,
  name: group.name,
  productIds: group.productIds,
  status: "active",
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

const legacyAdFactsForSeries = ({
  analysis,
  range,
  productIds,
}: {
  analysis: TmallStoredAnalysisResult;
  range: SeriesBoardDateRangeState;
  productIds: readonly string[];
}): OwnedAdProductFact[] => {
  const productSet = new Set(productIds);
  return analysis.adProductDailyFacts
    .filter((fact) => productSet.has(String(fact.productId)) && range.valid && !!range.start && !!range.end && fact.date >= range.start && fact.date <= range.end)
    .map((fact) => ({
      schemaVersion: "airburg_storage_v2" as const,
      platformCode: "tmall" as const,
      storeId: DEFAULT_TMALL_STORE_ID,
      businessDate: fact.date,
      sourceType: "ad_product" as const,
      importBatchId: "legacy-series-fallback",
      productId: String(fact.productId),
      adSpend: fact.adSpend,
      adSalesAmount: fact.adTransactionAmount,
      impressions: fact.impressions,
      clicks: fact.clicks,
      clickRate: fact.clickRate,
      adRoi: fact.roi,
    }));
};

const legacyBusinessAsV2 = (facts: ReturnType<typeof filterLegacySeriesBusinessFacts>): OwnedBusinessProductFact[] =>
  facts.map((fact) => ({
    schemaVersion: "airburg_storage_v2" as const,
    platformCode: "tmall" as const,
    storeId: DEFAULT_TMALL_STORE_ID,
    businessDate: fact.date,
    sourceType: "business_product" as const,
    importBatchId: "legacy-series-fallback",
    productId: String(fact.productId),
    productName: fact.productName,
    gmv: fact.gmv,
    gsv: fact.gsv,
    visitors: fact.visitors,
    paidBuyers: fact.paidBuyers,
    paidOrders: null,
    conversionRate: fact.conversionRate,
    avgOrderValue: fact.avgOrderValue,
    favorites: fact.favorites,
    cartAdditions: fact.cartAdditions,
  }));

const buildLegacyRows = ({
  analysis,
  range,
  productIds,
}: {
  analysis: TmallStoredAnalysisResult;
  range: SeriesBoardDateRangeState;
  productIds: readonly string[];
}): SeriesBoardProductRow[] => {
  const businessFacts = legacyBusinessAsV2(filterLegacySeriesBusinessFacts({ analysis, range, productIds }));
  const adFacts = legacyAdFactsForSeries({ analysis, range, productIds });
  return [...new Set(productIds)]
    .map((productId) => {
      const business = businessFacts.filter((fact) => fact.productId === productId);
      const ads = adFacts.filter((fact) => fact.productId === productId);
      const visitors = business.length > 0 ? safeSum(business, (fact) => fact.visitors) : null;
      const paidBuyers = business.length > 0 ? safeSum(business, (fact) => fact.paidBuyers) : null;
      const adSpend = ads.length > 0 ? safeSum(ads, (fact) => fact.adSpend) : null;
      const adSales = ads.length > 0 ? safeSum(ads, (fact) => fact.adSalesAmount) : null;
      return {
        productId,
        productName: business[0]?.productName?.trim() || productId,
        dataStatus: business.length > 0 ? "business" : ads.length > 0 ? "ad_only" : "no_range_data",
        gmv: business.length > 0 ? safeSum(business, (fact) => fact.gmv) : null,
        gsv: business.length > 0 ? safeSum(business, (fact) => fact.gsv) : null,
        visitors,
        paidBuyers,
        conversionRate: safeDivide(paidBuyers, visitors),
        hasAdData: ads.length > 0,
        adSpend,
        adRoi: ads.length > 0 ? safeDivide(adSales, adSpend) : null,
        refundAmount: business.length > 0 ? safeSum(business, (fact) => {
          const value = (fact.gmv ?? 0) - (fact.gsv ?? 0);
          return value > 0 ? value : 0;
        }) : null,
        productBoardHref: `/product-board?${new URLSearchParams({ platform: "tmall", storeId: DEFAULT_TMALL_STORE_ID, productId }).toString()}`,
        fallbackHref: `/product-board/tracked?${new URLSearchParams({ platform: "tmall", storeId: DEFAULT_TMALL_STORE_ID }).toString()}`,
      } satisfies SeriesBoardProductRow;
    })
    .sort((left, right) => {
      const diff = (right.gmv ?? Number.NEGATIVE_INFINITY) - (left.gmv ?? Number.NEGATIVE_INFINITY);
      if (diff !== 0) return diff;
      return left.productName.localeCompare(right.productName, "zh-CN") || left.productId.localeCompare(right.productId);
    });
};

export const buildLegacySeriesBoardViewModel = ({
  analysis,
  legacySeriesGroups,
  targets,
  seriesId,
  selectedPeriod,
  selectedDate,
  customDateRange,
  fallbackNotice,
}: LegacySeriesBoardBuildInput): SeriesBoardViewModel => {
  const store = buildLegacyDefaultStoreRecord();
  const activeSeries = legacySeriesGroups.map(legacyGroupToSeries).sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.seriesId.localeCompare(right.seriesId));
  if (activeSeries.length === 0) {
    return {
      ...buildInvalidSeriesBoardViewModel({
        mode: "no_series",
        platformCode: "tmall",
        storeId: DEFAULT_TMALL_STORE_ID,
        message: "默认店铺还没有启用的系列，请先到系列管理页创建系列。",
      }),
      statusLabel: "旧版单店数据",
      storeContext: storeContextForSeries({ dataset: null, store }),
    };
  }
  const selectedSeriesId = seriesId ?? activeSeries[0]!.seriesId;
  const selectedSeries = activeSeries.find((item) => item.seriesId === selectedSeriesId);
  if (!selectedSeries) {
    return {
      ...buildInvalidSeriesBoardViewModel({
        mode: "invalid_series",
        platformCode: "tmall",
        storeId: DEFAULT_TMALL_STORE_ID,
        message: "当前系列不存在或不属于默认店铺，请返回系列列表重新选择。",
      }),
      statusLabel: "旧版单店数据",
      storeContext: storeContextForSeries({ dataset: null, store }),
    };
  }

  const availableDates = legacyDatesForSeries({ analysis, productIds: selectedSeries.productIds });
  const dateRange = buildSeriesBoardDateRange({ selectedPeriod, selectedDate, customDateRange, availableDates });
  const businessFacts = legacyBusinessAsV2(filterLegacySeriesBusinessFacts({ analysis, range: dateRange, productIds: selectedSeries.productIds }));
  const adProductFacts = legacyAdFactsForSeries({ analysis, range: dateRange, productIds: selectedSeries.productIds });
  const metrics = aggregateSeriesMetrics({ businessFacts, adProductFacts });
  const dates = sortBusinessDatesDesc([
    ...businessFacts.map((fact) => fact.businessDate),
    ...adProductFacts.map((fact) => fact.businessDate),
  ]).reverse();
  const trendPoints = buildTrendPoints(
    dates.map((date) => {
      const currentRange = { ...dateRange, start: date, end: date, selectedDate: date, valid: true, naturalDayCount: 1, dataDayCount: 1 };
      const dailyBusiness = legacyBusinessAsV2(filterLegacySeriesBusinessFacts({ analysis, range: currentRange, productIds: selectedSeries.productIds }));
      const dailyAds = legacyAdFactsForSeries({ analysis, range: currentRange, productIds: selectedSeries.productIds });
      const daily = aggregateSeriesMetrics({ businessFacts: dailyBusiness, adProductFacts: dailyAds });
      return {
        date,
        gmv: daily.hasBusinessData ? daily.gmv : null,
        gsv: daily.hasBusinessData ? daily.gsv : null,
        visitors: daily.hasBusinessData ? daily.visitors : null,
        paidBuyers: daily.hasBusinessData ? daily.paidBuyers : null,
        conversionRate: daily.conversionRate,
        adSpend: daily.adSpend,
      };
    }),
  );

  return {
    mode: fallbackNotice ? "v2_corrupted_with_legacy_fallback" : "legacy_fallback",
    title: "系列看板",
    description: "当前显示旧版默认店铺系列数据，完成新导入后可查看多店铺系列看板。",
    statusLabel: "旧版单店数据",
    statusTone: fallbackNotice ? "amber" : "blue",
    storeContext: storeContextForSeries({ dataset: null, store }),
    selectedSeriesId: selectedSeries.seriesId,
    selectedSeriesName: selectedSeries.name,
    selectedSeriesProductCount: selectedSeries.productIds.length,
    seriesOptions: activeSeries.map((item) => ({
      seriesId: item.seriesId,
      name: item.name,
      productCount: item.productIds.length,
      href: `/series-board?${new URLSearchParams({ platform: "tmall", storeId: DEFAULT_TMALL_STORE_ID, seriesId: item.seriesId }).toString()}`,
    })),
    defaultDate: availableDates[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildSeriesMetricCards(metrics),
    trendMetricOptions: [...TREND_METRIC_OPTIONS],
    trendPoints,
    targetProgress: buildLegacySeriesTargetProgress({
      targets,
      metrics,
      selectedPeriod,
      range: dateRange,
      seriesId: selectedSeries.seriesId,
    }),
    productRows: buildLegacyRows({ analysis, range: dateRange, productIds: selectedSeries.productIds }),
    dataStatus: {
      activeDatasetStatus: "旧版默认店铺数据",
      storeCount: 1,
      seriesCount: activeSeries.length,
      warningCount: analysis.dataQualityWarnings.length,
      issueCodes: analysis.dataQualityWarnings.slice(0, 5),
      qualityHref: "/upload/quality?platform=tmall&storeId=tmall-default-store",
    },
    primaryActions: [
      { label: "管理系列", href: "/series-board/manage?platform=tmall&storeId=tmall-default-store", tone: "blue" },
      { label: "返回店铺看板", href: "/store-board?platform=tmall&storeId=tmall-default-store", tone: "slate" },
    ],
    notices: [
      fallbackNotice ?? "当前显示旧版默认店铺数据，不会自动迁移或写入 V2。",
      dateRange.coverageText,
      selectedSeries.productIds.length === 0 ? "当前系列尚未添加商品。" : "当前只展示所选系列商品。",
    ],
    isEmpty: selectedSeries.productIds.length === 0 || (businessFacts.length === 0 && adProductFacts.length === 0),
  };
};
