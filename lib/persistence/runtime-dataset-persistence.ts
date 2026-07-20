import {
  setRuntimeBIDataSet,
  type AfterSalesMetric,
  type BIDataSet,
  type ETLIssue,
  type ETLRuntimeSummary,
  type PlanMetric,
  type Product,
  type ProductMetric,
  type SearchProductKeyword,
  type SearchTotalKeyword,
} from "../etl/runtime/context";
import {
  RUNTIME_DATASET_SCHEMA_VERSION,
  type RuntimeDatasetDateRange,
  type RuntimeDatasetImportSummary,
  type RuntimeDatasetPersistenceOptions,
  type RuntimeDatasetPersistenceUnavailableReason,
  type RuntimeDatasetSafeIssue,
  type RuntimeDatasetSnapshot,
  type RuntimeDatasetSnapshotClearResult,
  type RuntimeDatasetSnapshotListResult,
  type RuntimeDatasetSnapshotLoadResult,
  type RuntimeDatasetSnapshotRestoreResult,
  type RuntimeDatasetSnapshotSaveResult,
  type RuntimeDatasetSnapshotSummary,
  type RuntimeDatasetSourceCoverage,
  type RuntimeDatasetSourceType,
  type SaveRuntimeDatasetSnapshotOptions,
} from "./runtime-dataset-persistence.types";

const DEFAULT_DATABASE_NAME = "airburg-runtime-dataset-v1";
const DATABASE_VERSION = 1;
const SNAPSHOTS_STORE = "runtimeDatasetSnapshots";
const ACTIVE_POINTER_STORE = "runtimeDatasetActivePointer";
const ACTIVE_POINTER_KEY = "active";

interface ActivePointerRecord {
  key: typeof ACTIVE_POINTER_KEY;
  schemaVersion: typeof RUNTIME_DATASET_SCHEMA_VERSION;
  activeDatasetId: string;
  updatedAt: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const safeString = (value: unknown, fallback = ""): string =>
  isNonEmptyString(value) ? value.trim() : fallback;

const safeNullableString = (value: unknown): string | null =>
  isNonEmptyString(value) ? value.trim() : null;

const safeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const safeInteger = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizeProduct = (product: Product): Product => ({
  platformCode: safeString(product.platformCode, "unknown"),
  platformName: safeNullableString(product.platformName),
  storeId: safeString(product.storeId, "unknown"),
  storeName: safeNullableString(product.storeName),
  productId: safeString(product.productId, "unknown"),
  name: safeString(product.name, "未命名商品"),
  brandWord: safeNullableString(product.brandWord),
  modelWord: safeNullableString(product.modelWord),
});

const normalizeProductMetric = (metric: ProductMetric): ProductMetric => ({
  platformCode: safeString(metric.platformCode, "unknown"),
  platformName: safeNullableString(metric.platformName),
  storeId: safeString(metric.storeId, "unknown"),
  storeName: safeNullableString(metric.storeName),
  productId: safeString(metric.productId, "unknown"),
  date: safeString(metric.date, ""),
  gmv: safeNumber(metric.gmv),
  gsv: safeNumber(metric.gsv),
  visitors: safeNumber(metric.visitors),
  buyers: safeNumber(metric.buyers),
});

const normalizePlanMetric = (metric: PlanMetric): PlanMetric => ({
  platformCode: safeString(metric.platformCode, "unknown"),
  platformName: safeNullableString(metric.platformName),
  storeId: safeString(metric.storeId, "unknown"),
  storeName: safeNullableString(metric.storeName),
  productId: safeNullableString(metric.productId),
  planId: safeNullableString(metric.planId),
  planName: safeNullableString(metric.planName),
  date: safeString(metric.date, ""),
  spend: safeNumber(metric.spend),
  clicks: safeNumber(metric.clicks),
  roi: safeNumber(metric.roi),
  directTransactionAmount: safeNumber(metric.directTransactionAmount),
  indirectTransactionAmount: safeNumber(metric.indirectTransactionAmount),
  totalTransactionAmount: safeNumber(metric.totalTransactionAmount),
});

const normalizeSearchTotalKeyword = (keyword: SearchTotalKeyword): SearchTotalKeyword => ({
  platformCode: safeString(keyword.platformCode, "unknown"),
  platformName: safeNullableString(keyword.platformName),
  storeId: safeString(keyword.storeId, "unknown"),
  storeName: safeNullableString(keyword.storeName),
  date: safeNullableString(keyword.date),
  keyword: safeString(keyword.keyword, ""),
  visitors: safeNumber(keyword.visitors),
  buyers: safeNumber(keyword.buyers),
  gmv: safeNumber(keyword.gmv),
});

const normalizeSearchProductKeyword = (keyword: SearchProductKeyword): SearchProductKeyword => ({
  platformCode: safeString(keyword.platformCode, "unknown"),
  platformName: safeNullableString(keyword.platformName),
  storeId: safeString(keyword.storeId, "unknown"),
  storeName: safeNullableString(keyword.storeName),
  date: safeNullableString(keyword.date),
  productId: safeString(keyword.productId, "unknown"),
  keyword: safeString(keyword.keyword, ""),
  visitors: safeNumber(keyword.visitors),
  buyers: safeNumber(keyword.buyers),
});

const normalizeAfterSalesMetric = (metric: AfterSalesMetric): AfterSalesMetric => ({
  platformCode: safeString(metric.platformCode, "unknown"),
  platformName: safeNullableString(metric.platformName),
  storeId: safeString(metric.storeId, "unknown"),
  storeName: safeNullableString(metric.storeName),
  productId: safeNullableString(metric.productId),
  date: safeString(metric.date, ""),
  refundAmount: safeNumber(metric.refundAmount),
  refundCount: safeNumber(metric.refundCount),
  shippedRefundAmount: safeNumber(metric.shippedRefundAmount),
  shippedRefundCount: safeNumber(metric.shippedRefundCount),
  signedRefundAmount: safeNumber(metric.signedRefundAmount),
  signedRefundCount: safeNumber(metric.signedRefundCount),
});

const sanitizeDataSet = (dataset: BIDataSet): BIDataSet => ({
  products: (dataset.products ?? []).map(normalizeProduct),
  productMetrics: (dataset.productMetrics ?? []).map(normalizeProductMetric),
  planMetrics: (dataset.planMetrics ?? []).map(normalizePlanMetric),
  searchTotalKeywords: (dataset.searchTotalKeywords ?? []).map(normalizeSearchTotalKeyword),
  searchProductKeywords: (dataset.searchProductKeywords ?? []).map(normalizeSearchProductKeyword),
  afterSalesMetrics: (dataset.afterSalesMetrics ?? []).map(normalizeAfterSalesMetric),
});

const sourceCoverageItem = (rowCount: number) => ({
  present: rowCount > 0,
  rowCount,
});

const buildSourceCoverage = (dataset: BIDataSet): RuntimeDatasetSourceCoverage => ({
  product_dimension: sourceCoverageItem(dataset.products.length),
  product_metric: sourceCoverageItem(dataset.productMetrics.length),
  plan_metric: sourceCoverageItem(dataset.planMetrics.length),
  search_total: sourceCoverageItem(dataset.searchTotalKeywords.length),
  search_product: sourceCoverageItem(dataset.searchProductKeywords.length),
  after_sales: sourceCoverageItem(dataset.afterSalesMetrics.length),
});

const buildImportSummary = (
  dataset: BIDataSet,
  summary: Partial<ETLRuntimeSummary> = {},
): RuntimeDatasetImportSummary => ({
  filesParsed: safeInteger(summary.filesParsed),
  filesFailed: safeInteger(summary.filesFailed),
  dedupedRecords: safeInteger(summary.dedupedRecords),
  productMetricsCount: dataset.productMetrics.length,
  planMetricsCount: dataset.planMetrics.length,
  searchTotalKeywordsCount: dataset.searchTotalKeywords.length,
  searchProductKeywordsCount: dataset.searchProductKeywords.length,
  afterSalesMetricsCount: dataset.afterSalesMetrics.length,
});

const inferIssueSourceType = (issue: ETLIssue): RuntimeDatasetSourceType => {
  const code = issue.code.toLowerCase();
  if (code.includes("after_sales")) return "after_sales";
  if (code.includes("plan")) return "plan_metric";
  if (code.includes("search_product")) return "search_product";
  if (code.includes("search")) return "search_total";
  if (code.includes("product_metric")) return "product_metric";
  if (code.includes("product_dimension")) return "product_dimension";
  return "unknown";
};

const buildSafeIssues = (issues: ETLIssue[] = []): RuntimeDatasetSafeIssue[] => {
  const issueMap = new Map<string, RuntimeDatasetSafeIssue>();

  issues.forEach((issue) => {
    const code = safeString(issue.code, "etl_unknown_issue");
    const level = issue.level === "error" ? "error" : "warning";
    const sourceType = inferIssueSourceType(issue);
    const key = `${code}::${level}::${sourceType}`;
    const existing = issueMap.get(key);
    if (existing) {
      existing.safeCount += 1;
      return;
    }
    issueMap.set(key, {
      code,
      level,
      sourceType,
      safeCount: 1,
    });
  });

  return [...issueMap.values()].sort((left, right) =>
    `${left.level}:${left.sourceType}:${left.code}`.localeCompare(`${right.level}:${right.sourceType}:${right.code}`),
  );
};

const allDates = (dataset: BIDataSet): string[] =>
  [
    ...dataset.productMetrics.map((metric) => metric.date),
    ...dataset.planMetrics.map((metric) => metric.date),
    ...dataset.searchTotalKeywords.map((keyword) => keyword.date),
    ...dataset.searchProductKeywords.map((keyword) => keyword.date),
    ...dataset.afterSalesMetrics.map((metric) => metric.date),
  ].filter(isNonEmptyString);

const deriveDateRange = (
  dataset: BIDataSet,
  explicitDateRange?: RuntimeDatasetDateRange,
): RuntimeDatasetDateRange => {
  if (explicitDateRange) {
    return {
      startDate: safeNullableString(explicitDateRange.startDate),
      endDate: safeNullableString(explicitDateRange.endDate),
    };
  }
  const dates = allDates(dataset).sort();
  return {
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
  };
};

const firstKnown = (values: string[], fallback: string): string => {
  const uniqueValues = [...new Set(values.filter(isNonEmptyString))];
  if (uniqueValues.length === 1) return uniqueValues[0] ?? fallback;
  if (uniqueValues.length > 1) return "mixed";
  return fallback;
};

const derivePlatformCode = (dataset: BIDataSet, explicitPlatformCode?: string): string =>
  safeString(
    explicitPlatformCode,
    firstKnown(
      [
        ...dataset.products.map((record) => record.platformCode),
        ...dataset.productMetrics.map((record) => record.platformCode),
        ...dataset.planMetrics.map((record) => record.platformCode),
        ...dataset.searchTotalKeywords.map((record) => record.platformCode),
        ...dataset.searchProductKeywords.map((record) => record.platformCode),
        ...dataset.afterSalesMetrics.map((record) => record.platformCode),
      ],
      "unknown",
    ),
  );

const deriveStoreId = (dataset: BIDataSet, explicitStoreId?: string): string =>
  safeString(
    explicitStoreId,
    firstKnown(
      [
        ...dataset.products.map((record) => record.storeId),
        ...dataset.productMetrics.map((record) => record.storeId),
        ...dataset.planMetrics.map((record) => record.storeId),
        ...dataset.searchTotalKeywords.map((record) => record.storeId),
        ...dataset.searchProductKeywords.map((record) => record.storeId),
        ...dataset.afterSalesMetrics.map((record) => record.storeId),
      ],
      "unknown",
    ),
  );

const createDatasetId = (): string => {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `runtime_${Date.now()}_${randomId}`;
};

const toSummary = (snapshot: RuntimeDatasetSnapshot): RuntimeDatasetSnapshotSummary => ({
  schemaVersion: snapshot.schemaVersion,
  activeDatasetId: snapshot.activeDatasetId,
  createdAt: snapshot.createdAt,
  updatedAt: snapshot.updatedAt,
  platformCode: snapshot.platformCode,
  storeId: snapshot.storeId,
  dateRange: clone(snapshot.dateRange),
  safeIssues: clone(snapshot.safeIssues),
  importSummary: clone(snapshot.importSummary),
  sourceCoverage: clone(snapshot.sourceCoverage),
});

const buildSnapshot = (
  dataset: BIDataSet,
  issues: ETLIssue[] = [],
  summary: Partial<ETLRuntimeSummary> = {},
  options: SaveRuntimeDatasetSnapshotOptions = {},
): RuntimeDatasetSnapshot => {
  const sanitizedDataSet = sanitizeDataSet(dataset);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const activeDatasetId = safeString(options.activeDatasetId, createDatasetId());
  return {
    schemaVersion: RUNTIME_DATASET_SCHEMA_VERSION,
    activeDatasetId,
    createdAt: now,
    updatedAt: now,
    platformCode: derivePlatformCode(sanitizedDataSet, options.platformCode),
    storeId: deriveStoreId(sanitizedDataSet, options.storeId),
    dateRange: deriveDateRange(sanitizedDataSet, options.dateRange),
    dataset: sanitizedDataSet,
    safeIssues: buildSafeIssues(issues),
    importSummary: buildImportSummary(sanitizedDataSet, summary),
    sourceCoverage: buildSourceCoverage(sanitizedDataSet),
  };
};

const getIndexedDBFactory = (options: RuntimeDatasetPersistenceOptions = {}): IDBFactory | null =>
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
  options: RuntimeDatasetPersistenceOptions = {},
): Promise<IDBDatabase | RuntimeDatasetPersistenceUnavailableReason> => {
  const indexedDBFactory = getIndexedDBFactory(options);
  if (!indexedDBFactory) return Promise.resolve("indexeddb_unavailable");

  return new Promise((resolve) => {
    const request = indexedDBFactory.open(options.databaseName ?? DEFAULT_DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "activeDatasetId" });
      }
      if (!db.objectStoreNames.contains(ACTIVE_POINTER_STORE)) {
        db.createObjectStore(ACTIVE_POINTER_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve("open_failed");
  });
};

const isUnavailableReason = (
  value: IDBDatabase | RuntimeDatasetPersistenceUnavailableReason,
): value is RuntimeDatasetPersistenceUnavailableReason => typeof value === "string";

const isRuntimeDatasetSnapshot = (value: unknown): value is RuntimeDatasetSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as RuntimeDatasetSnapshot;
  return (
    snapshot.schemaVersion === RUNTIME_DATASET_SCHEMA_VERSION &&
    isNonEmptyString(snapshot.activeDatasetId) &&
    typeof snapshot.dataset === "object" &&
    Array.isArray(snapshot.dataset.products) &&
    Array.isArray(snapshot.dataset.productMetrics) &&
    Array.isArray(snapshot.dataset.planMetrics) &&
    Array.isArray(snapshot.dataset.searchTotalKeywords) &&
    Array.isArray(snapshot.dataset.searchProductKeywords) &&
    Array.isArray(snapshot.dataset.afterSalesMetrics)
  );
};

const activePointerIsCompatible = (value: unknown): value is ActivePointerRecord => {
  if (!value || typeof value !== "object") return false;
  const pointer = value as ActivePointerRecord;
  return pointer.schemaVersion === RUNTIME_DATASET_SCHEMA_VERSION && isNonEmptyString(pointer.activeDatasetId);
};

export const saveRuntimeDatasetSnapshot = async (
  dataset: BIDataSet,
  issues: ETLIssue[] = [],
  summary: Partial<ETLRuntimeSummary> = {},
  options: SaveRuntimeDatasetSnapshotOptions = {},
): Promise<RuntimeDatasetSnapshotSaveResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;
  const snapshot = buildSnapshot(dataset, issues, summary, options);
  const pointer: ActivePointerRecord = {
    key: ACTIVE_POINTER_KEY,
    schemaVersion: RUNTIME_DATASET_SCHEMA_VERSION,
    activeDatasetId: snapshot.activeDatasetId,
    updatedAt: snapshot.updatedAt,
  };

  try {
    const transaction = db.transaction([SNAPSHOTS_STORE, ACTIVE_POINTER_STORE], "readwrite");
    transaction.objectStore(SNAPSHOTS_STORE).put(snapshot);
    transaction.objectStore(ACTIVE_POINTER_STORE).put(pointer);
    await transactionToPromise(transaction);
    db.close();
    return { status: "saved", snapshot: clone(snapshot) };
  } catch {
    db.close();
    return { status: "unavailable", reason: "write_failed" };
  }
};

export const loadActiveRuntimeDatasetSnapshot = async (
  options: RuntimeDatasetPersistenceOptions = {},
): Promise<RuntimeDatasetSnapshotLoadResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const pointer = await requestToPromise<ActivePointerRecord | undefined>(
      db.transaction(ACTIVE_POINTER_STORE, "readonly").objectStore(ACTIVE_POINTER_STORE).get(ACTIVE_POINTER_KEY),
    );
    if (!pointer) {
      db.close();
      return { status: "empty" };
    }
    if (!activePointerIsCompatible(pointer)) {
      db.close();
      return { status: "corrupted", reason: "active_pointer_schema_incompatible" };
    }

    const snapshot = await requestToPromise<RuntimeDatasetSnapshot | undefined>(
      db.transaction(SNAPSHOTS_STORE, "readonly").objectStore(SNAPSHOTS_STORE).get(pointer.activeDatasetId),
    );
    db.close();

    if (!snapshot) return { status: "corrupted", reason: "active_snapshot_missing" };
    if (!isRuntimeDatasetSnapshot(snapshot)) return { status: "corrupted", reason: "snapshot_schema_incompatible" };
    return { status: "ok", snapshot: clone(snapshot) };
  } catch {
    db.close();
    return { status: "unavailable", reason: "read_failed" };
  }
};

export const restoreRuntimeDatasetFromSnapshot = async (
  options: RuntimeDatasetPersistenceOptions = {},
): Promise<RuntimeDatasetSnapshotRestoreResult> => {
  const result = await loadActiveRuntimeDatasetSnapshot(options);
  if (result.status !== "ok") return result;
  setRuntimeBIDataSet(result.snapshot.dataset, []);
  return {
    status: "restored",
    snapshot: result.snapshot,
  };
};

export const listRuntimeDatasetSnapshots = async (
  options: RuntimeDatasetPersistenceOptions = {},
): Promise<RuntimeDatasetSnapshotListResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason, snapshots: [] };
  const db = dbOrReason;

  try {
    const snapshots = await requestToPromise<RuntimeDatasetSnapshot[]>(
      db.transaction(SNAPSHOTS_STORE, "readonly").objectStore(SNAPSHOTS_STORE).getAll(),
    );
    db.close();
    return {
      status: "ok",
      snapshots: snapshots
        .filter(isRuntimeDatasetSnapshot)
        .map(toSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
  } catch {
    db.close();
    return { status: "unavailable", reason: "read_failed", snapshots: [] };
  }
};

export const clearActiveRuntimeDatasetSnapshot = async (
  options: RuntimeDatasetPersistenceOptions = {},
): Promise<RuntimeDatasetSnapshotClearResult> => {
  const dbOrReason = await openDatabase(options);
  if (isUnavailableReason(dbOrReason)) return { status: "unavailable", reason: dbOrReason };
  const db = dbOrReason;

  try {
    const transaction = db.transaction(ACTIVE_POINTER_STORE, "readwrite");
    transaction.objectStore(ACTIVE_POINTER_STORE).delete(ACTIVE_POINTER_KEY);
    await transactionToPromise(transaction);
    db.close();
    return { status: "cleared" };
  } catch {
    db.close();
    return { status: "unavailable", reason: "clear_failed" };
  }
};
