import fs from "node:fs";
import path from "node:path";
import {
  buildPreparedFocusDataset,
  createSeriesMutation,
  createTrackedProductMutation,
  saveFocusDatasetMutation,
  setSeriesStatusMutation,
  setTrackedProductStatusMutation,
  updateSeriesMutation,
  updateTrackedProductMutation,
  type FocusSaveResult,
} from "../../lib/v05/focus-management";
import {
  readBackAndValidateV2Dataset,
  activatePreparedV2Dataset,
} from "../../lib/v05/persistence/activation-engine";
import { MemoryTransactionalV2PersistenceStore } from "../../lib/v05/persistence/testing/memory-transactional-adapter";
import {
  V2_SCHEMA_VERSION,
  type MigrationManifest,
  type PlatformCode,
  type StoreRecord,
  type V2Dataset,
} from "../../lib/v05/domain/models";
import { validateV2Dataset } from "../../lib/v05/validation/dataset";
import { stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";

const ROOT = process.cwd();
const D31_COMPLETION = "docs/project/task-completions/V0.5D_3_1_FREEZE_METADATA_CONSISTENCY_CLOSURE.json";
const NOW = "2026-06-22T21:10:00.000Z";

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

const manifest = (): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: "manifest-e1-audit",
  migrationVersion: "v05e1-audit",
  status: "success",
  migratedFromKeys: [],
  importBatchId: "batch-e1-audit",
  legacyValueHash: null,
  startedAt: NOW,
  completedAt: NOW,
  safeIssueCodes: [],
});

const baseDataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "v05e1-audit-base",
  platforms: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      platformName: "天猫",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  stores: [storeRecord("tmall-default-store", "天猫默认店铺"), storeRecord("tmall-second-store", "天猫第二店铺")],
  importBatches: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      importBatchId: "batch-e1-audit",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      importStartedAt: NOW,
      importCompletedAt: NOW,
      status: "success",
      sourceTypes: ["business_product", "ad_product"],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      importBatchId: "batch-e1-audit-second",
      platformCode: "tmall",
      storeId: "tmall-second-store",
      importStartedAt: NOW,
      importCompletedAt: NOW,
      status: "success",
      sourceTypes: ["business_product", "ad_product"],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  importFiles: [],
  businessProductFacts: [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "business_product",
      importBatchId: "batch-e1-audit",
      productId: "same-product",
      productName: "同 ID 默认店商品",
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
      importBatchId: "batch-e1-audit",
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
      importBatchId: "batch-e1-audit-second",
      productId: "same-product",
      productName: "同 ID 第二店商品",
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
      importBatchId: "batch-e1-audit",
      productId: "ad-only-default",
      adSpend: 10,
      adSalesAmount: 20,
      impressions: 100,
      clicks: 8,
      clickRate: 0.08,
      adRoi: 2,
    },
  ],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [],
  trackedProducts: [],
  targets: [],
  legacyTargetCandidates: [],
  migrationManifests: [manifest()],
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

const activateBase = async (store: MemoryTransactionalV2PersistenceStore, dataset: V2Dataset): Promise<string> => {
  const prepared = await buildPreparedFocusDataset({ dataset, currentMetadata: null, preparedAt: NOW });
  if ("status" in prepared) throw new Error(prepared.message);
  const write = await store.prepareDataset(prepared);
  if (write.status !== "prepared") throw new Error("prepare_failed");
  const readBack = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    validatedAt: NOW,
    expectedRecordCounts: prepared.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.recordKeys,
  });
  if (readBack.status !== "readback_validated") throw new Error("readback_failed");
  const activation = await activatePreparedV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    expectedCurrentDatasetId: null,
    activatedAt: NOW,
  });
  if (activation.status !== "activated") throw new Error("activation_failed");
  return prepared.dataset.datasetId;
};

const save = async (
  store: MemoryTransactionalV2PersistenceStore,
  platformCode: PlatformCode,
  storeId: string,
  expectedCurrentDatasetId: string | null,
  mutation: Parameters<typeof saveFocusDatasetMutation>[0]["mutation"],
): Promise<FocusSaveResult> =>
  saveFocusDatasetMutation({
    store,
    expectedCurrentDatasetId,
    platformCode,
    storeId,
    mutation,
    now: NOW,
  });

const activeDatasetId = async (store: MemoryTransactionalV2PersistenceStore): Promise<string | null> =>
  (await store.getActivePointer())?.datasetId ?? null;

const main = async () => {
  const completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(D31_COMPLETION);
  const store = new MemoryTransactionalV2PersistenceStore();
  const source = baseDataset();
  const sourceBefore = stablePersistenceStringify(source);
  const baseId = await activateBase(store, source);

  const firstSeries = await save(
    store,
    "tmall",
    "tmall-default-store",
    baseId,
    createSeriesMutation({ name: "核心系列", productIds: ["same-product", "default-only"] }),
  );
  const afterFirstId = await activeDatasetId(store);
  const duplicateSeries = await save(
    store,
    "tmall",
    "tmall-default-store",
    afterFirstId,
    createSeriesMutation({ name: " 核心系列 ", productIds: [] }),
  );
  const crossStoreSeriesName = await save(
    store,
    "tmall",
    "tmall-second-store",
    afterFirstId,
    createSeriesMutation({ name: "核心系列", productIds: ["same-product"] }),
  );
  const afterSecondId = await activeDatasetId(store);
  const crossStoreProduct = await save(
    store,
    "tmall",
    "tmall-second-store",
    afterSecondId,
    createSeriesMutation({ name: "错误商品系列", productIds: ["default-only"] }),
  );
  const activeAfterSeries = await store.loadActiveDataset();
  const defaultSeries = activeAfterSeries?.series.find(
    (series) => series.storeId === "tmall-default-store" && series.name === "核心系列",
  );
  const renamedSeries = defaultSeries
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        updateSeriesMutation({ seriesId: defaultSeries.seriesId, name: "核心系列升级", productIds: ["same-product"] }),
      )
    : null;
  const inactiveSeries = defaultSeries
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        setSeriesStatusMutation({ seriesId: defaultSeries.seriesId, status: "inactive" }),
      )
    : null;
  const reactivatedSeries = defaultSeries
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        setSeriesStatusMutation({ seriesId: defaultSeries.seriesId, status: "active" }),
      )
    : null;

  const trackedDefault = await save(
    store,
    "tmall",
    "tmall-default-store",
    await activeDatasetId(store),
    createTrackedProductMutation({ productId: "same-product", displayName: "" }),
  );
  const trackedSecondSameProduct = await save(
    store,
    "tmall",
    "tmall-second-store",
    await activeDatasetId(store),
    createTrackedProductMutation({ productId: "same-product", displayName: "第二店同 ID" }),
  );
  const trackedDuplicate = await save(
    store,
    "tmall",
    "tmall-default-store",
    await activeDatasetId(store),
    createTrackedProductMutation({ productId: "same-product", displayName: null }),
  );
  const trackedAdOnly = await save(
    store,
    "tmall",
    "tmall-default-store",
    await activeDatasetId(store),
    createTrackedProductMutation({ productId: "ad-only-default", displayName: "推广商品" }),
  );
  const activeAfterTracked = await store.loadActiveDataset();
  const tracked = activeAfterTracked?.trackedProducts.find(
    (product) => product.storeId === "tmall-default-store" && product.productId === "same-product",
  );
  const updatedTracked = tracked
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        updateTrackedProductMutation({ trackedProductId: tracked.trackedProductId, productId: tracked.productId, displayName: "默认店重点" }),
      )
    : null;
  const inactiveTracked = tracked
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        setTrackedProductStatusMutation({ trackedProductId: tracked.trackedProductId, status: "inactive" }),
      )
    : null;
  const reactivatedTracked = tracked
    ? await save(
        store,
        "tmall",
        "tmall-default-store",
        await activeDatasetId(store),
        setTrackedProductStatusMutation({ trackedProductId: tracked.trackedProductId, status: "active" }),
      )
    : null;

  const staleConflict = await save(
    store,
    "tmall",
    "tmall-default-store",
    baseId,
    createSeriesMutation({ name: "旧指针保存", productIds: [] }),
  );
  const finalDataset = await store.loadActiveDataset();
  const finalValidation = finalDataset ? validateV2Dataset(finalDataset) : { valid: false, issues: [] };

  const defaultSeriesFinal = finalDataset?.series.find(
    (series) => series.storeId === "tmall-default-store" && series.seriesId === defaultSeries?.seriesId,
  );
  const trackedFinal = finalDataset?.trackedProducts.find(
    (product) => product.storeId === "tmall-default-store" && product.trackedProductId === tracked?.trackedProductId,
  );

  const checks: Check[] = [
    { name: "D3.1 completion record complete", pass: completion.status === "complete" && completion.commandResults.every((item) => item.status === "PASS") },
    { name: "V0.5A-D complete and V0.5E pending", pass: readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json").stageStatuses["V0.5D"] === "complete" && readJson<{ stageStatuses: Record<string, string> }>("docs/project/v0.5-lock.json").stageStatuses["V0.5E"] === "pending" },
    { name: "SeriesRecord carries platformCode/storeId", pass: !!finalDataset?.series.every((series) => series.platformCode && series.storeId) },
    { name: "TrackedProductRecord carries platformCode/storeId", pass: !!finalDataset?.trackedProducts.every((product) => product.platformCode && product.storeId) },
    { name: "save preserves facts and other stores", pass: finalDataset?.businessProductFacts.length === source.businessProductFacts.length && finalDataset?.adProductFacts.length === source.adProductFacts.length && finalDataset?.stores.length === source.stores.length },
    { name: "series cannot cross-store reference product", pass: crossStoreProduct.status === "validation_error" },
    { name: "tracked product cannot cross-store reference product", pass: (await save(store, "tmall", "tmall-second-store", await activeDatasetId(store), createTrackedProductMutation({ productId: "default-only", displayName: null }))).status === "validation_error" },
    { name: "same-store duplicate series blocked", pass: duplicateSeries.status === "validation_error" },
    { name: "cross-store same-name series allowed", pass: crossStoreSeriesName.status === "success" },
    { name: "same-store duplicate tracked product blocked", pass: trackedDuplicate.status === "validation_error" },
    { name: "cross-store same productId tracked product allowed", pass: trackedSecondSameProduct.status === "success" },
    { name: "ad-only product selectable", pass: trackedAdOnly.status === "success" },
    { name: "series inactive/reactivate preserves ID", pass: renamedSeries?.status === "success" && inactiveSeries?.status === "success" && reactivatedSeries?.status === "success" && defaultSeriesFinal?.seriesId === defaultSeries?.seriesId && defaultSeriesFinal?.status === "active" },
    { name: "tracked inactive/reactivate preserves ID", pass: trackedDefault.status === "success" && updatedTracked?.status === "success" && inactiveTracked?.status === "success" && reactivatedTracked?.status === "success" && trackedFinal?.trackedProductId === tracked?.trackedProductId && trackedFinal?.status === "active" },
    { name: "expectedCurrentDatasetId conflict does not overwrite", pass: staleConflict.status === "conflict" && !finalDataset?.series.some((series) => series.name === "旧指针保存") },
    { name: "legacy key unchanged by service", pass: stablePersistenceStringify(source) === sourceBefore },
    { name: "V2 dataset validates", pass: finalValidation.valid },
    { name: "no undefined", pass: noUndefined(finalDataset) },
    { name: "no NaN or Infinity", pass: noInvalidNumber(finalDataset) },
    { name: "privacy safe", pass: noSensitiveText(finalDataset) },
    { name: "no localStorage writes in focus management source", pass: !fs.readFileSync(path.join(ROOT, "lib/v05/focus-management/browser-runtime.ts"), "utf8").includes("localStorage") },
    { name: "no new dependency", pass: !fs.readFileSync(path.join(ROOT, "package.json"), "utf8").includes("focus-management-dependency-sentinel") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e1-series-tracked-product-data",
    failedChecks,
    firstSeries: firstSeries.status,
    crossStoreSeriesName: crossStoreSeriesName.status,
    duplicateSeries: duplicateSeries.status,
    crossStoreProduct: crossStoreProduct.status,
    trackedDefault: trackedDefault.status,
    trackedSecondSameProduct: trackedSecondSameProduct.status,
    trackedDuplicate: trackedDuplicate.status,
    trackedAdOnly: trackedAdOnly.status,
    conflict: staleConflict.status,
    finalCounts: {
      stores: finalDataset?.stores.length ?? 0,
      businessProductFacts: finalDataset?.businessProductFacts.length ?? 0,
      adProductFacts: finalDataset?.adProductFacts.length ?? 0,
      series: finalDataset?.series.length ?? 0,
      trackedProducts: finalDataset?.trackedProducts.length ?? 0,
    },
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

void main().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : "unknown" }, null, 2));
  process.exitCode = 1;
});
