import fs from "node:fs";
import path from "node:path";
import {
  V2_HOME_CHART_PAIRS,
} from "../../lib/v2/home/v2-home-adapter";
import {
  V2_HOME_DISPLAY_METRIC_KEYS,
} from "../../types/v2/home";

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(root, relativePath));
const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

const adapter = read("lib/v2/home/v2-home-adapter.ts");
const dashboard = read("components/saas-v2/home/v2-home-dashboard.tsx");
const metricGrid = read("components/saas-v2/home/v2-home-metric-grid.tsx");
const chart = read("components/saas-v2/home/v2-home-chart.tsx");
const legacyChart = read("components/saas-v2/charts/chart-panel-v2.tsx");
const toolbar = read("components/saas-v2/home/v2-home-toolbar.tsx");
const targetCenter = read("components/saas-v2/targets/v2-brand-target-center.tsx");
const seriesDashboard = read("components/saas-v2/series/v2-series-board-dashboard.tsx");
const seriesLens = read("components/saas-v2/series/v2-series-analysis-lens.tsx");
const routeMatrix = read("docs/project/ROUTE_DATA_SOURCE_MATRIX.json");
const task = read("docs/project/tasks/SAAS_V2_INTERACTION_AUTOSAVE_AND_SERIES_LAYOUT_REFINEMENT_V1/TASK.md");
const contextPack = read("docs/project/tasks/SAAS_V2_INTERACTION_AUTOSAVE_AND_SERIES_LAYOUT_REFINEMENT_V1/CONTEXT_PACK.md");
const currentTask = JSON.parse(read("docs/project/current-task.json")) as {
  taskId: string;
  deploymentAuthorized: boolean;
  visualAccepted: boolean;
  humanAccepted: boolean;
};

const displayKeys = [...V2_HOME_DISPLAY_METRIC_KEYS];
const primaryKeys = V2_HOME_CHART_PAIRS.map((pair) => pair.leftMetricKey);
const missingPrimaryKeys = displayKeys.filter((metricKey) => !primaryKeys.includes(metricKey));
check(
  "allVisibleMetricsHaveOnePrimaryTrendEntry",
  displayKeys.length === 16 &&
    V2_HOME_CHART_PAIRS.length === 16 &&
    new Set(primaryKeys).size === 16 &&
    missingPrimaryKeys.length === 0,
  { displayKeys, primaryKeys, missingPrimaryKeys },
);
check(
  "metricCardsDriveTheSharedTrendSelection",
  metricGrid.includes("onMetricSelect?: (metricKey: V2HomeMetricKey) => void") &&
    metricGrid.includes("onMetricSelect(metric.metricKey)") &&
    dashboard.includes("selectMetricForChart") &&
    dashboard.includes("updateOptions({ chartPairId: pair.id }, true)") &&
    adapter.includes("V2_HOME_CHART_PAIRS"),
);
check(
  "dailyModeUsesDayWithoutChangingInternalDlyContract",
  chart.includes('const chartModeLabel = (mode: V2HomeChartMode): "MTD" | "DAY"') &&
    chart.includes('mode === "mtd" ? "MTD" : "DAY"') &&
    chart.includes('(["mtd", "dly"] as const)') &&
    !chart.includes("DLY") &&
    legacyChart.includes(">DAY<") &&
    !legacyChart.includes("DLY"),
);

const customTriggerMarker = toolbar.indexOf('data-testid="v2-custom-date-trigger"');
const customTriggerStart = toolbar.lastIndexOf("<button", customTriggerMarker);
const customTriggerEnd = toolbar.indexOf("</button>", customTriggerStart);
const customTriggerSource = toolbar.slice(customTriggerStart, customTriggerEnd);
check(
  "customDateIsASeparateNonWhiteControl",
  toolbar.includes('data-testid="v2-time-presets"') &&
    customTriggerMarker > toolbar.indexOf('data-testid="v2-time-presets"') &&
    customTriggerSource.includes("自定义日期") &&
    !customTriggerSource.includes("bg-white") &&
    !customTriggerSource.includes("shadow"),
  { customTriggerSource },
);
check(
  "targetsAutosaveAndClearedMetricsDeletePrecisely",
  targetCenter.includes("type AutoSaveState = \"idle\" | \"dirty\" | \"saving\" | \"saved\" | \"error\"") &&
    targetCenter.includes("window.setTimeout") &&
    targetCenter.includes("}, 650)") &&
    targetCenter.includes("deleteTargetDraft(record.targetId") &&
    targetCenter.includes('data-testid="v2-target-auto-save-status"') &&
    targetCenter.includes("editVersion.current === expectedVersion"),
);
check(
  "targetCenterHidesRedundantManualAndDerivedSections",
  !targetCenter.includes("目标设置独立于数据上传") &&
    !targetCenter.includes("自动推导目标") &&
    !targetCenter.includes(">保存目标<") &&
    targetCenter.includes("formatMonthLabel(month)") &&
    targetCenter.includes("修改后自动保存"),
);
check(
  "seriesBreakdownIsRemovedButBothLensesRemain",
  !exists("components/saas-v2/series/v2-series-store-breakdown.tsx") &&
    !seriesDashboard.includes("V2SeriesStoreBreakdown") &&
    seriesLens.includes("品牌汇总") &&
    seriesLens.includes("单店拆解") &&
    seriesLens.includes("跨平台 / 全店铺") &&
    seriesLens.includes("单平台 / 单店铺") &&
    !routeMatrix.includes("v2-series-store-breakdown.tsx"),
);
check(
  "taskRecordsDeploymentAuthorizationWithoutAutoAcceptance",
  currentTask.taskId === "SAAS_V2_INTERACTION_AUTOSAVE_AND_SERIES_LAYOUT_REFINEMENT_V1" &&
    currentTask.deploymentAuthorized === true &&
    currentTask.visualAccepted === false &&
    currentTask.humanAccepted === false &&
    task.includes("Merge or automatic visual/business acceptance") &&
    contextPack.includes("same-browser persistence only") &&
    contextPack.includes("A3 owner-authorized") &&
    contextPack.includes("Merge remains forbidden"),
  currentTask,
);

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  validator: "validate-v2-interaction-autosave-and-series-layout-refinement-v1",
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
