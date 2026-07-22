import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { UIState } from "../../lib/bi/bi.types";
import {
  TARGET_METRIC_DEFINITIONS,
  createBoardTargetKpiDefinitions,
  type TargetMetricScope,
} from "../../lib/bi/target-metric-definitions";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import {
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
  restoreRuntimeDatasetFromSnapshot,
  saveRuntimeDatasetSnapshot,
} from "../../lib/persistence/runtime-dataset-persistence";
import {
  loadCrossPageDebugContext,
  saveCrossPageDebugContextPatch,
} from "../../lib/persistence/debug-context-persistence";
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
const SOURCE_DIR = process.env.TMALL_DAILY_SOURCE_DIR ?? "/Users/zongji/Desktop/每日平台数据/天猫";
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

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const finiteSum = (values: Array<number | null | undefined>): number =>
  values.reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);

const safeDates = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)))).sort();

const collectRealFiles = (): string[] => {
  if (!fs.existsSync(SOURCE_DIR)) return [];
  return fs
    .readdirSync(SOURCE_DIR)
    .map((fileName) => path.join(SOURCE_DIR, fileName))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => /\.(xlsx?|csv)$/i.test(filePath))
    .sort();
};

const uploadedFile = (filePath: string): UploadedFileDescriptor => {
  const extension = path.extname(filePath).toLowerCase();
  const type = extension === ".csv" ? "text/csv" : "application/vnd.ms-excel";
  return {
    file: new NodeFile([fs.readFileSync(filePath)], path.basename(filePath), { type }) as unknown as File,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  };
};

const metricDefinition = (metricKey: string, scope: TargetMetricScope) => {
  const definition = TARGET_METRIC_DEFINITIONS.find((item) => item.metricKey === metricKey);
  if (!definition || !definition.supportedScopes.includes(scope)) {
    throw new Error(`missing_target_metric:${scope}:${metricKey}`);
  }
  return definition;
};

const targetRecord = (overrides: Partial<TargetDraftRecord>): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: "target-acceptance",
  scope: "platform",
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

const displayTarget = (actual: number | null, target: number | null) => {
  if (actual === null || target === null) {
    return {
      mtdTarget: "--",
      totalTarget: "--",
      difference: "--",
      completionRate: "--",
      progress: 0,
    };
  }
  return {
    mtdTarget: String(target),
    totalTarget: String(target),
    difference: String(actual - target),
    completionRate: `${((actual / target) * 100).toFixed(2)}%`,
    progress: Math.max(0, Math.min((actual / target) * 100, 999)),
  };
};

const targetValueByMetric = (records: TargetDraftRecord[], metricKey: string): number | null =>
  records.find((record) => record.metricKey === metricKey)?.targetValue ?? null;

const homeState = (targetDrafts: Record<string, number> = {}): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  selectedStores: ["tmall-default-store"],
  timeRange: {
    mode: "custom",
    startDate: "2026-06-26",
    endDate: "2026-06-30",
  },
  brandModelFilter: {
    brandWords: ["空气堡"],
    modelWords: [],
    centerWordGroups: [{ id: "center-p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] }],
  },
  targetDrafts,
});

const hasForbiddenPersistedText = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return /rawRows|previewRows|fileName|filePath|文件名历史|warning 原文|订单号|退款编号|交易号|电话|地址|物流|买家说明|商家备注明细|操作人|子账号|AKIA|BEGIN PRIVATE KEY/i.test(text);
};

const hasInvalidText = (value: unknown): boolean => /NaN|Infinity|undefined/.test(JSON.stringify(value));

const run = async () => {
  const fakeIndexedDB = new FakeIndexedDBFactory();
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIndexedDB,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error("localStorage_get_forbidden");
      },
      setItem: () => {
        throw new Error("localStorage_set_forbidden");
      },
      removeItem: () => {
        throw new Error("localStorage_remove_forbidden");
      },
    },
  });

  const filePaths = collectRealFiles();
  addCheck("realDaily18FilesAvailable", filePaths.length === 18, { count: filePaths.length, sourceDir: SOURCE_DIR });

  clearRuntimeBIDataSet();
  const etlResult = await runETLRuntime(filePaths.map(uploadedFile));
  const dataset = etlResult.dataset;
  addCheck("runETLRuntimeParsed18Files", etlResult.summary.filesReceived === 18 && etlResult.summary.filesParsed >= 17, etlResult.summary);
  addCheck("etlDatasetHasRequiredSources", dataset.productMetrics.length > 0 && dataset.planMetrics.length > 0 && dataset.searchTotalKeywords.length > 0 && dataset.searchProductKeywords.length > 0 && dataset.afterSalesMetrics.length > 0, {
    productMetrics: dataset.productMetrics.length,
    planMetrics: dataset.planMetrics.length,
    searchTotalKeywords: dataset.searchTotalKeywords.length,
    searchProductKeywords: dataset.searchProductKeywords.length,
    afterSalesMetrics: dataset.afterSalesMetrics.length,
  });

  const expectedDates = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];
  addCheck("p0ProductDatesCompleteInAcceptance", expectedDates.every((date) => safeDates(dataset.productMetrics.map((metric) => metric.date)).includes(date)));
  addCheck("p0PlanDatesCompleteInAcceptance", expectedDates.every((date) => safeDates(dataset.planMetrics.map((metric) => metric.date)).includes(date)));
  addCheck("p0SearchTotalDatesCompleteInAcceptance", expectedDates.every((date) => safeDates(dataset.searchTotalKeywords.map((keyword) => keyword.date)).includes(date)));
  addCheck("p0SearchProductDatesCompleteInAcceptance", expectedDates.every((date) => safeDates(dataset.searchProductKeywords.map((keyword) => keyword.date)).includes(date)));

  const actualGmvBeforeTargets = finiteSum(dataset.productMetrics.map((metric) => metric.gmv));
  const actualGsvBeforeTargets = finiteSum(dataset.productMetrics.map((metric) => metric.gsv));
  addCheck("actualBusinessTotalsAvailableBeforeTargets", actualGmvBeforeTargets > 0 && actualGsvBeforeTargets > 0, { actualGmvBeforeTargets, actualGsvBeforeTargets });

  const savedSnapshot = await saveRuntimeDatasetSnapshot(dataset, [...etlResult.issues, ...etlResult.errorQueue], etlResult.summary, {
    activeDatasetId: "target-drafts-local-acceptance",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    now: () => FIXED_NOW,
  });
  addCheck("activeDatasetSnapshotSaved", savedSnapshot.status === "saved", savedSnapshot.status);
  addCheck("activeSnapshotHasNoSensitivePersistedText", !hasForbiddenPersistedText(savedSnapshot));

  clearRuntimeBIDataSet();
  const activeSnapshot = await loadActiveRuntimeDatasetSnapshot();
  addCheck("activeDatasetSnapshotLoadable", activeSnapshot.status === "ok", activeSnapshot.status);
  const restored = await restoreRuntimeDatasetFromSnapshot();
  addCheck("activeDatasetRestored", restored.status === "restored", restored.status);
  const restoredRuntime = getRuntimeBIDataSet();
  addCheck("restoredRuntimeDatasetMatchesSaved", !!restoredRuntime && restoredRuntime.productMetrics.length === dataset.productMetrics.length && restoredRuntime.searchTotalKeywords.length === dataset.searchTotalKeywords.length);

  const homeSource = await loadHomeBIDataSource();
  addCheck("homeCanReadRestoredActiveDataset", homeSource.dataStatus.hasRealData && homeSource.points.length > 0, homeSource.dataStatus);

  const gmvDefinition = metricDefinition("gmv", "platform");
  const gsvDefinition = metricDefinition("gsv", "platform");
  const roiDefinition = metricDefinition("adRoi", "platform");
  const platformTargets = await saveTargetDrafts([
    targetRecord({
      targetId: "home-platform:tmall:tmall-default-store:2026-06:gmv",
      metricKey: "gmv",
      targetValue: actualGmvBeforeTargets * 2,
      unit: gmvDefinition.unit,
    }),
    targetRecord({
      targetId: "home-platform:tmall:tmall-default-store:2026-06:gsv",
      metricKey: "gsv",
      targetValue: actualGsvBeforeTargets * 2,
      unit: gsvDefinition.unit,
    }),
    targetRecord({
      targetId: "home-platform:tmall:tmall-default-store:2026-06:adRoi",
      metricKey: "adRoi",
      targetValue: 2.5,
      unit: roiDefinition.unit,
    }),
  ]);
  addCheck("homePlatformTargetsSaved", platformTargets.status === "saved", platformTargets.status);

  const loadedPlatformTargets = await loadActiveTargetDrafts({
    scope: "platform",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    month: "2026-06",
  });
  addCheck("homePlatformTargetsRestoreAfterRefresh", loadedPlatformTargets.status === "ok" && loadedPlatformTargets.records.length >= 3, loadedPlatformTargets);
  addCheck("platformRoiUnitIsTimes", loadedPlatformTargets.status === "ok" && loadedPlatformTargets.records.some((record) => record.metricKey === "adRoi" && record.unit === "倍"), loadedPlatformTargets);

  const homeBefore = buildHomeBIViewModel(homeSource, homeState()).kpiCards;
  const homeAfter = buildHomeBIViewModel(homeSource, homeState({ GMV: actualGmvBeforeTargets * 2, GSV: actualGsvBeforeTargets * 2, 投入产出比: 2.5 })).kpiCards;
  const homeBeforeGmv = homeBefore.find((card) => card.title === "GMV");
  const homeAfterGmv = homeAfter.find((card) => card.title === "GMV");
  const homeAfterGsv = homeAfter.find((card) => card.title === "GSV");
  const homeAfterRoi = homeAfter.find((card) => card.title === "投入产出比");
  addCheck("homeMissingTargetDisplaysDash", homeBeforeGmv?.mtdTarget === "--" && homeBeforeGmv.totalTarget === "--", homeBeforeGmv);
  addCheck("homePlatformTargetsAffectOnlyTargetFields", homeAfterGmv?.mtdTarget !== "--" && homeAfterGmv?.completionRate !== "--" && homeAfterGmv?.progress !== 0, homeAfterGmv);
  addCheck("homeGsvTargetRestored", homeAfterGsv?.mtdTarget !== "--" && homeAfterGsv?.completionRate !== "--", homeAfterGsv);
  addCheck("homeRoiTargetUnitTimes", homeAfterRoi?.unit === "倍" && homeAfterRoi?.mtdTarget !== "--", homeAfterRoi);

  const actualGmvAfterTargets = finiteSum((getRuntimeBIDataSet() as BIDataSet).productMetrics.map((metric) => metric.gmv));
  const actualGsvAfterTargets = finiteSum((getRuntimeBIDataSet() as BIDataSet).productMetrics.map((metric) => metric.gsv));
  addCheck("homeActualValuesUnchangedByTargets", actualGmvBeforeTargets === actualGmvAfterTargets && actualGsvBeforeTargets === actualGsvAfterTargets, {
    actualGmvBeforeTargets,
    actualGmvAfterTargets,
    actualGsvBeforeTargets,
    actualGsvAfterTargets,
  });

  const productIds = Array.from(new Set(dataset.productMetrics.map((metric) => metric.productId).filter(Boolean))).slice(0, 2);
  addCheck("twoProductsAvailableForSeriesProductTargets", productIds.length >= 2, { count: productIds.length });
  const [productA, productB] = productIds as [string, string];
  const productAGmv = finiteSum(dataset.productMetrics.filter((metric) => metric.productId === productA).map((metric) => metric.gmv));
  const productBGmv = finiteSum(dataset.productMetrics.filter((metric) => metric.productId === productB).map((metric) => metric.gmv));
  addCheck("seriesProductActualsAvailable", productAGmv > 0 && productBGmv > 0, { productAGmv, productBGmv });

  const seriesGmvDefinition = metricDefinition("gmv", "series");
  const productGmvDefinition = metricDefinition("gmv", "product");
  const seriesRoiDefinition = metricDefinition("adRoi", "series");
  const productRoiDefinition = metricDefinition("adRoi", "product");
  const seriesProductTargets = await saveTargetDrafts([
    targetRecord({
      targetId: "series:tmall:tmall-default-store:series-a:2026-06:gmv",
      scope: "series",
      seriesId: "series-a",
      metricKey: "gmv",
      targetValue: productAGmv * 2,
      unit: seriesGmvDefinition.unit,
    }),
    targetRecord({
      targetId: "series:tmall:tmall-default-store:series-b:2026-06:gmv",
      scope: "series",
      seriesId: "series-b",
      metricKey: "gmv",
      targetValue: productBGmv * 2,
      unit: seriesGmvDefinition.unit,
    }),
    targetRecord({
      targetId: "series:tmall:tmall-default-store:series-a:2026-06:adRoi",
      scope: "series",
      seriesId: "series-a",
      metricKey: "adRoi",
      targetValue: 2.5,
      unit: seriesRoiDefinition.unit,
    }),
    targetRecord({
      targetId: `product:tmall:tmall-default-store:${productA}:2026-06:gmv`,
      scope: "product",
      productId: productA,
      metricKey: "gmv",
      targetValue: productAGmv * 2,
      unit: productGmvDefinition.unit,
    }),
    targetRecord({
      targetId: `product:tmall:tmall-default-store:${productB}:2026-06:gmv`,
      scope: "product",
      productId: productB,
      metricKey: "gmv",
      targetValue: productBGmv * 2,
      unit: productGmvDefinition.unit,
    }),
    targetRecord({
      targetId: `product:tmall:tmall-default-store:${productA}:2026-06:adRoi`,
      scope: "product",
      productId: productA,
      metricKey: "adRoi",
      targetValue: 3,
      unit: productRoiDefinition.unit,
    }),
  ]);
  addCheck("seriesProductTargetsSaved", seriesProductTargets.status === "saved", seriesProductTargets.status);

  const loadedSeriesA = await loadActiveTargetDrafts({ scope: "series", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "series-a", month: "2026-06" });
  const loadedSeriesB = await loadActiveTargetDrafts({ scope: "series", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "series-b", month: "2026-06" });
  addCheck("seriesATargetRestoresAfterRefresh", loadedSeriesA.status === "ok" && targetValueByMetric(loadedSeriesA.records, "gmv") === productAGmv * 2, loadedSeriesA);
  addCheck("seriesBDoesNotMixSeriesATarget", loadedSeriesB.status === "ok" && targetValueByMetric(loadedSeriesB.records, "gmv") === productBGmv * 2, loadedSeriesB);
  addCheck("seriesRoiUnitIsTimes", loadedSeriesA.status === "ok" && loadedSeriesA.records.some((record) => record.metricKey === "adRoi" && record.unit === "倍"), loadedSeriesA);

  const loadedProductA = await loadActiveTargetDrafts({ scope: "product", platformCode: "tmall", storeId: "tmall-default-store", productId: productA, month: "2026-06" });
  const loadedProductB = await loadActiveTargetDrafts({ scope: "product", platformCode: "tmall", storeId: "tmall-default-store", productId: productB, month: "2026-06" });
  addCheck("productATargetRestoresAfterRefresh", loadedProductA.status === "ok" && targetValueByMetric(loadedProductA.records, "gmv") === productAGmv * 2, loadedProductA);
  addCheck("productBDoesNotMixProductATarget", loadedProductB.status === "ok" && targetValueByMetric(loadedProductB.records, "gmv") === productBGmv * 2, loadedProductB);
  addCheck("productRoiUnitIsTimes", loadedProductA.status === "ok" && loadedProductA.records.some((record) => record.metricKey === "adRoi" && record.unit === "倍"), loadedProductA);

  const missingSeries = await loadActiveTargetDrafts({ scope: "series", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "series-missing", month: "2026-06" });
  const missingDisplay = displayTarget(productAGmv, missingSeries.status === "ok" ? targetValueByMetric(missingSeries.records, "gmv") : null);
  addCheck("missingTargetDisplaysDashNotZero", missingSeries.status === "empty" && missingDisplay.mtdTarget === "--" && missingDisplay.completionRate === "--" && missingDisplay.progress === 0, { missingSeries, missingDisplay });

  const pauseResult = await pauseTargetDraft(`product:tmall:tmall-default-store:${productA}:2026-06:gmv`);
  const productAAfterPause = await loadActiveTargetDrafts({ scope: "product", platformCode: "tmall", storeId: "tmall-default-store", productId: productA, month: "2026-06", metricKey: "gmv" });
  addCheck("pausedProductTargetExcludedFromActive", pauseResult.status === "paused" && productAAfterPause.status === "empty", { pauseResult, productAAfterPause });

  const debugSaved = await saveCrossPageDebugContextPatch({
    selectedPlatform: "tmall",
    selectedStores: ["tmall-default-store"],
    timeRange: { mode: "custom", startDate: "2026-06-26", endDate: "2026-06-30" },
    brandModelFilter: {
      brandWords: ["空气堡"],
      modelWords: ["P1"],
      centerWordGroups: [{ id: "center-p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] }],
    },
    selectedMetric: "GMV",
    chartMode: "mtd",
    pages: {
      series: {
        currentSeriesName: "系列A",
        temporarySeriesProductIds: [
          {
            id: "series-a-p1",
            seriesId: "series-a",
            seriesName: "系列A",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "天猫默认店铺",
            productId: productA,
            remark: "",
            source: "temp",
          },
          {
            id: "series-b-p2",
            seriesId: "series-b",
            seriesName: "系列B",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "天猫默认店铺",
            productId: productB,
            remark: "",
            source: "temp",
          },
        ],
      },
      product: {
        currentProductKey: `tmall::tmall-default-store::${productA}`,
        temporaryTrackedProducts: [
          {
            id: "product-a",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "天猫默认店铺",
            productId: productA,
            productName: "宝贝A",
          },
          {
            id: "product-b",
            platformCode: "tmall",
            platformName: "天猫",
            storeId: "tmall-default-store",
            storeName: "天猫默认店铺",
            productId: productB,
            productName: "宝贝B",
          },
        ],
      },
    },
  }, { now: () => FIXED_NOW });
  const debugLoaded = await loadCrossPageDebugContext();
  addCheck("debugContextSavedForSeriesAndProduct", debugSaved.status === "saved" && debugLoaded.status === "ok", { debugSaved: debugSaved.status, debugLoaded: debugLoaded.status });
  addCheck(
    "debugContextRestoresCurrentSeriesProductWithoutAllProducts",
    debugLoaded.status === "ok" &&
      debugLoaded.snapshot.pages.series.currentSeriesName === "系列A" &&
      debugLoaded.snapshot.pages.series.temporarySeriesProductIds.length === 2 &&
      debugLoaded.snapshot.pages.product.currentProductKey === `tmall::tmall-default-store::${productA}` &&
      !JSON.stringify(debugLoaded.snapshot).includes("所有宝贝"),
    debugLoaded.status === "ok" ? debugLoaded.snapshot.pages : debugLoaded,
  );

  const snapshotList = await listRuntimeDatasetSnapshots();
  addCheck("historyCanListSafeRuntimeSnapshot", snapshotList.status === "ok" && snapshotList.snapshots.length >= 1, snapshotList.status);
  addCheck("qualityCanReadSafeIssueSummary", activeSnapshot.status === "ok" && activeSnapshot.snapshot.safeIssues.every((issue) => typeof issue.code === "string" && issue.safeCount >= 1), activeSnapshot.status === "ok" ? activeSnapshot.snapshot.safeIssues : activeSnapshot);
  const historyQualitySources =
    read("components/upload/history/v1/history-data-v1-dashboard.tsx") +
    read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");
  addCheck(
    "historyQualityReadonlySourceBoundary",
    !/(save|delete|clear|rollback|replace)RuntimeDataset|indexedDB\.(deleteDatabase|open)|\.transaction\([^)]*,\s*["']readwrite["']/.test(
      historyQualitySources,
    ),
  );

  const boardDefinitions = [
    ...createBoardTargetKpiDefinitions("series", {}, { gmv: "系列GMV", gsv: "系列GSV" }),
    ...createBoardTargetKpiDefinitions("product", {}, { gmv: "宝贝GMV", gsv: "宝贝GSV" }),
  ];
  addCheck("seriesProductTargetDefinitionsAvailable", boardDefinitions.some((definition) => definition.title === "系列GMV") && boardDefinitions.some((definition) => definition.title === "宝贝GMV"));

  const serializedEvidence = JSON.stringify({
    savedSnapshot,
    loadedPlatformTargets,
    loadedSeriesA,
    loadedSeriesB,
    loadedProductA,
    loadedProductB,
    debugLoaded,
    snapshotList,
  });
  addCheck("noInvalidTextInAcceptanceEvidence", !hasInvalidText(serializedEvidence));
  addCheck("noSensitiveTextInAcceptanceEvidence", !hasForbiddenPersistedText(serializedEvidence));

  const sourceBundle = [
    "components/home/home-bi-dashboard.tsx",
    "components/series-board/v1/series-board-v1-dashboard.tsx",
    "components/product-board/v1/product-board-v1-dashboard.tsx",
    "lib/persistence/target-drafts-persistence.ts",
    "lib/persistence/runtime-dataset-persistence.ts",
    "lib/persistence/debug-context-persistence.ts",
  ].map(read).join("\n");
  addCheck("sourceDoesNotWriteLocalStorage", !/localStorage\.setItem|localStorage\[/i.test(sourceBundle));
  addCheck(
    "persistedEvidenceDoesNotContainRawRowsOrPreviewRows",
    !/rawRows|previewRows/.test(serializedEvidence),
  );

  const forbiddenStatus = gitStatus([
    "lib/storage",
    "lib/tmall",
    "lib/v05",
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".vercel",
  ]);
  addCheck("noForbiddenStorageTmallV05PackageVercelChanges", forbiddenStatus.length === 0, forbiddenStatus);

  console.log(JSON.stringify({
    status: "PASS",
    sourceDir: SOURCE_DIR,
    fileCount: filePaths.length,
    datasetCounts: {
      productMetrics: dataset.productMetrics.length,
      planMetrics: dataset.planMetrics.length,
      searchTotalKeywords: dataset.searchTotalKeywords.length,
      searchProductKeywords: dataset.searchProductKeywords.length,
      afterSalesMetrics: dataset.afterSalesMetrics.length,
    },
    actualTotals: {
      gmv: actualGmvBeforeTargets,
      gsv: actualGsvBeforeTargets,
    },
    checks,
  }, null, 2));
};

run().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    error: error instanceof Error ? error.message : String(error),
    checks,
  }, null, 2));
  process.exit(1);
});
