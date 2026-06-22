import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const C1_COMPLETION = "docs/project/task-completions/V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT.json";

const ALLOWED_DIFF_PREFIXES = [
  "app/(workspace)/home/page.tsx",
  "components/home/v05/",
  "lib/v05/home-command-center/",
  "scripts/private-audit/validate-v05c2-home-runtime-and-drilldown.ts",
  "scripts/private-audit/validate-v05c2-home-visual-usability.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5C_2_HOME_VISUAL_DRILLDOWN_AND_RUNTIME_CLOSURE.json",
  "docs/project/task-completions/V0.5C_2_HOME_VISUAL_DRILLDOWN_AND_RUNTIME_CLOSURE.json",
] as const;

const FORBIDDEN_UI_TERMS = [
  "V2 staging",
  "active pointer",
  "readback",
  "legacy adapter",
] as const;

const SENSITIVE_FIELD_NAMES = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
] as const;

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const newestScreenshotManifest = (): string | null => {
  const candidates = fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith("airburg-v05c2-home-screenshots-"))
    .map((name) => path.join(os.tmpdir(), name, "manifest.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return candidates[0] ?? null;
};

const screenshotEvidence = (): { manifestPath: string | null; fileCount: number; allFilesExist: boolean } => {
  const manifestPath = newestScreenshotManifest();
  if (!manifestPath) return { manifestPath: null, fileCount: 0, allFilesExist: false };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, string>;
  const imagePaths = Object.entries(manifest)
    .filter(([key]) => key !== "manifestPath")
    .map(([, value]) => value);
  return {
    manifestPath,
    fileCount: imagePaths.length,
    allFilesExist: imagePaths.every((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).size > 1024),
  };
};

const diffWithinAllowedPaths = (): boolean => {
  const changed = git(["diff", "--name-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const staged = git(["diff", "--cached", "--name-only"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set([...changed, ...staged])].every((filePath) =>
    ALLOWED_DIFF_PREFIXES.some((allowed) =>
      allowed.endsWith("/")
        ? filePath.startsWith(allowed)
        : filePath === allowed,
    ),
  );
};

const c1CompletionValid = (): boolean => {
  const completion = JSON.parse(readText(C1_COMPLETION)) as {
    taskId?: string;
    status?: string;
    authorizationCommit?: string;
    completionCommit?: string;
  };
  return (
    completion.taskId === "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT" &&
    completion.status === "complete" &&
    typeof completion.authorizationCommit === "string" &&
    typeof completion.completionCommit === "string"
  );
};

const main = () => {
  const page = readText("app/(workspace)/home/page.tsx");
  const commandCenter = readText("components/home/v05/home-command-center.tsx");
  const contextBar = readText("components/home/v05/home-context-bar.tsx");
  const metricGrid = readText("components/home/v05/home-metric-grid.tsx");
  const mainTrend = readText("components/home/v05/home-main-trend.tsx");
  const storePerformance = readText("components/home/v05/home-store-performance.tsx");
  const dataStatus = readText("components/home/v05/home-data-status.tsx");
  const storeRanking = readText("lib/v05/home-command-center/store-ranking.ts");
  const contracts = readText("lib/v05/home-command-center/contracts.ts");
  const runtimeScript = readText("scripts/private-audit/validate-v05c2-home-runtime-and-drilldown.ts");
  const componentSource = [
    commandCenter,
    contextBar,
    metricGrid,
    mainTrend,
    storePerformance,
    dataStatus,
  ].join("\n");
  const screenshot = screenshotEvidence();
  const oldHomeModules = [
    "HomeWorkbenchOverview",
    "HomeSectionNav",
    "TmallGlobalDataStatusGuide",
    "TmallMetricGrid",
    "TmallProductRanking",
    "TmallRiskList",
    "TmallQualitySummary",
    "TmallReconciliation",
  ];

  const checks = {
    c1CompletionValid: c1CompletionValid(),
    runtimeScriptExists: exists("scripts/private-audit/validate-v05c2-home-runtime-and-drilldown.ts"),
    pageUsesCommandCenter: page.includes("HomeCommandCenter"),
    oldLongHomeModulesNotRendered: oldHomeModules.every((name) => !page.includes(name)),
    commandCenterHasFourPrimaryAreas:
      commandCenter.includes("HomeContextBar") &&
      commandCenter.includes("HomeMetricGrid") &&
      commandCenter.includes("HomeMainTrend") &&
      commandCenter.includes("HomeStorePerformance"),
    lightweightDataStatusOnly: commandCenter.includes("HomeDataStatus") && !page.includes("TmallQualitySummary"),
    coreMetricCardsCappedAtSix: metricGrid.includes("slice(0, 6)"),
    singleMainTrendChart: (mainTrend.match(/<svg/g) ?? []).length === 1,
    trendTabsAccessible:
      mainTrend.includes('role="tablist"') &&
      mainTrend.includes('role="tab"') &&
      mainTrend.includes("aria-selected") &&
      mainTrend.includes('role="img"') &&
      mainTrend.includes("sr-only"),
    contextControlsAccessible:
      contextBar.includes("aria-pressed") &&
      contextBar.includes('id="home-platform-select"') &&
      contextBar.includes('id="home-store-select"') &&
      contextBar.includes('id="home-business-date-select"') &&
      contextBar.includes('type="button"') &&
      contextBar.includes('type="date"'),
    primaryActionsOnly:
      contextBar.includes('href="/targets"') &&
      contextBar.includes('href="/upload"') &&
      !commandCenter.includes("导出") &&
      !commandCenter.includes("AI"),
    defaultStoreCanOpenStoreBoard:
      storeRanking.includes('DEFAULT_TMAIL_STORE_ID = "tmall-default-store"') &&
      storeRanking.includes("storeBoardHref(store)") &&
      storePerformance.includes("查看店铺") &&
      storePerformance.includes("store.storeBoardHref"),
    nonDefaultStoreCannotOpenLegacyStoreBoard:
      storePerformance.includes("店铺看板待升级") &&
      storePerformance.includes("disabled") &&
      storePerformance.includes("aria-disabled") &&
      storePerformance.includes("查看导入记录") &&
      contracts.includes("canOpenStoreBoard") &&
      contracts.includes("historyHref"),
    historyHrefCarriesStoreContext:
      storeRanking.includes("/upload/history?") &&
      storeRanking.includes("platform") &&
      storeRanking.includes("storeId") &&
      storeRanking.includes("batchId"),
    noInternalTermsInRenderedComponents:
      FORBIDDEN_UI_TERMS.every((term) => !componentSource.includes(term) && !page.includes(term)),
    noSensitiveFieldNamesInRenderedComponents:
      SENSITIVE_FIELD_NAMES.every((fieldName) => !componentSource.includes(fieldName) && !page.includes(fieldName)),
    screenshotsExist: screenshot.fileCount >= 10 && screenshot.allFilesExist,
    runtimeUsesIsolatedDatabase:
      runtimeScript.includes('DATABASE_NAME = "airburg-v05-c2-audit"') &&
      runtimeScript.includes('PRODUCTION_DATABASE_NAME = "airburg-v05"'),
    runtimeUsesRealFileInput:
      runtimeScript.includes("DOM.setFileInputFiles") &&
      runtimeScript.includes("#v05-batch-file-input"),
    runtimeChecksDrilldown:
      runtimeScript.includes("defaultStoreDrilldownWorks") &&
      runtimeScript.includes("secondStoreBoardDisabled") &&
      runtimeScript.includes("secondStoreHistoryContextWorks"),
    runtimeChecks390AndScreenshots:
      runtimeScript.includes("mobile390NoOverflow") &&
      runtimeScript.includes("Page.captureScreenshot"),
    packageFilesUnmodified:
      git(["diff", "--name-only", "--", "package.json", "package-lock.json"]).trim() === "" &&
      git(["diff", "--cached", "--name-only", "--", "package.json", "package-lock.json"]).trim() === "",
    diffWithinAllowedPaths: diffWithinAllowedPaths(),
  };
  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c2-home-visual-usability",
    failedChecks,
    screenshotManifestPath: screenshot.manifestPath,
    screenshotFileCount: screenshot.fileCount,
    changedFiles: git(["diff", "--name-only"]).split("\n").filter(Boolean),
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c2-home-visual-usability",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
