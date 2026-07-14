import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const INITIAL_HEAD = "3028405fefd003c15915b3d0f5650ef0756bd8e1";
const TASK_DIR = "docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1";
const BROWSER_VALIDATOR = "scripts/private-audit/validate-v2-home-real-data-vertical-slice-v1.ts";
const ARTIFACT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v2-home-textual-reference-gate-"));

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface BrowserManifest {
  status?: string;
  checks?: Check[];
  browser?: {
    totals?: Record<string, number | boolean>;
    metricCount?: number;
    consoleErrors?: number;
    failedBusinessRequests?: number;
    desktopLayout?: Record<string, number>;
    mobileLayout?: Record<string, number | boolean>;
    screenshots?: Array<{ name: string; horizontalOverflow: boolean }>;
  };
}

const checks: Check[] = [];
const check = (name: string, pass: boolean, details?: unknown) => checks.push({ name, pass, details });
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const run = (command: string, args: string[], env: NodeJS.ProcessEnv = process.env) => execFileSync(command, args, {
  cwd: ROOT,
  encoding: "utf8",
  env,
  maxBuffer: 64 * 1024 * 1024,
});

const parseLastJson = <T>(output: string): T => {
  const starts = [0];
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] === "\n" && output[index + 1] === "{") starts.push(index + 1);
  }
  for (const start of starts.reverse()) {
    try {
      return JSON.parse(output.slice(start).trim()) as T;
    } catch {
      // Try the previous JSON-looking line.
    }
  }
  throw new Error("validator JSON output missing");
};

const changedPaths = () => {
  const diffPaths = run("git", ["diff", "--name-only", INITIAL_HEAD, "--"])
    .trim()
    .split("\n")
    .filter(Boolean);
  const statusPaths = run("git", ["status", "--porcelain=v1", "-uall"])
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "");
  return Array.from(new Set([...diffPaths, ...statusPaths])).sort();
};

const sourceChecks = () => {
  const reference = read(`${TASK_DIR}/V2_HOME_TEXTUAL_VISUAL_REFERENCE_V1.md`);
  const analysis = read(`${TASK_DIR}/v2-home-visual-analysis-v2.md`);
  const evidence = JSON.parse(read(`${TASK_DIR}/evidence.json`)) as {
    visualRefinementCompleted?: boolean;
    visualReferenceMode?: string;
    visualAccepted: boolean;
    visualReviewStatus: string;
    humanReviewRequired: boolean;
  };
  const ssot = JSON.parse(read("docs/project/PROJECT_SSOT.json")) as {
    currentTask: { status: string };
    tracks: { saasUiV2: { dataBound?: boolean; localE2EPassed?: boolean; visualAccepted?: boolean; previewDeployed?: boolean; humanAccepted?: boolean } };
  };
  const routeMatrix = JSON.parse(read("docs/project/ROUTE_DATA_SOURCE_MATRIX.json")) as {
    routes: Array<{ route: string; isStaticShell: boolean; isDataBound: boolean }>;
  };
  const dataContract = JSON.parse(read("docs/project/V2_HOME_DATA_CONTRACT.json")) as { metrics: unknown[] };
  const dashboard = read("components/saas-v2/home/v2-home-dashboard.tsx");
  const toolbar = read("components/saas-v2/home/v2-home-toolbar.tsx");
  const metricGrid = read("components/saas-v2/home/v2-home-metric-grid.tsx");
  const chart = read("components/saas-v2/home/v2-home-chart.tsx");
  const adapter = read("lib/v2/home/v2-home-adapter.ts");
  const homeSources = `${dashboard}\n${toolbar}\n${metricGrid}\n${chart}`;
  const articleCell = metricGrid.slice(metricGrid.indexOf("<article"), metricGrid.indexOf("</article>"));

  check(
    "textualVisualReferenceSaved",
    ["TEXTUAL_VISUAL_REFERENCE_CONTRACT", "17 个 KPI", "经营趋势", "数据治理", "禁止复制"]
      .every((token) => reference.includes(token)),
  );
  check("threeVisualRoundsDocumented", ["Round 0", "Round 1", "Round 2", "Round 3"].every((token) => analysis.includes(token)));
  check("homeHasFourSourceRegions", (homeSources.match(/data-home-region=/g) ?? []).length === 4);
  check("kpiUsesOneMatrixPanel", (homeSources.match(/data-testid="v2-home-metric-grid"/g) ?? []).length === 1);
  check("all17KpisRemainInContract", dataContract.metrics.length === 17);
  check("desktopSixColumnBreakpointPresent", metricGrid.includes("min-[1320px]:grid-cols-6"));
  check("kpiCellsDoNotUseIndividualShadows", !/shadow(?:-|\b)/.test(articleCell));
  check("actualValueOwnsPrimaryTypeHierarchy", metricGrid.includes("text-[26px]") && metricGrid.includes("font-bold"));
  check("previewAndEngineeringCopyAbsent", !/Preview pending|STATIC_SHELL|DATA_BOUND|LOCAL_E2E_PASS|PENDING_IMPLEMENTATION/.test(homeSources));
  check("persistentExplanationsAreAbsent", !homeSources.includes("data-home-explanation"));
  check(
    "operatingSettingsOwnsFourActions",
    ["重点系列", "商品排除", "搜索资产", "目标中心"].every((token) => toolbar.includes(token)),
  );
  check("metricSettingsIsOverlay", metricGrid.includes("fixed inset-0") && metricGrid.includes("role=\"dialog\""));
  check("keySeriesStaysGsvOnly", dashboard.includes("重点系列") && dashboard.includes("GSV") && !/productCount|searchKeyword/.test(dashboard));
  check("trendIsFullWidthPrimaryPanel", chart.includes("data-home-region=\"trend\"") && chart.includes("w-full min-w-[640px]"));
  check("dataHealthStaysFourCountSummary", ["缺失", "安全跳过", "重复", "不可计算"].every((token) => chart.includes(token)));
  check("brandKeywordPaidShareNeverUsesGeoAlias", adapter.includes("brandKeywordPaidShare") && !adapter.includes("geoSearchShare"));
  check("mtdDlyDualAndTimeControlsRemain", ["MTD", "\"dly\"", "v2-home-chart-pair", "day", "week", "month", "custom"].every((token) => homeSources.includes(token)));
  check(
    "visualStateRemainsPendingHumanReview",
    evidence.visualRefinementCompleted === true &&
      evidence.visualReferenceMode === "TEXTUAL_REFERENCE_CONTRACT" &&
      evidence.visualAccepted === false &&
      evidence.visualReviewStatus === "PENDING_HUMAN_REVIEW" &&
      evidence.humanReviewRequired === true,
  );
  check(
    "projectSsotStateNotOverclaimed",
    ssot.currentTask.status === "LOCAL_E2E_PASS" &&
      ssot.tracks.saasUiV2.dataBound === true &&
      ssot.tracks.saasUiV2.localE2EPassed === true &&
      ssot.tracks.saasUiV2.visualAccepted === false &&
      ssot.tracks.saasUiV2.previewDeployed === false &&
      ssot.tracks.saasUiV2.humanAccepted === false,
  );
  const otherV2Routes = routeMatrix.routes.filter((route) => route.route.startsWith("/v2/") && route.route !== "/v2/home");
  check("otherV2RoutesRemainStaticShell", otherV2Routes.length === 8 && otherV2Routes.every((route) => route.isStaticShell && !route.isDataBound));

  const changed = changedPaths();
  const allowedPrefixes = [
    "components/saas-v2/",
    `${TASK_DIR}/`,
    "scripts/private-audit/",
  ];
  const allowedExact = new Set(["app/(workspace-v2)/v2/home/page.tsx"]);
  check("allChangesStayInsideTaskContract", changed.every((file) => allowedExact.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix))), changed);
  check("legacyV1Unmodified", !changed.some((file) => file.startsWith("app/(workspace)/") || /^components\/(home|series-board|store-board|product-board|upload)\//.test(file)));
  check("otherV2PagesUnmodified", !changed.some((file) => file.startsWith("app/(workspace-v2)/v2/") && file !== "app/(workspace-v2)/v2/home/page.tsx"));
  check("etlBiTargetPersistenceUnmodified", !changed.some((file) => file.startsWith("lib/etl/") || file.startsWith("lib/bi/") || file.startsWith("lib/persistence/") || file === "lib/state/system-state.ts"));
  check("packageAndDeploymentFilesUnmodified", !changed.some((file) => ["package.json", "package-lock.json", "vercel.json"].includes(file) || file.startsWith(".vercel/")));
};

const browserChecks = (): { manifestPath: string; manifest: BrowserManifest } => {
  const suppliedManifest = process.env.V2_HOME_FINAL_MANIFEST;
  let manifestPath = suppliedManifest ?? "";
  if (!manifestPath) {
    const output = run("npx", ["tsx", BROWSER_VALIDATOR], {
      ...process.env,
      V2_HOME_VISUAL_ROUND: "visual-v2-round3-final",
    });
    const result = parseLastJson<{ status: string; manifestPath: string }>(output);
    check("realDataBrowserValidatorPass", result.status === "PASS", { status: result.status });
    manifestPath = result.manifestPath;
  }
  check("browserManifestExists", fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BrowserManifest;
  const browser = manifest.browser;
  const browserChecksByName = new Map((manifest.checks ?? []).map((item) => [item.name, item.pass]));
  const requiredInteractionChecks = [
    "homeHasExactlyFourPrimaryRegions",
    "desktopToolbarWithin104Px",
    "desktopKpiMatrixUsesSixColumnsAndThreeRows",
    "kpiCellsHaveStableHeight",
    "trendPanelUsesReferenceHeight",
    "metricVisibilityAndOrderingInteractive",
    "operatingSettingsContainsFourRequiredActions",
    "allowedDualMetricPairWorks",
    "singleMetricModeWorks",
    "dayWeekMonthCustomAndMaxYearWork",
    "comparisonDoesNotFabricate",
    "refreshRestoresDatasetContextTargetsAndSeries",
    "reopenRestoresActiveDataset",
    "mobile390NoHorizontalOverflow",
    "mobileKpiRowsDoNotOverlap",
    "mobileMetricDialogStaysInViewport",
    "mobileOperatingMenuStaysInViewport",
    "duplicateImportDoesNotDouble",
    "browserConsoleBusinessErrorsZero",
    "failedBusinessRequestsZero",
  ];
  check("browserManifestReportsPass", manifest.status === "PASS");
  check("allBrowserInteractionGatesPassed", requiredInteractionChecks.every((name) => browserChecksByName.get(name) === true), requiredInteractionChecks.filter((name) => browserChecksByName.get(name) !== true));
  check("browserCoreValuesUnchanged", browser?.totals?.gmv === 125596 && Math.abs(Number(browser?.totals?.gsv) - 85455.96) < 0.01 && browser?.totals?.visitors === 143076 && browser?.totals?.paidBuyers === 128);
  check("targetOverlayDoesNotEnterRuntime", browser?.totals?.hasTargetsField === false);
  check("browserHas17Metrics", browser?.metricCount === 17);
  check("browserAndNetworkErrorsZero", browser?.consoleErrors === 0 && browser?.failedBusinessRequests === 0);
  check("desktopLayoutMatchesTextualContract", browser?.desktopLayout?.regionCount === 4 && browser.desktopLayout.toolbarHeight <= 108 && browser.desktopLayout.kpiColumnCount === 6 && browser.desktopLayout.kpiHeightMax - browser.desktopLayout.kpiHeightMin <= 8);
  check("mobileLayoutMatchesTextualContract", browser?.mobileLayout?.kpiColumnCount === 2 && browser.mobileLayout.overlappingKpiCellCount === 0 && browser.mobileLayout.metricDialogInViewport === true && browser.mobileLayout.operatingMenuInViewport === true);
  check("browserScreenshotsHaveNoPageOverflow", (browser?.screenshots ?? []).every((shot) => !shot.horizontalOverflow));
  return { manifestPath, manifest };
};

const commandGates = () => {
  const sensitive = parseLastJson<{
    status: string;
    summary: { hardBlockCount: number; needsReviewCount: number };
    realSecretFindings: unknown[];
    realSampleFindings: unknown[];
    forbiddenPathFindings: unknown[];
  }>(run("npx", ["tsx", "scripts/private-audit/validate-git-baseline-sensitive-scan-policy-v2.ts"]));
  check(
    "sensitiveScanV2Pass",
    sensitive.status === "PASS" &&
      sensitive.summary.hardBlockCount === 0 &&
      sensitive.summary.needsReviewCount === 0 &&
      sensitive.realSecretFindings.length === 0 &&
      sensitive.realSampleFindings.length === 0 &&
      sensitive.forbiddenPathFindings.length === 0,
    sensitive.summary,
  );
  run("npm", ["run", "lint"]);
  check("lintPass", true);
  run("npm", ["run", "build"]);
  check("buildPass", true);
  check("nextEnvGeneratedNoiseAbsent", run("git", ["status", "--porcelain", "--", "next-env.d.ts"]).trim().length === 0);
  check("tsBuildInfoNotTracked", run("git", ["status", "--porcelain", "--", "tsconfig.tsbuildinfo"]).trim().length === 0);
};

const main = () => {
  sourceChecks();
  const browser = browserChecks();
  commandGates();
  const failed = checks.filter((item) => !item.pass);
  const result = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    task: "V2_HOME_TEXTUAL_REFERENCE_VISUAL_REBASE_AND_MINIMALISM_V2",
    browserManifestPath: browser.manifestPath,
    checks,
  };
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, manifestPath }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    task: "V2_HOME_TEXTUAL_REFERENCE_VISUAL_REBASE_AND_MINIMALISM_V2",
    safeError: error instanceof Error ? error.message : "unknown_error",
    checks,
  }, null, 2));
  process.exitCode = 1;
}
