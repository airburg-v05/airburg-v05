import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { UIState } from "../../lib/bi/bi.types";
import type { BIHomeDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
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
const FIXED_NOW = new Date("2026-07-02T00:00:00.000Z");
const DATABASE_NAME = "airburg-home-platform-target-binding-audit";
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

const baseDataSource = (): BIHomeDataSource => ({
  mode: "v2_valid",
  points: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      seriesId: null,
      seriesName: null,
      productId: "P1",
      productName: "空气堡 P1",
      businessDate: "2026-06-30",
      metrics: {
        gmv: 1000,
        gsv: 800,
        visitors: 100,
        paidBuyers: 10,
        adSpend: 100,
        adRevenue: 250,
      },
    },
  ],
  seriesPoints: [],
  seriesDefinitions: [],
  searchTotalKeywords: [],
  searchProductKeywords: [],
  targets: [],
  dataStatus: {
    mode: "v2_valid",
    label: "ETL运行时数据",
    storeCount: 1,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  },
  selectedDate: "2026-06-30",
  safeWarnings: [],
  notices: [],
});

const baseState = (targetDrafts: Record<string, number> = {}): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  selectedStores: ["tmall-default-store"],
  timeRange: {
    mode: "month",
    startDate: "2026-06-01",
    endDate: "2026-06-30",
  },
  brandModelFilter: {
    brandWords: [],
    modelWords: [],
    centerWordGroups: [],
  },
  targetDrafts,
});

const targetRecord = ({
  metricKey,
  targetValue,
  unit,
}: {
  metricKey: string;
  targetValue: number;
  unit: string;
}): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: `home-platform:tmall:tmall-default-store:2026-06:${metricKey}`,
  scope: "platform",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: null,
  productId: null,
  month: "2026-06",
  metricKey,
  targetValue,
  unit,
  createdAt: FIXED_NOW.toISOString(),
  updatedAt: FIXED_NOW.toISOString(),
  status: "active",
});

const cardByTitle = (source: BIHomeDataSource, state: UIState, title: string) =>
  buildHomeBIViewModel(source, state).kpiCards.find((card) => card.title === title);

const main = async () => {
  const homeSource = read("components/home/home-bi-dashboard.tsx");
  const registrySource = read("lib/bi/target-metric-definitions.ts");
  const adapterSource = read("lib/persistence/target-drafts-persistence.ts");

  addCheck("homeImportsTargetDraftPersistenceAdapter", homeSource.includes("saveTargetDrafts") && homeSource.includes("loadActiveTargetDrafts"));
  addCheck("homeUsesRegistryPlatformFields", homeSource.includes("getTargetMetricDefinitionsForScope(\"platform\")"));
  addCheck("homeShowsSingleStoreGuard", homeSource.includes("请选择单个店铺后设置目标"));
  addCheck("homeBuildsStablePlatformTargetId", homeSource.includes("home-platform:${platformCode}:${storeId}:${month}:${metricKey}"));
  addCheck("homeDoesNotImportEtl", !homeSource.includes("/etl/") && !homeSource.includes("lib/etl"));
  addCheck("homeDoesNotWriteLocalStorage", !homeSource.includes("localStorage."));
  addCheck("registryRoiUnitIsTimes", registrySource.includes("metricKey: \"adRoi\"") && registrySource.includes("unit: \"倍\""));
  addCheck("adapterStillAvoidsLocalStorage", !adapterSource.includes("localStorage"));

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

  const saved = await saveTargetDrafts(
    [
      targetRecord({ metricKey: "gmv", targetValue: 2000, unit: "元" }),
      targetRecord({ metricKey: "gsv", targetValue: 1600, unit: "元" }),
      targetRecord({ metricKey: "adRoi", targetValue: 2.5, unit: "倍" }),
    ],
    options,
  );
  addCheck("platformTargetDraftsSave", saved.status === "saved", saved);

  const loaded = await loadActiveTargetDrafts({
    scope: "platform",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    month: "2026-06",
  }, options);
  addCheck("platformTargetDraftsRestoreBySingleStoreMonth", loaded.status === "ok" && loaded.records.length === 3, loaded);
  addCheck("restoredRoiUnitIsTimes", loaded.status === "ok" && loaded.records.find((record) => record.metricKey === "adRoi")?.unit === "倍", loaded);

  const source = baseDataSource();
  const beforeState = baseState();
  const beforeGmv = cardByTitle(source, beforeState, "GMV");
  const beforeGsv = cardByTitle(source, beforeState, "GSV");
  const beforeRoi = cardByTitle(source, beforeState, "投入产出比");
  addCheck("missingTargetDisplaysDash", beforeGmv?.mtdTarget === "--" && beforeGmv.totalTarget === "--", beforeGmv);

  const afterState = baseState({
    GMV: 2000,
    GSV: 1600,
    投入产出比: 2.5,
  });
  const afterGmv = cardByTitle(source, afterState, "GMV");
  const afterGsv = cardByTitle(source, afterState, "GSV");
  const afterRoi = cardByTitle(source, afterState, "投入产出比");
  addCheck("targetsUpdateKpiTargetFields", afterGmv?.mtdTarget !== "--" && afterGmv?.completionRate !== "--", afterGmv);
  addCheck("gsvTargetRestores", afterGsv?.mtdTarget !== "--" && afterGsv?.completionRate !== "--", afterGsv);
  addCheck("roiTargetUsesTimesUnit", afterRoi?.unit === "倍" && afterRoi?.mtdTarget === "2.5", afterRoi);
  addCheck("actualGmvUnchangedByTargets", beforeGmv?.rawValue === afterGmv?.rawValue && afterGmv?.rawValue === 1000, { beforeGmv, afterGmv });
  addCheck("actualGsvUnchangedByTargets", beforeGsv?.rawValue === afterGsv?.rawValue && afterGsv?.rawValue === 800, { beforeGsv, afterGsv });
  addCheck("actualRoiUnchangedByTargets", beforeRoi?.rawValue === afterRoi?.rawValue && afterRoi?.rawValue === 2.5, { beforeRoi, afterRoi });

  const paused = await pauseTargetDraft("home-platform:tmall:tmall-default-store:2026-06:gmv", options);
  addCheck("adapterPauseAvailableForMissingTargetVerification", paused.status === "paused", paused);
  const activeAfterPause = await loadActiveTargetDrafts({
    scope: "platform",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    month: "2026-06",
    metricKey: "gmv",
  }, options);
  addCheck("pausedTargetNotReturnedAsActive", activeAfterPause.status === "empty", activeAfterPause);

  const serialized = JSON.stringify([saved, loaded, beforeGmv, afterGmv]);
  addCheck("noInvalidNumberOutput", !/NaN|Infinity|undefined/.test(serialized));
  addCheck("noSensitiveFieldsInTargetDrafts", !/rawRows|previewRows|fileName|退款编号|交易号|电话|地址|买家说明|商家备注明细/.test(serialized));

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
  addCheck("noForbiddenStorageTmallV05PackageVercelPrivateSampleChanges", !/lib\/storage|lib\/tmall|lib\/v05|package\.json|package-lock\.json|vercel\.json|\.vercel|private-samples/.test(forbiddenStatus), forbiddenStatus);
  addCheck("targetRegistryStillHasAllPlatformDefinitions", TARGET_METRIC_DEFINITIONS.length >= 17, TARGET_METRIC_DEFINITIONS.length);

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
