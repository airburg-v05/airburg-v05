import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const D1_COMPLETION = "docs/project/task-completions/V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT.json";
const D2_COMPLETION = "docs/project/task-completions/V0.5D_2_STORE_BOARD_VISUAL_RUNTIME_AND_DRILLDOWN_CLOSURE.json";
const FREEZE_DOC = "docs/releases/v0.5d-multi-store-board-freeze.md";
const LOCK_FILE = "docs/project/v0.5-lock.json";
const RUNTIME_SCRIPT = "scripts/private-audit/validate-v05d-final-browser-runtime.ts";

const REQUIRED_D1_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts",
  "npx tsx scripts/private-audit/validate-v05a41-real-adapter-browser-integration.ts",
  "npx tsx scripts/private-audit/validate-v05d1-store-board-data.ts",
  "npx tsx scripts/private-audit/validate-v05d1-store-board-ui.ts",
  "npm run lint",
  "npm run build",
] as const;

const REQUIRED_D2_COMMANDS = [
  ...REQUIRED_D1_COMMANDS.slice(0, 6),
  "npx tsx scripts/private-audit/validate-v05d1-store-board-data.ts",
  "npx tsx scripts/private-audit/validate-v05d1-store-board-ui.ts",
  "npx tsx scripts/private-audit/validate-v05d2-store-board-runtime.ts",
  "npx tsx scripts/private-audit/validate-v05d2-store-board-visual-usability.ts",
  "npm run lint",
  "npm run build",
] as const;

const ALLOWED_AFTER_D2 = [
  "docs/releases/v0.5d-multi-store-board-freeze.md",
  "docs/project/v0.5-lock.json",
  "scripts/private-audit/validate-v05d-final-browser-runtime.ts",
  "scripts/private-audit/validate-v05d-final-regression-and-freeze.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  "docs/project/task-completions/V0.5D_2_STORE_BOARD_VISUAL_RUNTIME_AND_DRILLDOWN_CLOSURE.json",
  "docs/project/task-completions/V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
] as const;

const FORBIDDEN_AFTER_D2_PREFIXES = [
  "app/",
  "components/",
  "lib/",
  "types/",
  "package.json",
  "package-lock.json",
  "private-samples/",
  "docs/product/",
  "docs/design/",
  "docs/roadmap/",
  "docs/quality/",
  "docs/architecture/",
  "docs/decisions/",
] as const;

const REQUIRED_FREEZE_DOC_TERMS = [
  "V0.5D",
  "多店铺 Store Board",
  "V2-first",
  "legacy fallback",
  "platform/store",
  "多店铺隔离",
  "日期周期",
  "GMV",
  "GSV",
  "商品访客",
  "支付买家",
  "支付转化率",
  "推广花费",
  "店铺目标只读",
  "单一主趋势图",
  "商品 TOP",
  "系列进度",
  "推广与售后",
  "首页下钻",
  "非默认商品/系列旧看板限制",
  "invalid store",
  "empty/corrupted",
  "390px",
  "可访问性",
  "隐私",
  "V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT",
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
    const committed = git(["show", `${firstCommit}:${relativePath}`]);
    return committed === read(relativePath).trimEnd();
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

const runFinalBrowserRuntime = () => {
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
    privacyPass: boolean;
    numberSafetyPass: boolean;
    mobile390NoOverflow: boolean;
    defaultStoreBoardWorks: boolean;
    secondStoreBoardWorks: boolean;
    homeSecondStoreLinkWorks: boolean;
    focusTabsWork: boolean;
    defaultProductDrilldownSafe: boolean;
    nonDefaultProductDrilldownDisabled: boolean;
    invalidPlatformSafe: boolean;
    nonDefaultLegacyFallbackBlocked: boolean;
  };
};

const main = () => {
  const d1 = json<CompletionRecord>(D1_COMPLETION);
  const d2 = json<CompletionRecord>(D2_COMPLETION);
  const freezeDoc = exists(FREEZE_DOC) ? read(FREEZE_DOC) : "";
  const lock = json<{
    stageStatuses: Record<string, string>;
    executionSequence: Array<{ id: string; status: string }>;
    nextStage?: string;
    nextTask?: string;
    v05dCompletedAt?: string;
    v05dFreezeDocument?: string;
    v05dFinalCompletionRecord?: string;
  }>(LOCK_FILE);
  const executionStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id, item.status]));
  const changedAfterD2 = git(["diff", "--name-only", `${d2.completionCommit}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const runtime = runFinalBrowserRuntime();
  const manifest = runtime.screenshotManifestPath && fs.existsSync(runtime.screenshotManifestPath)
    ? JSON.parse(fs.readFileSync(runtime.screenshotManifestPath, "utf8")) as {
        taskId?: string;
        databaseName?: string;
        screenshots?: Array<{ key?: string; filePath?: string; viewport?: string; sha256?: string }>;
      }
    : null;

  const expectedScreenshotKeys = [
    "desktopDefaultStore",
    "desktopSecondStore",
    "desktopWeekView",
    "desktopMonthView",
    "desktopCustomView",
    "desktopProductTab",
    "desktopSeriesTab",
    "desktopAdAfterSalesTab",
    "desktopLegacyFallback",
    "desktopInvalidStore",
    "desktopCorruptedState",
    "mobileDefaultStore",
    "mobileSecondStore",
    "mobileStoreSwitch",
    "mobileMetrics",
    "mobileTargetSummary",
    "mobileTrend",
    "mobileProductTab",
    "mobileSeriesTab",
    "mobileAdAfterSalesTab",
    "mobileLegacyFallback",
  ];

  const checks = {
    d1CompletionValid: completionRecordValid(
      D1_COMPLETION,
      "V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT",
      REQUIRED_D1_COMMANDS,
    ),
    d2CompletionValid: completionRecordValid(
      D2_COMPLETION,
      "V0.5D_2_STORE_BOARD_VISUAL_RUNTIME_AND_DRILLDOWN_CLOSURE",
      REQUIRED_D2_COMMANDS,
    ),
    d1D2CommitsAreAncestors: isAncestor(d1.completionCommit) && isAncestor(d2.completionCommit),
    d1D2AuthorizationsImmutable: fileMatchesFirstCommit(d1.authorizationFile) && fileMatchesFirstCommit(d2.authorizationFile),
    noForbiddenChangesAfterD2: changedAfterD2.every(
      (filePath) =>
        ALLOWED_AFTER_D2.includes(filePath as (typeof ALLOWED_AFTER_D2)[number]) &&
        !FORBIDDEN_AFTER_D2_PREFIXES.some((prefix) => filePath.startsWith(prefix)),
    ),
    runtimePass: runtime.status === "PASS" && runtime.failedChecks.length === 0,
    runtimeDatabaseIsD3: runtime.databaseName === "airburg-v05-d3-audit",
    runtimeStoreIsolation:
      runtime.defaultStoreBoardWorks &&
      runtime.secondStoreBoardWorks &&
      runtime.homeSecondStoreLinkWorks,
    runtimeDrilldownBoundaries:
      runtime.defaultProductDrilldownSafe &&
      runtime.nonDefaultProductDrilldownDisabled &&
      runtime.invalidPlatformSafe &&
      runtime.nonDefaultLegacyFallbackBlocked,
    runtimePrivacyAndNumberSafety:
      runtime.privacyPass &&
      runtime.numberSafetyPass,
    runtimeMobile390:
      runtime.mobile390NoOverflow === true,
    screenshotManifestExists:
      !!manifest &&
      runtime.screenshotManifestPath !== null &&
      fs.existsSync(runtime.screenshotManifestPath),
    screenshotManifestComplete:
      !!manifest &&
      manifest.taskId === "V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE" &&
      manifest.databaseName === "airburg-v05-d3-audit" &&
      expectedScreenshotKeys.every((key) =>
        manifest.screenshots?.some((item) =>
          item.key === key &&
          typeof item.filePath === "string" &&
          fs.existsSync(item.filePath) &&
          typeof item.sha256 === "string" &&
          item.sha256.length === 64,
        ),
      ),
    freezeDocExists: exists(FREEZE_DOC),
    freezeDocComplete: REQUIRED_FREEZE_DOC_TERMS.every((term) => freezeDoc.includes(term)),
    lockV05dComplete:
      lock.stageStatuses["V0.5D"] === "complete" &&
      executionStatus["V0.5D"] === "complete",
    lockV05ePending:
      lock.stageStatuses["V0.5E"] === "pending" &&
      executionStatus["V0.5E"] === "pending",
    lockV05fV05gPending:
      lock.stageStatuses["V0.5F"] === "pending" &&
      lock.stageStatuses["V0.5G"] === "pending" &&
      executionStatus["V0.5F"] === "pending" &&
      executionStatus["V0.5G"] === "pending",
    lockNextStage:
      lock.nextStage === "V0.5E" &&
      lock.nextTask === "V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT",
    lockFreezePointers:
      typeof lock.v05dCompletedAt === "string" &&
      lock.v05dFreezeDocument === FREEZE_DOC &&
      lock.v05dFinalCompletionRecord === "docs/project/task-completions/V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05d-final-regression-and-freeze",
    failedChecks,
    d1CompletionCommit: d1.completionCommit,
    d2CompletionCommit: d2.completionCommit,
    runtimeStatus: runtime.status,
    runtimeFailedChecks: runtime.failedChecks,
    screenshotManifestPath: runtime.screenshotManifestPath,
    v05dStatus: lock.stageStatuses["V0.5D"],
    v05eStatus: lock.stageStatuses["V0.5E"],
    nextStage: lock.nextStage,
    nextTask: lock.nextTask,
    changedAfterD2,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05d-final-regression-and-freeze",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
