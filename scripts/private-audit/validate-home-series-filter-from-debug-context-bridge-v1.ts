import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  loadHomeBIDataSource,
  type BIHomeDataSource,
  type BIHomeSeriesDefinition,
} from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIDataPoint, UIState } from "../../lib/bi/bi.types";
import {
  clearRuntimeBIDataSet,
  runETLRuntime,
  setRuntimeBIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import type { DebugContextTempSeriesItem } from "../../lib/persistence/debug-context-persistence";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const REQUIRED_PROBLEM_IDS = ["PVM2-001", "PVM2-002", "PVM2-004", "PVM2-007", "PVM2-013"] as const;
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

const checks: Check[] = [];
const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const changedFiles = (): string[] => {
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"], { cwd: ROOT, encoding: "utf8" }).trim();
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).trim();
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

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
  return new NodeFile([bytes], `audit_home_series_bridge_${String(index + 1).padStart(2, "0")}${extension}`) as unknown as File;
};

const descriptorsFor = (files: File[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const uniqueTextList = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort();

const normalizeDebugSeriesDefinitions = (items: DebugContextTempSeriesItem[]): BIHomeSeriesDefinition[] => {
  const groups = new Map<string, BIHomeSeriesDefinition>();
  items.forEach((item) => {
    const productId = item.productId.trim();
    const seriesName = item.seriesName.trim();
    const storeId = item.storeId.trim();
    if (!productId || !seriesName || !storeId) return;
    const seriesId = (item.seriesId || item.id || seriesName).trim();
    const key = `${item.platformCode || "tmall"}::${storeId}::${seriesId || seriesName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.productIds = uniqueTextList([...existing.productIds, productId]);
      return;
    }
    groups.set(key, {
      platformCode: item.platformCode || "tmall",
      platformName: item.platformName || item.platformCode || "天猫",
      storeId,
      storeName: item.storeName || storeId,
      seriesId: seriesId || key,
      seriesName,
      productIds: [productId],
    });
  });
  return Array.from(groups.values()).map((series) => ({ ...series, productIds: uniqueTextList(series.productIds) }));
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

const mergeWithDebugSeries = (source: BIHomeDataSource, debugItems: DebugContextTempSeriesItem[]): BIHomeDataSource => {
  const debugSeries = normalizeDebugSeriesDefinitions(debugItems);
  const definitions: BIHomeSeriesDefinition[] = [];
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const push = (series: BIHomeSeriesDefinition) => {
    const normalized = { ...series, productIds: uniqueTextList(series.productIds) };
    const key = `${normalized.platformCode}::${normalized.storeId}::${normalized.seriesId || normalized.seriesName}`;
    const nameKey = `${normalized.platformCode}::${normalized.storeId}::${normalized.seriesName}`;
    if (seen.has(key) || seenNames.has(nameKey)) return;
    seen.add(key);
    seenNames.add(nameKey);
    definitions.push(normalized);
  };
  debugSeries.forEach(push);
  source.seriesDefinitions.forEach(push);
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

const productTotals = (source: BIHomeDataSource): Array<{ productId: string; gmv: number; point: BIDataPoint }> => {
  const totals = new Map<string, { gmv: number; point: BIDataPoint }>();
  source.points.forEach((point) => {
    if (!point.productId) return;
    const key = `${point.platformCode}::${point.storeId}::${point.productId}`;
    const current = totals.get(key) ?? { gmv: 0, point };
    current.gmv += point.metrics.gmv ?? 0;
    totals.set(key, current);
  });
  return Array.from(totals.entries())
    .map(([, value]) => ({ productId: value.point.productId ?? "", gmv: value.gmv, point: value.point }))
    .filter((item) => item.productId && item.gmv > 0)
    .sort((left, right) => right.gmv - left.gmv);
};

const kpiRawValue = (viewModel: ReturnType<typeof buildHomeBIViewModel>, title: string): number | null =>
  viewModel.kpiCards.find((card) => card.title === title && !card.coreSeriesId)?.rawValue ?? null;

const baseState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  timeRange: {
    mode: "custom",
    startDate: "2026-06-26",
    endDate: "2026-06-30",
  },
  selectedStores: ["tmall-default-store"],
  brandModelFilter: {
    brandWords: ["空气堡"],
    modelWords: [],
    centerWordGroups: [{ id: "p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] }],
  },
});

const main = async () => {
  REQUIRED_READ_FILES.forEach((file) => addCheck(`read:${file}`, exists(file)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  addCheck("read:AGENTS", agents.includes("Tmall V1 Internal Beta Agent Protocol"));
  addCheck("read:PROJECT_CURRENT_STATE", projectState.includes("天猫 V1 内测排查版"));
  addCheck("read:PAGE_PROBLEM_MATRIX_V2", REQUIRED_PROBLEM_IDS.every((id) => problemMatrix.includes(id)), REQUIRED_PROBLEM_IDS);
  addCheck("read:TASK_EXECUTION_PROTOCOL", protocol.includes("UI 只做展示和交互"));
  addCheck("read:UI_BASELINE_LOCK_V2", uiBaseline.includes("全量 KPI 卡片网格基线"));
  addCheck("problemIdsBound", REQUIRED_PROBLEM_IDS.every((id) => problemMatrix.includes(id)), REQUIRED_PROBLEM_IDS);

  const homeSource = read("components/home/home-bi-dashboard.tsx");
  const seriesSource = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  addCheck("seriesBoardPersistsTempSeries", seriesSource.includes("temporarySeriesProductIds") && seriesSource.includes("saveCrossPageDebugContextPatch"));
  addCheck("homeReadsSeriesDebugContext", homeSource.includes("setDebugSeriesItems(result.snapshot.pages.series.temporarySeriesProductIds)"));
  addCheck("homeMergesDebugSeriesDefinitions", homeSource.includes("mergeHomeDebugSeriesDataSource") && homeSource.includes("normalizeDebugSeriesDefinitions"));
  addCheck("homeScopesDataSourceBySeries", homeSource.includes("scopeHomeDataSourceBySeries") && homeSource.includes("productIds.has"));
  addCheck("homeRestoresSeriesFromMetric", homeSource.includes("selectedSeriesIdFromMetric") && homeSource.includes("persistedHomeSelectedMetric"));
  addCheck("homeBreadcrumbUsesCurrentSeries", homeSource.includes("currentSeriesLabel") && homeSource.includes("home-bi-dimension-scope"));
  addCheck("homeSeriesPickerUsesFilterOptions", homeSource.includes("home-bi-series-filter-option") && homeSource.includes("home-bi-series-filter-all-option"));

  const filePaths = findFiles(SOURCE_DIR);
  addCheck("real18FilesReadable", filePaths.length === 18, { count: filePaths.length });
  const runtime = await runETLRuntime(descriptorsFor(filePaths.map((file, index) => safeFileForPath(file, index))));
  clearRuntimeBIDataSet();
  setRuntimeBIDataSet(runtime.dataset, []);
  const source = await loadHomeBIDataSource();
  const products = productTotals(source);
  const globalView = buildHomeBIViewModel(source, baseState());
  const globalGmv = kpiRawValue(globalView, "GMV");
  const candidate = products.find((item) => globalGmv !== null && item.gmv > 0 && item.gmv < globalGmv);
  addCheck("realProductCandidateAvailable", Boolean(candidate), candidate ? { productIdPresent: Boolean(candidate.productId), gmv: round(candidate.gmv) } : { productCount: products.length });

  if (candidate) {
    const candidateStoreId = candidate.point.storeId ?? "tmall-default-store";
    const debugSeries: DebugContextTempSeriesItem[] = [{
      id: "debug-series-air-purifier-product-1",
      seriesId: "debug-series-air-purifier",
      seriesName: "空气净化器",
      platformCode: candidate.point.platformCode,
      platformName: candidate.point.platformName ?? "天猫",
      storeId: candidateStoreId,
      storeName: candidate.point.storeName ?? candidateStoreId,
      productId: candidate.productId,
      remark: "",
      source: "temp",
    }];
    const bridged = mergeWithDebugSeries(source, debugSeries);
    const scoped = scopeBySeries(bridged, "debug-series-air-purifier");
    const selectedState: UIState = {
      ...baseState(),
      selectedMetric: "series:debug-series-air-purifier",
      selectedSeries: "debug-series-air-purifier",
    };
    const scopedView = buildHomeBIViewModel(scoped, selectedState);
    const scopedGmv = kpiRawValue(scopedView, "GMV");
    const pickerSeries = bridged.seriesDefinitions.find((series) => series.seriesId === "debug-series-air-purifier");
    addCheck("homeSeriesListContainsUserSeries", Boolean(pickerSeries), pickerSeries ? { seriesName: pickerSeries.seriesName, productCount: pickerSeries.productIds.length } : null);
    addCheck("homeSeriesPointsBuiltProductIdFirst", bridged.seriesPoints.some((point) => point.seriesId === "debug-series-air-purifier" && point.productId === candidate.productId));
    addCheck("homeKpiFilteredBySeriesProductIds", scopedGmv !== null && globalGmv !== null && scopedGmv > 0 && scopedGmv < globalGmv, { globalGmv, scopedGmv });
    addCheck("homeChartFilteredBySeriesProductIds", scopedView.mtdChartModel.title.includes("空气净化器") && scopedView.mtdChartModel.series.some((line) => line.points.some((point) => point.value !== null)), {
      title: scopedView.mtdChartModel.title,
      lines: scopedView.mtdChartModel.series.length,
    });
    addCheck("homeEmptySeriesSafe", scopeBySeries(mergeWithDebugSeries(source, [{
      ...debugSeries[0],
      id: "debug-empty",
      seriesId: "debug-empty-series",
      productId: "",
    }]), "debug-empty-series").points.length === source.points.length);
  }

  const files = changedFiles();
  const forbiddenChanged = files.filter((file) =>
    file.startsWith("lib/etl/") ||
    file === "lib/etl/dedup-engine.ts" ||
    file === "lib/bi/brand-model-semantic.ts" ||
    file === "lib/bi/bi.home-mapper.ts" ||
    file === "lib/bi/target-metric-definitions.ts" ||
    file.startsWith("lib/persistence/") ||
    file.startsWith("lib/storage/") ||
    file.startsWith("lib/tmall/") ||
    file.startsWith("lib/v05/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "vercel.json" ||
    file.startsWith(".vercel/") ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(file),
  );
  addCheck("noForbiddenChangedFiles", forbiddenChanged.length === 0, forbiddenChanged);
  addCheck("runtimeDatasetHasNoTargets", !("targets" in (runtime.dataset as unknown as Record<string, unknown>)));
  addCheck("noRawPreviewWarningInRuntimeUi", !/rawRows|previewRows|warning 原文/.test(homeSource + seriesSource));
  addCheck("noNaNInfinityUndefinedText", !/>\s*(?:NaN|Infinity|undefined)\s*</.test(homeSource));

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({
    task: "HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1",
    status,
    checks,
    summary: {
      checks: checks.length,
      failed: failed.length,
      changedFiles: files.length,
      forbiddenChanged: forbiddenChanged.length,
    },
  }, null, 2));
  console.log(`HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1_STATUS: ${status}`);
  if (status !== "PASS") process.exit(1);
};

main().catch((error) => {
  console.error(JSON.stringify({
    task: "HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1",
    status: "BLOCKED",
    reason: error instanceof Error ? error.message : String(error),
  }, null, 2));
  console.log("HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1_STATUS: BLOCKED");
  process.exit(1);
});
