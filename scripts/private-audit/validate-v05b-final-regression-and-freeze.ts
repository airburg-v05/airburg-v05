import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE";
const FREEZE_DOC = "docs/releases/v0.5b-data-center-freeze.md";
const LOCK_FILE = "docs/project/v0.5-lock.json";

const REQUIRED_COMPLETION_TASKS = [
  "V0.5B_1_R1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT",
  "V0.5B_2_IMPORT_HISTORY_AND_BATCH_TRACEABILITY_CENTER",
  "V0.5B_3_DATA_QUALITY_AND_SAFE_REIMPORT_CENTER",
  "V0.5B_4_DATA_CENTER_NAVIGATION_AND_USABILITY_CLOSURE",
  "V0.5B_4_1_HISTORY_READONLY_BOUNDARY_AND_RUNTIME_EVIDENCE_CLOSURE",
] as const;

const CODE_INTEGRITY_RULES = [
  {
    name: "b1_import_code_integrity",
    taskId: "V0.5B_1_R1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT",
    paths: ["lib/v05/import"],
  },
  {
    name: "b2_history_algorithm_integrity",
    taskId: "V0.5B_2_IMPORT_HISTORY_AND_BATCH_TRACEABILITY_CENTER",
    paths: ["lib/v05/import-history"],
  },
  {
    name: "b3_quality_algorithm_integrity",
    taskId: "V0.5B_3_DATA_QUALITY_AND_SAFE_REIMPORT_CENTER",
    paths: ["lib/v05/data-quality"],
  },
  {
    name: "b4_data_center_algorithm_integrity",
    taskId: "V0.5B_4_DATA_CENTER_NAVIGATION_AND_USABILITY_CLOSURE",
    paths: ["lib/v05/data-center"],
  },
] as const;

const V05A_FROZEN_PATHS = [
  "lib/v05/domain",
  "lib/v05/validation",
  "lib/v05/repositories",
  "lib/v05/migration",
  "lib/v05/persistence",
] as const;

const ALLOWED_CURRENT_DIFFS = [
  "docs/releases/v0.5b-data-center-freeze.md",
  "docs/project/v0.5-lock.json",
  "scripts/private-audit/validate-v05b-final-regression-and-freeze.ts",
  "scripts/private-audit/validate-v05b-final-browser-runtime.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  "docs/project/task-completions/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
] as const;

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface CompletionRecord {
  recordVersion: string;
  taskId: string;
  stage: string;
  status: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  requiredCommands: string[];
  commandResults: CommandResult[];
}

interface CurrentTask {
  taskId: string;
  stage: string;
  baselineCommit: string;
  authorizationFile: string;
  authorizationHash: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  status: string;
}

interface GovernanceLock {
  governanceContractFiles: string[];
  stageStatuses: Record<string, string>;
  executionSequence: Array<{ id: string; status: string; dependsOn: string[] }>;
  v05bFreezeDocument?: string;
  v05bFinalCompletionRecord?: string;
  nextStage?: string;
  nextTask?: string;
}

interface BrowserRuntimeOutput {
  status: "PASS" | "FAIL";
  checks?: Record<string, boolean>;
  privacyPass?: boolean;
  numberSafetyPass?: boolean;
  browserConsoleBusinessIssues?: string[];
  defaultImportStatus?: string | null;
  secondImportStatus?: string | null;
  duplicateStatus?: string | null;
  conflictStatus?: string | null;
  reimportStatus?: string | null;
  runtimeError?: string | null;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const gitSucceeds = (args: string[]): boolean => {
  try {
    execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
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

const calculateAuthorizationHash = (authorization: unknown): string =>
  sha256(stableStringify(authorization));

const readAtCommit = (commit: string, relativePath: string): string =>
  git(["show", `${commit}:${relativePath}`]);

const firstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const changedFilesBetween = (fromCommit: string, relativePaths: readonly string[]): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-only",
    fromCommit,
    "HEAD",
    "--",
    ...relativePaths,
  ]);
  return diff.split("\n").map((line) => line.trim()).filter(Boolean);
};

const currentChangedFiles = (): string[] => {
  const status = git(["-c", "core.quotepath=false", "status", "--short"]);
  return status
    .split("\n")
    .map((line) => line.trim().replace(/^[MADRCU?! ]+\s+/, ""))
    .filter(Boolean);
};

const completionPath = (taskId: string): string =>
  `docs/project/task-completions/${taskId}.json`;

const loadCompletion = (taskId: string): CompletionRecord =>
  parseJson<CompletionRecord>(completionPath(taskId));

const validateCompletion = (taskId: string): { pass: boolean; failures: string[]; commit: string | null } => {
  const failures: string[] = [];
  const recordPath = completionPath(taskId);
  if (!exists(recordPath)) return { pass: false, failures: ["completion_missing"], commit: null };
  const record = loadCompletion(taskId);
  if (record.taskId !== taskId) failures.push("task_id_mismatch");
  if (record.status !== "complete") failures.push("completion_not_complete");
  if (!exists(record.authorizationFile)) failures.push("authorization_missing");
  if (!gitSucceeds(["cat-file", "-e", `${record.authorizationCommit}^{commit}`])) failures.push("authorization_commit_missing");
  if (!gitSucceeds(["cat-file", "-e", `${record.completionCommit}^{commit}`])) failures.push("completion_commit_missing");
  if (!gitSucceeds(["merge-base", "--is-ancestor", record.authorizationCommit, record.completionCommit])) {
    failures.push("authorization_not_ancestor_of_completion");
  }
  if (!gitSucceeds(["merge-base", "--is-ancestor", record.completionCommit, "HEAD"])) {
    failures.push("completion_not_head_ancestor");
  }
  if (exists(record.authorizationFile)) {
    const authorization = JSON.parse(read(record.authorizationFile)) as unknown;
    if (calculateAuthorizationHash(authorization) !== record.authorizationHash) failures.push("authorization_hash_mismatch");
  }
  const firstAdd = firstCommitAddingFile(recordPath);
  if (!firstAdd) failures.push("completion_first_commit_missing");
  else if (read(recordPath).replace(/\r\n/g, "\n").trimEnd() !== readAtCommit(firstAdd, recordPath).replace(/\r\n/g, "\n").trimEnd()) {
    failures.push("completion_record_changed_after_registration");
  }
  const allCommandsPass = record.requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );
  if (!allCommandsPass) failures.push("completion_required_commands_not_all_pass");
  return { pass: failures.length === 0, failures, commit: record.completionCommit };
};

const calculateGovernanceHash = (lock: GovernanceLock, commit: string | null): string => {
  const hash = crypto.createHash("sha256");
  lock.governanceContractFiles.forEach((file) => {
    const content = commit ? readAtCommit(commit, file) : read(file);
    hash.update(`FILE:${file}\n${content.replace(/\r\n/g, "\n").trimEnd()}\nEND_FILE\n`);
  });
  return hash.digest("hex");
};

const runCommandJson = <T>(command: string, args: string[]): T => {
  const stdout = execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 20,
  });
  return JSON.parse(stdout) as T;
};

const commandPass = (command: string, args: string[]): boolean => {
  try {
    execFileSync(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    });
    return true;
  } catch {
    return false;
  }
};

const lock = parseJson<GovernanceLock>(LOCK_FILE);
const task = parseJson<CurrentTask>("docs/project/current-task.json");
const completionValidations = Object.fromEntries(
  REQUIRED_COMPLETION_TASKS.map((taskId) => [taskId, validateCompletion(taskId)]),
);

const codeIntegrity = Object.fromEntries(
  CODE_INTEGRITY_RULES.map((rule) => {
    const completion = loadCompletion(rule.taskId);
    return [rule.name, changedFilesBetween(completion.completionCommit, rule.paths).length === 0];
  }),
);

const v05aCompletion = loadCompletion("V0.5A_5_R2_FINAL_REGRESSION_AND_STAGE_FREEZE");
const v05aFrozenIntegrity = changedFilesBetween(v05aCompletion.completionCommit, V05A_FROZEN_PATHS).length === 0;
const currentDiffs = currentChangedFiles();
const currentDiffsAllowed = currentDiffs.every((file) =>
  ALLOWED_CURRENT_DIFFS.some((allowed) => file === allowed || file.startsWith(`${allowed}/`)),
);

const browserRuntime = runCommandJson<BrowserRuntimeOutput>("npx", [
  "tsx",
  "scripts/private-audit/validate-v05b-final-browser-runtime.ts",
]);
const lintPass = commandPass("npm", ["run", "lint"]);
const buildPass = commandPass("npm", ["run", "build"]);

const freezeDoc = exists(FREEZE_DOC) ? read(FREEZE_DOC) : "";
const lockAtBaseline = JSON.parse(readAtCommit(task.baselineCommit, LOCK_FILE)) as GovernanceLock;
const oldGovernanceHash = calculateGovernanceHash(lockAtBaseline, task.baselineCommit);
const newGovernanceHash = calculateGovernanceHash(lock, null);

const checks = {
  currentTaskIdCorrect: task.taskId === TASK_ID,
  currentTaskIsFreezeTask: task.stage === "V0.5B-5" && task.status === "in_progress",
  allRequiredCompletionRecordsValid: Object.values(completionValidations).every((result) => result.pass),
  oldBlockedB1EvidenceStillBlocked: exists("docs/project/task-authorizations/V0.5B_1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT.json") &&
    !exists("docs/project/task-completions/V0.5B_1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT.json"),
  b1ImportCodeIntegrity: codeIntegrity.b1_import_code_integrity === true,
  b2HistoryAlgorithmIntegrity: codeIntegrity.b2_history_algorithm_integrity === true,
  b3QualityAlgorithmIntegrity: codeIntegrity.b3_quality_algorithm_integrity === true,
  b4DataCenterAlgorithmIntegrity: codeIntegrity.b4_data_center_algorithm_integrity === true,
  v05aFrozenCodeIntegrity: v05aFrozenIntegrity,
  currentDiffsAllowed,
  noDependencyChange: changedFilesBetween(task.baselineCommit, ["package.json", "package-lock.json"]).length === 0,
  browserRuntimePass: browserRuntime.status === "PASS",
  defaultStoreImport: browserRuntime.defaultImportStatus === "success",
  secondStoreImport: browserRuntime.secondImportStatus === "success",
  duplicatePass: browserRuntime.duplicateStatus === "already_imported",
  conflictPass: browserRuntime.conflictStatus === "conflict",
  safeReimportPass: browserRuntime.reimportStatus === "success",
  browserChecksAllPass: Object.values(browserRuntime.checks ?? {}).every(Boolean),
  privacyPass: browserRuntime.privacyPass === true,
  numberSafetyPass: browserRuntime.numberSafetyPass === true,
  consoleNoBusinessIssues: (browserRuntime.browserConsoleBusinessIssues ?? []).length === 0,
  stageV05bComplete: lock.stageStatuses["V0.5B"] === "complete",
  stageV05cPending: lock.stageStatuses["V0.5C"] === "pending",
  laterStagesPending: ["V0.5D", "V0.5E", "V0.5F", "V0.5G"].every((stage) => lock.stageStatuses[stage] === "pending"),
  freezeDocumentExists: exists(FREEZE_DOC),
  freezeDocumentHasRequiredScope: [
    "数据导入",
    "导入记录",
    "数据质量",
    "多店铺隔离",
    "duplicate",
    "conflict",
    "Legacy Compatibility",
    "隐私边界",
    "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT",
  ].every((term) => freezeDoc.includes(term)),
  lockRecordsFreezeDocument: lock.v05bFreezeDocument === FREEZE_DOC,
  lockRecordsCompletionRecord: lock.v05bFinalCompletionRecord === "docs/project/task-completions/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  nextStageCorrect: lock.nextStage === "V0.5C",
  nextTaskCorrect: lock.nextTask === "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT",
  lintPass,
  buildPass,
};

const status = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  taskId: TASK_ID,
  completionRecords: Object.fromEntries(
    Object.entries(completionValidations).map(([taskId, result]) => [
      taskId,
      {
        pass: result.pass,
        completionCommit: result.commit,
        failures: result.failures,
      },
    ]),
  ),
  codeIntegrity,
  v05aFrozenIntegrity,
  currentDiffs,
  browserRuntime: {
    status: browserRuntime.status,
    defaultImportStatus: browserRuntime.defaultImportStatus,
    secondImportStatus: browserRuntime.secondImportStatus,
    duplicateStatus: browserRuntime.duplicateStatus,
    conflictStatus: browserRuntime.conflictStatus,
    reimportStatus: browserRuntime.reimportStatus,
    privacyPass: browserRuntime.privacyPass,
    numberSafetyPass: browserRuntime.numberSafetyPass,
    consoleIssueCount: browserRuntime.browserConsoleBusinessIssues?.length ?? null,
    runtimeError: browserRuntime.runtimeError ?? null,
  },
  oldGovernanceHash,
  newGovernanceHash,
  stageStatuses: {
    V05A: lock.stageStatuses["V0.5A"],
    V05B: lock.stageStatuses["V0.5B"],
    V05C: lock.stageStatuses["V0.5C"],
  },
  freezeDocument: FREEZE_DOC,
  nextTask: lock.nextTask,
  lintPass,
  buildPass,
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
