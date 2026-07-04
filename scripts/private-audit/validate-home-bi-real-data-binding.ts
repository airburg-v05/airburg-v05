import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BIHomeDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";

const ROOT = process.cwd();

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const parseChangedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const allowedChangePatterns = [
  "app/(workspace)/home/page.tsx",
  "components/home/**",
  "lib/bi/**",
  "app/(workspace)/series-board/page.tsx",
  "components/series-board/v1/**",
  "app/(workspace)/store-board/page.tsx",
  "components/store-board/v1/**",
  "app/(workspace)/product-board/page.tsx",
  "components/product-board/v1/**",
  "app/(workspace)/upload/page.tsx",
  "components/upload/v1/**",
  "app/(workspace)/upload/history/page.tsx",
  "components/upload/history/v1/**",
  "app/(workspace)/upload/quality/page.tsx",
  "components/upload/quality/v1/**",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-v1-local-acceptance.ts",
  "scripts/private-audit/validate-series-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-store-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-product-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
  "scripts/private-audit/validate-history-data-v1-baseline.ts",
  "scripts/private-audit/validate-upload-quality-v1-baseline.ts",
  "scripts/private-audit/validate-core-pages-v1-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-plus-upload-quality-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-visual-system-unification.ts",
  "scripts/private-audit/validate-core-pages-v1-pixel-level-refinement.ts",
  "scripts/private-audit/validate-core-pages-v1-p0-interaction-layout-regression.ts",
  "scripts/private-audit/validate-core-pages-v1-p1-chart-system-and-single-product-board.ts",
  "components/visual-system/v1/**",
];

const forbiddenChangePatterns = [
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const source: BIHomeDataSource = {
  mode: "v2_valid",
  selectedDate: "2026-06-24",
  safeWarnings: [],
  notices: ["synthetic safe source"],
  seriesDefinitions: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: "series-air",
      seriesName: "空气净化器",
      productIds: ["p1"],
    },
  ],
  points: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p1",
      productName: "safe product",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p1",
      productName: "safe product",
      businessDate: "2026-06-24",
      metrics: { adSpend: 100, adRevenue: 250, adClicks: 20, directTransactionAmount: 80 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: null,
      productName: null,
      businessDate: "2026-06-24",
      metrics: { refundAmount: 50, refundCount: 2 },
    },
  ],
  seriesPoints: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: "series-air",
      seriesName: "空气净化器",
      productId: "p1",
      productName: "safe product",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10, adSpend: 100, adRevenue: 250, adClicks: 20 },
    },
  ],
  searchTotalKeywords: [],
  searchProductKeywords: [],
  targets: [
    {
      targetId: "company-gmv",
      scope: "company",
      platformCode: null,
      storeId: null,
      seriesId: null,
      productId: null,
      periodType: "monthly",
      periodValue: "2026-06",
      metricKey: "gmv",
      targetValue: 1200,
      direction: "higher_is_better",
      status: "active",
    },
  ],
  dataStatus: {
    mode: "v2_valid",
    label: "多店铺真实数据",
    storeCount: 1,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  },
};

const emptySeriesSource: BIHomeDataSource = {
  ...source,
  seriesDefinitions: [],
  seriesPoints: [],
};

const baseState = {
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  timeRange: { mode: "day" as const, startDate: "2026-06-24", endDate: "2026-06-24" },
};

const vm = buildHomeBIViewModel(source, baseState);
const missingSeriesVm = buildHomeBIViewModel(emptySeriesSource, { ...baseState, selectedMetric: "空气净化器" });
const returnVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "退货率（总）" });
const seriesVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "空气净化器", selectedSeries: "series-air" });
const roiVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "投入产出比" });
const cpcVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "推广点击单价" });
const conversionVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "转化率" });

const cardValue = (title: string) => vm.kpiCards.find((card) => card.title === title)?.value ?? null;
const containsInvalidOutput = (value: unknown): boolean => {
  const seen = new Set<unknown>();
  const visit = (item: unknown): boolean => {
    if (item && typeof item === "object") {
      if (seen.has(item)) return false;
      seen.add(item);
      return Object.values(item).some(visit);
    }
    if (typeof item === "number") return !Number.isFinite(item);
    if (typeof item === "string") return /NaN|Infinity|undefined/.test(item);
    return false;
  };
  return visit(value);
};

const homeComponent = read("components/home/home-bi-dashboard.tsx");
const homeMapper = read("lib/bi/bi.home-mapper.ts");
const dataSourceFile = read("lib/bi/bi.data-source.ts");
const homePage = read("app/(workspace)/home/page.tsx");
const biChartComponent = read("components/visual-system/v1/bi-chart.tsx");
const packageJson = read("package.json");
const changedFiles = parseChangedFiles();

const checks = {
  homeUsesRealDataMapper:
    homeComponent.includes("loadHomeBIDataSource") &&
    homeComponent.includes("buildHomeBIViewModel") &&
    homePage.includes("HomeBIDashboard"),
  kpiNotAllMockConstants:
    !homeComponent.includes("DEMO_VALUES") &&
    !homeComponent.includes("createDemoKpis") &&
    !homeComponent.includes("createDemoChartData"),
  gmvFromRealData: cardValue("GMV") === "1,000",
  gsvFromRealData: cardValue("GSV") === "900",
  conversionRateFromRealData: conversionVm.selectedKpi.value === "10%",
  roiFromRealData: roiVm.selectedKpi.value === "2.5",
  cpcFromRealData: cpcVm.selectedKpi.value === "5",
  missingMetricShowsDash: cardValue("品牌词访客") === "--",
  emptySeriesDoesNotCreateFakeSeriesCards:
    missingSeriesVm.kpiCards.every((card) => !card.coreSeriesId) &&
    homeComponent.includes("当前还没有配置系列") &&
    homeComponent.includes("SeriesPickerDialog"),
  returnRateChartHasThreeLines: returnVm.mtdChartModel.lines.length === 3,
  kpiClickUpdatesSelectedMetric: homeComponent.includes("selectedMetric: card.metricKey"),
  seriesClickUpdatesSelectedSeries: homeComponent.includes("selectedSeries: card.coreSeriesId"),
  chartLegendChangesWithMetricOrSeries:
    returnVm.mtdChartModel.lines.some((line) => line.name === "总退货率") &&
    seriesVm.mtdChartModel.lines.some((line) => line.name === "天猫-空气净化器"),
  noInvalidNumberOutput:
    !containsInvalidOutput(vm) &&
    !containsInvalidOutput(returnVm) &&
    !containsInvalidOutput(seriesVm),
  noStorageUploadParserChanges: !changedFiles.some((file) =>
    forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  ),
  changedFilesWithinAllowed: changedFiles.every((file) =>
    allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  ),
  noNewDependencies: !git(["diff", "--name-only", "--", "package.json", "package-lock.json"]),
  mapperMentionsV2AndLegacy: dataSourceFile.includes("context.dataset") && dataSourceFile.includes("legacyAnalysis"),
  chartUsesChartModelLines:
    homeMapper.includes("lines: ChartSeries[]") &&
    homeComponent.includes("BIChartCard") &&
    homeComponent.includes("mtdChartModel") &&
    biChartComponent.includes("chart.lines"),
  noMisleadingZeroText: !/0 ROI|0\\.00 倍|显示为 0|显示 0/.test(`${homeComponent}\n${homeMapper}`),
  packageUnchanged: packageJson.includes("\"scripts\""),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const output = {
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  failedChecks,
  summary: {
    gmv: cardValue("GMV"),
    gsv: cardValue("GSV"),
    conversionRate: conversionVm.selectedKpi.value,
    roi: roiVm.selectedKpi.value,
    cpc: cpcVm.selectedKpi.value,
    missingMetric: cardValue("品牌词访客"),
    returnLines: returnVm.mtdChartModel.lines.map((line) => line.name),
    seriesLines: seriesVm.mtdChartModel.lines.map((line) => line.name),
  },
  changedFiles,
  checks,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.status !== "PASS") process.exitCode = 1;
