import {
  TARGET_METRIC_DEFINITIONS,
  getTargetMetricDefinitionsForScope,
  type TargetMetricDefinition,
} from "../bi/target-metric-definitions";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftBulkSaveResult,
  type TargetDraftClearResult,
  type TargetDraftCorruptedReason,
  type TargetDraftDeleteResult,
  type TargetDraftLoadResult,
  type TargetDraftPauseResult,
  type TargetDraftPersistenceOptions,
  type TargetDraftPersistenceUnavailableReason,
  type TargetDraftQuery,
  type TargetDraftRecord,
  type TargetDraftSaveResult,
  type TargetDraftScope,
  type TargetDraftStatus,
  type TargetDraftValidationError,
  type TargetDraftValidationResult,
} from "./target-drafts-persistence.types";

const DEFAULT_DATABASE_NAME = "airburg-target-drafts-v1";
const DATABASE_VERSION = 1;
const TARGET_DRAFTS_STORE = "targetDrafts";
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const safeString = (value: unknown): string => (isNonEmptyString(value) ? value.trim() : "");

const safeNullableString = (value: unknown): string | null => {
  const normalized = safeString(value);
  return normalized.length > 0 ? normalized : null;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const nowIso = (options: TargetDraftPersistenceOptions = {}): string =>
  (options.now ?? (() => new Date()))().toISOString();

const isTargetDraftScope = (value: unknown): value is TargetDraftScope =>
  value === "platform" || value === "series" || value === "product";

const isTargetDraftStatus = (value: unknown): value is TargetDraftStatus =>
  value === "active" || value === "paused";

const metricDefinitionByKey = (metricKey: string): TargetMetricDefinition | null =>
  TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === metricKey) ?? null;

const metricDefinitionForScope = (
  scope: TargetDraftScope,
  metricKey: string,
): TargetMetricDefinition | null =>
  getTargetMetricDefinitionsForScope(scope).find((definition) => definition.metricKey === metricKey) ?? null;

const uniqueErrors = (errors: TargetDraftValidationError[]): TargetDraftValidationError[] =>
  Array.from(new Set(errors));

const normalizeTargetDraftRecord = (
  source: Record<string, unknown>,
  options: TargetDraftPersistenceOptions = {},
): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: safeString(source.targetId),
  scope: source.scope as TargetDraftScope,
  platformCode: safeString(source.platformCode),
  storeId: safeString(source.storeId),
  seriesId: safeNullableString(source.seriesId),
  productId: safeNullableString(source.productId),
  month: safeString(source.month),
  metricKey: safeString(source.metricKey),
  targetValue: source.targetValue as number,
  unit: safeString(source.unit),
  createdAt: safeString(source.createdAt) || nowIso(options),
  updatedAt: safeString(source.updatedAt) || nowIso(options),
  status: source.status as TargetDraftStatus,
});

export const validateTargetDraftRecord = (
  record: unknown,
  options: TargetDraftPersistenceOptions = {},
): TargetDraftValidationResult => {
  if (!isObjectRecord(record)) return { status: "invalid", errors: ["record_not_object"] };
  if (record.schemaVersion !== TARGET_DRAFT_SCHEMA_VERSION) {
    return { status: "corrupted", reason: "schema_version_incompatible" };
  }

  const errors: TargetDraftValidationError[] = [];
  const targetId = safeString(record.targetId);
  const scope = record.scope;
  const platformCode = safeString(record.platformCode);
  const storeId = safeString(record.storeId);
  const seriesId = safeNullableString(record.seriesId);
  const productId = safeNullableString(record.productId);
  const month = safeString(record.month);
  const metricKey = safeString(record.metricKey);
  const unit = safeString(record.unit);
  const targetValue = record.targetValue;
  const status = record.status;

  if (!targetId) errors.push("target_id_required");
  if (!isTargetDraftScope(scope)) errors.push("scope_invalid");
  if (!platformCode) errors.push("platform_code_required");
  if (!storeId) errors.push("store_id_required");
  if (scope === "series" && !seriesId) errors.push("series_id_required");
  if (scope === "product" && !productId) errors.push("product_id_required");
  if (!MONTH_PATTERN.test(month)) errors.push("month_invalid");
  if (typeof targetValue !== "number" || !Number.isFinite(targetValue) || targetValue <= 0) {
    errors.push("target_value_invalid");
  }
  if (!isTargetDraftStatus(status)) errors.push("status_invalid");

  const globalDefinition = metricDefinitionByKey(metricKey);
  if (!globalDefinition) {
    errors.push("metric_key_unknown");
  } else if (isTargetDraftScope(scope) && !metricDefinitionForScope(scope, metricKey)) {
    errors.push("metric_scope_unsupported");
  }

  const scopedDefinition = isTargetDraftScope(scope) ? metricDefinitionForScope(scope, metricKey) : null;
  const definition = scopedDefinition ?? globalDefinition;
  if (definition && unit !== definition.unit) errors.push("unit_invalid");
  if (metricKey === "adRoi" && unit !== "倍") errors.push("roi_unit_invalid");

  if (errors.length > 0) return { status: "invalid", errors: uniqueErrors(errors) };

  return {
    status: "valid",
    record: normalizeTargetDraftRecord(record, options),
  };
};

const getIndexedDBFactory = (options: TargetDraftPersistenceOptions = {}): IDBFactory | null =>
  options.indexedDBFactory ?? (typeof indexedDB !== "undefined" ? indexedDB : null);

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
  });

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_transaction_aborted"));
  });

const openDatabase = (
  options: TargetDraftPersistenceOptions = {},
): Promise<IDBDatabase | TargetDraftPersistenceUnavailableReason> => {
  const indexedDBFactory = getIndexedDBFactory(options);
  if (!indexedDBFactory) return Promise.resolve("indexeddb_unavailable");

  return new Promise((resolve) => {
    const request = indexedDBFactory.open(options.databaseName ?? DEFAULT_DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TARGET_DRAFTS_STORE)) {
        db.createObjectStore(TARGET_DRAFTS_STORE, { keyPath: "targetId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve("open_failed");
  });
};

const isUnavailableReason = (
  value: IDBDatabase | TargetDraftPersistenceUnavailableReason,
): value is TargetDraftPersistenceUnavailableReason => typeof value === "string";

const validateStoredRecords = (
  records: unknown[],
  options: TargetDraftPersistenceOptions = {},
): TargetDraftRecord[] | TargetDraftCorruptedReason => {
  const validated: TargetDraftRecord[] = [];
  for (const record of records) {
    const result = validateTargetDraftRecord(record, options);
    if (result.status === "corrupted") return result.reason;
    if (result.status === "invalid") return "stored_record_invalid";
    validated.push(result.record);
  }
  return validated;
};

const queryValueProvided = (query: TargetDraftQuery, key: keyof TargetDraftQuery): boolean =>
  Object.prototype.hasOwnProperty.call(query, key);

const matchesQuery = (record: TargetDraftRecord, query: TargetDraftQuery): boolean => {
  if (queryValueProvided(query, "platformCode") && record.platformCode !== query.platformCode) return false;
  if (queryValueProvided(query, "storeId") && record.storeId !== query.storeId) return false;
  if (queryValueProvided(query, "seriesId") && (record.seriesId ?? null) !== (query.seriesId ?? null)) return false;
  if (queryValueProvided(query, "productId") && (record.productId ?? null) !== (query.productId ?? null)) return false;
  if (queryValueProvided(query, "scope") && record.scope !== query.scope) return false;
  if (queryValueProvided(query, "month") && record.month !== query.month) return false;
  if (queryValueProvided(query, "metricKey") && record.metricKey !== query.metricKey) return false;
  return true;
};

const hasAnyQueryFilter = (query: TargetDraftQuery): boolean =>
  [
    "platformCode",
    "storeId",
    "seriesId",
    "productId",
    "scope",
    "month",
    "metricKey",
  ].some((key) => queryValueProvided(query, key as keyof TargetDraftQuery));

export const saveTargetDraft = async (
  record: TargetDraftRecord,
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftSaveResult> => {
  const validation = validateTargetDraftRecord(record, options);
  if (validation.status === "invalid") return validation;
  if (validation.status === "corrupted") return validation;

  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const transaction = db.transaction(TARGET_DRAFTS_STORE, "readwrite");
    transaction.objectStore(TARGET_DRAFTS_STORE).put(validation.record);
    await transactionToPromise(transaction);
    db.close();
    return { status: "saved", record: clone(validation.record) };
  } catch {
    db.close();
    return { status: "unavailable", reason: "write_failed" };
  }
};

export const saveTargetDrafts = async (
  records: TargetDraftRecord[],
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftBulkSaveResult> => {
  const validatedRecords: TargetDraftRecord[] = [];
  const errors: TargetDraftValidationError[] = [];

  for (const record of records) {
    const validation = validateTargetDraftRecord(record, options);
    if (validation.status === "corrupted") return validation;
    if (validation.status === "invalid") {
      errors.push(...validation.errors);
      continue;
    }
    validatedRecords.push(validation.record);
  }

  if (errors.length > 0) return { status: "invalid", errors: uniqueErrors(errors) };

  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const transaction = db.transaction(TARGET_DRAFTS_STORE, "readwrite");
    const store = transaction.objectStore(TARGET_DRAFTS_STORE);
    validatedRecords.forEach((record) => store.put(record));
    await transactionToPromise(transaction);
    db.close();
    return { status: "saved", records: clone(validatedRecords) };
  } catch {
    db.close();
    return { status: "unavailable", reason: "write_failed" };
  }
};

export const loadTargetDrafts = async (
  query: TargetDraftQuery = {},
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftLoadResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason, records: [] };
  const db = dbOrReason;

  try {
    const storedRecords = await requestToPromise<unknown[]>(
      db.transaction(TARGET_DRAFTS_STORE, "readonly").objectStore(TARGET_DRAFTS_STORE).getAll(),
    );
    db.close();

    const validated = validateStoredRecords(storedRecords, options);
    if (typeof validated === "string") return { status: "corrupted", reason: validated };
    const records = validated.filter((record) => matchesQuery(record, query));
    if (records.length === 0) return { status: "empty", records: [] };
    return {
      status: "ok",
      records: clone(records).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
  } catch {
    db.close();
    return { status: "unavailable", reason: "read_failed", records: [] };
  }
};

export const loadActiveTargetDrafts = async (
  query: TargetDraftQuery = {},
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftLoadResult> => {
  const result = await loadTargetDrafts(query, options);
  if (result.status !== "ok") return result;
  const records = result.records.filter((record) => record.status === "active");
  if (records.length === 0) return { status: "empty", records: [] };
  return { status: "ok", records };
};

export const deleteTargetDraft = async (
  targetId: string,
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftDeleteResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const transaction = db.transaction(TARGET_DRAFTS_STORE, "readwrite");
    transaction.objectStore(TARGET_DRAFTS_STORE).delete(targetId);
    await transactionToPromise(transaction);
    db.close();
    return { status: "deleted", targetId };
  } catch {
    db.close();
    return { status: "unavailable", reason: "delete_failed" };
  }
};

export const pauseTargetDraft = async (
  targetId: string,
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftPauseResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const store = db.transaction(TARGET_DRAFTS_STORE, "readonly").objectStore(TARGET_DRAFTS_STORE);
    const storedRecord = await requestToPromise<unknown | undefined>(store.get(targetId));
    if (!storedRecord) {
      db.close();
      return { status: "not_found", targetId };
    }

    const validation = validateTargetDraftRecord(storedRecord, options);
    if (validation.status === "corrupted") {
      db.close();
      return validation;
    }
    if (validation.status === "invalid") {
      db.close();
      return { status: "corrupted", reason: "stored_record_invalid" };
    }

    const pausedRecord: TargetDraftRecord = {
      ...validation.record,
      status: "paused",
      updatedAt: nowIso(options),
    };
    const transaction = db.transaction(TARGET_DRAFTS_STORE, "readwrite");
    transaction.objectStore(TARGET_DRAFTS_STORE).put(pausedRecord);
    await transactionToPromise(transaction);
    db.close();
    return { status: "paused", record: clone(pausedRecord) };
  } catch {
    db.close();
    return { status: "unavailable", reason: "write_failed" };
  }
};

export const clearTargetDraftsForScope = async (
  query: TargetDraftQuery,
  options: TargetDraftPersistenceOptions = {},
): Promise<TargetDraftClearResult> => {
  if (!hasAnyQueryFilter(query)) return { status: "invalid", errors: ["empty_query"] };

  const loaded = await loadTargetDrafts({}, options);
  if (loaded.status === "corrupted") return loaded;
  if (loaded.status === "unavailable") return { status: "unavailable", reason: "clear_failed" };
  if (loaded.status === "empty") return { status: "cleared", count: 0 };

  const targetIds = loaded.records.filter((record) => matchesQuery(record, query)).map((record) => record.targetId);
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const transaction = db.transaction(TARGET_DRAFTS_STORE, "readwrite");
    const store = transaction.objectStore(TARGET_DRAFTS_STORE);
    targetIds.forEach((targetId) => store.delete(targetId));
    await transactionToPromise(transaction);
    db.close();
    return { status: "cleared", count: targetIds.length };
  } catch {
    db.close();
    return { status: "unavailable", reason: "clear_failed" };
  }
};
