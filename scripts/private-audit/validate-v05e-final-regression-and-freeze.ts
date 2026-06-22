import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const E1_COMPLETION = "docs/project/task-completions/V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT.json";
const E2_COMPLETION = "docs/project/task-completions/V0.5E_2_STORE_SCOPED_USER_DEFINED_SERIES_BOARD_RELAYOUT.json";
const E3_COMPLETION = "docs/project/task-completions/V0.5E_3_STORE_SCOPED_TRACKED_PRODUCT_BOARD_RELAYOUT.json";
const FREEZE_DOC = "docs/releases/v0.5e-series-tracked-product-focus-freeze.md";
const LOCK_FILE = "docs/project/v0.5-lock.json";
const RUNTIME_SCRIPT = "scripts/private-audit/validate-v05e-final-browser-runtime.ts";

const COMMON_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts",
  "npx tsx scripts/private-audit/validate-v05a41-real-adapter-browser-integration.ts",
] as const;

const REQUIRED_E1_COMMANDS = [
  ...COMMON_COMMANDS,
  "npx tsx scripts/private-audit/validate-v05e1-series-tracked-product-data.ts",
  "npx tsx scripts/private-audit/validate-v05e1-series-tracked-product-ui.ts",
  "npm run lint",
  "npm run build",
] as const;

const REQUIRED_E2_COMMANDS = [
  ...COMMON_COMMANDS,
  "npx tsx scripts/private-audit/validate-v05e1-series-tracked-product-data.ts",
  "npx tsx scripts/private-audit/validate-v05e1-series-tracked-product-ui.ts",
  "npx tsx scripts/private-audit/validate-v05e2-series-board-data.ts",
  "npx tsx scripts/private-audit/validate-v05e2-series-board-ui.ts",
  "npm run lint",
  "npm run build",
] as const;

const REQUIRED_E3_COMMANDS = [
  ...COMMON_COMMANDS,
  "npx tsx scripts/private-audit/validate-v05e2-series-board-data.ts",
  "npx tsx scripts/private-audit/validate-v05e2-series-board-ui.ts",
  "npx tsx scripts/private-audit/validate-v05e3-tracked-product-board-data.ts",
  "npx tsx scripts/private-audit/validate-v05e3-tracked-product-board-ui.ts",
  "npm run lint",
  "npm run build",
] as const;

const ALLOWED_AFTER_BASELINE = [
  "docs/releases/v0.5e-series-tracked-product-focus-freeze.md",
  "docs/project/v0.5-lock.json",
  "scripts/private-audit/validate-v05e-final-browser-runtime.ts",
  "scripts/private-audit/validate-v05e-final-regression-and-freeze.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  "docs/project/task-completions/V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
] as const;

const REQUIRED_FREEZE_DOC_TERMS = [
  "V0.5E",
  "系列管理",
  "重点商品管理",
  "platformCode + storeId",
  "inactive",
  "重新启用",
  "跨店同名系列",
  "跨店同 productId",
  "ad-only",
  "Series Board",
  "Product Board",
  "只读",
  "单一主趋势图",
  "legacy",
  "并发",
  "390px",
  "可访问性",
  "隐私",
  "V0.5F_1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER",
] as const;

interface CompletionRecord {
  taskId: string;
  stage: string;
  status: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  commandResults: Array<{ command: string; status: string }>;
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

const requiredCommandsPass = (
  record: CompletionRecord,
  requiredCommands: readonly string[],
): boolean =>
  requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );

const completionRecordValid = (
  relativePath: string,
  taskId: string,
  requiredCommands: readonly string[],
): boolean => {
  const record = json<CompletionRecord>(relativePath);
  return (
    record.taskId === taskId &&
    record.status === "complete" &&
    commitExists(record.authorizationCommit) &&
    commitExists(record.completionCommit) &&
    isAncestor(record.authorizationCommit, record.completionCommit) &&
    isAncestor(record.completionCommit) &&
    fileMatchesFirstCommit(relativePath) &&
    fileMatchesFirstCommit(record.authorizationFile) &&
    requiredCommandsPass(record, requiredCommands)
  );
};

const runRuntime = () => {
  const output = execFileSync("npx", ["tsx", RUNTIME_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return JSON.parse(output) as {
    status: string;
    failedChecks: string[];
    databaseName: string;
    screenshotManifestPath: string | null;
    mobile390NoOverflow: boolean;
    privacyPass: boolean;
    numberSafetyPass: boolean;
    productionDatabaseUntouched: boolean;
    selectedFileCount: number;
    importButtonClicked: boolean;
  };
};

const main = () => {
  const e1 = json<CompletionRecord>(E1_COMPLETION);
  const e2 = json<CompletionRecord>(E2_COMPLETION);
  const e3 = json<CompletionRecord>(E3_COMPLETION);
  const currentTask = json<{ baselineCommit: string }>("docs/project/current-task.json");
  const lock = json<{
    stageStatuses: Record<string, string>;
    executionSequence: Array<{ id: string; status: string }>;
    nextStage?: string;
    nextTask?: string;
    v05eCompletedAt?: string;
    v05eFreezeDocument?: string;
    v05eFinalCompletionRecord?: string;
  }>(LOCK_FILE);
  const freezeDoc = exists(FREEZE_DOC) ? read(FREEZE_DOC) : "";
  const runtime = runRuntime();
  const executionStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id, item.status]));
  const changedAfterBaseline = git(["diff", "--name-only", `${currentTask.baselineCommit}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const manifest = runtime.screenshotManifestPath && fs.existsSync(runtime.screenshotManifestPath)
    ? JSON.parse(fs.readFileSync(runtime.screenshotManifestPath, "utf8")) as {
        taskId?: string;
        databaseName?: string;
        screenshots?: Array<{ key?: string; filePath?: string; viewport?: string; sha256?: string }>;
      }
    : null;

  const checks = {
    e1CompletionValid: completionRecordValid(
      E1_COMPLETION,
      "V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT",
      REQUIRED_E1_COMMANDS,
    ),
    e2CompletionValid: completionRecordValid(
      E2_COMPLETION,
      "V0.5E_2_STORE_SCOPED_USER_DEFINED_SERIES_BOARD_RELAYOUT",
      REQUIRED_E2_COMMANDS,
    ),
    e3CompletionValid: completionRecordValid(
      E3_COMPLETION,
      "V0.5E_3_STORE_SCOPED_TRACKED_PRODUCT_BOARD_RELAYOUT",
      REQUIRED_E3_COMMANDS,
    ),
    e1E2E3CommitsAreAncestors:
      isAncestor(e1.completionCommit) &&
      isAncestor(e2.completionCommit) &&
      isAncestor(e3.completionCommit),
    e1E2E3AuthorizationsImmutable:
      fileMatchesFirstCommit(e1.authorizationFile) &&
      fileMatchesFirstCommit(e2.authorizationFile) &&
      fileMatchesFirstCommit(e3.authorizationFile),
    noUnauthorizedChangesAfterBaseline:
      changedAfterBaseline.every((filePath) =>
        ALLOWED_AFTER_BASELINE.includes(filePath as (typeof ALLOWED_AFTER_BASELINE)[number]),
      ),
    runtimePass: runtime.status === "PASS" && runtime.failedChecks.length === 0,
    runtimeDatabaseIsE4: runtime.databaseName === "airburg-v05-e4-audit",
    runtimeUsedRealUpload:
      runtime.selectedFileCount === 4 &&
      runtime.importButtonClicked === true,
    runtimePrivacyAndNumberSafety:
      runtime.privacyPass &&
      runtime.numberSafetyPass,
    runtimeMobile390:
      runtime.mobile390NoOverflow,
    runtimeProductionDatabaseUntouched:
      runtime.productionDatabaseUntouched,
    screenshotManifestExists:
      !!manifest &&
      runtime.screenshotManifestPath !== null &&
      fs.existsSync(runtime.screenshotManifestPath),
    screenshotManifestComplete:
      !!manifest &&
      manifest.taskId === "V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE" &&
      manifest.databaseName === "airburg-v05-e4-audit" &&
      Array.isArray(manifest.screenshots) &&
      manifest.screenshots.length >= 14 &&
      manifest.screenshots.every((item) =>
        typeof item.filePath === "string" &&
        fs.existsSync(item.filePath) &&
        typeof item.sha256 === "string" &&
        item.sha256.length === 64,
      ),
    freezeDocExists: exists(FREEZE_DOC),
    freezeDocComplete:
      REQUIRED_FREEZE_DOC_TERMS.every((term) => freezeDoc.includes(term)) &&
      freezeDoc.includes("公司总目标") &&
      freezeDoc.includes("目标抽屉") &&
      freezeDoc.includes("其他平台解析器") &&
      freezeDoc.includes("AI") &&
      freezeDoc.includes("后端"),
    lockV05eComplete:
      lock.stageStatuses["V0.5E"] === "complete" &&
      executionStatus["V0.5E"] === "complete",
    lockV05fPending:
      lock.stageStatuses["V0.5F"] === "pending" &&
      executionStatus["V0.5F"] === "pending",
    lockV05gPending:
      lock.stageStatuses["V0.5G"] === "pending" &&
      executionStatus["V0.5G"] === "pending",
    lockPreviousStagesComplete:
      ["V0.5A", "V0.5B", "V0.5C", "V0.5D"].every((stage) =>
        lock.stageStatuses[stage] === "complete" &&
        executionStatus[stage] === "complete",
      ),
    lockNextStage:
      lock.nextStage === "V0.5F" &&
      lock.nextTask === "V0.5F_1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER",
    lockFreezePointers:
      typeof lock.v05eCompletedAt === "string" &&
      lock.v05eFreezeDocument === FREEZE_DOC &&
      lock.v05eFinalCompletionRecord === "docs/project/task-completions/V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  };

  const failedChecks = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e-final-regression-and-freeze",
    failedChecks,
    e1CompletionCommit: e1.completionCommit,
    e2CompletionCommit: e2.completionCommit,
    e3CompletionCommit: e3.completionCommit,
    runtimeStatus: runtime.status,
    runtimeFailedChecks: runtime.failedChecks,
    screenshotManifestPath: runtime.screenshotManifestPath,
    v05eStatus: lock.stageStatuses["V0.5E"],
    v05fStatus: lock.stageStatuses["V0.5F"],
    nextStage: lock.nextStage,
    nextTask: lock.nextTask,
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
    script: "validate-v05e-final-regression-and-freeze",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
