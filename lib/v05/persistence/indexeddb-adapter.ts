import {
  V2_SCHEMA_VERSION,
  type ActiveDatasetPointer,
  type MigrationManifest,
  type V2Dataset,
} from "../domain/models";
import { createIssue } from "../domain/results";
import type {
  ActivationJournalRecord,
  PersistedRecordEnvelope,
  PreparedV2Dataset,
  V2ActivationData,
  V2DatasetMetadata,
  V2PersistenceFailurePoint,
  V2PersistenceInspection,
  V2PersistenceResult,
  V2PersistenceStore,
  V2ReadBackValidationData,
} from "./contracts";
import {
  clonePersistenceValue,
  collectDatasetRecordKeys,
  envelopesForDataset,
  type V2RecordForStore,
} from "./envelopes";
import {
  V2_ACTIVE_POINTER_KEY,
  V2_ACTIVATION_JOURNAL_INDEXES,
  V2_DATASET_METADATA_INDEXES,
  V2_ENVELOPE_INDEXES,
  V2_INDEXEDDB_DATABASE_NAME,
  V2_INDEXEDDB_VERSION,
  V2_METADATA_INDEXES,
  V2_OBJECT_STORE_NAMES,
  V2_RECORD_STORE_NAMES,
  type V2RecordStoreName,
} from "./schema";

interface MetadataEntry<T> {
  key: string;
  value: T;
}

export interface OpenIndexedDbV2PersistenceStoreOptions {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
}

export interface IndexedDbV2SchemaInspection {
  objectStoreNames: string[];
  indexesByStoreName: Record<string, string[]>;
}

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

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_transaction_aborted"));
  });

const createStoreIfMissing = (
  db: IDBDatabase,
  storeName: string,
  keyPath: string,
  indexes: readonly string[],
): void => {
  const store = db.objectStoreNames.contains(storeName)
    ? null
    : db.createObjectStore(storeName, { keyPath });
  if (!store) return;
  indexes.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
};

const openDatabase = (
  indexedDBFactory: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDBFactory.open(databaseName, V2_INDEXEDDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      createStoreIfMissing(db, "metadata", "key", V2_METADATA_INDEXES);
      createStoreIfMissing(db, "datasetMetadata", "datasetId", V2_DATASET_METADATA_INDEXES);
      createStoreIfMissing(db, "activationJournal", "journalId", V2_ACTIVATION_JOURNAL_INDEXES);
      V2_RECORD_STORE_NAMES.forEach((storeName) =>
        createStoreIfMissing(db, storeName, "id", V2_ENVELOPE_INDEXES),
      );
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });

const getAll = async <T>(store: IDBObjectStore): Promise<T[]> =>
  requestToPromise(store.getAll() as IDBRequest<T[]>);

const getMetadataValue = async <T>(store: IDBObjectStore, key: string): Promise<T | null> => {
  const entry = await requestToPromise<MetadataEntry<T> | undefined>(store.get(key));
  return entry?.value ? clonePersistenceValue(entry.value) : null;
};

const putMetadataValue = <T>(store: IDBObjectStore, key: string, value: T): void => {
  store.put({ key, value: clonePersistenceValue(value) } satisfies MetadataEntry<T>);
};

const envelopeValues = async <TStoreName extends V2RecordStoreName>(
  store: IDBObjectStore,
  datasetId: string,
): Promise<Array<V2RecordForStore<TStoreName>>> => {
  const envelopes = await getAll<PersistedRecordEnvelope<V2RecordForStore<TStoreName>>>(store);
  return envelopes
    .filter((envelope) => envelope.datasetId === datasetId)
    .sort((left, right) => left.recordKey.localeCompare(right.recordKey))
    .map((envelope) => clonePersistenceValue(envelope.value));
};

const writeEnvelopeRecords = <TStoreName extends V2RecordStoreName>(
  transaction: IDBTransaction,
  datasetId: string,
  storeName: TStoreName,
  records: Array<V2RecordForStore<TStoreName>>,
): void => {
  const store = transaction.objectStore(storeName);
  envelopesForDataset(datasetId, storeName, records).forEach((envelope) => store.put(envelope));
};

export class IndexedDbV2PersistenceStore implements V2PersistenceStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open({
    databaseName = V2_INDEXEDDB_DATABASE_NAME,
    indexedDBFactory = globalThis.indexedDB,
  }: OpenIndexedDbV2PersistenceStoreOptions = {}): Promise<IndexedDbV2PersistenceStore> {
    if (!indexedDBFactory) throw new Error("indexeddb_unavailable");
    const db = await openDatabase(indexedDBFactory, databaseName);
    return new IndexedDbV2PersistenceStore(db);
  }

  close(): void {
    this.db.close();
  }

  inspectSchema(): IndexedDbV2SchemaInspection {
    const indexesByStoreName: Record<string, string[]> = {};
    const transaction = this.db.transaction([...V2_OBJECT_STORE_NAMES], "readonly");
    V2_OBJECT_STORE_NAMES.forEach((storeName) => {
      indexesByStoreName[storeName] = Array.from(transaction.objectStore(storeName).indexNames).sort();
    });
    return {
      objectStoreNames: Array.from(this.db.objectStoreNames).sort(),
      indexesByStoreName,
    };
  }

  async prepareDataset(
    prepared: PreparedV2Dataset,
    failurePoint?: V2PersistenceFailurePoint,
  ): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    if (failurePoint === "before_prepare") return failed("prepare", "Injected failure before prepare.");
    const existing = await this.getDatasetMetadata(prepared.dataset.datasetId);
    if (existing) {
      if (
        existing.businessDatasetFingerprint !== prepared.metadata.businessDatasetFingerprint ||
        existing.manifestFingerprint !== prepared.metadata.manifestFingerprint
      ) {
        return conflict("datasetMetadata", "Existing dataset metadata fingerprint differs.");
      }
      return { status: "prepared", data: existing, issues: [] };
    }

    const transaction = this.db.transaction([...V2_RECORD_STORE_NAMES, "datasetMetadata"], "readwrite");
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "platforms", prepared.dataset.platforms);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "stores", prepared.dataset.stores);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "importBatches", prepared.dataset.importBatches);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "importFiles", prepared.dataset.importFiles);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "businessProductFacts", prepared.dataset.businessProductFacts);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "adProductFacts", prepared.dataset.adProductFacts);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "adPlanFacts", prepared.dataset.adPlanFacts);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "afterSalesDailyAggregates", prepared.dataset.afterSalesDailyAggregates);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "afterSalesRangeAggregates", prepared.dataset.afterSalesRangeAggregates);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "afterSalesOperationalSnapshots", prepared.dataset.afterSalesOperationalSnapshots);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "afterSalesDistributionItems", prepared.dataset.afterSalesDistributionItems);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "series", prepared.dataset.series);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "trackedProducts", prepared.dataset.trackedProducts);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "targets", prepared.dataset.targets);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "legacyTargetCandidates", prepared.dataset.legacyTargetCandidates);
    writeEnvelopeRecords(transaction, prepared.dataset.datasetId, "migrationManifests", prepared.dataset.migrationManifests);
    transaction.objectStore("datasetMetadata").put(clonePersistenceValue(prepared.metadata));
    if (failurePoint === "during_record_write") transaction.abort();
    try {
      await transactionDone(transaction);
    } catch {
      return failed("records", "IndexedDB prepare transaction failed.");
    }
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
    const transaction = this.db.transaction([...V2_RECORD_STORE_NAMES, "datasetMetadata"], "readonly");
    const metadata = await requestToPromise<V2DatasetMetadata | undefined>(
      transaction.objectStore("datasetMetadata").get(datasetId),
    );
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    const dataset: V2Dataset = {
      schemaVersion: V2_SCHEMA_VERSION,
      datasetId,
      platforms: await envelopeValues<"platforms">(transaction.objectStore("platforms"), datasetId),
      stores: await envelopeValues<"stores">(transaction.objectStore("stores"), datasetId),
      importBatches: await envelopeValues<"importBatches">(transaction.objectStore("importBatches"), datasetId),
      importFiles: await envelopeValues<"importFiles">(transaction.objectStore("importFiles"), datasetId),
      businessProductFacts: await envelopeValues<"businessProductFacts">(transaction.objectStore("businessProductFacts"), datasetId),
      adProductFacts: await envelopeValues<"adProductFacts">(transaction.objectStore("adProductFacts"), datasetId),
      adPlanFacts: await envelopeValues<"adPlanFacts">(transaction.objectStore("adPlanFacts"), datasetId),
      afterSalesDailyAggregates: await envelopeValues<"afterSalesDailyAggregates">(transaction.objectStore("afterSalesDailyAggregates"), datasetId),
      afterSalesRangeAggregates: await envelopeValues<"afterSalesRangeAggregates">(transaction.objectStore("afterSalesRangeAggregates"), datasetId),
      afterSalesOperationalSnapshots: await envelopeValues<"afterSalesOperationalSnapshots">(transaction.objectStore("afterSalesOperationalSnapshots"), datasetId),
      afterSalesDistributionItems: await envelopeValues<"afterSalesDistributionItems">(transaction.objectStore("afterSalesDistributionItems"), datasetId),
      series: await envelopeValues<"series">(transaction.objectStore("series"), datasetId),
      trackedProducts: await envelopeValues<"trackedProducts">(transaction.objectStore("trackedProducts"), datasetId),
      targets: await envelopeValues<"targets">(transaction.objectStore("targets"), datasetId),
      legacyTargetCandidates: await envelopeValues<"legacyTargetCandidates">(transaction.objectStore("legacyTargetCandidates"), datasetId),
      migrationManifests: await envelopeValues<"migrationManifests">(transaction.objectStore("migrationManifests"), datasetId),
      activeDatasetPointer: null,
    };
    await transactionDone(transaction);
    return {
      status: "readback_validated",
      data: {
        dataset,
        metadata: clonePersistenceValue(metadata),
        recordKeys: collectDatasetRecordKeys(dataset),
      },
      issues: [],
    };
  }

  async loadDataset(datasetId: string): Promise<V2Dataset | null> {
    const readBack = await this.readDataset(datasetId);
    return readBack.data?.dataset ? clonePersistenceValue(readBack.data.dataset) : null;
  }

  async loadActiveDataset(): Promise<V2Dataset | null> {
    const pointer = await this.getActivePointer();
    if (!pointer?.datasetId) return null;
    return this.loadDataset(pointer.datasetId);
  }

  async markDatasetValidated(datasetId: string, validatedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    const metadata = await this.getDatasetMetadata(datasetId);
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    const next = { ...metadata, status: "validated" as const, validatedAt };
    const transaction = this.db.transaction("datasetMetadata", "readwrite");
    transaction.objectStore("datasetMetadata").put(clonePersistenceValue(next));
    await transactionDone(transaction);
    return { status: "readback_validated", data: clonePersistenceValue(next), issues: [] };
  }

  async markDatasetFailed(datasetId: string, failedAt: string): Promise<V2PersistenceResult<V2DatasetMetadata>> {
    const metadata = await this.getDatasetMetadata(datasetId);
    if (!metadata) return failed("datasetMetadata", "Dataset metadata is missing.");
    const next = { ...metadata, status: "failed" as const, failedAt };
    const transaction = this.db.transaction("datasetMetadata", "readwrite");
    transaction.objectStore("datasetMetadata").put(clonePersistenceValue(next));
    await transactionDone(transaction);
    return { status: "failed", data: clonePersistenceValue(next), issues: [] };
  }

  async getDatasetMetadata(datasetId: string): Promise<V2DatasetMetadata | null> {
    const transaction = this.db.transaction("datasetMetadata", "readonly");
    const metadata = await requestToPromise<V2DatasetMetadata | undefined>(
      transaction.objectStore("datasetMetadata").get(datasetId),
    );
    await transactionDone(transaction);
    return metadata ? clonePersistenceValue(metadata) : null;
  }

  async getActivePointer(): Promise<ActiveDatasetPointer | null> {
    const transaction = this.db.transaction("metadata", "readonly");
    const pointer = await getMetadataValue<ActiveDatasetPointer>(transaction.objectStore("metadata"), V2_ACTIVE_POINTER_KEY);
    await transactionDone(transaction);
    return pointer;
  }

  async listDatasetMetadata(): Promise<V2DatasetMetadata[]> {
    const transaction = this.db.transaction("datasetMetadata", "readonly");
    const metadata = await getAll<V2DatasetMetadata>(transaction.objectStore("datasetMetadata"));
    await transactionDone(transaction);
    return metadata
      .map((item) => clonePersistenceValue(item))
      .sort((left, right) => left.datasetId.localeCompare(right.datasetId));
  }

  async listActivationJournal(): Promise<ActivationJournalRecord[]> {
    const transaction = this.db.transaction("activationJournal", "readonly");
    const journal = await getAll<ActivationJournalRecord>(transaction.objectStore("activationJournal"));
    await transactionDone(transaction);
    return journal
      .map((item) => clonePersistenceValue(item))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.journalId.localeCompare(right.journalId));
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
    const transaction = this.db.transaction(["metadata", "datasetMetadata", "activationJournal", "migrationManifests"], "readwrite");
    const metadataStore = transaction.objectStore("metadata");
    const datasetStore = transaction.objectStore("datasetMetadata");
    const journalStore = transaction.objectStore("activationJournal");
    const manifestStore = transaction.objectStore("migrationManifests");
    const currentPointer = await getMetadataValue<ActiveDatasetPointer>(metadataStore, V2_ACTIVE_POINTER_KEY);
    const metadata = await requestToPromise<V2DatasetMetadata | undefined>(datasetStore.get(datasetId));
    if (!metadata) {
      transaction.abort();
      return failed("datasetMetadata", "Dataset metadata is missing.");
    }
    if (metadata.status === "active" && currentPointer?.datasetId === datasetId) {
      transaction.abort();
      return {
        status: "already_active",
        data: {
          datasetId,
          previousDatasetId: datasetId,
          pointer: clonePersistenceValue(currentPointer),
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
      transaction.abort();
      return failed("datasetMetadata.status", "Only a readback-validated dataset can be activated.");
    }
    const currentDatasetId = currentPointer?.datasetId ?? null;
    if (currentDatasetId !== expectedCurrentDatasetId) {
      transaction.abort();
      return conflict("activeDatasetPointer", "Current active dataset does not match expected value.");
    }
    if (currentDatasetId) {
      const currentMetadata = await requestToPromise<V2DatasetMetadata | undefined>(datasetStore.get(currentDatasetId));
      if (currentMetadata) datasetStore.put({ ...currentMetadata, status: "inactive_valid" });
    }
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
    datasetStore.put({ ...metadata, status: "active", activatedAt });
    const manifestEnvelopes = await getAll<PersistedRecordEnvelope<MigrationManifest>>(manifestStore);
    manifestEnvelopes
      .filter((envelope) => envelope.datasetId === datasetId)
      .forEach((envelope) => manifestStore.put({ ...envelope, value: { ...envelope.value, status: "success", completedAt: activatedAt } }));
    putMetadataValue(metadataStore, V2_ACTIVE_POINTER_KEY, pointer);
    journalStore.put(journal);
    if (failurePoint === "during_pointer_write" || failurePoint === "after_pointer_write_before_commit") {
      transaction.abort();
    }
    try {
      await transactionDone(transaction);
    } catch {
      return failed("activeDatasetPointer", "IndexedDB activation transaction failed.");
    }
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
    const transaction = this.db.transaction(["metadata", "datasetMetadata", "activationJournal"], "readwrite");
    const metadataStore = transaction.objectStore("metadata");
    const datasetStore = transaction.objectStore("datasetMetadata");
    const pointer = await getMetadataValue<ActiveDatasetPointer>(metadataStore, V2_ACTIVE_POINTER_KEY);
    if (pointer?.datasetId !== expectedCurrentDatasetId) {
      transaction.abort();
      return conflict("activeDatasetPointer", "Current active dataset does not match expected rollback value.");
    }
    const target = await requestToPromise<V2DatasetMetadata | undefined>(datasetStore.get(targetDatasetId));
    if (!target || (target.status !== "active" && target.status !== "inactive_valid")) {
      transaction.abort();
      return failed("datasetMetadata.status", "Rollback target must be active or inactive_valid.");
    }
    const current = await requestToPromise<V2DatasetMetadata | undefined>(datasetStore.get(expectedCurrentDatasetId));
    if (current) datasetStore.put({ ...current, status: "inactive_valid" });
    datasetStore.put({ ...target, status: "active", activatedAt: rolledBackAt });
    const nextPointer: ActiveDatasetPointer = {
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
    putMetadataValue(metadataStore, V2_ACTIVE_POINTER_KEY, nextPointer);
    transaction.objectStore("activationJournal").put(journal);
    await transactionDone(transaction);
    return {
      status: "rolled_back",
      data: { datasetId: targetDatasetId, previousDatasetId: expectedCurrentDatasetId, pointer: nextPointer, journal },
      issues: [],
    };
  }

  async inspectState(): Promise<V2PersistenceInspection> {
    const transaction = this.db.transaction(["metadata", "datasetMetadata"], "readonly");
    const pointer = await getMetadataValue<ActiveDatasetPointer>(transaction.objectStore("metadata"), V2_ACTIVE_POINTER_KEY);
    const metadata = await getAll<V2DatasetMetadata>(transaction.objectStore("datasetMetadata"));
    await transactionDone(transaction);
    const stagedDatasetCount = metadata.filter((item) => item.status === "staging").length;
    const failedDatasetCount = metadata.filter((item) => item.status === "failed").length;
    if (!pointer && metadata.length === 0) {
      return { status: "empty", activeDatasetId: null, stagedDatasetCount, failedDatasetCount, issueCodes: [] };
    }
    if (!pointer) {
      return { status: "pointer_missing", activeDatasetId: null, stagedDatasetCount, failedDatasetCount, issueCodes: ["pointer_missing"] };
    }
    if (pointer.state !== "v2_active" || !pointer.datasetId) {
      return { status: "pointer_corrupted", activeDatasetId: pointer.datasetId, stagedDatasetCount, failedDatasetCount, issueCodes: ["pointer_corrupted"] };
    }
    const active = metadata.find((item) => item.datasetId === pointer.datasetId);
    if (!active) {
      return { status: "active_dataset_missing", activeDatasetId: pointer.datasetId, stagedDatasetCount, failedDatasetCount, issueCodes: ["active_dataset_missing"] };
    }
    if (active.status !== "active") {
      return { status: "active_dataset_invalid", activeDatasetId: pointer.datasetId, stagedDatasetCount, failedDatasetCount, issueCodes: ["active_dataset_invalid"] };
    }
    return {
      status: failedDatasetCount > 0 ? "failed_staging" : stagedDatasetCount > 0 ? "staged_incomplete" : "active_valid",
      activeDatasetId: pointer.datasetId,
      stagedDatasetCount,
      failedDatasetCount,
      issueCodes: [],
    };
  }

  async clear(): Promise<void> {
    const transaction = this.db.transaction([...V2_OBJECT_STORE_NAMES], "readwrite");
    V2_OBJECT_STORE_NAMES.forEach((storeName) => transaction.objectStore(storeName).clear());
    await transactionDone(transaction);
  }
}

export const deleteIndexedDbDatabase = (
  databaseName: string,
  indexedDBFactory: IDBFactory = globalThis.indexedDB,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDBFactory.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("indexeddb_delete_failed"));
    request.onblocked = () => reject(new Error("indexeddb_delete_blocked"));
  });
