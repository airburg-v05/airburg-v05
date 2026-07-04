import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  type BIDataSet,
  type ETLIssue,
  type ETLRuntimeSummary,
} from "../../lib/etl/runtime";
import {
  clearActiveRuntimeDatasetSnapshot,
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
  restoreRuntimeDatasetFromSnapshot,
  saveRuntimeDatasetSnapshot,
} from "../../lib/persistence/runtime-dataset-persistence";
import { RUNTIME_DATASET_SCHEMA_VERSION } from "../../lib/persistence/runtime-dataset-persistence.types";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

type RequestHandler = (() => void) | null;

interface FakeObjectStoreConfig {
  keyPath: string;
  records: Map<string, unknown>;
}

const checks: Check[] = [];
const ROOT = process.cwd();
const FIXED_NOW = new Date("2026-07-02T00:00:00.000Z");
const DATABASE_NAME = "airburg-runtime-dataset-audit";

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(`${name} failed`);
};

const clone = <T>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;
  onupgradeneeded: RequestHandler = null;

  succeed(value: T) {
    this.result = clone(value);
    setTimeout(() => this.onsuccess?.(), 0);
  }
}

class FakeObjectStore {
  constructor(private readonly config: FakeObjectStoreConfig) {}

  put(value: Record<string, unknown>) {
    const request = new FakeRequest<IDBValidKey>();
    const key = String(value[this.config.keyPath]);
    this.config.records.set(key, clone(value));
    request.succeed(key);
    return request as unknown as IDBRequest<IDBValidKey>;
  }

  get(key: string) {
    const request = new FakeRequest<unknown>();
    request.succeed(this.config.records.get(String(key)));
    return request as unknown as IDBRequest<unknown>;
  }

  getAll() {
    const request = new FakeRequest<unknown[]>();
    request.succeed([...this.config.records.values()].map((record) => clone(record)));
    return request as unknown as IDBRequest<unknown[]>;
  }

  delete(key: string) {
    const request = new FakeRequest<undefined>();
    this.config.records.delete(String(key));
    request.succeed(undefined);
    return request as unknown as IDBRequest<undefined>;
  }
}

class FakeTransaction {
  oncomplete: RequestHandler = null;
  onerror: RequestHandler = null;
  onabort: RequestHandler = null;
  error: Error | null = null;

  constructor(private readonly stores: Map<string, FakeObjectStoreConfig>) {
    setTimeout(() => this.oncomplete?.(), 5);
  }

  objectStore(name: string) {
    const config = this.stores.get(name);
    if (!config) throw new Error(`fake_store_missing:${name}`);
    return new FakeObjectStore(config) as unknown as IDBObjectStore;
  }
}

class FakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  } as DOMStringList;

  constructor(readonly stores: Map<string, FakeObjectStoreConfig>) {}

  createObjectStore(name: string, options: IDBObjectStoreParameters) {
    this.stores.set(name, {
      keyPath: String(options.keyPath),
      records: new Map(),
    });
    return new FakeObjectStore(this.stores.get(name)!) as unknown as IDBObjectStore;
  }

  transaction(storeNames: string | string[]) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    names.forEach((name) => {
      if (!this.stores.has(name)) throw new Error(`fake_store_missing:${name}`);
    });
    return new FakeTransaction(this.stores) as unknown as IDBTransaction;
  }

  close() {}
}

class FakeIndexedDBFactory {
  private readonly databases = new Map<string, FakeDatabase>();

  open(name: string) {
    const request = new FakeRequest<IDBDatabase>();
    let db = this.databases.get(name);
    const isNewDatabase = !db;
    if (!db) {
      db = new FakeDatabase(new Map());
      this.databases.set(name, db);
    }
    request.result = db as unknown as IDBDatabase;
    setTimeout(() => {
      if (isNewDatabase) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request as unknown as IDBOpenDBRequest;
  }

  putRaw(databaseName: string, storeName: string, key: string, value: unknown) {
    const db = this.databases.get(databaseName);
    const store = db?.stores.get(storeName);
    if (!store) throw new Error(`fake_raw_store_missing:${storeName}`);
    store.records.set(key, clone(value));
  }
}

const baseDataSet = (): BIDataSet => ({
  products: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "P1",
      name: "空气堡 P1",
      brandWord: "空气堡",
      modelWord: "P1",
    },
  ],
  productMetrics: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "P1",
      date: "2026-06-26",
      gmv: 100,
      gsv: 90,
      visitors: 20,
      buyers: 2,
    },
  ],
  planMetrics: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "P1",
      date: "2026-06-26",
      spend: 10,
      clicks: 5,
      roi: 2.5,
    },
  ],
  searchTotalKeywords: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      date: "2026-06-26",
      keyword: "空气堡 P1",
      visitors: 8,
      buyers: 1,
      gmv: 80,
    },
  ],
  searchProductKeywords: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      date: "2026-06-26",
      productId: "P1",
      keyword: "空气堡 P1",
      visitors: 5,
      buyers: 1,
    },
  ],
  afterSalesMetrics: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "P1",
      date: "2026-06-26",
      refundAmount: 3,
      refundCount: 1,
      shippedRefundAmount: 2,
      shippedRefundCount: 1,
      signedRefundAmount: null,
      signedRefundCount: null,
    },
  ],
});

const baseIssues = (): ETLIssue[] => [
  {
    level: "warning",
    code: "etl_after_sales_safe_warning",
    message: "raw warning should not persist",
    fileName: "real-private-file.xlsx",
    sheetName: "售后明细",
    rowIndex: 1,
  },
  {
    level: "warning",
    code: "etl_after_sales_safe_warning",
    message: "second raw warning should not persist",
    fileName: "another-private-file.xlsx",
    sheetName: "售后明细",
    rowIndex: 2,
  },
];

const baseSummary = (): Partial<ETLRuntimeSummary> => ({
  filesParsed: 6,
  filesFailed: 1,
  dedupedRecords: 3,
});

const containsForbiddenContent = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return [
    "fileName",
    "filePath",
    "file content",
    "rawRows",
    "previewRows",
    "raw warning should not persist",
    "real-private-file.xlsx",
    "refund-order-id",
    "buyer-phone",
    "technical stack",
    "Error: stack",
  ].some((token) => text.includes(token));
};

const containsDatasetArrayKeys = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsDatasetArrayKeys);
  return Object.entries(value).some(([key, childValue]) => {
    if (
      [
        "dataset",
        "products",
        "productMetrics",
        "planMetrics",
        "searchTotalKeywords",
        "searchProductKeywords",
        "afterSalesMetrics",
      ].includes(key)
    ) {
      return true;
    }
    return containsDatasetArrayKeys(childValue);
  });
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const main = async () => {
  const fakeIndexedDB = new FakeIndexedDBFactory();
  const options = {
    databaseName: DATABASE_NAME,
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
    now: () => FIXED_NOW,
    activeDatasetId: "runtime-audit-1",
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error("localStorage_get_forbidden");
      },
      setItem: () => {
        throw new Error("localStorage_set_forbidden");
      },
    },
  });

  clearRuntimeBIDataSet();

  const saved = await saveRuntimeDatasetSnapshot(baseDataSet(), baseIssues(), baseSummary(), options);
  addCheck("saveReturnsSaved", saved.status === "saved", saved);
  if (saved.status !== "saved") throw new Error("save did not return snapshot");

  const loaded = await loadActiveRuntimeDatasetSnapshot(options);
  addCheck("loadReturnsActiveSnapshot", loaded.status === "ok", loaded);
  if (loaded.status !== "ok") throw new Error("load did not return snapshot");

  addCheck("loadedDatasetEqualsSavedDataset", JSON.stringify(loaded.snapshot.dataset) === JSON.stringify(saved.snapshot.dataset));
  addCheck("activeDatasetIdPersisted", loaded.snapshot.activeDatasetId === "runtime-audit-1");
  addCheck("schemaVersionPersisted", loaded.snapshot.schemaVersion === RUNTIME_DATASET_SCHEMA_VERSION);
  addCheck("dateRangeDerived", loaded.snapshot.dateRange.startDate === "2026-06-26" && loaded.snapshot.dateRange.endDate === "2026-06-26");
  addCheck("importSummaryCountsDerived", loaded.snapshot.importSummary.afterSalesMetricsCount === 1, loaded.snapshot.importSummary);
  addCheck("sourceCoverageDerived", loaded.snapshot.sourceCoverage.after_sales.present, loaded.snapshot.sourceCoverage);
  addCheck("safeIssuesAggregatedWithoutRawFields", loaded.snapshot.safeIssues[0]?.safeCount === 2, loaded.snapshot.safeIssues);
  addCheck("snapshotContainsNoForbiddenContent", !containsForbiddenContent(loaded.snapshot));

  const restored = await restoreRuntimeDatasetFromSnapshot(options);
  addCheck("restoreReturnsRestored", restored.status === "restored", restored);
  const runtimeDataset = getRuntimeBIDataSet();
  addCheck("restorePopulatesRuntimeMemory", runtimeDataset?.productMetrics[0]?.gmv === 100, runtimeDataset);

  const listed = await listRuntimeDatasetSnapshots(options);
  addCheck("listReturnsSafeSummary", listed.status === "ok" && listed.snapshots.length === 1, listed);
  if (listed.status === "ok") {
    addCheck("listDoesNotReturnDatasetArrays", !containsDatasetArrayKeys(listed.snapshots));
    addCheck("listSummaryContainsNoForbiddenContent", !containsForbiddenContent(listed.snapshots));
  }

  const unsafeDataset = baseDataSet() as BIDataSet & {
    products: Array<BIDataSet["products"][number] & { fileName?: string; rawRows?: unknown[] }>;
    productMetrics: Array<BIDataSet["productMetrics"][number] & { previewRows?: unknown[] }>;
  };
  unsafeDataset.products[0] = {
    ...unsafeDataset.products[0],
    fileName: "secret-source.xlsx",
    rawRows: [{ phone: "buyer-phone" }],
  };
  unsafeDataset.productMetrics[0] = {
    ...unsafeDataset.productMetrics[0],
    gmv: Number.NaN,
    previewRows: ["preview should not persist"],
  };
  const unsafeSaved = await saveRuntimeDatasetSnapshot(unsafeDataset, baseIssues(), baseSummary(), {
    ...options,
    activeDatasetId: "runtime-audit-unsafe",
  });
  addCheck("unsafeSaveStillSucceeds", unsafeSaved.status === "saved", unsafeSaved);
  if (unsafeSaved.status === "saved") {
    addCheck("unsafeExtraFieldsSanitized", !containsForbiddenContent(unsafeSaved.snapshot), unsafeSaved.snapshot);
    addCheck("invalidNumberSanitizedToNull", unsafeSaved.snapshot.dataset.productMetrics[0]?.gmv === null);
  }

  fakeIndexedDB.putRaw(DATABASE_NAME, "runtimeDatasetSnapshots", "runtime-corrupted", {
    schemaVersion: 999,
    activeDatasetId: "runtime-corrupted",
    rawRows: ["secret raw content"],
    dataset: { rawRows: ["secret raw content"] },
  });
  fakeIndexedDB.putRaw(DATABASE_NAME, "runtimeDatasetActivePointer", "active", {
    key: "active",
    schemaVersion: RUNTIME_DATASET_SCHEMA_VERSION,
    activeDatasetId: "runtime-corrupted",
    updatedAt: FIXED_NOW.toISOString(),
  });
  const corrupted = await loadActiveRuntimeDatasetSnapshot(options);
  addCheck("corruptedSchemaReturnsCorrupted", corrupted.status === "corrupted", corrupted);
  addCheck("corruptedResultDoesNotRenderRawContent", !JSON.stringify(corrupted).includes("secret raw content"), corrupted);

  const clearResult = await clearActiveRuntimeDatasetSnapshot(options);
  addCheck("clearActiveImplemented", clearResult.status === "cleared", clearResult);
  const afterClear = await loadActiveRuntimeDatasetSnapshot(options);
  addCheck("clearActiveMakesLoadEmpty", afterClear.status === "empty", afterClear);

  const unavailable = await loadActiveRuntimeDatasetSnapshot({ indexedDBFactory: undefined });
  addCheck("missingIndexedDBReturnsUnavailable", unavailable.status === "unavailable", unavailable);

  const adapterSource = read("lib/persistence/runtime-dataset-persistence.ts");
  const typesSource = read("lib/persistence/runtime-dataset-persistence.types.ts");
  const runtimeIndexSource = read("lib/etl/runtime/index.ts");
  addCheck("adapterUsesIndexedDB", adapterSource.includes("indexedDBFactory.open"));
  addCheck("adapterDoesNotUseLocalStorage", !adapterSource.includes("localStorage"));
  addCheck("adapterExportsRequiredApis", [
    "saveRuntimeDatasetSnapshot",
    "loadActiveRuntimeDatasetSnapshot",
    "restoreRuntimeDatasetFromSnapshot",
    "listRuntimeDatasetSnapshots",
    "clearActiveRuntimeDatasetSnapshot",
  ].every((name) => adapterSource.includes(`export const ${name}`)));
  addCheck("typesIncludeRequiredPersistedFields", [
    "schemaVersion",
    "activeDatasetId",
    "createdAt",
    "updatedAt",
    "platformCode",
    "storeId",
    "dateRange",
    "safeIssues",
    "importSummary",
    "sourceCoverage",
  ].every((field) => typesSource.includes(field)));
  addCheck("runtimeIndexExportsAdapter", runtimeIndexSource.includes("saveRuntimeDatasetSnapshot"));

  const forbiddenStatus = gitStatus([
    "lib/storage",
    "lib/tmall",
    "lib/v05",
    "components",
    "app",
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".vercel",
    "private-samples",
  ]);
  addCheck("noForbiddenStorageTmallV05PackageVercelChanges", !/lib\/storage|lib\/tmall|lib\/v05|package\.json|package-lock\.json|vercel\.json|\.vercel|private-samples/.test(forbiddenStatus), forbiddenStatus);

  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({ status: failed.length === 0 ? "PASS" : "FAIL", checks }, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  checks.push({
    name: "unhandledAuditError",
    pass: false,
    details: error instanceof Error ? error.message : String(error),
  });
  console.log(JSON.stringify({ status: "FAIL", checks }, null, 2));
  process.exit(1);
});
