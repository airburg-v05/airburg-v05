import { collectDatasetRecordKeys, stablePersistenceStringify } from "../persistence/envelopes";
import {
  activatePreparedV2Dataset,
  readBackAndValidateV2Dataset,
} from "../persistence/activation-engine";
import type {
  PreparedV2Dataset,
  V2DatasetMetadata,
  V2PersistenceStore,
} from "../persistence/contracts";
import { sha256String } from "../import/hash";
import {
  countStagingDatasetRecords,
  DEFAULT_TMAIL_OWNER,
  type LegacyMigrationDryRunResult,
  type V2StagingDataset,
} from "../migration/contracts";
import { type MigrationManifest, type V2Dataset } from "../domain/models";
import { validateV2Dataset } from "../validation/dataset";
import type { TargetDatasetMutation, TargetSaveResult } from "./contracts";
import { targetError } from "./mutations";

export const cloneTargetValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const success = (message: string, datasetId: string | null): TargetSaveResult => ({
  status: "success",
  message,
  datasetId,
  issueCodes: [],
});

const datasetFingerprintPayload = (dataset: V2StagingDataset): unknown => ({
  schemaVersion: dataset.schemaVersion,
  platforms: dataset.platforms,
  stores: dataset.stores,
  importBatches: dataset.importBatches,
  importFiles: dataset.importFiles,
  businessProductFacts: dataset.businessProductFacts,
  adProductFacts: dataset.adProductFacts,
  adPlanFacts: dataset.adPlanFacts,
  afterSalesDailyAggregates: dataset.afterSalesDailyAggregates,
  afterSalesRangeAggregates: dataset.afterSalesRangeAggregates,
  afterSalesOperationalSnapshots: dataset.afterSalesOperationalSnapshots,
  afterSalesDistributionItems: dataset.afterSalesDistributionItems,
  series: dataset.series,
  trackedProducts: dataset.trackedProducts,
  targets: dataset.targets,
  legacyTargetCandidates: dataset.legacyTargetCandidates,
  migrationManifests: dataset.migrationManifests,
});

const asStagingDataset = (dataset: V2Dataset): V2StagingDataset => ({
  ...cloneTargetValue(dataset),
  activeDatasetPointer: null,
});

const withDeterministicDatasetId = async (dataset: V2StagingDataset): Promise<V2StagingDataset> => {
  const hash = await sha256String(stablePersistenceStringify(datasetFingerprintPayload({
    ...dataset,
    datasetId: "pending",
  })));
  return {
    ...dataset,
    datasetId: `v05f1_targets_dataset_${hash.slice(0, 32)}`,
  };
};

const safeIssueCodesFrom = (metadata: V2DatasetMetadata | null, manifest: MigrationManifest): string[] =>
  Array.from(new Set([...(metadata?.safeIssueCodes ?? []), ...manifest.safeIssueCodes])).sort();

const makeDryRun = ({
  dataset,
  recordCounts,
  businessDatasetFingerprint,
  manifestFingerprint,
  migrationVersion,
}: {
  dataset: V2StagingDataset;
  recordCounts: ReturnType<typeof countStagingDatasetRecords>;
  businessDatasetFingerprint: string;
  manifestFingerprint: string;
  migrationVersion: string;
}): LegacyMigrationDryRunResult => ({
  status: "ready",
  futureActivationEligible: true,
  migrationVersion,
  defaultOwner: DEFAULT_TMAIL_OWNER,
  businessDatasetFingerprint,
  manifestFingerprint,
  stagingDataset: dataset,
  manifestCandidate: null,
  proposedActiveDatasetPointer: null,
  legacyKeySummary: [],
  sourceSummary: [],
  recordCounts,
  rejectedRecords: [],
  ignoredLegacyKeys: [],
  issues: [],
});

export const buildPreparedTargetDataset = async ({
  dataset,
  currentMetadata,
  preparedAt,
}: {
  dataset: V2Dataset;
  currentMetadata: V2DatasetMetadata | null;
  preparedAt: string;
}): Promise<PreparedV2Dataset | TargetSaveResult> => {
  const manifest = dataset.migrationManifests[0];
  if (!manifest) {
    return targetError("validation_error", "当前数据缺少可追踪的导入记录，暂不能保存目标。", [
      "migration_manifest_missing",
    ]);
  }

  const validation = validateV2Dataset(dataset);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    return targetError(
      "validation_error",
      "保存前数据校验失败，请检查目标归属、父目标和引用对象。",
      errors.map((issue) => issue.code),
    );
  }

  const staging = await withDeterministicDatasetId(asStagingDataset(dataset));
  const recordCounts = countStagingDatasetRecords(staging);
  const businessDatasetFingerprint = await sha256String(
    stablePersistenceStringify(datasetFingerprintPayload(staging)),
  );
  const manifestFingerprint = await sha256String(
    stablePersistenceStringify({
      pipelineVersion: "v05f1_target_management",
      datasetId: staging.datasetId,
      manifestId: manifest.migrationManifestId,
      recordCounts,
      targets: staging.targets,
    }),
  );
  const metadata: V2DatasetMetadata = {
    datasetId: staging.datasetId,
    manifestId: currentMetadata?.manifestId ?? manifest.migrationManifestId,
    businessDatasetFingerprint,
    manifestFingerprint,
    importBatchId: currentMetadata?.importBatchId ?? manifest.importBatchId,
    migrationVersion: currentMetadata?.migrationVersion ?? manifest.migrationVersion,
    status: "staging",
    recordCounts,
    preparedAt,
    validatedAt: null,
    activatedAt: null,
    failedAt: null,
    safeIssueCodes: safeIssueCodesFrom(currentMetadata, manifest),
  };

  return {
    dryRun: makeDryRun({
      dataset: staging,
      recordCounts,
      businessDatasetFingerprint,
      manifestFingerprint,
      migrationVersion: metadata.migrationVersion,
    }),
    dataset: staging,
    metadata,
    manifest,
    recordKeys: collectDatasetRecordKeys(staging),
  };
};

export const saveTargetDatasetMutation = async ({
  store,
  expectedCurrentDatasetId,
  mutation,
  now,
}: {
  store: V2PersistenceStore;
  expectedCurrentDatasetId: string | null;
  mutation: TargetDatasetMutation;
  now: string;
}): Promise<TargetSaveResult> => {
  const pointer = await store.getActivePointer();
  const currentDatasetId = pointer?.datasetId ?? null;
  if (!currentDatasetId) return targetError("empty", "当前没有 active 多店铺数据，请先完成数据导入。");
  if (currentDatasetId !== expectedCurrentDatasetId) {
    return targetError("conflict", "当前数据已被其他操作更新，请刷新后重试。", ["active_dataset_conflict"]);
  }

  const activeDataset = await store.loadDataset(currentDatasetId);
  if (!activeDataset) return targetError("empty", "当前 active 数据不可读取，请先检查数据质量。");
  const currentMetadata = await store.getDatasetMetadata(currentDatasetId);
  const workingDataset = cloneTargetValue(activeDataset);
  const result = mutation({ dataset: workingDataset, now });
  if ("status" in result) return result;
  if (stablePersistenceStringify(activeDataset) === stablePersistenceStringify(result)) {
    return success("没有需要保存的变化。", currentDatasetId);
  }

  const prepared = await buildPreparedTargetDataset({
    dataset: result,
    currentMetadata,
    preparedAt: now,
  });
  if ("status" in prepared) return prepared;

  const write = await store.prepareDataset(prepared);
  if (write.status !== "prepared") {
    return targetError("error", "写入本地 staging 失败，未激活新数据。", write.issues.map((issue) => issue.code));
  }
  const readBack = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    validatedAt: now,
    expectedRecordCounts: prepared.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.recordKeys,
  });
  if (readBack.status !== "readback_validated") {
    return targetError("error", "本地 readback 校验失败，未激活新数据。", readBack.issues.map((issue) => issue.code));
  }
  const activation = await activatePreparedV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    expectedCurrentDatasetId,
    activatedAt: now,
  });
  if (activation.status === "conflict") {
    return targetError("conflict", "当前数据已被其他操作更新，请刷新后重试。", activation.issues.map((issue) => issue.code));
  }
  if (activation.status !== "activated" && activation.status !== "already_active") {
    return targetError("error", "激活新数据失败，当前 active 数据未改变。", activation.issues.map((issue) => issue.code));
  }

  return success("保存成功。", activation.data?.datasetId ?? prepared.dataset.datasetId);
};
