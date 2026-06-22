import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  type ActiveDatasetPointer,
  type ImportBatchRecord,
  type MigrationManifest,
  type OwnedAdProductFact,
  type PlatformRecord,
  type SeriesRecord,
  type StoreRecord,
  type TargetRecord,
  type TrackedProductRecord,
  type V2Dataset,
} from "../../lib/v05";
import { collectDatasetRecordKeys, envelopesForDataset, stablePersistenceStringify } from "../../lib/v05/persistence/envelopes";
import {
  V2_ACTIVE_POINTER_KEY,
  V2_ACTIVATION_JOURNAL_INDEXES,
  V2_DATASET_METADATA_INDEXES,
  V2_ENVELOPE_INDEXES,
  V2_INDEXEDDB_VERSION,
  V2_METADATA_INDEXES,
  V2_OBJECT_STORE_NAMES,
  V2_RECORD_STORE_NAMES,
  type V2RecordStoreName,
} from "../../lib/v05/persistence/schema";
import type { PersistedRecordEnvelope, V2DatasetMetadata } from "../../lib/v05/persistence/contracts";
import { countStagingDatasetRecords } from "../../lib/v05/migration/contracts";
import type { OwnedBusinessProductFact } from "../../lib/v05/domain/models";

const ROOT = process.cwd();
const TASK_ID = "V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE";
const DATABASE_NAME = "airburg-v05-f5r1-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const NOW = "2026-06-23T19:00:00.000+08:00";

const SENSITIVE_TERMS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
] as const;

const ROUTES = [
  ["desktop-login", "/login", 1440, 900],
  ["desktop-home", "/home", 1440, 1000],
  ["desktop-targets", "/targets", 1440, 1000],
  ["desktop-store-default", "/store-board?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktop-series-default", "/series-board?platform=tmall&storeId=tmall-default-store&seriesId=s-default", 1440, 1000],
  ["desktop-product-default", "/product-board?platform=tmall&storeId=tmall-default-store&trackedProductId=tp-default-p1", 1440, 1000],
  ["desktop-store-second", "/store-board?platform=tmall&storeId=tmall-second-store", 1440, 1000],
  ["desktop-series-second", "/series-board?platform=tmall&storeId=tmall-second-store&seriesId=s-second", 1440, 1000],
  ["desktop-product-second", "/product-board?platform=tmall&storeId=tmall-second-store&trackedProductId=tp-second-p1", 1440, 1000],
  ["desktop-upload-quality", "/upload/quality?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktop-raw-data", "/raw-data", 1440, 1000],
  ["mobile-home", "/home", 390, 844],
  ["mobile-targets", "/targets", 390, 844],
  ["mobile-store", "/store-board?platform=tmall&storeId=tmall-default-store", 390, 844],
  ["mobile-series", "/series-board?platform=tmall&storeId=tmall-default-store&seriesId=s-default", 390, 844],
  ["mobile-product", "/product-board?platform=tmall&storeId=tmall-default-store&trackedProductId=tp-default-p1", 390, 844],
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
  exceptionDetails?: unknown;
  method?: string;
  params?: Record<string, unknown>;
}

interface ChromeTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface Check {
  name: string;
  pass: boolean;
  detail?: unknown;
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("free_port_unavailable"));
      });
    });
    server.on("error", reject);
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error(`server_not_ready:${url}`);
};

const stopProcess = async (child: ChildProcess | null): Promise<void> => {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5000),
  ]);
  if (!child.killed) child.kill("SIGKILL");
};

const startNextDev = async (): Promise<{
  baseUrl: string;
  process: ChildProcess;
  restoreNextEnv: () => void;
}> => {
  const nextEnvPath = path.join(ROOT, "next-env.d.ts");
  const originalNextEnv = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;
  const port = await getFreePort();
  const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME: DATABASE_NAME,
      BROWSER: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${port}/login`);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    process: child,
    restoreNextEnv: () => {
      if (originalNextEnv === null) return;
      if (fs.existsSync(nextEnvPath) && fs.readFileSync(nextEnvPath, "utf8") !== originalNextEnv) {
        fs.writeFileSync(nextEnvPath, originalNextEnv);
      }
    },
  };
};

const waitForDevToolsPort = async (userDataDir: string): Promise<number> => {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      const parsed = Number(port);
      if (Number.isFinite(parsed)) return parsed;
    }
    await delay(100);
  }
  throw new Error("chrome_devtools_port_unavailable");
};

const getPageTarget = async (debugPort: number): Promise<ChromeTarget> => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = (await response.json()) as ChromeTarget[];
    const target = targets.find((item) =>
      item.webSocketDebuggerUrl &&
      item.type === "page" &&
      !item.url.startsWith("chrome-extension://"),
    );
    if (target) return target;
    await delay(100);
  }
  throw new Error("chrome_page_target_unavailable");
};

class CdpClient {
  private socket: WebSocket;
  private commandId = 0;
  private pending = new Map<number, (response: CdpResponse) => void>();
  readonly consoleEvents: string[] = [];

  constructor(webSocketDebuggerUrl: string) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onmessage = (event) => {
        const response = JSON.parse(String(event.data)) as CdpResponse;
        if (response.id) {
          this.pending.get(response.id)?.(response);
          this.pending.delete(response.id);
          return;
        }
        if (response.method === "Runtime.consoleAPICalled") {
          const type = response.params?.type ? String(response.params.type) : "console";
          const args = Array.isArray(response.params?.args)
            ? response.params.args as Array<{ value?: unknown; description?: string }>
            : [];
          const values = args.map((arg) => String(arg.value ?? arg.description ?? "")).join(" ");
          this.consoleEvents.push(`${type}:${values}`);
        }
        if (response.method === "Runtime.exceptionThrown") {
          this.consoleEvents.push("exception:Runtime.exceptionThrown");
        }
      };
      this.socket.onerror = () => reject(new Error("cdp_websocket_error"));
      this.socket.onopen = () => resolve();
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<CdpResponse> {
    this.commandId += 1;
    const id = this.commandId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cdp_timeout:${method}`));
      }, 45000);
      this.pending.set(id, (response) => {
        clearTimeout(timeout);
        if (response.error) reject(new Error(`cdp_error:${method}:${response.error.message ?? "unknown"}`));
        else resolve(response);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async enable(): Promise<void> {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
    await this.send("Log.enable").catch(() => undefined);
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await this.waitFor(() => document.readyState === "complete", 45000);
    await delay(500);
  }

  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw new Error("runtime_evaluate_exception");
    const result = response.result as { result?: { value?: unknown } } | undefined;
    return result?.result?.value as T;
  }

  async waitFor(predicate: () => boolean, timeoutMs = 30000): Promise<void> {
    const source = `(${predicate.toString()})()`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(source).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error("wait_for_timeout");
  }

  async captureScreenshot(filePath: string, width: number, height: number): Promise<string> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 480,
    });
    await delay(400);
    const response = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const data = response.result?.data;
    if (typeof data !== "string") throw new Error("screenshot_missing");
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);
    await this.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    return sha256(buffer);
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}

const platform = (): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  platformName: "天猫",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const store = (storeId: string, storeName: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  storeName,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const batch = (storeId: string): ImportBatchRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  importBatchId: `batch-${storeId}`,
  platformCode: "tmall",
  storeId,
  importStartedAt: NOW,
  importCompletedAt: NOW,
  status: "success",
  sourceTypes: ["business_product", "ad_product"],
  createdAt: NOW,
  updatedAt: NOW,
});

const businessFact = (storeId: string, productId: string, productName: string, gmv: number): OwnedBusinessProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "business_product",
  importBatchId: `batch-${storeId}`,
  productId,
  productName,
  gmv,
  gsv: gmv * 0.9,
  visitors: 100,
  paidBuyers: 10,
  paidOrders: 10,
  conversionRate: 0.1,
  avgOrderValue: gmv / 10,
  favorites: null,
  cartAdditions: null,
});

const adFact = (storeId: string, productId: string): OwnedAdProductFact => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  businessDate: "2026-06-18",
  sourceType: "ad_product",
  importBatchId: `batch-${storeId}`,
  productId,
  adSpend: 20,
  adSalesAmount: 60,
  impressions: 1000,
  clicks: 100,
  clickRate: 0.1,
  adRoi: 3,
});

const series = (storeId: string, seriesId: string, name: string, productIds: string[]): SeriesRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  seriesId,
  name,
  productIds,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const tracked = (storeId: string, trackedProductId: string, productId: string): TrackedProductRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  storeId,
  trackedProductId,
  productId,
  displayName: null,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
});

const target = (overrides: Partial<TargetRecord> & Pick<TargetRecord, "targetId" | "scope">): TargetRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  parentTargetId: null,
  periodType: "daily",
  periodValue: "2026-06-18",
  metricKey: "gmv",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const manifest = (): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: "manifest-v05f5r1-browser",
  migrationVersion: "v05f5r1-target-final-browser-audit",
  status: "success",
  migratedFromKeys: ["airburg_tmall_analysis_v2", "airburg_tmall_series_groups_v1", "airburg_tmall_targets_v1"],
  importBatchId: "batch-tmall-default-store",
  legacyValueHash: null,
  startedAt: NOW,
  completedAt: NOW,
  safeIssueCodes: [],
});

const buildDataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-v05f5r1-browser-audit",
  platforms: [platform()],
  stores: [store("tmall-default-store", "天猫默认店铺"), store("tmall-second-store", "天猫第二店铺")],
  importBatches: [batch("tmall-default-store"), batch("tmall-second-store")],
  importFiles: [],
  businessProductFacts: [
    businessFact("tmall-default-store", "p1", "默认店商品一", 100),
    businessFact("tmall-default-store", "p2", "默认店商品二", 80),
    businessFact("tmall-second-store", "p1", "第二店同 ID 商品", 120),
  ],
  adProductFacts: [adFact("tmall-default-store", "p1"), adFact("tmall-default-store", "p2"), adFact("tmall-second-store", "p1")],
  adPlanFacts: [],
  afterSalesDailyAggregates: [],
  afterSalesRangeAggregates: [],
  afterSalesOperationalSnapshots: [],
  afterSalesDistributionItems: [],
  series: [
    series("tmall-default-store", "s-default", "核心系列", ["p1", "p2"]),
    series("tmall-second-store", "s-second", "核心系列", ["p1"]),
  ],
  trackedProducts: [tracked("tmall-default-store", "tp-default-p1", "p1"), tracked("tmall-second-store", "tp-second-p1", "p1")],
  targets: [
    target({ targetId: "company-gmv", scope: "company", targetValue: 300 }),
    target({ targetId: "store-default-gmv", scope: "store", parentTargetId: "company-gmv", platformCode: "tmall", storeId: "tmall-default-store", targetValue: 120 }),
    target({ targetId: "store-second-gmv", scope: "store", parentTargetId: "company-gmv", platformCode: "tmall", storeId: "tmall-second-store", targetValue: 180 }),
    target({ targetId: "series-default-gmv", scope: "series", parentTargetId: "store-default-gmv", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "s-default", targetValue: 90 }),
    target({ targetId: "series-second-gmv", scope: "series", parentTargetId: "store-second-gmv", platformCode: "tmall", storeId: "tmall-second-store", seriesId: "s-second", targetValue: 110 }),
    target({ targetId: "product-default-p1-gmv", scope: "product", parentTargetId: "series-default-gmv", platformCode: "tmall", storeId: "tmall-default-store", productId: "p1", targetValue: 40 }),
    target({ targetId: "product-second-p1-gmv", scope: "product", parentTargetId: "series-second-gmv", platformCode: "tmall", storeId: "tmall-second-store", productId: "p1", targetValue: 60 }),
    target({ targetId: "paused-store-gmv", scope: "store", parentTargetId: "company-gmv", platformCode: "tmall", storeId: "tmall-default-store", targetValue: 10, status: "paused" }),
  ],
  legacyTargetCandidates: [{
    schemaVersion: V2_SCHEMA_VERSION,
    legacyTargetId: "legacy-target-kept",
    legacyStorageKey: "airburg_tmall_targets_v1",
    scope: "store",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    periodType: "daily",
    periodValue: "2026-06-18",
    metricKey: "gmv",
    targetValue: 80,
    direction: "higher_is_better",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  }],
  migrationManifests: [manifest()],
  activeDatasetPointer: null,
});

const buildSeedPayload = () => {
  const dataset = buildDataset();
  const recordStorePayload: Partial<Record<V2RecordStoreName, PersistedRecordEnvelope<unknown>[]>> = {};
  V2_RECORD_STORE_NAMES.forEach((storeName) => {
    const records = dataset[storeName] as never[];
    recordStorePayload[storeName] = envelopesForDataset(dataset.datasetId, storeName as never, records) as PersistedRecordEnvelope<unknown>[];
  });
  const metadata: V2DatasetMetadata = {
    datasetId: dataset.datasetId,
    manifestId: dataset.migrationManifests[0]!.migrationManifestId,
    businessDatasetFingerprint: sha256(stablePersistenceStringify(dataset)),
    manifestFingerprint: sha256(stablePersistenceStringify(dataset.migrationManifests[0])),
    importBatchId: dataset.migrationManifests[0]!.importBatchId,
    migrationVersion: dataset.migrationManifests[0]!.migrationVersion,
    status: "active",
    recordCounts: countStagingDatasetRecords({ ...dataset, activeDatasetPointer: null }),
    preparedAt: NOW,
    validatedAt: NOW,
    activatedAt: NOW,
    failedAt: null,
    safeIssueCodes: [],
  };
  const pointer: ActiveDatasetPointer = {
    schemaVersion: V2_SCHEMA_VERSION,
    pointerId: "default",
    state: "v2_active",
    datasetId: dataset.datasetId,
    migrationManifestId: dataset.migrationManifests[0]!.migrationManifestId,
    activatedAt: NOW,
  };
  return {
    dataset,
    metadata,
    pointer,
    recordKeys: collectDatasetRecordKeys(dataset),
    recordStorePayload,
  };
};

const seedAuditDatabase = async (client: CdpClient): Promise<{ targetCount: number; recordKeys: number }> => {
  const payload = buildSeedPayload();
  return client.evaluate<{ targetCount: number; recordKeys: number }>(`
    (async () => {
      const databaseName = ${JSON.stringify(DATABASE_NAME)};
      const version = ${V2_INDEXEDDB_VERSION};
      const objectStores = ${JSON.stringify(V2_OBJECT_STORE_NAMES)};
      const recordStores = ${JSON.stringify(V2_RECORD_STORE_NAMES)};
      const envelopeIndexes = ${JSON.stringify(V2_ENVELOPE_INDEXES)};
      const metadataIndexes = ${JSON.stringify(V2_METADATA_INDEXES)};
      const datasetMetadataIndexes = ${JSON.stringify(V2_DATASET_METADATA_INDEXES)};
      const activationJournalIndexes = ${JSON.stringify(V2_ACTIVATION_JOURNAL_INDEXES)};
      const recordsByStore = ${JSON.stringify(payload.recordStorePayload)};
      const metadata = ${JSON.stringify(payload.metadata)};
      const pointer = ${JSON.stringify(payload.pointer)};
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      });
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, version);
        request.onupgradeneeded = () => {
          const db = request.result;
          const createStore = (storeName, keyPath, indexes) => {
            if (!db.objectStoreNames.contains(storeName)) {
              const store = db.createObjectStore(storeName, { keyPath });
              indexes.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
            }
          };
          createStore("metadata", "key", metadataIndexes);
          createStore("datasetMetadata", "datasetId", datasetMetadataIndexes);
          createStore("activationJournal", "journalId", activationJournalIndexes);
          recordStores.forEach((storeName) => createStore(storeName, "id", envelopeIndexes));
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("open_failed"));
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(objectStores, "readwrite");
        Object.entries(recordsByStore).forEach(([storeName, envelopes]) => {
          const store = tx.objectStore(storeName);
          envelopes.forEach((envelope) => store.put(envelope));
        });
        tx.objectStore("datasetMetadata").put(metadata);
        tx.objectStore("metadata").put({ key: ${JSON.stringify(V2_ACTIVE_POINTER_KEY)}, value: pointer });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("tx_failed"));
        tx.onabort = () => reject(tx.error || new Error("tx_aborted"));
      });
      db.close();
      return { targetCount: recordsByStore.targets.length, recordKeys: ${payload.recordKeys.length} };
    })()
  `, true);
};

const setSession = async (client: CdpClient): Promise<void> => {
  await client.evaluate<void>(`
    localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "f5-r1-audit", loggedInAt: new Date().toISOString() }));
    localStorage.setItem("airburg_tmall_targets_v1", JSON.stringify([{ legacyTargetId: "legacy-target-kept" }]));
  `);
};

const launchChrome = async (chromePath: string, baseUrl: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
}> => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05f5r1-chrome-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--window-size=1440,1000",
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    `${baseUrl}/login`,
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const debugPort = await waitForDevToolsPort(userDataDir);
  const target = await getPageTarget(debugPort);
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.open();
  await client.enable();
  return { client, process: child, userDataDir };
};

const removeAuditDatabase = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(`
    new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    })
  `, true).catch(() => false);

const runRuntime = async () => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  if (String(DATABASE_NAME) === String(PRODUCTION_DATABASE_NAME)) throw new Error("audit_database_must_not_be_production");
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05f5r1-screenshots-"));
  const next = await startNextDev();
  let chromeProcess: ChildProcess | null = null;
  let userDataDir: string | null = null;
  let client: CdpClient | null = null;
  const checks: Check[] = [];
  const screenshots: Array<{ key: string; route: string; viewport: string; filePath: string; sha256: string }> = [];

  try {
    const launched = await launchChrome(chromePath, next.baseUrl);
    client = launched.client;
    chromeProcess = launched.process;
    userDataDir = launched.userDataDir;
    await setSession(client);
    const seed = await seedAuditDatabase(client);
    checks.push({ name: "audit database seeded", pass: seed.targetCount === 8 && seed.recordKeys > 0, detail: seed });

    const texts: string[] = [];
    const mobileOverflow: boolean[] = [];
    for (const [key, route, width, height] of ROUTES) {
      await client.navigate(`${next.baseUrl}${route}`);
      const bodyText = await client.evaluate<string>("document.body.innerText || ''");
      texts.push(bodyText);
      const filePath = path.join(screenshotDir, `${key}.png`);
      const hash = await client.captureScreenshot(filePath, width, height);
      screenshots.push({ key, route, viewport: `${width}x${height}`, filePath, sha256: hash });
      if (width === 390) {
        const noOverflow = await client.evaluate<boolean>(
          "Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1",
        );
        mobileOverflow.push(noOverflow);
      }
    }

    const fullText = texts.join("\n");
    const noSensitive = SENSITIVE_TERMS.every((term) => !fullText.includes(term));
    const noInvalidNumbers = !/\bNaN\b|\bInfinity\b|\bundefined\b/.test(fullText);
    const noDevTerms = !/\bV2\b|dataset|pointer|readback|staging|active V2/i.test(fullText);
    const targetsText = texts[2] ?? "";
    const boardTargetsVisible = texts.slice(3, 9).every((text) => text.includes("目标"));
    const keyPagesOpened = [
      "经营命令中心",
      "目标管理",
      "店铺看板",
      "系列看板",
      "宝贝看板",
    ].every((term) => fullText.includes(term));
    const buttonTypes = await client.evaluate<boolean>(
      "[...document.querySelectorAll('button')].every((button) => button.getAttribute('type'))",
    );
    const consoleBusinessIssues = client.consoleEvents
      .filter((item) => /(error|warning|warn|exception)/i.test(item))
      .filter((item) => !/favicon|chrome-extension|Download the React DevTools|Failed to load resource: the server responded with a status of 404/i.test(item));
    const auditDatabaseDeleted = await removeAuditDatabase(client);

    checks.push({ name: "target page shows four scopes", pass: ["公司", "店铺", "系列", "商品"].every((term) => targetsText.includes(term)) });
    checks.push({ name: "board pages show target summaries", pass: boardTargetsVisible });
    checks.push({ name: "key pages opened", pass: keyPagesOpened });
    checks.push({ name: "390px no whole page overflow", pass: mobileOverflow.length >= 5 && mobileOverflow.every(Boolean) });
    checks.push({ name: "privacy safe visible text", pass: noSensitive });
    checks.push({ name: "number safe visible text", pass: noInvalidNumbers });
    checks.push({ name: "no internal dev terms", pass: noDevTerms });
    checks.push({ name: "buttons have type", pass: buttonTypes });
    checks.push({ name: "no business console issues", pass: consoleBusinessIssues.length === 0, detail: consoleBusinessIssues.slice(0, 5) });
    checks.push({ name: "audit database deleted", pass: auditDatabaseDeleted });
  } finally {
    await client?.close().catch(() => undefined);
    await stopProcess(chromeProcess);
    await stopProcess(next.process);
    next.restoreNextEnv();
    if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    taskId: TASK_ID,
    databaseName: DATABASE_NAME,
    productionDatabaseName: PRODUCTION_DATABASE_NAME,
    generatedAt: new Date().toISOString(),
    screenshots,
  }, null, 2));

  return {
    checks,
    screenshotManifestPath: manifestPath,
    screenshotCount: screenshots.length,
  };
};

const main = async () => {
  const runtime = await runRuntime();
  const checks = [
    ...runtime.checks,
    { name: "screenshot manifest complete", pass: runtime.screenshotCount === ROUTES.length && fs.existsSync(runtime.screenshotManifestPath), detail: runtime.screenshotManifestPath },
    { name: "production database untouched", pass: String(DATABASE_NAME) !== String(PRODUCTION_DATABASE_NAME) },
  ];
  const failedChecks = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05f-final-browser-runtime",
    taskId: TASK_ID,
    databaseName: DATABASE_NAME,
    screenshotManifestPath: runtime.screenshotManifestPath,
    screenshotCount: runtime.screenshotCount,
    mobile390NoOverflow: checks.find((check) => check.name === "390px no whole page overflow")?.pass === true,
    privacyPass: checks.find((check) => check.name === "privacy safe visible text")?.pass === true,
    numberSafetyPass: checks.find((check) => check.name === "number safe visible text")?.pass === true,
    productionDatabaseUntouched: String(DATABASE_NAME) !== String(PRODUCTION_DATABASE_NAME),
    failedChecks: failedChecks.map((check) => ({ name: check.name, detail: check.detail ?? null })),
    checks,
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

void main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05f-final-browser-runtime",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
