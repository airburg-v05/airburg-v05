import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const sourceHas = (source: string, snippets: string[]): boolean =>
  snippets.every((snippet) => source.includes(snippet));

const run = () => {
  const chart = read("components/visual-system/v1/bi-chart.tsx");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("mergedTooltipLayerExists", sourceHas(chart, ["bi-chart-merged-tooltip-layer", "mergedTooltipFor", "图表提示按日期合并展示"]));
  addCheck("semanticLayerMarkerExists", sourceHas(chart, ["data-chart-semantic-layer=\"unified\"", "bi-chart-semantic-layer", "MTD / DLY 使用同一轴线"]));
  addCheck("pointLevelTooltipRemoved", !chart.includes("${line.name} ${point.date}:"));
  addCheck("barLevelTooltipRemoved", !chart.includes("<title>{`${line.name} ${point.date}:"));
  addCheck("tooltipDoesNotDuplicateFooterValues", !chart.includes("有效点位"));
  addCheck("singlePointLabelRemoved", !chart.includes("bi-chart-single-point-label") && !chart.includes("单日数据"));
  addCheck("unifiedAxisLogicPresent", sourceHas(chart, ["const xFor = (index: number)", "const yFor = (value: number)", "const yTicks = Array.from"]));
  addCheck("emptyStateUnified", sourceHas(chart, ["BIChartEmptyState", "bi-chart-clean-empty-canvas", "空态不绘制 0 线"]));
  addCheck("chartStatusUnified", sourceHas(chart, ["data-testid=\"bi-chart-status\"", "缺失值不按 0 绘制", "hasMissingPoints"]));
  addCheck("chartComponentHasNoDataSourceImports", !/@\/lib\/etl|@\/lib\/bi\/bi\.data-source|@\/lib\/persistence/.test(chart));
  addCheck("seriesDlyRedundantTitleRemoved", !series.includes("DLY参考图"));
  addCheck("productDlyRedundantTitleRemoved", !product.includes("DLY参考图"));
  addCheck("homeStillUsesSharedChart", sourceHas(home, ["<BIChartCard", "mode={chartMode}", "variant={chartMode === \"mtd\" ? \"line\" : \"bar\"}"]));
  addCheck("seriesStillUsesSharedChart", sourceHas(series, ["<BIChartCard", "mode={chartMode}", "variant={chartMode === \"mtd\" ? \"line\" : \"bar\"}"]));
  addCheck("productStillUsesSharedChart", sourceHas(product, ["<BIChartCard", "mode={chartMode}", "variant={chartMode === \"mtd\" ? \"line\" : \"bar\"}"]));
  addCheck("noRuntimeDataMutationInChartLayer", !/runETLRuntime|appendRuntime|mergeRuntime|dedup|saveRuntimeDatasetSnapshot|saveTargetDraft/.test(chart));
  addCheck("noNaNInfinityUndefinedLiteralInChartLayer", !/NaN|Infinity|undefined/.test(chart.replace(/Number\.isNaN/g, "safe-nan-guard").replace(/typeof window === "undefined"/g, "browser-guard")));
};

let status: Status = "PASS";
try {
  run();
  if (checks.some((check) => !check.pass)) status = "FAIL";
} catch (error) {
  status = "FAIL";
  addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
}

console.log(JSON.stringify({
  status,
  taskId: "CHART_SYSTEM_SIMPLIFICATION_V1",
  chartRules: {
    tooltip: "merged_by_date",
    axis: "single_shared_axis_logic",
    labels: "redundant_labels_removed",
    emptyState: "unified_no_fake_zero_line",
    dataSource: "unchanged_display_layer_only",
  },
  checks,
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);
