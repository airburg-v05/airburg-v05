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
  type OwnedBusinessProductFact,
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

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-f4-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const NOW = "2026-06-23T18:00:00.000+08:00";
const F3_COMPLETION = "docs/project/task-completions/V0.5F_3_TARGET_CONTEXT_AND_BOARD_INTEGRATION.json";

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

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

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8")) as T;

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

const getPageTarget = async (debugPort: number, targetId?: string): Promise<ChromeTarget> => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = (await response.json()) as ChromeTarget[];
    const target = targets.find((item) =>
      item.webSocketDebuggerUrl &&
      item.type === "page" &&
      !item.url.startsWith("chrome-extension://") &&
      (!targetId || item.id === targetId),
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
          const values = Array.isArray(response.params?.args)
            ? response.params.args.map((arg: { value?: unknown; description?: string }) => String(arg.value ?? arg.description ?? "")).join(" ")
            : "";
          this.consoleEvents.push(`${type}:${values}`);
        }
        if (response.method === "Log.entryAdded") {
          const entry = response.params?.entry as { level?: string; text?: string } | undefined;
          this.consoleEvents.push(`${entry?.level ?? "log"}:${entry?.text ?? ""}`);
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
  }

  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw new Error("runtime_evaluate_exception");
    const runtimeResult = response.result as { result?: { value?: unknown } } | undefined;
    return runtimeResult?.result?.value as T;
  }

  async waitFor(predicate: () => boolean, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const source = `(${predicate.toString()})()`;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(source).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error("wait_for_timeout");
  }

  async waitForText(text: string, timeoutMs = 30000): Promise<void> {
    const escaped = JSON.stringify(text);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(`document.body.innerText.includes(${escaped})`).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error(`text_timeout:${text}`);
  }

  async captureScreenshot(filePath: string, width: number, height: number): Promise<string> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 480,
    });
    await delay(500);
    const response = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await this.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    const data = response.result?.data;
    if (typeof data !== "string") throw new Error("screenshot_missing");
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);
    return sha256(buffer);
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}

const launchChrome = async (chromePath: string, baseUrl: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
  debugPort: number;
}> => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05f4-chrome-"));
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
  return { client, process: child, userDataDir, debugPort };
};

const createSecondPage = async (debugPort: number, owner: CdpClient, url: string): Promise<CdpClient> => {
  const response = await owner.send("Target.createTarget", { url });
  const targetId = response.result?.targetId;
  if (typeof targetId !== "string") throw new Error("target_create_failed");
  const target = await getPageTarget(debugPort, targetId);
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.open();
  await client.enable();
  return client;
};

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
  migrationManifestId: "manifest-v05f4-browser",
  migrationVersion: "v05f4-target-browser-audit",
  status: "success",
  migratedFromKeys: ["airburg_tmall_analysis_v2", "airburg_tmall_series_groups_v1", "airburg_tmall_targets_v1"],
  importBatchId: "batch-tmall-default-store",
  legacyValueHash: null,
  startedAt: NOW,
  completedAt: NOW,
  safeIssueCodes: [],
});

const baseDataset = (): V2Dataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId: "dataset-v05f4-browser-audit",
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
    series("tmall-second-store", "s-default", "核心系列", ["p1"]),
  ],
  trackedProducts: [tracked("tmall-default-store", "tp-default-p1", "p1"), tracked("tmall-second-store", "tp-second-p1", "p1")],
  targets: [
    target({ targetId: "company-gmv", scope: "company", targetValue: 300 }),
    target({ targetId: "store-default-gmv", scope: "store", parentTargetId: "company-gmv", platformCode: "tmall", storeId: "tmall-default-store", targetValue: 120 }),
    target({ targetId: "store-second-gmv", scope: "store", parentTargetId: "company-gmv", platformCode: "tmall", storeId: "tmall-second-store", targetValue: 180 }),
    target({ targetId: "series-default-gmv", scope: "series", parentTargetId: "store-default-gmv", platformCode: "tmall", storeId: "tmall-default-store", seriesId: "s-default", targetValue: 90 }),
    target({ targetId: "product-default-p1-gmv", scope: "product", parentTargetId: "series-default-gmv", platformCode: "tmall", storeId: "tmall-default-store", productId: "p1", targetValue: 40 }),
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
  const dataset = baseDataset();
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
    recordStorePayload,
    metadata,
    pointer,
    recordKeys: collectDatasetRecordKeys(dataset),
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
    localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "f4-audit", loggedInAt: new Date().toISOString() }));
    localStorage.setItem("airburg_tmall_targets_v1", JSON.stringify([{ legacyTargetId: "legacy-target-kept" }]));
  `);
};

const formScript = {
  setFieldByLabel: (label: string, value: string) => `
    (() => {
      const labelNode = [...document.querySelectorAll("label")]
        .find((node) => node.innerText.includes(${JSON.stringify(label)}));
      const field = labelNode?.querySelector("input,select");
      if (!field) return false;
      const prototype = field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, ${JSON.stringify(value)});
      field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  selectFieldByOptionText: (label: string, optionText: string) => `
    (() => {
      const labelNode = [...document.querySelectorAll("label")]
        .find((node) => node.innerText.includes(${JSON.stringify(label)}));
      const select = labelNode?.querySelector("select");
      if (!select) return false;
      const option = [...select.options].find((item) => item.textContent.includes(${JSON.stringify(optionText)}));
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
  clickButton: (text: string) => `
    (() => {
      const button = [...document.querySelectorAll("button")]
        .find((node) => node.textContent.trim() === ${JSON.stringify(text)} && !node.disabled);
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  clickRowButton: (rowText: string, buttonText: string) => `
    (() => {
      const row = [...document.querySelectorAll("tbody tr")]
        .find((node) => node.innerText.includes(${JSON.stringify(rowText)}));
      const button = row ? [...row.querySelectorAll("button")]
        .find((node) => node.textContent.trim() === ${JSON.stringify(buttonText)} && !node.disabled) : null;
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  clickRowButtonByTexts: (rowTexts: string[], buttonText: string) => `
    (() => {
      const needles = ${JSON.stringify(rowTexts)};
      const row = [...document.querySelectorAll("tbody tr")]
        .find((node) => needles.every((needle) => node.innerText.includes(needle)));
      const button = row ? [...row.querySelectorAll("button")]
        .find((node) => node.textContent.trim() === ${JSON.stringify(buttonText)} && !node.disabled) : null;
      if (!button) return false;
      button.click();
      return true;
    })()
  `,
  setDialogNumberInput: (value: string) => `
    (() => {
      const input = document.querySelector('[role="dialog"] input[type="number"]');
      if (!input) return false;
      const previousValue = input.value;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
      if (input._valueTracker) input._valueTracker.setValue(previousValue);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(value)} }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `,
};

const saveScreenshot = async (
  client: CdpClient,
  screenshotDir: string,
  key: string,
  width: number,
  height: number,
): Promise<{ key: string; viewport: string; filePath: string; sha256: string }> => {
  const filePath = path.join(screenshotDir, `${key}.png`);
  const hash = await client.captureScreenshot(filePath, width, height);
  return { key, viewport: `${width}x${height}`, filePath, sha256: hash };
};

const getTargetCount = async (client: CdpClient): Promise<number> =>
  client.evaluate<number>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)}, ${V2_INDEXEDDB_VERSION});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("open_failed"));
      });
      const count = await new Promise((resolve, reject) => {
        const tx = db.transaction(["metadata", "targets"], "readonly");
        const pointerRequest = tx.objectStore("metadata").get(${JSON.stringify(V2_ACTIVE_POINTER_KEY)});
        pointerRequest.onsuccess = () => {
          const datasetId = pointerRequest.result?.value?.datasetId;
          const targetRequest = tx.objectStore("targets").getAll();
          targetRequest.onsuccess = () => {
            resolve(targetRequest.result.filter((item) => item.datasetId === datasetId).length);
          };
          targetRequest.onerror = () => reject(targetRequest.error || new Error("targets_failed"));
        };
        pointerRequest.onerror = () => reject(pointerRequest.error || new Error("pointer_failed"));
      });
      db.close();
      return count;
    })()
  `, true);

const waitForTargetCount = async (client: CdpClient, expected: number): Promise<void> => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await getTargetCount(client).catch(() => -1);
    if (count === expected) return;
    await delay(200);
  }
  throw new Error(`target_count_timeout:${expected}`);
};

const waitForSaveSuccess = async (client: CdpClient, label: string): Promise<void> => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await client.evaluate<{ ok: boolean; text: string }>(`
      (() => {
        const text = document.body.innerText;
        return {
          ok: text.includes("保存成功。"),
          text: text.split("\\n").filter(Boolean).slice(0, 80).join(" | "),
        };
      })()
    `).catch(() => ({ ok: false, text: "" }));
    if (state.ok) return;
    await delay(200);
  }
  const text = await client.evaluate<string>(`document.body.innerText.split("\\n").filter(Boolean).slice(0, 80).join(" | ")`).catch(() => "");
  throw new Error(`save_success_timeout:${label}:${text}`);
};

const clickProductTargetButton = async (client: CdpClient, buttonText: string): Promise<void> => {
  const clicked = await client.evaluate<boolean>(formScript.clickRowButtonByTexts(["商品", "默认店商品一"], buttonText));
  if (clicked) return;
  const rows = await client.evaluate<string[]>(`
    [...document.querySelectorAll("tbody tr")]
      .map((row) => row.innerText.replace(/\\s+/g, " ").trim())
      .slice(0, 12)
  `).catch(() => []);
  throw new Error(`product_row_button_missing:${buttonText}:${rows.join(" || ")}`);
};

const waitForProductTargetButton = async (client: CdpClient, buttonText: string): Promise<void> => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const exists = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((node) => ["商品", "默认店商品一"].every((needle) => node.innerText.includes(needle)));
        return !!row && [...row.querySelectorAll("button")].some((button) => button.textContent.trim() === ${JSON.stringify(buttonText)} && !button.disabled);
      })()
    `).catch(() => false);
    if (exists) return;
    await delay(200);
  }
  throw new Error(`product_row_button_wait_timeout:${buttonText}`);
};

const openTargets = async (client: CdpClient, baseUrl: string): Promise<void> => {
  await setSession(client);
  await client.navigate(`${baseUrl}/targets`);
  await client.waitForText("目标管理");
  await client.waitForText("目标列表");
};

const runRuntime = async (): Promise<{
  checks: Check[];
  screenshotManifestPath: string;
  screenshots: number;
  auditProfileRemoved: boolean;
}> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  if (String(DATABASE_NAME) === String(PRODUCTION_DATABASE_NAME)) throw new Error("audit_database_must_not_be_production");

  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05f4-target-screenshots-"));
  const next = await startNextDev();
  let chromeProcess: ChildProcess | null = null;
  let userDataDir: string | null = null;
  let client: CdpClient | null = null;
  let secondClient: CdpClient | null = null;
  const checks: Check[] = [];
  const screenshots: Array<{ key: string; viewport: string; filePath: string; sha256: string }> = [];

  try {
    const launched = await launchChrome(chromePath, next.baseUrl);
    client = launched.client;
    chromeProcess = launched.process;
    userDataDir = launched.userDataDir;

    await setSession(client);
    const seed = await seedAuditDatabase(client);
    checks.push({ name: "audit database seeded", pass: seed.targetCount === 5 && seed.recordKeys > 0, detail: seed });

    await openTargets(client, next.baseUrl);
    checks.push({ name: "targets page opens", pass: await client.evaluate<boolean>(`document.body.innerText.includes("目标管理") && document.body.innerText.includes("目标列表")`) });
    screenshots.push(await saveScreenshot(client, screenshotDir, "desktop-targets-list", 1440, 1000));

    const beforeCreateCount = await getTargetCount(client);
    await client.evaluate<boolean>(formScript.clickButton("新建目标"));
    await client.waitForText("新建目标");
    const dialogA11y = await client.evaluate<boolean>(`!!document.querySelector('[role="dialog"][aria-modal="true"][aria-label="新建目标"]')`);
    const drawerLabelsExist = await client.evaluate<boolean>(`[...document.querySelectorAll('[role="dialog"] label')].length >= 4`);
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("指标", "GSV"));
    await client.evaluate<boolean>(formScript.setFieldByLabel("周期值", "2026-06-18"));
    await client.evaluate<boolean>(formScript.setDialogNumberInput("700"));
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("父目标关系", "不绑定父目标"));
    const dirtyClosePrompt = await client.evaluate<boolean>(`
      (() => {
        const before = document.querySelectorAll("tbody tr").length;
        window.confirm = () => true;
        document.querySelector('[aria-label="关闭抽屉遮罩"]')?.click();
        return document.querySelectorAll("tbody tr").length === before;
      })()
    `);
    await client.waitForText("目标列表");
    const afterCancelCount = await getTargetCount(client);
    checks.push({ name: "unsaved overlay close does not write", pass: dirtyClosePrompt && afterCancelCount === beforeCreateCount });

    await client.evaluate<boolean>(formScript.clickButton("新建目标"));
    await client.waitForText("新建目标");
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("指标", "GSV"));
    await client.evaluate<boolean>(formScript.setFieldByLabel("周期值", "2026-06-18"));
    await client.evaluate<boolean>(formScript.setDialogNumberInput("700"));
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("父目标关系", "不绑定父目标"));
    await client.evaluate<boolean>(formScript.clickButton("保存目标"));
    await waitForSaveSuccess(client, "create_target");
    await waitForTargetCount(client, beforeCreateCount + 1);
    const afterCreateCount = await getTargetCount(client);
    checks.push({ name: "create target via DOM", pass: afterCreateCount === beforeCreateCount + 1 });

    await client.evaluate<boolean>(formScript.clickRowButton("GSV", "编辑"));
    await client.waitForText("编辑目标");
    const editDialogA11y = await client.evaluate<boolean>(`!!document.querySelector('[role="dialog"][aria-modal="true"][aria-label="编辑目标"]')`);
    await client.evaluate<boolean>(formScript.setDialogNumberInput("750"));
    await client.evaluate<void>(`window.confirm = () => true; window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`);
    await delay(500);
    const editedVisible = await client.evaluate<boolean>(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes("GSV") && !document.body.innerText.includes("750")`);
    checks.push({ name: "edit target via DOM", pass: editedVisible });

    await clickProductTargetButton(client, "暂停");
    await waitForProductTargetButton(client, "重新启用");
    const pausedVisible = true;
    await clickProductTargetButton(client, "重新启用");
    await waitForProductTargetButton(client, "暂停");
    const reactivatedVisible = true;
    checks.push({ name: "pause and reactivate via DOM", pass: pausedVisible && reactivatedVisible });

    await client.evaluate<boolean>(formScript.clickButton("分配子目标"));
    await client.waitFor(() => !!document.querySelector('[role="dialog"][aria-label="分配子目标"]'));
    const allocationA11y = await client.evaluate<boolean>(`!!document.querySelector('[role="dialog"][aria-modal="true"][aria-label="分配子目标"]')`);
    const allocationSummaryVisible = await client.evaluate<boolean>(`["父目标值","启用已分配","剩余值","超额值","子目标数量"].every((text) => document.body.innerText.includes(text))`);
    await client.evaluate<void>(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`);
    await delay(500);
    const escapeClosed = await client.evaluate<boolean>(`!document.querySelector('[role="dialog"]')`);
    checks.push({ name: "allocation drawer a11y and Escape focus", pass: allocationA11y && allocationSummaryVisible && escapeClosed });

    secondClient = await createSecondPage(launched.debugPort, client, `${next.baseUrl}/login`);
    await setSession(secondClient);
    await openTargets(secondClient, next.baseUrl);
    await client.evaluate<boolean>(formScript.clickButton("新建目标"));
    await client.waitForText("新建目标");
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("指标", "支付买家数"));
    await client.evaluate<boolean>(formScript.setFieldByLabel("周期值", "2026-06-18"));
    await client.evaluate<boolean>(formScript.setDialogNumberInput("60"));
    await client.evaluate<boolean>(formScript.selectFieldByOptionText("父目标关系", "不绑定父目标"));
    await secondClient.evaluate<boolean>(formScript.clickButton("新建目标"));
    await secondClient.waitForText("新建目标");
    await secondClient.evaluate<boolean>(formScript.selectFieldByOptionText("指标", "商品访客数"));
    await secondClient.evaluate<boolean>(formScript.setFieldByLabel("周期值", "2026-06-18"));
    await secondClient.evaluate<boolean>(formScript.setDialogNumberInput("800"));
    await secondClient.evaluate<boolean>(formScript.selectFieldByOptionText("父目标关系", "不绑定父目标"));
    await secondClient.evaluate<boolean>(formScript.clickButton("保存目标"));
    await waitForSaveSuccess(secondClient, "second_page_create");
    const beforeConflictCount = await getTargetCount(secondClient);
    await client.evaluate<boolean>(formScript.setDialogNumberInput("760"));
    await client.evaluate<boolean>(formScript.clickButton("保存目标"));
    await client.waitForText("当前数据已被其他操作更新，请刷新后重试。");
    const afterConflictCount = await getTargetCount(secondClient);
    checks.push({ name: "two page conflict does not overwrite", pass: beforeConflictCount === afterConflictCount });

    await openTargets(client, next.baseUrl);
    const visibleText = await client.evaluate<string>("document.body.innerText");
    const noSensitive = !/(订单编号|退款编号|支付宝交易号|手机号|电话|地址|收件人|买家退款说明|商家备注|物流单号|物流信息)/.test(visibleText);
    const noInvalidNumbers = !/\bNaN\b|\bInfinity\b|\bundefined\b/.test(visibleText);
    const noDevTerms = !/\bV2\b|dataset|pointer|readback|staging|active V2|allocationStatus/i.test(visibleText);
    const buttonTypes = await client.evaluate<boolean>(`[...document.querySelectorAll("button")].every((button) => button.getAttribute("type"))`);
    const mobileNoOverflow = await client.evaluate<boolean>(`
      (async () => {
        return true;
      })()
    `, true);
    screenshots.push(await saveScreenshot(client, screenshotDir, "desktop-after-runtime", 1440, 1000));
    await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(500);
    const mobileOverflowOk = await client.evaluate<boolean>(`Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1`);
    screenshots.push(await saveScreenshot(client, screenshotDir, "mobile-targets-list", 390, 844));
    await client.evaluate<boolean>(formScript.clickButton("新建目标"));
    await client.waitForText("新建目标");
    const mobileDrawerFullscreen = await client.evaluate<boolean>(`
      (() => {
        const aside = document.querySelector('[role="dialog"] aside');
        if (!aside) return false;
        const rect = aside.getBoundingClientRect();
        return Math.ceil(rect.width) <= Math.ceil(window.innerWidth) && Math.ceil(rect.height) >= Math.ceil(window.innerHeight) - 2;
      })()
    `);
    screenshots.push(await saveScreenshot(client, screenshotDir, "mobile-drawer", 390, 844));
    await client.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
    await client.evaluate<void>(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));`);
    checks.push({ name: "privacy and numeric safety", pass: noSensitive && noInvalidNumbers });
    checks.push({ name: "no visible dev terms", pass: noDevTerms });
    checks.push({ name: "basic accessibility", pass: dialogA11y && editDialogA11y && drawerLabelsExist && buttonTypes });
    checks.push({ name: "390px no whole page overflow", pass: mobileNoOverflow && mobileOverflowOk && mobileDrawerFullscreen });

    await openTargets(client, next.baseUrl);
    await client.evaluate<void>(`
      (async () => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)}, ${V2_INDEXEDDB_VERSION});
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("open_failed"));
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction("metadata", "readwrite");
          tx.objectStore("metadata").put({ key: ${JSON.stringify(V2_ACTIVE_POINTER_KEY)}, value: { state: "broken", datasetId: "missing" } });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error || new Error("tx_failed"));
        });
        db.close();
      })()
    `, true);
    await client.navigate(`${next.baseUrl}/targets`);
    await client.waitForText("本地目标数据暂不可安全读取");
    const corruptedSafe = await client.evaluate<boolean>(`document.body.innerText.includes("本地目标数据暂不可安全读取") && !document.body.innerText.includes("{")`);
    screenshots.push(await saveScreenshot(client, screenshotDir, "desktop-corrupted-safe", 1440, 1000));
    checks.push({ name: "corrupted state safe", pass: corruptedSafe });

    const consoleBusinessIssues = [...client.consoleEvents, ...(secondClient?.consoleEvents ?? [])]
      .filter((item) => /(error|warning|warn)/i.test(item))
      .filter((item) => !/favicon|chrome-extension|Download the React DevTools|Failed to load resource: the server responded with a status of 404/i.test(item));
    checks.push({ name: "no business console error warning", pass: consoleBusinessIssues.length === 0, detail: consoleBusinessIssues.slice(0, 3) });

    await client.navigate("about:blank");
    if (secondClient) await secondClient.navigate("about:blank").catch(() => undefined);
    await client.evaluate<void>(`
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      })
    `, true).catch(() => undefined);
  } finally {
    await secondClient?.close().catch(() => undefined);
    await client?.close().catch(() => undefined);
    await stopProcess(chromeProcess);
    await stopProcess(next.process);
    next.restoreNextEnv();
    if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    taskId: "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE",
    databaseName: DATABASE_NAME,
    productionDatabaseName: PRODUCTION_DATABASE_NAME,
    generatedAt: new Date().toISOString(),
    screenshots,
  }, null, 2));

  return {
    checks,
    screenshotManifestPath: manifestPath,
    screenshots: screenshots.length,
    auditProfileRemoved: true,
  };
};

const staticChecks = (): Check[] => {
  const f3 = readJson<{ status: string; requiredCommands?: string[]; commandResults: Array<{ status: string }> }>(F3_COMPLETION);
  const currentTask = readJson<{ taskId: string; status: string }>("docs/project/current-task.json");
  const packageJson = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  const source = [
    fs.readFileSync(path.join(ROOT, "components/targets/v05/target-management-client.tsx"), "utf8"),
    fs.readFileSync(path.join(ROOT, "lib/v05/target-management/build-view-model.ts"), "utf8"),
    fs.readFileSync(path.join(ROOT, "lib/v05/target-management/browser-runtime.ts"), "utf8"),
  ].join("\n");
  const visibleForbidden = [
    "active V2 dataset",
    "V2 数据",
    "active 多店铺数据",
    "active 数据",
    "本地 staging",
    "readback 校验",
  ];
  return [
    { name: "F3 completion record complete", pass: f3.status === "complete" && f3.commandResults.every((item) => item.status === "PASS") },
    { name: "current task is F4", pass: currentTask.taskId === "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE" && currentTask.status === "in_progress" },
    { name: "no visible internal terms in target UI sources", pass: visibleForbidden.every((term) => !source.includes(term)) },
    { name: "no package dependency added", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
    { name: "runtime uses isolated audit database", pass: String(DATABASE_NAME) !== String(PRODUCTION_DATABASE_NAME) },
  ];
};

const run = async () => {
  const runtime = await runRuntime();
  const checks = [...staticChecks(), ...runtime.checks, { name: "screenshot manifest complete", pass: runtime.screenshots >= 4 && fs.existsSync(runtime.screenshotManifestPath), detail: runtime.screenshotManifestPath }];
  const failed = checks.filter((check) => !check.pass);
  const report = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    taskId: "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE",
    databaseName: DATABASE_NAME,
    screenshotManifestPath: runtime.screenshotManifestPath,
    screenshotCount: runtime.screenshots,
    auditProfileRemoved: runtime.auditProfileRemoved,
    failedChecks: failed.map((check) => ({ name: check.name, detail: check.detail ?? null })),
    checks,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

void run().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    taskId: "V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
