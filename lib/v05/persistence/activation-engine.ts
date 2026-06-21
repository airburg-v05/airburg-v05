import {
  V2_SCHEMA_VERSION,
  type MigrationManifest,
  type V2Dataset,
} from "../domain/models";
import { createIssue, type ValidationIssue } from "../domain/results";
import { validateV2Dataset } from "../validation/dataset";
import {
  countStagingDatasetRecords,
  type DryRunIssue,
  type LegacyMigrationDryRunResult,
} from "../migration/contracts";
import { runLegacyStorageV2DryRunMigration } from "../migration/dry-run";
import {
  collectDatasetRecordKeys,
  validateDatasetBeforePersistence,
} from "./envelopes";
import type {
  ActivateLegacySnapshotInput,
  ActivatePreparedInput,
  PreparedV2Dataset,
  PrepareV2DatasetInput,
  ReadBackAndValidateInput,
  V2ActivationData,
  V2DatasetMetadata,
  V2PersistenceResult,
  V2ReadBackValidationData,
} from "./contracts";

const blockingDryRunIssueCodes = (issues: readonly DryRunIssue[]): string[] =>
  Array.from(new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.code))).sort();

const validationIssue = (path: string, message: string): ValidationIssue =>
  createIssue("migration_state_invalid", path, message);

const failed = <T>(issues: Array<ValidationIssue | DryRunIssue>): V2PersistenceResult<T> => ({
  status: "failed",
  data: null,
  issues,
});

const blocked = <T>(issues: Array<ValidationIssue | DryRunIssue>): V2PersistenceResult<T> => ({
  status: "blocked",
  data: null,
  issues,
});

const isReadyDryRun = (dryRun: LegacyMigrationDryRunResult): boolean =>
  dryRun.status === "ready" &&
  dryRun.futureActivationEligible === true &&
  dryRun.stagingDataset !== null &&
  blockingDryRunIssueCodes(dryRun.issues).length === 0;

export const createPreparedDatasetFromDryRun = (
  dryRun: LegacyMigrationDryRunResult,
  preparedAt: string,
): V2PersistenceResult<PreparedV2Dataset> => {
  if (!isReadyDryRun(dryRun) || !dryRun.stagingDataset || !dryRun.businessDatasetFingerprint || !dryRun.manifestFingerprint) {
    return blocked([
      validationIssue(
        "dryRun",
        "Only a ready, activation-eligible dry-run result without blocking issues can be prepared.",
      ),
      ...dryRun.issues,
    ]);
  }

  const manifest = dryRun.stagingDataset.migrationManifests[0];
  if (!manifest) {
    return failed([validationIssue("stagingDataset.migrationManifests", "Prepared dataset requires a migration manifest.")]);
  }

  const dataset: V2Dataset = {
    ...dryRun.stagingDataset,
    activeDatasetPointer: null,
  };
  const issues = validateDatasetBeforePersistence(dataset);
  if (issues.some((issue) => issue.severity === "error")) return failed(issues);

  const recordCounts = countStagingDatasetRecords(dryRun.stagingDataset);
  const metadata: V2DatasetMetadata = {
    datasetId: dataset.datasetId,
    manifestId: manifest.migrationManifestId,
    businessDatasetFingerprint: dryRun.businessDatasetFingerprint,
    manifestFingerprint: dryRun.manifestFingerprint,
    importBatchId: manifest.importBatchId,
    migrationVersion: dryRun.migrationVersion,
    status: "staging",
    recordCounts,
    preparedAt,
    validatedAt: null,
    activatedAt: null,
    failedAt: null,
    safeIssueCodes: manifest.safeIssueCodes,
  };

  return {
    status: "prepared",
    data: {
      dryRun,
      dataset,
      metadata,
      manifest: manifest as MigrationManifest,
      recordKeys: collectDatasetRecordKeys(dataset),
    },
    issues: [],
  };
};

export const prepareV2Dataset = async ({
  snapshot,
  store,
  preparedAt,
  migrationVersion,
  failurePoint,
}: PrepareV2DatasetInput): Promise<V2PersistenceResult<PreparedV2Dataset>> => {
  const dryRun = await runLegacyStorageV2DryRunMigration({ snapshot, migrationVersion });
  const prepared = createPreparedDatasetFromDryRun(dryRun, preparedAt);
  if (!prepared.data) return prepared;

  const write = await store.prepareDataset(prepared.data, failurePoint);
  if (write.status !== "prepared") return failed(write.issues);
  return prepared;
};

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const countMatches = (
  left: ReadBackAndValidateInput["expectedRecordCounts"],
  right: ReadBackAndValidateInput["expectedRecordCounts"],
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const readBackAndValidateV2Dataset = async ({
  store,
  datasetId,
  validatedAt,
  expectedRecordCounts,
  expectedBusinessDatasetFingerprint,
  expectedManifestFingerprint,
  expectedRecordKeys,
  failurePoint,
}: ReadBackAndValidateInput): Promise<V2PersistenceResult<V2ReadBackValidationData>> => {
  const readBack = await store.readDataset(datasetId, failurePoint);
  if (readBack.status !== "readback_validated" || !readBack.data) {
    await store.markDatasetFailed(datasetId, validatedAt);
    return failed(readBack.issues);
  }

  const { dataset, metadata, recordKeys } = readBack.data;
  const issues: ValidationIssue[] = [];
  issues.push(...validateV2Dataset(dataset).issues);
  if (dataset.schemaVersion !== V2_SCHEMA_VERSION) {
    issues.push(validationIssue("dataset.schemaVersion", "Schema version mismatch."));
  }
  if (dataset.datasetId !== datasetId) {
    issues.push(validationIssue("dataset.datasetId", "Dataset ID mismatch."));
  }
  if (metadata.businessDatasetFingerprint !== expectedBusinessDatasetFingerprint) {
    issues.push(validationIssue("datasetMetadata.businessDatasetFingerprint", "Business dataset fingerprint mismatch."));
  }
  if (metadata.manifestFingerprint !== expectedManifestFingerprint) {
    issues.push(validationIssue("datasetMetadata.manifestFingerprint", "Manifest fingerprint mismatch."));
  }
  if (!countMatches(metadata.recordCounts, expectedRecordCounts)) {
    issues.push(validationIssue("datasetMetadata.recordCounts", "Record counts mismatch."));
  }
  if (!arraysEqual(recordKeys, expectedRecordKeys)) {
    issues.push(validationIssue("recordKeys", "Record key set mismatch."));
  }

  if (issues.some((issue) => issue.severity === "error")) {
    await store.markDatasetFailed(datasetId, validatedAt);
    return failed(issues);
  }

  const marked = await store.markDatasetValidated(datasetId, validatedAt);
  if (marked.status !== "readback_validated") return failed(marked.issues);
  return {
    status: "readback_validated",
    data: {
      dataset,
      metadata: marked.data ?? metadata,
      recordKeys,
    },
    issues: [],
  };
};

export const activatePreparedV2Dataset = async ({
  store,
  datasetId,
  expectedCurrentDatasetId,
  activatedAt,
  failurePoint,
}: ActivatePreparedInput): Promise<V2PersistenceResult<V2ActivationData>> =>
  store.activateDataset({
    datasetId,
    expectedCurrentDatasetId,
    activatedAt,
    failurePoint,
  });

export const activateLegacySnapshotToV2 = async ({
  snapshot,
  store,
  preparedAt,
  readBackAt,
  activatedAt,
  expectedCurrentDatasetId,
  migrationVersion,
}: ActivateLegacySnapshotInput): Promise<V2PersistenceResult<V2ActivationData>> => {
  const dryRun = await runLegacyStorageV2DryRunMigration({ snapshot, migrationVersion });
  if (!isReadyDryRun(dryRun) || !dryRun.stagingDataset || !dryRun.businessDatasetFingerprint || !dryRun.manifestFingerprint) {
    return blocked([validationIssue("dryRun", "Dry-run result is not activation-ready."), ...dryRun.issues]);
  }

  const activePointer = await store.getActivePointer();
  if (activePointer?.datasetId === dryRun.stagingDataset.datasetId) {
    return {
      status: "already_active",
      data: {
        datasetId: dryRun.stagingDataset.datasetId,
        previousDatasetId: activePointer.datasetId,
        pointer: activePointer,
        journal: {
          journalId: `already_active:${dryRun.stagingDataset.datasetId}`,
          action: "activated",
          datasetId: dryRun.stagingDataset.datasetId,
          previousDatasetId: activePointer.datasetId,
          expectedPreviousDatasetId: expectedCurrentDatasetId,
          migrationManifestId: dryRun.stagingDataset.migrationManifests[0]?.migrationManifestId ?? "",
          createdAt: activatedAt,
        },
      },
      issues: [],
    };
  }

  const prepared = createPreparedDatasetFromDryRun(dryRun, preparedAt);
  if (!prepared.data) {
    return {
      status: prepared.status,
      data: null,
      issues: prepared.issues,
    };
  }
  const write = await store.prepareDataset(prepared.data);
  if (write.status !== "prepared") return failed(write.issues);
  const readBack = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.data.dataset.datasetId,
    validatedAt: readBackAt,
    expectedRecordCounts: prepared.data.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.data.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.data.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.data.recordKeys,
  });
  if (readBack.status !== "readback_validated") return failed(readBack.issues);
  return activatePreparedV2Dataset({
    store,
    datasetId: prepared.data.dataset.datasetId,
    expectedCurrentDatasetId,
    activatedAt,
  });
};
