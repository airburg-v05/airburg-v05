import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE";
const OLD_F5_TASK_ID = "V0.5F_5_FINAL_REGRESSION_AND_STAGE_FREEZE";
const FREEZE_DOC = "docs/releases/v0.5f-target-allocation-freeze.md";
const LOCK_FILE = "docs/project/v0.5-lock.json";
const RUNTIME_SCRIPT = "scripts/private-audit/validate-v05f-final-browser-runtime.ts";
const R1_COMPLETION = "docs/project/task-completions/V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const OLD_F5_AUTHORIZATION = "docs/project/task-authorizations/V0.5F_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const OLD_F5_AUTHORIZATION_COMMIT = "0803d73";
const OLD_F5_BLOCKED_COMMIT = "841822b";

const F_COMPLETIONS = [
  "docs/project/task-completions/V0.5F_0_TARGET_HIERARCHY_CONTRACT_AND_STORAGE_READINESS.json",
  "docs/project/task-completions/V0.5F_1_R1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER.json",
  "docs/project/task-completions/V0.5F_2_PARENT_CHILD_TARGET_ALLOCATION_WORKFLOW.json",
  "docs/project/task-completions/V0.5F_3_TARGET_CONTEXT_AND_BOARD_INTEGRATION.json",
  "docs/project/task-completions/V0.5F_4_TARGET_RUNTIME_VISUAL_AND_CONFLICT_CLOSURE.json",
] as const;

const REQUIRED_CURRENT_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts",
  "npx tsx scripts/private-audit/validate-v05a41-real-adapter-browser-integration.ts",
  "npx tsx scripts/private-audit/validate-v05f-final-browser-runtime.ts",
  "npx tsx scripts/private-audit/validate-v05f-final-regression-and-freeze.ts",
  "npm run lint",
  "npm run build",
] as const;

const FORBIDDEN_CURRENT_COMMAND_FRAGMENTS = [
  "validate-v05f0-target-hierarchy-contract.ts",
  "validate-v05f0-target-hierarchy-persistence.ts",
  "validate-v05f1r1-target-management-data.ts",
  "validate-v05f1r1-target-management-ui.ts",
  "validate-v05f2-target-allocation-data.ts",
  "validate-v05f2-target-allocation-ui.ts",
  "validate-v05f3-target-context-board-integration-data.ts",
  "validate-v05f3-target-context-board-integration-ui.ts",
  "validate-v05f4-target-runtime-visual-conflict.ts",
  "validate-v05f4-target-accessibility-screenshots.ts",
] as const;

const ALLOWED_AFTER_BASELINE = [
  "docs/releases/v0.5f-target-allocation-freeze.md",
  "docs/project/v0.5-lock.json",
  "scripts/private-audit/validate-v05f-final-browser-runtime.ts",
  "scripts/private-audit/validate-v05f-final-regression-and-freeze.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  "docs/project/task-completions/V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
] as const;

const REQUIRED_FREEZE_DOC_TERMS = [
  "V0.5F",
  "目标分配",
  "company → store → series → product",
  "parentTargetId",
  "目标抽屉",
  "暂停",
  "重新启用",
  "under_allocated",
  "fully_allocated",
  "over_allocated",
  "Home",
  "Store Board",
  "Series Board",
  "Product Board",
  "legacy",
  "并发",
  "390px",
  "隐私",
  "V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE",
] as const;

interface CompletionRecord {
  taskId: string;
  stage: string;
  status: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  requiredCommands?: string[];
  commandResults: Array<{ command: string; status: string; screenshotManifestPath?: string }>;
}

interface CurrentTask {
  taskId: string;
  status: string;
  baselineCommit: string;
  authorizationFile: string;
  authorizationCommit: string;
  requiredCommands: string[];
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const json = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const commitExists = (commit: string): boolean => {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

const isAncestor = (ancestor: string, descendant = "HEAD"): boolean => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const fileMatchesFirstCommit = (relativePath: string): boolean => {
  try {
    const commits = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath])
      .split("\n")
      .filter(Boolean);
    const firstCommit = commits.at(-1);
    if (!firstCommit) return false;
    return git(["show", `${firstCommit}:${relativePath}`]) === read(relativePath).trimEnd();
  } catch {
    return false;
  }
};

const completionRecordValid = (relativePath: string): boolean => {
  const record = json<CompletionRecord>(relativePath);
  const requiredCommands = record.requiredCommands ?? [];
  const requiredCommandsPass = requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );
  return (
    record.status === "complete" &&
    commitExists(record.authorizationCommit) &&
    commitExists(record.completionCommit) &&
    isAncestor(record.authorizationCommit, record.completionCommit) &&
    isAncestor(record.completionCommit) &&
    fileMatchesFirstCommit(relativePath) &&
    fileMatchesFirstCommit(record.authorizationFile) &&
    requiredCommands.length > 0 &&
    requiredCommandsPass
  );
};

const completionSummary = (relativePath: string) => {
  const record = json<CompletionRecord>(relativePath);
  return {
    taskId: record.taskId,
    status: record.status,
    completionCommit: record.completionCommit,
    requiredCommandCount: record.requiredCommands?.length ?? 0,
    passCommandCount: record.commandResults.filter((item) => item.status === "PASS").length,
  };
};

const runRuntime = () => {
  const output = execFileSync("npx", ["tsx", RUNTIME_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return JSON.parse(output) as {
    status: string;
    failedChecks: Array<{ name?: string; detail?: unknown }>;
    databaseName: string;
    screenshotManifestPath: string | null;
    screenshotCount: number;
    mobile390NoOverflow: boolean;
    privacyPass: boolean;
    numberSafetyPass: boolean;
    productionDatabaseUntouched: boolean;
  };
};

const oldBlockedCurrentTask = () => {
  try {
    return JSON.parse(git(["show", `${OLD_F5_BLOCKED_COMMIT}:docs/project/current-task.json`])) as {
      taskId?: string;
      status?: string;
    };
  } catch {
    return null;
  }
};

const main = () => {
  const currentTask = json<CurrentTask>("docs/project/current-task.json");
  const lock = json<{
    stageStatuses: Record<string, string>;
    executionSequence: Array<{ id: string; status: string }>;
    nextStage?: string;
    nextTask?: string;
    v05fCompletedAt?: string;
    v05fFreezeDocument?: string;
    v05fFinalCompletionRecord?: string;
  }>(LOCK_FILE);
  const executionStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id, item.status]));
  const freezeDoc = exists(FREEZE_DOC) ? read(FREEZE_DOC) : "";
  const changedAfterBaseline = git(["diff", "--name-only", `${currentTask.baselineCommit}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const oldBlockedTask = oldBlockedCurrentTask();
  const runtime = runRuntime();
  const manifest = runtime.screenshotManifestPath && fs.existsSync(runtime.screenshotManifestPath)
    ? JSON.parse(fs.readFileSync(runtime.screenshotManifestPath, "utf8")) as {
        taskId?: string;
        databaseName?: string;
        screenshots?: Array<{ key?: string; filePath?: string; sha256?: string }>;
      }
    : null;
  const completionExists = exists(R1_COMPLETION);
  const completionRecord = completionExists ? json<CompletionRecord>(R1_COMPLETION) : null;

  const checks = {
    currentTaskIsR1: currentTask.taskId === TASK_ID,
    currentTaskRequiredCommandsExact:
      currentTask.requiredCommands.length === REQUIRED_CURRENT_COMMANDS.length &&
      REQUIRED_CURRENT_COMMANDS.every((command, index) => currentTask.requiredCommands[index] === command),
    currentTaskHasNoHistoricalTaskScopedCommands:
      FORBIDDEN_CURRENT_COMMAND_FRAGMENTS.every((fragment) =>
        currentTask.requiredCommands.every((command) => !command.includes(fragment)),
      ),
    f0ThroughF4CompletionRecordsValid: F_COMPLETIONS.every(completionRecordValid),
    f0ThroughF4CompletionCommitsAncestors:
      F_COMPLETIONS.every((relativePath) => isAncestor(json<CompletionRecord>(relativePath).completionCommit)),
    oldF5BlockedAuthorizationExistsAndImmutable:
      exists(OLD_F5_AUTHORIZATION) &&
      commitExists(OLD_F5_AUTHORIZATION_COMMIT) &&
      isAncestor(OLD_F5_AUTHORIZATION_COMMIT) &&
      fileMatchesFirstCommit(OLD_F5_AUTHORIZATION),
    oldF5BlockedCurrentTaskCommitPreserved:
      commitExists(OLD_F5_BLOCKED_COMMIT) &&
      isAncestor(OLD_F5_BLOCKED_COMMIT) &&
      oldBlockedTask?.taskId === OLD_F5_TASK_ID &&
      oldBlockedTask?.status === "blocked",
    noOldF5PassCompletionRecord:
      !exists("docs/project/task-completions/V0.5F_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json"),
    v05gNotStarted:
      !exists("docs/project/task-authorizations/V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE.json") &&
      !exists("docs/project/task-completions/V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE.json"),
    noUnauthorizedChangesAfterBaseline:
      changedAfterBaseline.every((filePath) =>
        ALLOWED_AFTER_BASELINE.includes(filePath as (typeof ALLOWED_AFTER_BASELINE)[number]),
      ),
    runtimePass: runtime.status === "PASS" && runtime.failedChecks.length === 0,
    runtimeDatabaseIsF5R1: runtime.databaseName === "airburg-v05-f5r1-audit",
    runtimePrivacyAndNumberSafety: runtime.privacyPass && runtime.numberSafetyPass,
    runtimeMobile390: runtime.mobile390NoOverflow,
    runtimeProductionDatabaseUntouched: runtime.productionDatabaseUntouched,
    screenshotManifestComplete:
      !!manifest &&
      manifest.taskId === TASK_ID &&
      manifest.databaseName === "airburg-v05-f5r1-audit" &&
      Array.isArray(manifest.screenshots) &&
      manifest.screenshots.length >= 12 &&
      manifest.screenshots.every((item) =>
        typeof item.filePath === "string" &&
        fs.existsSync(item.filePath) &&
        typeof item.sha256 === "string" &&
        item.sha256.length === 64,
      ),
    freezeDocExistsAndComplete:
      exists(FREEZE_DOC) &&
      REQUIRED_FREEZE_DOC_TERMS.every((term) => freezeDoc.includes(term)),
    freezeDocRegistrationState:
      completionExists
        ? freezeDoc.includes("PASS，immutable completion record 已注册，V0.5F 已作为冻结基线。")
        : freezeDoc.includes("PASS，待 immutable completion record 注册。"),
    lockV05fComplete:
      lock.stageStatuses["V0.5F"] === "complete" &&
      executionStatus["V0.5F"] === "complete",
    lockV05gPending:
      lock.stageStatuses["V0.5G"] === "pending" &&
      executionStatus["V0.5G"] === "pending",
    lockPreviousStagesComplete:
      ["V0.5A", "V0.5B", "V0.5C", "V0.5D", "V0.5E"].every((stage) =>
        lock.stageStatuses[stage] === "complete" &&
        executionStatus[stage] === "complete",
      ),
    lockNextTask:
      lock.nextStage === "V0.5G" &&
      lock.nextTask === "V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE",
    lockFreezePointers:
      typeof lock.v05fCompletedAt === "string" &&
      lock.v05fFreezeDocument === FREEZE_DOC &&
      lock.v05fFinalCompletionRecord === R1_COMPLETION,
    completionRecordValidWhenPresent:
      !completionExists ||
      (!!completionRecord &&
        completionRecord.taskId === TASK_ID &&
        completionRecord.status === "complete" &&
        completionRecordValid(R1_COMPLETION)),
  };

  const failedChecks = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05f-final-regression-and-freeze",
    taskId: TASK_ID,
    failedChecks,
    fCompletionRecords: F_COMPLETIONS.map(completionSummary),
    oldF5BlockedAuthorizationCommit: OLD_F5_AUTHORIZATION_COMMIT,
    oldF5BlockedCurrentTaskCommit: OLD_F5_BLOCKED_COMMIT,
    runtimeStatus: runtime.status,
    runtimeFailedChecks: runtime.failedChecks,
    screenshotManifestPath: runtime.screenshotManifestPath,
    v05fStatus: lock.stageStatuses["V0.5F"],
    v05gStatus: lock.stageStatuses["V0.5G"],
    nextStage: lock.nextStage,
    nextTask: lock.nextTask,
    completionRecordRegistered: completionExists,
    changedAfterBaseline,
    checks,
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05f-final-regression-and-freeze",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
