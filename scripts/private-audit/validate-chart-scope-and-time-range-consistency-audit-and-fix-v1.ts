import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadHomeBIDataSource, type BIHomeDataSource, type BIHomeSeriesDefinition } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIDataPoint, UIState } from "../../lib/bi/bi.types";
import {
  clearRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import { parseBusinessDate } from "../../lib/etl/date";
import { dateAxisFromTimeRange } from "../../components/visual-system/v1/chart-utils";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const REQUIRED_PROBLEM_IDS = ["PVM2-001", "PVM2-002", "PVM2-003", "PVM2-004", "PVM2-007", "PVM2-008", "PVM2-009", "PVM2-013"] as const;
const EXPECTED_DATES = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"] as const;
const REQUIRED_READ_FILES = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/bi-semantic-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
] as const;

const FORBIDDEN_CHANGED_PATHS = [
  /^lib\/etl\//,
  /^lib\/bi\/brand-model-semantic\.ts$/,
  /^lib\/bi\/bi\.home-mapper\.ts$/,
  /^lib\/persistence\//,
  /^lib\/storage\//,
  /^lib\/tmall\//,
  /^lib\/v05\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vercel\.json$/,
  /^\.vercel\//,
  /^private-samples\//,
  /\.(xls|xlsx|csv|pem|key)$/i,
] as const;

const checks: Check[] = [];
const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const closeEnough = (actual: number | null | undefined, expected: number, tolerance = 0.01): boolean =>
  typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;

const changedFiles = (): string[] => {
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"], { cwd: ROOT, encoding: "utf8" }).trim();
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).trim();
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const forbiddenChangedFiles = (): string[] =>
  changedFiles().filter((file) => FORBIDDEN_CHANGED_PATHS.some((pattern) => pattern.test(file)));

const findFiles = (directory: string): string[] => {
  const found: string[] = [];
  const walk = (current: string) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        return;
      }
      if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(next);
    });
  };
  if (fs.existsSync(directory)) walk(directory);
  return found.sort();
};

const safeFileForPath = (absolutePath: string, index: number): File => {
  const extension = path.extname(absolutePath).toLowerCase();
  const bytes = new Uint8Array(fs.readFileSync(absolutePath));
  const safeDate = parseBusinessDate(absolutePath) ?? `unknown_${String(index + 1).padStart(2, "0")}`;
  return new NodeFile([bytes], `audit_chart_scope_${safeDate}_${String(index + 1).padStart(2, "0")}${extension}`) as unknown as File;
};

const descriptorsFor = (files: File[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const baseState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  selectedPlatform: "tmall",
  selectedStores: ["tmall-default-store"],
  timeRange: {
    mode: "custom",
    startDate: "2026-06-26",
    endDate: "2026-06-30",
  },
  brandModelFilter: {
    brandWords: ["空气堡"],
    modelWords: [],
    centerWordGroups: [{ id: "p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] }],
  },
});

const kpiRawValue = (source: BIHomeDataSource, state: UIState, title: string): number | null =>
  buildHomeBIViewModel(source, state).kpiCards.find((item) => item.title === title && !item.coreSeriesId)?.rawValue ?? null;

const dateSetFor = <T extends { date: string | null }>(rows: T[]): string[] =>
  Array.from(new Set(rows.map((row) => row.date).filter((date): date is string => Boolean(date)))).sort();

const metricSum = (points: BIDataPoint[], key: string): number =>
  points.reduce((total, point) => {
    const value = point.metrics[key];
    return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);

const datasetTotals = (dataset: BIDataSet) => {
  const inRange = <T extends { date: string }>(rows: T[]) =>
    rows.filter((row) => row.date >= "2026-06-26" && row.date <= "2026-06-30");
  const productMetrics = inRange(dataset.productMetrics);
  const planMetrics = inRange(dataset.planMetrics);
  const afterSalesMetrics = inRange(dataset.afterSalesMetrics);
  const gsv = productMetrics.reduce((total, row) => total + (row.gsv ?? 0), 0);
  const refund = afterSalesMetrics.reduce((total, row) => total + (row.refundAmount ?? 0), 0);
  const adSpend = planMetrics.reduce((total, row) => total + (row.spend ?? 0), 0);
  const directTransactionAmount = planMetrics.reduce((total, row) => total + (row.directTransactionAmount ?? 0), 0);
  const totalTransactionAmount = planMetrics.reduce((total, row) => total + (row.totalTransactionAmount ?? 0), 0);
  return {
    gmv: round(productMetrics.reduce((total, row) => total + (row.gmv ?? 0), 0), 2),
    gsv: round(gsv, 2),
    visitors: productMetrics.reduce((total, row) => total + (row.visitors ?? 0), 0),
    paidBuyers: productMetrics.reduce((total, row) => total + (row.buyers ?? 0), 0),
    adSpend: round(adSpend, 2),
    clicks: planMetrics.reduce((total, row) => total + (row.clicks ?? 0), 0),
    refund: round(refund, 2),
    refundFeeRatio: gsv - refund > 0 ? adSpend / (gsv - refund) : null,
    directTransactionShare: totalTransactionAmount > 0 ? directTransactionAmount / totalTransactionAmount : null,
  };
};

const normalizeDebugSeriesDefinitions = (source: BIHomeDataSource): BIHomeSeriesDefinition[] => {
  const productTotals = new Map<string, { gmv: number; point: BIDataPoint }>();
  source.points.forEach((point) => {
    if (!point.productId || point.platformCode !== "tmall" || point.storeId !== "tmall-default-store") return;
    const current = productTotals.get(point.productId) ?? { gmv: 0, point };
    current.gmv += point.metrics.gmv ?? 0;
    productTotals.set(point.productId, current);
  });
  const topProductIds = Array.from(productTotals.entries())
    .sort((left, right) => right[1].gmv - left[1].gmv)
    .slice(0, 2)
    .map(([productId]) => productId);
  return [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      seriesId: "audit-series-a",
      seriesName: "审计系列A",
      productIds: topProductIds,
    },
  ];
};

const buildSeriesPoints = (points: BIDataPoint[], definitions: BIHomeSeriesDefinition[]): BIDataPoint[] =>
  points.flatMap((point) =>
    definitions
      .filter(
        (series) =>
          point.platformCode === series.platformCode &&
          point.storeId === series.storeId &&
          Boolean(point.productId) &&
          series.productIds.includes(point.productId ?? ""),
      )
      .map((series) => ({ ...point, seriesId: series.seriesId, seriesName: series.seriesName })),
  );

const mergeWithAuditSeries = (source: BIHomeDataSource): BIHomeDataSource => {
  const definitions = normalizeDebugSeriesDefinitions(source);
  return {
    ...source,
    seriesDefinitions: definitions,
    seriesPoints: buildSeriesPoints(source.points, definitions),
  };
};

const scopeBySeries = (source: BIHomeDataSource, seriesId: string): BIHomeDataSource => {
  const series = source.seriesDefinitions.find((definition) => definition.seriesId === seriesId);
  if (!series) return source;
  const productIds = new Set(series.productIds);
  return {
    ...source,
    points: source.points
      .filter((point) => point.platformCode === series.platformCode && point.storeId === series.storeId && Boolean(point.productId) && productIds.has(point.productId ?? ""))
      .map((point) => ({ ...point, seriesId: series.seriesId, seriesName: series.seriesName })),
    searchProductKeywords: source.searchProductKeywords.filter(
      (keyword) => keyword.platformCode === series.platformCode && keyword.storeId === series.storeId && productIds.has(keyword.productId),
    ),
  };
};

const chartAxesWithinRange = (axis: string[]): boolean =>
  axis.length > 0 && axis.every((date) => EXPECTED_DATES.includes(date as (typeof EXPECTED_DATES)[number]));

const datesStayWithinCurrentRange = (dates: string[]): boolean =>
  dates.length > 0 && dates.every((date) => EXPECTED_DATES.includes(date as (typeof EXPECTED_DATES)[number]));

const chartValuesAreFiniteOrNull = (source: BIHomeDataSource, state: UIState): boolean => {
  const viewModel = buildHomeBIViewModel(source, state);
  return [viewModel.mtdChartModel, viewModel.dlyChartModel].every((chart) =>
    chart.lines.every((line) =>
      line.points.every((point) => point.value === null || (typeof point.value === "number" && Number.isFinite(point.value))),
    ),
  );
};

const main = async () => {
  REQUIRED_READ_FILES.forEach((file) => addCheck(`read:${file}`, exists(file)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  addCheck("read:agents", agents.includes("Tmall V1 Internal Beta Agent Protocol") || agents.includes("Codex Personal Instructions"));
  addCheck("read:project-current-state", projectState.includes("天猫 V1 内测排查版"));
  addCheck("read:problem-matrix", REQUIRED_PROBLEM_IDS.every((id) => problemMatrix.includes(id)), REQUIRED_PROBLEM_IDS);
  addCheck("read:task-protocol", protocol.includes("UI 只做展示和交互"));
  addCheck("read:ui-baseline", uiBaseline.includes("全量 KPI 卡片网格基线"));

  const chartUtils = read("components/visual-system/v1/chart-utils.ts");
  const biChart = read("components/visual-system/v1/bi-chart.tsx");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("chartUtilsHasTimeRangeAxisFallback", chartUtils.includes("dateAxisFromTimeRange") && chartUtils.includes("dateAxisWithTimeRangeFallback"));
  addCheck("biChartKeepsEmptyStateSafe", biChart.includes("BIChartEmptyState") && biChart.includes("缺失值不按 0 绘制") && biChart.includes("finiteChartValue"));
  addCheck("homeChartUsesScopedDataSource", home.includes("scopedDataSource") && home.includes("viewModel.mtdChartModel") && home.includes("viewModel.dlyChartModel"));
  addCheck("homeSeriesFilterFeedsScopedChart", home.includes("scopeHomeDataSourceBySeries") && home.includes("selectedSeriesIdFromMetric"));
  addCheck("seriesChartUsesScopedPoints", series.includes("scopedSeriesPoints(dataSource, selectedRefs, biState)") && series.includes("buildChartLines(dataSource, seriesPoints"));
  addCheck("seriesChartUsesTimeRangeFallback", series.includes("dateAxisWithTimeRangeFallback(dates, state.timeRange.startDate, state.timeRange.endDate") && series.includes("dateAxisWithTimeRangeFallback(xAxis, state.timeRange.startDate, state.timeRange.endDate"));
  addCheck("storeChartUsesScopedPoints", store.includes("scopedStorePoints(dataSource, biState)") && store.includes("buildChartLines(selectedPoints, storeOptions, biState.selectedStores, biState"));
  addCheck("storeChartUsesTimeRangeFallback", store.includes("dateAxisWithTimeRangeFallback(dates, state.timeRange.startDate, state.timeRange.endDate"));
  addCheck("productChartUsesScopedPoints", product.includes("scopedProductPoints(dataSource, biState, selectedProductKey)") && product.includes("buildChartLines(dataSource, selectedPoints"));
  addCheck("productChartUsesTimeRangeFallback", product.includes("dateAxisWithTimeRangeFallback(dates, state.timeRange.startDate, state.timeRange.endDate") && product.includes("dateAxisWithTimeRangeFallback(xAxis, state.timeRange.startDate, state.timeRange.endDate"));
  addCheck("legacySelectedDateFallbackRemovedFromBoardCharts", ![series, store, product].some((content) => content.includes("dates.length > 0 ? dates : [source.selectedDate")));
  addCheck("noEngineeringLabelsOnMainPages", ![home, series, store, product].some((content) => /Primary|Secondary|Hidden|L1|L2|L3|L4/.test(content)));

  const expectedAxis = dateAxisFromTimeRange("2026-06-26", "2026-06-30");
  addCheck("dateAxisFromTimeRangeMatches626630", JSON.stringify(expectedAxis) === JSON.stringify(EXPECTED_DATES), expectedAxis);

  const filePaths = findFiles(SOURCE_DIR);
  addCheck("real18FilesReadable", filePaths.length === 18, { count: filePaths.length });
  clearRuntimeBIDataSet();
  const runtime = await runETLRuntime(descriptorsFor(filePaths.map((file, index) => safeFileForPath(file, index))));
  const source = await loadHomeBIDataSource();
  const state = baseState();
  const viewModel = buildHomeBIViewModel(source, state);
  const totals = datasetTotals(runtime.dataset);

  addCheck("productMetricDateCoverage626630", JSON.stringify(dateSetFor(runtime.dataset.productMetrics)) === JSON.stringify(EXPECTED_DATES));
  addCheck("planMetricDateCoverage626630", JSON.stringify(dateSetFor(runtime.dataset.planMetrics)) === JSON.stringify(EXPECTED_DATES));
  addCheck("searchTotalDateCoverage626630", JSON.stringify(dateSetFor(runtime.dataset.searchTotalKeywords)) === JSON.stringify(EXPECTED_DATES));
  addCheck("searchProductDatesStayWithin626630", datesStayWithinCurrentRange(dateSetFor(runtime.dataset.searchProductKeywords)), dateSetFor(runtime.dataset.searchProductKeywords));
  addCheck("homeMtdChartAxisWithinCurrentRange", chartAxesWithinRange(viewModel.mtdChartModel.xAxis), viewModel.mtdChartModel.xAxis);
  addCheck("homeDlyChartAxisWithinCurrentRange", chartAxesWithinRange(viewModel.dlyChartModel.xAxis), viewModel.dlyChartModel.xAxis);
  addCheck("homeChartValuesFiniteOrNull", chartValuesAreFiniteOrNull(source, state));
  addCheck("gmvStable125596", closeEnough(kpiRawValue(source, state, "GMV"), 125596), { actual: kpiRawValue(source, state, "GMV") });
  addCheck("gsvStable85455_96", closeEnough(kpiRawValue(source, state, "GSV"), 85455.96), { actual: kpiRawValue(source, state, "GSV") });
  addCheck("visitorsStable143076", totals.visitors === 143076, totals);
  addCheck("paidBuyersStable128", totals.paidBuyers === 128, totals);
  addCheck("adSpendStable7625_95", closeEnough(totals.adSpend, 7625.95), totals);
  addCheck("clicksStable6692", totals.clicks === 6692, totals);
  addCheck("refundStable29602_18", closeEnough(totals.refund, 29602.18), totals);
  addCheck("refundFeeRatioStable13_65", closeEnough((kpiRawValue(source, state, "去退费比") ?? 0) * 100, 13.65), { actual: round((kpiRawValue(source, state, "去退费比") ?? 0) * 100, 2) });
  addCheck("directTransactionShareStable63_4", closeEnough((kpiRawValue(source, state, "直接成交占比") ?? 0) * 100, 63.4), { actual: round((kpiRawValue(source, state, "直接成交占比") ?? 0) * 100, 2) });

  const sourceWithAuditSeries = mergeWithAuditSeries(source);
  const auditSeriesId = sourceWithAuditSeries.seriesDefinitions[0]?.seriesId ?? null;
  const scopedSeriesSource = auditSeriesId ? scopeBySeries(sourceWithAuditSeries, auditSeriesId) : sourceWithAuditSeries;
  const seriesGmv = metricSum(scopedSeriesSource.points, "gmv");
  const globalGmv = metricSum(source.points, "gmv");
  const seriesState = { ...state, selectedMetric: auditSeriesId ?? state.selectedMetric, selectedSeries: auditSeriesId };
  const seriesViewModel = buildHomeBIViewModel(scopedSeriesSource, seriesState);
  addCheck("seriesScopeIsNarrowerThanGlobal", seriesGmv > 0 && seriesGmv < globalGmv, { seriesGmv: round(seriesGmv, 2), globalGmv: round(globalGmv, 2) });
  addCheck("seriesScopedChartAxisWithinCurrentRange", chartAxesWithinRange(seriesViewModel.mtdChartModel.xAxis), seriesViewModel.mtdChartModel.xAxis);
  addCheck("seriesScopedChartValuesFiniteOrNull", chartValuesAreFiniteOrNull(scopedSeriesSource, seriesState));

  addCheck("runtimeDatasetHasNoTargetsField", !("targets" in (runtime.dataset as unknown as Record<string, unknown>)));
  addCheck("noForbiddenPathChanges", forbiddenChangedFiles().length === 0, forbiddenChangedFiles());

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  const report = {
    taskId: "CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1",
    status,
    referencedProblemIds: REQUIRED_PROBLEM_IDS,
    totals,
    chartAxis: {
      expectedAxis,
      homeMtd: viewModel.mtdChartModel.xAxis,
      homeDly: viewModel.dlyChartModel.xAxis,
      seriesScoped: seriesViewModel.mtdChartModel.xAxis,
    },
    changedFiles: changedFiles().length,
    forbiddenChangedFiles: forbiddenChangedFiles(),
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    taskId: "CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1",
    status: "BLOCKED" as Status,
    error: message,
    checks,
  }, null, 2));
  process.exit(1);
});
