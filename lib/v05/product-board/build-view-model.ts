import type {
  OwnedBusinessProductFact,
  PlatformCode,
  StoreRecord,
  TrackedProductRecord,
  V2Dataset,
} from "../domain/models";
import {
  activeStores,
  buildStoreContext,
  findStore,
  historyHrefForStore,
  storeBoardHref,
} from "../store-board/store-context";
import { buildProductBoardDateRange, v2DatesForActiveTrackedProducts, v2DatesForProduct } from "./date-range";
import {
  aggregateProductMetrics,
  buildProductAdSummary,
  buildProductAfterSalesSummary,
  buildProductMetricCards,
  buildV2ProductTrendPoints,
  filterV2ProductAdFacts,
  filterV2ProductAfterSalesDistributionItems,
  filterV2ProductAfterSalesRangeAggregates,
  filterV2ProductAfterSalesSnapshots,
  filterV2ProductBusinessFacts,
  formatMoney,
  safeSum,
} from "./metrics";
import { buildProductSeriesMemberships } from "./series-membership";
import { buildV2ProductTargetProgress } from "./targets";
import type {
  ProductBoardBuildInput,
  ProductBoardDataMode,
  ProductBoardDateRangeState,
  ProductBoardIdentity,
  ProductBoardStoreContext,
  ProductBoardTrackedOption,
  ProductBoardViewModel,
} from "./contracts";

const TREND_METRIC_OPTIONS = [
  { key: "gmv", label: "GMV" },
  { key: "gsv", label: "GSV" },
  { key: "visitors", label: "访客" },
  { key: "paidBuyers", label: "买家" },
  { key: "conversionRate", label: "转化率" },
  { key: "adSpend", label: "推广花费" },
] as const;

const invalidDateRange = (selectedPeriod: ProductBoardDateRangeState["selectedPeriod"]): ProductBoardDateRangeState => ({
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

const issueCodesFor = (dataset: V2Dataset): string[] =>
  Array.from(
    new Set([
      ...dataset.importFiles.flatMap((file) => file.safeWarningCodes),
      ...dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
    ]),
  ).slice(0, 5);

const productNameFromBusiness = (facts: readonly OwnedBusinessProductFact[], productId: string): string | null =>
  facts.find((fact) => fact.productId === productId)?.productName?.trim() || null;

const displayNameFor = ({
  tracked,
  businessFacts,
}: {
  tracked: TrackedProductRecord;
  businessFacts: readonly OwnedBusinessProductFact[];
}): string =>
  tracked.displayName?.trim() ||
  productNameFromBusiness(businessFacts, tracked.productId) ||
  tracked.productId;

const trackedHref = (tracked: Pick<TrackedProductRecord, "platformCode" | "storeId" | "trackedProductId">): string =>
  `/product-board?${new URLSearchParams({
    platform: tracked.platformCode,
    storeId: tracked.storeId,
    trackedProductId: tracked.trackedProductId,
  }).toString()}`;

const productManageHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/product-board/tracked?${new URLSearchParams({
    platform: store.platformCode,
    storeId: store.storeId,
  }).toString()}`;

const storeContextForProduct = ({
  dataset,
  store,
}: {
  dataset: V2Dataset;
  store: StoreRecord;
}): ProductBoardStoreContext => {
  const base = buildStoreContext({ dataset, store });
  return {
    ...base,
    availableStores: base.availableStores.map((item) => ({
      ...item,
      href: `/product-board?${new URLSearchParams({
        platform: item.platformCode,
        storeId: item.value.split(":")[1] ?? "",
      }).toString()}`,
    })),
    storeBoardHref: storeBoardHref(store),
    manageTrackedHref: productManageHref(store),
    historyHref: historyHrefForStore(dataset, store),
    qualityHref: `/upload/quality?${new URLSearchParams({
      platform: store.platformCode,
      storeId: store.storeId,
    }).toString()}`,
  };
};

const emptyMetrics = () =>
  buildProductMetricCards({
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

const emptyIdentity = (): ProductBoardIdentity => ({
  trackedProductId: null,
  productId: null,
  displayName: null,
  sourceRecord: null,
  dataStatus: "no_range_data",
  canonicalHref: null,
});

export const buildEmptyProductBoardViewModel = (message = "当前没有可用重点商品数据。"): ProductBoardViewModel => ({
  mode: "empty",
  title: "宝贝看板",
  description: "请选择当前店铺由用户主动添加的重点商品查看经营、推广、目标、趋势和售后安全聚合。",
  statusLabel: "暂无数据",
  statusTone: "slate",
  storeContext: null,
  selectedTrackedProduct: emptyIdentity(),
  trackedOptions: [],
  defaultDate: null,
  availableDates: [],
  dateRange: invalidDateRange("day"),
  metrics: emptyMetrics(),
  trendMetricOptions: [...TREND_METRIC_OPTIONS],
  trendPoints: [],
  targetProgress: [],
  adSummary: {
    hasAdData: false,
    adSpend: null,
    adSalesAmount: null,
    adRoi: null,
    impressions: null,
    clicks: null,
    clickRate: null,
  },
  afterSalesSummary: {
    hasAfterSalesData: false,
    refundAmount: null,
    refundOrderCount: null,
    afterSalesApplyCount: null,
    pendingCount: null,
    distributionCount: 0,
  },
  seriesMemberships: [],
  dataStatus: {
    activeDatasetStatus: "暂无数据",
    storeCount: 0,
    trackedProductCount: 0,
    warningCount: 0,
    issueCodes: [],
    qualityHref: "/upload",
  },
  primaryActions: [{ label: "数据导入", href: "/upload", tone: "blue" }],
  notices: [message],
  isEmpty: true,
});

export const buildInvalidProductBoardViewModel = ({
  mode,
  platformCode,
  storeId,
  message,
}: {
  mode: Exclude<ProductBoardDataMode, "v2_valid">;
  platformCode: string | null;
  storeId: string | null;
  message: string;
}): ProductBoardViewModel => ({
  ...buildEmptyProductBoardViewModel(message),
  mode,
  statusLabel:
    mode === "invalid_store"
      ? "店铺不可用"
      : mode === "invalid_tracked_product"
        ? "重点商品不可用"
        : mode === "not_tracked"
          ? "未设为重点商品"
          : mode === "no_tracked_products"
            ? "暂无重点商品"
            : mode === "legacy_untracked"
              ? "旧版单店数据"
              : mode === "tracked_product_no_data"
                ? "暂无商品事实"
                : mode === "corrupted"
                  ? "数据不可用"
                  : "暂无数据",
  statusTone: mode === "corrupted" ? "rose" : "amber",
  primaryActions: [
    {
      label: "管理重点商品",
      href: `/product-board/tracked?${new URLSearchParams({
        ...(platformCode ? { platform: platformCode } : {}),
        ...(storeId ? { storeId } : {}),
      }).toString()}`,
      tone: "blue",
    },
    {
      label: "返回店铺看板",
      href: `/store-board?${new URLSearchParams({
        ...(platformCode ? { platform: platformCode } : {}),
        ...(storeId ? { storeId } : {}),
      }).toString()}`,
      tone: "slate",
    },
  ],
});

const sortedActiveTrackedProducts = (items: readonly TrackedProductRecord[]): TrackedProductRecord[] =>
  [...items]
    .filter((item) => item.status === "active")
    .sort((left, right) => {
      const leftName = left.displayName?.trim() || left.productId;
      const rightName = right.displayName?.trim() || right.productId;
      return leftName.localeCompare(rightName, "zh-CN") || left.trackedProductId.localeCompare(right.trackedProductId);
    });

const productHasStoreFacts = ({
  dataset,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): boolean =>
  dataset.businessProductFacts.some(
    (fact) => fact.platformCode === platformCode && fact.storeId === storeId && fact.productId === productId,
  ) ||
  dataset.adProductFacts.some(
    (fact) => fact.platformCode === platformCode && fact.storeId === storeId && fact.productId === productId,
  );

const trackedOptionsFor = ({
  dataset,
  store,
}: {
  dataset: V2Dataset;
  store: Pick<StoreRecord, "platformCode" | "storeId">;
}): ProductBoardTrackedOption[] => {
  const scopedBusiness = dataset.businessProductFacts.filter(
    (fact) => fact.platformCode === store.platformCode && fact.storeId === store.storeId,
  );
  return sortedActiveTrackedProducts(
    dataset.trackedProducts.filter((item) => item.platformCode === store.platformCode && item.storeId === store.storeId),
  ).map((tracked) => {
    const hasBusiness = dataset.businessProductFacts.some(
      (fact) => fact.platformCode === store.platformCode && fact.storeId === store.storeId && fact.productId === tracked.productId,
    );
    const hasAd = dataset.adProductFacts.some(
      (fact) => fact.platformCode === store.platformCode && fact.storeId === store.storeId && fact.productId === tracked.productId,
    );
    return {
      trackedProductId: tracked.trackedProductId,
      productId: tracked.productId,
      displayName: displayNameFor({ tracked, businessFacts: scopedBusiness }),
      dataLabel: hasBusiness ? "有经营数据" : hasAd ? "仅推广数据" : "暂无事实数据",
      href: trackedHref(tracked),
    };
  });
};

export const buildV2ProductBoardViewModel = ({
  dataset,
  platformCode,
  storeId,
  trackedProductId,
  productId,
  selectedPeriod,
  selectedDate,
  customDateRange,
}: ProductBoardBuildInput): ProductBoardViewModel => {
  const stores = activeStores(dataset);
  const store = findStore(stores, platformCode, storeId);
  if (!store) {
    return buildInvalidProductBoardViewModel({
      mode: "invalid_store",
      platformCode,
      storeId,
      message: "未找到当前店铺的数据。请从首页或店铺看板选择已导入店铺进入。",
    });
  }

  const context = storeContextForProduct({ dataset, store });
  const trackedOptions = trackedOptionsFor({ dataset, store });
  if (trackedOptions.length === 0) {
    return {
      ...buildInvalidProductBoardViewModel({
        mode: "no_tracked_products",
        platformCode,
        storeId,
        message: "当前店铺还没有启用的重点商品，请先到重点商品管理页添加。",
      }),
      storeContext: context,
      dataStatus: {
        activeDatasetStatus: "多店铺数据可用",
        storeCount: stores.length,
        trackedProductCount: 0,
        warningCount: sourceWarningCount(dataset),
        issueCodes: issueCodesFor(dataset),
        qualityHref: context.qualityHref,
      },
    };
  }

  let selectedTrackedId = trackedProductId ?? null;
  let canonicalHref: string | null = null;
  if (!selectedTrackedId && productId) {
    const byProduct = dataset.trackedProducts.find(
      (item) =>
        item.status === "active" &&
        item.platformCode === platformCode &&
        item.storeId === storeId &&
        item.productId === productId,
    );
    if (!byProduct) {
      return {
        ...buildInvalidProductBoardViewModel({
          mode: productHasStoreFacts({ dataset, platformCode, storeId, productId }) ? "not_tracked" : "invalid_tracked_product",
          platformCode,
          storeId,
          message: productHasStoreFacts({ dataset, platformCode, storeId, productId })
            ? "该商品存在当前店铺事实数据，但尚未被用户添加为重点商品。请先到重点商品管理页添加后再查看看板。"
            : "当前商品不存在、已停用，或不属于当前店铺。",
        }),
        storeContext: context,
        trackedOptions,
      };
    }
    selectedTrackedId = byProduct.trackedProductId;
    canonicalHref = trackedHref(byProduct);
  }

  selectedTrackedId = selectedTrackedId ?? trackedOptions[0]!.trackedProductId;
  const selectedTracked = dataset.trackedProducts.find(
    (item) =>
      item.status === "active" &&
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.trackedProductId === selectedTrackedId,
  );
  if (!selectedTracked) {
    return {
      ...buildInvalidProductBoardViewModel({
        mode: "invalid_tracked_product",
        platformCode,
        storeId,
        message: "当前重点商品不存在、已停用，或不属于当前店铺。请返回重点商品列表重新选择。",
      }),
      storeContext: context,
      trackedOptions,
    };
  }

  const scopedBusiness = dataset.businessProductFacts.filter(
    (fact) => fact.platformCode === platformCode && fact.storeId === storeId,
  );
  const availableDates = v2DatesForProduct({ dataset, platformCode, storeId, productId: selectedTracked.productId });
  if (availableDates.length === 0) {
    return {
      ...buildInvalidProductBoardViewModel({
        mode: "tracked_product_no_data",
        platformCode,
        storeId,
        message: "当前重点商品尚未匹配到经营或商品推广事实。请检查导入文件或改选其他重点商品。",
      }),
      storeContext: context,
      trackedOptions,
      selectedTrackedProduct: {
        trackedProductId: selectedTracked.trackedProductId,
        productId: selectedTracked.productId,
        displayName: displayNameFor({ tracked: selectedTracked, businessFacts: scopedBusiness }),
        sourceRecord: selectedTracked,
        dataStatus: "no_range_data",
        canonicalHref,
      },
    };
  }

  const dateRange = buildProductBoardDateRange({ selectedPeriod, selectedDate, customDateRange, availableDates });
  const businessFacts = filterV2ProductBusinessFacts({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productId: selectedTracked.productId,
  });
  const adProductFacts = filterV2ProductAdFacts({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productId: selectedTracked.productId,
  });
  const afterSalesRange = filterV2ProductAfterSalesRangeAggregates({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productId: selectedTracked.productId,
  });
  const afterSalesSnapshots = filterV2ProductAfterSalesSnapshots({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productId: selectedTracked.productId,
  });
  const afterSalesDistribution = filterV2ProductAfterSalesDistributionItems({
    dataset,
    range: dateRange,
    platformCode,
    storeId,
    productId: selectedTracked.productId,
  });
  const metrics = aggregateProductMetrics({ businessFacts, adProductFacts });
  const warningCount = sourceWarningCount(dataset);
  const dataStatus =
    businessFacts.length > 0
      ? "business"
      : adProductFacts.length > 0
        ? "ad_only"
        : "no_range_data";

  return {
    mode: "v2_valid",
    title: "宝贝看板",
    description: "按当前店铺的用户重点商品查看经营、商品推广、目标、趋势和售后安全聚合。",
    statusLabel: warningCount > 0 ? "有数据提示" : "重点商品数据",
    statusTone: warningCount > 0 ? "amber" : "blue",
    storeContext: context,
    selectedTrackedProduct: {
      trackedProductId: selectedTracked.trackedProductId,
      productId: selectedTracked.productId,
      displayName: displayNameFor({ tracked: selectedTracked, businessFacts: scopedBusiness }),
      sourceRecord: selectedTracked,
      dataStatus,
      canonicalHref,
    },
    trackedOptions,
    defaultDate: availableDates[0] ?? v2DatesForActiveTrackedProducts({ dataset, platformCode, storeId })[0] ?? null,
    availableDates,
    dateRange,
    metrics: buildProductMetricCards(metrics),
    trendMetricOptions: [...TREND_METRIC_OPTIONS],
    trendPoints: buildV2ProductTrendPoints({ dataset, range: dateRange, platformCode, storeId, productId: selectedTracked.productId }),
    targetProgress: buildV2ProductTargetProgress({
      targets: dataset.targets,
      metrics,
      selectedPeriod,
      range: dateRange,
      platformCode,
      storeId,
      productId: selectedTracked.productId,
    }),
    adSummary: buildProductAdSummary(adProductFacts),
    afterSalesSummary: buildProductAfterSalesSummary({
      rangeAggregates: afterSalesRange,
      snapshots: afterSalesSnapshots,
      distributionItems: afterSalesDistribution,
    }),
    seriesMemberships: buildProductSeriesMemberships({ dataset, platformCode, storeId, productId: selectedTracked.productId }),
    dataStatus: {
      activeDatasetStatus: "多店铺数据可用",
      storeCount: stores.length,
      trackedProductCount: trackedOptions.length,
      warningCount,
      issueCodes: issueCodesFor(dataset),
      qualityHref: context.qualityHref,
    },
    primaryActions: [
      { label: "管理重点商品", href: context.manageTrackedHref, tone: "blue" },
      { label: "返回店铺看板", href: context.storeBoardHref, tone: "slate" },
    ],
    notices: [
      dateRange.coverageText,
      dataStatus === "ad_only"
        ? "当前重点商品只有商品推广数据，经营指标显示为 --。"
        : dataStatus === "no_range_data"
          ? "当前日期范围没有该商品的经营或推广事实，请切换日期范围。"
          : "当前只展示所选店铺和所选重点商品，不与其他店铺同 productId 合并。",
      adProductFacts.length === 0 ? "当前范围没有商品推广数据，推广指标显示为 --。" : "推广指标仅使用商品推广数据，不使用计划推广补齐。",
      afterSalesRange.length + afterSalesSnapshots.length + afterSalesDistribution.length > 0
        ? `当前范围有安全售后汇总，退款金额 ${formatMoney(safeSum(afterSalesRange, (item) => item.refundAmount))}。`
        : "当前范围暂无商品级安全售后汇总。",
    ],
    isEmpty: businessFacts.length === 0 && adProductFacts.length === 0,
  };
};

export const buildLegacyUntrackedProductBoardViewModel = (message: string): ProductBoardViewModel => ({
  ...buildInvalidProductBoardViewModel({
    mode: "legacy_untracked",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    message,
  }),
  statusLabel: "旧版单店数据",
  statusTone: "amber",
  primaryActions: [
    { label: "数据导入", href: "/upload", tone: "blue" },
    { label: "管理重点商品", href: "/product-board/tracked?platform=tmall&storeId=tmall-default-store", tone: "slate" },
  ],
});
