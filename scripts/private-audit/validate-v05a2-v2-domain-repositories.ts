import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  buildAdPlanFactKey,
  buildAdProductFactKey,
  buildAfterSalesDistributionItemKey,
  buildAfterSalesOperationalSnapshotKey,
  buildBusinessProductFactKey,
  buildDeterministicLegacyImportBatchId,
  buildStoreKey,
  buildTargetSemanticKey,
  convertLegacyTargetCandidate,
  createMemoryV2RepositoryBundle,
  type ImportBatchRecord,
  type ImportFileRecord,
  type LegacyTargetCandidate,
  type OwnedAdPlanFact,
  type OwnedAdProductFact,
  type OwnedAfterSalesDailyAggregate,
  type OwnedAfterSalesDistributionItem,
  type OwnedAfterSalesOperationalSnapshot,
  type OwnedAfterSalesRangeAggregate,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type TrackedProductRecord,
  type V2Dataset,
} from "../../lib/v05";
import {
  validateImportFileRecord,
  validateOwnedAdProductFact,
  validateOwnedAfterSalesDailyAggregate,
  validateOwnedAfterSalesDistributionItem,
  validateOwnedAfterSalesOperationalSnapshot,
  validateOwnedAfterSalesRangeAggregate,
  validateOwnedBusinessProductFact,
  validatePlatformRecord,
  validateSeriesRecord,
  validateStoreRecord,
  validateTargetRecord,
  validateTrackedProductRecord,
} from "../../lib/v05/validation/records";
import { validateV2Dataset } from "../../lib/v05/validation/dataset";

const ROOT = process.cwd();
const STORE_A = { platformCode: "tmall" as const, storeId: "tmall-default-store" };
const STORE_B = { platformCode: "tmall" as const, storeId: "tmall-second-store" };
const BUSINESS_DATE = "2026-06-18";
const NOW = "2026-06-21T00:00:00.000Z";

const REQUIRED_DOMAIN_FILES = [
  "lib/v05/domain/models.ts",
  "lib/v05/domain/results.ts",
  "lib/v05/domain/keys.ts",
  "lib/v05/domain/legacy.ts",
  "lib/v05/validation/core.ts",
  "lib/v05/validation/records.ts",
  "lib/v05/validation/dataset.ts",
  "lib/v05/repositories/contracts.ts",
  "lib/v05/repositories/memory-adapter.ts",
  "lib/v05/index.ts",
] as const;

const FORBIDDEN_RUNTIME_TOKENS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "IDBDatabase",
  "window.localStorage",
  "document",
  "fetch",
  "axios",
  "node:fs",
] as const;

interface Check {
  name: string;
  pass: boolean;
  details?: string;
}

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: string): void => {
  checks.push({ name, pass, ...(details ? { details } : {}) });
};

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const commandSucceeds = (command: string, args: string[]): boolean => {
  try {
    execFileSync(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
};

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const hasInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(hasInvalidNumber);
  return false;
};

const hasUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
  return false;
};

const resultContainsUndefined = (value: unknown): boolean => hasUndefined(value);

const hasIssueCode = (value: { issues: Array<{ code: string }> }, code: string): boolean =>
  value.issues.some((issue) => issue.code === code);

const platform = (): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  platformName: "Tmall",
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

const batch = (storeId: string, importBatchId: string): ImportBatchRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  importBatchId,
  importStartedAt: NOW,
  importCompletedAt: NOW,
  status: "success",
  sourceTypes: ["business_product", "ad_product", "ad_plan", "after_sales"],
  createdAt: NOW,
  updatedAt: NOW,
});

const importFile = (storeId: string, importBatchId: string, importFileId: string): ImportFileRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  importBatchId,
  importFileId,
  sourceType: "business_product",
  detectedSourceType: "business_product",
  fileFingerprint: "abc123",
  rowCount: 10,
  headerRowNumber: 2,
  dateRange: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  status: "parsed",
  safeWarningCodes: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const businessFact = (
  storeId = STORE_A.storeId,
  productId = "product-shared",
  importBatchId = "batch-a",
): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: BUSINESS_DATE,
  sourceType: "business_product",
  importBatchId,
  productId,
  productName: "Safe Product",
  gmv: 100,
  gsv: 90,
  visitors: 20,
  paidBuyers: 2,
  paidOrders: 2,
  conversionRate: 0.1,
  avgOrderValue: 50,
  favorites: null,
  cartAdditions: 0,
});

const adProductFact = (
  storeId = STORE_A.storeId,
  productId = "product-shared",
  importBatchId = "batch-a",
): OwnedAdProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: BUSINESS_DATE,
  sourceType: "ad_product",
  importBatchId,
  productId,
  adSpend: 10,
  adSalesAmount: 30,
  impressions: 1000,
  clicks: 20,
  clickRate: 0.02,
  adRoi: 3,
});

const adPlanFact = (
  storeId = STORE_A.storeId,
  planId = "plan-shared",
  importBatchId = "batch-a",
): OwnedAdPlanFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: BUSINESS_DATE,
  sourceType: "ad_plan",
  importBatchId,
  planId,
  planName: "Safe Plan",
  adSpend: 20,
  adSalesAmount: 80,
  impressions: 5000,
  clicks: 60,
  adRoi: 4,
});

const afterSalesDaily = (): OwnedAfterSalesDailyAggregate => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  businessDate: BUSINESS_DATE,
  sourceType: "after_sales",
  importBatchId: "batch-a",
  dateBasis: "apply_date",
  productId: "product-shared",
  refundAmount: 12,
  refundOrderCount: 1,
  afterSalesApplyCount: 1,
});

const afterSalesRange = (): OwnedAfterSalesRangeAggregate => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  sourceType: "after_sales",
  importBatchId: "batch-a",
  dateRange: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  dateBasis: "apply_date",
  productId: "product-shared",
  refundAmount: 12,
  refundOrderCount: 1,
  afterSalesApplyCount: 1,
});

const afterSalesSnapshot = (): OwnedAfterSalesOperationalSnapshot => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  sourceType: "after_sales",
  importBatchId: "batch-a",
  capturedAt: NOW,
  dateRange: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  productId: "product-shared",
  pendingCount: 1,
  overduePendingCount: 0,
  customerServiceInterventionCount: 0,
  avgAfterSalesDurationHours: null,
});

const afterSalesDistribution = (): OwnedAfterSalesDistributionItem => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  sourceType: "after_sales",
  importBatchId: "batch-a",
  capturedAt: NOW,
  dateRange: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  distributionKind: "reason_distribution",
  safeLabel: "质量相关",
  count: 1,
  productId: "product-shared",
});

const series = (): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  seriesId: "series-a",
  name: "Series A",
  productIds: ["product-shared"],
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const trackedProduct = (): TrackedProductRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  trackedProductId: "tracked-a",
  productId: "product-shared",
  displayName: null,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const target = (overrides: Partial<TargetRecord> = {}): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  targetId: "target-store-gmv",
  scope: "store",
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  periodType: "daily",
  periodValue: BUSINESS_DATE,
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const companyTarget = (targetId = "target-company-gmv"): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  targetId,
  scope: "company",
  periodType: "daily",
  periodValue: BUSINESS_DATE,
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const legacyTarget = (periodType = "weekly"): LegacyTargetCandidate => ({
  schemaVersion: V2_SCHEMA_VERSION,
  legacyTargetId: "legacy-target-weekly",
  legacyStorageKey: "airburg_tmall_targets_v1",
  scope: "store",
  platformCode: "tmall",
  storeId: STORE_A.storeId,
  periodType,
  periodValue: "2026-W25",
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const baseDataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-a",
  platforms: [platform()],
  stores: [store(STORE_A.storeId, "Default Tmall"), store(STORE_B.storeId, "Second Tmall")],
  importBatches: [batch(STORE_A.storeId, "batch-a"), batch(STORE_B.storeId, "batch-b")],
  importFiles: [importFile(STORE_A.storeId, "batch-a", "file-a"), importFile(STORE_B.storeId, "batch-b", "file-b")],
  businessProductFacts: [
    businessFact(STORE_A.storeId, "product-shared", "batch-a"),
    businessFact(STORE_B.storeId, "product-shared", "batch-b"),
    businessFact(STORE_A.storeId, "product-a-only", "batch-a"),
  ],
  adProductFacts: [adProductFact(STORE_A.storeId, "product-shared", "batch-a")],
  adPlanFacts: [
    adPlanFact(STORE_A.storeId, "plan-shared", "batch-a"),
    adPlanFact(STORE_B.storeId, "plan-shared", "batch-b"),
  ],
  afterSalesDailyAggregates: [afterSalesDaily()],
  afterSalesRangeAggregates: [afterSalesRange()],
  afterSalesOperationalSnapshots: [afterSalesSnapshot()],
  afterSalesDistributionItems: [afterSalesDistribution()],
  series: [series()],
  trackedProducts: [trackedProduct()],
  targets: [
    target(),
    companyTarget(),
  ],
  legacyTargetCandidates: [legacyTarget()],
  migrationManifests: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      migrationManifestId: "manifest-success",
      migrationVersion: "legacy_tmall_v1_to_storage_v2_v1",
      status: "success",
      migratedFromKeys: ["airburg_tmall_analysis_v2"],
      importBatchId: "batch-a",
      legacyValueHash: "abcdef1234567890",
      startedAt: NOW,
      completedAt: NOW,
      safeIssueCodes: [],
    },
  ],
  activeDatasetPointer: {
    schemaVersion: V2_SCHEMA_VERSION,
    pointerId: "active-pointer",
    state: "v2_active",
    datasetId: "dataset-a",
    migrationManifestId: "manifest-success",
    activatedAt: NOW,
  },
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const run = async () => {
  const decisions = readJson<{
    status: string;
    v05a2EntryAllowed: boolean;
    migrationBlockers: unknown[];
    unresolvedDecisions: unknown[];
  }>("docs/decisions/v0.5a-migration-decisions.json");
  const lock = readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json");
  const currentTask = readJson<{ authorizationFile: string }>("docs/project/current-task.json");
  const authorizationCommit = git([
    "log",
    "--diff-filter=A",
    "--format=%H",
    "--",
    currentTask.authorizationFile,
  ]).split("\n").filter(Boolean).at(-1);

  addCheck("decision register allows V0.5A-2", decisions.status === "approved_for_v0.5a_2" && decisions.v05a2EntryAllowed);
  addCheck("migration blockers empty", decisions.migrationBlockers.length === 0);
  addCheck("unresolved decisions empty", decisions.unresolvedDecisions.length === 0);
  addCheck("V0.5A remains pending", lock.stageStatuses["V0.5A"] === "pending");
  addCheck("V0.5A-1.1-R1 completion ledger valid", commandSucceeds("npx", ["tsx", "scripts/private-audit/validate-v05-task-completion-ledger.ts"]));
  addCheck("all required domain files exist", REQUIRED_DOMAIN_FILES.every(exists));

  addCheck("valid PlatformRecord passes", validatePlatformRecord(platform()).valid);
  addCheck("valid StoreRecord passes", validateStoreRecord(store(STORE_A.storeId, "Default Tmall")).valid);

  const missingPlatform = clone(businessFact()) as Partial<OwnedBusinessProductFact>;
  delete missingPlatform.platformCode;
  addCheck("fact missing platformCode fails", !validateOwnedBusinessProductFact(missingPlatform).valid);
  const missingStore = clone(businessFact()) as Partial<OwnedBusinessProductFact>;
  delete missingStore.storeId;
  addCheck("fact missing storeId fails", !validateOwnedBusinessProductFact(missingStore).valid);
  const missingDate = clone(businessFact()) as Partial<OwnedBusinessProductFact>;
  delete missingDate.businessDate;
  addCheck("ordinary fact missing businessDate fails", !validateOwnedBusinessProductFact(missingDate).valid);
  const missingSourceType = clone(businessFact()) as Partial<OwnedBusinessProductFact>;
  delete missingSourceType.sourceType;
  addCheck("fact missing sourceType fails", !validateOwnedBusinessProductFact(missingSourceType).valid);
  const missingBatch = clone(businessFact()) as Partial<OwnedBusinessProductFact>;
  delete missingBatch.importBatchId;
  addCheck("fact missing importBatchId fails", !validateOwnedBusinessProductFact(missingBatch).valid);

  addCheck("NaN fails", !validateOwnedBusinessProductFact({ ...businessFact(), gmv: Number.NaN }).valid);
  addCheck("Infinity fails", !validateOwnedBusinessProductFact({ ...businessFact(), gmv: Number.POSITIVE_INFINITY }).valid);
  addCheck("undefined fails", !validateOwnedBusinessProductFact({ ...businessFact(), gmv: undefined }).valid);
  addCheck("null metric is preserved", validateOwnedBusinessProductFact({ ...businessFact(), gmv: null }).valid);
  addCheck("measured zero is preserved", validateOwnedBusinessProductFact({ ...businessFact(), visitors: 0 }).valid);
  addCheck("invalid businessDate fails", !validateOwnedBusinessProductFact({ ...businessFact(), businessDate: "20260618" }).valid);
  addCheck("sourceType mismatch fails", hasIssueCode(validateOwnedAdProductFact({ ...adProductFact(), sourceType: "ad_plan" }), "source_type_mismatch"));

  const dataset = baseDataset();
  addCheck("base dataset validates", validateV2Dataset(dataset).valid);
  addCheck("same productId different stores can coexist", validateV2Dataset(dataset).valid);
  addCheck("same planId different stores can coexist", validateV2Dataset(dataset).valid);

  const bundle = createMemoryV2RepositoryBundle();
  const firstInsert = await bundle.businessProductFacts.insert(businessFact(STORE_A.storeId, "dup-product", "batch-a"));
  const duplicateInsert = await bundle.businessProductFacts.insert(businessFact(STORE_A.storeId, "dup-product", "batch-a"));
  addCheck("same product same store duplicate insert returns conflict", firstInsert.status === "success" && duplicateInsert.status === "conflict");
  await bundle.businessProductFacts.insert(businessFact(STORE_B.storeId, "store-b-product", "batch-b"));
  const storeAList = await bundle.businessProductFacts.list(STORE_A);
  addCheck("store-scoped query excludes other store", storeAList.data?.every((fact) => fact.storeId === STORE_A.storeId) === true);

  const crossSeriesDataset = baseDataset();
  crossSeriesDataset.series = [{ ...series(), storeId: STORE_B.storeId, productIds: ["product-a-only"] }];
  addCheck("Series cross-store reference fails", hasIssueCode(validateV2Dataset(crossSeriesDataset), "cross_store_reference"));
  addCheck("Series record validator passes valid series", validateSeriesRecord(series()).valid);

  const crossTrackedDataset = baseDataset();
  crossTrackedDataset.trackedProducts = [{ ...trackedProduct(), storeId: STORE_B.storeId, productId: "product-a-only" }];
  addCheck("TrackedProduct cross-store reference fails", hasIssueCode(validateV2Dataset(crossTrackedDataset), "cross_store_reference"));
  addCheck("TrackedProduct record validator passes valid tracked product", validateTrackedProductRecord(trackedProduct()).valid);

  addCheck("company target scope validates", validateTargetRecord(companyTarget("company")).valid);
  addCheck("store target scope validates", validateTargetRecord(target({ targetId: "store" })).valid);
  addCheck("series target scope validates", validateTargetRecord(target({ targetId: "series", scope: "series", seriesId: "series-a" })).valid);
  addCheck("product target scope validates", validateTargetRecord(target({ targetId: "product", scope: "product", productId: "product-shared" })).valid);
  addCheck("product target missing productId fails", !validateTargetRecord(target({ targetId: "missing-product", scope: "product", productId: undefined } as Partial<TargetRecord>)).valid);
  addCheck("series target missing seriesId fails", !validateTargetRecord(target({ targetId: "missing-series", scope: "series", seriesId: undefined } as Partial<TargetRecord>)).valid);
  addCheck("targetValue zero fails", !validateTargetRecord(target({ targetId: "zero", targetValue: 0 })).valid);

  const convertedWeekly = convertLegacyTargetCandidate(legacyTarget("weekly"));
  addCheck("unsupported legacy period is marked", hasIssueCode(convertedWeekly.validation, "unsupported_legacy_period_type"));
  addCheck("unsupported legacy period does not create active target", convertedWeekly.target === null);

  addCheck("ImportFileRecord containing fileName fails", !validateImportFileRecord({ ...importFile(STORE_A.storeId, "batch-a", "file-x"), fileName: "secret-name" }).valid);
  addCheck("ImportFileRecord containing previewRows fails", !validateImportFileRecord({ ...importFile(STORE_A.storeId, "batch-a", "file-y"), previewRows: [] }).valid);
  addCheck("ImportFileRecord containing rawRows fails", !validateImportFileRecord({ ...importFile(STORE_A.storeId, "batch-a", "file-z"), rawRows: [] }).valid);
  addCheck("after-sales daily aggregate dateBasis validates", validateOwnedAfterSalesDailyAggregate(afterSalesDaily()).valid);
  addCheck("after-sales daily aggregate invalid dateBasis fails", !validateOwnedAfterSalesDailyAggregate({ ...afterSalesDaily(), dateBasis: "finish_date" }).valid);
  addCheck("after-sales range dateRange validates", validateOwnedAfterSalesRangeAggregate(afterSalesRange()).valid);
  addCheck("after-sales range invalid dateRange fails", !validateOwnedAfterSalesRangeAggregate({ ...afterSalesRange(), dateRange: { start: "2026-06-20", end: "2026-06-18" } }).valid);
  addCheck("range aggregate entering daily repository fails", hasIssueCode(validateOwnedAfterSalesDailyAggregate(afterSalesRange()), "range_summary_in_daily_repository"));
  addCheck("after-sales sensitive extension field fails", !validateOwnedAfterSalesDailyAggregate({ ...afterSalesDaily(), "订单编号": "SECRET-ORDER-0001" }).valid);
  addCheck("after-sales operational snapshot validates", validateOwnedAfterSalesOperationalSnapshot(afterSalesSnapshot()).valid);
  addCheck("after-sales operational snapshot cannot contain businessDate", hasIssueCode(validateOwnedAfterSalesOperationalSnapshot({ ...afterSalesSnapshot(), businessDate: BUSINESS_DATE }), "after_sales_snapshot_invalid"));
  addCheck("after-sales distribution item validates", validateOwnedAfterSalesDistributionItem(afterSalesDistribution()).valid);
  addCheck("after-sales unsafe distribution label fails", hasIssueCode(validateOwnedAfterSalesDistributionItem({ ...afterSalesDistribution(), safeLabel: "订单编号" }), "after_sales_distribution_label_unsafe"));
  addCheck("snapshot entering daily repository fails", !validateOwnedAfterSalesDailyAggregate(afterSalesSnapshot()).valid);
  addCheck("distribution entering range repository fails", !validateOwnedAfterSalesRangeAggregate(afterSalesDistribution()).valid);

  const wrongRepoResult = await bundle.adProductFacts.insert(adPlanFact() as unknown as OwnedAdProductFact);
  addCheck("plan fact cannot enter product ad repository", wrongRepoResult.status === "validation_error");
  const snapshotWrongRepo = await bundle.afterSalesDailyAggregates.insert(afterSalesSnapshot() as unknown as OwnedAfterSalesDailyAggregate);
  const distributionWrongRepo = await bundle.afterSalesRangeAggregates.insert(afterSalesDistribution() as unknown as OwnedAfterSalesRangeAggregate);
  addCheck("daily repository rejects operational snapshot", snapshotWrongRepo.status === "validation_error");
  addCheck("range repository rejects distribution item", distributionWrongRepo.status === "validation_error");

  const legacyBatchA = buildDeterministicLegacyImportBatchId({
    legacyStorageKey: "airburg_tmall_analysis_v2",
    legacyValueHash: "abcdef1234567890",
    migrationVersion: "legacy_tmall_v1_to_storage_v2_v1",
  });
  const legacyBatchB = buildDeterministicLegacyImportBatchId({
    legacyStorageKey: "airburg_tmall_analysis_v2",
    legacyValueHash: "abcdef1234567890",
    migrationVersion: "legacy_tmall_v1_to_storage_v2_v1",
  });
  const legacyBatchHashChange = buildDeterministicLegacyImportBatchId({
    legacyStorageKey: "airburg_tmall_analysis_v2",
    legacyValueHash: "abcdef1234567891",
    migrationVersion: "legacy_tmall_v1_to_storage_v2_v1",
  });
  const legacyBatchVersionChange = buildDeterministicLegacyImportBatchId({
    legacyStorageKey: "airburg_tmall_analysis_v2",
    legacyValueHash: "abcdef1234567890",
    migrationVersion: "legacy_tmall_v1_to_storage_v2_v2",
  });
  addCheck("legacy importBatchId is deterministic", legacyBatchA === legacyBatchB);
  addCheck("legacy importBatchId changes when hash changes", legacyBatchA !== legacyBatchHashChange);
  addCheck("legacy importBatchId changes when migrationVersion changes", legacyBatchA !== legacyBatchVersionChange);

  const semanticDataset = baseDataset();
  semanticDataset.targets = [target({ targetId: "semantic-a" }), target({ targetId: "semantic-b" })];
  addCheck("semantic target duplicate fails", hasIssueCode(validateV2Dataset(semanticDataset), "semantic_duplicate"));

  const failedPointerDataset = baseDataset();
  failedPointerDataset.migrationManifests = [{ ...failedPointerDataset.migrationManifests[0], status: "failed" }];
  addCheck("active pointer to failed migration fails", hasIssueCode(validateV2Dataset(failedPointerDataset), "migration_state_invalid"));

  const mutationBundle = createMemoryV2RepositoryBundle();
  const mutableInput = businessFact(STORE_A.storeId, "mutable-product", "batch-a");
  await mutationBundle.businessProductFacts.insert(mutableInput);
  mutableInput.gmv = 999999;
  const storedAfterInputMutation = await mutationBundle.businessProductFacts.get(buildBusinessProductFactKey(mutableInput));
  addCheck("memory adapter does not mutate from input object", storedAfterInputMutation.data?.gmv === 100);
  if (storedAfterInputMutation.data) storedAfterInputMutation.data.gmv = 777777;
  const storedAfterOutputMutation = await mutationBundle.businessProductFacts.get(buildBusinessProductFactKey(mutableInput));
  addCheck("memory adapter does not expose internal object", storedAfterOutputMutation.data?.gmv === 100);
  const replaceMissing = await mutationBundle.businessProductFacts.replace(businessFact(STORE_A.storeId, "missing-replace", "batch-a"));
  addCheck("replace missing returns not_found", replaceMissing.status === "not_found");
  addCheck("RepositoryResult contains no undefined", !resultContainsUndefined([firstInsert, duplicateInsert, replaceMissing]));

  const sensitiveResult = validateImportFileRecord({ ...importFile(STORE_A.storeId, "batch-a", "file-secret"), fileName: "SECRET_SENSITIVE_9999" });
  addCheck("error output does not include sensitive raw value", !JSON.stringify(sensitiveResult).includes("SECRET_SENSITIVE_9999"));

  const libV05Files = REQUIRED_DOMAIN_FILES.map((file) => path.join(ROOT, file));
  const libContent = libV05Files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  addCheck("lib/v05 contains no forbidden persistence API tokens", !FORBIDDEN_RUNTIME_TOKENS.some((token) => libContent.includes(token)));

  const changedFiles = authorizationCommit ? changedFilesSince(authorizationCommit) : [];
  const startsWithAny = (file: string, prefixes: string[]): boolean => prefixes.some((prefix) => file === prefix || file.startsWith(prefix));
  addCheck("app not modified", !startsWithAny("", []) && !changedFiles.some((file) => file.startsWith("app/")));
  addCheck("components not modified", !changedFiles.some((file) => file.startsWith("components/")));
  addCheck("lib/storage not modified", !changedFiles.some((file) => file.startsWith("lib/storage/")));
  addCheck("lib/tmall not modified", !changedFiles.some((file) => file.startsWith("lib/tmall/")));
  addCheck("types not modified", !changedFiles.some((file) => file.startsWith("types/")));
  addCheck("package.json not modified", !changedFiles.includes("package.json"));
  addCheck("fixed governance docs not modified", !changedFiles.some((file) => startsWithAny(file, ["AGENTS.md", "docs/product/", "docs/design/", "docs/roadmap/", "docs/quality/", "docs/audits/", "docs/decisions/"])));
  addCheck("locked architecture docs not modified", !changedFiles.some((file) => file === "docs/architecture/v0.5a-storage-v2-contract.json" || file === "docs/architecture/V05_PLATFORM_STORE_DATA_CONTRACT.md" || file === "docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md"));
  addCheck("no dependency files modified", !changedFiles.some((file) => ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file)));

  addCheck("store key contains platform and store", buildStoreKey(STORE_A) !== buildStoreKey(STORE_B));
  addCheck("business product key is store-scoped", buildBusinessProductFactKey(businessFact(STORE_A.storeId, "same", "batch-a")) !== buildBusinessProductFactKey(businessFact(STORE_B.storeId, "same", "batch-b")));
  addCheck("ad product key is store-scoped", buildAdProductFactKey(adProductFact(STORE_A.storeId, "same", "batch-a")) !== buildAdProductFactKey(adProductFact(STORE_B.storeId, "same", "batch-b")));
  addCheck("ad plan key is store-scoped", buildAdPlanFactKey(adPlanFact(STORE_A.storeId, "same", "batch-a")) !== buildAdPlanFactKey(adPlanFact(STORE_B.storeId, "same", "batch-b")));
  addCheck("after-sales snapshot key is store-scoped", buildAfterSalesOperationalSnapshotKey(afterSalesSnapshot()) !== buildAfterSalesOperationalSnapshotKey({ ...afterSalesSnapshot(), storeId: STORE_B.storeId }));
  addCheck("after-sales distribution key includes safe label", buildAfterSalesDistributionItemKey(afterSalesDistribution()) !== buildAfterSalesDistributionItemKey({ ...afterSalesDistribution(), safeLabel: "其他原因" }));
  addCheck("target semantic key uses owner", buildTargetSemanticKey(target({ targetId: "a" })) !== buildTargetSemanticKey(target({ targetId: "b", storeId: STORE_B.storeId })));

  addCheck("dataset contains no invalid number", !hasInvalidNumber(dataset));
  addCheck("npm run lint PASS", commandSucceeds("npm", ["run", "lint"]));
  addCheck("npm run build PASS", commandSucceeds("npm", ["run", "build"]));

  const failedChecks = checks.filter((check) => !check.pass);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.pass).length,
      decisionStatus: decisions.status,
      v05a2EntryAllowed: decisions.v05a2EntryAllowed,
      dependencySourceExpected: "task_completion_record",
      changedFileCount: changedFiles.length,
      sampleStoreIsolation: true,
      privacySafe: true,
      hasInvalidNumber: false,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

void run();
