import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  V2_ACTIVE_POINTER_KEY,
  V2_ACTIVATION_JOURNAL_INDEXES,
  V2_DATASET_METADATA_INDEXES,
  V2_ENVELOPE_INDEXES,
  V2_INDEXEDDB_AUDIT_DATABASE_NAME,
  V2_INDEXEDDB_VERSION,
  V2_METADATA_INDEXES,
  V2_OBJECT_STORE_NAMES,
  V2_RECORD_ENVELOPE_VERSION,
} from "../../lib/v05";

// V0.5A-4-R1 note:
// This script is an IndexedDB capability/schema smoke. It intentionally uses a
// tiny in-page IndexedDB scenario and is not a production Adapter integration
// test. The production Adapter browser integration closure lives in
// validate-v05a41-real-adapter-browser-integration.ts.

const TASK_ID = "V0.5A_4_R1_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE";
const ROOT = process.cwd();

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

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

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const escapeScriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");

const buildSmokeHtml = (): string => {
  const config = {
    databaseName: V2_INDEXEDDB_AUDIT_DATABASE_NAME,
    version: V2_INDEXEDDB_VERSION,
    stores: V2_OBJECT_STORE_NAMES,
    envelopeIndexes: V2_ENVELOPE_INDEXES,
    metadataIndexes: V2_METADATA_INDEXES,
    datasetMetadataIndexes: V2_DATASET_METADATA_INDEXES,
    activationJournalIndexes: V2_ACTIVATION_JOURNAL_INDEXES,
    activePointerKey: V2_ACTIVE_POINTER_KEY,
    envelopeVersion: V2_RECORD_ENVELOPE_VERSION,
  };

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>V0.5A-4-R1 IndexedDB Smoke</title></head>
<body><pre id="result">pending</pre>
<script>
const config = ${escapeScriptJson(config)};
const resultNode = document.getElementById("result");
window.__AIRBURG_SMOKE_RESULT = null;
window.__AIRBURG_SMOKE_ERROR = null;
window.onerror = (message) => {
  window.__AIRBURG_SMOKE_ERROR = String(message);
  window.__AIRBURG_SMOKE_RESULT = { status: "FAIL", errorCode: String(message) };
  resultNode.textContent = JSON.stringify(window.__AIRBURG_SMOKE_RESULT);
};
const counts = {
  platforms: 1,
  stores: 0,
  importBatches: 0,
  importFiles: 0,
  businessProductFacts: 0,
  adProductFacts: 0,
  adPlanFacts: 0,
  afterSalesDailyAggregates: 0,
  afterSalesRangeAggregates: 0,
  afterSalesOperationalSnapshots: 0,
  afterSalesDistributionItems: 0,
  series: 0,
  trackedProducts: 0,
  targets: 0,
  legacyTargetCandidates: 0,
  migrationManifests: 0
};

const req = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("request_failed"));
});

const txDone = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error("transaction_failed"));
  transaction.onabort = () => reject(transaction.error || new Error("transaction_aborted"));
});

const createStoreIfMissing = (db, name, keyPath, indexes) => {
  if (db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name, { keyPath });
  indexes.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
};

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(config.databaseName, config.version);
  request.onupgradeneeded = () => {
    const db = request.result;
    createStoreIfMissing(db, "metadata", "key", config.metadataIndexes);
    createStoreIfMissing(db, "datasetMetadata", "datasetId", config.datasetMetadataIndexes);
    createStoreIfMissing(db, "activationJournal", "journalId", config.activationJournalIndexes);
    config.stores
      .filter((name) => !["metadata", "datasetMetadata", "activationJournal"].includes(name))
      .forEach((name) => createStoreIfMissing(db, name, "id", config.envelopeIndexes));
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("open_failed"));
});

const deleteDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(config.databaseName);
  request.onsuccess = () => resolve(true);
  request.onerror = () => reject(request.error || new Error("delete_failed"));
  request.onblocked = () => reject(new Error("delete_blocked"));
});

const platformEnvelope = (datasetId) => ({
  envelopeVersion: config.envelopeVersion,
  id: datasetId + "::platforms::tmall",
  datasetId,
  recordKey: "tmall",
  platformCode: "tmall",
  storeId: null,
  businessDate: null,
  value: {
    schemaVersion: "airburg_storage_v2",
    platformCode: "tmall",
    platformName: "tmall",
    status: "active",
    createdAt: "2026-06-21T22:30:00+08:00",
    updatedAt: "2026-06-21T22:30:00+08:00"
  }
});

const metadata = (datasetId, status) => ({
  datasetId,
  manifestId: "manifest-" + datasetId,
  businessDatasetFingerprint: "business-" + datasetId,
  manifestFingerprint: "manifest-fingerprint-" + datasetId,
  importBatchId: "batch-" + datasetId,
  migrationVersion: "browser_smoke",
  status,
  recordCounts: counts,
  preparedAt: "2026-06-21T22:30:00+08:00",
  validatedAt: status === "validated" ? "2026-06-21T22:31:00+08:00" : null,
  activatedAt: status === "active" ? "2026-06-21T22:32:00+08:00" : null,
  failedAt: null,
  safeIssueCodes: []
});

const getPointer = async (db) => {
  const transaction = db.transaction("metadata", "readonly");
  const entry = await req(transaction.objectStore("metadata").get(config.activePointerKey));
  await txDone(transaction);
  return entry ? entry.value : null;
};

const prepare = async (db, datasetId) => {
  const transaction = db.transaction(["platforms", "datasetMetadata"], "readwrite");
  transaction.objectStore("platforms").put(platformEnvelope(datasetId));
  transaction.objectStore("datasetMetadata").put(metadata(datasetId, "staging"));
  await txDone(transaction);
};

const readbackAndValidate = async (db, datasetId) => {
  const transaction = db.transaction(["platforms", "datasetMetadata"], "readwrite");
  const platformRows = await req(transaction.objectStore("platforms").getAll());
  const meta = await req(transaction.objectStore("datasetMetadata").get(datasetId));
  transaction.objectStore("datasetMetadata").put({ ...meta, status: "validated", validatedAt: "2026-06-21T22:31:00+08:00" });
  await txDone(transaction);
  return platformRows.filter((row) => row.datasetId === datasetId).length === 1 && meta.datasetId === datasetId;
};

const activate = async (db, datasetId, expectedCurrentDatasetId) => {
  const transaction = db.transaction(["metadata", "datasetMetadata", "activationJournal"], "readwrite");
  const pointerStore = transaction.objectStore("metadata");
  const datasetStore = transaction.objectStore("datasetMetadata");
  const journalStore = transaction.objectStore("activationJournal");
  const current = await req(pointerStore.get(config.activePointerKey));
  const currentDatasetId = current ? current.value.datasetId : null;
  if (currentDatasetId !== expectedCurrentDatasetId) throw new Error("pointer_conflict");
  if (currentDatasetId) {
    const oldMeta = await req(datasetStore.get(currentDatasetId));
    datasetStore.put({ ...oldMeta, status: "inactive_valid" });
  }
  const nextMeta = await req(datasetStore.get(datasetId));
  datasetStore.put({ ...nextMeta, status: "active", activatedAt: "2026-06-21T22:32:00+08:00" });
  pointerStore.put({
    key: config.activePointerKey,
    value: {
      schemaVersion: "airburg_storage_v2",
      pointerId: config.activePointerKey,
      state: "v2_active",
      datasetId,
      migrationManifestId: "manifest-" + datasetId,
      activatedAt: "2026-06-21T22:32:00+08:00"
    }
  });
  journalStore.put({
    journalId: "activated:" + datasetId + ":" + Date.now(),
    action: "activated",
    datasetId,
    previousDatasetId: currentDatasetId,
    expectedPreviousDatasetId: expectedCurrentDatasetId,
    migrationManifestId: "manifest-" + datasetId,
    createdAt: "2026-06-21T22:32:00+08:00"
  });
  await txDone(transaction);
};

const rollback = async (db, fromDatasetId, toDatasetId) => {
  const transaction = db.transaction(["metadata", "datasetMetadata", "activationJournal"], "readwrite");
  const pointerStore = transaction.objectStore("metadata");
  const datasetStore = transaction.objectStore("datasetMetadata");
  const pointer = await req(pointerStore.get(config.activePointerKey));
  if (!pointer || pointer.value.datasetId !== fromDatasetId) throw new Error("rollback_pointer_conflict");
  const fromMeta = await req(datasetStore.get(fromDatasetId));
  const toMeta = await req(datasetStore.get(toDatasetId));
  datasetStore.put({ ...fromMeta, status: "inactive_valid" });
  datasetStore.put({ ...toMeta, status: "active", activatedAt: "2026-06-21T22:33:00+08:00" });
  pointerStore.put({
    key: config.activePointerKey,
    value: {
      schemaVersion: "airburg_storage_v2",
      pointerId: config.activePointerKey,
      state: "v2_active",
      datasetId: toDatasetId,
      migrationManifestId: "manifest-" + toDatasetId,
      activatedAt: "2026-06-21T22:33:00+08:00"
    }
  });
  const journalStore = transaction.objectStore("activationJournal");
  journalStore.put({
    journalId: "rolled_back:" + fromDatasetId + ":" + Date.now(),
    action: "rolled_back",
    datasetId: toDatasetId,
    previousDatasetId: fromDatasetId,
    expectedPreviousDatasetId: fromDatasetId,
    migrationManifestId: "manifest-" + toDatasetId,
    createdAt: "2026-06-21T22:33:00+08:00"
  });
  await txDone(transaction);
};

const abortedPointerWriteKeepsCurrent = async (db, currentDatasetId, attemptedDatasetId) => {
  const transaction = db.transaction("metadata", "readwrite");
  transaction.objectStore("metadata").put({
    key: config.activePointerKey,
    value: {
      schemaVersion: "airburg_storage_v2",
      pointerId: config.activePointerKey,
      state: "v2_active",
      datasetId: attemptedDatasetId,
      migrationManifestId: "manifest-" + attemptedDatasetId,
      activatedAt: "2026-06-21T22:34:00+08:00"
    }
  });
  transaction.abort();
  try {
    await txDone(transaction);
  } catch {}
  const pointer = await getPointer(db);
  return pointer && pointer.datasetId === currentDatasetId;
};

(async () => {
  let db = null;
  try {
    db = await openDb();
    const objectStores = Array.from(db.objectStoreNames).sort();
    const missingStores = config.stores.filter((name) => !db.objectStoreNames.contains(name));
    const indexChecks = [];
    const tx = db.transaction(config.stores, "readonly");
    config.stores.forEach((name) => {
      const store = tx.objectStore(name);
      const expected = name === "metadata"
        ? config.metadataIndexes
        : name === "datasetMetadata"
          ? config.datasetMetadataIndexes
          : name === "activationJournal"
            ? config.activationJournalIndexes
            : config.envelopeIndexes;
      expected.forEach((indexName) => {
        indexChecks.push(store.indexNames.contains(indexName));
      });
    });
    await txDone(tx);

    await prepare(db, "dataset-1");
    const pointerAfterPrepare = await getPointer(db);
    const readbackValid = await readbackAndValidate(db, "dataset-1");
    await activate(db, "dataset-1", null);
    const pointerAfterFirstActivate = await getPointer(db);
    const alreadyActive = pointerAfterFirstActivate && pointerAfterFirstActivate.datasetId === "dataset-1";
    await prepare(db, "dataset-2");
    const secondReadbackValid = await readbackAndValidate(db, "dataset-2");
    await activate(db, "dataset-2", "dataset-1");
    const pointerAfterSecondActivate = await getPointer(db);
    await rollback(db, "dataset-2", "dataset-1");
    const pointerAfterRollback = await getPointer(db);
    const abortKeptPointer = await abortedPointerWriteKeepsCurrent(db, "dataset-1", "dataset-2");
    db.close();
    db = null;
    const auditDatabaseDeleted = await deleteDb();

    const checks = [
      missingStores.length === 0,
      indexChecks.every(Boolean),
      pointerAfterPrepare === null,
      readbackValid,
      alreadyActive,
      secondReadbackValid,
      pointerAfterSecondActivate && pointerAfterSecondActivate.datasetId === "dataset-2",
      pointerAfterRollback && pointerAfterRollback.datasetId === "dataset-1",
      abortKeptPointer,
      auditDatabaseDeleted
    ];

    const output = {
      status: checks.every(Boolean) ? "PASS" : "FAIL",
      databaseName: config.databaseName,
      objectStoreCount: objectStores.length,
      missingStores,
      indexesPass: indexChecks.every(Boolean),
      prepareDidNotWritePointer: pointerAfterPrepare === null,
      readbackValid,
      activatePass: alreadyActive,
      alreadyActivePass: alreadyActive,
      secondActivatePass: pointerAfterSecondActivate && pointerAfterSecondActivate.datasetId === "dataset-2",
      rollbackPass: pointerAfterRollback && pointerAfterRollback.datasetId === "dataset-1",
      abortedPointerWriteKeptPrevious: abortKeptPointer,
      auditDatabaseDeleted
    };
    window.__AIRBURG_SMOKE_RESULT = output;
    resultNode.textContent = JSON.stringify(output);
  } catch (error) {
    if (db) db.close();
    try { await deleteDb(); } catch {}
    window.__AIRBURG_SMOKE_RESULT = {
      status: "FAIL",
      errorCode: error && error.message ? error.message : "browser_smoke_failed"
    };
    resultNode.textContent = JSON.stringify(window.__AIRBURG_SMOKE_RESULT);
  }
})();
</script></body></html>`;
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
  error?: {
    message?: string;
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

const evaluateResultFromPage = async (webSocketDebuggerUrl: string): Promise<unknown> =>
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
    }, 15000);

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
        for (let index = 0; index < 80; index += 1) {
          const response = await send("Runtime.evaluate", {
            expression: "window.__AIRBURG_SMOKE_RESULT ? JSON.stringify(window.__AIRBURG_SMOKE_RESULT) : document.body.textContent",
            returnByValue: true,
          });
          const value = response.result?.result?.value;
          if (typeof value === "string") {
            try {
              const parsed = JSON.parse(value) as { status?: string };
              if (parsed.status === "PASS" || parsed.status === "FAIL") {
                clearTimeout(timeout);
                socket.close();
                resolve(parsed);
                return;
              }
            } catch {}
          }
          await delay(100);
        }
        const diagnostic = await send("Runtime.evaluate", {
          expression: "JSON.stringify({body: document.body.textContent, ready: document.readyState, error: window.__AIRBURG_SMOKE_ERROR || null})",
          returnByValue: true,
        });
        const diagnosticValue = diagnostic.result?.result?.value;
        throw new Error(`page_result_unavailable:${typeof diagnosticValue === "string" ? diagnosticValue.slice(0, 240) : "no_diagnostic"}`);
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    };
  });

const stopChrome = async (chrome: ChildProcess | null): Promise<void> => {
  if (!chrome || chrome.killed) return;
  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => chrome.once("exit", () => resolve())),
    delay(3000),
  ]);
  if (!chrome.killed) chrome.kill("SIGKILL");
};

const main = async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.log(JSON.stringify({
      status: "FAIL",
      taskId: TASK_ID,
      errorCode: "chrome_not_found",
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const html = buildSmokeHtml();
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05a4r1-chrome-"));
  let chromeProcess: ChildProcess | null = null;

  try {
    const port = await listen(server);
    chromeProcess = spawn(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--remote-debugging-port=0",
      `http://127.0.0.1:${port}/`,
    ], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const debugPort = await waitForDevToolsPort(userDataDir);
    const target = await getPageTarget(debugPort);
    const parsed = await evaluateResultFromPage(target.webSocketDebuggerUrl) as {
      status?: string;
      databaseName?: string;
      objectStoreCount?: number;
      missingStores?: string[];
      indexesPass?: boolean;
      prepareDidNotWritePointer?: boolean;
      readbackValid?: boolean;
      activatePass?: boolean;
      alreadyActivePass?: boolean;
      secondActivatePass?: boolean;
      rollbackPass?: boolean;
      abortedPointerWriteKeptPrevious?: boolean;
      auditDatabaseDeleted?: boolean;
      errorCode?: string;
    };
    const status = parsed.status === "PASS" ? "PASS" : "FAIL";
    console.log(JSON.stringify({
      status,
      taskId: TASK_ID,
      chromePath: chrome,
      databaseName: parsed.databaseName ?? V2_INDEXEDDB_AUDIT_DATABASE_NAME,
      objectStoreCount: parsed.objectStoreCount ?? 0,
      missingStores: parsed.missingStores ?? [],
      indexesPass: parsed.indexesPass === true,
      prepareDidNotWritePointer: parsed.prepareDidNotWritePointer === true,
      readbackValid: parsed.readbackValid === true,
      activatePass: parsed.activatePass === true,
      alreadyActivePass: parsed.alreadyActivePass === true,
      secondActivatePass: parsed.secondActivatePass === true,
      rollbackPass: parsed.rollbackPass === true,
      abortedPointerWriteKeptPrevious: parsed.abortedPointerWriteKeptPrevious === true,
      auditDatabaseDeleted: parsed.auditDatabaseDeleted === true,
      errorCode: parsed.errorCode ?? null,
    }, null, 2));
    if (status !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      status: "FAIL",
      taskId: TASK_ID,
      chromePath: chrome,
      errorCode: error instanceof Error ? error.message : "chrome_smoke_failed",
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await stopChrome(chromeProcess);
    await closeServer(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

main();
