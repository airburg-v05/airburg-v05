import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  validateV2Dataset,
  type ActiveDatasetPointer,
  type ImportBatchRecord,
  type MigrationManifest,
  type OwnedAdProductFact,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type V2Dataset,
} from "../../lib/v05";
import {
  allocateChildTargetMutation,
  buildTargetAllocationChildOptions,
  buildTargetManagementViewModel,
  saveTargetDatasetMutation,
} from "../../lib/v05/target-management";
import { buildTargetAllocationSummary } from "../../lib/v05/target-hierarchy";
import { stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";
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
const NOW = "2026-06-23T15:00:00.000+08:00";
const F1_COMPLETION = "docs/project/task-completions/V0.5F_1_R1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER.json";

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

const manifest = (): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: "manifest-v05f2",
  migrationVersion: "v05f2-target-allocation-audit",
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
  datasetId: "dataset-v05f2-audit",
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
    series("tmall-default-store", "s-alt", ["p1"]),
    series("tmall-default-store", "s-paused", ["p2"]),
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
  targetValue: 120,
});
const seriesTarget = target({
  targetId: "series-gmv",
  scope: "series",
  parentTargetId: "store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-default",
  targetValue: 90,
});
const altSeriesTarget = target({
  targetId: "series-alt-gmv",
  scope: "series",
  parentTargetId: "store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-alt",
  targetValue: 20,
});
const pausedSeriesTarget = target({
  targetId: "series-paused-gmv",
  scope: "series",
  parentTargetId: "store-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-paused",
  targetValue: 30,
  status: "paused",
});
const ratioCompanyTarget = target({
  targetId: "company-conversion",
  scope: "company",
  metricKey: "conversionRate",
  targetValue: 0.2,
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
      migrationManifestId: "manifest-v05f2",
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

const f1Completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(F1_COMPLETION);
const lock = readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json");
const base = dataset([companyTarget, storeTarget, seriesTarget, altSeriesTarget, pausedSeriesTarget, ratioCompanyTarget]);
const beforeHash = stablePersistenceStringify(base);

const companyOptions = buildTargetAllocationChildOptions({ dataset: base, parentTarget: companyTarget });
const secondStoreOption = companyOptions.find((option) => option.storeId === "tmall-second-store");
const companyToStore = secondStoreOption
  ? allocateChildTargetMutation({
      parentTargetId: "company-gmv",
      childOptionValue: secondStoreOption.value,
      targetValue: 180,
    })({ dataset: base, now: NOW })
  : null;
const companyToStoreTarget = companyToStore && "targets" in companyToStore
  ? companyToStore.targets.find((item) => item.storeId === "tmall-second-store" && item.metricKey === "gmv")
  : null;

const storeOnly = dataset([companyTarget, storeTarget]);
const storeOptions = buildTargetAllocationChildOptions({ dataset: storeOnly, parentTarget: storeTarget });
const seriesOption = storeOptions.find((option) => option.seriesId === "s-default");
const storeToSeries = seriesOption
  ? allocateChildTargetMutation({
      parentTargetId: "store-gmv",
      childOptionValue: seriesOption.value,
      targetValue: 70,
    })({ dataset: storeOnly, now: NOW })
  : null;
const storeToSeriesTarget = storeToSeries && "targets" in storeToSeries
  ? storeToSeries.targets.find((item) => item.seriesId === "s-default" && item.parentTargetId === "store-gmv")
  : null;

const seriesOnly = dataset([companyTarget, storeTarget, seriesTarget]);
const productOptions = buildTargetAllocationChildOptions({ dataset: seriesOnly, parentTarget: seriesTarget });
const productOption = productOptions.find((option) => option.productId === "p1");
const seriesToProduct = productOption
  ? allocateChildTargetMutation({
      parentTargetId: "series-gmv",
      childOptionValue: productOption.value,
      targetValue: 40,
    })({ dataset: seriesOnly, now: NOW })
  : null;
const seriesToProductTarget = seriesToProduct && "targets" in seriesToProduct
  ? seriesToProduct.targets.find((item) => item.productId === "p1" && item.parentTargetId === "series-gmv")
  : null;

const illegalJump = allocateChildTargetMutation({
  parentTargetId: "company-gmv",
  childOptionValue: productOption?.value ?? "product:tmall:tmall-default-store:s-default:p1",
  targetValue: 10,
})({ dataset: base, now: NOW });

const crossStore = allocateChildTargetMutation({
  parentTargetId: "store-gmv",
  childOptionValue: "series:tmall:tmall-second-store:s-second",
  targetValue: 10,
})({ dataset: base, now: NOW });

const ratioAllocation = allocateChildTargetMutation({
  parentTargetId: "company-conversion",
  childOptionValue: "store:tmall:tmall-default-store",
  targetValue: 0.1,
})({ dataset: base, now: NOW });

const underSummary = buildTargetAllocationSummary({ parentTarget: companyTarget, childTargets: [storeTarget] });
const exactSummary = buildTargetAllocationSummary({
  parentTarget: companyTarget,
  childTargets: [storeTarget, target({
    targetId: "second-store-gmv-exact",
    scope: "store",
    parentTargetId: "company-gmv",
    platformCode: "tmall",
    storeId: "tmall-second-store",
    targetValue: 180,
  })],
});
const overSummary = buildTargetAllocationSummary({
  parentTarget: companyTarget,
  childTargets: [storeTarget, target({
    targetId: "second-store-gmv-over",
    scope: "store",
    parentTargetId: "company-gmv",
    platformCode: "tmall",
    storeId: "tmall-second-store",
    targetValue: 220,
  })],
});
const pausedSummary = buildTargetAllocationSummary({
  parentTarget: storeTarget,
  childTargets: [seriesTarget, pausedSeriesTarget],
});

const altProductOptions = buildTargetAllocationChildOptions({ dataset: seriesOnly, parentTarget: altSeriesTarget });
const p1FromAltOption = altProductOptions.find((option) => option.productId === "p1");

const vm = buildTargetManagementViewModel({ dataset: base, expectedCurrentDatasetId: base.datasetId });
const f2Source = fs.existsSync(path.join(ROOT, "lib/v05/target-management/allocation.ts"))
  ? fs.readFileSync(path.join(ROOT, "lib/v05/target-management/allocation.ts"), "utf8")
  : "";

const run = async () => {
  const conflictStore = new ConflictStore(base);
  const conflictResult = await saveTargetDatasetMutation({
    store: conflictStore,
    expectedCurrentDatasetId: base.datasetId,
    mutation: allocateChildTargetMutation({
      parentTargetId: "company-gmv",
      childOptionValue: secondStoreOption?.value ?? "",
      targetValue: 100,
    }),
    now: NOW,
  });

  const outputText = stablePersistenceStringify({
    counts: {
      targets: vm.rawTargets.length,
      companyOptions: companyOptions.length,
      storeOptions: storeOptions.length,
      productOptions: productOptions.length,
    },
    summaries: {
      under: underSummary.allocationStatus,
      exact: exactSummary.allocationStatus,
      over: overSummary.allocationStatus,
      paused: pausedSummary.pausedAllocatedValue,
    },
  });
  const sensitiveTerms = ["订单编号", "退款编号", "支付宝交易号", "手机号", "地址", "买家退款说明", "商家备注", "物流信息"];
  const invalidNumberPattern = /\b(?:NaN|Infinity|undefined)\b/;

  const checks: Check[] = [
    { name: "F1-R1 completion valid", pass: f1Completion.status === "complete" && f1Completion.commandResults.every((item) => item.status === "PASS") },
    { name: "V0.5F pending", pass: lock.stageStatuses["V0.5F"] === "pending" },
    { name: "company to store allocation correct", pass: companyToStoreTarget?.scope === "store" && companyToStoreTarget.parentTargetId === "company-gmv" && companyToStoreTarget.metricKey === "gmv" },
    { name: "store to series allocation correct", pass: storeToSeriesTarget?.scope === "series" && storeToSeriesTarget.parentTargetId === "store-gmv" && storeToSeriesTarget.seriesId === "s-default" },
    { name: "series to product allocation correct", pass: seriesToProductTarget?.scope === "product" && seriesToProductTarget.parentTargetId === "series-gmv" && seriesToProductTarget.productId === "p1" },
    { name: "child inherits metric period direction", pass: seriesToProductTarget?.metricKey === seriesTarget.metricKey && seriesToProductTarget.periodType === seriesTarget.periodType && seriesToProductTarget.periodValue === seriesTarget.periodValue && seriesToProductTarget.direction === seriesTarget.direction },
    { name: "illegal jump blocked", pass: !!illegalJump && "status" in illegalJump && illegalJump.status === "validation_error" },
    { name: "cross-store allocation blocked", pass: "status" in crossStore && crossStore.status === "validation_error" },
    { name: "non-additive metric blocked", pass: "status" in ratioAllocation && ratioAllocation.status === "validation_error" },
    { name: "under allocation summary correct", pass: underSummary.allocationStatus === "under_allocated" && underSummary.remainingValue === 180 },
    { name: "exact allocation summary correct", pass: exactSummary.allocationStatus === "fully_allocated" && exactSummary.remainingValue === 0 },
    { name: "over allocation summary correct", pass: overSummary.allocationStatus === "over_allocated" && overSummary.overAllocatedValue === 40 },
    { name: "paused allocation retained but excluded from active", pass: pausedSummary.pausedAllocatedValue === 30 && pausedSummary.activeAllocatedValue === 90 },
    { name: "product in multiple series requires explicit parent series target", pass: productOption?.value.includes(":s-default:") === true && p1FromAltOption?.value.includes(":s-alt:") === true },
    { name: "ad-only product allocation candidate retained", pass: productOptions.some((option) => option.productId === "ad-only") },
    { name: "duplicate child semantic hidden", pass: !!seriesToProduct && "targets" in seriesToProduct && !buildTargetAllocationChildOptions({ dataset: seriesToProduct, parentTarget: seriesTarget }).some((option) => option.productId === "p1") },
    { name: "dataset valid after company allocation", pass: !!companyToStore && "targets" in companyToStore && validateV2Dataset(companyToStore).valid },
    { name: "dataset valid after series allocation", pass: !!seriesToProduct && "targets" in seriesToProduct && validateV2Dataset(seriesToProduct).valid },
    { name: "concurrent conflict does not overwrite", pass: conflictResult.status === "conflict" && conflictStore.prepared === false },
    { name: "legacy candidates preserved", pass: !!companyToStore && "targets" in companyToStore && companyToStore.legacyTargetCandidates.length === base.legacyTargetCandidates.length },
    { name: "source dataset not mutated", pass: beforeHash === stablePersistenceStringify(base) },
    { name: "no auto allocation wording in implementation", pass: !/平均分配|销量比例|贡献.*分配|AI 分配/.test(f2Source) },
    { name: "no sensitive output", pass: sensitiveTerms.every((term) => !outputText.includes(term)) },
    { name: "no invalid number output", pass: !invalidNumberPattern.test(outputText) },
  ];

  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({
    status: failed.length === 0 ? "PASS" : "FAIL",
    task: "V0.5F_2_PARENT_CHILD_TARGET_ALLOCATION_WORKFLOW",
    failedChecks: failed.map((check) => check.name),
    safeCounts: {
      targetRows: vm.targets.length,
      companyChildOptions: companyOptions.length,
      storeChildOptions: storeOptions.length,
      seriesChildOptions: productOptions.length,
    },
    allocationStatuses: {
      under: underSummary.allocationStatus,
      exact: exactSummary.allocationStatus,
      over: overSummary.allocationStatus,
    },
    checks,
  }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

void run().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
