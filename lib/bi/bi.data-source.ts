import type { BIDataPoint, BIHomeDataMode, BIHomeDataStatus, BIMetricMap } from "./bi.types";
import type { BISearchProductKeyword, BISearchTotalKeyword } from "./search-keyword.types";
import { loadHomeCommandCenterContext } from "../v05/home-command-center";
import type {
  TargetDirection,
  TargetPeriodType,
  TargetRecord,
  TargetScope,
  V2Dataset,
} from "../v05/domain/models";
import {
  parseTmallSeriesGroupStorage,
  TMALL_SERIES_STORAGE_KEY,
} from "../storage/tmall-series-storage";
import {
  getRuntimeBIDataSet,
  getRuntimeETLIssues,
  restoreRuntimeDatasetFromSnapshot,
  type BIDataSet,
} from "../etl/runtime";
import type { TmallSeriesGroup } from "../storage/tmall-series-storage";
import type { TmallStoredAnalysisResult } from "../../types/tmall";
import type { TmallTargetDefinition } from "../../types/tmall-targets";
import {
  activeBrandWorkspace,
  DEFAULT_BRAND_ID,
  loadBrandWorkspaceState,
  runtimeDatabaseNameForBrand,
} from "../v2/workspace/brand-workspace";
import { homeSeriesDefinitions } from "../v2/workspace/brand-series";

export interface BIHomeSeriesDefinition {
  platformCode: string;
  platformName: string | null;
  storeId: string;
  storeName: string | null;
  seriesId: string;
  seriesName: string;
  productIds: string[];
}

export interface BIHomeTargetDefinition {
  targetId: string;
  scope: TargetScope;
  platformCode: string | null;
  storeId: string | null;
  seriesId: string | null;
  productId: string | null;
  periodType: TargetPeriodType;
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: TargetDirection;
  status: "active" | "paused" | "deleted";
}

export interface BIHomeDataSource {
  mode: BIHomeDataMode;
  points: BIDataPoint[];
  seriesPoints: BIDataPoint[];
  seriesDefinitions: BIHomeSeriesDefinition[];
  searchTotalKeywords: BISearchTotalKeyword[];
  searchProductKeywords: BISearchProductKeyword[];
  targets: BIHomeTargetDefinition[];
  dataStatus: BIHomeDataStatus;
  selectedDate: string | null;
  safeWarnings: string[];
  notices: string[];
}

export interface BIHomeDataSourceOptions {
  includeV05Persistence?: boolean;
  brandId?: string;
}

const DEFAULT_TMALL_STORE_ID = "tmall-default-store";
const DEFAULT_TMALL_STORE_NAME = "天猫默认店铺";

const PLATFORM_NAMES: Record<string, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

const safeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const safeMetricMap = (metrics: BIMetricMap): BIMetricMap =>
  Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, safeNumber(value)]),
  ) as BIMetricMap;

type BIHomePointInput = Omit<BIDataPoint, "metrics" | "seriesId" | "seriesName"> & {
  seriesId?: string | null;
  seriesName?: string | null;
  metrics: BIMetricMap;
};

const makePoint = ({
  platformCode,
  platformName,
  storeId,
  storeName,
  seriesId = null,
  seriesName = null,
  productId,
  productName,
  businessDate,
  metrics,
}: BIHomePointInput): BIDataPoint => ({
  platformCode,
  platformName,
  storeId,
  storeName,
  seriesId,
  seriesName,
  productId,
  productName,
  businessDate,
  metrics: safeMetricMap(metrics),
});

const latestDate = (dates: string[]): string | null => {
  const sorted = Array.from(new Set(dates.filter(Boolean))).sort();
  return sorted[sorted.length - 1] ?? null;
};

const monthOfDate = (date: string | null): string | null => date?.slice(0, 7) ?? null;

const seriesForProduct = (
  seriesDefinitions: BIHomeSeriesDefinition[],
  point: BIDataPoint,
): BIHomeSeriesDefinition[] =>
  seriesDefinitions.filter(
    (series) =>
      series.platformCode === point.platformCode &&
      series.storeId === point.storeId &&
      !!point.productId &&
      series.productIds.includes(point.productId),
  );

const buildSeriesPoints = (
  points: BIDataPoint[],
  seriesDefinitions: BIHomeSeriesDefinition[],
): BIDataPoint[] =>
  points.flatMap((point) =>
    seriesForProduct(seriesDefinitions, point).map((series) => ({
      ...point,
      seriesId: series.seriesId,
      seriesName: series.seriesName,
    })),
  );

const runtimeSeriesForSource = (
  points: BIDataPoint[],
  brand = activeBrandWorkspace(),
): { seriesDefinitions: BIHomeSeriesDefinition[]; seriesPoints: BIDataPoint[] } => {
  const storeLabels = new Map<string, { platformName: string | null; storeName: string | null }>();
  points.forEach((point) => {
    if (!point.storeId) return;
    const key = `${point.platformCode}::${point.storeId}`;
    if (!storeLabels.has(key)) {
      storeLabels.set(key, { platformName: point.platformName, storeName: point.storeName });
    }
  });
  const seriesDefinitions = homeSeriesDefinitions(brand, storeLabels);
  return { seriesDefinitions, seriesPoints: buildSeriesPoints(points, seriesDefinitions) };
};

const normalizeV2Targets = (targets: TargetRecord[]): BIHomeTargetDefinition[] =>
  targets.map((target) => ({
    targetId: target.targetId,
    scope: target.scope,
    platformCode: target.platformCode ?? null,
    storeId: target.storeId ?? null,
    seriesId: target.seriesId ?? null,
    productId: target.productId ?? null,
    periodType: target.periodType,
    periodValue: target.periodValue,
    metricKey: target.metricKey,
    targetValue: target.targetValue,
    direction: target.direction,
    status: target.status,
  }));

const normalizeLegacyTargets = (targets: TmallTargetDefinition[]): BIHomeTargetDefinition[] =>
  targets.map((target) => ({
    targetId: target.id,
    scope: target.scope,
    platformCode: "tmall",
    storeId: DEFAULT_TMALL_STORE_ID,
    seriesId: target.seriesId ?? null,
    productId: target.productId ?? null,
    periodType: target.periodType,
    periodValue: target.periodValue,
    metricKey: target.metricKey,
    targetValue: target.targetValue,
    direction: target.direction,
    status: target.status === "paused" ? "paused" : "active",
  }));

const readLegacySeriesGroups = (): TmallSeriesGroup[] => {
  if (typeof window === "undefined") return [];
  const parsed = parseTmallSeriesGroupStorage(window.localStorage.getItem(TMALL_SERIES_STORAGE_KEY));
  return parsed.status === "valid" ? parsed.groups : [];
};

const buildV2SeriesDefinitions = (dataset: V2Dataset): BIHomeSeriesDefinition[] => {
  const storeByKey = new Map(
    dataset.stores.map((store) => [`${store.platformCode}:${store.storeId}`, store]),
  );

  return dataset.series
    .filter((series) => series.status === "active")
    .map((series) => {
      const store = storeByKey.get(`${series.platformCode}:${series.storeId}`);
      return {
        platformCode: series.platformCode,
        platformName: PLATFORM_NAMES[series.platformCode] ?? series.platformCode,
        storeId: series.storeId,
        storeName: store?.storeName ?? null,
        seriesId: series.seriesId,
        seriesName: series.name,
        productIds: [...series.productIds],
      };
    });
};

const buildLegacySeriesDefinitions = (): BIHomeSeriesDefinition[] =>
  readLegacySeriesGroups().map((group) => ({
    platformCode: "tmall",
    platformName: PLATFORM_NAMES.tmall,
    storeId: DEFAULT_TMALL_STORE_ID,
    storeName: DEFAULT_TMALL_STORE_NAME,
    seriesId: group.id,
    seriesName: group.name,
    productIds: [...group.productIds],
  }));

const productNameMapForV2 = (dataset: V2Dataset): Map<string, string> => {
  const names = new Map<string, string>();
  dataset.businessProductFacts.forEach((fact) => {
    if (fact.productName?.trim()) {
      names.set(`${fact.platformCode}:${fact.storeId}:${fact.productId}`, fact.productName);
    }
  });
  return names;
};

const productNameMapForLegacy = (analysis: TmallStoredAnalysisResult): Map<string, string> => {
  const names = new Map<string, string>();
  analysis.productDailyFacts.forEach((fact) => {
    if (fact.productName?.trim()) {
      names.set(`tmall:${DEFAULT_TMALL_STORE_ID}:${fact.productId}`, fact.productName);
    }
  });
  return names;
};

const productNameMapForETL = (dataset: BIDataSet): Map<string, string> => {
  const names = new Map<string, string>();
  (dataset.products ?? []).forEach((product) => {
    if (product.name?.trim()) {
      names.set(`${product.platformCode}:${product.storeId}:${product.productId}`, product.name);
    }
  });
  return names;
};

const normalizeETLSearchTotalKeywords = (dataset: BIDataSet): BISearchTotalKeyword[] =>
  (dataset.searchTotalKeywords ?? []).map((row) => ({
    platformCode: row.platformCode,
    platformName: row.platformName ?? PLATFORM_NAMES[row.platformCode] ?? null,
    storeId: row.storeId,
    storeName: row.storeName ?? null,
    date: row.date ?? null,
    keyword: row.keyword,
    visitors: safeNumber(row.visitors),
    buyers: safeNumber(row.buyers),
    gmv: safeNumber(row.gmv),
  }));

const normalizeETLSearchProductKeywords = (dataset: BIDataSet): BISearchProductKeyword[] =>
  (dataset.searchProductKeywords ?? []).map((row) => ({
    platformCode: row.platformCode,
    platformName: row.platformName ?? PLATFORM_NAMES[row.platformCode] ?? null,
    storeId: row.storeId,
    storeName: row.storeName ?? null,
    date: row.date ?? null,
    productId: row.productId,
    keyword: row.keyword,
    visitors: safeNumber(row.visitors),
    buyers: safeNumber(row.buyers),
  }));

const buildETLPoints = (
  dataset: BIDataSet,
  persistenceMode: "memory" | "persisted" = "memory",
): {
  points: BIDataPoint[];
  searchTotalKeywords: BISearchTotalKeyword[];
  searchProductKeywords: BISearchProductKeyword[];
  notices: string[];
} => {
  const productNames = productNameMapForETL(dataset);
  const points: BIDataPoint[] = [];
  const productMetrics = dataset.productMetrics ?? [];
  const planMetrics = dataset.planMetrics ?? [];
  const productLevelPlanMetrics = planMetrics.filter((metric) => !!metric.productId);
  const fallbackPlanMetrics = productLevelPlanMetrics.length > 0 ? productLevelPlanMetrics : planMetrics;
  const afterSalesMetrics = dataset.afterSalesMetrics ?? [];
  const searchTotalKeywords = dataset.searchTotalKeywords ?? [];
  const searchProductKeywords = dataset.searchProductKeywords ?? [];

  productMetrics.forEach((metric) => {
    points.push(makePoint({
      platformCode: metric.platformCode,
      platformName: metric.platformName ?? PLATFORM_NAMES[metric.platformCode] ?? metric.platformCode,
      storeId: metric.storeId,
      storeName: metric.storeName,
      productId: metric.productId,
      productName: productNames.get(`${metric.platformCode}:${metric.storeId}:${metric.productId}`) ?? null,
      businessDate: metric.date,
      metrics: {
        gmv: metric.gmv,
        gsv: metric.gsv,
        visitors: metric.visitors,
        paidBuyers: metric.buyers,
      },
    }));
  });

  fallbackPlanMetrics.forEach((metric) => {
    const adRevenue =
      typeof metric.spend === "number" &&
      Number.isFinite(metric.spend) &&
      typeof metric.roi === "number" &&
      Number.isFinite(metric.roi)
        ? metric.spend * metric.roi
        : null;
    points.push(makePoint({
      platformCode: metric.platformCode,
      platformName: metric.platformName ?? PLATFORM_NAMES[metric.platformCode] ?? metric.platformCode,
      storeId: metric.storeId,
      storeName: metric.storeName,
      productId: metric.productId,
      productName: productNames.get(`${metric.platformCode}:${metric.storeId}:${metric.productId}`) ?? null,
      businessDate: metric.date,
      metrics: {
        adSpend: metric.spend,
        adRevenue,
        adClicks: metric.clicks,
        directTransactionAmount: metric.directTransactionAmount,
        indirectTransactionAmount: metric.indirectTransactionAmount,
        totalTransactionAmount: metric.totalTransactionAmount,
      },
    }));
  });

  afterSalesMetrics.forEach((metric) => {
    const productName = metric.productId
      ? productNames.get(`${metric.platformCode}:${metric.storeId}:${metric.productId}`) ?? null
      : null;
    points.push(makePoint({
      platformCode: metric.platformCode,
      platformName: metric.platformName ?? PLATFORM_NAMES[metric.platformCode] ?? metric.platformCode,
      storeId: metric.storeId,
      storeName: metric.storeName,
      productId: metric.productId,
      productName,
      businessDate: metric.date,
      metrics: {
        refundAmount: metric.refundAmount,
        refundCount: metric.refundCount,
        shippedRefundAmount: metric.shippedRefundAmount,
        shippedRefundCount: metric.shippedRefundCount,
        signedRefundAmount: metric.signedRefundAmount,
        signedRefundCount: metric.signedRefundCount,
      },
    }));
  });

  const notices = [
    persistenceMode === "persisted"
      ? "已恢复上次安全聚合数据，刷新页面后可继续查看。"
      : "当前显示本次上传的 ETL 运行时数据；通过上传页导入的数据会保存为安全聚合快照。",
    productLevelPlanMetrics.length > 0 && productLevelPlanMetrics.length !== planMetrics.length
      ? "已接收计划级推广文件，但当前广告指标仍优先使用商品级推广，避免与商品口径重复相加。"
      : productLevelPlanMetrics.length === 0 && planMetrics.length > 0
        ? "当前缺少商品级推广数据，广告指标临时回落到计划级推广汇总。"
        : "当前广告指标使用商品级推广口径。",
    `搜索词总表 ${searchTotalKeywords.length} 条，商品搜索词 ${searchProductKeywords.length} 条，售后安全聚合 ${afterSalesMetrics.length} 条。`,
  ];

  return {
    points,
    searchTotalKeywords: normalizeETLSearchTotalKeywords(dataset),
    searchProductKeywords: normalizeETLSearchProductKeywords(dataset),
    notices,
  };
};

const buildV2Points = (dataset: V2Dataset): { points: BIDataPoint[]; notices: string[] } => {
  const productNames = productNameMapForV2(dataset);
  const storeByKey = new Map(
    dataset.stores.map((store) => [`${store.platformCode}:${store.storeId}`, store]),
  );
  const points: BIDataPoint[] = [];

  dataset.businessProductFacts.forEach((fact) => {
    const store = storeByKey.get(`${fact.platformCode}:${fact.storeId}`);
    points.push(makePoint({
      platformCode: fact.platformCode,
      platformName: PLATFORM_NAMES[fact.platformCode] ?? fact.platformCode,
      storeId: fact.storeId,
      storeName: store?.storeName ?? null,
      productId: fact.productId,
      productName: fact.productName,
      businessDate: fact.businessDate,
      metrics: {
        gmv: fact.gmv,
        gsv: fact.gsv,
        visitors: fact.visitors,
        paidBuyers: fact.paidBuyers,
      },
    }));
  });

  const hasAdProductFacts = dataset.adProductFacts.length > 0;
  const adFacts = hasAdProductFacts ? dataset.adProductFacts : dataset.adPlanFacts;
  adFacts.forEach((fact) => {
    const productId = "productId" in fact ? fact.productId : null;
    const productName = productId ? productNames.get(`${fact.platformCode}:${fact.storeId}:${productId}`) ?? null : null;
    const store = storeByKey.get(`${fact.platformCode}:${fact.storeId}`);
    points.push(makePoint({
      platformCode: fact.platformCode,
      platformName: PLATFORM_NAMES[fact.platformCode] ?? fact.platformCode,
      storeId: fact.storeId,
      storeName: store?.storeName ?? null,
      productId,
      productName,
      businessDate: fact.businessDate,
      metrics: {
        adSpend: fact.adSpend,
        adRevenue: fact.adSalesAmount,
        adClicks: fact.clicks,
      },
    }));
  });

  dataset.afterSalesDailyAggregates.forEach((fact) => {
    const productName = fact.productId
      ? productNames.get(`${fact.platformCode}:${fact.storeId}:${fact.productId}`) ?? null
      : null;
    const store = storeByKey.get(`${fact.platformCode}:${fact.storeId}`);
    points.push(makePoint({
      platformCode: fact.platformCode,
      platformName: PLATFORM_NAMES[fact.platformCode] ?? fact.platformCode,
      storeId: fact.storeId,
      storeName: store?.storeName ?? null,
      productId: fact.productId,
      productName,
      businessDate: fact.businessDate,
      metrics: {
        refundAmount: fact.refundAmount,
        refundCount: fact.refundOrderCount,
      },
    }));
  });

  const notices = [
    hasAdProductFacts
      ? "推广口径优先使用商品推广，计划推广不与商品推广重复相加。"
      : "当前缺少商品推广事实，推广口径使用计划推广汇总。",
  ];

  return { points, notices };
};

const buildLegacyPoints = (analysis: TmallStoredAnalysisResult): { points: BIDataPoint[]; notices: string[] } => {
  const productNames = productNameMapForLegacy(analysis);
  const points: BIDataPoint[] = [];

  analysis.productDailyFacts.forEach((fact) => {
    points.push(makePoint({
      platformCode: "tmall",
      platformName: PLATFORM_NAMES.tmall,
      storeId: DEFAULT_TMALL_STORE_ID,
      storeName: DEFAULT_TMALL_STORE_NAME,
      productId: fact.productId,
      productName: fact.productName,
      businessDate: fact.date,
      metrics: {
        gmv: fact.gmv,
        gsv: fact.gsv,
        visitors: fact.visitors,
        paidBuyers: fact.paidBuyers,
        refundAmount: fact.refundSuccessAmount,
      },
    }));
  });

  const hasAdProductFacts = analysis.adProductDailyFacts.length > 0;
  const adFacts = hasAdProductFacts ? analysis.adProductDailyFacts : analysis.adPlanDailyFacts;
  adFacts.forEach((fact) => {
    const productId = "productId" in fact ? fact.productId : null;
    points.push(makePoint({
      platformCode: "tmall",
      platformName: PLATFORM_NAMES.tmall,
      storeId: DEFAULT_TMALL_STORE_ID,
      storeName: DEFAULT_TMALL_STORE_NAME,
      productId,
      productName: productId ? productNames.get(`tmall:${DEFAULT_TMALL_STORE_ID}:${productId}`) ?? null : null,
      businessDate: fact.date,
      metrics: {
        adSpend: fact.adSpend,
        adRevenue: "adTransactionAmount" in fact ? fact.adTransactionAmount : fact.transactionAmount,
        adClicks: fact.clicks,
        directTransactionAmount: "directTransactionAmount" in fact ? fact.directTransactionAmount : null,
      },
    }));
  });

  analysis.afterSalesAggregates.bySuccessDate.forEach((fact) => {
    points.push(makePoint({
      platformCode: "tmall",
      platformName: PLATFORM_NAMES.tmall,
      storeId: DEFAULT_TMALL_STORE_ID,
      storeName: DEFAULT_TMALL_STORE_NAME,
      productId: null,
      productName: null,
      businessDate: fact.date,
      metrics: {
        refundAmount: fact.refundSuccessTotalAmount,
        refundCount: fact.refundSuccessCount,
      },
    }));
  });

  const notices = [
    hasAdProductFacts
      ? "推广口径优先使用商品推广，计划推广不与商品推广重复相加。"
      : "当前缺少商品推广事实，推广口径使用计划推广汇总。",
  ];

  return { points, notices };
};

const buildStatus = ({
  mode,
  points,
  warningCodes,
  label,
}: {
  mode: BIHomeDataMode;
  points: BIDataPoint[];
  warningCodes: string[];
  label: string;
}): BIHomeDataStatus => ({
  mode,
  label,
  storeCount: new Set(points.map((point) => point.storeId).filter(Boolean)).size,
  platformCount: new Set(points.map((point) => point.platformCode).filter(Boolean)).size,
  hasRealData: points.length > 0,
  safeWarnings: warningCodes.slice(0, 5),
});

export const loadHomeBIDataSource = async ({
  includeV05Persistence = true,
  brandId,
}: BIHomeDataSourceOptions = {}): Promise<BIHomeDataSource> => {
  const brandState = loadBrandWorkspaceState();
  const requestedBrand = brandId
    ? brandState.brands.find((brand) => brand.id === brandId) ?? activeBrandWorkspace(brandState)
    : activeBrandWorkspace(brandState);
  const runtimeDataset = getRuntimeBIDataSet(requestedBrand.id);
  if (runtimeDataset) {
    const { points, searchTotalKeywords, searchProductKeywords, notices } = buildETLPoints(runtimeDataset);
    const warningCodes = Array.from(new Set(getRuntimeETLIssues(requestedBrand.id).map((issue) => issue.code)));
    const series = runtimeSeriesForSource(points, requestedBrand);

    return {
      mode: "v2_valid",
      points,
      seriesPoints: series.seriesPoints,
      seriesDefinitions: series.seriesDefinitions,
      searchTotalKeywords,
      searchProductKeywords,
      targets: [],
      selectedDate: latestDate(points.map((point) => point.businessDate)),
      safeWarnings: warningCodes.slice(0, 5),
      notices,
      dataStatus: buildStatus({ mode: "v2_valid", points, warningCodes, label: "ETL运行时数据" }),
    };
  }

  const restored = await restoreRuntimeDatasetFromSnapshot({
    brandId: requestedBrand.id,
    databaseName: runtimeDatabaseNameForBrand(requestedBrand.id),
  });
  if (restored.status === "restored") {
    const warningCodes = restored.snapshot.safeIssues.map((issue) => issue.code);
    const { points, searchTotalKeywords, searchProductKeywords, notices } = buildETLPoints(
      restored.snapshot.dataset,
      "persisted",
    );
    const series = runtimeSeriesForSource(points, requestedBrand);

    return {
      mode: "v2_valid",
      points,
      seriesPoints: series.seriesPoints,
      seriesDefinitions: series.seriesDefinitions,
      searchTotalKeywords,
      searchProductKeywords,
      targets: [],
      selectedDate: latestDate(points.map((point) => point.businessDate)),
      safeWarnings: warningCodes.slice(0, 5),
      notices,
      dataStatus: buildStatus({ mode: "v2_valid", points, warningCodes, label: "已恢复上次安全聚合数据" }),
    };
  }

  if (!includeV05Persistence || requestedBrand.id !== DEFAULT_BRAND_ID) {
    return {
      mode: "empty",
      points: [],
      seriesPoints: [],
      seriesDefinitions: [],
      searchTotalKeywords: [],
      searchProductKeywords: [],
      targets: [],
      selectedDate: null,
      safeWarnings: [],
      notices: ["当前没有可用经营数据。"],
      dataStatus: buildStatus({ mode: "empty", points: [], warningCodes: [], label: "暂无数据" }),
    };
  }

  const loadResult = await loadHomeCommandCenterContext();
  const context = loadResult.context;

  if (!context) {
    return {
      mode: "empty",
      points: [],
      seriesPoints: [],
      seriesDefinitions: [],
      searchTotalKeywords: [],
      searchProductKeywords: [],
      targets: [],
      selectedDate: null,
      safeWarnings: [],
      notices: ["当前没有可用经营数据。"],
      dataStatus: buildStatus({ mode: "empty", points: [], warningCodes: [], label: "暂无数据" }),
    };
  }

  if (context.dataset) {
    const seriesDefinitions = buildV2SeriesDefinitions(context.dataset);
    const { points, notices } = buildV2Points(context.dataset);
    const warningCodes = Array.from(
      new Set([
        ...context.dataset.importFiles.flatMap((file) => file.safeWarningCodes),
        ...context.dataset.migrationManifests.flatMap((manifest) => manifest.safeIssueCodes),
        ...context.v2IssueCodes,
      ]),
    );

    return {
      mode: "v2_valid",
      points,
      seriesPoints: buildSeriesPoints(points, seriesDefinitions),
      seriesDefinitions,
      searchTotalKeywords: [],
      searchProductKeywords: [],
      targets: normalizeV2Targets(context.dataset.targets),
      selectedDate: latestDate(points.map((point) => point.businessDate)),
      safeWarnings: warningCodes.slice(0, 5),
      notices,
      dataStatus: buildStatus({ mode: "v2_valid", points, warningCodes, label: "多店铺真实数据" }),
    };
  }

  if (context.legacyAnalysis) {
    const seriesDefinitions = buildLegacySeriesDefinitions();
    const { points, notices } = buildLegacyPoints(context.legacyAnalysis);
    const warningCodes = context.legacyAnalysis.dataQualityWarnings.slice(0, 5).map((_warning, index) => `legacy_warning_${index + 1}`);
    const mode = context.mode === "v2_corrupted_with_legacy_fallback" ? "v2_corrupted_with_legacy_fallback" : "legacy_fallback";

    return {
      mode,
      points,
      seriesPoints: buildSeriesPoints(points, seriesDefinitions),
      seriesDefinitions,
      searchTotalKeywords: [],
      searchProductKeywords: [],
      targets: normalizeLegacyTargets(context.legacyTargets),
      selectedDate: latestDate(points.map((point) => point.businessDate)),
      safeWarnings: warningCodes,
      notices: [context.message, ...notices],
      dataStatus: buildStatus({
        mode,
        points,
        warningCodes,
        label: mode === "legacy_fallback" ? "旧版单店真实数据" : "V2异常，显示旧版单店数据",
      }),
    };
  }

  return {
    mode: context.mode,
    points: [],
    seriesPoints: [],
    seriesDefinitions: [],
    searchTotalKeywords: [],
    searchProductKeywords: [],
    targets: [],
    selectedDate: null,
    safeWarnings: context.v2IssueCodes.slice(0, 5),
    notices: [context.message],
    dataStatus: buildStatus({
      mode: context.mode,
      points: [],
      warningCodes: context.v2IssueCodes,
      label: context.mode === "corrupted" ? "数据需修复" : "暂无数据",
    }),
  };
};

export const createEmptyHomeBIDataSource = (
  mode: BIHomeDataMode = "empty",
  label = "暂无数据",
): BIHomeDataSource => ({
  mode,
  points: [],
  seriesPoints: [],
  seriesDefinitions: [],
  searchTotalKeywords: [],
  searchProductKeywords: [],
  targets: [],
  selectedDate: null,
  safeWarnings: [],
  notices: [mode === "loading" ? "正在读取经营数据。" : "当前没有可用经营数据。"],
  dataStatus: buildStatus({ mode, points: [], warningCodes: [], label }),
});

export const selectedMonthForBI = (date: string | null): string | null => monthOfDate(date);
