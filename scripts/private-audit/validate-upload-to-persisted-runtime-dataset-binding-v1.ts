import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import {
  clearRuntimeBIDataSet,
  saveRuntimeDatasetSnapshot,
  setRuntimeBIDataSet,
  type BIDataSet,
  type ETLIssue,
  type ETLRuntimeSummary,
} from "../../lib/etl/runtime";

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
const FIXED_NOW = new Date("2026-07-02T08:00:00.000Z");
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
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const gitDiffNames = (paths: string[]): string =>
  execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const dataSet = (): BIDataSet => ({
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
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "P2",
      name: "空气堡 P2",
      brandWord: "空气堡",
      modelWord: "P2",
    },
  ],
  productMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", gmv: 34047, gsv: 30000, visitors: 100, buyers: 10 },
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P2", date: "2026-06-27", gmv: 16515, gsv: 15000, visitors: 80, buyers: 8 },
  ],
  planMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", spend: 100, clicks: 20, roi: 2 },
  ],
  searchTotalKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-26", keyword: "空气堡 P1", visitors: 20, buyers: 2, gmv: 200 },
  ],
  searchProductKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-26", productId: "P1", keyword: "空气堡 P1", visitors: 10, buyers: 1 },
  ],
  afterSalesMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", refundAmount: 30, refundCount: 1, shippedRefundAmount: 20, shippedRefundCount: 1, signedRefundAmount: null, signedRefundCount: null },
  ],
});

const issues = (): ETLIssue[] => [
  {
    level: "warning",
    code: "etl_after_sales_safe_warning",
    message: "raw warning must not persist",
    fileName: "secret-upload.xlsx",
    sheetName: "售后明细",
    rowIndex: 1,
  },
];

const summary = (): Partial<ETLRuntimeSummary> => ({
  filesParsed: 18,
  filesFailed: 0,
  dedupedRecords: 5,
});

const hasForbiddenPersistedText = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return [
    "secret-upload.xlsx",
    "raw warning must not persist",
    "rawRows",
    "previewRows",
    "fileName",
    "filePath",
    "订单号",
    "退款编号",
    "电话",
    "地址",
    "technical stack",
  ].some((token) => text.includes(token));
};

const main = async () => {
  const fakeIndexedDB = new FakeIndexedDBFactory();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDB,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error("localStorage_set_forbidden");
      },
    },
  });

  const uploadSource = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const dataSourceSource = read("lib/bi/bi.data-source.ts");
  const adapterSource = read("lib/persistence/runtime-dataset-persistence.ts");
  const seriesBoardSource = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const productBoardSource = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("uploadImportsSafeSnapshotSave", uploadSource.includes("saveRuntimeDatasetSnapshot"));
  addCheck("uploadSavesAfterRunETLRuntime", /runETLRuntime\([\s\S]*saveRuntimeDatasetSnapshot/.test(uploadSource));
  addCheck(
    "uploadShowsPersistenceSuccessMessage",
    uploadSource.includes("已保存本次安全聚合数据") &&
      uploadSource.includes("刷新页面后可继续查看") &&
      uploadSource.includes("不会保存原始 Excel / CSV"),
  );
  addCheck("uploadNoLongerClaimsMemoryOnly", !uploadSource.includes("只在当前浏览器内存中进行，不写入本地存储"));
  addCheck("dataSourceImportsRestore", dataSourceSource.includes("restoreRuntimeDatasetFromSnapshot"));
  addCheck("dataSourceMemoryFirst", dataSourceSource.indexOf("getRuntimeBIDataSet()") < dataSourceSource.indexOf("restoreRuntimeDatasetFromSnapshot()"));
  addCheck("dataSourceRestoredLabel", dataSourceSource.includes("已恢复上次安全聚合数据"));
  addCheck("seriesBoardUsesSameDataSource", seriesBoardSource.includes("loadHomeBIDataSource()"));
  addCheck("productBoardUsesSameDataSource", productBoardSource.includes("loadHomeBIDataSource()"));
  addCheck(
    "seriesAndProductShowRestoredDataStatus",
    seriesBoardSource.includes("dataSource.dataStatus.label") && productBoardSource.includes("dataSource.dataStatus.label"),
  );
  addCheck("uploadAndDataSourceDoNotWriteLocalStorage", !/localStorage\\.setItem/.test(`${uploadSource}\n${dataSourceSource}`));
  addCheck("adapterDoesNotUseLocalStorage", !adapterSource.includes("localStorage"));

  const saved = await saveRuntimeDatasetSnapshot(dataSet(), issues(), summary(), {
    activeDatasetId: "runtime-binding-audit",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
    now: () => FIXED_NOW,
  });
  addCheck("safeSnapshotCanBeSavedForBinding", saved.status === "saved", saved);
  addCheck("savedSnapshotHasNoForbiddenText", !hasForbiddenPersistedText(saved), saved);

  setRuntimeBIDataSet(dataSet(), issues());
  const memorySource = await loadHomeBIDataSource();
  addCheck("homePrefersMemoryRuntime", memorySource.dataStatus.label === "ETL运行时数据", memorySource.dataStatus);

  clearRuntimeBIDataSet();
  const restoredSource = await loadHomeBIDataSource();
  addCheck("homeRestoresPersistedSnapshotWhenMemoryMissing", restoredSource.dataStatus.label === "已恢复上次安全聚合数据", restoredSource.dataStatus);
  addCheck("restoredHomeHasPoints", restoredSource.points.length >= 4, { points: restoredSource.points.length });
  addCheck("restoredHomeKeepsSearchKeywords", restoredSource.searchTotalKeywords.length === 1 && restoredSource.searchProductKeywords.length === 1);
  addCheck("restoredHomeHasAfterSalesMetric", restoredSource.points.some((point) => point.metrics.refundAmount === 30));
  addCheck("restoredSourceHasNoInvalidText", !/NaN|Infinity|undefined/.test(JSON.stringify(restoredSource)));
  addCheck("restoredSourceHasNoSensitiveText", !hasForbiddenPersistedText(restoredSource));

  const hardForbiddenStatus = gitStatus([
    "lib/storage",
    "lib/tmall",
    "lib/v05",
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".vercel",
    "private-samples",
  ]);
  const metricContractDiff = gitDiffNames([
    "lib/etl/runtime/pipeline.ts",
    "lib/etl/runtime/file-router.ts",
    "lib/etl/parse-excel.ts",
    "lib/bi/brand-model-semantic.ts",
    "lib/bi/bi.home-mapper.ts",
  ]);
  addCheck("noHardForbiddenPathsChanged", hardForbiddenStatus.length === 0, hardForbiddenStatus);
  addCheck("noMetricContractFilesChangedByThisTask", metricContractDiff.length === 0, metricContractDiff);

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
