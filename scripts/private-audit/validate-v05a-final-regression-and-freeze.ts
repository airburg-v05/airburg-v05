import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateMajorStageTransition } from "./lib/v05-stage-freeze-policy";

const ROOT = process.cwd();
const LOCK_PATH = "docs/project/v0.5-lock.json";
const CURRENT_TASK_PATH = "docs/project/current-task.json";
const FREEZE_DOC_PATH = "docs/releases/v0.5a-platform-store-data-foundation-freeze.md";
const FINAL_COMPLETION_PATH =
  "docs/project/task-completions/V0.5A_5_R2_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const NEXT_TASK_ID = "V0.5B_1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT";

const REQUIRED_COMPLETION_TASKS = [
  "V0.5A_0_3_IMMUTABLE_TASK_COMPLETION_LEDGER_AND_DEPENDENCY_RESOLUTION",
  "V0.5A_1_LEGACY_DATA_OWNERSHIP_AUDIT_AND_STORAGE_V2_MIGRATION_DESIGN",
  "V0.5A_1_1_R1_AUDIT_DECISION_REGISTER_AND_MIGRATION_POLICY_LOCK",
  "V0.5A_2_V2_DOMAIN_REPOSITORY_CONTRACTS_VALIDATORS_AND_MEMORY_ADAPTER",
  "V0.5A_3_LEGACY_SNAPSHOT_AND_DRY_RUN_MIGRATION",
  "V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE",
  "V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS",
  "V0.5A_3_2_1_REUSABLE_REAL_FIXTURE_READINESS_GATE",
  "V0.5A_4_R1_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE",
  "V0.5A_4_1_REAL_INDEXEDDB_ADAPTER_BROWSER_INTEGRATION_CLOSURE",
  "V0.5A_5_0_STAGE_AWARE_FREEZE_TRANSITION_GATE_FIX",
] as const;

const HISTORY_SCOPED_COMMANDS = [
  {
    taskId: "V0.5A_2_V2_DOMAIN_REPOSITORY_CONTRACTS_VALIDATORS_AND_MEMORY_ADAPTER",
    command: "npx tsx scripts/private-audit/validate-v05a2-v2-domain-repositories.ts",
  },
  {
    taskId: "V0.5A_3_LEGACY_SNAPSHOT_AND_DRY_RUN_MIGRATION",
    command: "npx tsx scripts/private-audit/validate-v05a3-legacy-snapshot-dry-run.ts",
  },
  {
    taskId: "V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE",
    command: "npx tsx scripts/private-audit/validate-v05a31-dry-run-closure.ts",
  },
  {
    taskId: "V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS",
    command: "npx tsx scripts/private-audit/validate-v05a32-after-sales-safe-aggregate-readiness.ts",
  },
] as const;

const TASK_SCOPED_COMMANDS_FORBIDDEN_IN_CURRENT_TASK = [
  "npx tsx scripts/private-audit/validate-v05a2-v2-domain-repositories.ts",
  "npx tsx scripts/private-audit/validate-v05a3-legacy-snapshot-dry-run.ts",
  "npx tsx scripts/private-audit/validate-v05a31-dry-run-closure.ts",
  "npx tsx scripts/private-audit/validate-v05a32-after-sales-safe-aggregate-readiness.ts",
] as const;

const LEGACY_KEYS = [
  "airburg_tmall_analysis_v2",
  "airburg_tmall_series_groups_v1",
  "airburg_tmall_targets_v1",
  "airburg:last-analysis",
  "airburg:demo-session",
] as const;

const FORBIDDEN_PAGE_TOKENS = [
  "lib/v05",
  "activateLegacySnapshotToV2",
  "activatePreparedV2Dataset",
  "indexedDB",
  "IndexedDB",
  "airburg_v05",
  "airburg-v05",
  "airburg_storage_v2",
] as const;

const FOUNDATION_PATHS = [
  "lib/v05/domain",
  "lib/v05/validation",
  "lib/v05/repositories",
  "lib/v05/migration",
] as const;

const PERSISTENCE_PATHS = ["lib/v05/persistence"] as const;
const FORBIDDEN_CHANGED_PREFIXES = ["app/", "components/", "lib/", "types/"] as const;
const FORBIDDEN_CHANGED_FILES: readonly string[] = ["package.json", "package-lock.json"];

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface CurrentTask {
  taskId: string;
  stage: string;
  dependsOn: string[];
  baselineCommit: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizedContractVersion: string;
  governanceContractHash: string;
  requiredDocuments: string[];
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  commandResults?: CommandResult[];
  stopConditions: string[];
  startedAt: string;
  completedAt: string | null;
  status: "pending" | "in_progress" | "blocked" | "complete";
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

interface GovernanceLock {
  currentVersion: string;
  governanceContractFiles: string[];
  currentStageDoesNotImplement: string[];
  executionSequence: Array<{ id: string; name: string; dependsOn: string[]; status: string }>;
  stageStatuses: Record<string, string>;
  privacy: {
    afterSalesSafeAggregatesOnly: boolean;
    forbidSensitiveAfterSalesDetails: boolean;
  };
  multiPlatform: boolean;
  multiStore: boolean;
  storeOwnershipRequired: boolean;
  legacyMigrationRequired: boolean;
  v05aCompletedAt?: string;
  v05aFreezeDocument?: string;
  v05aFinalCompletionRecord?: string;
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

interface ReadinessGateOutput {
  status: string;
  realFixtureStatus: string;
  futureActivationEligible: boolean;
  blockingIssueCodes: string[];
  recordCounts: Record<string, number>;
  afterSalesCountsReconciled: boolean;
  privacyPass: boolean;
  leakedSensitiveValueCount: number;
  numberSafetyPass: boolean;
  persistencePass: boolean;
}

interface BrowserIntegrationOutput {
  status: string;
  productionIndexResourceLoaded: boolean;
  productionCompiledEntryHash: string;
  browserLoadedProductionHash: string;
  prepareStatus: string;
  readbackStatus: string;
  activateStatus: string;
  alreadyActiveStatus: string;
  secondActivateStatus: string;
  rollbackStatus: string;
  failureInjection: Record<string, boolean>;
  pointerAtomicityPass: boolean;
  recordCountReconciliationPass: boolean;
  recordKeyReconciliationPass: boolean;
  journalReconciliationPass: boolean;
  legacyKeysUnchanged: boolean;
  privacyPass: boolean;
  leakedSensitiveValueCount: number;
  numberSafetyPass: boolean;
  sourceObjectMutated: boolean;
  localStorageV2WriteCount: number;
  sessionStorageWriteCount: number;
  productionDatabaseUntouched: boolean;
  auditDatabaseDeleted: boolean;
  htmlHasNoHandwrittenIndexedDb: boolean;
  missingModulePaths: string[];
  realFixtureRecordCounts: Record<string, number>;
}

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown): void => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const readJson = <T>(relativePath: string): T => JSON.parse(readFile(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const runJsonCommand = <T>(command: string, args: string[]): T => {
  const stdout = execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return JSON.parse(stdout) as T;
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

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const calculateAuthorizationHash = (authorization: TaskAuthorization): string =>
  sha256(stableStringify(authorization));

const calculateGovernanceHash = (lock: GovernanceLock): string => {
  const hash = crypto.createHash("sha256");
  lock.governanceContractFiles.forEach((file) => {
    const content = readFile(file).replace(/\r\n/g, "\n").trimEnd();
    hash.update(`FILE:${file}\n${content}\nEND_FILE\n`);
  });
  return hash.digest("hex");
};

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const readFileAtCommit = (commit: string, relativePath: string): string =>
  git(["show", `${commit}:${relativePath}`]);

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const changedFilesInPathsSince = (commit: string, paths: readonly string[]): string[] => {
  const stdout = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-only",
    commit,
    "HEAD",
    "--",
    ...paths,
  ]);
  return stdout.split("\n").map((line) => line.trim()).filter(Boolean).sort();
};

const matchesPathPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  if (pattern.startsWith("**/")) return file === pattern.slice(3) || file.endsWith(`/${pattern.slice(3)}`);
  return false;
};

const pathMatchesAny = (file: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesPathPattern(file, pattern));

const listFiles = (relativeDir: string): string[] => {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  const output: string[] = [];
  const walk = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      output.push(path.relative(ROOT, absolutePath).split(path.sep).join("/"));
    });
  };
  walk(absoluteDir);
  return output.sort();
};

const fileUnchangedFromFirstCommit = (relativePath: string): boolean => {
  const firstCommit = findFirstCommitAddingFile(relativePath);
  if (!firstCommit) return false;
  return readFileAtCommit(firstCommit, relativePath).replace(/\r\n/g, "\n").trimEnd() ===
    readFile(relativePath).replace(/\r\n/g, "\n").trimEnd();
};

const readCompletionRecord = (taskId: string): CompletionRecord | null => {
  const recordPath = `docs/project/task-completions/${taskId}.json`;
  if (!fileExists(recordPath)) return null;
  return readJson<CompletionRecord>(recordPath);
};

const completionRecordValid = (taskId: string): boolean => {
  const recordPath = `docs/project/task-completions/${taskId}.json`;
  const record = readCompletionRecord(taskId);
  if (!record) return false;
  if (record.taskId !== taskId || record.status !== "complete") return false;
  if (!fileUnchangedFromFirstCommit(recordPath)) return false;
  try {
    const authorizationAtCommit = JSON.parse(readFileAtCommit(record.authorizationCommit, record.authorizationFile)) as TaskAuthorization;
    if (calculateAuthorizationHash(authorizationAtCommit) !== record.authorizationHash) return false;
    const completionTask = JSON.parse(readFileAtCommit(record.completionCommit, record.sourceTaskContractPath)) as CurrentTask;
    if (completionTask.taskId !== taskId || completionTask.status !== "complete") return false;
    if (!git(["merge-base", "--is-ancestor", record.authorizationCommit, record.completionCommit]).includes("")) {
      return false;
    }
    return record.requiredCommands.every((command) =>
      record.commandResults.some((result) => result.command === command && result.status === "PASS"),
    );
  } catch {
    return false;
  }
};

const historyCommandPassesFromCompletion = (taskId: string, command: string): boolean => {
  const record = readCompletionRecord(taskId);
  return Boolean(record?.commandResults.some((result) => result.command === command && result.status === "PASS"));
};

const sourceFilesContainAny = (relativeDirs: readonly string[], tokens: readonly string[]): string[] =>
  relativeDirs.flatMap((dir) =>
    listFiles(dir)
      .filter((file) => /\.(tsx?|jsx?)$/.test(file))
      .flatMap((file) => {
        const content = readFile(file);
        return tokens
          .filter((token) => content.includes(token))
          .map((token) => `${file}:${token}`);
      }),
  );

const changedFileForbidden = (file: string): boolean =>
  FORBIDDEN_CHANGED_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
  FORBIDDEN_CHANGED_FILES.includes(file);

const findBlockedTaskEvidence = (taskId: string): string | null => {
  const commits = git(["log", "--format=%H", "--", CURRENT_TASK_PATH])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const commit of commits) {
    try {
      const task = JSON.parse(readFileAtCommit(commit, CURRENT_TASK_PATH)) as CurrentTask;
      if (task.taskId === taskId && task.status === "blocked") return commit;
    } catch {}
  }
  return null;
};

const main = () => {
  const lock = readJson<GovernanceLock>(LOCK_PATH);
  const task = readJson<CurrentTask>(CURRENT_TASK_PATH);
  const authorization = readJson<TaskAuthorization>(task.authorizationFile);
  const baselineLock = JSON.parse(readFileAtCommit(task.baselineCommit, LOCK_PATH)) as GovernanceLock;
  const authorizationCommit = findFirstCommitAddingFile(task.authorizationFile);
  const oldGovernanceHash = authorization.governanceContractHash;
  const newGovernanceHash = calculateGovernanceHash(lock);
  const changedFiles = authorizationCommit ? changedFilesSince(authorizationCommit) : [];
  const pageForbiddenTokenMatches = sourceFilesContainAny(["app", "components"], FORBIDDEN_PAGE_TOKENS);
  const freezeDoc = fileExists(FREEZE_DOC_PATH) ? readFile(FREEZE_DOC_PATH) : "";
  const decisionRegister = fileExists("docs/decisions/V05A_MIGRATION_DECISION_REGISTER.md")
    ? readFile("docs/decisions/V05A_MIGRATION_DECISION_REGISTER.md")
    : "";
  const a32Record = readCompletionRecord("V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS");
  const a41Record = readCompletionRecord("V0.5A_4_1_REAL_INDEXEDDB_ADAPTER_BROWSER_INTEGRATION_CLOSURE");
  const foundationChangesAfterA32 = a32Record
    ? changedFilesInPathsSince(a32Record.completionCommit, FOUNDATION_PATHS)
    : ["missing-a32-completion-record"];
  const persistenceChangesAfterA41 = a41Record
    ? changedFilesInPathsSince(a41Record.completionCommit, PERSISTENCE_PATHS)
    : ["missing-a41-completion-record"];

  const readinessGate = runJsonCommand<ReadinessGateOutput>("npx", [
    "tsx",
    "scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts",
  ]);
  const browserIntegration = runJsonCommand<BrowserIntegrationOutput>("npx", [
    "tsx",
    "scripts/private-audit/validate-v05a41-real-adapter-browser-integration.ts",
  ]);

  const stageTransition = validateMajorStageTransition({
    majorStageId: "V0.5A",
    baselineStageStatus: baselineLock.stageStatuses?.["V0.5A"] ?? null,
    currentStageStatus: lock.stageStatuses?.["V0.5A"] ?? null,
    currentTask: task,
    immutableAuthorizationValid:
      authorizationCommit !== null &&
      calculateAuthorizationHash(authorization) === task.authorizationHash &&
      task.governanceContractHash === authorization.governanceContractHash,
  });

  const authorizationFiles = listFiles("docs/project/task-authorizations")
    .filter((file) => file.endsWith(".json"));
  const allHistoricalAuthorizationsImmutable = authorizationFiles.every(fileUnchangedFromFirstCommit);
  const blockedA4EvidenceExists =
    fileExists("docs/project/task-authorizations/V0.5A_4_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE.json") &&
    !fileExists("docs/project/task-completions/V0.5A_4_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE.json") &&
    Boolean(findBlockedTaskEvidence("V0.5A_4_INDEXEDDB_V2_PERSISTENCE_AND_ATOMIC_DEFAULT_STORE_ACTIVATION_ENGINE"));
  const blockedA5PolicyEvidenceExists =
    fileExists("scripts/private-audit/validate-v05-stage-freeze-transition.ts") &&
    readFile("scripts/private-audit/validate-v05-stage-freeze-transition.ts").includes("old blocked A-5 does not satisfy transition") &&
    readFile("scripts/private-audit/validate-v05-stage-freeze-transition.ts").includes("V0.5A_5_FINAL_REGRESSION_AND_STAGE_FREEZE");
  const blockedR1EvidenceExists =
    fileExists("docs/project/task-authorizations/V0.5A_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json") &&
    !fileExists("docs/project/task-completions/V0.5A_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json") &&
    Boolean(findBlockedTaskEvidence("V0.5A_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE"));

  const requiredCompletions = Object.fromEntries(
    REQUIRED_COMPLETION_TASKS.map((taskId) => [taskId, completionRecordValid(taskId)]),
  );
  const allRequiredCompletionsValid = Object.values(requiredCompletions).every(Boolean);
  const historicalScriptEvidence = Object.fromEntries(
    HISTORY_SCOPED_COMMANDS.map(({ taskId, command }) => [
      command,
      historyCommandPassesFromCompletion(taskId, command),
    ]),
  );
  const historicalScriptEvidencePass = Object.values(historicalScriptEvidence).every(Boolean);
  const currentTaskDoesNotRequireHistoryScopedCommands =
    !TASK_SCOPED_COMMANDS_FORBIDDEN_IN_CURRENT_TASK.some((command) =>
      task.requiredCommands.includes(command),
    );
  const legacyKeyPolicyPresent = LEGACY_KEYS.every((key) =>
    decisionRegister.includes(key) && freezeDoc.includes(key),
  );
  const legacyPreservePolicyPresent =
    decisionRegister.includes("Legacy keys are preserved and never cleared by migration") ||
    freezeDoc.includes("不自动删除、覆盖或清空任何 legacy key") ||
    freezeDoc.includes("五个旧 key 全部保留");
  const readinessPass =
    readinessGate.status === "PASS" &&
    readinessGate.realFixtureStatus === "ready" &&
    readinessGate.futureActivationEligible === true &&
    readinessGate.blockingIssueCodes.length === 0 &&
    readinessGate.afterSalesCountsReconciled === true &&
    readinessGate.privacyPass === true &&
    readinessGate.leakedSensitiveValueCount === 0 &&
    readinessGate.numberSafetyPass === true &&
    readinessGate.persistencePass === true;
  const browserIntegrationPass =
    browserIntegration.status === "PASS" &&
    browserIntegration.productionIndexResourceLoaded === true &&
    browserIntegration.productionCompiledEntryHash.length > 0 &&
    browserIntegration.browserLoadedProductionHash === browserIntegration.productionCompiledEntryHash &&
    browserIntegration.prepareStatus === "prepared" &&
    browserIntegration.readbackStatus === "readback_validated" &&
    browserIntegration.activateStatus === "activated" &&
    browserIntegration.alreadyActiveStatus === "already_active" &&
    browserIntegration.secondActivateStatus === "activated" &&
    browserIntegration.rollbackStatus === "rolled_back" &&
    Object.values(browserIntegration.failureInjection).every(Boolean) &&
    browserIntegration.pointerAtomicityPass === true &&
    browserIntegration.recordCountReconciliationPass === true &&
    browserIntegration.recordKeyReconciliationPass === true &&
    browserIntegration.journalReconciliationPass === true &&
    browserIntegration.legacyKeysUnchanged === true &&
    browserIntegration.privacyPass === true &&
    browserIntegration.leakedSensitiveValueCount === 0 &&
    browserIntegration.numberSafetyPass === true &&
    browserIntegration.sourceObjectMutated === false &&
    browserIntegration.localStorageV2WriteCount === 0 &&
    browserIntegration.sessionStorageWriteCount === 0 &&
    browserIntegration.productionDatabaseUntouched === true &&
    browserIntegration.auditDatabaseDeleted === true &&
    browserIntegration.htmlHasNoHandwrittenIndexedDb === true &&
    browserIntegration.missingModulePaths.length === 0;

  addCheck("all V0.5A completion records valid", allRequiredCompletionsValid, requiredCompletions);
  addCheck("historical task-scoped scripts proven by immutable completion records", historicalScriptEvidencePass, historicalScriptEvidence);
  addCheck("current task does not require historical task-scoped scripts", currentTaskDoesNotRequireHistoryScopedCommands);
  addCheck("all historical authorizations immutable", allHistoricalAuthorizationsImmutable, authorizationFiles);
  addCheck("old blocked A-4 evidence exists", blockedA4EvidenceExists);
  addCheck("old blocked A-5 policy evidence exists", blockedA5PolicyEvidenceExists);
  addCheck("old blocked R1 evidence exists", blockedR1EvidenceExists);
  addCheck("foundation code unchanged after A-3.2 completion", foundationChangesAfterA32.length === 0, {
    checkpoint: a32Record?.completionCommit ?? null,
    changedFiles: foundationChangesAfterA32,
  });
  addCheck("persistence code unchanged after A-4.1 completion", persistenceChangesAfterA41.length === 0, {
    checkpoint: a41Record?.completionCommit ?? null,
    changedFiles: persistenceChangesAfterA41,
  });
  addCheck("readiness gate PASS", readinessPass, {
    realFixtureStatus: readinessGate.realFixtureStatus,
    futureActivationEligible: readinessGate.futureActivationEligible,
    blockingIssueCodes: readinessGate.blockingIssueCodes,
    recordCounts: readinessGate.recordCounts,
  });
  addCheck("production adapter browser integration PASS", browserIntegrationPass, {
    prepareStatus: browserIntegration.prepareStatus,
    readbackStatus: browserIntegration.readbackStatus,
    activateStatus: browserIntegration.activateStatus,
    rollbackStatus: browserIntegration.rollbackStatus,
    failureInjection: browserIntegration.failureInjection,
    recordCounts: browserIntegration.realFixtureRecordCounts,
  });
  addCheck("legacy key policy present", legacyKeyPolicyPresent && legacyPreservePolicyPresent);
  addCheck("privacy and number safety PASS", readinessPass && browserIntegrationPass);
  addCheck("pages do not import V0.5 runtime or direct V2 IndexedDB", pageForbiddenTokenMatches.length === 0, pageForbiddenTokenMatches);
  addCheck("automatic migration not enabled", pageForbiddenTokenMatches.length === 0);
  addCheck("V0.5A pending to complete legal", stageTransition.transitionValid, stageTransition);
  addCheck("V0.5A is complete", lock.stageStatuses["V0.5A"] === "complete");
  addCheck("V0.5B remains pending", lock.stageStatuses["V0.5B"] === "pending");
  addCheck("execution sequence keeps V0.5A complete and V0.5B pending",
    lock.executionSequence.find((item) => item.id === "V0.5A")?.status === "complete" &&
      lock.executionSequence.find((item) => item.id === "V0.5B")?.status === "pending");
  addCheck("new governance hash differs from authorization hash after lock change",
    newGovernanceHash !== oldGovernanceHash);
  addCheck("freeze document exists", fileExists(FREEZE_DOC_PATH));
  addCheck("next task correct", freezeDoc.includes(NEXT_TASK_ID));
  addCheck("no business code modified", !changedFiles.some(changedFileForbidden), changedFiles);
  addCheck("changed files within authorization", changedFiles.every((file) =>
    pathMatchesAny(file, task.allowedModifyPaths),
  ), changedFiles);
  addCheck("no dependency changes", !changedFiles.some((file) =>
    file === "package.json" || file.endsWith("lock.yaml") || file === "package-lock.json",
  ), changedFiles);
  addCheck("IndexedDB no longer listed as not implemented",
    !lock.currentStageDoesNotImplement.includes("IndexedDB"));
  addCheck("AI/backend/server database/platform API/crawler still not implemented",
    ["AI", "backend API", "server database", "platform API", "crawler"].every((item) =>
      lock.currentStageDoesNotImplement.includes(item),
    ));
  addCheck("freeze metadata recorded",
    Boolean(lock.v05aCompletedAt) &&
      lock.v05aFreezeDocument === FREEZE_DOC_PATH &&
      lock.v05aFinalCompletionRecord === FINAL_COMPLETION_PATH);
  addCheck("multi-platform/store ownership still required",
    lock.multiPlatform === true &&
      lock.multiStore === true &&
      lock.storeOwnershipRequired === true &&
      lock.legacyMigrationRequired === true);
  addCheck("after-sales privacy lock unchanged",
    lock.privacy.afterSalesSafeAggregatesOnly === true &&
      lock.privacy.forbidSensitiveAfterSalesDetails === true);

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    oldGovernanceHash,
    newGovernanceHash,
    baselineV05AStatus: baselineLock.stageStatuses?.["V0.5A"] ?? null,
    currentV05AStatus: lock.stageStatuses["V0.5A"],
    currentV05BStatus: lock.stageStatuses["V0.5B"],
    stageTransition,
    completionRecordEvidence: requiredCompletions,
    historicalTaskScopedScriptEvidence: historicalScriptEvidence,
    foundationCheckpoint: {
      completionCommit: a32Record?.completionCommit ?? null,
      changedFiles: foundationChangesAfterA32,
    },
    persistenceCheckpoint: {
      completionCommit: a41Record?.completionCommit ?? null,
      changedFiles: persistenceChangesAfterA41,
    },
    readinessGate: {
      status: readinessGate.status,
      realFixtureStatus: readinessGate.realFixtureStatus,
      futureActivationEligible: readinessGate.futureActivationEligible,
      blockingIssueCodes: readinessGate.blockingIssueCodes,
      recordCounts: readinessGate.recordCounts,
    },
    productionAdapterBrowserIntegration: {
      status: browserIntegration.status,
      productionHashMatched: browserIntegration.browserLoadedProductionHash === browserIntegration.productionCompiledEntryHash,
      prepareStatus: browserIntegration.prepareStatus,
      readbackStatus: browserIntegration.readbackStatus,
      activateStatus: browserIntegration.activateStatus,
      alreadyActiveStatus: browserIntegration.alreadyActiveStatus,
      secondActivateStatus: browserIntegration.secondActivateStatus,
      rollbackStatus: browserIntegration.rollbackStatus,
      failureInjection: browserIntegration.failureInjection,
      pointerAtomicityPass: browserIntegration.pointerAtomicityPass,
      productionDatabaseUntouched: browserIntegration.productionDatabaseUntouched,
      auditDatabaseDeleted: browserIntegration.auditDatabaseDeleted,
    },
    changedFiles,
    pageForbiddenTokenMatches,
    freezeDocument: FREEZE_DOC_PATH,
    nextTask: NEXT_TASK_ID,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
