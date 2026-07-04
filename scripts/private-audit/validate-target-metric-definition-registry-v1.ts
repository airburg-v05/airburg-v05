import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  TARGET_METRIC_DEFINITIONS,
  createBoardTargetKpiDefinitions,
  getTargetMetricDefinitionsForScope,
} from "../../lib/bi/target-metric-definitions";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const requiredTitles = [
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
] as const;

const unitExpectations: Record<string, string> = {
  GMV: "元",
  GSV: "元",
  推广花费: "元",
  客单价: "元",
  推广点击单价: "元",
  品牌词访客: "人",
  品牌词支付人数: "人",
  投入产出比: "倍",
  转化率: "%",
  GEO搜索占比: "%",
  "退货率（总）": "%",
  发货退货率: "%",
  已签收退货率: "%",
  MTD周转: "天",
};

const forbiddenPatterns = [
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const allowedOrPriorPatterns = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "components/upload/v1/**",
  "components/upload/history/**",
  "components/upload/quality/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const main = () => {
  const registry = read("lib/bi/target-metric-definitions.ts");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const changed = changedFiles();
  const unknownChanged = changed.filter((file) => !allowedOrPriorPatterns.some((pattern) => matchesPattern(file, pattern)));
  const forbiddenChanged = changed.filter((file) => forbiddenPatterns.some((pattern) => matchesPattern(file, pattern)));

  const byTitle = new Map(TARGET_METRIC_DEFINITIONS.map((definition) => [definition.title, definition]));
  const platformMetrics = getTargetMetricDefinitionsForScope("platform");
  const seriesMetrics = getTargetMetricDefinitionsForScope("series");
  const productMetrics = getTargetMetricDefinitionsForScope("product");
  const seriesBoardKpis = createBoardTargetKpiDefinitions("series", { gmv: "seriesGmv", gsv: "seriesGsv" }, { gmv: "系列GMV", gsv: "系列GSV" });
  const productBoardKpis = createBoardTargetKpiDefinitions("product", { gmv: "productGmv", gsv: "productGsv" }, { gmv: "宝贝GMV", gsv: "宝贝GSV" });

  addCheck("registryHasAllRequiredTitles", requiredTitles.every((title) => byTitle.has(title)), TARGET_METRIC_DEFINITIONS.map((definition) => definition.title));
  addCheck("registryDefinitionsHaveRequiredShape", TARGET_METRIC_DEFINITIONS.every((definition) =>
    Boolean(definition.metricKey) &&
    Boolean(definition.title) &&
    Boolean(definition.unit) &&
    Boolean(definition.format) &&
    Boolean(definition.direction) &&
    definition.supportedScopes.length > 0,
  ));
  addCheck("registryUnitsAreCanonical", Object.entries(unitExpectations).every(([title, unit]) => byTitle.get(title)?.unit === unit), unitExpectations);
  addCheck("roiUnitIsTimesNotPercent", byTitle.get("投入产出比")?.unit === "倍" && !registry.includes('title: "投入产出比",\n    unit: "%"'));
  addCheck("registryHasNoFixedSeriesTargetItems", !["空气净化器", "新风系统", "滤网配件"].some((title) => byTitle.has(title)));
  addCheck("platformScopeContains17Metrics", platformMetrics.length === 17, platformMetrics.map((definition) => definition.title));
  addCheck("seriesScopeKeeps15BoardMetrics", seriesMetrics.length === 15 && seriesBoardKpis.length === 15, seriesBoardKpis.map((definition) => definition.title));
  addCheck("productScopeKeeps15BoardMetrics", productMetrics.length === 15 && productBoardKpis.length === 15, productBoardKpis.map((definition) => definition.title));

  addCheck("homePlatformTargetFieldsFromRegistry", home.includes("getTargetMetricDefinitionsForScope(\"platform\")") && home.includes("BASE_PLATFORM_TARGET_FIELDS"));
  addCheck("homePlatformTargetNoFixedSeriesFields", !home.includes('{ label: "空气净化器", unit: "元" }') && !home.includes('{ label: "新风系统", unit: "元" }') && !home.includes('{ label: "滤网配件", unit: "元" }'));
  addCheck("seriesTargetFieldsFromRegistry", series.includes("createBoardTargetKpiDefinitions") && series.includes("const SERIES_TARGET_FIELDS = SERIES_KPIS"));
  addCheck("productKpisFromRegistry", product.includes("createBoardTargetKpiDefinitions") && product.includes("const PRODUCT_KPIS"));
  addCheck("productTargetRegistryReadyIfTargetEntryAdded", productBoardKpis.some((definition) => definition.title === "宝贝GMV") && productBoardKpis.some((definition) => definition.title === "投入产出比" && definition.unit === "倍"));

  addCheck("missingTargetsStillUseDash", [home, series, product].every((source) => source.includes("\"--\"") || source.includes("'--'")));
  addCheck("noActualValueCalculationChangedInRegistry", !registry.includes("sumMetric(") && !registry.includes("runETLRuntime") && !registry.includes("actual"));
  addCheck("changedFilesWithinAllowedBaseline", unknownChanged.length === 0, unknownChanged);
  addCheck("noForbiddenPathChanged", forbiddenChanged.length === 0, forbiddenChanged);
  addCheck("noPackageOrDeployChange", !changed.some((file) => file === "package.json" || file === "package-lock.json" || file === "vercel.json" || file.startsWith(".vercel/")), changed);

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ status, checks }, null, 2));
  if (failed.length > 0) process.exit(1);
};

main();
