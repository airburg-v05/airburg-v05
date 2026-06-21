import {
  V2_SCHEMA_VERSION,
  type V2Dataset,
} from "../domain/models";
import {
  createDryRunIssue,
  emptyRecordCounts,
  type DryRunRecordCounts,
  type LegacyMigrationDryRunResult,
  type V2StagingDataset,
} from "../migration/contracts";
import { recordKeyForStore, stablePersistenceStringify } from "../persistence/envelopes";
import { sha256String } from "./hash";
import { type V05DatasetMergeResult, type V05ImportCandidate } from "./contracts";
import { finalizeV05ImportDryRun } from "./tmall-import-mapper";

const emptyDataset = (datasetId = "empty"): V2StagingDataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId,
  platforms: [],
  stores: [],
  importBatches: [],
  importFiles: [],
  businessProductFacts: [],
  adProductFacts: [],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [],
  trackedProducts: [],
  targets: [],
  legacyTargetCandidates: [],
  migrationManifests: [],
  activeDatasetPointer: null,
});

const datasetRecordCounts = (dataset: V2Dataset | null): DryRunRecordCounts => {
  if (!dataset) return emptyRecordCounts();
  return {
    platforms: dataset.platforms.length,
    stores: dataset.stores.length,
    importBatches: dataset.importBatches.length,
    importFiles: dataset.importFiles.length,
    businessProductFacts: dataset.businessProductFacts.length,
    adProductFacts: dataset.adProductFacts.length,
    adPlanFacts: dataset.adPlanFacts.length,
    afterSalesDailyAggregates: dataset.afterSalesDailyAggregates.length,
    afterSalesRangeAggregates: dataset.afterSalesRangeAggregates.length,
    afterSalesOperationalSnapshots: dataset.afterSalesOperationalSnapshots.length,
    afterSalesDistributionItems: dataset.afterSalesDistributionItems.length,
    series: dataset.series.length,
    trackedProducts: dataset.trackedProducts.length,
    targets: dataset.targets.length,
    legacyTargetCandidates: dataset.legacyTargetCandidates.length,
    migrationManifests: dataset.migrationManifests.length,
  };
};

const sameRecord = (left: unknown, right: unknown): boolean =>
  stablePersistenceStringify(left) === stablePersistenceStringify(right);

const mergeRecords = <TRecord>(
  current: TRecord[],
  incoming: TRecord[],
  keyOf: (record: TRecord) => string,
  same: (left: TRecord, right: TRecord) => boolean = sameRecord,
): { records: TRecord[]; conflict: boolean } => {
  const records = [...current];
  const indexByKey = new Map(current.map((record, index) => [keyOf(record), index]));

  for (const record of incoming) {
    const key = keyOf(record);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, records.length);
      records.push(record);
      continue;
    }
    if (!same(records[existingIndex]!, record)) {
      return { records: current, conflict: true };
    }
  }

  return { records, conflict: false };
};

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

const withDeterministicDatasetId = async (dataset: V2StagingDataset): Promise<V2StagingDataset> => {
  const hash = await sha256String(stablePersistenceStringify(datasetFingerprintPayload({
    ...dataset,
    datasetId: "pending",
  })));
  return {
    ...dataset,
    datasetId: `v05b1_dataset_${hash.slice(0, 32)}`,
  };
};

const mergeStagingDataset = async (
  activeDataset: V2Dataset | null,
  candidate: V05ImportCandidate,
): Promise<V05DatasetMergeResult> => {
  const active = activeDataset ? { ...activeDataset, activeDatasetPointer: null } : emptyDataset();
  const sameBatch = active.importBatches.some(
    (batch) =>
      batch.platformCode === candidate.platformCode &&
      batch.storeId === candidate.store.storeId &&
      batch.importBatchId === candidate.importBatchId,
  );
  if (sameBatch) {
    return {
      status: "already_imported",
      dataset: active,
      issueCodes: [],
      recordCounts: datasetRecordCounts(active),
    };
  }

  const source = candidate.dataset;
  const platforms = mergeRecords(
    active.platforms,
    source.platforms,
    (record) => record.platformCode,
    (left, right) => left.platformName === right.platformName && left.status === right.status,
  );
  const stores = mergeRecords(
    active.stores,
    source.stores,
    (record) => recordKeyForStore("stores", record),
    (left, right) => left.storeName === right.storeName && left.status === right.status,
  );
  const importBatches = mergeRecords(active.importBatches, source.importBatches, (record) => recordKeyForStore("importBatches", record));
  const importFiles = mergeRecords(active.importFiles, source.importFiles, (record) => recordKeyForStore("importFiles", record));
  const businessProductFacts = mergeRecords(active.businessProductFacts, source.businessProductFacts, (record) => recordKeyForStore("businessProductFacts", record));
  const adProductFacts = mergeRecords(active.adProductFacts, source.adProductFacts, (record) => recordKeyForStore("adProductFacts", record));
  const adPlanFacts = mergeRecords(active.adPlanFacts, source.adPlanFacts, (record) => recordKeyForStore("adPlanFacts", record));
  const afterSalesDailyAggregates = mergeRecords(active.afterSalesDailyAggregates, source.afterSalesDailyAggregates, (record) => recordKeyForStore("afterSalesDailyAggregates", record));
  const afterSalesRangeAggregates = mergeRecords(active.afterSalesRangeAggregates, source.afterSalesRangeAggregates, (record) => recordKeyForStore("afterSalesRangeAggregates", record));
  const afterSalesOperationalSnapshots = mergeRecords(active.afterSalesOperationalSnapshots, source.afterSalesOperationalSnapshots, (record) => recordKeyForStore("afterSalesOperationalSnapshots", record));
  const afterSalesDistributionItems = mergeRecords(active.afterSalesDistributionItems, source.afterSalesDistributionItems, (record) => recordKeyForStore("afterSalesDistributionItems", record));
  const migrationManifests = mergeRecords(
    source.migrationManifests,
    active.migrationManifests,
    (record) => recordKeyForStore("migrationManifests", record),
  );

  const hasConflict = [
    platforms,
    stores,
    importBatches,
    importFiles,
    businessProductFacts,
    adProductFacts,
    adPlanFacts,
    afterSalesDailyAggregates,
    afterSalesRangeAggregates,
    afterSalesOperationalSnapshots,
    afterSalesDistributionItems,
    migrationManifests,
  ].some((result) => result.conflict);

  if (hasConflict) {
    return {
      status: "conflict",
      dataset: null,
      issueCodes: ["record_key_conflict"],
      recordCounts: datasetRecordCounts(active),
    };
  }

  const merged = await withDeterministicDatasetId({
    schemaVersion: V2_SCHEMA_VERSION,
    datasetId: "pending",
    platforms: platforms.records,
    stores: stores.records,
    importBatches: importBatches.records,
    importFiles: importFiles.records,
    businessProductFacts: businessProductFacts.records,
    adProductFacts: adProductFacts.records,
    adPlanFacts: adPlanFacts.records,
    afterSalesDailyAggregates: afterSalesDailyAggregates.records,
    afterSalesRangeAggregates: afterSalesRangeAggregates.records,
    afterSalesOperationalSnapshots: afterSalesOperationalSnapshots.records,
    afterSalesDistributionItems: afterSalesDistributionItems.records,
    series: active.series,
    trackedProducts: active.trackedProducts,
    targets: active.targets,
    legacyTargetCandidates: active.legacyTargetCandidates,
    migrationManifests: migrationManifests.records,
    activeDatasetPointer: null,
  });

  return {
    status: "merged",
    dataset: merged,
    issueCodes: [],
    recordCounts: datasetRecordCounts(merged),
  };
};

export const mergeV05ImportCandidateIntoActiveDataset = async (
  activeDataset: V2Dataset | null,
  candidate: V05ImportCandidate,
): Promise<{
  merge: V05DatasetMergeResult;
  dryRun: LegacyMigrationDryRunResult | null;
}> => {
  const merge = await mergeStagingDataset(activeDataset, candidate);
  if (merge.status !== "merged" || !merge.dataset) {
    return { merge, dryRun: null };
  }

  const issue = merge.issueCodes.map((code) =>
    createDryRunIssue(
      "migration_state_invalid",
      "dataset.merge",
      "V0.5B import merge failed.",
      "error",
      { mergeIssueCode: code },
    ),
  );
  const dryRun = await finalizeV05ImportDryRun({
    dataset: merge.dataset,
    sourceSummary: candidate.dryRun.sourceSummary,
    issues: [...candidate.dryRun.issues, ...issue],
  });
  return { merge, dryRun };
};

export const countV05DatasetRecords = datasetRecordCounts;
