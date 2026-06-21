import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  createPreparedDatasetFromDryRun,
  runLegacyStorageV2DryRunMigration,
  type DryRunRecordCounts,
  type LegacyStorageSnapshot,
  type PreparedV2Dataset,
} from "../../lib/v05";

const ROOT = process.cwd();
const TASK_ID = "V0.5A_4_1_REAL_INDEXEDDB_ADAPTER_BROWSER_INTEGRATION_CLOSURE";
const DATABASE_NAME = "airburg-v05-a41-integration-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const MIGRATION_VERSION = "legacy_tmall_v1_to_storage_v2_v1_a41_browser_integration";
const CAPTURED_AT = "2026-06-22T00:20:00+08:00";

const SAMPLE_FILES = {
  businessProduct:
    "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  adProduct: "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  adPlan: "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  afterSales: "private-samples/tmall/after-sales/当日售后退货表.xlsx",
} as const;

const SENSITIVE_FIELD_NAMES = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "操作人",
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface BrowserInput {
  databaseName: string;
  productionDatabaseName: string;
  migrationVersion: string;
  prepared: PreparedV2Dataset;
  secondPrepared: PreparedV2Dataset;
  snapshot: LegacyStorageSnapshot;
  dryRunRecordCounts: DryRunRecordCounts;
  expectedRecordKeys: string[];
  secondExpectedRecordKeys: string[];
  expectedProductionEntryHash: string;
}

interface BrowserResult {
  status?: "PASS" | "FAIL";
  productionAdapterUsed?: boolean;
  productionActivationEngineUsed?: boolean;
  productionEntryHashMatches?: boolean;
  browserLoadedProductionHash?: string | null;
  productionIndexResourceLoaded?: boolean;
  schemaPass?: boolean;
  prepareStatus?: string;
  pointerEmptyAfterPrepare?: boolean;
  allRecordFamiliesWritten?: boolean;
  recordCountsMatch?: boolean;
  recordKeysMatch?: boolean;
  readbackStatus?: string;
  readbackDatasetValid?: boolean;
  activateStatus?: string;
  pointerAfterFirstActivate?: boolean;
  alreadyActiveStatus?: string;
  noDuplicateRecordsAfterAlreadyActive?: boolean;
  noDuplicateJournalAfterAlreadyActive?: boolean;
  noDuplicateManifestAfterAlreadyActive?: boolean;
  secondActivateStatus?: string;
  firstDatasetInactiveAfterSecondActivate?: boolean;
  rollbackStatus?: string;
  pointerAfterRollback?: boolean;
  activeDatasetMatchesRollbackTarget?: boolean;
  nonActiveDatasetNotReturnedAsActive?: boolean;
  journalHasActivatedAndRolledBack?: boolean;
  loadDatasetPass?: boolean;
  loadActiveDatasetPass?: boolean;
  metadataListPass?: boolean;
  journalListPass?: boolean;
  failureInjection?: Record<string, boolean>;
  legacyKeysUnchanged?: boolean;
  localStorageV2WriteCount?: number;
  sessionStorageWriteCount?: number;
  productionDatabaseUntouched?: boolean;
  auditDatabaseDeleted?: boolean;
  servedModulePaths?: string[];
  missingModulePaths?: string[];
  errorCode?: string | null;
}

const createSampleFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

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

const sha256Buffer = (buffer: Buffer): string =>
  crypto.createHash("sha256").update(buffer).digest("hex");

const sha256Text = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectLeafValues = (value: unknown, values = new Set<string>()): Set<string> => {
  const leafValue = normalizeLeafValue(value);
  if (leafValue !== null) {
    values.add(leafValue);
    return values;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLeafValues(item, values));
    return values;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLeafValues(item, values));
  }
  return values;
};

const containsInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsInvalidNumber);
  return false;
};

const containsUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") return Object.values(value).some(containsUndefined);
  return false;
};

const isCheckableSensitiveValue = (value: string): boolean => {
  const placeholders = new Set(["-", "--", "无", "暂无", "空", "null", "NULL", "0"]);
  return value.length >= 4 && !placeholders.has(value);
};

const collectSensitiveSourceValues = async (afterSalesFile: File): Promise<Set<string>> => {
  const table = await parseTmallTableFile(afterSalesFile);
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((header) => {
      const value = normalizeLeafValue(row[header]);
      if (value && isCheckableSensitiveValue(value)) values.add(value);
    });
  });
  return values;
};

const containsSensitiveFieldName = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return SENSITIVE_FIELD_NAMES.some((fieldName) => serialized.includes(fieldName));
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
          if (typeof value === "string") {
            try {
              const parsed = JSON.parse(value) as BrowserResult;
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
          expression: "JSON.stringify({body: document.body.textContent, ready: document.readyState, error: window.__AIRBURG_ERROR__ || null})",
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

const buildLegacySnapshot = (analysisRaw: string): LegacyStorageSnapshot => ({
  capturedAt: CAPTURED_AT,
  values: {
    [LEGACY_ANALYSIS_KEY]: analysisRaw,
    [LEGACY_SERIES_KEY]: null,
    [LEGACY_TARGETS_KEY]: null,
    [LEGACY_LAST_ANALYSIS_KEY]: null,
    [LEGACY_DEMO_SESSION_KEY]: null,
  },
});

const createSecondSnapshot = (snapshot: LegacyStorageSnapshot): LegacyStorageSnapshot => {
  const raw = snapshot.values[LEGACY_ANALYSIS_KEY];
  if (!raw) throw new Error("analysis_raw_missing");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.analysisTimestamp = "2026-06-19T00:00:02.000Z";
  return {
    capturedAt: snapshot.capturedAt,
    values: {
      ...snapshot.values,
      [LEGACY_ANALYSIS_KEY]: JSON.stringify(parsed),
    },
  };
};

const createPrepared = async (snapshot: LegacyStorageSnapshot): Promise<{
  prepared: PreparedV2Dataset;
  blockingIssueCodes: string[];
}> => {
  const dryRun = await runLegacyStorageV2DryRunMigration({
    snapshot,
    migrationVersion: MIGRATION_VERSION,
  });
  const blockingIssueCodes = Array.from(
    new Set(dryRun.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)),
  ).sort();
  if (dryRun.status !== "ready" || !dryRun.futureActivationEligible || blockingIssueCodes.length > 0) {
    throw new Error("real_fixture_not_ready");
  }
  const prepared = createPreparedDatasetFromDryRun(dryRun, "2026-06-22T00:21:00+08:00");
  if (prepared.status !== "prepared" || !prepared.data) throw new Error("prepared_dataset_creation_failed");
  return { prepared: prepared.data, blockingIssueCodes };
};

const createBrowserInput = async (productionEntryHash: string): Promise<{
  input: BrowserInput;
  sensitiveSourceValueCount: number;
  sensitiveSourceValues: Set<string>;
  sourceObjectMutated: boolean;
  sourceObjectHash: string;
}> => {
  const afterSalesFile = createSampleFile(SAMPLE_FILES.afterSales);
  const analysis = await runTmallFourSourceAnalysis({
    businessProductFile: createSampleFile(SAMPLE_FILES.businessProduct),
    adProductFile: createSampleFile(SAMPLE_FILES.adProduct),
    adPlanFile: createSampleFile(SAMPLE_FILES.adPlan),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });
  const stored = toTmallStoredAnalysisResult(analysis);
  const sourceObjectBefore = stableStringify(stored);
  const snapshot = buildLegacySnapshot(JSON.stringify(stored));
  const secondSnapshot = createSecondSnapshot(snapshot);
  const first = await createPrepared(snapshot);
  const second = await createPrepared(secondSnapshot);
  const sensitiveValues = await collectSensitiveSourceValues(afterSalesFile);
  const sourceObjectAfter = stableStringify(stored);

  return {
    input: {
      databaseName: DATABASE_NAME,
      productionDatabaseName: PRODUCTION_DATABASE_NAME,
      migrationVersion: MIGRATION_VERSION,
      prepared: first.prepared,
      secondPrepared: second.prepared,
      snapshot,
      dryRunRecordCounts: first.prepared.metadata.recordCounts,
      expectedRecordKeys: first.prepared.recordKeys,
      secondExpectedRecordKeys: second.prepared.recordKeys,
      expectedProductionEntryHash: productionEntryHash,
    },
    sensitiveSourceValueCount: sensitiveValues.size,
    sensitiveSourceValues: sensitiveValues,
    sourceObjectMutated: sourceObjectBefore !== sourceObjectAfter,
    sourceObjectHash: sha256Text(sourceObjectBefore),
  };
};

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
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string"
      ? (error as { stderr: string }).stderr.trim()
      : "";
    const stdout = typeof (error as { stdout?: unknown }).stdout === "string"
      ? (error as { stdout: string }).stdout.trim()
      : "";
    const diagnostic = [stderr, stdout].filter(Boolean).join("\n").slice(0, 2000);
    throw new Error(diagnostic ? `typescript_compile_failed:${diagnostic}` : "typescript_compile_failed");
  }
};

const browserEntrySource = (productionImportPath: string, productionEntryHash: string): string => `
import {
  IndexedDbV2PersistenceStore,
  V2_OBJECT_STORE_NAMES,
  V2_RECORD_STORE_NAMES,
  V2_ENVELOPE_INDEXES,
  V2_DATASET_METADATA_INDEXES,
  V2_ACTIVATION_JOURNAL_INDEXES,
  V2_METADATA_INDEXES,
  collectDatasetRecordKeys,
  readBackAndValidateV2Dataset,
  activatePreparedV2Dataset,
  activateLegacySnapshotToV2,
  inspectV2PersistenceState,
  deleteIndexedDbDatabase,
  type PreparedV2Dataset,
  type LegacyStorageSnapshot,
  type V2Dataset,
} from ${JSON.stringify(productionImportPath)};

export const PRODUCTION_ENTRY_SHA256 = ${JSON.stringify(productionEntryHash)};

interface BrowserInput {
  databaseName: string;
  productionDatabaseName: string;
  migrationVersion: string;
  prepared: PreparedV2Dataset;
  secondPrepared: PreparedV2Dataset;
  snapshot: LegacyStorageSnapshot;
  dryRunRecordCounts: Record<string, number>;
  expectedRecordKeys: string[];
  secondExpectedRecordKeys: string[];
  expectedProductionEntryHash: string;
}

const sameArray = (left: readonly string[], right: readonly string[]): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const countDataset = (dataset: V2Dataset | null): Record<string, number> | null => {
  if (!dataset) return null;
  return {
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
  };
};

const expectedIndexesForStore = (storeName: string): readonly string[] =>
  storeName === "metadata"
    ? V2_METADATA_INDEXES
    : storeName === "datasetMetadata"
      ? V2_DATASET_METADATA_INDEXES
      : storeName === "activationJournal"
        ? V2_ACTIVATION_JOURNAL_INDEXES
        : V2_ENVELOPE_INDEXES;

const inspectDatabaseNames = async (): Promise<string[]> => {
  const databaseList = "databases" in indexedDB
    ? await indexedDB.databases()
    : [];
  return databaseList
    .map((database) => database.name)
    .filter((name): name is string => typeof name === "string")
    .sort();
};

const deleteIfExists = async (databaseName: string): Promise<void> => {
  try {
    await deleteIndexedDbDatabase(databaseName);
  } catch {}
};

const withStore = async <T>(databaseName: string, fn: (store: IndexedDbV2PersistenceStore) => Promise<T>): Promise<T> => {
  await deleteIfExists(databaseName);
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    return await fn(store);
  } finally {
    store.close();
    await deleteIfExists(databaseName);
  }
};

const runPointerFailure = async (
  input: BrowserInput,
  failurePoint: "during_pointer_write" | "after_pointer_write_before_commit",
): Promise<boolean> =>
  withStore(input.databaseName + "-" + failurePoint, async (store) => {
    await store.prepareDataset(input.prepared);
    await readBackAndValidateV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      validatedAt: "2026-06-22T00:25:00+08:00",
      expectedRecordCounts: input.prepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.prepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.prepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.expectedRecordKeys,
    });
    await activatePreparedV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      expectedCurrentDatasetId: null,
      activatedAt: "2026-06-22T00:26:00+08:00",
    });
    await store.prepareDataset(input.secondPrepared);
    await readBackAndValidateV2Dataset({
      store,
      datasetId: input.secondPrepared.dataset.datasetId,
      validatedAt: "2026-06-22T00:27:00+08:00",
      expectedRecordCounts: input.secondPrepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.secondPrepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.secondPrepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.secondExpectedRecordKeys,
    });
    const beforePointer = await store.getActivePointer();
    const beforeFirstMetadata = await store.getDatasetMetadata(input.prepared.dataset.datasetId);
    const beforeSecondMetadata = await store.getDatasetMetadata(input.secondPrepared.dataset.datasetId);
    const beforeJournalCount = (await store.listActivationJournal()).length;
    const result = await activatePreparedV2Dataset({
      store,
      datasetId: input.secondPrepared.dataset.datasetId,
      expectedCurrentDatasetId: input.prepared.dataset.datasetId,
      activatedAt: "2026-06-22T00:28:00+08:00",
      failurePoint,
    });
    const afterPointer = await store.getActivePointer();
    const afterFirstMetadata = await store.getDatasetMetadata(input.prepared.dataset.datasetId);
    const afterSecondMetadata = await store.getDatasetMetadata(input.secondPrepared.dataset.datasetId);
    const afterJournalCount = (await store.listActivationJournal()).length;
    const secondDataset = await store.loadDataset(input.secondPrepared.dataset.datasetId);
    return (
      result.status === "failed" &&
      beforePointer?.datasetId === input.prepared.dataset.datasetId &&
      afterPointer?.datasetId === input.prepared.dataset.datasetId &&
      beforeFirstMetadata?.status === "active" &&
      afterFirstMetadata?.status === "active" &&
      beforeSecondMetadata?.status === "validated" &&
      afterSecondMetadata?.status === "validated" &&
      beforeJournalCount === afterJournalCount &&
      secondDataset?.migrationManifests[0]?.status === "pending"
    );
  });

const runFailureInjection = async (input: BrowserInput): Promise<Record<string, boolean>> => {
  const duringRecordWrite = await withStore(input.databaseName + "-during-record-write", async (store) => {
    const result = await store.prepareDataset(input.prepared, "during_record_write");
    const metadata = await store.listDatasetMetadata();
    const loaded = await store.loadDataset(input.prepared.dataset.datasetId);
    const pointer = await store.getActivePointer();
    return result.status === "failed" && metadata.length === 0 && loaded === null && pointer === null;
  });

  const duringReadback = await withStore(input.databaseName + "-during-readback", async (store) => {
    await store.prepareDataset(input.prepared);
    const result = await readBackAndValidateV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      validatedAt: "2026-06-22T00:24:00+08:00",
      expectedRecordCounts: input.prepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.prepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.prepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.expectedRecordKeys,
      failurePoint: "during_readback",
    });
    const metadata = await store.getDatasetMetadata(input.prepared.dataset.datasetId);
    const pointer = await store.getActivePointer();
    return result.status === "failed" && metadata?.status !== "validated" && pointer === null;
  });

  return {
    during_record_write: duringRecordWrite,
    during_readback: duringReadback,
    during_pointer_write: await runPointerFailure(input, "during_pointer_write"),
    after_pointer_write_before_commit: await runPointerFailure(input, "after_pointer_write_before_commit"),
  };
};

export const runProductionIntegration = async (input: BrowserInput) => {
  const legacyKeys = [
    "airburg_tmall_analysis_v2",
    "airburg_tmall_series_groups_v1",
    "airburg_tmall_targets_v1",
    "airburg:last-analysis",
    "airburg:demo-session",
  ];
  const beforeLegacyValues = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
  const beforeLocalStorageKeys = new Set(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean));
  const beforeSessionStorageLength = sessionStorage.length;

  await deleteIfExists(input.databaseName);
  const store = await IndexedDbV2PersistenceStore.open({ databaseName: input.databaseName });
  let auditDatabaseDeleted = false;
  try {
    const schema = store.inspectSchema();
    const schemaPass =
      sameArray(schema.objectStoreNames, V2_OBJECT_STORE_NAMES) &&
      V2_OBJECT_STORE_NAMES.every((storeName) =>
        sameArray(schema.indexesByStoreName[storeName] ?? [], expectedIndexesForStore(storeName)),
      );

    const productionAdapterUsed =
      store.constructor.name === "IndexedDbV2PersistenceStore" &&
      typeof IndexedDbV2PersistenceStore.open === "function";
    const productionActivationEngineUsed =
      typeof readBackAndValidateV2Dataset === "function" &&
      typeof activatePreparedV2Dataset === "function" &&
      typeof activateLegacySnapshotToV2 === "function" &&
      typeof inspectV2PersistenceState === "function";

    const prepare = await store.prepareDataset(input.prepared);
    const pointerAfterPrepare = await store.getActivePointer();
    const loadedAfterPrepare = await store.loadDataset(input.prepared.dataset.datasetId);
    const countsAfterPrepare = countDataset(loadedAfterPrepare);
    const keysAfterPrepare = loadedAfterPrepare ? collectDatasetRecordKeys(loadedAfterPrepare) : [];

    const readback = await readBackAndValidateV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      validatedAt: "2026-06-22T00:22:00+08:00",
      expectedRecordCounts: input.prepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.prepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.prepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.expectedRecordKeys,
    });

    const activate = await activatePreparedV2Dataset({
      store,
      datasetId: input.prepared.dataset.datasetId,
      expectedCurrentDatasetId: null,
      activatedAt: "2026-06-22T00:23:00+08:00",
    });
    const pointerAfterFirstActivate = await store.getActivePointer();
    const activeAfterFirstActivate = await store.loadActiveDataset();
    const metadataAfterFirst = await store.listDatasetMetadata();
    const journalAfterFirst = await store.listActivationJournal();
    const loadedAfterFirst = await store.loadDataset(input.prepared.dataset.datasetId);

    const alreadyActive = await activateLegacySnapshotToV2({
      snapshot: input.snapshot,
      store,
      preparedAt: "2026-06-22T00:23:10+08:00",
      readBackAt: "2026-06-22T00:23:20+08:00",
      activatedAt: "2026-06-22T00:23:30+08:00",
      expectedCurrentDatasetId: input.prepared.dataset.datasetId,
      migrationVersion: input.migrationVersion,
    });
    const metadataAfterAlready = await store.listDatasetMetadata();
    const journalAfterAlready = await store.listActivationJournal();
    const loadedAfterAlready = await store.loadDataset(input.prepared.dataset.datasetId);

    await store.prepareDataset(input.secondPrepared);
    const secondReadback = await readBackAndValidateV2Dataset({
      store,
      datasetId: input.secondPrepared.dataset.datasetId,
      validatedAt: "2026-06-22T00:29:00+08:00",
      expectedRecordCounts: input.secondPrepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: input.secondPrepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: input.secondPrepared.metadata.manifestFingerprint,
      expectedRecordKeys: input.secondExpectedRecordKeys,
    });
    const secondActivate = await activatePreparedV2Dataset({
      store,
      datasetId: input.secondPrepared.dataset.datasetId,
      expectedCurrentDatasetId: input.prepared.dataset.datasetId,
      activatedAt: "2026-06-22T00:30:00+08:00",
    });
    const metadataAfterSecond = await store.listDatasetMetadata();
    const firstMetadataAfterSecond = metadataAfterSecond.find((item) => item.datasetId === input.prepared.dataset.datasetId);
    const secondMetadataAfterSecond = metadataAfterSecond.find((item) => item.datasetId === input.secondPrepared.dataset.datasetId);
    const activeAfterSecond = await store.loadActiveDataset();

    const rollback = await store.rollbackActiveDataset({
      expectedCurrentDatasetId: input.secondPrepared.dataset.datasetId,
      targetDatasetId: input.prepared.dataset.datasetId,
      rolledBackAt: "2026-06-22T00:31:00+08:00",
    });
    const pointerAfterRollback = await store.getActivePointer();
    const activeAfterRollback = await store.loadActiveDataset();
    const journalAfterRollback = await store.listActivationJournal();
    const metadataAfterRollback = await store.listDatasetMetadata();

    const failureInjection = await runFailureInjection(input);

    store.close();
    await deleteIfExists(input.databaseName);
    const databaseNames = await inspectDatabaseNames();
    auditDatabaseDeleted = !databaseNames.some((name) => name.startsWith(input.databaseName));
    const productionDatabaseUntouched = !databaseNames.includes(input.productionDatabaseName);

    const afterLegacyValues = Object.fromEntries(legacyKeys.map((key) => [key, localStorage.getItem(key)]));
    const afterLocalStorageKeys = new Set(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean));
    const localStorageV2WriteCount = [...afterLocalStorageKeys]
      .filter((key) => key && !beforeLocalStorageKeys.has(key))
      .filter((key) => key !== null)
      .filter((key) => String(key).includes("v2") || String(key).includes("airburg-v05"))
      .length;

    return {
      status: "PASS",
      productionAdapterUsed,
      productionActivationEngineUsed,
      productionEntryHashMatches: PRODUCTION_ENTRY_SHA256 === input.expectedProductionEntryHash,
      productionIndexResourceLoaded: performance
        .getEntriesByType("resource")
        .some((entry) => entry.name.includes("/lib/v05/index")),
      schemaPass,
      prepareStatus: prepare.status,
      pointerEmptyAfterPrepare: pointerAfterPrepare === null,
      allRecordFamiliesWritten: V2_RECORD_STORE_NAMES.every((storeName) =>
        Array.isArray((loadedAfterPrepare as unknown as Record<string, unknown> | null)?.[storeName]),
      ),
      recordCountsMatch: sameJson(countsAfterPrepare, input.dryRunRecordCounts),
      recordKeysMatch: sameArray(keysAfterPrepare, input.expectedRecordKeys),
      readbackStatus: readback.status,
      readbackDatasetValid: readback.status === "readback_validated" && sameJson(countDataset(readback.data?.dataset ?? null), input.dryRunRecordCounts),
      activateStatus: activate.status,
      pointerAfterFirstActivate: pointerAfterFirstActivate?.datasetId === input.prepared.dataset.datasetId,
      alreadyActiveStatus: alreadyActive.status,
      noDuplicateRecordsAfterAlreadyActive: sameJson(countDataset(loadedAfterFirst), countDataset(loadedAfterAlready)),
      noDuplicateJournalAfterAlreadyActive: journalAfterFirst.length === journalAfterAlready.length,
      noDuplicateManifestAfterAlreadyActive:
        metadataAfterFirst.length === metadataAfterAlready.length &&
        (loadedAfterAlready?.migrationManifests.length ?? -1) === 1,
      secondReadbackStatus: secondReadback.status,
      secondActivateStatus: secondActivate.status,
      firstDatasetInactiveAfterSecondActivate:
        firstMetadataAfterSecond?.status === "inactive_valid" &&
        secondMetadataAfterSecond?.status === "active" &&
        activeAfterSecond?.datasetId === input.secondPrepared.dataset.datasetId,
      rollbackStatus: rollback.status,
      pointerAfterRollback: pointerAfterRollback?.datasetId === input.prepared.dataset.datasetId,
      activeDatasetMatchesRollbackTarget: activeAfterRollback?.datasetId === input.prepared.dataset.datasetId,
      nonActiveDatasetNotReturnedAsActive: activeAfterRollback?.datasetId !== input.secondPrepared.dataset.datasetId,
      journalHasActivatedAndRolledBack:
        journalAfterRollback.some((item) => item.action === "activated") &&
        journalAfterRollback.some((item) => item.action === "rolled_back"),
      loadDatasetPass:
        loadedAfterPrepare?.datasetId === input.prepared.dataset.datasetId &&
        activeAfterFirstActivate?.datasetId === input.prepared.dataset.datasetId,
      loadActiveDatasetPass:
        activeAfterRollback?.datasetId === input.prepared.dataset.datasetId &&
        activeAfterRollback?.datasetId !== input.secondPrepared.dataset.datasetId,
      metadataListPass:
        metadataAfterRollback.some((item) => item.datasetId === input.prepared.dataset.datasetId && item.status === "active") &&
        metadataAfterRollback.some((item) => item.datasetId === input.secondPrepared.dataset.datasetId && item.status === "inactive_valid"),
      journalListPass: journalAfterRollback.length >= 3,
      failureInjection,
      legacyKeysUnchanged: JSON.stringify(beforeLegacyValues) === JSON.stringify(afterLegacyValues),
      localStorageV2WriteCount,
      sessionStorageWriteCount: sessionStorage.length - beforeSessionStorageLength,
      productionDatabaseUntouched,
      auditDatabaseDeleted,
      errorCode: null,
    };
  } catch (error) {
    store.close();
    await deleteIfExists(input.databaseName);
    return {
      status: "FAIL",
      errorCode: error instanceof Error ? error.message : "browser_integration_failed",
    };
  }
};
`;

const compileProductionBrowserModule = (tempRoot: string): {
  distDir: string;
  entryRelativePath: string;
  productionEntryHash: string;
  productionEntryRelativePath: string;
  testEntryHash: string;
} => {
  const sourceDir = path.join(tempRoot, "src");
  const distDir = path.join(tempRoot, "dist");
  fs.mkdirSync(sourceDir, { recursive: true });
  const projectIndex = path.join(ROOT, "lib/v05/index");
  let productionImportPath = toPosixPath(path.relative(sourceDir, projectIndex));
  if (!productionImportPath.startsWith(".")) productionImportPath = `./${productionImportPath}`;
  const placeholderHash = "0".repeat(64);
  const entryPath = path.join(sourceDir, "entry.ts");
  fs.writeFileSync(entryPath, browserEntrySource(productionImportPath, placeholderHash), "utf8");

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

  const productionEntry = findFiles(distDir, (file) => file.endsWith(`${path.sep}lib${path.sep}v05${path.sep}index.js`))[0];
  if (!productionEntry) throw new Error("compiled_production_entry_missing");
  const productionEntryHash = sha256Buffer(fs.readFileSync(productionEntry));

  fs.writeFileSync(entryPath, browserEntrySource(productionImportPath, productionEntryHash), "utf8");
  fs.rmSync(distDir, { recursive: true, force: true });
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
  const finalProductionEntry = findFiles(distDir, (file) => file.endsWith(`${path.sep}lib${path.sep}v05${path.sep}index.js`))[0];
  if (!entry || !finalProductionEntry) throw new Error("compiled_browser_entry_missing");
  const productionEntryRelativePath = toPosixPath(path.relative(distDir, finalProductionEntry));
  const stableEntryPath = path.join(distDir, "_entry.js");
  const stableEntrySource = fs
    .readFileSync(entry, "utf8")
    .replace(
      /from\s+["'][^"']*lib\/v05\/index["']/g,
      `from ${JSON.stringify(`/modules/${productionEntryRelativePath}`)}`,
    );
  fs.writeFileSync(stableEntryPath, stableEntrySource, "utf8");

  return {
    distDir,
    entryRelativePath: toPosixPath(path.relative(distDir, stableEntryPath)),
    productionEntryHash,
    productionEntryRelativePath,
    testEntryHash: sha256Buffer(fs.readFileSync(stableEntryPath)),
  };
};

const buildHtml = (entryRelativePath: string): string => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>V0.5A-4.1 Production Adapter Browser Integration</title></head>
<body><pre id="result">pending</pre>
<script>
window.__AIRBURG_RESULT__ = null;
window.__AIRBURG_ERROR__ = null;
window.onerror = (message) => {
  window.__AIRBURG_ERROR__ = String(message);
  window.__AIRBURG_RESULT__ = { status: "FAIL", errorCode: String(message) };
  document.getElementById("result").textContent = JSON.stringify(window.__AIRBURG_RESULT__);
};
window.onunhandledrejection = (event) => {
  const reason = event && event.reason;
  window.__AIRBURG_ERROR__ = reason && reason.message ? reason.message : String(reason);
  window.__AIRBURG_RESULT__ = { status: "FAIL", errorCode: window.__AIRBURG_ERROR__ };
  document.getElementById("result").textContent = JSON.stringify(window.__AIRBURG_RESULT__);
};
</script>
<script type="module">
const resultNode = document.getElementById("result");
try {
  const module = await import("/modules/${entryRelativePath}");
  const { runProductionIntegration, PRODUCTION_ENTRY_SHA256 } = module;
  const input = await fetch("/input.json").then((response) => response.json());
  const result = await runProductionIntegration(input);
  window.__AIRBURG_RESULT__ = {
    ...result,
    browserLoadedProductionHash: PRODUCTION_ENTRY_SHA256,
  };
  resultNode.textContent = JSON.stringify(window.__AIRBURG_RESULT__);
} catch (error) {
  window.__AIRBURG_RESULT__ = {
    status: "FAIL",
    errorCode: error && error.message ? error.message : "browser_test_failed",
  };
  resultNode.textContent = JSON.stringify(window.__AIRBURG_RESULT__);
}
</script></body></html>`;

const assertHtmlHasNoHandwrittenIndexedDb = (html: string): boolean => {
  const forbidden = [
    /indexedDB\.open/,
    /createObjectStore/,
    /function\s+openDb/,
    /const\s+openDb/,
    /function\s+prepare/,
    /const\s+prepare/,
    /function\s+activate/,
    /const\s+activate/,
    /function\s+rollback/,
    /const\s+rollback/,
  ];
  return forbidden.every((pattern) => !pattern.test(html));
};

const createServerForIntegration = ({
  html,
  input,
  distDir,
  requestLog,
}: {
  html: string;
  input: BrowserInput;
  distDir: string;
  requestLog?: { servedModulePaths: string[]; missingModulePaths: string[] };
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
      if (
        normalizedPath.startsWith(distDir) &&
        fs.existsSync(indexFile) &&
        fs.statSync(indexFile).isFile() &&
        !url.pathname.endsWith("/")
      ) {
        response.writeHead(302, { location: `${url.pathname}/` });
        response.end();
        return;
      }
      const candidates = [
        normalizedPath,
        `${normalizedPath}.js`,
        indexFile,
      ];
      const file = candidates.find((candidate) =>
        candidate.startsWith(distDir) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile(),
      );
      if (file) {
        requestLog?.servedModulePaths.push(relativePath);
        response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        response.end(fs.readFileSync(file));
        return;
      }
      requestLog?.missingModulePaths.push(relativePath);
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });

const runBrowser = async ({
  chrome,
  html,
  input,
  distDir,
}: {
  chrome: string;
  html: string;
  input: BrowserInput;
  distDir: string;
}): Promise<BrowserResult> => {
  const requestLog = { servedModulePaths: [] as string[], missingModulePaths: [] as string[] };
  const server = createServerForIntegration({ html, input, distDir, requestLog });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05a41-chrome-"));
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
    const result = await evaluateResultFromPage(target.webSocketDebuggerUrl);
    return {
      ...result,
      servedModulePaths: requestLog.servedModulePaths.slice(0, 20),
      missingModulePaths: requestLog.missingModulePaths.slice(0, 20),
    };
  } finally {
    await stopChrome(chromeProcess);
    await closeServer(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const main = async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.log(JSON.stringify({ status: "BLOCKED", taskId: TASK_ID, errorCode: "chrome_not_found" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05a41-build-"));
  try {
    const compiled = compileProductionBrowserModule(tempRoot);
    const browserInput = await createBrowserInput(compiled.productionEntryHash);
    const html = buildHtml(compiled.entryRelativePath);
    const htmlHasNoHandwrittenIndexedDb = assertHtmlHasNoHandwrittenIndexedDb(html);
    if (!htmlHasNoHandwrittenIndexedDb) throw new Error("test_html_contains_handwritten_indexeddb_flow");
    const browser = await runBrowser({
      chrome,
      html,
      input: browserInput.input,
      distDir: compiled.distDir,
    });

    const safeOutput = {
      browser,
      productionEntryRelativePath: compiled.productionEntryRelativePath,
      productionEntryHash: compiled.productionEntryHash,
      testEntryHash: compiled.testEntryHash,
    };
    const outputLeafValues = collectLeafValues(safeOutput);
    const leakedSensitiveValueCount = [...browserInput.sensitiveSourceValues].filter((value) => outputLeafValues.has(value)).length;
    const privacyPass =
      leakedSensitiveValueCount === 0 &&
      !containsSensitiveFieldName(safeOutput) &&
      !JSON.stringify(safeOutput).includes("rawRows") &&
      !JSON.stringify(safeOutput).includes("previewRows") &&
      !JSON.stringify(safeOutput).includes("fileName");
    const numberSafetyPass = !containsInvalidNumber(safeOutput) && !containsUndefined(safeOutput);
    const failureInjectionPass = Object.values(browser.failureInjection ?? {}).every(Boolean);
    const status =
      browser.status === "PASS" &&
      browser.productionAdapterUsed === true &&
      browser.productionActivationEngineUsed === true &&
      browser.productionEntryHashMatches === true &&
      browser.schemaPass === true &&
      browser.prepareStatus === "prepared" &&
      browser.pointerEmptyAfterPrepare === true &&
      browser.allRecordFamiliesWritten === true &&
      browser.recordCountsMatch === true &&
      browser.recordKeysMatch === true &&
      browser.readbackStatus === "readback_validated" &&
      browser.readbackDatasetValid === true &&
      browser.activateStatus === "activated" &&
      browser.pointerAfterFirstActivate === true &&
      browser.alreadyActiveStatus === "already_active" &&
      browser.noDuplicateRecordsAfterAlreadyActive === true &&
      browser.noDuplicateJournalAfterAlreadyActive === true &&
      browser.noDuplicateManifestAfterAlreadyActive === true &&
      browser.secondActivateStatus === "activated" &&
      browser.firstDatasetInactiveAfterSecondActivate === true &&
      browser.rollbackStatus === "rolled_back" &&
      browser.pointerAfterRollback === true &&
      browser.activeDatasetMatchesRollbackTarget === true &&
      browser.nonActiveDatasetNotReturnedAsActive === true &&
      browser.journalHasActivatedAndRolledBack === true &&
      browser.loadDatasetPass === true &&
      browser.loadActiveDatasetPass === true &&
      browser.metadataListPass === true &&
      browser.journalListPass === true &&
      failureInjectionPass &&
      browser.legacyKeysUnchanged === true &&
      browser.localStorageV2WriteCount === 0 &&
      browser.sessionStorageWriteCount === 0 &&
      browser.productionDatabaseUntouched === true &&
      browser.auditDatabaseDeleted === true &&
      privacyPass &&
      numberSafetyPass &&
      !browserInput.sourceObjectMutated
        ? "PASS"
        : "FAIL";

    console.log(JSON.stringify({
      status,
      taskId: TASK_ID,
      chromePath: chrome,
      productionAdapterEntry: "lib/v05/persistence/indexeddb-adapter.ts",
      productionActivationEngineEntry: "lib/v05/persistence/activation-engine.ts",
      productionModuleEntry: "lib/v05/index.ts",
      productionCompiledEntryHash: compiled.productionEntryHash,
      browserLoadedProductionHash: browser.browserLoadedProductionHash ?? null,
      productionIndexResourceLoaded: browser.productionIndexResourceLoaded === true,
      realFixtureRecordCounts: browserInput.input.dryRunRecordCounts,
      prepareStatus: browser.prepareStatus ?? null,
      readbackStatus: browser.readbackStatus ?? null,
      activateStatus: browser.activateStatus ?? null,
      alreadyActiveStatus: browser.alreadyActiveStatus ?? null,
      secondActivateStatus: browser.secondActivateStatus ?? null,
      rollbackStatus: browser.rollbackStatus ?? null,
      failureInjection: browser.failureInjection ?? {},
      pointerAtomicityPass:
        browser.pointerAfterFirstActivate === true &&
        browser.pointerAfterRollback === true &&
        failureInjectionPass,
      recordCountReconciliationPass: browser.recordCountsMatch === true,
      recordKeyReconciliationPass: browser.recordKeysMatch === true,
      journalReconciliationPass:
        browser.noDuplicateJournalAfterAlreadyActive === true &&
        browser.journalHasActivatedAndRolledBack === true,
      legacyKeysUnchanged: browser.legacyKeysUnchanged === true,
      privacyPass,
      sensitiveSourceValueCount: browserInput.sensitiveSourceValueCount,
      leakedSensitiveValueCount,
      numberSafetyPass,
      sourceObjectMutated: browserInput.sourceObjectMutated,
      sourceObjectHash: browserInput.sourceObjectHash,
      localStorageV2WriteCount: browser.localStorageV2WriteCount ?? null,
      sessionStorageWriteCount: browser.sessionStorageWriteCount ?? null,
      productionDatabaseUntouched: browser.productionDatabaseUntouched === true,
      auditDatabaseDeleted: browser.auditDatabaseDeleted === true,
      htmlHasNoHandwrittenIndexedDb,
      servedModulePaths: browser.servedModulePaths ?? [],
      missingModulePaths: browser.missingModulePaths ?? [],
      errorCode: browser.errorCode ?? null,
    }, null, 2));
    if (status !== "PASS") process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      status: "FAIL",
      taskId: TASK_ID,
      errorCode: error instanceof Error ? error.message : "adapter_browser_integration_failed",
    }, null, 2));
    process.exitCode = 1;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
};

main();
