import fs from "node:fs";
import path from "node:path";
import {
  buildV2SeriesBoardViewModel,
  buildLegacySeriesBoardViewModel,
  isLegacyDefaultSeriesRequest,
} from "../../lib/v05/series-board";
import {
  V2_SCHEMA_VERSION,
  type StoreRecord,
  type V2Dataset,
} from "../../lib/v05/domain/models";
import { stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";

const ROOT = process.cwd();
const E1_COMPLETION = "docs/project/task-completions/V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT.json";
const LOCK = "docs/project/v0.5-lock.json";
const NOW = "2026-06-22T23:30:00.000Z";

interface Check {
  name: string;
  pass: boolean;
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

const storeRecord = (storeId: string, storeName: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  storeName,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const dataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "v05e2-audit-dataset",
  platforms: [{
    schemaVersion: V2_SCHEMA_VERSION,
    platformCode: "tmall",
    platformName: "天猫",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  }],
  stores: [storeRecord("tmall-default-store", "天猫默认店铺"), storeRecord("tmall-second-store", "天猫第二店铺")],
  importBatches: [],
  importFiles: [],
  businessProductFacts: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "business_product",
      importBatchId: "batch-default",
      productId: "same-product",
      productName: "默认店同 ID 商品",
      gmv: 100,
      gsv: 90,
      visitors: 20,
      paidBuyers: 5,
      paidOrders: 5,
      conversionRate: 0.25,
      avgOrderValue: 20,
      favorites: null,
      cartAdditions: null,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "business_product",
      importBatchId: "batch-default",
      productId: "default-only",
      productName: "默认店专属商品",
      gmv: 50,
      gsv: 40,
      visitors: 10,
      paidBuyers: 2,
      paidOrders: 2,
      conversionRate: 0.2,
      avgOrderValue: 25,
      favorites: null,
      cartAdditions: null,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-second-store",
      businessDate: "2026-06-18",
      sourceType: "business_product",
      importBatchId: "batch-second",
      productId: "same-product",
      productName: "第二店同 ID 商品",
      gmv: 80,
      gsv: 70,
      visitors: 16,
      paidBuyers: 4,
      paidOrders: 4,
      conversionRate: 0.25,
      avgOrderValue: 20,
      favorites: null,
      cartAdditions: null,
    },
  ],
  adProductFacts: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "ad_product",
      importBatchId: "batch-default",
      productId: "ad-only-default",
      adSpend: 10,
      adSalesAmount: 30,
      impressions: 100,
      clicks: 8,
      clickRate: 0.08,
      adRoi: 3,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-second-store",
      businessDate: "2026-06-18",
      sourceType: "ad_product",
      importBatchId: "batch-second",
      productId: "same-product",
      adSpend: 5,
      adSalesAmount: 10,
      impressions: 60,
      clicks: 5,
      clickRate: 0.08,
      adRoi: 2,
    },
  ],
  adPlanFacts: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "ad_plan",
      importBatchId: "batch-default",
      planId: "plan-should-not-count",
      planName: "计划推广不可补商品推广",
      adSpend: 999,
      adSalesAmount: 999,
      impressions: 999,
      clicks: 999,
      adRoi: 1,
    },
  ],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      sourceType: "after_sales",
      importBatchId: "batch-default",
      dateRange: { start: "2026-06-18", end: "2026-06-18" },
      dateBasis: "success_date",
      productId: "same-product",
      refundAmount: 10,
      refundOrderCount: 1,
      afterSalesApplyCount: null,
    },
  ],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId: "series-default-core",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      name: "核心系列",
      productIds: ["same-product", "ad-only-default"],
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId: "series-second-core",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      name: "核心系列",
      productIds: ["same-product"],
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId: "series-inactive",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      name: "停用系列",
      productIds: ["default-only"],
      status: "inactive",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId: "series-empty",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      name: "空系列",
      productIds: [],
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  trackedProducts: [],
  targets: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: "target-series-gmv",
      scope: "series",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      seriesId: "series-default-core",
      periodType: "daily",
      periodValue: "2026-06-18",
      metricKey: "gmv",
      targetValue: 100,
      direction: "higher_is_better",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: "target-week-ignore",
      scope: "series",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      seriesId: "series-default-core",
      periodType: "monthly",
      periodValue: "2026-06",
      metricKey: "gmv",
      targetValue: 3000,
      direction: "higher_is_better",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  legacyTargetCandidates: [],
  migrationManifests: [],
  activeDatasetPointer: null,
});

const noInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(noInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).every(noInvalidNumber);
  return true;
};

const noUndefined = (value: unknown): boolean => {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.every(noUndefined);
  if (value && typeof value === "object") return Object.values(value).every(noUndefined);
  return true;
};

const noSensitiveText = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return ![
    "订单编号",
    "退款编号",
    "支付宝交易号",
    "手机号",
    "电话",
    "地址",
    "收件人",
    "买家退款说明",
    "商家备注",
    "物流单号",
    "物流信息",
  ].some((keyword) => text.includes(keyword));
};

const main = () => {
  const completion = readJson<{ taskId: string; status: string; commandResults: Array<{ status: string }> }>(E1_COMPLETION);
  const lock = readJson<{ stageStatuses: Record<string, string> }>(LOCK);
  const source = dataset();
  const before = stablePersistenceStringify(source);
  const defaultView = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-default-core",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const secondView = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-second-store",
    seriesId: "series-second-core",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const weekView = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-default-core",
    selectedPeriod: "week",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const emptySeriesView = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-empty",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const invalidStore = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "missing-store",
    seriesId: null,
    selectedPeriod: "day",
    selectedDate: null,
    customDateRange: { start: null, end: null },
  });
  const invalidSeries = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-second-core",
    selectedPeriod: "day",
    selectedDate: null,
    customDateRange: { start: null, end: null },
  });
  const legacyFallback = buildLegacySeriesBoardViewModel({
    analysis: {
      productDailyFacts: [{
        date: "2026-06-18",
        productId: "legacy-product",
        productName: "旧版商品",
        gmv: 10,
        gsv: 9,
        refundSuccessAmount: 1,
        visitors: 5,
        paidBuyers: 1,
        paidOrders: 1,
        conversionRate: 0.2,
        avgOrderValue: 10,
        favorites: 0,
        cartAdditions: 0,
      }],
      adProductDailyFacts: [],
      adPlanDailyFacts: [],
      dataQualityWarnings: [],
    } as never,
    legacySeriesGroups: [{
      id: "legacy-series",
      name: "旧版系列",
      productIds: ["legacy-product"],
      createdAt: NOW,
      updatedAt: NOW,
    }],
    targets: [],
    seriesId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const after = stablePersistenceStringify(source);

  const adOnlyRow = defaultView.productRows.find((row) => row.productId === "ad-only-default");
  const checks: Check[] = [
    { name: "E1 completion record valid", pass: completion.taskId === "V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT" && completion.status === "complete" && completion.commandResults.every((item) => item.status === "PASS") },
    { name: "stage statuses valid", pass: lock.stageStatuses["V0.5A"] === "complete" && lock.stageStatuses["V0.5B"] === "complete" && lock.stageStatuses["V0.5C"] === "complete" && lock.stageStatuses["V0.5D"] === "complete" && lock.stageStatuses["V0.5E"] === "pending" },
    { name: "only active series shown", pass: !defaultView.seriesOptions.some((item) => item.seriesId === "series-inactive") },
    { name: "platform store filtering before series filtering", pass: defaultView.productRows.every((row) => row.productId !== "default-only") && secondView.productRows.length === 1 },
    { name: "cross-store same name isolated", pass: defaultView.selectedSeriesId === "series-default-core" && secondView.selectedSeriesId === "series-second-core" && defaultView.selectedSeriesName === secondView.selectedSeriesName },
    { name: "same product id cross-store isolated", pass: defaultView.metrics.find((item) => item.key === "gmv")?.value === 100 && secondView.metrics.find((item) => item.key === "gmv")?.value === 80 },
    { name: "gmv gsv visitors buyers correct", pass: defaultView.metrics.find((item) => item.key === "gmv")?.value === 100 && defaultView.metrics.find((item) => item.key === "gsv")?.value === 90 && defaultView.metrics.find((item) => item.key === "visitors")?.value === 20 && defaultView.metrics.find((item) => item.key === "paidBuyers")?.value === 5 },
    { name: "conversion by aggregate numerator denominator", pass: defaultView.metrics.find((item) => item.key === "conversionRate")?.value === 0.25 },
    { name: "ad plan does not backfill product ads", pass: defaultView.metrics.find((item) => item.key === "ad")?.value === 10 },
    { name: "ad-only product retained", pass: adOnlyRow?.dataStatus === "ad_only" && adOnlyRow.gmv === null && adOnlyRow.adSpend === 10 },
    { name: "series target scope correct", pass: defaultView.targetProgress.length === 1 && defaultView.targetProgress[0]?.targetId === "target-series-gmv" },
    { name: "week target not folded", pass: weekView.targetProgress.length === 0 },
    { name: "missing dates not filled", pass: defaultView.trendPoints.length === 1 },
    { name: "legacy fallback default only helper", pass: isLegacyDefaultSeriesRequest({ platformCode: "tmall", storeId: "tmall-default-store" }) && !isLegacyDefaultSeriesRequest({ platformCode: "tmall", storeId: "tmall-second-store" }) && legacyFallback.mode === "legacy_fallback" },
    { name: "empty series safe", pass: emptySeriesView.mode === "empty_series" && emptySeriesView.productRows.length === 0 },
    { name: "invalid store safe", pass: invalidStore.mode === "invalid_store" },
    { name: "invalid series safe", pass: invalidSeries.mode === "invalid_series" },
    { name: "dataset not mutated", pass: before === after },
    { name: "no undefined", pass: noUndefined({ defaultView, secondView, weekView, emptySeriesView, invalidStore, invalidSeries, legacyFallback }) },
    { name: "no NaN Infinity", pass: noInvalidNumber({ defaultView, secondView, weekView, emptySeriesView, invalidStore, invalidSeries, legacyFallback }) },
    { name: "privacy safe", pass: noSensitiveText({ defaultView, secondView, legacyFallback }) },
    { name: "no new dependency", pass: !fs.readFileSync(path.join(ROOT, "package.json"), "utf8").includes("playwright") && !fs.readFileSync(path.join(ROOT, "package.json"), "utf8").includes("puppeteer") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e2-series-board-data",
    failedChecks,
    metrics: {
      defaultGmv: defaultView.metrics.find((item) => item.key === "gmv")?.value,
      secondGmv: secondView.metrics.find((item) => item.key === "gmv")?.value,
      defaultAdSpend: defaultView.metrics.find((item) => item.key === "ad")?.value,
    },
    adOnlyStatus: adOnlyRow?.dataStatus ?? null,
    modes: {
      default: defaultView.mode,
      second: secondView.mode,
      emptySeries: emptySeriesView.mode,
      invalidStore: invalidStore.mode,
      invalidSeries: invalidSeries.mode,
      legacyFallback: legacyFallback.mode,
    },
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
