import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  validateV2Dataset,
  type ImportBatchRecord,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type V2Dataset,
} from "../../lib/v05";
import {
  buildTargetAllocationSummary,
  getTargetMetricAllocationMode,
} from "../../lib/v05/target-hierarchy";

const ROOT = process.cwd();
const TASK_ID = "V0.5F_0_TARGET_HIERARCHY_CONTRACT_AND_STORAGE_READINESS";
const PREVIOUS_BLOCKED_TASK_ID = "V0.5F_1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER";
const BASELINE_COMMIT = "f260b5b0643a33e9efc306ef6118e94a00a2a6ce";

interface Check {
  name: string;
  pass: boolean;
  detail?: string | number | boolean | null;
}

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

const target = ({
  targetId,
  scope,
  ...overrides
}: Partial<TargetRecord> & Pick<TargetRecord, "targetId" | "scope">): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  targetId,
  scope,
  metricKey: "gmv",
  periodType: "daily",
  periodValue: "2026-06-18",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:00:00+08:00",
  ...overrides,
});

const platform = (): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  platformName: "天猫",
  status: "active",
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:00:00+08:00",
});

const store = (storeId: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  storeName: storeId === "tmall-default-store" ? "天猫默认店铺" : "天猫第二店铺",
  status: "active",
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:00:00+08:00",
});

const batch = (storeId: string): ImportBatchRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  importBatchId: `batch-${storeId}`,
  platformCode: "tmall",
  storeId,
  importStartedAt: "2026-06-23T00:00:00+08:00",
  importCompletedAt: "2026-06-23T00:01:00+08:00",
  status: "success",
  sourceTypes: ["business_product"],
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:01:00+08:00",
});

const businessFact = (storeId: string, productId: string, gmv: number): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "business_product",
  importBatchId: `batch-${storeId}`,
  productId,
  productName: `Product ${productId}`,
  gmv,
  gsv: gmv * 0.9,
  visitors: 10,
  paidBuyers: 2,
  paidOrders: 2,
  conversionRate: 0.2,
  avgOrderValue: gmv / 2,
  favorites: null,
  cartAdditions: null,
});

const series = (storeId: string, seriesId: string, productIds: string[]): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  seriesId,
  name: seriesId,
  productIds,
  status: "active",
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:00:00+08:00",
});

const baseDataset = (targets: TargetRecord[]): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-target-hierarchy-contract",
  platforms: [platform()],
  stores: [store("tmall-default-store"), store("tmall-second-store")],
  importBatches: [batch("tmall-default-store"), batch("tmall-second-store")],
  importFiles: [],
  businessProductFacts: [
    businessFact("tmall-default-store", "p1", 100),
    businessFact("tmall-default-store", "p2", 50),
    businessFact("tmall-second-store", "p1", 80),
  ],
  adProductFacts: [],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [
    series("tmall-default-store", "s-default", ["p1", "p2"]),
    series("tmall-second-store", "s-second", ["p1"]),
  ],
  trackedProducts: [],
  targets,
  legacyTargetCandidates: [],
  migrationManifests: [],
  activeDatasetPointer: null,
});

const rootCompany = (overrides: Partial<TargetRecord> = {}) => target({
  targetId: "company-gmv",
  scope: "company",
  parentTargetId: null,
  targetValue: 300,
  ...overrides,
});

const storeChild = (overrides: Partial<TargetRecord> = {}) => target({
  targetId: "store-gmv",
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  targetValue: 180,
  ...overrides,
});

const seriesChild = (overrides: Partial<TargetRecord> = {}) => target({
  targetId: "series-gmv",
  scope: "series",
  parentTargetId: "store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-default",
  targetValue: 120,
  ...overrides,
});

const productChild = (overrides: Partial<TargetRecord> = {}) => target({
  targetId: "product-gmv",
  scope: "product",
  parentTargetId: "series-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  productId: "p1",
  targetValue: 70,
  ...overrides,
});

const omitParentTargetId = (record: TargetRecord): TargetRecord => {
  const withoutParentTargetId = { ...record };
  delete withoutParentTargetId.parentTargetId;
  return withoutParentTargetId;
};

const valid = (targets: TargetRecord[]): boolean => validateV2Dataset(baseDataset(targets)).valid;
const invalid = (targets: TargetRecord[]): boolean => !valid(targets);

const diffFiles = (relativePaths: string[]): string[] =>
  git(["diff", "--name-only", BASELINE_COMMIT, "--", ...relativePaths])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const completionRecord = readJson<{ status: string; commandResults: Array<{ status: string }> }>(
  "docs/project/task-completions/V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
);
const lock = readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json");

const exactSummary = buildTargetAllocationSummary({
  parentTarget: rootCompany({ targetId: "summary-parent", targetValue: 100 }),
  childTargets: [
    storeChild({ targetId: "summary-active-a", parentTargetId: "summary-parent", targetValue: 40 }),
    storeChild({ targetId: "summary-active-b", parentTargetId: "summary-parent", targetValue: 60 }),
    storeChild({ targetId: "summary-paused", parentTargetId: "summary-parent", targetValue: 20, status: "paused" }),
    storeChild({ targetId: "summary-deleted", parentTargetId: "summary-parent", targetValue: 30, status: "deleted" }),
  ],
});

const underSummary = buildTargetAllocationSummary({
  parentTarget: rootCompany({ targetId: "under-parent", targetValue: 100 }),
  childTargets: [storeChild({ targetId: "under-child", parentTargetId: "under-parent", targetValue: 40 })],
});

const overSummary = buildTargetAllocationSummary({
  parentTarget: rootCompany({ targetId: "over-parent", targetValue: 100 }),
  childTargets: [storeChild({ targetId: "over-child", parentTargetId: "over-parent", targetValue: 120 })],
});

const checks: Check[] = [
  { name: "E4 completion record valid", pass: completionRecord.status === "complete" && completionRecord.commandResults.every((item) => item.status === "PASS") },
  { name: "original F1 completion record absent", pass: !fs.existsSync(path.join(ROOT, `docs/project/task-completions/${PREVIOUS_BLOCKED_TASK_ID}.json`)) },
  { name: "V0.5A complete", pass: lock.stageStatuses["V0.5A"] === "complete" },
  { name: "V0.5B complete", pass: lock.stageStatuses["V0.5B"] === "complete" },
  { name: "V0.5C complete", pass: lock.stageStatuses["V0.5C"] === "complete" },
  { name: "V0.5D complete", pass: lock.stageStatuses["V0.5D"] === "complete" },
  { name: "V0.5E complete", pass: lock.stageStatuses["V0.5E"] === "complete" },
  { name: "V0.5F pending", pass: lock.stageStatuses["V0.5F"] === "pending" },
  { name: "old target without parentTargetId valid", pass: valid([omitParentTargetId(storeChild({ targetId: "legacy-store" }))]) },
  { name: "null parent target valid", pass: valid([storeChild({ targetId: "standalone-store", parentTargetId: null })]) },
  { name: "company to store valid", pass: valid([rootCompany(), storeChild()]) },
  { name: "store to series valid", pass: valid([rootCompany(), storeChild(), seriesChild()]) },
  { name: "series to product valid", pass: valid([rootCompany(), storeChild(), seriesChild(), productChild()]) },
  { name: "illegal jump rejected", pass: invalid([rootCompany(), seriesChild({ parentTargetId: "company-gmv" })]) },
  { name: "cross-store relation rejected", pass: invalid([rootCompany(), storeChild(), seriesChild({ storeId: "tmall-second-store", seriesId: "s-second" })]) },
  { name: "self-reference rejected", pass: invalid([storeChild({ parentTargetId: "store-gmv" })]) },
  { name: "cycle rejected", pass: invalid([
    rootCompany(),
    storeChild({ parentTargetId: "series-gmv" }),
    seriesChild({ parentTargetId: "store-gmv" }),
  ]) },
  { name: "missing parent rejected", pass: invalid([storeChild({ parentTargetId: "missing-parent" })]) },
  { name: "deleted parent rejected", pass: invalid([rootCompany({ status: "deleted" }), storeChild()]) },
  { name: "metric mismatch rejected", pass: invalid([rootCompany(), storeChild({ metricKey: "gsv" })]) },
  { name: "period mismatch rejected", pass: invalid([rootCompany(), storeChild({ periodValue: "2026-06-19" })]) },
  { name: "direction mismatch rejected", pass: invalid([rootCompany(), storeChild({ direction: "lower_is_better" })]) },
  { name: "product not in parent series rejected", pass: invalid([rootCompany(), storeChild(), seriesChild(), productChild({ productId: "p9" })]) },
  { name: "non-additive metric rejected", pass: invalid([
    rootCompany({ metricKey: "conversionRate" }),
    storeChild({ metricKey: "conversionRate" }),
  ]) },
  { name: "unclassified metric rejected", pass: invalid([
    rootCompany({ metricKey: "customMetric" }),
    storeChild({ metricKey: "customMetric" }),
  ]) },
  { name: "semantic duplicate rejected", pass: invalid([
    storeChild({ targetId: "duplicate-a", parentTargetId: null }),
    storeChild({ targetId: "duplicate-b", parentTargetId: null }),
  ]) },
  { name: "legacy target is standalone", pass: (omitParentTargetId(storeChild()).parentTargetId ?? null) === null },
  { name: "sum policy for GMV", pass: getTargetMetricAllocationMode("gmv") === "sum" },
  { name: "none policy for conversionRate", pass: getTargetMetricAllocationMode("conversionRate") === "none" },
  { name: "none policy for unknown metric", pass: getTargetMetricAllocationMode("unknown_metric") === "none" },
  { name: "paused and deleted summary counts", pass: exactSummary.pausedChildCount === 1 && exactSummary.deletedChildCount === 1 && exactSummary.pausedAllocatedValue === 20 },
  { name: "fully allocated summary", pass: exactSummary.allocationStatus === "fully_allocated" && exactSummary.remainingValue === 0 && exactSummary.overAllocatedValue === 0 },
  { name: "under allocated summary", pass: underSummary.allocationStatus === "under_allocated" && underSummary.remainingValue === 60 },
  { name: "over allocated summary", pass: overSummary.allocationStatus === "over_allocated" && overSummary.overAllocatedValue === 20 },
  { name: "V0.4C completion code unmodified", pass: diffFiles(["lib/tmall", "lib/storage", "types/tmall-targets.ts"]).length === 0 },
];

const failedChecks = checks.filter((check) => !check.pass);
const output = {
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  taskId: TASK_ID,
  previousF1BlockedEvidence: "No immutable PASS completion record exists for the original V0.5F_1 task; it remains unstarted in the ledger after external BLOCKED decision.",
  checks,
  failedChecks: failedChecks.map((check) => check.name),
};

console.log(JSON.stringify(output, null, 2));
if (failedChecks.length > 0) process.exitCode = 1;
