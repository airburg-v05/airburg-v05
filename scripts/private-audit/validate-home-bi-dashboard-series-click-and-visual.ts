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

const requiredNavItems = [
  "经营首页",
  "系列看板",
  "店铺看板",
  "宝贝看板",
  "数据上传",
  "库存看板",
  "计划拆解",
  "历史数据",
  "AI顾问",
];

const requiredBaseKpis = [
  "GMV",
  "GSV",
  "去退费比",
  "品牌词访客",
  "品牌词支付人数",
  "GEO搜索占比",
  "投入产出比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "MTD周转",
  "同区履约率",
  "推广点击单价",
  "客单价",
  "转化率",
  "推广花费",
  "直接成交占比",
];

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
      metrics: { adSpend: 100, adRevenue: 250, adClicks: 20 },
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
  selectedStores: ["s1", "s2"],
  selectedMetric: "GMV",
  timeRange: { mode: "day" as const, startDate: "2026-06-24", endDate: "2026-06-24" },
};

const seriesClickedState = {
  ...baseState,
  selectedMetric: "空气净化器",
  selectedSeries: "series-air",
};

const vmAfterSeriesClick = buildHomeBIViewModel(source, seriesClickedState);
const returnVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "退货率（总）" });
const excludedVm = buildHomeBIViewModel(source, { ...seriesClickedState, excludedProductIds: ["p1"] });
const draftVm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "GSV", targetDrafts: { GSV: 1000 } });

const card = (title: string) => vmAfterSeriesClick.kpiCards.find((item) => item.title === title);

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

const componentHasAny = (sourceText: string, tokens: string[]): boolean =>
  tokens.some((token) => sourceText.includes(token));

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
  const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
  const biChartSource = read("components/visual-system/v1/bi-chart.tsx");
  const visualSources = `${component}\n${visualSystemSource}\n${biChartSource}`;
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const changedFiles = parseChangedFiles();
  const homeHttp200 = await checkHomeHttp();
  const seriesLineByName = new Map(vmAfterSeriesClick.mtdChartModel.lines.map((line) => [line.name, line]));
  const jdSeriesLine = seriesLineByName.get("京东-空气净化器");

  const checks = {
    selectedSeriesOnlyForChartAndSelection:
      mapper.includes("globalStateForHomeKpi") &&
      mapper.includes("selectedSeries: null") &&
      component.includes("selectedSeries: card.coreSeriesId"),
    globalKpisIgnoreSelectedSeries:
      card("GMV")?.rawValue === 1300 &&
      card("GSV")?.rawValue === 1160 &&
      card("投入产出比")?.rawValue === 2.5 &&
      card("转化率")?.value === "10%",
    seriesCardStillUsesSeriesProducts:
      card("空气净化器")?.rawValue === 900 &&
      card("空气净化器")?.coreSeriesId === "series-air",
    returnChartKeepsThreeLines:
      returnVm.mtdChartModel.lines.map((line) => line.name).join("|") === "总退货率|发货退货率|已签收退货率",
    seriesChartKeepsPlatformLegend:
      ["天猫-空气净化器", "京东-空气净化器", "抖音-空气净化器", "拼多多-空气净化器", "有赞-空气净化器"].every((name) =>
        vmAfterSeriesClick.mtdChartModel.lines.some((line) => line.name === name),
      ),
    emptyPlatformLineNotZero:
      !!jdSeriesLine &&
      jdSeriesLine.points.length === vmAfterSeriesClick.mtdChartModel.xAxis.length &&
      jdSeriesLine.points.every((point) => point.value === null),
    productExclusionStillWorks:
      excludedVm.kpiCards.find((item) => item.title === "GMV")?.rawValue === 300 &&
      excludedVm.kpiCards.find((item) => item.title === "空气净化器")?.rawValue === null,
    targetDraftsStillTemporary:
      draftVm.selectedKpi.totalTarget === "1,000" &&
      draftVm.selectedKpi.completionRate === "116%" &&
      !component.includes("localStorage.setItem") &&
      !component.includes("indexedDB"),
    noInvalidOutput:
      !containsInvalidOutput(vmAfterSeriesClick) &&
      !containsInvalidOutput(returnVm) &&
      !containsInvalidOutput(excludedVm) &&
      !containsInvalidOutput(draftVm),
    baseKpisPresent: requiredBaseKpis.every((kpi) => component.includes(`"${kpi}"`) || mapper.includes(`"${kpi}"`)),
    dynamicSeriesCardsPresent:
      component.includes("SeriesPickerDialog") &&
      mapper.includes("seriesMetricDefinitions") &&
      !mapper.includes('metricKey: "空气净化器"'),
    all9NavItemsPresent: requiredNavItems.every((item) => visualSources.includes(`"${item}"`)),
    visualDesktopPolish:
      componentHasAny(visualSources, ["w-[224px]", "w-[232px]", "w-[240px]"]) &&
      componentHasAny(visualSources, ["h-11", "h-12", "h-[44px]", "h-[48px]", "h-[52px]"]) &&
      component.includes("xl:grid-cols-5") &&
      componentHasAny(component, ["h-[160px]", "h-[168px]", "min-h-[154px]"]) &&
      componentHasAny(visualSources, ["h-56", "h-64", "h-[220px]", "h-[240px]", "h-[256px]", "min-h-[300px]"]) &&
      componentHasAny(component, ["bg-sky-50", "bg-sky-100"]) &&
      componentHasAny(component, ["ring-2 ring-blue-300", "ring-4 ring-blue-300"]) &&
      (component.includes('data-testid="home-bi-chart-panel"') || component.includes('testId="home-bi-chart-panel"')) &&
      component.includes('data-testid="home-bi-platform-target-popover"') &&
      component.includes('data-testid="home-bi-product-exclude-dialog"'),
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
      afterSeriesClickGlobalGmv: card("GMV")?.rawValue,
      afterSeriesClickGlobalGsv: card("GSV")?.rawValue,
      afterSeriesClickRoi: card("投入产出比")?.rawValue,
      afterSeriesClickConversion: card("转化率")?.value,
      seriesCardValue: card("空气净化器")?.rawValue,
      seriesLines: vmAfterSeriesClick.mtdChartModel.lines.map((line) => line.name),
      returnLines: returnVm.mtdChartModel.lines.map((line) => line.name),
      excludedGmv: excludedVm.kpiCards.find((item) => item.title === "GMV")?.rawValue,
      targetDraftCompletion: draftVm.selectedKpi.completionRate,
    },
    changedFiles,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (output.status !== "PASS") process.exitCode = 1;
};

void main();
