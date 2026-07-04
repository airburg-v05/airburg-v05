import type { RuntimeDatasetSnapshot } from "../persistence/runtime-dataset-persistence.types";
import type { CrossPageDebugContextSnapshot } from "../persistence/debug-context-persistence";

export const SYSTEM_STATE_SCHEMA_VERSION = 1;

export const ETL_VERSION = "ETL_FILE_ROUTER_V2_RUNTIME_APPEND_STRICT_V1_SEARCH_KEYWORD_DEDUP_V2";
export const BI_VERSION = "BI_SSOT_CENTER_WORD_UNIFIED_MISSING_METRICS_V1";
export const TARGET_VERSION = "TARGET_REQUIRED_DERIVED_UNSUPPORTED_V1";
export const UI_ARCH_VERSION = "UI_IA_L1_L2_L3_L4_KPI_CHART_UPLOAD_PRODUCTIZED_V1";

export type SystemPlatformCode = "tmall" | "jd" | "douyin" | "yiz";
export type PlatformAdapterCode = "tmall" | "jd" | "douyin";

export const CURRENT_PLATFORM: SystemPlatformCode = "tmall";
export const CURRENT_DATASET_HASH = "dataset_empty";
export const CURRENT_TIME_RANGE: SystemTimeRange = {
  mode: "custom",
  startDate: null,
  endDate: null,
};
export const CURRENT_ACTIVE_SERIES: SystemActiveSeriesState = {
  seriesId: null,
  seriesName: null,
};
export const CURRENT_ACTIVE_PRODUCT: SystemActiveProductState = {
  productId: null,
  productKey: null,
};

export const SYSTEM_STATE_ID = "tmall-v1-active-system-state";
const DEFAULT_DATABASE_NAME = "airburg-system-state-v1";
const DATABASE_VERSION = 1;
const STATE_STORE = "systemState";

export type SSOTLayer = "ETL" | "BI" | "DOMAIN" | "UI";
export type TargetOverlayPolicy = "overlay_only";

export interface SystemTimeRange {
  mode: "day" | "week" | "month" | "custom";
  startDate: string | null;
  endDate: string | null;
}

export interface SystemActiveSeriesState {
  seriesId: string | null;
  seriesName: string | null;
}

export interface SystemActiveProductState {
  productId: string | null;
  productKey: string | null;
}

export interface SystemStateSourcePointers {
  runtimeDatasetSnapshotId: string | null;
  debugContextId: string | null;
}

export interface SystemStateVersions {
  ETL_VERSION: typeof ETL_VERSION;
  BI_VERSION: typeof BI_VERSION;
  TARGET_VERSION: typeof TARGET_VERSION;
  UI_ARCH_VERSION: typeof UI_ARCH_VERSION;
}

export interface SystemStateCurrentContext {
  CURRENT_PLATFORM: SystemPlatformCode;
  CURRENT_DATASET_HASH: string;
  CURRENT_TIME_RANGE: SystemTimeRange;
  CURRENT_ACTIVE_SERIES: SystemActiveSeriesState;
  CURRENT_ACTIVE_PRODUCT: SystemActiveProductState;
}

export interface TmallV1SystemState extends SystemStateVersions, SystemStateCurrentContext {
  schemaVersion: typeof SYSTEM_STATE_SCHEMA_VERSION;
  stateId: typeof SYSTEM_STATE_ID;
  createdAt: string;
  updatedAt: string;
  sourcePointers: SystemStateSourcePointers;
  ssotFlow: typeof SSOT_ARCHITECTURE_LOCK;
  kpiSemanticLock: typeof KPI_SEMANTIC_LOCK;
  targetOverlayLock: typeof TARGET_OVERLAY_LOCK;
  platformAdapterModel: typeof PLATFORM_ADAPTER_MODEL;
}

export interface CreateSystemStateOptions {
  platform?: SystemPlatformCode | string | null;
  datasetHash?: string | null;
  timeRange?: Partial<SystemTimeRange> | null;
  activeSeries?: Partial<SystemActiveSeriesState> | null;
  activeProduct?: Partial<SystemActiveProductState> | null;
  runtimeDatasetSnapshotId?: string | null;
  debugContextId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  now?: () => Date;
}

export interface BuildSystemStateFromSourcesOptions {
  runtimeSnapshot?: RuntimeDatasetSnapshot | null;
  debugContext?: CrossPageDebugContextSnapshot | null;
  now?: () => Date;
}

export interface SystemStatePersistenceOptions {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
  now?: () => Date;
}

export type SystemStateUnavailableReason =
  | "indexeddb_unavailable"
  | "open_failed"
  | "read_failed"
  | "write_failed";

export type SystemStateValidationResult =
  | { status: "valid"; state: TmallV1SystemState }
  | { status: "invalid"; reasons: string[] };

export type SystemStateLoadResult =
  | { status: "ok"; state: TmallV1SystemState }
  | { status: "empty" }
  | { status: "corrupted"; reasons: string[] }
  | { status: "unavailable"; reason: SystemStateUnavailableReason };

export type SystemStateSaveResult =
  | { status: "saved"; state: TmallV1SystemState }
  | { status: "invalid"; reasons: string[] }
  | { status: "unavailable"; reason: SystemStateUnavailableReason };

export const SSOT_ARCHITECTURE_LOCK = {
  flow: ["ETL", "BI", "DOMAIN", "UI"] as const,
  rules: {
    ETL: "structure_source_files_only",
    BI: "single_metric_interpretation_source",
    DOMAIN: "dimension_grouping_only",
    UI: "presentation_only",
  },
  forbidden: {
    UI: ["calculate_business_metrics", "redefine_target_formula", "parse_source_file"],
    TARGET: ["rewrite_bi_actuals", "enter_runtime_dataset"],
    DOMAIN: ["redefine_metric_formula"],
    BI: ["write_back_to_etl"],
  },
} as const;

export const KPI_SEMANTIC_LOCK = {
  source: "BI" as const,
  primary: ["gmv", "gsv", "adRoi"] as const,
  secondary: ["adSpendRateAfterRefund", "directTransactionShare"] as const,
  hidden: ["mtd", "dly", "trendDetail"] as const,
  targetPolicy: "target_overlay_only" as TargetOverlayPolicy,
  iaPolicy: "display_layer_only" as const,
} as const;

export const TARGET_OVERLAY_LOCK = {
  policy: "overlay_only" as TargetOverlayPolicy,
  canChangeActualMetrics: false,
  canWriteRuntimeDataset: false,
  canChangeBIFormula: false,
  missingTargetDisplay: "--",
  roiUnit: "倍",
} as const;

export const PLATFORM_ADAPTER_MODEL = {
  current: CURRENT_PLATFORM,
  adapters: ["tmall", "jd", "douyin"] as const,
  extensionRule: "replace_etl_adapter_only",
  biReusable: true,
  uiReusable: true,
  targetStructureStable: true,
} as const;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeString = (value: unknown, maxLength = 160): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text.slice(0, maxLength) : null;
};

const safePlatform = (value: unknown): SystemPlatformCode =>
  value === "tmall" || value === "jd" || value === "douyin" || value === "yiz" ? value : CURRENT_PLATFORM;

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizeTimeRange = (value?: Partial<SystemTimeRange> | null): SystemTimeRange => {
  const mode =
    value?.mode === "day" || value?.mode === "week" || value?.mode === "month" || value?.mode === "custom"
      ? value.mode
      : CURRENT_TIME_RANGE.mode;
  return {
    mode,
    startDate: safeString(value?.startDate, 10),
    endDate: safeString(value?.endDate, 10),
  };
};

const normalizeActiveSeries = (value?: Partial<SystemActiveSeriesState> | null): SystemActiveSeriesState => ({
  seriesId: safeString(value?.seriesId, 180),
  seriesName: safeString(value?.seriesName, 120),
});

const normalizeActiveProduct = (value?: Partial<SystemActiveProductState> | null): SystemActiveProductState => ({
  productId: safeString(value?.productId, 180),
  productKey: safeString(value?.productKey, 180),
});

const stableNormalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!isObjectRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((normalized, key) => {
      normalized[key] = stableNormalize(value[key]);
      return normalized;
    }, {});
};

export const stableStringify = (value: unknown): string => JSON.stringify(stableNormalize(value));

export const createDatasetHash = (datasetLike: unknown): string => {
  const serialized = stableStringify(datasetLike ?? {});
  if (serialized === "{}" || serialized === "null") return CURRENT_DATASET_HASH;
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `dataset_${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const createSystemState = (options: CreateSystemStateOptions = {}): TmallV1SystemState => {
  const now = options.now?.() ?? new Date();
  const timestamp = now.toISOString();
  return {
    schemaVersion: SYSTEM_STATE_SCHEMA_VERSION,
    stateId: SYSTEM_STATE_ID,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
    ETL_VERSION,
    BI_VERSION,
    TARGET_VERSION,
    UI_ARCH_VERSION,
    CURRENT_PLATFORM: safePlatform(options.platform),
    CURRENT_DATASET_HASH: safeString(options.datasetHash, 80) ?? CURRENT_DATASET_HASH,
    CURRENT_TIME_RANGE: normalizeTimeRange(options.timeRange),
    CURRENT_ACTIVE_SERIES: normalizeActiveSeries(options.activeSeries),
    CURRENT_ACTIVE_PRODUCT: normalizeActiveProduct(options.activeProduct),
    sourcePointers: {
      runtimeDatasetSnapshotId: safeString(options.runtimeDatasetSnapshotId, 180),
      debugContextId: safeString(options.debugContextId, 120),
    },
    ssotFlow: SSOT_ARCHITECTURE_LOCK,
    kpiSemanticLock: KPI_SEMANTIC_LOCK,
    targetOverlayLock: TARGET_OVERLAY_LOCK,
    platformAdapterModel: PLATFORM_ADAPTER_MODEL,
  };
};

const activeSeriesFromDebugContext = (
  debugContext?: CrossPageDebugContextSnapshot | null,
): SystemActiveSeriesState => {
  const currentSeriesName = safeString(debugContext?.pages.series.currentSeriesName, 120);
  const matchingSeries = debugContext?.pages.series.temporarySeriesProductIds.find(
    (item) => item.seriesName === currentSeriesName,
  );
  return {
    seriesId: safeString(matchingSeries?.seriesId, 180),
    seriesName: currentSeriesName,
  };
};

const activeProductFromDebugContext = (
  debugContext?: CrossPageDebugContextSnapshot | null,
): SystemActiveProductState => {
  const currentProductKey = safeString(debugContext?.pages.product.currentProductKey, 180);
  const matchingProduct = debugContext?.pages.product.temporaryTrackedProducts.find(
    (item) => item.id === currentProductKey || item.productId === currentProductKey,
  );
  return {
    productId: safeString(matchingProduct?.productId, 180) ?? currentProductKey,
    productKey: currentProductKey,
  };
};

export const createSystemStateFromSources = ({
  runtimeSnapshot,
  debugContext,
  now,
}: BuildSystemStateFromSourcesOptions = {}): TmallV1SystemState => {
  const runtimeTimeRange = runtimeSnapshot?.dateRange
    ? {
        mode: "custom" as const,
        startDate: runtimeSnapshot.dateRange.startDate,
        endDate: runtimeSnapshot.dateRange.endDate,
      }
    : null;

  return createSystemState({
    platform: debugContext?.selectedPlatform ?? runtimeSnapshot?.platformCode ?? CURRENT_PLATFORM,
    datasetHash: runtimeSnapshot ? createDatasetHash(runtimeSnapshot.dataset) : CURRENT_DATASET_HASH,
    timeRange: debugContext?.timeRange ?? runtimeTimeRange,
    activeSeries: activeSeriesFromDebugContext(debugContext),
    activeProduct: activeProductFromDebugContext(debugContext),
    runtimeDatasetSnapshotId: runtimeSnapshot?.activeDatasetId ?? null,
    debugContextId: debugContext?.contextId ?? null,
    createdAt: runtimeSnapshot?.createdAt,
    updatedAt: runtimeSnapshot?.updatedAt,
    now,
  });
};

export const serializeSystemState = (state: TmallV1SystemState): string => stableStringify(state);

export const restoreSystemState = (serialized: string): SystemStateValidationResult => {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return validateSystemState(parsed);
  } catch {
    return { status: "invalid", reasons: ["json_parse_failed"] };
  }
};

export const validateSystemState = (value: unknown): SystemStateValidationResult => {
  const reasons: string[] = [];
  if (!isObjectRecord(value)) return { status: "invalid", reasons: ["state_not_object"] };
  if (value.schemaVersion !== SYSTEM_STATE_SCHEMA_VERSION) reasons.push("schema_version_mismatch");
  if (value.stateId !== SYSTEM_STATE_ID) reasons.push("state_id_mismatch");
  if (value.ETL_VERSION !== ETL_VERSION) reasons.push("etl_version_mismatch");
  if (value.BI_VERSION !== BI_VERSION) reasons.push("bi_version_mismatch");
  if (value.TARGET_VERSION !== TARGET_VERSION) reasons.push("target_version_mismatch");
  if (value.UI_ARCH_VERSION !== UI_ARCH_VERSION) reasons.push("ui_arch_version_mismatch");
  if (safePlatform(value.CURRENT_PLATFORM) !== value.CURRENT_PLATFORM) reasons.push("platform_invalid");
  if (!safeString(value.CURRENT_DATASET_HASH, 80)) reasons.push("dataset_hash_missing");
  if (!isObjectRecord(value.CURRENT_TIME_RANGE)) reasons.push("time_range_missing");
  if (!isObjectRecord(value.CURRENT_ACTIVE_SERIES)) reasons.push("active_series_missing");
  if (!isObjectRecord(value.CURRENT_ACTIVE_PRODUCT)) reasons.push("active_product_missing");
  if (stableStringify(value.ssotFlow) !== stableStringify(SSOT_ARCHITECTURE_LOCK)) reasons.push("ssot_lock_mismatch");
  if (stableStringify(value.kpiSemanticLock) !== stableStringify(KPI_SEMANTIC_LOCK)) reasons.push("kpi_lock_mismatch");
  if (stableStringify(value.targetOverlayLock) !== stableStringify(TARGET_OVERLAY_LOCK)) reasons.push("target_lock_mismatch");
  if (stableStringify(value.platformAdapterModel) !== stableStringify(PLATFORM_ADAPTER_MODEL)) reasons.push("adapter_model_mismatch");

  if (reasons.length > 0) return { status: "invalid", reasons };
  return { status: "valid", state: clone(value as unknown as TmallV1SystemState) };
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
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

const getIndexedDBFactory = (options: SystemStatePersistenceOptions = {}): IDBFactory | null => {
  if (options.indexedDBFactory) return options.indexedDBFactory;
  return typeof indexedDB === "undefined" ? null : indexedDB;
};

const openDatabase = async (
  options: SystemStatePersistenceOptions = {},
): Promise<IDBDatabase | SystemStateUnavailableReason> => {
  const factory = getIndexedDBFactory(options);
  if (!factory) return "indexeddb_unavailable";
  return new Promise((resolve) => {
    const request = factory.open(options.databaseName ?? DEFAULT_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "stateId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve("open_failed");
  });
};

const isUnavailableReason = (
  value: IDBDatabase | SystemStateUnavailableReason,
): value is SystemStateUnavailableReason => typeof value === "string";

export const saveSystemStateSnapshot = async (
  state: TmallV1SystemState,
  options: SystemStatePersistenceOptions = {},
): Promise<SystemStateSaveResult> => {
  const validation = validateSystemState(state);
  if (validation.status !== "valid") return { status: "invalid", reasons: validation.reasons };

  const db = await openDatabase(options);
  if (isUnavailableReason(db)) return { status: "unavailable", reason: db };
  try {
    const transaction = db.transaction(STATE_STORE, "readwrite");
    transaction.objectStore(STATE_STORE).put(clone(validation.state));
    await transactionDone(transaction);
    return { status: "saved", state: validation.state };
  } catch {
    return { status: "unavailable", reason: "write_failed" };
  } finally {
    db.close();
  }
};

export const loadSystemStateSnapshot = async (
  options: SystemStatePersistenceOptions = {},
): Promise<SystemStateLoadResult> => {
  const db = await openDatabase(options);
  if (isUnavailableReason(db)) return { status: "unavailable", reason: db };
  try {
    const transaction = db.transaction(STATE_STORE, "readonly");
    const record = await requestResult<unknown>(transaction.objectStore(STATE_STORE).get(SYSTEM_STATE_ID));
    if (!record) return { status: "empty" };
    const validation = validateSystemState(record);
    if (validation.status !== "valid") return { status: "corrupted", reasons: validation.reasons };
    return { status: "ok", state: validation.state };
  } catch {
    return { status: "unavailable", reason: "read_failed" };
  } finally {
    db.close();
  }
};
