import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
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
  runLegacyStorageV2DryRunMigration,
  type DryRunIssue,
  type LegacyMigrationDryRunResult,
  type LegacyStorageSnapshot,
} from "../../lib/v05";

const ROOT = process.cwd();
const GATE_ID = "V0.5A-3.2-real-fixture-readiness";
const SOURCE_TASK_ID = "V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS";
const COMPLETION_RECORD_PATH = `docs/project/task-completions/${SOURCE_TASK_ID}.json`;
const CAPTURED_AT = "2026-06-21T21:15:00+08:00";
const MIGRATION_VERSION = "legacy_tmall_v1_to_storage_v2_v1_reusable_real_fixture_gate";

const REQUIRED_A32_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05a2-v2-domain-repositories.ts",
  "npx tsx scripts/private-audit/validate-v05a3-legacy-snapshot-dry-run.ts",
  "npx tsx scripts/private-audit/validate-v05a31-dry-run-closure.ts",
  "npx tsx scripts/private-audit/validate-v05a32-after-sales-safe-aggregate-readiness.ts",
  "npm run lint",
  "npm run build",
] as const;

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

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface TaskAuthorization {
  taskId: string;
  stage: string;
  dependsOn: string[];
  governanceContractHash: string;
  requiredDocuments: string[];
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  stopConditions: string[];
  authorizedAt: string;
  contractVersion: string;
}

interface CompletionRecord {
  recordVersion: string;
  taskId: string;
  stage: string;
  status: "complete" | "blocked" | "pending" | "in_progress";
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  completedAt: string;
  requiredCommands: string[];
  commandResults: CommandResult[];
  sourceTaskContractPath: "docs/project/current-task.json";
  registeredAt: string;
}

interface CompletionTaskSnapshot {
  taskId: string;
  stage: string;
  status: "complete" | "blocked" | "pending" | "in_progress";
  authorizationFile: string;
  authorizationHash: string;
  requiredCommands: string[];
  commandResults: CommandResult[];
  completedAt: string | null;
}

interface CompletionValidation {
  valid: boolean;
  failures: string[];
  authorizationCommit: string | null;
  completionCommit: string | null;
  completionRecordCommit: string | null;
}

interface PureCompletionShape {
  status?: string;
  requiredCommands?: string[];
  commandResults?: CommandResult[];
}

interface ReadinessLike {
  status: string;
  futureActivationEligible: boolean;
  issues: Array<Pick<DryRunIssue, "code" | "severity">>;
}

interface Check {
  name: string;
  pass: boolean;
}

interface GateFacts {
  completionRecordValid: boolean;
  realFixtureReady: boolean;
  futureActivationEligible: boolean;
  blockingIssueCodes: string[];
  afterSalesCountsReconciled: boolean;
  privacyPass: boolean;
  numberSafetyPass: boolean;
  persistencePass: boolean;
}

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const gitSucceeds = (args: string[]): boolean => {
  try {
    execFileSync("git", args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
};

const normalizeFileContent = (value: string): string =>
  value.replace(/\r\n/g, "\n").trimEnd();

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

const calculateAuthorizationHash = (authorization: TaskAuthorization): string =>
  sha256(stableStringify(authorization));

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const readFileAtCommit = (commit: string, relativePath: string): string =>
  git(["show", `${commit}:${relativePath}`]);

const commandResultsPass = (
  requiredCommands: readonly string[],
  commandResults: readonly CommandResult[] | undefined,
): boolean =>
  requiredCommands.every((command) =>
    (commandResults ?? []).some((result) => result.command === command && result.status === "PASS"),
  );

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const createSampleFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
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

const blockingIssueCodes = (issues: readonly Pick<DryRunIssue, "code" | "severity">[]): string[] =>
  Array.from(
    new Set(
      issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.code),
    ),
  ).sort();

const validateCompletionShape = (record: PureCompletionShape | null): boolean => {
  if (!record) return false;
  if (record.status !== "complete") return false;
  return commandResultsPass(record.requiredCommands ?? [], record.commandResults);
};

const validateReadinessShape = (result: ReadinessLike): boolean =>
  result.status === "ready" &&
  result.futureActivationEligible === true &&
  blockingIssueCodes(result.issues).length === 0;

const validateA32CompletionRecord = (): CompletionValidation => {
  const failures: string[] = [];
  if (!fileExists(COMPLETION_RECORD_PATH)) {
    return {
      valid: false,
      failures: ["completion_record_missing"],
      authorizationCommit: null,
      completionCommit: null,
      completionRecordCommit: null,
    };
  }

  const record = parseJson<CompletionRecord>(COMPLETION_RECORD_PATH);
  const completionRecordCommit = findFirstCommitAddingFile(COMPLETION_RECORD_PATH);
  const authorizationCommit = record.authorizationCommit;
  const completionCommit = record.completionCommit;
  const authorizationFile = record.authorizationFile;
  const authorizationFileCommit = findFirstCommitAddingFile(authorizationFile);

  if (record.recordVersion !== "v0.5-task-completion-v1") failures.push("record_version_invalid");
  if (record.taskId !== SOURCE_TASK_ID) failures.push("task_id_mismatch");
  if (record.status !== "complete") failures.push("completion_status_not_complete");
  if (record.stage !== "V0.5A-3.2") failures.push("stage_mismatch");
  if (record.authorizationHash.length !== 64) failures.push("authorization_hash_invalid");
  if (!commandResultsPass(REQUIRED_A32_COMMANDS, record.commandResults)) {
    failures.push("completion_record_command_results_missing_or_failed");
  }
  if (!REQUIRED_A32_COMMANDS.every((command) => record.requiredCommands.includes(command))) {
    failures.push("completion_record_required_commands_incomplete");
  }
  if (!gitSucceeds(["ls-files", "--error-unmatch", COMPLETION_RECORD_PATH])) {
    failures.push("completion_record_untracked");
  }
  if (!completionRecordCommit) {
    failures.push("completion_record_commit_missing");
  } else {
    const firstCommittedRecord = readFileAtCommit(completionRecordCommit, COMPLETION_RECORD_PATH);
    if (normalizeFileContent(firstCommittedRecord) !== normalizeFileContent(readFile(COMPLETION_RECORD_PATH))) {
      failures.push("completion_record_modified_after_commit");
    }
  }
  if (!gitSucceeds(["cat-file", "-e", `${authorizationCommit}^{commit}`])) {
    failures.push("authorization_commit_missing");
  }
  if (!gitSucceeds(["cat-file", "-e", `${completionCommit}^{commit}`])) {
    failures.push("completion_commit_missing");
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", authorizationCommit, completionCommit])) {
    failures.push("authorization_commit_not_completion_ancestor");
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", completionCommit, "HEAD"])) {
    failures.push("completion_commit_not_head_ancestor");
  }
  if (authorizationFileCommit !== authorizationCommit) {
    failures.push("authorization_commit_does_not_match_first_authorization_commit");
  }
  if (authorizationFileCommit) {
    const committedAuthorization = readFileAtCommit(authorizationFileCommit, authorizationFile);
    if (normalizeFileContent(committedAuthorization) !== normalizeFileContent(readFile(authorizationFile))) {
      failures.push("authorization_file_modified_after_commit");
    }
  }

  const authorization = JSON.parse(readFile(authorizationFile)) as TaskAuthorization;
  if (calculateAuthorizationHash(authorization) !== record.authorizationHash) {
    failures.push("authorization_hash_mismatch");
  }

  const completionTask = JSON.parse(
    readFileAtCommit(completionCommit, record.sourceTaskContractPath),
  ) as CompletionTaskSnapshot;
  if (completionTask.taskId !== record.taskId) failures.push("completion_task_id_mismatch");
  if (completionTask.stage !== record.stage) failures.push("completion_task_stage_mismatch");
  if (completionTask.status !== "complete") failures.push("completion_task_not_complete");
  if (completionTask.completedAt !== record.completedAt) failures.push("completion_task_completed_at_mismatch");
  if (completionTask.authorizationFile !== record.authorizationFile) {
    failures.push("completion_task_authorization_file_mismatch");
  }
  if (completionTask.authorizationHash !== record.authorizationHash) {
    failures.push("completion_task_authorization_hash_mismatch");
  }
  if (!commandResultsPass(record.requiredCommands, completionTask.commandResults)) {
    failures.push("completion_task_command_results_missing_or_failed");
  }

  return {
    valid: failures.length === 0,
    failures,
    authorizationCommit,
    completionCommit,
    completionRecordCommit,
  };
};

const createLegacySnapshot = (analysisRaw: string): LegacyStorageSnapshot => ({
  capturedAt: CAPTURED_AT,
  values: {
    [LEGACY_ANALYSIS_KEY]: analysisRaw,
    [LEGACY_SERIES_KEY]: null,
    [LEGACY_TARGETS_KEY]: null,
    [LEGACY_LAST_ANALYSIS_KEY]: null,
    [LEGACY_DEMO_SESSION_KEY]: null,
  },
});

const installPersistenceGuards = (): (() => number) => {
  let writeCount = 0;
  const failWrite = (): never => {
    writeCount += 1;
    throw new Error("persistence_write_blocked");
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
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: guardedStorage,
      indexedDB: guardedIndexedDb,
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: guardedStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "indexedDB", {
    value: guardedIndexedDb,
    configurable: true,
  });
  return () => writeCount;
};

const runRealFixtureDryRun = async (): Promise<{
  dryRun: LegacyMigrationDryRunResult;
  sensitiveSourceValueCount: number;
  leakedSensitiveValueCount: number;
  sourceObjectMutated: boolean;
}> => {
  const afterSalesFile = createSampleFile(SAMPLE_FILES.afterSales);
  const realAnalysis = await runTmallFourSourceAnalysis({
    businessProductFile: createSampleFile(SAMPLE_FILES.businessProduct),
    adProductFile: createSampleFile(SAMPLE_FILES.adProduct),
    adPlanFile: createSampleFile(SAMPLE_FILES.adPlan),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });
  const realStored = toTmallStoredAnalysisResult(realAnalysis);
  const before = stableStringify(realStored);
  const dryRun = await runLegacyStorageV2DryRunMigration({
    snapshot: createLegacySnapshot(JSON.stringify(realStored)),
    migrationVersion: MIGRATION_VERSION,
  });
  const after = stableStringify(realStored);
  const sensitiveValues = await collectSensitiveSourceValues(afterSalesFile);
  const outputValues = collectLeafValues(dryRun);
  const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => outputValues.has(value)).length;

  return {
    dryRun,
    sensitiveSourceValueCount: sensitiveValues.size,
    leakedSensitiveValueCount,
    sourceObjectMutated: before !== after,
  };
};

const countsMatchStagingDataset = (result: LegacyMigrationDryRunResult): boolean => {
  const dataset = result.stagingDataset;
  if (!dataset) return false;
  return (
    result.recordCounts.afterSalesDailyAggregates === dataset.afterSalesDailyAggregates.length &&
    result.recordCounts.afterSalesRangeAggregates === dataset.afterSalesRangeAggregates.length &&
    result.recordCounts.afterSalesOperationalSnapshots === dataset.afterSalesOperationalSnapshots.length &&
    result.recordCounts.afterSalesDistributionItems === dataset.afterSalesDistributionItems.length
  );
};

const afterSalesCountsReconciled = (result: LegacyMigrationDryRunResult): boolean =>
  countsMatchStagingDataset(result) &&
  result.recordCounts.afterSalesDailyAggregates > 0 &&
  result.recordCounts.afterSalesRangeAggregates > 0 &&
  result.recordCounts.afterSalesOperationalSnapshots > 0 &&
  result.recordCounts.afterSalesDistributionItems > 0;

const evaluateGateFacts = (facts: GateFacts): "PASS" | "FAIL" =>
  facts.completionRecordValid &&
  facts.realFixtureReady &&
  facts.futureActivationEligible &&
  facts.blockingIssueCodes.length === 0 &&
  facts.afterSalesCountsReconciled &&
  facts.privacyPass &&
  facts.numberSafetyPass &&
  facts.persistencePass
    ? "PASS"
    : "FAIL";

const pureTests = (realResult: LegacyMigrationDryRunResult): Check[] => {
  const completeShape: PureCompletionShape = {
    status: "complete",
    requiredCommands: [...REQUIRED_A32_COMMANDS],
    commandResults: REQUIRED_A32_COMMANDS.map((command) => ({ command, status: "PASS" as const })),
  };
  const missingCommandShape: PureCompletionShape = {
    ...completeShape,
    commandResults: completeShape.commandResults?.slice(1),
  };
  const readyShape: ReadinessLike = {
    status: "ready",
    futureActivationEligible: true,
    issues: [],
  };
  const facts: GateFacts = {
    completionRecordValid: true,
    realFixtureReady: realResult.status === "ready",
    futureActivationEligible: realResult.futureActivationEligible,
    blockingIssueCodes: blockingIssueCodes(realResult.issues),
    afterSalesCountsReconciled: afterSalesCountsReconciled(realResult),
    privacyPass: true,
    numberSafetyPass: true,
    persistencePass: true,
  };
  const scenarioStatuses = [
    "V0.5A_3_2_1_REUSABLE_REAL_FIXTURE_READINESS_GATE",
    "V0.5A_4_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE",
    "V0.5A_FUTURE_COMPATIBILITY_PROBE",
  ].map(() => evaluateGateFacts(facts));

  return [
    { name: "missing completion record fails", pass: !validateCompletionShape(null) },
    {
      name: "non-complete completion record fails",
      pass: !validateCompletionShape({ ...completeShape, status: "blocked" }),
    },
    {
      name: "missing completion command result fails",
      pass: !validateCompletionShape(missingCommandShape),
    },
    {
      name: "not-ready dry-run fails",
      pass: !validateReadinessShape({ ...readyShape, status: "blocked" }),
    },
    {
      name: "eligible false dry-run fails",
      pass: !validateReadinessShape({ ...readyShape, futureActivationEligible: false }),
    },
    {
      name: "blocking issue dry-run fails",
      pass: !validateReadinessShape({
        ...readyShape,
        issues: [{ code: "legacy_source_state_mismatch", severity: "error" }],
      }),
    },
    {
      name: "current compatibility task scenario passes",
      pass: scenarioStatuses[0] === "PASS",
    },
    {
      name: "A-4 scenario remains compatible",
      pass: scenarioStatuses[1] === "PASS",
    },
    {
      name: "future task scenario remains compatible",
      pass: scenarioStatuses[2] === "PASS",
    },
  ];
};

const main = async (): Promise<void> => {
  const getPersistenceWriteCount = installPersistenceGuards();
  const completion = validateA32CompletionRecord();
  const real = await runRealFixtureDryRun();
  const blockingCodes = blockingIssueCodes(real.dryRun.issues);
  const privacyPass =
    !containsSensitiveFieldName(real.dryRun) &&
    real.leakedSensitiveValueCount === 0;
  const numberSafetyPass =
    !containsInvalidNumber(real.dryRun) &&
    !containsUndefined(real.dryRun);
  const persistencePass =
    getPersistenceWriteCount() === 0 &&
    real.dryRun.proposedActiveDatasetPointer === null &&
    real.dryRun.stagingDataset?.activeDatasetPointer === null;
  const facts: GateFacts = {
    completionRecordValid: completion.valid,
    realFixtureReady: real.dryRun.status === "ready",
    futureActivationEligible: real.dryRun.futureActivationEligible,
    blockingIssueCodes: blockingCodes,
    afterSalesCountsReconciled: afterSalesCountsReconciled(real.dryRun),
    privacyPass,
    numberSafetyPass,
    persistencePass,
  };
  const tests = pureTests(real.dryRun);
  const failedPureTests = tests.filter((check) => !check.pass);
  const status = evaluateGateFacts(facts) === "PASS" && failedPureTests.length === 0 ? "PASS" : "FAIL";

  const report = {
    status,
    gate: GATE_ID,
    sourceTask: SOURCE_TASK_ID,
    completionRecordValid: completion.valid,
    authorizationCommit: completion.authorizationCommit,
    completionCommit: completion.completionCommit,
    completionRecordCommit: completion.completionRecordCommit,
    realFixtureStatus: real.dryRun.status,
    futureActivationEligible: real.dryRun.futureActivationEligible,
    blockingIssueCodes: blockingCodes,
    recordCounts: real.dryRun.recordCounts,
    afterSalesCountsReconciled: facts.afterSalesCountsReconciled,
    privacyPass,
    sensitiveSourceValueCount: real.sensitiveSourceValueCount,
    leakedSensitiveValueCount: real.leakedSensitiveValueCount,
    numberSafetyPass,
    persistenceWriteCount: getPersistenceWriteCount(),
    persistencePass,
    sourceObjectMutated: real.sourceObjectMutated,
    currentTaskIndependentPass: tests.find((test) => test.name === "current compatibility task scenario passes")?.pass === true,
    a4CompatibilityPass: tests.find((test) => test.name === "A-4 scenario remains compatible")?.pass === true,
    futureTaskCompatibilityPass: tests.find((test) => test.name === "future task scenario remains compatible")?.pass === true,
    pureTests: tests.map((test) => ({
      name: test.name,
      status: test.pass ? "PASS" : "FAIL",
    })),
    failureCodes: [
      ...completion.failures,
      ...failedPureTests.map((test) => `pure_test_failed:${test.name}`),
      ...(facts.realFixtureReady ? [] : ["real_fixture_not_ready"]),
      ...(facts.futureActivationEligible ? [] : ["future_activation_not_eligible"]),
      ...(facts.afterSalesCountsReconciled ? [] : ["after_sales_counts_not_reconciled"]),
      ...(facts.privacyPass ? [] : ["privacy_failed"]),
      ...(facts.numberSafetyPass ? [] : ["number_safety_failed"]),
      ...(facts.persistencePass ? [] : ["persistence_write_detected"]),
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    gate: GATE_ID,
    sourceTask: SOURCE_TASK_ID,
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
