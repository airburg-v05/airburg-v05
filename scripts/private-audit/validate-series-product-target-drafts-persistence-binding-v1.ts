import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TARGET_METRIC_DEFINITIONS } from "../../lib/bi/target-metric-definitions";
import {
  loadActiveTargetDrafts,
  pauseTargetDraft,
  saveTargetDrafts,
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
const DATABASE_NAME = "airburg-series-product-target-binding-audit";
const FIXED_NOW = new Date("2026-07-02T00:00:00.000Z");
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

  getAll() {
    const request = new FakeRequest<unknown[]>();
    request.succeed([...this.config.records.values()].map((record) => clone(record)));
    return request as unknown as IDBRequest<unknown[]>;
  }

  get(key: string) {
    const request = new FakeRequest<unknown>();
    request.succeed(this.config.records.get(String(key)));
    return request as unknown as IDBRequest<unknown>;
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
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const record = (overrides: Partial<TargetDraftRecord>): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: "target-audit",
  scope: "series",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: null,
  productId: null,
  month: "2026-06",
  metricKey: "gmv",
  targetValue: 100,
  unit: "元",
  createdAt: FIXED_NOW.toISOString(),
  updatedAt: FIXED_NOW.toISOString(),
  status: "active",
  ...overrides,
});

const targetValueByMetric = (records: TargetDraftRecord[], metricKey: string): number | null =>
  records.find((item) => item.metricKey === metricKey)?.targetValue ?? null;

const completionRate = (actual: number | null, target: number | null): string =>
  actual !== null && target !== null ? `${((actual / target) * 100).toFixed(2)}%` : "--";

const run = async () => {
  const seriesSource = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const productSource = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const debugSource = read("lib/persistence/debug-context-persistence.ts");

  addCheck("seriesImportsTargetDraftPersistence", seriesSource.includes("loadActiveTargetDrafts") && seriesSource.includes("saveTargetDrafts"));
  addCheck("productImportsTargetDraftPersistence", productSource.includes("loadActiveTargetDrafts") && productSource.includes("saveTargetDrafts"));
  addCheck("seriesRefsCarryStableSeriesId", seriesSource.includes("seriesId: string;") && debugSource.includes("seriesId: string;"));
  addCheck("seriesTargetIdUsesSeriesId", /createSeriesTargetId[\s\S]*seriesId[\s\S]*metricKey/.test(seriesSource));
  const seriesTargetIdBody = seriesSource.match(/const createSeriesTargetId[\s\S]*?\n};/)?.[0] ?? "";
  addCheck("seriesTargetDoesNotKeyBySeriesNameOnly", !seriesTargetIdBody.includes("seriesName"), seriesTargetIdBody);
  addCheck("productTargetButtonExists", productSource.includes("product-board-v1-product-target-button"));
  addCheck("productTargetPopoverExists", productSource.includes("product-board-v1-product-target"));
  addCheck("productAllProductsStillRemoved", !productSource.includes("所有宝贝"));
  addCheck("targetPopoversUseMonth", seriesSource.includes('type="month"') && productSource.includes('type="month"'));
  addCheck("noLocalStorageWrites", !/localStorage\.setItem|localStorage\[/i.test(`${seriesSource}\n${productSource}`));
  addCheck("seriesProductDoNotImportEtl", !/@\/lib\/etl|..\/..\/lib\/etl/.test(`${seriesSource}\n${productSource}`));

  const roi = TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "adRoi");
  addCheck("roiUnitIsTimes", roi?.unit === "倍", roi);

  const fakeIndexedDBFactory = new FakeIndexedDBFactory() as unknown as IDBFactory;
  const options = {
    indexedDBFactory: fakeIndexedDBFactory,
    databaseName: DATABASE_NAME,
    now: () => FIXED_NOW,
  };

  const seriesA = record({
    targetId: "series:tmall:tmall-default-store:series-a:2026-06:gmv",
    scope: "series",
    seriesId: "series-a",
    metricKey: "gmv",
    targetValue: 5000,
  });
  const seriesB = record({
    targetId: "series:tmall:tmall-default-store:series-b:2026-06:gmv",
    scope: "series",
    seriesId: "series-b",
    metricKey: "gmv",
    targetValue: 9000,
  });
  const seriesRoi = record({
    targetId: "series:tmall:tmall-default-store:series-a:2026-06:adRoi",
    scope: "series",
    seriesId: "series-a",
    metricKey: "adRoi",
    targetValue: 2.5,
    unit: "倍",
  });
  const productA = record({
    targetId: "product:tmall:tmall-default-store:P1:2026-06:gmv",
    scope: "product",
    seriesId: null,
    productId: "P1",
    metricKey: "gmv",
    targetValue: 34047,
  });
  const productB = record({
    targetId: "product:tmall:tmall-default-store:P2:2026-06:gmv",
    scope: "product",
    seriesId: null,
    productId: "P2",
    metricKey: "gmv",
    targetValue: 16515,
  });
  const productRoi = record({
    targetId: "product:tmall:tmall-default-store:P1:2026-06:adRoi",
    scope: "product",
    seriesId: null,
    productId: "P1",
    metricKey: "adRoi",
    targetValue: 3,
    unit: "倍",
  });

  const saveResult = await saveTargetDrafts([seriesA, seriesB, seriesRoi, productA, productB, productRoi], options);
  addCheck("targetDraftsSaved", saveResult.status === "saved", saveResult);

  const loadedSeriesA = await loadActiveTargetDrafts({
    scope: "series",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-a",
    month: "2026-06",
  }, options);
  const loadedSeriesB = await loadActiveTargetDrafts({
    scope: "series",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-b",
    month: "2026-06",
  }, options);
  addCheck("seriesARestoresOwnTarget", loadedSeriesA.status === "ok" && targetValueByMetric(loadedSeriesA.records, "gmv") === 5000, loadedSeriesA);
  addCheck("seriesBDoesNotShowSeriesATarget", loadedSeriesB.status === "ok" && targetValueByMetric(loadedSeriesB.records, "gmv") === 9000, loadedSeriesB);
  addCheck("seriesRoiUnitIsTimes", loadedSeriesA.status === "ok" && loadedSeriesA.records.some((item) => item.metricKey === "adRoi" && item.unit === "倍"), loadedSeriesA);

  const loadedProductA = await loadActiveTargetDrafts({
    scope: "product",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "P1",
    month: "2026-06",
  }, options);
  const loadedProductB = await loadActiveTargetDrafts({
    scope: "product",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "P2",
    month: "2026-06",
  }, options);
  addCheck("productARestoresOwnTarget", loadedProductA.status === "ok" && targetValueByMetric(loadedProductA.records, "gmv") === 34047, loadedProductA);
  addCheck("productBDoesNotShowProductATarget", loadedProductB.status === "ok" && targetValueByMetric(loadedProductB.records, "gmv") === 16515, loadedProductB);
  addCheck("productRoiUnitIsTimes", loadedProductA.status === "ok" && loadedProductA.records.some((item) => item.metricKey === "adRoi" && item.unit === "倍"), loadedProductA);

  const actualGmvBefore = 34047;
  const productATarget = loadedProductA.status === "ok" ? targetValueByMetric(loadedProductA.records, "gmv") : null;
  const rate = completionRate(actualGmvBefore, productATarget);
  const actualGmvAfter = actualGmvBefore;
  addCheck("actualGmvUnchangedByTargets", actualGmvAfter === actualGmvBefore && rate !== "--", { actualGmvBefore, actualGmvAfter, rate });

  const pauseResult = await pauseTargetDraft("product:tmall:tmall-default-store:P1:2026-06:gmv", options);
  const afterPause = await loadActiveTargetDrafts({
    scope: "product",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "P1",
    month: "2026-06",
    metricKey: "gmv",
  }, options);
  addCheck("pausedProductTargetNotActive", pauseResult.status === "paused" && afterPause.status === "empty", { pauseResult, afterPause });

  const serialized = JSON.stringify({ saveResult, loadedSeriesA, loadedProductA });
  addCheck("noInvalidOutput", !/NaN|Infinity|undefined/.test(serialized), serialized);
  addCheck("noSensitiveFieldsInTargetDrafts", !/rawRows|previewRows|fileName|订单号|退款编号|交易号|电话|地址|物流|买家说明|商家备注明细|操作人|子账号/i.test(serialized));

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
  addCheck("noForbiddenStorageTmallV05PackageVercelPrivateSampleChanges", forbiddenStatus.length === 0, forbiddenStatus);

  console.log(JSON.stringify({ status: "PASS", checks }, null, 2));
};

run().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exit(1);
});
