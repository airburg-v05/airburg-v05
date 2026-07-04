import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  saveRuntimeDatasetSnapshot,
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
} from "../../lib/persistence/runtime-dataset-persistence";
import type { BIDataSet, ETLIssue, ETLRuntimeSummary } from "../../lib/etl/runtime";

type RequestHandler = (() => void) | null;

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface FakeObjectStoreConfig {
  keyPath: string;
  records: Map<string, unknown>;
}

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-history-quality-readonly-audit";
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(`${name} failed`);
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const git = (args: string[]): string =>
  execFileSync("git", args, {
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

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const allowedPatterns = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "components/upload/v1/**",
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const forbiddenDiffPaths = [
  "lib/storage",
  "lib/tmall",
  "lib/v05",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel",
  "private-samples",
  "next-env.d.ts",
];

const forbiddenVisibleTokens = [
  "删除",
  "回滚",
  "重新导入",
  "rawRows",
  "previewRows",
  "warning 原文",
  "文件名",
  "fileName",
  "filePath",
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
  "技术错误堆栈",
];

const dataset = (): BIDataSet => ({
  products: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", name: "空气堡 P1", brandWord: "空气堡", modelWord: "P1" },
  ],
  productMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", gmv: 100, gsv: 90, visitors: 20, buyers: 2 },
  ],
  planMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", spend: 10, clicks: 5, roi: 2.5 },
  ],
  searchTotalKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-26", keyword: "空气堡 P1", visitors: 8, buyers: 1, gmv: 80 },
  ],
  searchProductKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-26", productId: "P1", keyword: "空气堡 P1", visitors: 5, buyers: 1 },
  ],
  afterSalesMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", productId: "P1", date: "2026-06-26", refundAmount: 3, refundCount: 1, shippedRefundAmount: 2, shippedRefundCount: 1, signedRefundAmount: null, signedRefundCount: null },
  ],
});

const issues = (): ETLIssue[] => [
  {
    level: "warning",
    code: "unsupported_plan_summary",
    message: "private raw warning must not surface",
    fileName: "real-secret.xlsx",
    sheetName: "计划汇总",
    rowIndex: 1,
  },
  {
    level: "warning",
    code: "plan_summary_without_product_id",
    message: "private row content must not surface",
    fileName: "real-secret.csv",
    sheetName: "计划汇总",
    rowIndex: 2,
  },
];

const summary = (): Partial<ETLRuntimeSummary> => ({
  filesParsed: 18,
  filesFailed: 1,
  dedupedRecords: 6,
});

const hasForbiddenText = (value: unknown): boolean => forbiddenVisibleTokens.some((token) => JSON.stringify(value).includes(token));

const staticChecks = () => {
  const history = read("components/upload/history/v1/history-data-v1-dashboard.tsx");
  const quality = read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");

  addCheck("historyLoadsPersistedSnapshots", history.includes("listRuntimeDatasetSnapshots") && history.includes("loadActiveRuntimeDatasetSnapshot"));
  addCheck("historyDisplaysRequiredSnapshotFields",
    [
      "activeDatasetId",
      "importBatchId",
      "createdAt",
      "updatedAt",
      "platformCode / storeId",
      "dateRange",
      "sourceCoverage",
      "productMetricsCount",
      "planMetricsCount",
      "searchTotalKeywordsCount",
      "searchProductKeywordsCount",
      "afterSalesMetricsCount",
      "issueCodes",
      "status：",
    ].every((token) => history.includes(token)),
  );
  addCheck("qualityLoadsActiveSnapshot", quality.includes("loadActiveRuntimeDatasetSnapshot") && quality.includes("buildRuntimeSnapshotIssues"));
  addCheck("qualityDisplaysRequiredIssueKinds",
    [
      "missing_file",
      "duplicate_file",
      "unsupported_plan_summary",
      "plan_summary_without_product_id",
      "after_sales_safe_aggregate",
      "runtime:schema-corrupted",
    ].every((token) => quality.includes(token)),
  );
  addCheck("historyQualityRemainReadonly", !/(onClick=.*(?:clear|delete|rollback|overwrite)|clearActiveRuntimeDatasetSnapshot|saveRuntimeDatasetSnapshot)/.test(`${history}\n${quality}`));
  addCheck("historyQualityExposeNoOverwriteAction", !/覆盖操作|强制覆盖|执行覆盖/.test(`${history}\n${quality}`));
  addCheck("historyQualityDoNotExposeForbiddenVisibleTokens", !hasForbiddenText({ history, quality }));
};

const persistenceChecks = async () => {
  const fakeIndexedDB = new FakeIndexedDBFactory();
  const saveResult = await saveRuntimeDatasetSnapshot(dataset(), issues(), summary(), {
    databaseName: DATABASE_NAME,
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
    activeDatasetId: "runtime-history-quality-001",
    now: () => new Date("2026-07-02T08:00:00.000Z"),
  });
  addCheck("snapshotSaved", saveResult.status === "saved", saveResult);
  if (saveResult.status !== "saved") return;

  const activeResult = await loadActiveRuntimeDatasetSnapshot({
    databaseName: DATABASE_NAME,
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
  });
  const listResult = await listRuntimeDatasetSnapshots({
    databaseName: DATABASE_NAME,
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
  });

  addCheck("historyCanReadActiveSnapshot", activeResult.status === "ok" && activeResult.snapshot.activeDatasetId === "runtime-history-quality-001", activeResult);
  addCheck("historyCanListSnapshotsAfterRefresh", listResult.status === "ok" && listResult.snapshots.length === 1, listResult);
  if (activeResult.status === "ok") {
    const snapshot = activeResult.snapshot;
    addCheck("snapshotCountsAvailable",
      snapshot.importSummary.productMetricsCount === 1 &&
      snapshot.importSummary.planMetricsCount === 1 &&
      snapshot.importSummary.searchTotalKeywordsCount === 1 &&
      snapshot.importSummary.searchProductKeywordsCount === 1 &&
      snapshot.importSummary.afterSalesMetricsCount === 1,
      snapshot.importSummary,
    );
    addCheck("qualityIssueCodesAvailable",
      snapshot.safeIssues.some((issue) => issue.code === "unsupported_plan_summary") &&
      snapshot.safeIssues.some((issue) => issue.code === "plan_summary_without_product_id"),
      snapshot.safeIssues,
    );
    addCheck("snapshotDoesNotExposeSensitiveText", !hasForbiddenText(snapshot), snapshot.safeIssues);
  }
};

const scopeChecks = () => {
  const unexpected = changedFiles().filter((file) => !allowedPatterns.some((pattern) => matchesPattern(file, pattern)));
  addCheck("changedFilesWithinKnownV1Scope", unexpected.length === 0, unexpected);
  addCheck("noForbiddenTrackedDiff", gitDiffNames(forbiddenDiffPaths).length === 0, gitDiffNames(forbiddenDiffPaths));
  addCheck("noPackageOrVercelStatus", gitStatus(["package.json", "package-lock.json", "vercel.json", ".vercel"]).length === 0, gitStatus(["package.json", "package-lock.json", "vercel.json", ".vercel"]));
};

const main = async () => {
  staticChecks();
  await persistenceChecks();
  scopeChecks();

  console.log(JSON.stringify({
    status: "PASS",
    taskId: "HISTORY_AND_QUALITY_PERSISTED_DATASET_READONLY_BINDING_V1",
    summary: {
      historyReadonlyBinding: true,
      qualityReadonlyBinding: true,
      rawRowsPersisted: false,
      previewRowsPersisted: false,
      sensitiveAfterSalesDetailsPersisted: false,
      serverWrites: false,
    },
    checks,
  }, null, 2));
};

main().catch((error) => {
  console.log(JSON.stringify({
    status: "FAIL",
    taskId: "HISTORY_AND_QUALITY_PERSISTED_DATASET_READONLY_BINDING_V1",
    error: error instanceof Error ? error.message : String(error),
    checks,
  }, null, 2));
  process.exit(1);
});
