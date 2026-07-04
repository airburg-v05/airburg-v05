import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  saveCrossPageDebugContextPatch,
  type CrossPageDebugContextPatch,
} from "../../lib/persistence/debug-context-persistence";
import { createDefaultBIState } from "../../lib/bi/bi.store";

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

  constructor(private readonly stores: Map<string, FakeObjectStoreConfig>) {}

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

const knownPriorBaselinePatterns = [
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
  "lib/persistence/runtime-dataset-persistence.ts",
  "lib/persistence/runtime-dataset-persistence.types.ts",
  "lib/persistence/target-drafts-persistence.ts",
  "lib/persistence/target-drafts-persistence.types.ts",
  "scripts/private-audit/**",
];

const allowedThisTaskPatterns = [
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "components/visual-system/v1/brand-model-filter-popover.tsx",
  "lib/persistence/debug-context-persistence.ts",
  "scripts/private-audit/validate-cross-page-debug-context-persistence-v1.ts",
];

const isAllowed = (file: string): boolean =>
  knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)) ||
  allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern));

const forbiddenSnapshotTokens = [
  "platformTargets",
  "seriesTargets",
  "productTargets",
  "targetDrafts",
  "kpiOrder",
  "excludedProductIds",
  "excludedRemarkKeywords",
  "remarkKeywords",
  "rawRows",
  "previewRows",
  "fileName",
  "filePath",
  "订单号",
  "退款编号",
  "电话",
  "地址",
  "所有宝贝",
  "NaN",
  "Infinity",
  "undefined",
];

const containsForbiddenText = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return forbiddenSnapshotTokens.some((token) => text.includes(token));
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

  const adapter = read("lib/persistence/debug-context-persistence.ts");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const popover = read("components/visual-system/v1/brand-model-filter-popover.tsx");

  addCheck("adapterUsesIndexedDB", adapter.includes("indexedDB"));
  addCheck("adapterDoesNotUseLocalStorage", !adapter.includes("localStorage"));
  addCheck("homeLoadsAndSavesDebugContext", home.includes("loadCrossPageDebugContext") && home.includes("saveCrossPageDebugContextPatch"));
  addCheck("seriesLoadsAndSavesDebugContext", series.includes("loadCrossPageDebugContext") && series.includes("saveCrossPageDebugContextPatch"));
  addCheck("productLoadsAndSavesDebugContext", product.includes("loadCrossPageDebugContext") && product.includes("saveCrossPageDebugContextPatch"));
  addCheck(
    "brandPopoverExplainsDebugContextBoundary",
    popover.includes("跨页面调试上下文") &&
      popover.includes("本浏览器") &&
      popover.includes("不会保存原始文件或敏感明细") &&
      popover.includes("不会写入目标草稿"),
  );
  addCheck("productDoesNotRestoreAllProducts", !product.includes("所有宝贝"));

  const patch = {
    selectedPlatform: "tmall",
    selectedStores: ["tmall-default-store", "tmall::second-store"],
    timeRange: { mode: "custom", startDate: "2026-06-26", endDate: "2026-06-30" },
    brandModelFilter: {
      brandWords: ["空气堡"],
      modelWords: ["P1"],
      centerWordGroups: [
        {
          id: "center-p1",
          centerWord: "P1",
          aliases: ["P1", "KJ60F-P1", "KJ60P1", "rawRows"],
        },
      ],
    },
    selectedMetric: "GMV",
    chartMode: "dly",
    pages: {
      home: { selectedMetric: "品牌词访客", chartMode: "dly" },
      series: {
        selectedMetric: "brandVisitors",
        chartMode: "mtd",
        currentSeriesName: "系列A",
        temporarySeriesProductIds: [
          {
            id: "series-a-p1",
            seriesId: "series-a",
            seriesName: "系列A",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "默认店铺",
            productId: "P1",
            remark: "debug",
            source: "temp",
          },
          {
            id: "series-b-p2",
            seriesId: "series-b",
            seriesName: "系列B",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "默认店铺",
            productId: "P2",
            remark: "debug",
            source: "temp",
          },
        ],
      },
      product: {
        selectedMetric: "productGmv",
        chartMode: "mtd",
        currentProductKey: "tmall::tmall-default-store::P1",
        temporaryTrackedProducts: [
          {
            id: "product-a",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "默认店铺",
            productId: "P1",
            productName: "宝贝A",
          },
          {
            id: "product-b",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "默认店铺",
            productId: "P2",
            productName: "宝贝B",
          },
        ],
      },
    },
    platformTargets: { GMV: 100 },
    rawRows: [{ secret: true }],
    previewRows: [{ secret: true }],
    excludedProductIds: ["P9"],
  } as CrossPageDebugContextPatch & Record<string, unknown>;

  const saved = await saveCrossPageDebugContextPatch(patch, {
    indexedDBFactory: fakeIndexedDB as unknown as IDBFactory,
    now: () => new Date("2026-07-02T08:00:00.000Z"),
  });
  addCheck("debugContextSaved", saved.status === "saved", saved);
  addCheck("savedSnapshotHasNoForbiddenText", saved.status === "saved" && !containsForbiddenText(saved.snapshot), saved);
  if (saved.status !== "saved") throw new Error("debug context save failed");

  const loaded = await loadCrossPageDebugContext({ indexedDBFactory: fakeIndexedDB as unknown as IDBFactory });
  addCheck("debugContextLoaded", loaded.status === "ok", loaded);
  if (loaded.status !== "ok") throw new Error("debug context load failed");

  const snapshot = loaded.snapshot;
  addCheck("selectedPlatformRestored", snapshot.selectedPlatform === "tmall", snapshot.selectedPlatform);
  addCheck("selectedStoresNormalized", snapshot.selectedStores.includes("tmall-default-store") && snapshot.selectedStores.includes("second-store"), snapshot.selectedStores);
  addCheck("timeRangeRestored", snapshot.timeRange?.startDate === "2026-06-26" && snapshot.timeRange.endDate === "2026-06-30", snapshot.timeRange);
  addCheck("brandAndCenterWordP1Restored", snapshot.brandModelFilter.brandWords.includes("空气堡") && snapshot.centerWordGroups[0]?.centerWord === "P1", snapshot.brandModelFilter);
  addCheck("unsafeCenterAliasFiltered", !(snapshot.centerWordGroups[0]?.aliases ?? []).includes("rawRows"), snapshot.centerWordGroups);
  addCheck("seriesABRestored", snapshot.pages.series.temporarySeriesProductIds.length === 2 && snapshot.pages.series.currentSeriesName === "系列A", snapshot.pages.series);
  addCheck("productABRestored", snapshot.pages.product.temporaryTrackedProducts.length === 2 && snapshot.pages.product.currentProductKey === "tmall::tmall-default-store::P1", snapshot.pages.product);
  addCheck("chartModesRestored", snapshot.pages.home.chartMode === "dly" && snapshot.pages.series.chartMode === "mtd" && snapshot.pages.product.chartMode === "mtd", snapshot.pages);
  addCheck("selectedMetricsRestoredPerPage", snapshot.pages.home.selectedMetric === "品牌词访客" && snapshot.pages.series.selectedMetric === "brandVisitors" && snapshot.pages.product.selectedMetric === "productGmv", snapshot.pages);

  const homeState = mergeDebugContextIntoUIState(createDefaultBIState(), snapshot, "home");
  const seriesState = mergeDebugContextIntoUIState(createDefaultBIState(), snapshot, "series");
  const productState = mergeDebugContextIntoUIState(createDefaultBIState(), snapshot, "product");
  addCheck("homeStateMerged", homeState.selectedMetric === "品牌词访客" && homeState.brandModelFilter?.centerWordGroups?.[0]?.centerWord === "P1", homeState);
  addCheck("seriesStateMerged", seriesState.selectedMetric === "brandVisitors" && seriesState.selectedStores.includes("tmall-default-store"), seriesState);
  addCheck("productStateMergedWithoutAllProducts", productState.selectedMetric === "productGmv" && !JSON.stringify(productState).includes("所有宝贝"), productState);

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
  const etlDiff = gitDiffNames(["lib/etl"]);
  const changed = changedFiles();
  addCheck("noHardForbiddenPathsChanged", hardForbiddenStatus.length === 0, hardForbiddenStatus);
  addCheck("noEtlFilesModifiedByThisTask", etlDiff.length === 0, etlDiff);
  addCheck("changedFilesWithinAllowedOrPriorBaseline", changed.every(isAllowed), changed.filter((file) => !isAllowed(file)));

  console.log(JSON.stringify({ status: "PASS", checks }, null, 2));
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
