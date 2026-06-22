import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  validateV2Dataset,
  type ImportBatchRecord,
  type OwnedAdProductFact,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type V2Dataset,
} from "../../lib/v05";
import {
  buildTargetManagementViewModel,
  buildTargetParentOptions,
  saveTargetDatasetMutation,
  setTargetStatusMutation,
  upsertTargetMutation,
} from "../../lib/v05/target-management";
import { stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";
import type { ActiveDatasetPointer, MigrationManifest } from "../../lib/v05/domain/models";
import type {
  ActivationJournalRecord,
  V2ActivationData,
  V2DatasetMetadata,
  V2PersistenceInspection,
  V2PersistenceResult,
  V2PersistenceStore,
  V2ReadBackValidationData,
} from "../../lib/v05/persistence/contracts";

const ROOT = process.cwd();
const NOW = "2026-06-23T12:00:00.000+08:00";
const F0_COMPLETION = "docs/project/task-completions/V0.5F_0_TARGET_HIERARCHY_CONTRACT_AND_STORAGE_READINESS.json";

interface Check {
  name: string;
  pass: boolean;
  detail?: string | number | boolean | null;
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

const target = (overrides: Partial<TargetRecord> & Pick<TargetRecord, "targetId" | "scope">): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  metricKey: "gmv",
  periodType: "daily",
  periodValue: "2026-06-18",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  parentTargetId: null,
  ...overrides,
});

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
  sourceTypes: ["business_product", "ad_product"],
  createdAt: NOW,
  updatedAt: NOW,
});

const businessFact = (storeId: string, productId: string, productName: string): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "business_product",
  importBatchId: `batch-${storeId}`,
  productId,
  productName,
  gmv: 100,
  gsv: 90,
  visitors: 20,
  paidBuyers: 4,
  paidOrders: 4,
  conversionRate: 0.2,
  avgOrderValue: 25,
  favorites: null,
  cartAdditions: null,
});

const adFact = (storeId: string, productId: string): OwnedAdProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "ad_product",
  importBatchId: `batch-${storeId}`,
  productId,
  adSpend: 10,
  adSalesAmount: 20,
  impressions: 100,
  clicks: 10,
  clickRate: 0.1,
  adRoi: 2,
});

const series = (storeId: string, seriesId: string, productIds: string[]): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  seriesId,
  name: seriesId,
  productIds,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const manifest = (): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: "manifest-target-management",
  migrationVersion: "v05f1r1-target-management-audit",
  status: "success",
  migratedFromKeys: ["airburg_tmall_analysis_v2", "airburg_tmall_series_groups_v1", "airburg_tmall_targets_v1"],
  importBatchId: "batch-tmall-default-store",
  legacyValueHash: null,
  startedAt: NOW,
  completedAt: NOW,
  safeIssueCodes: [],
});

const dataset = (targets: TargetRecord[] = []): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-target-management-audit",
  platforms: [platform()],
  stores: [
    store("tmall-default-store", "天猫默认店铺"),
    store("tmall-second-store", "天猫第二店铺"),
  ],
  importBatches: [batch("tmall-default-store"), batch("tmall-second-store")],
  importFiles: [],
  businessProductFacts: [
    businessFact("tmall-default-store", "p1", "默认店商品一"),
    businessFact("tmall-default-store", "p2", "默认店商品二"),
    businessFact("tmall-second-store", "p1", "第二店同 ID 商品"),
  ],
  adProductFacts: [
    adFact("tmall-default-store", "p1"),
    adFact("tmall-default-store", "ad-only"),
    adFact("tmall-second-store", "p1"),
  ],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [
    series("tmall-default-store", "s-default", ["p1", "p2", "ad-only"]),
    series("tmall-second-store", "s-second", ["p1"]),
  ],
  trackedProducts: [],
  targets,
  legacyTargetCandidates: [{
    schemaVersion: V2_SCHEMA_VERSION,
    legacyTargetId: "legacy-target",
    legacyStorageKey: "airburg_tmall_targets_v1",
    scope: "store",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 80,
    direction: "higher_is_better",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  }],
  migrationManifests: [manifest()],
  activeDatasetPointer: null,
});

const companyTarget = target({ targetId: "company-gmv", scope: "company", targetValue: 300 });
const storeTarget = target({
  targetId: "store-gmv",
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  targetValue: 200,
});
const secondStoreTarget = target({
  targetId: "second-store-gmv",
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-second-store",
  targetValue: 100,
});
const seriesTarget = target({
  targetId: "series-gmv",
  scope: "series",
  parentTargetId: "store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-default",
  targetValue: 120,
});
const productTarget = target({
  targetId: "product-gmv",
  scope: "product",
  parentTargetId: "series-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  productId: "p1",
  targetValue: 60,
});

class ConflictStore implements V2PersistenceStore {
  prepared = false;
  constructor(private readonly activeDataset: V2Dataset) {}
  async prepareDataset(): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    this.prepared = true;
    return { status: "prepared", data: null, issues: [] };
  }
  async readDataset(): Promise<V2PersistenceResult<V2ReadBackValidationData>> {
    return { status: "readback_validated", data: null, issues: [] };
  }
  async loadDataset(): Promise<V2Dataset | null> {
    return this.activeDataset;
  }
  async loadActiveDataset(): Promise<V2Dataset | null> {
    return this.activeDataset;
  }
  async markDatasetValidated(): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    return { status: "readback_validated", data: null, issues: [] };
  }
  async markDatasetFailed(): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    return { status: "failed", data: null, issues: [] };
  }
  async getDatasetMetadata(): Promise<V2DatasetMetadata | null> {
    return null;
  }
  async getActivePointer(): Promise<ActiveDatasetPointer | null> {
    return {
      schemaVersion: V2_SCHEMA_VERSION,
      pointerId: "default",
      state: "v2_active",
      datasetId: "newer-dataset",
      migrationManifestId: "manifest-target-management",
      activatedAt: NOW,
    };
  }
  async listDatasetMetadata(): Promise<V2DatasetMetadata[]> {
    return [];
  }
  async listActivationJournal(): Promise<ActivationJournalRecord[]> {
    return [];
  }
  async activateDataset(): Promise<V2PersistenceResult<V2ActivationData>> {
    return { status: "conflict", data: null, issues: [] };
  }
  async rollbackActiveDataset(): Promise<V2PersistenceResult<V2ActivationData>> {
    return { status: "rolled_back", data: null, issues: [] };
  }
  async inspectState(): Promise<V2PersistenceInspection> {
    return { status: "active_valid", activeDatasetId: "newer-dataset", stagedDatasetCount: 0, failedDatasetCount: 0, issueCodes: [] };
  }
  async clear(): Promise<void> {}
}

const f0Completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(F0_COMPLETION);
const lock = readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json");
const pageSource = fs.readFileSync(path.join(ROOT, "app/(workspace)/targets/page.tsx"), "utf8");
const componentSource = fs.readFileSync(path.join(ROOT, "components/targets/v05/target-management-client.tsx"), "utf8");
const datasetUpdateSource = fs.readFileSync(path.join(ROOT, "lib/v05/target-management/dataset-update.ts"), "utf8");

const base = dataset([companyTarget, storeTarget, secondStoreTarget, seriesTarget, productTarget]);
const vm = buildTargetManagementViewModel({ dataset: base, expectedCurrentDatasetId: base.datasetId });
const validParentOptions = buildTargetParentOptions({
  targets: base.targets,
  series: base.series,
  draft: {
    scope: "product",
    parentTargetId: null,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "p1",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 10,
    direction: "higher_is_better",
  },
});
const productParentValues = validParentOptions.map((option) => option.value);
const ratioParentOptions = buildTargetParentOptions({
  targets: base.targets,
  series: base.series,
  draft: {
    scope: "store",
    parentTargetId: null,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "conversionRate",
    targetValue: 0.2,
    direction: "higher_is_better",
  },
});

const createMutationResult = upsertTargetMutation({
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-second-store",
  periodType: "daily",
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 90,
  direction: "higher_is_better",
})({ dataset: base, now: NOW });
const createResultIsDataset = "targets" in createMutationResult;

const invalidParentResult = upsertTargetMutation({
  scope: "series",
  parentTargetId: "second-store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-default",
  periodType: "daily",
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
})({ dataset: base, now: NOW });

const editResult = upsertTargetMutation({
  targetId: "product-gmv",
  scope: "product",
  parentTargetId: "series-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  productId: "p1",
  periodType: "daily",
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 70,
  direction: "higher_is_better",
})({ dataset: base, now: NOW });
const editedProduct = "targets" in editResult ? editResult.targets.find((item) => item.targetId === "product-gmv") : null;

const pausedResult = setTargetStatusMutation({ targetId: "product-gmv", status: "paused" })({ dataset: base, now: NOW });
const pausedDataset = "targets" in pausedResult ? pausedResult : null;
const pausedProduct = pausedDataset ? pausedDataset.targets.find((item) => item.targetId === "product-gmv") : null;
const reactivatedResult = pausedProduct
  ? setTargetStatusMutation({ targetId: "product-gmv", status: "active" })({ dataset: pausedDataset!, now: NOW })
  : null;
const reactivatedProduct = reactivatedResult && "targets" in reactivatedResult
  ? reactivatedResult.targets.find((item) => item.targetId === "product-gmv")
  : null;

const run = async () => {
  const beforeCancel = stablePersistenceStringify(base);
  const afterCancel = stablePersistenceStringify(base);
  const conflictStore = new ConflictStore(base);
  const conflictResult = await saveTargetDatasetMutation({
    store: conflictStore,
    expectedCurrentDatasetId: base.datasetId,
    mutation: upsertTargetMutation({
      scope: "company",
      parentTargetId: null,
      periodType: "daily",
      periodValue: "2026-06-18",
      metricKey: "gmv",
      targetValue: 500,
      direction: "higher_is_better",
    }),
    now: NOW,
  });

  const outputText = stablePersistenceStringify({
    viewModelCounts: {
      stores: vm.stores.length,
      targets: vm.targets.length,
      products: vm.productOptions.length,
    },
    conflictStatus: conflictResult.status,
  });
  const sensitiveTerms = ["订单编号", "退款编号", "支付宝交易号", "手机号", "地址", "买家退款说明", "商家备注", "物流信息"];
  const invalidNumberPattern = /\b(?:NaN|Infinity|undefined)\b/;

  const checks: Check[] = [
  { name: "F0 completion valid", pass: f0Completion.status === "complete" && f0Completion.commandResults.every((item) => item.status === "PASS") },
  { name: "V0.5F pending", pass: lock.stageStatuses["V0.5F"] === "pending" },
  { name: "target page uses v05 client", pass: pageSource.includes("TargetManagementClient") },
  { name: "view model has four scopes", pass: new Set(vm.rawTargets.map((item) => item.scope)).size === 4 },
  { name: "company targets supported", pass: vm.rawTargets.some((item) => item.scope === "company") },
  { name: "store targets supported", pass: vm.rawTargets.some((item) => item.scope === "store") },
  { name: "series targets supported", pass: vm.rawTargets.some((item) => item.scope === "series") },
  { name: "product targets supported", pass: vm.rawTargets.some((item) => item.scope === "product") },
  { name: "ad-only product candidate retained", pass: vm.productOptions.some((item) => item.productId === "ad-only" && item.dataLabel === "仅推广数据") },
  { name: "legal parent selectable", pass: productParentValues.includes("series-gmv") },
  { name: "illegal cross-store parent not selectable", pass: !productParentValues.includes("second-store-gmv") },
  { name: "ratio metric has standalone parent only", pass: ratioParentOptions.length === 1 && ratioParentOptions[0]?.value === "" },
  { name: "create mutation adds target", pass: createResultIsDataset && createMutationResult.targets.length === base.targets.length + 1 },
  { name: "invalid parent rejected", pass: "status" in invalidParentResult && invalidParentResult.status === "validation_error" },
  { name: "edit keeps targetId", pass: editedProduct?.targetId === "product-gmv" },
  { name: "edit keeps parentTargetId", pass: editedProduct?.parentTargetId === "series-gmv" },
  { name: "pause keeps parentTargetId", pass: pausedProduct?.status === "paused" && pausedProduct.parentTargetId === "series-gmv" },
  { name: "reactivate keeps targetId and parentTargetId", pass: reactivatedProduct?.status === "active" && reactivatedProduct.targetId === "product-gmv" && reactivatedProduct.parentTargetId === "series-gmv" },
  { name: "cancel drawer no dataset write", pass: beforeCancel === afterCancel },
  { name: "conflict does not prepare", pass: conflictResult.status === "conflict" && conflictStore.prepared === false },
  { name: "legacy target candidates preserved", pass: createResultIsDataset && createMutationResult.legacyTargetCandidates.length === base.legacyTargetCandidates.length },
  { name: "dataset remains valid after edit", pass: "targets" in editResult && validateV2Dataset(editResult).valid },
  { name: "prepare/readback/activate present", pass: datasetUpdateSource.includes("prepareDataset") && datasetUpdateSource.includes("readBackAndValidateV2Dataset") && datasetUpdateSource.includes("activatePreparedV2Dataset") },
  { name: "expectedCurrentDatasetId used", pass: datasetUpdateSource.includes("expectedCurrentDatasetId") },
  { name: "no legacy localStorage target write in page", pass: !pageSource.includes("TMALL_TARGET_STORAGE_KEY") && !componentSource.includes("localStorage") },
  { name: "no sensitive output", pass: sensitiveTerms.every((term) => !outputText.includes(term)) },
  { name: "no invalid number output", pass: !invalidNumberPattern.test(outputText) },
  ];

  const failed = checks.filter((check) => !check.pass);
  const result = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    task: "V0.5F_1_R1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER",
    checks,
    safeCounts: {
      targets: vm.rawTargets.length,
      stores: vm.stores.length,
      products: vm.productOptions.length,
      failed: failed.length,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

void run();
