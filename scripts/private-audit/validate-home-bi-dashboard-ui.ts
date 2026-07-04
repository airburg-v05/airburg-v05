import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createEmptyHomeBIDataSource } from "../../lib/bi/bi.data-source";
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

const homePage = read("app/(workspace)/home/page.tsx");
const component = read("components/home/home-bi-dashboard.tsx");
const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
const viewModelSource = read("lib/bi/bi.home-view-model.ts");
const mapperSource = read("lib/bi/bi.home-mapper.ts");
const selectorSource = read("lib/bi/bi.selector.ts");
const dataSourceSource = read("lib/bi/bi.data-source.ts");
const changedFiles = parseChangedFiles();
const emptyViewModel = buildHomeBIViewModel(createEmptyHomeBIDataSource("empty", "暂无数据"), createDefaultBIState());

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

const visibleStringLiterals = Array.from(component.matchAll(/["'`]([^"'`]*(?:NaN|Infinity|undefined)[^"'`]*)["'`]/g))
  .map((match) => match[1])
  .filter((text) => !text.includes("Number.isNaN"));

const checks = {
  baseKpisPresent: requiredBaseKpis.every((kpi) => component.includes(`"${kpi}"`) || mapperSource.includes(`"${kpi}"`)),
  seriesKpisAreDynamic:
    component.includes("SeriesPickerDialog") &&
    mapperSource.includes("seriesMetricDefinitions") &&
    !mapperSource.includes('metricKey: "空气净化器"') &&
    !mapperSource.includes('metricKey: "新风系统"') &&
    !mapperSource.includes('metricKey: "滤网配件"'),
  navCountIs9: requiredNavItems.every((item) => `${component}\n${visualSystemSource}`.includes(`"${item}"`)),
  hasProductExclude: component.includes("商品排除"),
  hasPlatformTarget: component.includes("平台目标"),
  hasTargetStore: component.includes("目标店铺"),
  hasPlatformTargetPopover: component.includes("PlatformTargetPopover"),
  hasProductExcludeDialog: component.includes("ProductExcludeDialog"),
  rendersFromKPICardModel:
    component.includes("type HomeBIKpiCard") &&
    component.includes("KPICardTile") &&
    component.includes("cards={cards}") &&
    component.includes("viewModel.kpiCards") &&
    !component.includes("requiredKpis.map"),
  referencesBiTypesOrSelector:
    component.includes("@/lib/bi/bi.types") &&
    component.includes("@/lib/bi/bi.data-source") &&
    component.includes("@/lib/bi/bi.home-view-model") &&
    component.includes("@/lib/bi/bi.store") &&
    viewModelSource.includes("buildHomeBIViewModel") &&
    mapperSource.includes("buildHomeBIKpiCards") &&
    selectorSource.includes("buildPlatformAggs") &&
    selectorSource.includes("buildSeriesAggs") &&
    dataSourceSource.includes("loadHomeBIDataSource"),
  homePageUsesSkeleton: homePage.includes("HomeBIDashboard"),
  noInvalidNumberText: visibleStringLiterals.length === 0 && !containsInvalidOutput(emptyViewModel),
  changedFilesWithinAllowed: changedFiles.every((file) =>
    allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  ),
  changedFilesAvoidForbidden: !changedFiles.some((file) =>
    forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  ),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const output = {
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  failedChecks,
  kpiCount: requiredBaseKpis.length,
  navCount: requiredNavItems.length,
  changedFiles,
  invalidVisibleStringLiterals: visibleStringLiterals,
  checks,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.status !== "PASS") process.exitCode = 1;
