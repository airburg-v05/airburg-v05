import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  clearTargetDraftsForScope,
  deleteTargetDraft,
  loadActiveTargetDrafts,
  loadTargetDrafts,
  pauseTargetDraft,
  saveTargetDraft,
  saveTargetDrafts,
  validateTargetDraftRecord,
} from "../../lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftRecord,
} from "../../lib/persistence/target-drafts-persistence.types";

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

const ROOT = process.cwd();
const FIXED_NOW = new Date("2026-07-02T00:00:00.000Z");
const DATABASE_NAME = "airburg-target-drafts-audit";
const checks: Check[] = [];

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

const baseRecord = (overrides: Partial<TargetDraftRecord> = {}): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: "platform-gmv-2026-06",
  scope: "platform",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: null,
  productId: null,
  month: "2026-06",
  metricKey: "gmv",
  targetValue: 100000,
  unit: "元",
  createdAt: FIXED_NOW.toISOString(),
  updatedAt: FIXED_NOW.toISOString(),
  status: "active",
  ...overrides,
});

const containsForbiddenContent = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return [
    "fileName",
    "filePath",
    "file content",
    "rawRows",
    "previewRows",
    "warning 原文",
    "订单号",
    "退款编号",
    "交易号",
    "电话",
    "地址",
    "物流",
    "买家说明",
    "商家备注明细",
    "操作人",
    "子账号",
    "actualValue",
    "runtimeDataset",
    "secret raw content",
  ].some((token) => text.includes(token));
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

  const valid = validateTargetDraftRecord(baseRecord(), options);
  addCheck("validateAcceptsValidRecord", valid.status === "valid", valid);

  const invalidZero = validateTargetDraftRecord(baseRecord({ targetId: "bad-zero", targetValue: 0 }), options);
  addCheck("validateRejectsNonPositiveTargetValue", invalidZero.status === "invalid", invalidZero);

  const invalidUnknownMetric = validateTargetDraftRecord(
    baseRecord({ targetId: "bad-metric", metricKey: "unknownMetric", unit: "元" }),
    options,
  );
  addCheck("validateRejectsUnknownMetricKey", invalidUnknownMetric.status === "invalid", invalidUnknownMetric);

  const invalidRoiUnit = validateTargetDraftRecord(
    baseRecord({ targetId: "bad-roi", metricKey: "adRoi", targetValue: 2.5, unit: "%" }),
    options,
  );
  addCheck("validateRejectsRoiPercentUnit", invalidRoiUnit.status === "invalid", invalidRoiUnit);

  const invalidScopeMetric = validateTargetDraftRecord(
    baseRecord({
      targetId: "series-turnover",
      scope: "series",
      seriesId: "series-a",
      metricKey: "mtdTurnover",
      targetValue: 10,
      unit: "天",
    }),
    options,
  );
  addCheck("validateRejectsUnsupportedMetricScope", invalidScopeMetric.status === "invalid", invalidScopeMetric);

  const saved = await saveTargetDraft(baseRecord(), options);
  addCheck("saveTargetDraftReturnsSaved", saved.status === "saved", saved);

  const loadedPlatform = await loadTargetDrafts({ scope: "platform", month: "2026-06", metricKey: "gmv" }, options);
  addCheck("loadTargetDraftsByScopeMonthMetric", loadedPlatform.status === "ok" && loadedPlatform.records.length === 1, loadedPlatform);

  const bulk = await saveTargetDrafts(
    [
      baseRecord({
        targetId: "platform-roi-2026-06",
        metricKey: "adRoi",
        targetValue: 2.8,
        unit: "倍",
      }),
      baseRecord({
        targetId: "series-gsv-a-2026-06",
        scope: "series",
        seriesId: "series-a",
        metricKey: "gsv",
        targetValue: 60000,
        unit: "元",
      }),
      baseRecord({
        targetId: "product-cpc-p1-2026-06",
        scope: "product",
        productId: "P1",
        metricKey: "cpc",
        targetValue: 1.2,
        unit: "元",
      }),
    ],
    options,
  );
  addCheck("saveTargetDraftsReturnsSaved", bulk.status === "saved", bulk);

  const loadedSeries = await loadTargetDrafts({ scope: "series", seriesId: "series-a", month: "2026-06" }, options);
  addCheck("loadTargetDraftsFiltersSeries", loadedSeries.status === "ok" && loadedSeries.records[0]?.targetId === "series-gsv-a-2026-06", loadedSeries);

  const loadedProduct = await loadTargetDrafts({ scope: "product", productId: "P1", metricKey: "cpc" }, options);
  addCheck("loadTargetDraftsFiltersProduct", loadedProduct.status === "ok" && loadedProduct.records[0]?.targetId === "product-cpc-p1-2026-06", loadedProduct);

  const pauseResult = await pauseTargetDraft("platform-gmv-2026-06", options);
  addCheck("pauseTargetDraftReturnsPaused", pauseResult.status === "paused", pauseResult);

  const activeAfterPause = await loadActiveTargetDrafts({ scope: "platform", metricKey: "gmv" }, options);
  addCheck("pausedDraftExcludedFromActiveResults", activeAfterPause.status === "empty", activeAfterPause);

  const deleteResult = await deleteTargetDraft("platform-roi-2026-06", options);
  addCheck("deleteTargetDraftAdapterOnlyImplemented", deleteResult.status === "deleted", deleteResult);
  const afterDelete = await loadTargetDrafts({ scope: "platform", metricKey: "adRoi" }, options);
  addCheck("deleteTargetDraftRemovesRecord", afterDelete.status === "empty", afterDelete);

  const clearResult = await clearTargetDraftsForScope({ scope: "series", month: "2026-06" }, options);
  addCheck("clearTargetDraftsForScopeAdapterOnlyImplemented", clearResult.status === "cleared" && clearResult.count === 1, clearResult);
  const afterClear = await loadTargetDrafts({ scope: "series", month: "2026-06" }, options);
  addCheck("clearTargetDraftsForScopeRemovesMatchingRecords", afterClear.status === "empty", afterClear);

  addCheck("persistedRecordsContainNoForbiddenContent", !containsForbiddenContent([loadedPlatform, loadedProduct]));

  fakeIndexedDB.putRaw(DATABASE_NAME, "targetDrafts", "corrupted-target", {
    ...baseRecord({ targetId: "corrupted-target" }),
    schemaVersion: 999,
    rawRows: ["secret raw content"],
  });
  const corrupted = await loadTargetDrafts({}, options);
  addCheck("corruptedSchemaReturnsCorrupted", corrupted.status === "corrupted", corrupted);
  addCheck("corruptedResultDoesNotRenderRawContent", !JSON.stringify(corrupted).includes("secret raw content"), corrupted);

  const unavailable = await loadTargetDrafts({}, { indexedDBFactory: undefined });
  addCheck("missingIndexedDBReturnsUnavailable", unavailable.status === "unavailable", unavailable);

  const adapterSource = read("lib/persistence/target-drafts-persistence.ts");
  const typesSource = read("lib/persistence/target-drafts-persistence.types.ts");
  addCheck("adapterUsesIndexedDB", adapterSource.includes("indexedDBFactory.open"));
  addCheck("adapterDoesNotUseLocalStorage", !adapterSource.includes("localStorage"));
  addCheck("adapterDoesNotTouchRuntimeDataset", !adapterSource.includes("RuntimeDataset") && !adapterSource.includes("setRuntimeBIDataSet"));
  addCheck("adapterExportsRequiredApis", [
    "saveTargetDraft",
    "saveTargetDrafts",
    "loadTargetDrafts",
    "loadActiveTargetDrafts",
    "deleteTargetDraft",
    "pauseTargetDraft",
    "clearTargetDraftsForScope",
    "validateTargetDraftRecord",
  ].every((name) => adapterSource.includes(`export const ${name}`)));
  addCheck("typesIncludeRequiredTargetDraftFields", [
    "schemaVersion",
    "targetId",
    "scope",
    "platformCode",
    "storeId",
    "seriesId",
    "productId",
    "month",
    "metricKey",
    "targetValue",
    "unit",
    "createdAt",
    "updatedAt",
    "status",
  ].every((field) => typesSource.includes(field)));
  addCheck("typesDoNotContainForbiddenFields", !containsForbiddenContent(typesSource));

  const forbiddenStatus = gitStatus([
    "lib/storage",
    "lib/tmall",
    "lib/v05",
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".vercel",
    "private-samples",
  ]);
  addCheck("noForbiddenStorageTmallV05PackageVercelPrivateSampleChanges", !forbiddenStatus, forbiddenStatus);

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
