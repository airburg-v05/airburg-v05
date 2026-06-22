import fs from "node:fs";
import path from "node:path";
import {
  buildV2ProductBoardViewModel,
} from "../../lib/v05/product-board";
import {
  V2_SCHEMA_VERSION,
  type StoreRecord,
  type V2Dataset,
} from "../../lib/v05/domain/models";
import { stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";

const ROOT = process.cwd();
const E2_COMPLETION = "docs/project/task-completions/V0.5E_2_STORE_SCOPED_USER_DEFINED_SERIES_BOARD_RELAYOUT.json";
const LOCK = "docs/project/v0.5-lock.json";
const NOW = "2026-06-23T00:20:00.000Z";

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
  datasetId: "v05e3-audit-dataset",
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
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-19",
      sourceType: "business_product",
      importBatchId: "batch-default",
      productId: "not-tracked",
      productName: "未跟踪商品",
      gmv: 50,
      gsv: 45,
      visitors: 10,
      paidBuyers: 2,
      paidOrders: 2,
      conversionRate: 0.2,
      avgOrderValue: 25,
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
      productId: "same-product",
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
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "ad_product",
      importBatchId: "batch-default",
      productId: "ad-only-default",
      adSpend: 20,
      adSalesAmount: 50,
      impressions: 300,
      clicks: 12,
      clickRate: 0.04,
      adRoi: 2.5,
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
  afterSalesOperationalSnapshots: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      sourceType: "after_sales",
      importBatchId: "batch-default",
      capturedAt: NOW,
      dateRange: { start: "2026-06-18", end: "2026-06-18" },
      productId: "same-product",
      pendingCount: 2,
      overduePendingCount: 1,
      customerServiceInterventionCount: 0,
      avgAfterSalesDurationHours: null,
    },
  ],
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
  ],
  trackedProducts: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      trackedProductId: "tracked-default-same",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      productId: "same-product",
      displayName: "默认店重点商品",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      trackedProductId: "tracked-default-ad-only",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      productId: "ad-only-default",
      displayName: null,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      trackedProductId: "tracked-second-same",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      productId: "same-product",
      displayName: "第二店重点商品",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  targets: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: "target-product-gmv",
      scope: "product",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      productId: "same-product",
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
      targetId: "target-store-ignore",
      scope: "store",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      periodType: "daily",
      periodValue: "2026-06-18",
      metricKey: "gmv",
      targetValue: 1,
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

const containsInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsInvalidNumber);
  return false;
};

const containsUndefined = (value: unknown): boolean => {
  if (typeof value === "undefined") return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") return Object.values(value).some(containsUndefined);
  return false;
};

const forbiddenSensitiveText = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
];

const main = () => {
  const completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(E2_COMPLETION);
  const lock = readJson<{ stageStatuses: Record<string, string> }>(LOCK);
  const sample = dataset();
  const before = stablePersistenceStringify(sample);

  const defaultVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tracked-default-same",
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const secondVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-second-store",
    trackedProductId: "tracked-second-same",
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const adOnlyVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tracked-default-ad-only",
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const productIdCompatVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: null,
    productId: "same-product",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const notTrackedVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: null,
    productId: "not-tracked",
    selectedPeriod: "day",
    selectedDate: "2026-06-19",
    customDateRange: { start: null, end: null },
  });
  const weekVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tracked-default-same",
    productId: null,
    selectedPeriod: "week",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const noTrackedDataset = { ...sample, trackedProducts: [] };
  const noTrackedVm = buildV2ProductBoardViewModel({
    dataset: noTrackedDataset,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: null,
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const invalidTrackedVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tracked-second-same",
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const invalidStoreVm = buildV2ProductBoardViewModel({
    dataset: sample,
    platformCode: "tmall",
    storeId: "missing-store",
    trackedProductId: null,
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });

  const output = {
    defaultVm,
    secondVm,
    adOnlyVm,
    productIdCompatVm,
    notTrackedVm,
    weekVm,
    noTrackedVm,
    invalidTrackedVm,
    invalidStoreVm,
  };
  const outputText = JSON.stringify(output);
  const after = stablePersistenceStringify(sample);

  const checks: Check[] = [
    { name: "E2 completion record valid", pass: completion.status === "complete" && completion.commandResults.every((item) => item.status === "PASS") },
    { name: "V0.5A-D complete and V0.5E pending", pass: lock.stageStatuses["V0.5A"] === "complete" && lock.stageStatuses["V0.5B"] === "complete" && lock.stageStatuses["V0.5C"] === "complete" && lock.stageStatuses["V0.5D"] === "complete" && lock.stageStatuses["V0.5E"] === "pending" },
    { name: "default store tracked product valid", pass: defaultVm.mode === "v2_valid" && defaultVm.selectedTrackedProduct.trackedProductId === "tracked-default-same" },
    { name: "same productId does not cross stores", pass: defaultVm.metrics[0]?.value === 100 && secondVm.metrics[0]?.value === 80 },
    { name: "productId compatibility canonicalizes to tracked", pass: productIdCompatVm.selectedTrackedProduct.canonicalHref?.includes("tracked-default-same") ?? false },
    { name: "untracked product is not auto-created", pass: notTrackedVm.mode === "not_tracked" },
    { name: "no tracked products safe state", pass: noTrackedVm.mode === "no_tracked_products" },
    { name: "invalid tracked safe state", pass: invalidTrackedVm.mode === "invalid_tracked_product" },
    { name: "invalid store safe state", pass: invalidStoreVm.mode === "invalid_store" },
    { name: "ad-only tracked product retained", pass: adOnlyVm.mode === "v2_valid" && adOnlyVm.selectedTrackedProduct.dataStatus === "ad_only" },
    { name: "ad-only business values are null display", pass: adOnlyVm.metrics.find((item) => item.key === "gmv")?.value === null },
    { name: "ad product does not use ad plan", pass: adOnlyVm.adSummary.adSpend === 20 && defaultVm.adSummary.adSpend === 10 },
    { name: "product target scope only", pass: defaultVm.targetProgress.length === 1 && defaultVm.targetProgress[0]?.targetId === "target-product-gmv" },
    { name: "week target not folded", pass: weekVm.targetProgress.length === 0 },
    { name: "product series memberships scoped", pass: defaultVm.seriesMemberships.length === 1 && defaultVm.seriesMemberships[0]?.seriesId === "series-default-core" },
    { name: "safe after-sales product aggregate", pass: defaultVm.afterSalesSummary.refundAmount === 10 && defaultVm.afterSalesSummary.pendingCount === 2 },
    { name: "no mutation", pass: before === after },
    { name: "no invalid numbers", pass: !containsInvalidNumber(output) },
    { name: "no undefined", pass: !containsUndefined(output) },
    { name: "no sensitive field names", pass: forbiddenSensitiveText.every((text) => !outputText.includes(text)) },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e3-tracked-product-board-data",
    failedChecks,
    trackedProductCount: defaultVm.trackedOptions.length,
    defaultGmv: defaultVm.metrics[0]?.value ?? null,
    secondStoreGmv: secondVm.metrics[0]?.value ?? null,
    adOnlyStatus: adOnlyVm.selectedTrackedProduct.dataStatus,
    notTrackedMode: notTrackedVm.mode,
    privacyPass: forbiddenSensitiveText.every((text) => !outputText.includes(text)),
    numberSafetyPass: !containsInvalidNumber(output) && !containsUndefined(output),
    sourceObjectMutated: before !== after,
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
