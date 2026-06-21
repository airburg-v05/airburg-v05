import type {
  ActiveDatasetPointer,
  MigrationManifest,
  V2Dataset,
} from "../domain/models";
import type { ValidationIssue } from "../domain/results";
import type {
  DryRunIssue,
  DryRunRecordCounts,
  LegacyMigrationDryRunResult,
  LegacyStorageSnapshot,
} from "../migration/contracts";

export type V2DatasetPersistenceStatus =
  | "staging"
  | "validated"
  | "active"
  | "inactive_valid"
  | "failed";

export type V2ActivationResultStatus =
  | "prepared"
  | "readback_validated"
  | "activated"
  | "already_active"
  | "rolled_back"
  | "conflict"
  | "blocked"
  | "failed";

export type V2PersistenceInspectionStatus =
  | "empty"
  | "active_valid"
  | "staged_incomplete"
  | "failed_staging"
  | "pointer_missing"
  | "pointer_corrupted"
  | "active_dataset_missing"
  | "active_dataset_invalid";

export type V2PersistenceFailurePoint =
  | "before_prepare"
  | "during_record_write"
  | "after_prepare_before_readback"
  | "during_readback"
  | "before_activation"
  | "during_pointer_write"
  | "after_pointer_write_before_commit";

export interface PersistedRecordEnvelope<T> {
  envelopeVersion: string;
  id: string;
  datasetId: string;
  recordKey: string;
  platformCode: string | null;
  storeId: string | null;
  businessDate: string | null;
  value: T;
}

export interface V2DatasetMetadata {
  datasetId: string;
  manifestId: string;
  businessDatasetFingerprint: string;
  manifestFingerprint: string;
  importBatchId: string | null;
  migrationVersion: string;
  status: V2DatasetPersistenceStatus;
  recordCounts: DryRunRecordCounts;
  preparedAt: string;
  validatedAt: string | null;
  activatedAt: string | null;
  failedAt: string | null;
  safeIssueCodes: string[];
}

export interface ActivationJournalRecord {
  journalId: string;
  action: "activated" | "rolled_back";
  datasetId: string;
  previousDatasetId: string | null;
  expectedPreviousDatasetId: string | null;
  migrationManifestId: string;
  createdAt: string;
}

export interface PreparedV2Dataset {
  dryRun: LegacyMigrationDryRunResult;
  dataset: V2Dataset;
  metadata: V2DatasetMetadata;
  manifest: MigrationManifest;
  recordKeys: string[];
}

export interface V2PersistenceResult<TData = null> {
  status: V2ActivationResultStatus;
  data: TData | null;
  issues: Array<ValidationIssue | DryRunIssue>;
}

export interface V2ReadBackValidationData {
  dataset: V2Dataset;
  metadata: V2DatasetMetadata;
  recordKeys: string[];
}

export interface V2ActivationData {
  datasetId: string;
  previousDatasetId: string | null;
  pointer: ActiveDatasetPointer;
  journal: ActivationJournalRecord;
}

export interface V2PersistenceInspection {
  status: V2PersistenceInspectionStatus;
  activeDatasetId: string | null;
  stagedDatasetCount: number;
  failedDatasetCount: number;
  issueCodes: string[];
}

export interface V2PersistenceStore {
  prepareDataset(prepared: PreparedV2Dataset, failurePoint?: V2PersistenceFailurePoint): Promise<V2PersistenceResult<V2DatasetMetadata>>;
  readDataset(datasetId: string, failurePoint?: V2PersistenceFailurePoint): Promise<V2PersistenceResult<V2ReadBackValidationData>>;
  markDatasetValidated(datasetId: string, validatedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>>;
  markDatasetFailed(datasetId: string, failedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>>;
  getDatasetMetadata(datasetId: string): Promise<V2DatasetMetadata | null>;
  getActivePointer(): Promise<ActiveDatasetPointer | null>;
  activateDataset(params: {
    datasetId: string;
    expectedCurrentDatasetId: string | null;
    activatedAt: string;
    failurePoint?: V2PersistenceFailurePoint;
  }): Promise<V2PersistenceResult<V2ActivationData>>;
  rollbackActiveDataset(params: {
    expectedCurrentDatasetId: string;
    targetDatasetId: string;
    rolledBackAt: string;
  }): Promise<V2PersistenceResult<V2ActivationData>>;
  inspectState(): Promise<V2PersistenceInspection>;
  clear(): Promise<void>;
}

export interface PrepareV2DatasetInput {
  snapshot: LegacyStorageSnapshot;
  store: V2PersistenceStore;
  preparedAt: string;
  migrationVersion?: string;
  failurePoint?: V2PersistenceFailurePoint;
}

export interface ReadBackAndValidateInput {
  store: V2PersistenceStore;
  datasetId: string;
  validatedAt: string;
  expectedRecordCounts: DryRunRecordCounts;
  expectedBusinessDatasetFingerprint: string;
  expectedManifestFingerprint: string;
  expectedRecordKeys: string[];
  failurePoint?: V2PersistenceFailurePoint;
}

export interface ActivatePreparedInput {
  store: V2PersistenceStore;
  datasetId: string;
  expectedCurrentDatasetId: string | null;
  activatedAt: string;
  failurePoint?: V2PersistenceFailurePoint;
}

export interface ActivateLegacySnapshotInput {
  snapshot: LegacyStorageSnapshot;
  store: V2PersistenceStore;
  preparedAt: string;
  readBackAt: string;
  activatedAt: string;
  expectedCurrentDatasetId: string | null;
  migrationVersion?: string;
}
