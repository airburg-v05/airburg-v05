import fs from "node:fs";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  buildHomeCommandCenterViewModel,
  type ActiveDatasetPointer,
  type ImportBatchRecord,
  type MigrationManifest,
  type OwnedAdProductFact,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type TrackedProductRecord,
  type V2Dataset,
} from "../../lib/v05";
import { buildV2ProductBoardViewModel } from "../../lib/v05/product-board";
import { buildV2SeriesBoardViewModel } from "../../lib/v05/series-board";
import { buildV2StoreBoardViewModel } from "../../lib/v05/store-board";
import {
  buildTargetManagementViewModel,
  saveTargetDatasetMutation,
  setTargetStatusMutation,
  upsertTargetMutation,
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
const NOW = "2026-06-23T16:00:00.000+08:00";
const F3_COMPLETION = "docs/project/task-completions/V0.5F_3_TARGET_CONTEXT_AND_BOARD_INTEGRATION.json";

interface Check {
  name: string;
  pass: boolean;
  detail?: unknown;
}

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

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

const businessFact = (storeId: string, productId: string, productName: string, gmv: number): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "business_product",
  importBatchId: `batch-${storeId}`,
  productId,
  productName,
  gmv,
  gsv: gmv * 0.9,
  visitors: 100,
  paidBuyers: 10,
  paidOrders: 10,
  conversionRate: 0.1,
  avgOrderValue: gmv / 10,
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
  adSpend: 20,
  adSalesAmount: 60,
  impressions: 1000,
  clicks: 100,
  clickRate: 0.1,
  adRoi: 3,
});

const series = (storeId: string, seriesId: string, name: string, productIds: string[]): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  seriesId,
  name,
  productIds,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const tracked = (storeId: string, trackedProductId: string, productId: string): TrackedProductRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  trackedProductId,
  productId,
  displayName: null,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const manifest = (): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: "manifest-v05f4",
  migrationVersion: "v05f4-target-runtime-audit",
  status: "success",
  migratedFromKeys: ["airburg_tmall_analysis_v2", "airburg_tmall_series_groups_v1", "airburg_tmall_targets_v1"],
  importBatchId: "batch-tmall-default-store",
  legacyValueHash: null,
  startedAt: NOW,
  completedAt: NOW,
  safeIssueCodes: [],
});

const legacyCandidate = () => ({
  schemaVersion: V2_SCHEMA_VERSION,
  legacyTargetId: "legacy-target-kept",
  legacyStorageKey: "airburg_tmall_targets_v1",
  scope: "store" as const,
  platformCode: "tmall" as const,
  storeId: "tmall-default-store",
  periodType: "daily" as const,
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 80,
  direction: "higher_is_better" as const,
  status: "active" as const,
  createdAt: NOW,
  updatedAt: NOW,
});

const dataset = (targets: TargetRecord[] = []): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-v05f4-audit",
  platforms: [platform()],
  stores: [
    store("tmall-default-store", "天猫默认店铺"),
    store("tmall-second-store", "天猫第二店铺"),
  ],
  importBatches: [batch("tmall-default-store"), batch("tmall-second-store")],
  importFiles: [],
  businessProductFacts: [
    businessFact("tmall-default-store", "p1", "默认店商品一", 100),
    businessFact("tmall-default-store", "p2", "默认店商品二", 80),
    businessFact("tmall-second-store", "p1", "第二店同 ID 商品", 120),
  ],
  adProductFacts: [
    adFact("tmall-default-store", "p1"),
    adFact("tmall-default-store", "p2"),
    adFact("tmall-second-store", "p1"),
  ],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [
    series("tmall-default-store", "s-default", "核心系列", ["p1", "p2"]),
    series("tmall-default-store", "s-alt", "补充系列", ["p2"]),
    series("tmall-second-store", "s-default", "核心系列", ["p1"]),
  ],
  trackedProducts: [
    tracked("tmall-default-store", "tp-default-p1", "p1"),
    tracked("tmall-second-store", "tp-second-p1", "p1"),
  ],
  targets,
  legacyTargetCandidates: [legacyCandidate()],
  migrationManifests: [manifest()],
  activeDatasetPointer: null,
});

const companyTarget = target({ targetId: "company-gmv", scope: "company", targetValue: 300 });
const secondCompanyTarget = target({ targetId: "company-gmv-next", scope: "company", targetValue: 500 });
const storeTarget = target({
  targetId: "store-default-gmv",
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  targetValue: 120,
});
const secondStoreTarget = target({
  targetId: "store-second-gmv",
  scope: "store",
  parentTargetId: "company-gmv",
  platformCode: "tmall",
  storeId: "tmall-second-store",
  targetValue: 180,
});
const seriesTarget = target({
  targetId: "series-default-gmv",
  scope: "series",
  parentTargetId: "store-default-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: "s-default",
  targetValue: 90,
});
const productTarget = target({
  targetId: "product-default-p1-gmv",
  scope: "product",
  parentTargetId: "series-default-gmv",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  productId: "p1",
  targetValue: 40,
});

class ConflictStore implements V2PersistenceStore {
  prepared = false;
  activated = false;
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
      migrationManifestId: "manifest-v05f4",
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
    this.activated = true;
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

const run = async () => {
  const f3Completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(F3_COMPLETION);
  const lock = readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json");
  const empty = dataset();
  const beforeEmptyHash = stablePersistenceStringify(empty);

  const companyCreate = upsertTargetMutation({
    scope: "company",
    parentTargetId: null,
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 300,
    direction: "higher_is_better",
  })({ dataset: empty, now: NOW });
  const companyCreated = "targets" in companyCreate ? companyCreate.targets.find((item) => item.scope === "company") : null;

  const storeCreate = companyCreated
    ? upsertTargetMutation({
        scope: "store",
        parentTargetId: companyCreated.targetId,
        platformCode: "tmall",
        storeId: "tmall-default-store",
        periodType: "daily",
        periodValue: "2026-06-18",
        metricKey: "gmv",
        targetValue: 120,
        direction: "higher_is_better",
      })({ dataset: companyCreate as V2Dataset, now: NOW })
    : null;
  const storeCreated = storeCreate && "targets" in storeCreate ? storeCreate.targets.find((item) => item.scope === "store") : null;

  const seriesCreate = storeCreated
    ? upsertTargetMutation({
        scope: "series",
        parentTargetId: storeCreated.targetId,
        platformCode: "tmall",
        storeId: "tmall-default-store",
        seriesId: "s-default",
        periodType: "daily",
        periodValue: "2026-06-18",
        metricKey: "gmv",
        targetValue: 90,
        direction: "higher_is_better",
      })({ dataset: storeCreate as V2Dataset, now: NOW })
    : null;
  const seriesCreated = seriesCreate && "targets" in seriesCreate ? seriesCreate.targets.find((item) => item.scope === "series") : null;

  const productCreate = seriesCreated
    ? upsertTargetMutation({
        scope: "product",
        parentTargetId: seriesCreated.targetId,
        platformCode: "tmall",
        storeId: "tmall-default-store",
        productId: "p1",
        periodType: "daily",
        periodValue: "2026-06-18",
        metricKey: "gmv",
        targetValue: 40,
        direction: "higher_is_better",
      })({ dataset: seriesCreate as V2Dataset, now: NOW })
    : null;
  const productCreated = productCreate && "targets" in productCreate ? productCreate.targets.find((item) => item.scope === "product") : null;

  const base = dataset([companyTarget, secondCompanyTarget, storeTarget, secondStoreTarget, seriesTarget, productTarget]);
  const beforeBaseHash = stablePersistenceStringify(base);
  const edit = upsertTargetMutation({
    targetId: "product-default-p1-gmv",
    scope: "product",
    parentTargetId: "series-default-gmv",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "p1",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 55,
    direction: "higher_is_better",
  })({ dataset: base, now: NOW });
  const editedProduct = "targets" in edit ? edit.targets.find((item) => item.targetId === "product-default-p1-gmv") : null;
  const pause = setTargetStatusMutation({ targetId: "product-default-p1-gmv", status: "paused" })({ dataset: base, now: NOW });
  const pausedProduct = "targets" in pause ? pause.targets.find((item) => item.targetId === "product-default-p1-gmv") : null;
  const reactivate = "targets" in pause
    ? setTargetStatusMutation({ targetId: "product-default-p1-gmv", status: "active" })({ dataset: pause, now: NOW })
    : null;
  const reactivatedProduct = reactivate && "targets" in reactivate ? reactivate.targets.find((item) => item.targetId === "product-default-p1-gmv") : null;
  const parentChange = upsertTargetMutation({
    targetId: "store-default-gmv",
    scope: "store",
    parentTargetId: "company-gmv-next",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 120,
    direction: "higher_is_better",
  })({ dataset: base, now: NOW });
  const changedParent = "targets" in parentChange ? parentChange.targets.find((item) => item.targetId === "store-default-gmv") : null;
  const invalidCrossStoreParent = upsertTargetMutation({
    targetId: "series-default-gmv",
    scope: "series",
    parentTargetId: "store-second-gmv",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "s-default",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 90,
    direction: "higher_is_better",
  })({ dataset: base, now: NOW });

  const under = buildTargetAllocationSummary({
    parentTarget: secondCompanyTarget,
    childTargets: [{ ...storeTarget, parentTargetId: "company-gmv-next", targetValue: 120 }],
  });
  const exact = buildTargetAllocationSummary({ parentTarget: companyTarget, childTargets: [storeTarget, secondStoreTarget] });
  const over = buildTargetAllocationSummary({
    parentTarget: companyTarget,
    childTargets: [storeTarget, { ...secondStoreTarget, targetValue: 220 }],
  });
  const paused = buildTargetAllocationSummary({
    parentTarget: storeTarget,
    childTargets: [seriesTarget, { ...target({ targetId: "paused-series", scope: "series" }), parentTargetId: "store-default-gmv", status: "paused", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "s-alt", targetValue: 30 }],
  });

  const conflictStore = new ConflictStore(base);
  const conflict = await saveTargetDatasetMutation({
    store: conflictStore,
    expectedCurrentDatasetId: base.datasetId,
    mutation: upsertTargetMutation({
      scope: "company",
      parentTargetId: null,
      periodType: "daily",
      periodValue: "2026-06-18",
      metricKey: "gmv",
      targetValue: 999,
      direction: "higher_is_better",
    }),
    now: NOW,
  });

  const home = buildHomeCommandCenterViewModel({
    dataset: base,
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
    platformFilter: "all",
    storeFilter: "all",
  });
  const storeVm = buildV2StoreBoardViewModel({
    dataset: base,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
  });
  const seriesVm = buildV2SeriesBoardViewModel({
    dataset: base,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "s-default",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
  });
  const productVm = buildV2ProductBoardViewModel({
    dataset: base,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    trackedProductId: "tp-default-p1",
    productId: "p1",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
  });
  const secondProductVm = buildV2ProductBoardViewModel({
    dataset: base,
    platformCode: "tmall",
    storeId: "tmall-second-store",
    trackedProductId: "tp-second-p1",
    productId: "p1",
    selectedPeriod: "day",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
  });
  const weekStoreVm = buildV2StoreBoardViewModel({
    dataset: base,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    selectedPeriod: "week",
    selectedDate: "2026-06-18",
    customDateRange: { start: "", end: "" },
  });
  const targetManagementVm = buildTargetManagementViewModel({ dataset: base, expectedCurrentDatasetId: base.datasetId });
  const noMutationHash = stablePersistenceStringify(empty);
  const outputText = stablePersistenceStringify({
    home: home.targetProgress,
    store: storeVm.targetProgress,
    series: seriesVm.targetProgress,
    product: productVm.targetProgress,
    targetManagement: targetManagementVm.targets,
  });
  const currentTask = readJson<{ taskId: string; status: string }>("docs/project/current-task.json");
  const packageJson = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");

  const checks: Check[] = [
    { name: "F3 completion complete", pass: f3Completion.status === "complete" && f3Completion.commandResults.every((item) => item.status === "PASS") },
    { name: "stage statuses allow F4", pass: lock.stageStatuses["V0.5F"] === "pending" && lock.stageStatuses["V0.5E"] === "complete" },
    { name: "current task is F4", pass: currentTask.taskId === "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE" && currentTask.status === "in_progress" },
    { name: "create company target", pass: companyCreated?.scope === "company" && companyCreated.parentTargetId === null },
    { name: "create store target", pass: storeCreated?.scope === "store" && storeCreated.parentTargetId === companyCreated?.targetId },
    { name: "create series target", pass: seriesCreated?.scope === "series" && seriesCreated.parentTargetId === storeCreated?.targetId },
    { name: "create product target", pass: productCreated?.scope === "product" && productCreated.parentTargetId === seriesCreated?.targetId },
    { name: "edit target value", pass: editedProduct?.targetValue === 55 && editedProduct.parentTargetId === "series-default-gmv" },
    { name: "pause target keeps id and parent", pass: pausedProduct?.status === "paused" && pausedProduct.parentTargetId === "series-default-gmv" },
    { name: "reactivate target keeps id and parent", pass: reactivatedProduct?.status === "active" && reactivatedProduct.parentTargetId === "series-default-gmv" },
    { name: "legal parent relation changed", pass: changedParent?.parentTargetId === "company-gmv-next" },
    { name: "cross-store parent rejected", pass: "status" in invalidCrossStoreParent && invalidCrossStoreParent.status === "validation_error" },
    { name: "under allocation status", pass: under.allocationStatus === "under_allocated" },
    { name: "exact allocation status", pass: exact.allocationStatus === "fully_allocated" },
    { name: "over allocation status", pass: over.allocationStatus === "over_allocated" },
    { name: "paused child excluded from active allocation", pass: paused.activeAllocatedValue === 90 && paused.pausedAllocatedValue === 30 },
    { name: "conflict result does not prepare or activate", pass: conflict.status === "conflict" && !conflictStore.prepared && !conflictStore.activated },
    { name: "cancel/no unsaved close does not mutate", pass: beforeEmptyHash === noMutationHash },
    { name: "source dataset not mutated", pass: beforeBaseHash === stablePersistenceStringify(base) },
    { name: "legacy target candidate preserved", pass: ("targets" in edit ? edit.legacyTargetCandidates[0]?.legacyStorageKey : null) === "airburg_tmall_targets_v1" },
    { name: "non-default store does not write legacy candidate", pass: base.legacyTargetCandidates.length === 1 && !base.legacyTargetCandidates.some((item) => item.storeId === "tmall-second-store") },
    { name: "home only company target", pass: home.targetProgress.length === 2 && home.targetProgress.every((item) => item.targetId.startsWith("company-")) },
    { name: "store only current store target", pass: storeVm.targetProgress.length === 1 && storeVm.targetProgress[0]?.targetId === "store-default-gmv" },
    { name: "series only current series target", pass: seriesVm.targetProgress.length === 1 && seriesVm.targetProgress[0]?.targetId === "series-default-gmv" },
    { name: "product only current product target", pass: productVm.targetProgress.length === 1 && productVm.targetProgress[0]?.targetId === "product-default-p1-gmv" },
    { name: "same productId cross-store target isolated", pass: secondProductVm.targetProgress.length === 0 },
    { name: "week view does not fold daily target", pass: weekStoreVm.targetProgress.length === 0 },
    { name: "target management allocation summaries visible", pass: targetManagementVm.targets.some((row) => row.allocationSummary?.allocationStatus === "fully_allocated") },
    { name: "no invalid numbers", pass: !/\bNaN\b|\bInfinity\b|\bundefined\b/.test(outputText) },
    { name: "no sensitive field names", pass: !/(订单编号|退款编号|支付宝交易号|手机号|电话|地址|收件人|买家退款说明|商家备注|物流单号|物流信息)/.test(outputText) },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
  ];

  const failed = checks.filter((check) => !check.pass);
  const report = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    taskId: "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE",
    checks,
    safeCounts: {
      createdTargets: productCreate && "targets" in productCreate ? productCreate.targets.length : 0,
      targetManagementRows: targetManagementVm.targets.length,
      legacyTargetCandidates: base.legacyTargetCandidates.length,
    },
    allocationStatuses: {
      under: under.allocationStatus,
      exact: exact.allocationStatus,
      over: over.allocationStatus,
    },
    conflictStatus: conflict.status,
    boardTargetCounts: {
      home: home.targetProgress.length,
      store: storeVm.targetProgress.length,
      series: seriesVm.targetProgress.length,
      product: productVm.targetProgress.length,
    },
    failedChecks: failed.map((check) => check.name),
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

void run().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exitCode = 1;
});
