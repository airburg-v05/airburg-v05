import type { BITimeRange, UIState } from "../bi/bi.types";
import type { BrandModelFilter, CenterWordGroup } from "../bi/search-keyword.types";

export const DEBUG_CONTEXT_SCHEMA_VERSION = 1;

const DEFAULT_DATABASE_NAME = "airburg-debug-context-v1";
const DATABASE_VERSION = 1;
const CONTEXT_STORE = "debugContext";
const ACTIVE_CONTEXT_KEY = "active";

export type DebugChartMode = "mtd" | "dly";
export type DebugContextPageKey = "home" | "series" | "product";

export interface DebugContextTempSeriesItem {
  id: string;
  seriesId: string;
  seriesName: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  remark: string;
  source: "temp";
}

export interface DebugContextTempProductItem {
  id: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
}

export interface DebugContextPageState {
  selectedMetric: string | null;
  chartMode: DebugChartMode;
}

export interface DebugContextSeriesPageState extends DebugContextPageState {
  currentSeriesName: string | null;
  temporarySeriesProductIds: DebugContextTempSeriesItem[];
}

export interface DebugContextProductPageState extends DebugContextPageState {
  currentProductKey: string | null;
  temporaryTrackedProducts: DebugContextTempProductItem[];
}

export interface CrossPageDebugContextSnapshot {
  schemaVersion: typeof DEBUG_CONTEXT_SCHEMA_VERSION;
  contextId: typeof ACTIVE_CONTEXT_KEY;
  createdAt: string;
  updatedAt: string;
  selectedPlatform: string | null;
  selectedStores: string[];
  timeRange: BITimeRange | null;
  brandModelFilter: BrandModelFilter;
  centerWordGroups: CenterWordGroup[];
  selectedMetric: string | null;
  chartMode: DebugChartMode;
  pages: {
    home: DebugContextPageState;
    series: DebugContextSeriesPageState;
    product: DebugContextProductPageState;
  };
}

export interface CrossPageDebugContextPatch {
  selectedPlatform?: string | null;
  selectedStores?: string[];
  timeRange?: BITimeRange | null;
  brandModelFilter?: BrandModelFilter;
  centerWordGroups?: CenterWordGroup[];
  selectedMetric?: string | null;
  chartMode?: DebugChartMode;
  pages?: Partial<{
    home: Partial<DebugContextPageState>;
    series: Partial<DebugContextSeriesPageState>;
    product: Partial<DebugContextProductPageState>;
  }>;
}

export interface DebugContextPersistenceOptions {
  indexedDBFactory?: IDBFactory;
  databaseName?: string;
  now?: () => Date;
}

export type DebugContextUnavailableReason =
  | "indexeddb_unavailable"
  | "snapshot_schema_incompatible"
  | "persistence_error";

export type DebugContextLoadResult =
  | { status: "ok"; snapshot: CrossPageDebugContextSnapshot }
  | { status: "empty" }
  | { status: "corrupted"; reason: DebugContextUnavailableReason }
  | { status: "unavailable"; reason: DebugContextUnavailableReason };

export type DebugContextSaveResult =
  | { status: "saved"; snapshot: CrossPageDebugContextSnapshot }
  | { status: "unavailable"; reason: DebugContextUnavailableReason };

const forbiddenTextTokens = [
  "rawRows",
  "previewRows",
  "fileName",
  "filePath",
  "file content",
  "warning 原文",
  "订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注明细",
  "操作人",
  "子账号",
  "technical stack",
  "stack trace",
];

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const containsForbiddenToken = (value: string): boolean =>
  forbiddenTextTokens.some((token) => value.toLowerCase().includes(token.toLowerCase()));

const safeString = (value: unknown, maxLength = 160): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || containsForbiddenToken(normalized)) return null;
  return normalized.slice(0, maxLength);
};

const safeStringList = (values: unknown, maxItems = 80): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => safeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, maxItems);
};

const safeStoreId = (value: unknown): string | null => {
  const text = safeString(value);
  if (!text) return null;
  if (text.includes("::")) {
    const [, storeId] = text.split("::");
    return safeString(storeId);
  }
  return text;
};

export const normalizeDebugSelectedStores = (values: string[]): string[] =>
  Array.from(
    new Set(
      values
        .map((value) => safeStoreId(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );

const safeMetric = (value: unknown, fallback: string | null): string | null => safeString(value, 80) ?? fallback;

const safeChartMode = (value: unknown, fallback: DebugChartMode = "mtd"): DebugChartMode =>
  value === "dly" || value === "mtd" ? value : fallback;

const safeTimeRange = (value: unknown): BITimeRange | null => {
  if (!isObjectRecord(value)) return null;
  const mode = value.mode === "day" || value.mode === "week" || value.mode === "month" || value.mode === "custom"
    ? value.mode
    : null;
  if (!mode) return null;
  return {
    mode,
    startDate: safeString(value.startDate, 10),
    endDate: safeString(value.endDate, 10),
  };
};

const safeCenterWordGroups = (values: unknown): CenterWordGroup[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value, index) => {
      if (!isObjectRecord(value)) return null;
      const centerWord = safeString(value.centerWord, 80);
      if (!centerWord) return null;
      const aliases = safeStringList(value.aliases, 40);
      return {
        id: safeString(value.id, 120) ?? `center-${centerWord}-${index}`,
        centerWord,
        aliases: aliases.length > 0 ? aliases : [centerWord],
      };
    })
    .filter((value): value is CenterWordGroup => Boolean(value))
    .slice(0, 50);
};

const safeBrandModelFilter = (value: unknown): BrandModelFilter => {
  const source = isObjectRecord(value) ? value : {};
  const centerWordGroups = safeCenterWordGroups(source.centerWordGroups);
  return {
    brandWords: safeStringList(source.brandWords, 80),
    modelWords: safeStringList(source.modelWords, 80),
    centerWordGroups,
  };
};

const emptyBrandModelFilter = (): BrandModelFilter => ({
  brandWords: [],
  modelWords: [],
  centerWordGroups: [],
});

const safeSeriesItems = (values: unknown): DebugContextTempSeriesItem[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value, index) => {
      if (!isObjectRecord(value)) return null;
      const productId = safeString(value.productId);
      const seriesName = safeString(value.seriesName);
      const storeId = safeString(value.storeId);
      if (!productId || !seriesName || !storeId) return null;
      const id = safeString(value.id, 180) ?? `debug-series-${seriesName}-${productId}-${index}`;
      return {
        id,
        seriesId: safeString(value.seriesId, 180) ?? id,
        seriesName,
        platformCode: safeString(value.platformCode, 60) ?? "tmall",
        platformName: safeString(value.platformName, 80) ?? "天猫",
        storeId,
        storeName: safeString(value.storeName, 120) ?? storeId,
        productId,
        remark: safeString(value.remark, 160) ?? "",
        source: "temp" as const,
      };
    })
    .filter((value): value is DebugContextTempSeriesItem => Boolean(value))
    .slice(0, 120);
};

const safeProductItems = (values: unknown): DebugContextTempProductItem[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value, index) => {
      if (!isObjectRecord(value)) return null;
      const productId = safeString(value.productId);
      const storeId = safeString(value.storeId);
      if (!productId || !storeId) return null;
      return {
        id: safeString(value.id, 180) ?? `debug-product-${storeId}-${productId}-${index}`,
        platformCode: safeString(value.platformCode, 60) ?? "tmall",
        platformName: safeString(value.platformName, 80) ?? "天猫",
        storeId,
        storeName: safeString(value.storeName, 120) ?? storeId,
        productId,
        productName: safeString(value.productName, 160) ?? productId,
      };
    })
    .filter((value): value is DebugContextTempProductItem => Boolean(value))
    .slice(0, 120);
};

const emptyPageState = (selectedMetric: string | null = null): DebugContextPageState => ({
  selectedMetric,
  chartMode: "mtd",
});

const emptySnapshot = (now: Date): CrossPageDebugContextSnapshot => ({
  schemaVersion: DEBUG_CONTEXT_SCHEMA_VERSION,
  contextId: ACTIVE_CONTEXT_KEY,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  selectedPlatform: null,
  selectedStores: [],
  timeRange: null,
  brandModelFilter: emptyBrandModelFilter(),
  centerWordGroups: [],
  selectedMetric: null,
  chartMode: "mtd",
  pages: {
    home: emptyPageState("GMV"),
    series: {
      ...emptyPageState("seriesGmv"),
      currentSeriesName: null,
      temporarySeriesProductIds: [],
    },
    product: {
      ...emptyPageState("productGmv"),
      currentProductKey: null,
      temporaryTrackedProducts: [],
    },
  },
});

const sanitizeSnapshot = (value: unknown): CrossPageDebugContextSnapshot | null => {
  if (!isObjectRecord(value) || value.schemaVersion !== DEBUG_CONTEXT_SCHEMA_VERSION) return null;
  const now = new Date();
  const sourcePages = isObjectRecord(value.pages) ? value.pages : {};
  const homePage = isObjectRecord(sourcePages.home) ? sourcePages.home : {};
  const seriesPage = isObjectRecord(sourcePages.series) ? sourcePages.series : {};
  const productPage = isObjectRecord(sourcePages.product) ? sourcePages.product : {};
  const brandModelFilter = safeBrandModelFilter(value.brandModelFilter);
  const centerWordGroups = safeCenterWordGroups(value.centerWordGroups ?? brandModelFilter.centerWordGroups);

  return {
    schemaVersion: DEBUG_CONTEXT_SCHEMA_VERSION,
    contextId: ACTIVE_CONTEXT_KEY,
    createdAt: safeString(value.createdAt, 40) ?? now.toISOString(),
    updatedAt: safeString(value.updatedAt, 40) ?? now.toISOString(),
    selectedPlatform: safeString(value.selectedPlatform, 60),
    selectedStores: normalizeDebugSelectedStores(safeStringList(value.selectedStores, 80)),
    timeRange: safeTimeRange(value.timeRange),
    brandModelFilter: {
      ...brandModelFilter,
      centerWordGroups,
      modelWords: brandModelFilter.modelWords.length > 0 ? brandModelFilter.modelWords : centerWordGroups.map((group) => group.centerWord),
    },
    centerWordGroups,
    selectedMetric: safeMetric(value.selectedMetric, null),
    chartMode: safeChartMode(value.chartMode),
    pages: {
      home: {
        selectedMetric: safeMetric(homePage.selectedMetric, "GMV"),
        chartMode: safeChartMode(homePage.chartMode),
      },
      series: {
        selectedMetric: safeMetric(seriesPage.selectedMetric, "seriesGmv"),
        chartMode: safeChartMode(seriesPage.chartMode),
        currentSeriesName: safeString(seriesPage.currentSeriesName, 120),
        temporarySeriesProductIds: safeSeriesItems(seriesPage.temporarySeriesProductIds),
      },
      product: {
        selectedMetric: safeMetric(productPage.selectedMetric, "productGmv"),
        chartMode: safeChartMode(productPage.chartMode),
        currentProductKey: safeString(productPage.currentProductKey, 180),
        temporaryTrackedProducts: safeProductItems(productPage.temporaryTrackedProducts),
      },
    },
  };
};

const mergePatch = (
  current: CrossPageDebugContextSnapshot,
  patch: CrossPageDebugContextPatch,
  now: Date,
): CrossPageDebugContextSnapshot => {
  const nextBrandModelFilter = patch.brandModelFilter
    ? safeBrandModelFilter(patch.brandModelFilter)
    : current.brandModelFilter;
  const nextCenterWordGroups = safeCenterWordGroups(
    patch.centerWordGroups ?? nextBrandModelFilter.centerWordGroups ?? current.centerWordGroups,
  );

  return sanitizeSnapshot({
    ...current,
    updatedAt: now.toISOString(),
    selectedPlatform:
      Object.prototype.hasOwnProperty.call(patch, "selectedPlatform")
        ? safeString(patch.selectedPlatform, 60)
        : current.selectedPlatform,
    selectedStores: patch.selectedStores ? normalizeDebugSelectedStores(patch.selectedStores) : current.selectedStores,
    timeRange: Object.prototype.hasOwnProperty.call(patch, "timeRange") ? safeTimeRange(patch.timeRange) : current.timeRange,
    brandModelFilter: {
      ...nextBrandModelFilter,
      centerWordGroups: nextCenterWordGroups,
      modelWords: nextBrandModelFilter.modelWords.length > 0 ? nextBrandModelFilter.modelWords : nextCenterWordGroups.map((group) => group.centerWord),
    },
    centerWordGroups: nextCenterWordGroups,
    selectedMetric: Object.prototype.hasOwnProperty.call(patch, "selectedMetric")
      ? safeMetric(patch.selectedMetric, current.selectedMetric)
      : current.selectedMetric,
    chartMode: patch.chartMode ? safeChartMode(patch.chartMode, current.chartMode) : current.chartMode,
    pages: {
      home: {
        ...current.pages.home,
        ...(patch.pages?.home ?? {}),
      },
      series: {
        ...current.pages.series,
        ...(patch.pages?.series ?? {}),
      },
      product: {
        ...current.pages.product,
        ...(patch.pages?.product ?? {}),
      },
    },
  }) ?? emptySnapshot(now);
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

const getIndexedDBFactory = (options: DebugContextPersistenceOptions = {}): IDBFactory | null => {
  if (options.indexedDBFactory) return options.indexedDBFactory;
  return typeof indexedDB === "undefined" ? null : indexedDB;
};

const openDatabase = (options: DebugContextPersistenceOptions = {}): Promise<IDBDatabase | null> => {
  const factory = getIndexedDBFactory(options);
  if (!factory) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = factory.open(options.databaseName ?? DEFAULT_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONTEXT_STORE)) {
        db.createObjectStore(CONTEXT_STORE, { keyPath: "contextId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
};

export const loadCrossPageDebugContext = async (
  options: DebugContextPersistenceOptions = {},
): Promise<DebugContextLoadResult> => {
  try {
    const db = await openDatabase(options);
    if (!db) return { status: "unavailable", reason: "indexeddb_unavailable" };
    try {
      const transaction = db.transaction(CONTEXT_STORE, "readonly");
      const record = await requestResult<unknown>(transaction.objectStore(CONTEXT_STORE).get(ACTIVE_CONTEXT_KEY));
      if (!record) return { status: "empty" };
      const snapshot = sanitizeSnapshot(record);
      if (!snapshot) return { status: "corrupted", reason: "snapshot_schema_incompatible" };
      return { status: "ok", snapshot };
    } finally {
      db.close();
    }
  } catch {
    return { status: "unavailable", reason: "persistence_error" };
  }
};

export const saveCrossPageDebugContextPatch = async (
  patch: CrossPageDebugContextPatch,
  options: DebugContextPersistenceOptions = {},
): Promise<DebugContextSaveResult> => {
  try {
    const db = await openDatabase(options);
    if (!db) return { status: "unavailable", reason: "indexeddb_unavailable" };
    try {
      const now = options.now?.() ?? new Date();
      const currentResult = await loadCrossPageDebugContext(options);
      const current = currentResult.status === "ok" ? currentResult.snapshot : emptySnapshot(now);
      const snapshot = mergePatch(current, patch, now);
      const transaction = db.transaction(CONTEXT_STORE, "readwrite");
      transaction.objectStore(CONTEXT_STORE).put(clone(snapshot));
      await transactionDone(transaction);
      return { status: "saved", snapshot };
    } finally {
      db.close();
    }
  } catch {
    return { status: "unavailable", reason: "persistence_error" };
  }
};

export const mergeDebugContextIntoUIState = (
  state: UIState,
  snapshot: CrossPageDebugContextSnapshot,
  page: DebugContextPageKey,
): UIState => {
  const pageState = snapshot.pages[page];
  return {
    ...state,
    selectedPlatform: snapshot.selectedPlatform,
    selectedStores: snapshot.selectedStores.length > 0 ? [...snapshot.selectedStores] : state.selectedStores,
    timeRange: snapshot.timeRange ? { ...snapshot.timeRange } : state.timeRange,
    selectedMetric: pageState.selectedMetric ?? snapshot.selectedMetric ?? state.selectedMetric,
    brandModelFilter: {
      ...snapshot.brandModelFilter,
      brandWords: [...snapshot.brandModelFilter.brandWords],
      modelWords: [...snapshot.brandModelFilter.modelWords],
      centerWordGroups: [...(snapshot.brandModelFilter.centerWordGroups ?? [])],
    },
  };
};
