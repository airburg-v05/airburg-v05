import {
  V2_SCHEMA_VERSION,
  type ActiveDatasetPointer,
  type V2Dataset,
} from "../../domain/models";
import { createIssue } from "../../domain/results";
import type {
  ActivationJournalRecord,
  PreparedV2Dataset,
  V2ActivationData,
  V2DatasetMetadata,
  V2PersistenceFailurePoint,
  V2PersistenceInspection,
  V2PersistenceResult,
  V2PersistenceStore,
  V2ReadBackValidationData,
} from "../contracts";
import { clonePersistenceValue, collectDatasetRecordKeys, stablePersistenceStringify } from "../envelopes";

interface MemoryState {
  datasets: Map<string, V2Dataset>;
  metadata: Map<string, V2DatasetMetadata>;
  pointer: ActiveDatasetPointer | null;
  journals: Map<string, ActivationJournalRecord>;
}

const cloneMap = <T>(input: Map<string, T>): Map<string, T> =>
  new Map([...input.entries()].map(([key, value]) => [key, clonePersistenceValue(value)]));

const cloneState = (state: MemoryState): MemoryState => ({
  datasets: cloneMap(state.datasets),
  metadata: cloneMap(state.metadata),
  pointer: state.pointer ? clonePersistenceValue(state.pointer) : null,
  journals: cloneMap(state.journals),
});

const issue = (path: string, message: string) =>
  createIssue("migration_state_invalid", path, message);

const failed = <T>(path: string, message: string): V2PersistenceResult<T> => ({
  status: "failed",
  data: null,
  issues: [issue(path, message)],
});

const conflict = <T>(path: string, message: string): V2PersistenceResult<T> => ({
  status: "conflict",
  data: null,
  issues: [issue(path, message)],
});

export class MemoryTransactionalV2PersistenceStore implements V2PersistenceStore {
  private state: MemoryState = {
    datasets: new Map(),
    metadata: new Map(),
    pointer: null,
    journals: new Map(),
  };

  async prepareDataset(
    prepared: PreparedV2Dataset,
    failurePoint?: V2PersistenceFailurePoint,
  ): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    if (failurePoint === "before_prepare") return failed("prepare", "Injected failure before prepare.");
    const existing = this.state.metadata.get(prepared.dataset.datasetId);
    if (existing) {
      if (
        existing.businessDatasetFingerprint !== prepared.metadata.businessDatasetFingerprint ||
        existing.manifestFingerprint !== prepared.metadata.manifestFingerprint
      ) {
        return conflict("datasetMetadata", "Existing dataset metadata fingerprint differs.");
      }
      return { status: "prepared", data: clonePersistenceValue(existing), issues: [] };
    }

    const next = cloneState(this.state);
    next.datasets.set(prepared.dataset.datasetId, clonePersistenceValue(prepared.dataset));
    next.metadata.set(prepared.metadata.datasetId, clonePersistenceValue(prepared.metadata));
    if (failurePoint === "during_record_write") return failed("records", "Injected failure during record write.");
    this.state = next;
    if (failurePoint === "after_prepare_before_readback") {
      return failed("prepare", "Injected failure after prepare before readback.");
    }
    return { status: "prepared", data: clonePersistenceValue(prepared.metadata), issues: [] };
  }

  async readDataset(
    datasetId: string,
    failurePoint?: V2PersistenceFailurePoint,
  ): Promise<V2PersistenceResult<V2ReadBackValidationData>> {
    if (failurePoint === "during_readback") return failed("readback", "Injected failure during readback.");
    const dataset = this.state.datasets.get(datasetId);
    const metadata = this.state.metadata.get(datasetId);
    if (!dataset || !metadata) return failed("dataset", "Dataset is missing.");
    return {
      status: "readback_validated",
      data: {
        dataset: clonePersistenceValue(dataset),
        metadata: clonePersistenceValue(metadata),
        recordKeys: collectDatasetRecordKeys(dataset),
      },
      issues: [],
    };
  }

  async markDatasetValidated(datasetId: string, validatedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    const metadata = this.state.metadata.get(datasetId);
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    const next = { ...metadata, status: "validated" as const, validatedAt };
    this.state.metadata.set(datasetId, clonePersistenceValue(next));
    return { status: "readback_validated", data: clonePersistenceValue(next), issues: [] };
  }

  async markDatasetFailed(datasetId: string, failedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    const metadata = this.state.metadata.get(datasetId);
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    const next = { ...metadata, status: "failed" as const, failedAt };
    this.state.metadata.set(datasetId, clonePersistenceValue(next));
    return { status: "failed", data: clonePersistenceValue(next), issues: [] };
  }

  async getDatasetMetadata(datasetId: string): Promise<V2DatasetMetadata | null> {
    const metadata = this.state.metadata.get(datasetId);
    return metadata ? clonePersistenceValue(metadata) : null;
  }

  async getActivePointer(): Promise<ActiveDatasetPointer | null> {
    return this.state.pointer ? clonePersistenceValue(this.state.pointer) : null;
  }

  async activateDataset({
    datasetId,
    expectedCurrentDatasetId,
    activatedAt,
    failurePoint,
  }: {
    datasetId: string;
    expectedCurrentDatasetId: string | null;
    activatedAt: string;
    failurePoint?: V2PersistenceFailurePoint;
  }): Promise<V2PersistenceResult<V2ActivationData>> {
    if (failurePoint === "before_activation") return failed("activation", "Injected failure before activation.");
    const metadata = this.state.metadata.get(datasetId);
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    if (metadata.status === "active" && this.state.pointer?.datasetId === datasetId) {
      return {
        status: "already_active",
        data: {
          datasetId,
          previousDatasetId: datasetId,
          pointer: clonePersistenceValue(this.state.pointer),
          journal: {
            journalId: `already_active:${datasetId}`,
            action: "activated",
            datasetId,
            previousDatasetId: datasetId,
            expectedPreviousDatasetId: expectedCurrentDatasetId,
            migrationManifestId: metadata.manifestId,
            createdAt: activatedAt,
          },
        },
        issues: [],
      };
    }
    if (metadata.status !== "validated") {
      return failed("datasetMetadata.status", "Only a readback-validated dataset can be activated.");
    }
    const currentDatasetId = this.state.pointer?.datasetId ?? null;
    if (currentDatasetId !== expectedCurrentDatasetId) {
      return conflict("activeDatasetPointer", "Current active dataset does not match expected value.");
    }

    const next = cloneState(this.state);
    if (currentDatasetId) {
      const current = next.metadata.get(currentDatasetId);
      if (current) next.metadata.set(currentDatasetId, { ...current, status: "inactive_valid" });
    }
    next.metadata.set(datasetId, { ...metadata, status: "active", activatedAt });
    const pointer: ActiveDatasetPointer = {
      schemaVersion: V2_SCHEMA_VERSION,
      pointerId: "default",
      state: "v2_active",
      datasetId,
      migrationManifestId: metadata.manifestId,
      activatedAt,
    };
    const journal: ActivationJournalRecord = {
      journalId: `activated:${datasetId}:${activatedAt}`,
      action: "activated",
      datasetId,
      previousDatasetId: currentDatasetId,
      expectedPreviousDatasetId: expectedCurrentDatasetId,
      migrationManifestId: metadata.manifestId,
      createdAt: activatedAt,
    };
    next.pointer = pointer;
    next.journals.set(journal.journalId, journal);
    if (failurePoint === "during_pointer_write" || failurePoint === "after_pointer_write_before_commit") {
      return failed("activeDatasetPointer", "Injected activation pointer failure.");
    }
    this.state = next;
    return {
      status: "activated",
      data: { datasetId, previousDatasetId: currentDatasetId, pointer, journal },
      issues: [],
    };
  }

  async rollbackActiveDataset({
    expectedCurrentDatasetId,
    targetDatasetId,
    rolledBackAt,
  }: {
    expectedCurrentDatasetId: string;
    targetDatasetId: string;
    rolledBackAt: string;
  }): Promise<V2PersistenceResult<V2ActivationData>> {
    const currentDatasetId = this.state.pointer?.datasetId ?? null;
    if (currentDatasetId !== expectedCurrentDatasetId) {
      return conflict("activeDatasetPointer", "Current active dataset does not match expected rollback value.");
    }
    const target = this.state.metadata.get(targetDatasetId);
    if (!target || (target.status !== "active" && target.status !== "inactive_valid")) {
      return failed("datasetMetadata.status", "Rollback target must be active or inactive_valid.");
    }
    const next = cloneState(this.state);
    const current = next.metadata.get(expectedCurrentDatasetId);
    if (current) next.metadata.set(expectedCurrentDatasetId, { ...current, status: "inactive_valid" });
    next.metadata.set(targetDatasetId, { ...target, status: "active", activatedAt: rolledBackAt });
    const pointer: ActiveDatasetPointer = {
      schemaVersion: V2_SCHEMA_VERSION,
      pointerId: "default",
      state: "v2_active",
      datasetId: targetDatasetId,
      migrationManifestId: target.manifestId,
      activatedAt: rolledBackAt,
    };
    const journal: ActivationJournalRecord = {
      journalId: `rolled_back:${targetDatasetId}:${rolledBackAt}`,
      action: "rolled_back",
      datasetId: targetDatasetId,
      previousDatasetId: expectedCurrentDatasetId,
      expectedPreviousDatasetId: expectedCurrentDatasetId,
      migrationManifestId: target.manifestId,
      createdAt: rolledBackAt,
    };
    next.pointer = pointer;
    next.journals.set(journal.journalId, journal);
    this.state = next;
    return {
      status: "rolled_back",
      data: { datasetId: targetDatasetId, previousDatasetId: expectedCurrentDatasetId, pointer, journal },
      issues: [],
    };
  }

  async inspectState(): Promise<V2PersistenceInspection> {
    if (!this.state.pointer && this.state.metadata.size === 0) {
      return { status: "empty", activeDatasetId: null, stagedDatasetCount: 0, failedDatasetCount: 0, issueCodes: [] };
    }
    const stagedDatasetCount = [...this.state.metadata.values()].filter((item) => item.status === "staging").length;
    const failedDatasetCount = [...this.state.metadata.values()].filter((item) => item.status === "failed").length;
    if (!this.state.pointer) {
      return {
        status: stagedDatasetCount > 0 ? "pointer_missing" : "empty",
        activeDatasetId: null,
        stagedDatasetCount,
        failedDatasetCount,
        issueCodes: [],
      };
    }
    if (this.state.pointer.state !== "v2_active" || !this.state.pointer.datasetId) {
      return {
        status: "pointer_corrupted",
        activeDatasetId: this.state.pointer.datasetId,
        stagedDatasetCount,
        failedDatasetCount,
        issueCodes: ["pointer_corrupted"],
      };
    }
    const metadata = this.state.metadata.get(this.state.pointer.datasetId);
    const dataset = this.state.datasets.get(this.state.pointer.datasetId);
    if (!metadata || !dataset) {
      return {
        status: "active_dataset_missing",
        activeDatasetId: this.state.pointer.datasetId,
        stagedDatasetCount,
        failedDatasetCount,
        issueCodes: ["active_dataset_missing"],
      };
    }
    if (metadata.status !== "active" || stablePersistenceStringify(dataset.activeDatasetPointer) !== "null") {
      return {
        status: "active_dataset_invalid",
        activeDatasetId: this.state.pointer.datasetId,
        stagedDatasetCount,
        failedDatasetCount,
        issueCodes: ["active_dataset_invalid"],
      };
    }
    return {
      status: failedDatasetCount > 0 ? "failed_staging" : stagedDatasetCount > 0 ? "staged_incomplete" : "active_valid",
      activeDatasetId: this.state.pointer.datasetId,
      stagedDatasetCount,
      failedDatasetCount,
      issueCodes: [],
    };
  }

  async clear(): Promise<void> {
    this.state = { datasets: new Map(), metadata: new Map(), pointer: null, journals: new Map() };
  }
}
