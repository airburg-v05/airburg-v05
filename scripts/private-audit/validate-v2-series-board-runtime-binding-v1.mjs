import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const page = read("app/(workspace-v2)/v2/series-board/page.tsx");
const dashboard = read("components/saas-v2/series/v2-series-board-dashboard.tsx");
const table = read("components/saas-v2/tables/data-table-v2.tsx");
const chart = read("components/saas-v2/charts/chart-panel-v2.tsx");
const currentTask = JSON.parse(read("docs/project/current-task.json"));
const ssot = JSON.parse(read("docs/project/PROJECT_SSOT.json"));

const checks = [
  {
    name: "pageUsesDedicatedSeriesDashboardBoundary",
    pass: page.includes("V2SeriesBoardDashboard") && !page.includes("components/saas-v2/data"),
  },
  {
    name: "dashboardReadsSeriesRuntimeBoundary",
    pass: [
      "loadSeriesBoardContext",
      "buildV2SeriesBoardViewModel",
      "buildLegacySeriesBoardViewModel",
      "buildEmptySeriesBoardViewModel",
    ].every((token) => dashboard.includes(token)),
  },
  {
    name: "dashboardNoStaticMockRows",
    pass: ![
      "seriesRows,",
      "seriesContributionRows",
      "seriesSearchRows",
      "boardMetrics,",
    ].some((token) => dashboard.includes(token) || page.includes(token)),
  },
  {
    name: "dashboardDoesNotImportSaasV2StaticDataRows",
    pass: !dashboard.includes("from \"@/components/saas-v2/data\"") || dashboard.includes("import type { MetricV2 }"),
  },
  {
    name: "seriesDashboardKeepsSearchGapExplicit",
    pass: dashboard.includes("搜索词 → 商品 → 系列") && dashboard.includes("搜索资产"),
  },
  {
    name: "seriesDashboardKeepsOwnerReviewOpen",
    pass: ssot.tracks.saasUiV2.visualAccepted === false && ssot.tracks.saasUiV2.humanAccepted === false,
  },
  {
    name: "ssotClassifiesSeriesAsRuntimeReaderWithoutOverclaimingWriterOrConfigRoutes",
    pass: ssot.tracks.saasUiV2.dataBoundRoutes.includes("/v2/series-board") &&
      !ssot.tracks.saasUiV2.dataBoundRoutes.includes("/v2/upload") &&
      !ssot.tracks.saasUiV2.dataBoundRoutes.includes("/v2/search-assets") &&
      !ssot.tracks.saasUiV2.dataBoundRoutes.includes("/v2/exclusion-rules"),
  },
  {
    name: "currentTaskPointerAllowsFullQualityClosureOrUxRefinementTask",
    pass: [
      "SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1",
      "SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1",
      "SAAS_V2_UNIFIED_BRAND_RUNTIME_AND_OWNER_FEEDBACK_V1",
    ].includes(currentTask.taskId) &&
      ["IN_PROGRESS", "PENDING_POST_DEPLOY_OWNER_REVIEW"].includes(currentTask.status) &&
      ssot.currentTask.taskId === currentTask.taskId,
  },
  {
    name: "tableSupportsInteractiveCells",
    pass: table.includes("rows: ReactNode[][]"),
  },
  {
    name: "chartPanelSupportsInjectedRuntimeContent",
    pass: chart.includes("content?: ReactNode") && chart.includes("{content ?? ("),
  },
];

const failed = checks.filter((check) => !check.pass);

console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-series-board-runtime-binding-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
