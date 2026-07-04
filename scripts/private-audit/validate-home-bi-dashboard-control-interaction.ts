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
      productName: "safe product one",
      businessDate: "2026-06-23",
      metrics: { gmv: 600, gsv: 540, visitors: 60, paidBuyers: 6 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p1",
      productName: "safe product one",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s2",
      storeName: "店铺二",
      seriesId: null,
      seriesName: null,
      productId: "p2",
      productName: "safe product two",
      businessDate: "2026-06-24",
      metrics: { gmv: 300, gsv: 260, visitors: 50, paidBuyers: 5 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p1",
      productName: "safe product one",
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
      productName: "safe product one",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10, adSpend: 100, adRevenue: 250, adClicks: 20 },
    },
  ],
  searchTotalKeywords: [],
  searchProductKeywords: [],
  targets: [],
  dataStatus: {
    mode: "v2_valid",
    label: "多店铺真实数据",
    storeCount: 2,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  },
};

const baseState = {
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  selectedStores: ["s1", "s2"],
  timeRange: { mode: "day" as const, startDate: "2026-06-24", endDate: "2026-06-24" },
};

const gmv = (state: typeof baseState): number | null =>
  buildHomeBIViewModel(source, state).kpiCards.find((card) => card.title === "GMV")?.rawValue ?? null;

const allStoresVm = buildHomeBIViewModel(source, baseState);
const storeOneVm = buildHomeBIViewModel(source, { ...baseState, selectedStores: ["s1"] });
const storeTwoVm = buildHomeBIViewModel(source, { ...baseState, selectedStores: ["s2"] });
const weekVm = buildHomeBIViewModel(source, {
  ...baseState,
  timeRange: { mode: "week" as const, startDate: "2026-06-22", endDate: "2026-06-28" },
});
const excludedVm = buildHomeBIViewModel(source, {
  ...baseState,
  excludedProductIds: ["p1"],
});
const gsvTargetVm = buildHomeBIViewModel(source, {
  ...baseState,
  selectedMetric: "GSV",
  targetDrafts: { GSV: 1000 },
});
const cpcTargetVm = buildHomeBIViewModel(source, {
  ...baseState,
  selectedMetric: "推广点击单价",
  targetDrafts: { 推广点击单价: 4 },
});
const returnVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "退货率（总）" });
const seriesVm = buildHomeBIViewModel(source, {
  ...baseState,
  selectedMetric: "空气净化器",
  selectedSeries: "series-air",
});

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

const checkHomeHttp = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("http://localhost:3000/home", {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const main = async () => {
  const component = read("components/home/home-bi-dashboard.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const selector = read("lib/bi/bi.selector.ts");
  const changedFiles = parseChangedFiles();
  const homeHttp200 = await checkHomeHttp();

  const checks = {
    hasRealStoreDropdown:
      component.includes("buildStoreOptions(dataSource)") &&
      component.includes("目标店铺") &&
      component.includes("全部选择") &&
      component.includes("清空选择"),
    storeOptionsFromDataSource: component.includes("source.points.reduce"),
    selectedStoresAffectViewModel:
      gmv(baseState) === 1300 &&
      gmv({ ...baseState, selectedStores: ["s1"] }) === 1000 &&
      gmv({ ...baseState, selectedStores: ["s2"] }) === 300,
    dayWeekMonthCustomUpdateTimeRange:
      component.includes("handlePeriodChange") &&
      component.includes("weekRangeForDate") &&
      component.includes("monthRangeForDate") &&
      component.includes("mode: \"custom\""),
    startAfterEndSafetyError:
      component.includes("开始日期不能晚于结束日期") &&
      component.includes("return state"),
    productIdExclusionAffectsKpiAndChart:
      excludedVm.selectedKpi.rawValue === 300 &&
      !excludedVm.mtdChartModel.lines.some((line) => line.points.some((point) => point.value === 1000)),
    remarkKeywordOnlySavedNotFiltered:
      component.includes("excludedRemarkKeywords") &&
      component.includes("商家备注过滤将在后续字段接入后启用") &&
      !selector.includes("excludedRemarkKeywords"),
    platformTargetDraftAffectsKpi:
      gsvTargetVm.selectedKpi.totalTarget === "1,000" &&
      gsvTargetVm.selectedKpi.completionRate === "116%" &&
      gsvTargetVm.selectedKpi.difference === "+160",
    targetDraftsDoNotWriteStorage:
      !component.includes("localStorage.setItem") &&
      !component.includes("indexedDB") &&
      !mapper.includes("localStorage.setItem"),
    kpiDirectionRules:
      mapper.includes("LOWER_IS_BETTER_TITLES") &&
      cpcTargetVm.selectedKpi.completionRate === "80%" &&
      cpcTargetVm.selectedKpi.difference === "-1",
    highLowRulesExist:
      mapper.includes("higher_is_better") &&
      mapper.includes("lower_is_better") &&
      mapper.includes("actual === 0 ? 1"),
    returnChartKeepsThreeLines: returnVm.mtdChartModel.lines.length === 3,
    seriesChartKeepsPlatformLegend:
      seriesVm.mtdChartModel.lines.map((line) => line.name).includes("天猫-空气净化器") &&
      seriesVm.mtdChartModel.lines.map((line) => line.name).includes("京东-空气净化器"),
    timeRangeAffectsChart: weekVm.mtdChartModel.xAxis.length === 2 && allStoresVm.mtdChartModel.xAxis.length === 1,
    noInvalidOutput:
      !containsInvalidOutput(allStoresVm) &&
      !containsInvalidOutput(storeOneVm) &&
      !containsInvalidOutput(storeTwoVm) &&
      !containsInvalidOutput(excludedVm) &&
      !containsInvalidOutput(gsvTargetVm),
    changedFilesWithinAllowed: changedFiles.every((file) =>
      allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
    ),
    noForbiddenChanges: !changedFiles.some((file) =>
      forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)),
    ),
    noNewDependencies: !git(["diff", "--name-only", "--", "package.json", "package-lock.json"]),
    homeHttp200,
  };

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    summary: {
      allStoresGmv: gmv(baseState),
      storeOneGmv: gmv({ ...baseState, selectedStores: ["s1"] }),
      storeTwoGmv: gmv({ ...baseState, selectedStores: ["s2"] }),
      excludedGmv: excludedVm.selectedKpi.rawValue,
      gsvDraftCompletion: gsvTargetVm.selectedKpi.completionRate,
      cpcDraftCompletion: cpcTargetVm.selectedKpi.completionRate,
      returnLines: returnVm.mtdChartModel.lines.map((line) => line.name),
      seriesLines: seriesVm.mtdChartModel.lines.map((line) => line.name),
    },
    changedFiles,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status !== "PASS") process.exitCode = 1;
};

void main();
