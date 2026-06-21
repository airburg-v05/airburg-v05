import { execFileSync } from "node:child_process";
import fs from "node:fs";
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
  activateLegacySnapshotToV2,
  activatePreparedV2Dataset,
  captureLegacyStorageSnapshot,
  createPreparedDatasetFromDryRun,
  inspectV2PersistenceState,
  readBackAndValidateV2Dataset,
  runLegacyStorageV2DryRunMigration,
  type DryRunRecordCounts,
  type LegacyStorageSnapshot,
  type PreparedV2Dataset,
  type V2PersistenceFailurePoint,
  type V2PersistenceStore,
} from "../../lib/v05";
import { MemoryTransactionalV2PersistenceStore } from "../../lib/v05/persistence/testing/memory-transactional-adapter";

const ROOT = process.cwd();
const TASK_ID = "V0.5A_4_R1_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE";
const GATE_COMMAND = "npx tsx scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts";
const MIGRATION_VERSION = "legacy_tmall_v1_to_storage_v2_v1_a4r1_atomic_validation";
const CAPTURED_AT = "2026-06-21T22:10:00+08:00";

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

interface Check {
  name: string;
  pass: boolean;
}

interface SafeDryRunFacts {
  status: string;
  futureActivationEligible: boolean;
  blockingIssueCodes: string[];
  recordCounts: DryRunRecordCounts;
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

const installPersistenceGuards = (): (() => number) => {
  let writeCount = 0;
  const failWrite = (): never => {
    writeCount += 1;
    throw new Error("unexpected_global_persistence_write");
  };
  const guardedStorage = {
    getItem: () => null,
    setItem: failWrite,
    removeItem: failWrite,
    clear: failWrite,
  };
  const guardedIndexedDb = {
    open: failWrite,
    deleteDatabase: failWrite,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: guardedStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: guardedIndexedDb,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: guardedStorage,
      indexedDB: guardedIndexedDb,
    },
    configurable: true,
  });
  return () => writeCount;
};

const runReadinessGate = (): boolean => {
  try {
    const stdout = execFileSync("npx", ["tsx", "scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(stdout) as { status?: string };
    return parsed.status === "PASS";
  } catch {
    return false;
  }
};

const createRealLegacySnapshot = async (): Promise<{
  snapshot: LegacyStorageSnapshot;
  sensitiveSourceValueCount: number;
  sensitiveSourceValues: Set<string>;
  sourceObjectHashBefore: string;
  sourceObjectHashAfter: () => string;
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
  const sensitiveValues = await collectSensitiveSourceValues(afterSalesFile);
  const sourceObjectHashBefore = stableStringify(stored);

  return {
    snapshot: {
      capturedAt: CAPTURED_AT,
      values: {
        [LEGACY_ANALYSIS_KEY]: JSON.stringify(stored),
        [LEGACY_SERIES_KEY]: null,
        [LEGACY_TARGETS_KEY]: null,
        [LEGACY_LAST_ANALYSIS_KEY]: null,
        [LEGACY_DEMO_SESSION_KEY]: null,
      },
    },
    sensitiveSourceValueCount: sensitiveValues.size,
    sensitiveSourceValues: sensitiveValues,
    sourceObjectHashBefore,
    sourceObjectHashAfter: () => stableStringify(stored),
  };
};

const createSecondSnapshot = (snapshot: LegacyStorageSnapshot): LegacyStorageSnapshot => {
  const raw = snapshot.values[LEGACY_ANALYSIS_KEY];
  if (!raw) throw new Error("analysis_raw_missing");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  parsed.analysisTimestamp = "2026-06-19T00:00:01.000Z";
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
  dryRunFacts: SafeDryRunFacts;
}> => {
  const dryRun = await runLegacyStorageV2DryRunMigration({
    snapshot,
    migrationVersion: MIGRATION_VERSION,
  });
  const preparedResult = createPreparedDatasetFromDryRun(dryRun, "2026-06-21T22:12:00+08:00");
  if (preparedResult.status !== "prepared" || !preparedResult.data) {
    throw new Error("prepared_dataset_creation_failed");
  }
  const blockingIssueCodes = Array.from(
    new Set(dryRun.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code)),
  ).sort();

  return {
    prepared: preparedResult.data,
    dryRunFacts: {
      status: dryRun.status,
      futureActivationEligible: dryRun.futureActivationEligible,
      blockingIssueCodes,
      recordCounts: dryRun.recordCounts,
    },
  };
};

const prepareReadbackActivate = async (
  store: V2PersistenceStore,
  prepared: PreparedV2Dataset,
  expectedCurrentDatasetId: string | null,
): Promise<{
  prepareStatus: string;
  readbackStatus: string;
  activateStatus: string;
  activeDatasetIdAfterPrepare: string | null;
  activeDatasetId: string | null;
}> => {
  const preparedResult = await store.prepareDataset(prepared);
  const prepareState = await inspectV2PersistenceState(store);
  const readbackResult = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    validatedAt: "2026-06-21T22:13:00+08:00",
    expectedRecordCounts: prepared.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.recordKeys,
  });
  const activationResult = await activatePreparedV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    expectedCurrentDatasetId,
    activatedAt: "2026-06-21T22:14:00+08:00",
  });
  const state = await inspectV2PersistenceState(store);
  return {
    prepareStatus: preparedResult.status,
    readbackStatus: readbackResult.status,
    activateStatus: activationResult.status,
    activeDatasetIdAfterPrepare: prepareState.activeDatasetId,
    activeDatasetId: state.activeDatasetId,
  };
};

const runFailure = async (
  prepared: PreparedV2Dataset,
  failurePoint: V2PersistenceFailurePoint,
  operation: "prepare" | "readback" | "activate",
): Promise<Check> => {
  const store = new MemoryTransactionalV2PersistenceStore();

  if (operation === "prepare") {
    const result = await store.prepareDataset(prepared, failurePoint);
    const state = await inspectV2PersistenceState(store);
    const noPartialRecords =
      failurePoint !== "during_record_write" ||
      (state.stagedDatasetCount === 0 && state.failedDatasetCount === 0 && state.activeDatasetId === null);
    return {
      name: `${failurePoint}_prepare_failure_is_safe`,
      pass: result.status === "failed" && state.activeDatasetId === null && noPartialRecords,
    };
  }

  await store.prepareDataset(prepared);
  if (operation === "readback") {
    const result = await readBackAndValidateV2Dataset({
      store,
      datasetId: prepared.dataset.datasetId,
      validatedAt: "2026-06-21T22:15:00+08:00",
      expectedRecordCounts: prepared.metadata.recordCounts,
      expectedBusinessDatasetFingerprint: prepared.metadata.businessDatasetFingerprint,
      expectedManifestFingerprint: prepared.metadata.manifestFingerprint,
      expectedRecordKeys: prepared.recordKeys,
      failurePoint,
    });
    const state = await inspectV2PersistenceState(store);
    return {
      name: `${failurePoint}_readback_failure_is_safe`,
      pass: result.status === "failed" && state.activeDatasetId === null,
    };
  }

  const readback = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    validatedAt: "2026-06-21T22:15:00+08:00",
    expectedRecordCounts: prepared.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.recordKeys,
  });
  const result = await activatePreparedV2Dataset({
    store,
    datasetId: prepared.dataset.datasetId,
    expectedCurrentDatasetId: null,
    activatedAt: "2026-06-21T22:16:00+08:00",
    failurePoint,
  });
  const state = await inspectV2PersistenceState(store);
  return {
    name: `${failurePoint}_activation_failure_is_safe`,
    pass: readback.status === "readback_validated" && result.status === "failed" && state.activeDatasetId === null,
  };
};

const scanPersistenceSourceForForbiddenWrites = (): boolean => {
  const directory = path.join(ROOT, "lib/v05/persistence");
  const files = fs.readdirSync(directory, { recursive: true })
    .filter((file) => String(file).endsWith(".ts"))
    .map((file) => path.join(directory, String(file)));
  return files.every((file) => {
    const value = fs.readFileSync(file, "utf8");
    return !/(localStorage|sessionStorage)/.test(value);
  });
};

const main = async () => {
  const gatePass = runReadinessGate();
  const realSnapshot = await createRealLegacySnapshot();
  const getPersistenceWriteCount = installPersistenceGuards();
  const sourceSnapshotBefore = stableStringify(realSnapshot.snapshot);
  const secondSnapshot = createSecondSnapshot(realSnapshot.snapshot);
  const first = await createPrepared(realSnapshot.snapshot);
  const second = await createPrepared(secondSnapshot);
  const store = new MemoryTransactionalV2PersistenceStore();

  const firstFlow = await prepareReadbackActivate(store, first.prepared, null);
  const alreadyActive = await activateLegacySnapshotToV2({
    store,
    snapshot: realSnapshot.snapshot,
    migrationVersion: MIGRATION_VERSION,
    expectedCurrentDatasetId: first.prepared.dataset.datasetId,
    preparedAt: "2026-06-21T22:17:00+08:00",
    readBackAt: "2026-06-21T22:17:30+08:00",
    activatedAt: "2026-06-21T22:18:00+08:00",
  });
  const secondFlow = await prepareReadbackActivate(store, second.prepared, first.prepared.dataset.datasetId);
  const rollback = await store.rollbackActiveDataset({
    expectedCurrentDatasetId: second.prepared.dataset.datasetId,
    targetDatasetId: first.prepared.dataset.datasetId,
    rolledBackAt: "2026-06-21T22:20:00+08:00",
  });
  const finalState = await inspectV2PersistenceState(store);

  const failedStore = new MemoryTransactionalV2PersistenceStore();
  await failedStore.prepareDataset(first.prepared);
  await failedStore.markDatasetFailed(first.prepared.dataset.datasetId, "2026-06-21T22:21:00+08:00");
  const failedActivation = await activatePreparedV2Dataset({
    store: failedStore,
    datasetId: first.prepared.dataset.datasetId,
    expectedCurrentDatasetId: null,
    activatedAt: "2026-06-21T22:22:00+08:00",
  });

  const failureChecks = await Promise.all([
    runFailure(first.prepared, "before_prepare", "prepare"),
    runFailure(first.prepared, "during_record_write", "prepare"),
    runFailure(first.prepared, "during_readback", "readback"),
    runFailure(first.prepared, "before_activation", "activate"),
    runFailure(first.prepared, "during_pointer_write", "activate"),
    runFailure(first.prepared, "after_pointer_write_before_commit", "activate"),
  ]);

  const sensitiveValues = realSnapshot.sensitiveSourceValues;
  const safeOutput = {
    firstDryRun: first.dryRunFacts,
    secondDryRun: second.dryRunFacts,
    firstFlow,
    alreadyActiveStatus: alreadyActive.status,
    secondFlow,
    rollbackStatus: rollback.status,
    finalPersistenceStatus: finalState.status,
    failedActivationStatus: failedActivation.status,
    failureChecks,
  };
  const outputLeafValues = collectLeafValues(safeOutput);
  const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => outputLeafValues.has(value)).length;

  const checks: Check[] = [
    { name: "readiness_gate_pass", pass: gatePass },
    { name: "first_real_dry_run_ready", pass: first.dryRunFacts.status === "ready" },
    { name: "first_future_activation_eligible", pass: first.dryRunFacts.futureActivationEligible },
    { name: "first_has_no_blocking_issues", pass: first.dryRunFacts.blockingIssueCodes.length === 0 },
    { name: "second_dataset_id_changed", pass: first.prepared.dataset.datasetId !== second.prepared.dataset.datasetId },
    { name: "second_manifest_id_changed", pass: first.prepared.manifest.migrationManifestId !== second.prepared.manifest.migrationManifestId },
    { name: "prepare_readback_activate_first", pass: firstFlow.prepareStatus === "prepared" && firstFlow.readbackStatus === "readback_validated" && firstFlow.activateStatus === "activated" },
    { name: "prepare_does_not_activate_pointer", pass: firstFlow.activeDatasetIdAfterPrepare === null },
    { name: "already_active_idempotent", pass: alreadyActive.status === "already_active" },
    { name: "second_activation_replaces_pointer", pass: secondFlow.activateStatus === "activated" && secondFlow.activeDatasetId === second.prepared.dataset.datasetId },
    { name: "rollback_restores_first_pointer", pass: rollback.status === "rolled_back" && finalState.activeDatasetId === first.prepared.dataset.datasetId },
    { name: "failed_dataset_not_activatable", pass: failedActivation.status === "failed" },
    { name: "legacy_snapshot_unchanged", pass: stableStringify(realSnapshot.snapshot) === sourceSnapshotBefore },
    { name: "source_analysis_object_unchanged", pass: realSnapshot.sourceObjectHashBefore === realSnapshot.sourceObjectHashAfter() },
    { name: "capture_reader_is_readonly", pass: captureLegacyStorageSnapshot({ capturedAt: CAPTURED_AT, storage: { getItem: () => null } }).values[LEGACY_ANALYSIS_KEY] === null },
    { name: "no_sensitive_field_name", pass: !containsSensitiveFieldName(safeOutput) },
    { name: "no_sensitive_value", pass: leakedSensitiveValueCount === 0 },
    { name: "number_safety", pass: !containsInvalidNumber(safeOutput) && !containsUndefined(safeOutput) },
    { name: "no_global_persistence_write", pass: getPersistenceWriteCount() === 0 },
    { name: "persistence_source_has_no_localstorage", pass: scanPersistenceSourceForForbiddenWrites() },
    ...failureChecks,
  ];

  const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  const result = {
    status,
    taskId: TASK_ID,
    readinessGateCommand: GATE_COMMAND,
    readinessGatePass: gatePass,
    firstDatasetIdChangedByBusinessPayload: first.prepared.dataset.datasetId !== second.prepared.dataset.datasetId,
    manifestIdChangedByMigrationInput: first.prepared.manifest.migrationManifestId !== second.prepared.manifest.migrationManifestId,
    prepareStatus: firstFlow.prepareStatus,
    readbackStatus: firstFlow.readbackStatus,
    activateStatus: firstFlow.activateStatus,
    alreadyActiveStatus: alreadyActive.status,
    secondActivateStatus: secondFlow.activateStatus,
    rollbackStatus: rollback.status,
    failedDatasetActivationStatus: failedActivation.status,
    futureActivationEligible: first.dryRunFacts.futureActivationEligible,
    blockingIssueCodes: first.dryRunFacts.blockingIssueCodes,
    recordCounts: first.dryRunFacts.recordCounts,
    finalActiveDatasetIdMatchesFirst: finalState.activeDatasetId === first.prepared.dataset.datasetId,
    failureInjectionPass: failureChecks.every((check) => check.pass),
    sensitiveSourceValueCount: realSnapshot.sensitiveSourceValueCount,
    leakedSensitiveValueCount,
    privacyPass: leakedSensitiveValueCount === 0 && !containsSensitiveFieldName(safeOutput),
    numberSafetyPass: !containsInvalidNumber(safeOutput) && !containsUndefined(safeOutput),
    persistenceWriteCount: getPersistenceWriteCount(),
    failedChecks: checks.filter((check) => !check.pass).map((check) => check.name),
  };

  console.log(JSON.stringify(result, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    errorCode: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
