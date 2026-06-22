import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const C1_COMPLETION = "docs/project/task-completions/V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT.json";
const C2_COMPLETION = "docs/project/task-completions/V0.5C_2_HOME_VISUAL_DRILLDOWN_AND_RUNTIME_CLOSURE.json";
const FREEZE_DOC = "docs/releases/v0.5c-home-command-center-freeze.md";
const LOCK_FILE = "docs/project/v0.5-lock.json";
const RUNTIME_SCRIPT = "scripts/private-audit/validate-v05c-final-browser-runtime.ts";

const REQUIRED_C1_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05a32-real-fixture-readiness-gate.ts",
  "npx tsx scripts/private-audit/validate-v05a41-real-adapter-browser-integration.ts",
  "npx tsx scripts/private-audit/validate-v05c1-home-command-center-data.ts",
  "npx tsx scripts/private-audit/validate-v05c1-home-command-center-ui.ts",
  "npm run lint",
  "npm run build",
] as const;

const REQUIRED_C2_COMMANDS = [
  ...REQUIRED_C1_COMMANDS.slice(0, 6),
  "npx tsx scripts/private-audit/validate-v05c1-home-command-center-data.ts",
  "npx tsx scripts/private-audit/validate-v05c1-home-command-center-ui.ts",
  "npx tsx scripts/private-audit/validate-v05c2-home-runtime-and-drilldown.ts",
  "npx tsx scripts/private-audit/validate-v05c2-home-visual-usability.ts",
  "npm run lint",
  "npm run build",
] as const;

const FORBIDDEN_AFTER_C2_PREFIXES = [
  "app/",
  "components/",
  "lib/",
  "types/",
  "package.json",
  "package-lock.json",
  "private-samples/",
] as const;

const OLD_HOME_MODULES = [
  "HomeWorkbenchOverview",
  "HomeSectionNav",
  "TmallGlobalDataStatusGuide",
  "TmallMetricGrid",
  "TmallProductRanking",
  "TmallRiskList",
  "TmallQualitySummary",
  "TmallReconciliation",
] as const;

const INTERNAL_TERMS = [
  "V2 staging",
  "active pointer",
  "readback",
  "legacy adapter",
  "V0.5C_",
  "OpenAI",
  "千问",
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

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const json = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

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

const fileMatchesCommit = (relativePath: string): boolean => {
  try {
    const firstCommit = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]).split("\n").filter(Boolean).at(-1);
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
    fileMatchesCommit(relativePath) &&
    requiredCommandsPass(record, requiredCommands)
  );
};

const runRuntime = () => {
  const output = execFileSync("npx", ["tsx", RUNTIME_SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const parsed = JSON.parse(output) as {
    status: string;
    failedChecks: string[];
    screenshotManifestPath: string | null;
    privacyPass: boolean;
    numberSafetyPass: boolean;
    mobile390Pass: boolean;
  };
  return parsed;
};

const main = () => {
  const c1 = json<CompletionRecord>(C1_COMPLETION);
  const c2 = json<CompletionRecord>(C2_COMPLETION);
  const lock = json<{
    stageStatuses: Record<string, string>;
    executionSequence: Array<{ id: string; status: string }>;
    nextStage?: string;
    nextTask?: string;
    v05cFreezeDocument?: string;
    v05cFinalCompletionRecord?: string;
  }>(LOCK_FILE);
  const homePage = read("app/(workspace)/home/page.tsx");
  const homeComponents = fs
    .readdirSync(path.join(ROOT, "components/home/v05"))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => read(`components/home/v05/${file}`))
    .join("\n");
  const homeVm = fs
    .readdirSync(path.join(ROOT, "lib/v05/home-command-center"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => read(`lib/v05/home-command-center/${file}`))
    .join("\n");
  const freezeDoc = exists(FREEZE_DOC) ? read(FREEZE_DOC) : "";
  const changedAfterC2 = git(["diff", "--name-only", `${c2.completionCommit}..HEAD`])
    .split("\n")
    .filter(Boolean);
  const runtime = runRuntime();
  const executionStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id, item.status]));

  const checks = {
    c1CompletionValid: completionRecordValid(
      C1_COMPLETION,
      "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT",
      REQUIRED_C1_COMMANDS,
    ),
    c2CompletionValid: completionRecordValid(
      C2_COMPLETION,
      "V0.5C_2_HOME_VISUAL_DRILLDOWN_AND_RUNTIME_CLOSURE",
      REQUIRED_C2_COMMANDS,
    ),
    c2DependencyIsAncestor: isAncestor(c2.completionCommit),
    c1C2AuthorizationFilesUnchanged: fileMatchesCommit(c1.authorizationFile) && fileMatchesCommit(c2.authorizationFile),
    noForbiddenBusinessChangesAfterC2: changedAfterC2.every(
      (filePath) => !FORBIDDEN_AFTER_C2_PREFIXES.some((prefix) => filePath.startsWith(prefix)),
    ),
    finalRuntimePass: runtime.status === "PASS" && runtime.failedChecks.length === 0,
    screenshotManifestExists: !!runtime.screenshotManifestPath && fs.existsSync(runtime.screenshotManifestPath),
    homeUsesCommandCenter: homePage.includes("HomeCommandCenter"),
    oldHomeModulesAbsent: OLD_HOME_MODULES.every((name) => !homePage.includes(name)),
    majorAreasCompact:
      homeComponents.includes("HomeContextBar") &&
      homeComponents.includes("HomeMetricGrid") &&
      homeComponents.includes("HomeMainTrend") &&
      homeComponents.includes("HomeStorePerformance") &&
      homeComponents.includes("HomeDataStatus"),
    metricCardsCapped: homeComponents.includes("slice(0, 6)"),
    singleTrendChart: (homeComponents.match(/<svg/g) ?? []).length === 1,
    defaultAndSecondStoreRulesPresent:
      homeVm.includes("tmall-default-store") &&
      homeComponents.includes("店铺看板待升级") &&
      homeComponents.includes("查看导入记录"),
    targetReadonlyRulesPresent:
      homeVm.includes("periodType === \"daily\"") &&
      homeVm.includes("periodType === \"monthly\"") &&
      !homePage.includes("createTarget") &&
      !homeComponents.includes("目标编辑"),
    noInternalTermsInRenderedHome: INTERNAL_TERMS.every(
      (term) => !homePage.includes(term) && !homeComponents.includes(term),
    ),
    freezeDocExists: exists(FREEZE_DOC),
    freezeDocComplete:
      freezeDoc.includes("V0.5C") &&
      freezeDoc.includes("V2-first") &&
      freezeDoc.includes("legacy fallback") &&
      freezeDoc.includes("第二店铺安全限制") &&
      freezeDoc.includes("V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT"),
    lockV05cComplete:
      lock.stageStatuses["V0.5C"] === "complete" &&
      executionStatus["V0.5C"] === "complete",
    lockV05dPending:
      lock.stageStatuses["V0.5D"] === "pending" &&
      executionStatus["V0.5D"] === "pending",
    lockNextStage:
      lock.nextStage === "V0.5D" &&
      lock.nextTask === "V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT",
    lockFreezePointers:
      lock.v05cFreezeDocument === FREEZE_DOC &&
      lock.v05cFinalCompletionRecord === "docs/project/task-completions/V0.5C_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
    privacyAndNumberSafety:
      runtime.privacyPass === true &&
      runtime.numberSafetyPass === true,
    mobile390Pass: runtime.mobile390Pass === true,
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c-final-regression-and-freeze",
    failedChecks,
    c1CompletionCommit: c1.completionCommit,
    c2CompletionCommit: c2.completionCommit,
    runtimeStatus: runtime.status,
    screenshotManifestPath: runtime.screenshotManifestPath,
    v05cStatus: lock.stageStatuses["V0.5C"],
    v05dStatus: lock.stageStatuses["V0.5D"],
    nextStage: lock.nextStage,
    nextTask: lock.nextTask,
    changedAfterC2,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c-final-regression-and-freeze",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
