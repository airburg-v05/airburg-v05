import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  type ImportBatchRecord,
  type OwnedAdPlanFact,
  type OwnedAdProductFact,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type TrackedProductRecord,
  type V2Dataset,
} from "../../lib/v05";
import { buildHomeCommandCenterViewModel } from "../../lib/v05/home-command-center";
import { buildV2ProductBoardViewModel } from "../../lib/v05/product-board";
import { buildV2SeriesBoardViewModel } from "../../lib/v05/series-board";
import { buildV2StoreBoardViewModel } from "../../lib/v05/store-board";

const ROOT = process.cwd();
const NOW = "2026-06-23T16:30:00.000+08:00";
const F2_COMPLETION = "docs/project/task-completions/V0.5F_2_PARENT_CHILD_TARGET_ALLOCATION_WORKFLOW.json";

interface Check {
  name: string;
  pass: boolean;
  detail?: unknown;
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

const platform = (): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  platformName: "天猫",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const store = (storeId: string, storeName: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  storeName,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const batch = (storeId: string): ImportBatchRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  importBatchId: `batch-${storeId}`,
  platformCode: "tmall",
  storeId,
  importStartedAt: NOW,
  importCompletedAt: NOW,
  status: "success",
  sourceTypes: ["business_product", "ad_product", "ad_plan"],
  createdAt: NOW,
  updatedAt: NOW,
});

const businessFact = (storeId: string, gmv: number): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "business_product",
  importBatchId: `batch-${storeId}`,
  productId: "p-shared",
  productName: `${storeId} 商品`,
  gmv,
  gsv: gmv - 10,
  visitors: gmv / 10,
  paidBuyers: gmv / 20,
  paidOrders: gmv / 20,
  conversionRate: 0.5,
  avgOrderValue: 20,
  favorites: null,
  cartAdditions: null,
});

const adProductFact = (storeId: string, spend: number): OwnedAdProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "ad_product",
  importBatchId: `batch-${storeId}`,
  productId: "p-shared",
  adSpend: spend,
  adSalesAmount: spend * 2,
  impressions: 100,
  clicks: 10,
  clickRate: 0.1,
  adRoi: 2,
});

const adPlanFact = (storeId: string, spend: number): OwnedAdPlanFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "ad_plan",
  importBatchId: `batch-${storeId}`,
  planId: `plan-${storeId}`,
  planName: null,
  adSpend: spend,
  adSalesAmount: spend * 2,
  impressions: 100,
  clicks: 10,
  adRoi: 2,
});

const series = (storeId: string): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  seriesId: "core-series",
  name: "核心系列",
  productIds: ["p-shared"],
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const tracked = (storeId: string): TrackedProductRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  trackedProductId: `tracked-${storeId}`,
  productId: "p-shared",
  displayName: "重点商品",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const target = (overrides: Partial<TargetRecord> & Pick<TargetRecord, "targetId" | "scope">): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  parentTargetId: null,
  periodType: "daily",
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const dataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-v05f3-target-context",
  platforms: [platform()],
  stores: [
    store("tmall-default-store", "天猫默认店铺"),
    store("tmall-second-store", "天猫第二店铺"),
  ],
  importBatches: [batch("tmall-default-store"), batch("tmall-second-store")],
  importFiles: [],
  businessProductFacts: [
    businessFact("tmall-default-store", 100),
    businessFact("tmall-second-store", 80),
  ],
  adProductFacts: [
    adProductFact("tmall-default-store", 10),
    adProductFact("tmall-second-store", 8),
  ],
  adPlanFacts: [
    adPlanFact("tmall-default-store", 12),
    adPlanFact("tmall-second-store", 9),
  ],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [series("tmall-default-store"), series("tmall-second-store")],
  trackedProducts: [tracked("tmall-default-store"), tracked("tmall-second-store")],
  targets: [
    target({ targetId: "company-gmv", scope: "company", targetValue: 300 }),
    target({
      targetId: "store-default-gmv",
      scope: "store",
      parentTargetId: "company-gmv",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      targetValue: 200,
    }),
    target({
      targetId: "store-second-gmv",
      scope: "store",
      parentTargetId: "company-gmv",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      targetValue: 100,
    }),
    target({
      targetId: "series-default-gmv",
      scope: "series",
      parentTargetId: "store-default-gmv",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      seriesId: "core-series",
      targetValue: 120,
    }),
    target({
      targetId: "series-second-gmv",
      scope: "series",
      parentTargetId: "store-second-gmv",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      seriesId: "core-series",
      targetValue: 80,
    }),
    target({
      targetId: "product-default-gmv",
      scope: "product",
      parentTargetId: "series-default-gmv",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      seriesId: "core-series",
      productId: "p-shared",
      targetValue: 60,
    }),
    target({
      targetId: "product-second-gmv",
      scope: "product",
      parentTargetId: "series-second-gmv",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      seriesId: "core-series",
      productId: "p-shared",
      targetValue: 40,
    }),
  ],
  legacyTargetCandidates: [],
  migrationManifests: [],
  activeDatasetPointer: null,
});

const hasInvalidNumberText = (value: unknown): boolean =>
  /NaN|Infinity|undefined/.test(JSON.stringify(value));

const forbiddenSensitiveText = [
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
];

const main = () => {
  const completion = readJson<{
    status?: string;
    requiredCommands?: string[];
    commandResults?: Array<{ command?: string; status?: string }>;
  }>(F2_COMPLETION);
  const source = dataset();
  const before = JSON.stringify(source);

  const home = buildHomeCommandCenterViewModel({
    dataset: source,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const filteredHome = buildHomeCommandCenterViewModel({
    dataset: source,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
    platformFilter: "tmall",
    storeFilter: "tmall:tmall-default-store",
  });
  const storeDefault = buildV2StoreBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const seriesDefault = buildV2SeriesBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "core-series",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const productDefault = buildV2ProductBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tracked-tmall-default-store",
    productId: null,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });
  const storeWeek = buildV2StoreBoardViewModel({
    dataset: source,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    selectedPeriod: "week",
    selectedDate: "2026-06-18",
    customDateRange: { start: null, end: null },
  });

  const allOutput = [home, filteredHome, storeDefault, seriesDefault, productDefault, storeWeek];
  const serializedOutput = JSON.stringify(allOutput);

  const checks: Check[] = [
    { name: "F2 completion complete", pass: completion.status === "complete" },
    {
      name: "F2 required commands PASS",
      pass:
        Array.isArray(completion.requiredCommands) &&
        Array.isArray(completion.commandResults) &&
        completion.requiredCommands.every((command) =>
          completion.commandResults?.some((result) => result.command === command && result.status === "PASS"),
        ),
    },
    { name: "home only company target", pass: home.targetProgress.length === 1 && home.targetProgress[0]?.targetId === "company-gmv" },
    { name: "home filtered store does not show store target", pass: filteredHome.targetProgress.length === 0 },
    { name: "store board only current store target", pass: storeDefault.targetProgress.length === 1 && storeDefault.targetProgress[0]?.targetId === "store-default-gmv" },
    { name: "series board only current store series target", pass: seriesDefault.targetProgress.length === 1 && seriesDefault.targetProgress[0]?.targetId === "series-default-gmv" },
    { name: "product board only current store product target", pass: productDefault.targetProgress.length === 1 && productDefault.targetProgress[0]?.targetId === "product-default-gmv" },
    { name: "same productId cross-store not mixed", pass: !productDefault.targetProgress.some((targetItem) => targetItem.targetId === "product-second-gmv") },
    { name: "same seriesId cross-store not mixed", pass: !seriesDefault.targetProgress.some((targetItem) => targetItem.targetId === "series-second-gmv") },
    { name: "week target does not prorate", pass: storeWeek.targetProgress.length === 0 },
    { name: "allocation status visible for company", pass: home.targetProgress[0]?.allocationStatus === "fully_allocated" },
    { name: "allocation status visible for store", pass: storeDefault.targetProgress[0]?.allocationStatus === "under_allocated" },
    { name: "allocation status visible for product terminal", pass: productDefault.targetProgress[0]?.allocationStatus === "terminal" },
    { name: "target gap present", pass: typeof storeDefault.targetProgress[0]?.gapValue === "number" },
    { name: "no duplicate target display", pass: new Set(storeDefault.targetProgress.map((item) => item.targetId)).size === storeDefault.targetProgress.length },
    { name: "dataset not mutated", pass: JSON.stringify(source) === before },
    { name: "no invalid numbers", pass: !hasInvalidNumberText(allOutput) },
    { name: "no sensitive field names", pass: !forbiddenSensitiveText.some((text) => serializedOutput.includes(text)) },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => ({
    name: check.name,
    detail: check.detail,
  }));

  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05f3-target-context-board-integration-data",
    failedChecks,
    safeCounts: {
      homeTargets: home.targetProgress.length,
      storeTargets: storeDefault.targetProgress.length,
      seriesTargets: seriesDefault.targetProgress.length,
      productTargets: productDefault.targetProgress.length,
    },
    allocationStatuses: {
      home: home.targetProgress[0]?.allocationStatus ?? null,
      store: storeDefault.targetProgress[0]?.allocationStatus ?? null,
      series: seriesDefault.targetProgress[0]?.allocationStatus ?? null,
      product: productDefault.targetProgress[0]?.allocationStatus ?? null,
    },
  }, null, 2));

  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
