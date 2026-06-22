import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  V2_SCHEMA_VERSION,
  collectDatasetRecordKeys,
  type DryRunRecordCounts,
  type MigrationManifest,
  type PreparedV2Dataset,
  type V2Dataset,
  type V2DatasetMetadata,
} from "../../lib/v05";

const ROOT = process.cwd();
const TASK_ID = "V0.5F_0_TARGET_HIERARCHY_CONTRACT_AND_STORAGE_READINESS";
const DATABASE_NAME = "airburg-v05-f0-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const BASELINE_OBJECT_STORE_COUNT = 19;
const BASELINE_DATABASE_VERSION = 1;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface BrowserInput {
  databaseName: string;
  productionDatabaseName: string;
  prepared: PreparedV2Dataset;
  reparentedPrepared: PreparedV2Dataset;
  failedPrepared: PreparedV2Dataset;
  expectedRecordKeys: string[];
  reparentedExpectedRecordKeys: string[];
}

interface BrowserResult {
  status?: "PASS" | "FAIL";
  schemaObjectStoreCount?: number;
  databaseVersion?: number;
  objectStoresUnchanged?: boolean;
  databaseVersionUnchanged?: boolean;
  oldStyleRoundTrip?: boolean;
  parentTargetIdRoundTrip?: boolean;
  prepareStatus?: string;
  readbackStatus?: string;
  activateStatus?: string;
  idempotentPrepareStatus?: string;
  fingerprintChangesWithParent?: boolean;
  conflictStatus?: string;
  conflictDoesNotOverwrite?: boolean;
  failedPrepareStatus?: string;
  failedPrepareNoPartialWrite?: boolean;
  otherRecordsPreserved?: boolean;
  legacyKeysUnchanged?: boolean;
  auditDatabaseDeleted?: boolean;
  productionDatabaseUntouched?: boolean;
  privacyPass?: boolean;
  numberSafetyPass?: boolean;
  errorCode?: string | null;
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const target = ({
  targetId,
  scope,
  ...overrides
}: Partial<V2Dataset["targets"][number]> & Pick<V2Dataset["targets"][number], "targetId" | "scope">): V2Dataset["targets"][number] => ({
  schemaVersion: V2_SCHEMA_VERSION,
  targetId,
  scope,
  metricKey: "gmv",
  periodType: "daily",
  periodValue: "2026-06-18",
  targetValue: 100,
  direction: "higher_is_better",
  status: "active",
  createdAt: "2026-06-23T00:00:00+08:00",
  updatedAt: "2026-06-23T00:00:00+08:00",
  ...overrides,
});

const baseDataset = (datasetId: string, parentProductTargetId: string | null, includeOldStyleTarget = true): V2Dataset => {
  const company = target({ targetId: "company-gmv", scope: "company", parentTargetId: null, targetValue: 300 });
  const store = target({
    targetId: "store-gmv",
    scope: "store",
    parentTargetId: "company-gmv",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    targetValue: 180,
  });
  const series = target({
    targetId: "series-gmv",
    scope: "series",
    parentTargetId: "store-gmv",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    seriesId: "series-core",
    targetValue: 120,
  });
  const product = target({
    targetId: "product-gmv",
    scope: "product",
    parentTargetId: parentProductTargetId,
    platformCode: "tmall",
    storeId: "tmall-default-store",
    productId: "product-1",
    targetValue: 70,
  });
  const oldStyle = target({
    targetId: "legacy-standalone-store",
    scope: "store",
    platformCode: "tmall",
    storeId: "tmall-default-store",
    metricKey: "adSpend",
    targetValue: 50,
  });
  const oldStyleWithoutParent = { ...oldStyle };
  delete oldStyleWithoutParent.parentTargetId;

  return {
    schemaVersion: V2_SCHEMA_VERSION,
    datasetId,
    platforms: [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      platformName: "天猫",
      status: "active",
      createdAt: "2026-06-23T00:00:00+08:00",
      updatedAt: "2026-06-23T00:00:00+08:00",
    }],
    stores: [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      status: "active",
      createdAt: "2026-06-23T00:00:00+08:00",
      updatedAt: "2026-06-23T00:00:00+08:00",
    }],
    importBatches: [{
      schemaVersion: V2_SCHEMA_VERSION,
      importBatchId: "batch-target-hierarchy",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      importStartedAt: "2026-06-23T00:00:00+08:00",
      importCompletedAt: "2026-06-23T00:01:00+08:00",
      status: "success",
      sourceTypes: ["business_product"],
      createdAt: "2026-06-23T00:00:00+08:00",
      updatedAt: "2026-06-23T00:01:00+08:00",
    }],
    importFiles: [],
    businessProductFacts: [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: "tmall",
      storeId: "tmall-default-store",
      businessDate: "2026-06-18",
      sourceType: "business_product",
      importBatchId: "batch-target-hierarchy",
      productId: "product-1",
      productName: "Product 1",
      gmv: 100,
      gsv: 90,
      visitors: 10,
      paidBuyers: 2,
      paidOrders: 2,
      conversionRate: 0.2,
      avgOrderValue: 50,
      favorites: null,
      cartAdditions: null,
    }],
    adProductFacts: [],
    adPlanFacts: [],
    afterSalesDailyAggregates: [],
    afterSalesRangeAggregates: [],
    afterSalesOperationalSnapshots: [],
    afterSalesDistributionItems: [],
    series: [{
      schemaVersion: V2_SCHEMA_VERSION,
      seriesId: "series-core",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      name: "核心系列",
      productIds: ["product-1"],
      status: "active",
      createdAt: "2026-06-23T00:00:00+08:00",
      updatedAt: "2026-06-23T00:00:00+08:00",
    }],
    trackedProducts: [],
    targets: includeOldStyleTarget ? [company, store, series, product, oldStyleWithoutParent] : [company, store, series, product],
    legacyTargetCandidates: [],
    migrationManifests: [],
    activeDatasetPointer: null,
  };
};

const manifestForDataset = (dataset: V2Dataset): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: `manifest-${dataset.datasetId}`,
  migrationVersion: "v05f0-target-hierarchy-readiness",
  status: "pending",
  migratedFromKeys: [],
  importBatchId: "batch-target-hierarchy",
  legacyValueHash: sha256(dataset.datasetId),
  startedAt: "2026-06-23T00:00:00+08:00",
  completedAt: null,
  safeIssueCodes: [],
});

const countDataset = (dataset: V2Dataset): DryRunRecordCounts => ({
  platforms: dataset.platforms.length,
  stores: dataset.stores.length,
  importBatches: dataset.importBatches.length,
  importFiles: dataset.importFiles.length,
  businessProductFacts: dataset.businessProductFacts.length,
  adProductFacts: dataset.adProductFacts.length,
  adPlanFacts: dataset.adPlanFacts.length,
  afterSalesDailyAggregates: dataset.afterSalesDailyAggregates.length,
  afterSalesRangeAggregates: dataset.afterSalesRangeAggregates.length,
  afterSalesOperationalSnapshots: dataset.afterSalesOperationalSnapshots.length,
  afterSalesDistributionItems: dataset.afterSalesDistributionItems.length,
  series: dataset.series.length,
  trackedProducts: dataset.trackedProducts.length,
  targets: dataset.targets.length,
  legacyTargetCandidates: dataset.legacyTargetCandidates.length,
  migrationManifests: dataset.migrationManifests.length,
});

const preparedForDataset = (dataset: V2Dataset): PreparedV2Dataset => {
  const manifest = manifestForDataset(dataset);
  const datasetWithManifest: V2Dataset = {
    ...dataset,
    migrationManifests: [manifest],
  };
  const fingerprint = sha256(stableStringify(datasetWithManifest.targets));
  const metadata: V2DatasetMetadata = {
    datasetId: datasetWithManifest.datasetId,
    manifestId: manifest.migrationManifestId,
    businessDatasetFingerprint: fingerprint,
    manifestFingerprint: sha256(stableStringify(manifest)),
    importBatchId: manifest.importBatchId,
    migrationVersion: manifest.migrationVersion,
    status: "staging",
    recordCounts: countDataset(datasetWithManifest),
    preparedAt: "2026-06-23T00:00:00+08:00",
    validatedAt: null,
    activatedAt: null,
    failedAt: null,
    safeIssueCodes: [],
  };

  return {
    dryRun: null,
    dataset: datasetWithManifest,
    metadata,
    manifest,
    recordKeys: collectDatasetRecordKeys(datasetWithManifest),
  } as unknown as PreparedV2Dataset;
};

const createBrowserInput = (): BrowserInput => {
  const prepared = preparedForDataset(baseDataset("dataset-parent-series", "series-gmv"));
  const reparentedPrepared = preparedForDataset(baseDataset("dataset-parent-null", null));
  const failedPrepared = preparedForDataset(baseDataset("dataset-failed-prepare", "series-gmv", false));
  return {
    databaseName: DATABASE_NAME,
    productionDatabaseName: PRODUCTION_DATABASE_NAME,
    prepared,
    reparentedPrepared,
    failedPrepared,
    expectedRecordKeys: prepared.recordKeys,
    reparentedExpectedRecordKeys: reparentedPrepared.recordKeys,
  };
};

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const listen = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("server_port_unavailable"));
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

const stopChrome = async (chrome: ChildProcess | null): Promise<void> => {
  if (!chrome || chrome.killed) return;
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => chrome.once("exit", () => resolve())),
    delay(3000),
  ]);
  if (!chrome.killed) chrome.kill("SIGKILL");
};

const waitForDevToolsPort = async (userDataDir: string): Promise<number> => {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      const parsedPort = Number(port);
      if (Number.isFinite(parsedPort)) return parsedPort;
    }
    await delay(100);
  }
  throw new Error("devtools_port_unavailable");
};

interface ChromeTarget {
  url: string;
  webSocketDebuggerUrl: string;
}

interface CdpResponse {
  id?: number;
  result?: {
    result?: {
      value?: unknown;
    };
  };
}

const getPageTarget = async (debugPort: number): Promise<ChromeTarget> => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json() as ChromeTarget[];
    const target = targets.find((item) => item.webSocketDebuggerUrl && item.url.startsWith("http://127.0.0.1:"));
    if (target) return target;
    await delay(100);
  }
  throw new Error("chrome_page_target_unavailable");
};

const evaluateResultFromPage = async (webSocketDebuggerUrl: string): Promise<BrowserResult> =>
  new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined") {
      reject(new Error("websocket_unavailable"));
      return;
    }
    const socket = new WebSocket(webSocketDebuggerUrl);
    let commandId = 0;
    const pending = new Map<number, (response: CdpResponse) => void>();
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("cdp_result_timeout"));
    }, 60000);

    const send = (method: string, params?: Record<string, unknown>): Promise<CdpResponse> => {
      commandId += 1;
      const id = commandId;
      return new Promise((innerResolve) => {
        pending.set(id, innerResolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    };

    socket.onmessage = (event) => {
      const response = JSON.parse(String(event.data)) as CdpResponse;
      if (!response.id) return;
      pending.get(response.id)?.(response);
      pending.delete(response.id);
    };
    socket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("cdp_websocket_error"));
    };
    socket.onopen = async () => {
      try {
        await send("Runtime.enable");
        for (let index = 0; index < 300; index += 1) {
          const response = await send("Runtime.evaluate", {
            expression: "window.__AIRBURG_RESULT__ ? JSON.stringify(window.__AIRBURG_RESULT__) : document.body.textContent",
            returnByValue: true,
          });
          const value = response.result?.result?.value;
          if (typeof value === "string" && value.trim().startsWith("{")) {
            try {
              const parsed = JSON.parse(value) as BrowserResult;
              if (parsed.status === "PASS" || parsed.status === "FAIL") {
                clearTimeout(timeout);
                socket.close();
                resolve(parsed);
                return;
              }
            } catch {
              // Keep polling while the page is still writing its result.
            }
          }
          if (typeof value === "object" && value !== null) {
            const parsed = value as BrowserResult;
            if (parsed.status === "PASS" || parsed.status === "FAIL") {
              clearTimeout(timeout);
              socket.close();
              resolve(parsed);
              return;
            }
          }
          await delay(100);
        }
        throw new Error("page_result_unavailable");
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    };
  });

const findFiles = (directory: string, matcher: (file: string) => boolean, results: string[] = []): string[] => {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) findFiles(absolutePath, matcher, results);
    else if (matcher(absolutePath)) results.push(absolutePath);
  });
  return results;
};

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const runTsc = (args: string[]): void => {
  const tsc = path.join(ROOT, "node_modules/.bin/tsc");
  try {
    execFileSync(tsc, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    throw new Error(`${stdout}\n${stderr}`.trim().slice(0, 2000) || "browser_module_compile_failed");
  }
};

const browserEntrySource = (productionImportPath: string): string => `
import {
  IndexedDbV2PersistenceStore,
  V2_OBJECT_STORE_NAMES,
  V2_INDEXEDDB_VERSION,
  collectDatasetRecordKeys,
  readBackAndValidateV2Dataset,
  activatePreparedV2Dataset,
  deleteIndexedDbDatabase,
  validateV2Dataset,
} from ${JSON.stringify(productionImportPath)};
import type { V2Dataset } from ${JSON.stringify(productionImportPath)};

const legacyKeys = [
  "airburg_tmall_analysis_v2",
  "airburg_tmall_series_groups_v1",
  "airburg_tmall_targets_v1",
  "airburg:last-analysis",
  "airburg:demo-session",
];

const sameArray = (left: readonly unknown[], right: readonly unknown[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const containsInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsInvalidNumber);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some(containsInvalidNumber);
  return false;
};

const inspectDatabaseNames = async () => {
  const databaseList = "databases" in indexedDB ? await indexedDB.databases() : [];
  return databaseList.map((database) => database.name).filter((name): name is string => typeof name === "string").sort();
};

const deleteIfExists = async (databaseName: string) => {
  try { await deleteIndexedDbDatabase(databaseName); } catch {}
};

const targetById = (dataset: V2Dataset | null | undefined, targetId: string) =>
  dataset?.targets.find((target) => target.targetId === targetId) ?? null;

export const runPersistenceIntegration = async (input: any) => {
  const beforeLegacyValues = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
  await deleteIfExists(input.databaseName);
  const store = await IndexedDbV2PersistenceStore.open({ databaseName: input.databaseName });
  try {
    const schema = store.inspectSchema();
    const objectStoresUnchanged = sameArray(schema.objectStoreNames, V2_OBJECT_STORE_NAMES);
    const databaseVersionUnchanged = V2_INDEXEDDB_VERSION === ${BASELINE_DATABASE_VERSION};

    const prepare = await store.prepareDataset(input.prepared);
    const loadedAfterPrepare = await store.loadDataset(input.prepared.dataset.datasetId);
    const oldStyleRoundTrip = !Object.prototype.hasOwnProperty.call(targetById(loadedAfterPrepare, "legacy-standalone-store") ?? {}, "parentTargetId");
    const parentTargetIdRoundTrip = targetById(loadedAfterPrepare, "product-gmv")?.parentTargetId === "series-gmv";
    const readback = await readBackAndValidateV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      validatedAt: "2026-06-23T00:10:00+08:00",
      expectedRecordCounts: input.prepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.prepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.prepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.expectedRecordKeys,
    });
    const activate = await activatePreparedV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      expectedCurrentDatasetId: null,
      activatedAt: "2026-06-23T00:11:00+08:00",
    });
    const idempotentPrepare = await store.prepareDataset(input.prepared);
    const afterIdempotent = await store.loadDataset(input.prepared.dataset.datasetId);

    await store.prepareDataset(input.reparentedPrepared);
    const reparentedReadback = await readBackAndValidateV2Dataset({
      store,
      datasetId: input.reparentedPrepared.dataset.datasetId,
      validatedAt: "2026-06-23T00:12:00+08:00",
      expectedRecordCounts: input.reparentedPrepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.reparentedPrepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.reparentedPrepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.reparentedExpectedRecordKeys,
    });
    const conflict = await activatePreparedV2Dataset({
      store,
      datasetId: input.reparentedPrepared.dataset.datasetId,
      expectedCurrentDatasetId: "stale-dataset-id",
      activatedAt: "2026-06-23T00:13:00+08:00",
    });
    const pointerAfterConflict = await store.getActivePointer();
    const activeAfterConflict = await store.loadActiveDataset();

    const failedPrepare = await store.prepareDataset(input.failedPrepared, "during_record_write");
    const failedLoaded = await store.loadDataset(input.failedPrepared.dataset.datasetId);

    const afterLegacyValues = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
    const databaseNamesBeforeCleanup = await inspectDatabaseNames();
    store.close();
    await deleteIfExists(input.databaseName);
    const databaseNamesAfterCleanup = await inspectDatabaseNames();

    const response = {
      status: "PASS",
      schemaObjectStoreCount: schema.objectStoreNames.length,
      databaseVersion: V2_INDEXEDDB_VERSION,
      objectStoresUnchanged,
      databaseVersionUnchanged,
      oldStyleRoundTrip,
      parentTargetIdRoundTrip,
      prepareStatus: prepare.status,
      readbackStatus: readback.status,
      activateStatus: activate.status,
      idempotentPrepareStatus: idempotentPrepare.status,
      fingerprintChangesWithParent: input.prepared.metadata.businessDatasetFingerprint !== input.reparentedPrepared.metadata.businessDatasetFingerprint,
      conflictStatus: conflict.status,
      conflictDoesNotOverwrite:
        pointerAfterConflict?.datasetId === input.prepared.dataset.datasetId &&
        activeAfterConflict?.datasetId === input.prepared.dataset.datasetId,
      failedPrepareStatus: failedPrepare.status,
      failedPrepareNoPartialWrite: failedLoaded === null,
      otherRecordsPreserved:
        afterIdempotent !== null &&
        validateV2Dataset(afterIdempotent).valid &&
        sameArray(collectDatasetRecordKeys(afterIdempotent), input.expectedRecordKeys) &&
        reparentedReadback.status === "readback_validated",
      legacyKeysUnchanged: JSON.stringify(beforeLegacyValues) === JSON.stringify(afterLegacyValues),
      auditDatabaseDeleted: !databaseNamesAfterCleanup.some((name) => name.startsWith(input.databaseName)),
      productionDatabaseUntouched:
        !databaseNamesBeforeCleanup.includes(input.productionDatabaseName) &&
        !databaseNamesAfterCleanup.includes(input.productionDatabaseName),
      privacyPass: !JSON.stringify({ beforeLegacyValues, afterLegacyValues }).includes("订单编号"),
      numberSafetyPass: !containsInvalidNumber({ loadedAfterPrepare, afterIdempotent }),
      errorCode: null,
    };

    const pass = [
      response.schemaObjectStoreCount === ${BASELINE_OBJECT_STORE_COUNT},
      response.objectStoresUnchanged,
      response.databaseVersionUnchanged,
      response.oldStyleRoundTrip,
      response.parentTargetIdRoundTrip,
      response.prepareStatus === "prepared",
      response.readbackStatus === "readback_validated",
      response.activateStatus === "activated",
      response.idempotentPrepareStatus === "prepared",
      response.fingerprintChangesWithParent,
      response.conflictStatus === "conflict",
      response.conflictDoesNotOverwrite,
      response.failedPrepareStatus === "failed",
      response.failedPrepareNoPartialWrite,
      response.otherRecordsPreserved,
      response.legacyKeysUnchanged,
      response.auditDatabaseDeleted,
      response.productionDatabaseUntouched,
      response.privacyPass,
      response.numberSafetyPass,
    ].every(Boolean);
    return { ...response, status: pass ? "PASS" : "FAIL" };
  } catch (error) {
    store.close();
    await deleteIfExists(input.databaseName);
    return {
      status: "FAIL",
      errorCode: error instanceof Error ? error.message : "browser_persistence_test_failed",
    };
  }
};
`;

const compileBrowserModule = (tempRoot: string): { distDir: string; entryRelativePath: string } => {
  const sourceDir = path.join(tempRoot, "src");
  const distDir = path.join(tempRoot, "dist");
  fs.mkdirSync(sourceDir, { recursive: true });
  const projectIndex = path.join(ROOT, "lib/v05/index");
  let productionImportPath = toPosixPath(path.relative(sourceDir, projectIndex));
  if (!productionImportPath.startsWith(".")) productionImportPath = `./${productionImportPath}`;
  const entryPath = path.join(sourceDir, "entry.ts");
  fs.writeFileSync(entryPath, browserEntrySource(productionImportPath), "utf8");

  runTsc([
    entryPath,
    "--ignoreConfig",
    "--outDir",
    distDir,
    "--rootDir",
    "/",
    "--module",
    "ES2022",
    "--target",
    "ES2022",
    "--moduleResolution",
    "bundler",
    "--skipLibCheck",
    "--lib",
    "ES2022,DOM",
    "--esModuleInterop",
    "--allowSyntheticDefaultImports",
    "--jsx",
    "react-jsx",
    "--noEmitOnError",
    "true",
  ]);

  const entry = findFiles(distDir, (file) => file.endsWith(`${path.sep}entry.js`))[0];
  const productionEntry = findFiles(distDir, (file) => file.endsWith(`${path.sep}lib${path.sep}v05${path.sep}index.js`))[0];
  if (!entry || !productionEntry) throw new Error("compiled_browser_entry_missing");
  const productionEntryRelativePath = toPosixPath(path.relative(distDir, productionEntry));
  const stableEntryPath = path.join(distDir, "_entry.js");
  const stableEntrySource = fs
    .readFileSync(entry, "utf8")
    .replace(
      /from\s+["'][^"']*lib\/v05\/index["']/g,
      `from ${JSON.stringify(`/modules/${productionEntryRelativePath}`)}`,
    );
  fs.writeFileSync(stableEntryPath, stableEntrySource, "utf8");
  return { distDir, entryRelativePath: toPosixPath(path.relative(distDir, stableEntryPath)) };
};

const buildHtml = (entryRelativePath: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>V0.5F-0 Target Hierarchy Persistence</title></head>
<body><pre id="result">pending</pre>
<script>
window.__AIRBURG_RESULT__ = null;
window.onerror = (message) => {
  window.__AIRBURG_RESULT__ = { status: "FAIL", errorCode: String(message) };
  document.getElementById("result").textContent = JSON.stringify(window.__AIRBURG_RESULT__);
};
window.onunhandledrejection = (event) => {
  const reason = event && event.reason;
  window.__AIRBURG_RESULT__ = { status: "FAIL", errorCode: reason && reason.message ? reason.message : String(reason) };
  document.getElementById("result").textContent = JSON.stringify(window.__AIRBURG_RESULT__);
};
</script>
<script type="module">
const resultNode = document.getElementById("result");
try {
  const module = await import("/modules/${entryRelativePath}");
  const input = await fetch("/input.json").then((response) => response.json());
  const result = await module.runPersistenceIntegration(input);
  window.__AIRBURG_RESULT__ = result;
  resultNode.textContent = JSON.stringify(result);
} catch (error) {
  window.__AIRBURG_RESULT__ = { status: "FAIL", errorCode: error && error.message ? error.message : "browser_test_failed" };
  resultNode.textContent = JSON.stringify(window.__AIRBURG_RESULT__);
}
</script></body></html>`;

const createServerForIntegration = ({
  html,
  input,
  distDir,
}: {
  html: string;
  input: BrowserInput;
  distDir: string;
}): Server =>
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (url.pathname === "/input.json") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(input));
      return;
    }
    if (url.pathname.startsWith("/modules/")) {
      const relativePath = decodeURIComponent(url.pathname.slice("/modules/".length));
      const normalizedPath = path.normalize(path.join(distDir, relativePath));
      const indexFile = path.join(normalizedPath, "index.js");
      if (normalizedPath.startsWith(distDir) && fs.existsSync(indexFile) && !url.pathname.endsWith("/")) {
        response.writeHead(302, { location: `${url.pathname}/` });
        response.end();
        return;
      }
      const candidates = [normalizedPath, `${normalizedPath}.js`, indexFile];
      const file = candidates.find((candidate) => candidate.startsWith(distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (file) {
        response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        response.end(fs.readFileSync(file));
        return;
      }
    }
    response.writeHead(404);
    response.end("not found");
  });

const runBrowserValidation = async (): Promise<BrowserResult> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05f0-"));
  const userDataDir = path.join(tempRoot, "chrome-profile");
  fs.mkdirSync(userDataDir, { recursive: true });
  const input = createBrowserInput();
  const compiled = compileBrowserModule(tempRoot);
  const html = buildHtml(compiled.entryRelativePath);
  const server = createServerForIntegration({ html, input, distDir: compiled.distDir });
  const port = await listen(server);
  let chrome: ChildProcess | null = null;
  try {
    chrome = spawn(chromePath, [
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `http://127.0.0.1:${port}/`,
    ], { stdio: "ignore" });
    const debugPort = await waitForDevToolsPort(userDataDir);
    const target = await getPageTarget(debugPort);
    return await evaluateResultFromPage(target.webSocketDebuggerUrl);
  } finally {
    await stopChrome(chrome);
    await closeServer(server);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

const main = async () => {
  const result = await runBrowserValidation();
  const output = {
    ...result,
    taskId: TASK_ID,
  };
  console.log(JSON.stringify(output, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
};

main().catch((error) => {
  console.log(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    errorCode: error instanceof Error ? error.message : "target_hierarchy_persistence_validation_failed",
  }, null, 2));
  process.exitCode = 1;
});
