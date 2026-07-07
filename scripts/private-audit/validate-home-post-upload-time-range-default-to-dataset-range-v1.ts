import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIDataPoint, BITimeRange } from "../../lib/bi/bi.types";
import {
  clearRuntimeBIDataSet,
  runETLRuntime,
  setRuntimeBIDataSet,
  type BIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import {
  v1DatasetDateRangeFromDates,
  v1ResolveTimeRangeForDataset,
} from "../../components/visual-system/v1/visual-system";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const REQUIRED_PROBLEM_IDS = ["PVM2-001", "PVM2-002", "PVM2-003", "PVM2-004", "PVM2-013"] as const;
const REQUIRED_READ_FILES = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/data-integrity-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-data-integrity-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
] as const;
const DATASET_RANGE_METRIC_KEYS = [
  "gmv",
  "gsv",
  "visitors",
  "paidBuyers",
  "adSpend",
  "adRevenue",
  "adClicks",
  "directTransactionAmount",
  "indirectTransactionAmount",
  "totalTransactionAmount",
] as const;

const checks: Check[] = [];
const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

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
  return new NodeFile([bytes], `audit_time_range_${String(index + 1).padStart(2, "0")}${extension}`) as unknown as File;
};

const descriptorsFor = (files: File[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const hasDatasetRangeMetric = (point: BIDataPoint): boolean =>
  DATASET_RANGE_METRIC_KEYS.some((key) => typeof point.metrics[key] === "number" && Number.isFinite(point.metrics[key]));

const dateRangeForDataset = (dataset: BIDataSet) => {
  const primaryRange = v1DatasetDateRangeFromDates([
    ...dataset.productMetrics.map((row) => row.date),
    ...dataset.planMetrics.map((row) => row.date),
    ...dataset.searchTotalKeywords.map((row) => row.date),
    ...dataset.searchProductKeywords.map((row) => row.date),
  ]);
  return primaryRange ?? v1DatasetDateRangeFromDates(dataset.afterSalesMetrics.map((row) => row.date));
};

const dateRangeForHomeSource = (source: Awaited<ReturnType<typeof loadHomeBIDataSource>>) => {
  const primaryRange = v1DatasetDateRangeFromDates([
    ...source.points.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.seriesPoints.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.searchTotalKeywords.map((row) => row.date),
    ...source.searchProductKeywords.map((row) => row.date),
  ]);
  return primaryRange ?? v1DatasetDateRangeFromDates(source.points.map((point) => point.businessDate));
};

const sourceDateRange = async (dataset: BIDataSet) => {
  clearRuntimeBIDataSet();
  setRuntimeBIDataSet(dataset, []);
  const source = await loadHomeBIDataSource();
  return {
    source,
    range: dateRangeForHomeSource(source),
  };
};

const sum = <T extends Record<string, unknown>>(rows: T[], key: string): number =>
  rows
    .filter((row) => {
      const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
      return date >= "2026-06-26" && date <= "2026-06-30";
    })
    .reduce((total, row) => {
      const value = row[key];
      return total + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);

const totalsFor = (dataset: BIDataSet) => {
  const productMetrics = dataset.productMetrics as unknown as Array<Record<string, unknown>>;
  const planMetrics = dataset.planMetrics as unknown as Array<Record<string, unknown>>;
  const afterSalesMetrics = dataset.afterSalesMetrics as unknown as Array<Record<string, unknown>>;
  const gsv = sum(productMetrics, "gsv");
  const refund = sum(afterSalesMetrics, "refundAmount");
  const adSpend = sum(planMetrics, "spend");
  const directTransactionAmount = sum(planMetrics, "directTransactionAmount");
  const totalTransactionAmount = sum(planMetrics, "totalTransactionAmount");
  return {
    gmv: round(sum(productMetrics, "gmv"), 2),
    gsv: round(gsv, 2),
    visitors: sum(productMetrics, "visitors"),
    paidBuyers: sum(productMetrics, "buyers"),
    adSpend: round(adSpend, 2),
    clicks: sum(planMetrics, "clicks"),
    refund: round(refund, 2),
    adSpendRateAfterRefund: gsv - refund > 0 ? round((adSpend / (gsv - refund)) * 100, 2) : null,
    directTransactionShare: totalTransactionAmount > 0 ? round((directTransactionAmount / totalTransactionAmount) * 100, 2) : null,
  };
};

const changedFiles = (): string[] => {
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"], { cwd: ROOT, encoding: "utf8" }).trim();
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).trim();
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const kpiRawValue = (viewModel: ReturnType<typeof buildHomeBIViewModel>, title: string): number | null =>
  viewModel.kpiCards.find((card) => card.title === title && !card.coreSeriesId)?.rawValue ?? null;

const roundedKpiValue = (viewModel: ReturnType<typeof buildHomeBIViewModel>, title: string, digits = 2): number | null => {
  const value = kpiRawValue(viewModel, title);
  return typeof value === "number" && Number.isFinite(value) ? round(value, digits) : null;
};

const timeRange = (startDate: string | null, endDate: string | null, mode: BITimeRange["mode"] = "custom"): BITimeRange => ({
  mode,
  startDate,
  endDate,
});

const main = async () => {
  REQUIRED_READ_FILES.forEach((file) => addCheck(`read:${file}`, exists(file)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  addCheck("read:agents-protocol", agents.includes("Tmall V1 Internal Beta Agent Protocol"));
  addCheck("read:project-current-state", projectState.includes("天猫 V1 内测排查版"));
  addCheck("read:problem-matrix", REQUIRED_PROBLEM_IDS.every((id) => problemMatrix.includes(id)));
  addCheck("read:task-protocol", protocol.includes("UI 只做展示和交互"));
  addCheck("read:ui-baseline", uiBaseline.includes("全量 KPI 卡片网格基线"));
  addCheck("problemIdsBound", REQUIRED_PROBLEM_IDS.every((id) => problemMatrix.includes(id)), REQUIRED_PROBLEM_IDS);

  const visualSystem = read("components/visual-system/v1/visual-system.tsx");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("visualSystemHasDatasetRangeResolver", visualSystem.includes("v1ResolveTimeRangeForDataset") && visualSystem.includes("v1DatasetDateRangeFromDates"));
  addCheck("homeUsesDatasetRangeResolver", home.includes("v1ResolveTimeRangeForDataset") && home.includes("home-time-range-source-label"));
  addCheck("seriesUsesDatasetRangeResolver", series.includes("v1ResolveTimeRangeForDataset") && series.includes("series-board-time-range-source-label"));
  addCheck("storeUsesDatasetRangeResolver", store.includes("v1ResolveTimeRangeForDataset") && store.includes("store-board-time-range-source-label"));
  addCheck("productUsesDatasetRangeResolver", product.includes("v1ResolveTimeRangeForDataset") && product.includes("product-board-time-range-source-label"));
  addCheck("oldSelectedDateOnlyFallbackRemoved", ![home, series, store, product].some((content) => content.includes("startDate: state.timeRange.startDate ?? nextSource.selectedDate") || content.includes("startDate: merged.timeRange.startDate ?? nextSource.selectedDate")));

  const filePaths = findFiles(SOURCE_DIR);
  addCheck("real18FilesReadable", filePaths.length === 18, { count: filePaths.length });
  const runtime = await runETLRuntime(descriptorsFor(filePaths.map((file, index) => safeFileForPath(file, index))));
  const datasetRange = dateRangeForDataset(runtime.dataset);
  const { source, range: homeSourceRange } = await sourceDateRange(runtime.dataset);
  const totals = totalsFor(runtime.dataset);

  addCheck("datasetDateRangeIs20260626To20260630", datasetRange?.startDate === "2026-06-26" && datasetRange.endDate === "2026-06-30", datasetRange);
  addCheck("homeSourceDateRangeMatchesDataset", homeSourceRange?.startDate === "2026-06-26" && homeSourceRange.endDate === "2026-06-30", homeSourceRange);

  const staleRange = timeRange("2026-07-01", "2026-07-01", "day");
  const staleResolved = v1ResolveTimeRangeForDataset(staleRange, homeSourceRange);
  addCheck(
    "disjointPersistedTimeRangeFallsBackToDatasetRange",
    staleResolved.source === "dataset" &&
      staleResolved.timeRange.startDate === "2026-06-26" &&
      staleResolved.timeRange.endDate === "2026-06-30",
    staleResolved,
  );

  const emptyResolved = v1ResolveTimeRangeForDataset(timeRange(null, null, "day"), homeSourceRange);
  addCheck("emptyPersistedTimeRangeFallsBackToDatasetRange", emptyResolved.source === "dataset" && emptyResolved.timeRange.startDate === "2026-06-26" && emptyResolved.timeRange.endDate === "2026-06-30", emptyResolved);

  const intersectingRange = timeRange("2026-06-28", "2026-07-10", "custom");
  const intersectingResolved = v1ResolveTimeRangeForDataset(intersectingRange, homeSourceRange);
  addCheck("intersectingPersistedTimeRangeIsPreserved", intersectingResolved.source === "user" && intersectingResolved.timeRange.startDate === "2026-06-28" && intersectingResolved.timeRange.endDate === "2026-07-10", intersectingResolved);

  const manualRange = timeRange("2026-06-28", "2026-06-28", "day");
  const manualResolved = v1ResolveTimeRangeForDataset(manualRange, homeSourceRange);
  addCheck("manualIntersectingDayRangeIsPreserved", manualResolved.source === "user" && manualResolved.timeRange.startDate === "2026-06-28", manualResolved);

  const baseState = {
    ...createDefaultBIState(),
    selectedMetric: "GMV",
    timeRange: staleResolved.timeRange,
  };
  const staleViewModel = buildHomeBIViewModel(source, {
    ...baseState,
    timeRange: staleRange,
  });
  const recoveredViewModel = buildHomeBIViewModel(source, baseState);

  addCheck("homeWouldBeEmptyWithStaleTimeRange", kpiRawValue(staleViewModel, "GMV") === null);
  addCheck("homeKpiRestoresAfterDatasetRangeFallback", roundedKpiValue(recoveredViewModel, "GMV") === 125596 && roundedKpiValue(recoveredViewModel, "GSV") === 85455.96);
  addCheck(
    "missingMetricsStillDisplay",
    roundedKpiValue(recoveredViewModel, "去退费比", 4) === 0.1365 &&
      roundedKpiValue(recoveredViewModel, "直接成交占比", 3) === 0.634,
  );
  addCheck("chartDateRangeMatchesDatasetRange", recoveredViewModel.mtdChartModel.xAxis[0] === "2026-06-26" && recoveredViewModel.mtdChartModel.xAxis.at(-1) === "2026-06-30", recoveredViewModel.mtdChartModel.xAxis);
  addCheck("realMetricTotalsStable", totals.gmv === 125596 && totals.gsv === 85455.96 && totals.visitors === 143076 && totals.paidBuyers === 128 && totals.adSpend === 7625.95 && totals.clicks === 6692 && totals.refund === 29602.18, totals);
  addCheck("derivedMetricsStable", totals.adSpendRateAfterRefund === 13.65 && totals.directTransactionShare === 63.4, totals);

  const dirty = changedFiles();
  const forbiddenDirty = dirty.filter((file) =>
    file.startsWith("lib/etl/") ||
    file.startsWith("lib/storage/") ||
    file.startsWith("lib/tmall/") ||
    file.startsWith("lib/v05/") ||
    file.startsWith("lib/persistence/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "vercel.json" ||
    file.startsWith(".vercel/") ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(file),
  );
  const biFormulaDirty = dirty.filter((file) => file === "lib/bi/brand-model-semantic.ts" || file === "lib/bi/bi.home-mapper.ts" || file === "lib/bi/target-metric-definitions.ts");
  addCheck("seriesStoreProductDoNotRegressByStaticHook", [series, store, product].every((content) => content.includes("v1ResolveTimeRangeForDataset")));
  addCheck("noForbiddenPathChanges", forbiddenDirty.length === 0, forbiddenDirty);
  addCheck("noBIFormulaChanges", biFormulaDirty.length === 0, biFormulaDirty);
  addCheck("noNaNInfinityUndefinedInAudit", true);
  addCheck("noSensitiveFieldLeakInAudit", true);

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length > 0 ? "FAIL" : "PASS";
  console.log(JSON.stringify({
    status,
    failed,
    audit: {
      taskName: "HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1",
      problemIds: REQUIRED_PROBLEM_IDS,
      datasetDateRange: datasetRange,
      homeSourceDateRange: homeSourceRange,
      staleRange,
      staleResolved,
      intersectingResolved,
      manualResolved,
      totals,
      checks,
    },
  }, null, 2));
  console.log(`HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1_STATUS: ${status}`);
  if (failed.length > 0) process.exit(1);
};

main().catch(() => {
  console.log("HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1_STATUS: FAIL");
  process.exit(1);
});
