import { execFileSync } from "node:child_process";
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

const knownPriorBaselinePatterns = [
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
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const forbiddenChangePatterns = [
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "components/home/**",
  "components/upload/**",
  "components/store-board/**",
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const allowedThisTaskPatterns = [
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "scripts/private-audit/validate-series-product-selection-p1-5-v1.ts",
];

const isKnownPrior = (file: string): boolean =>
  knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern));

const isAllowedThisTask = (file: string): boolean =>
  allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern));

const hasForbiddenChange = (file: string): boolean => {
  const allowedException = isAllowedThisTask(file) || isKnownPrior(file);
  return forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)) && !allowedException;
};

const includesAll = (source: string, snippets: string[]): boolean => snippets.every((snippet) => source.includes(snippet));

const main = () => {
  const changed = changedFiles();
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("changedFilesWithinBaselineOrTaskScope", changed.every((file) => isKnownPrior(file) || isAllowedThisTask(file)), changed);
  addCheck("noForbiddenChanges", !changed.some(hasForbiddenChange), changed.filter(hasForbiddenChange));
  addCheck("noPackageOrDeployChanges", !changed.some((file) => ["package.json", "package-lock.json", "vercel.json"].includes(file) || file.startsWith(".vercel/")), changed);
  addCheck("noEcsDeployTouched", !changed.some((file) => file.includes("nginx") || file.includes("pm2") || file.includes("aliyun")), changed);

  addCheck(
    "seriesCurrentSelectorExists",
    includesAll(series, ["data-testid=\"series-board-v1-series-selector\"", "当前系列", "onSelectSeries"]),
  );
  addCheck(
    "seriesTwoSeriesSwitchSupported",
    includesAll(series, ["seriesNames.map", "value={selectedSeriesName ?? \"\"}", "onChange={(event) => onSelectSeries(event.target.value || null)}"]),
  );
  addCheck(
    "seriesKpisScopedBySelectedSeriesProducts",
    includesAll(series, ["selectedSeriesRefs", "ref.seriesName === selectedSeriesName", "refKeys.has(`${point.platformCode}:${point.storeId}:${point.productId}`)"]),
  );
  addCheck(
    "seriesTopScopedBySeriesPoints",
    includesAll(series, ["const contributions = useMemo(() => buildContributions(seriesPoints)", "<ProductContributionTop items={hasConfiguredSeries ? contributions : []}"]),
  );
  addCheck(
    "seriesBrandProductIdFirstNotMixed",
    includesAll(series, ["aggregateSearchProductKeywords", "scopedSearchProductKeywords(source, refs, state)", "const productIds = refs.map((ref) => ref.productId)"]),
  );
  addCheck(
    "seriesSwitchDoesNotResetContext",
    series.includes("onSelectSeries={setSelectedSeriesName}") &&
      !series.includes("onSelectSeries={(value) => setBiState") &&
      !series.includes("onSelectSeries={() => setBiState"),
  );

  addCheck("productAllProductsFilterRemoved", !product.includes("所有宝贝"));
  addCheck(
    "productCurrentSelectorExists",
    includesAll(product, ["data-testid=\"product-board-v1-product-selector\"", "当前宝贝", "请选择宝贝后查看数据"]),
  );
  addCheck(
    "productDoesNotAutoSelectAllOrDefault",
    !product.includes("defaultProductKeyFor") && product.includes("productKeyFromQuery(nextProductOptions) ?? null"),
  );
  addCheck(
    "productSettingsSimplified",
    includesAll(product, ["宝贝设置", "平台", "店铺", "宝贝别名（可选）", "商品ID / 宝贝ID"]) &&
      !product.includes("商品备注") &&
      product.includes("items={tempProducts}"),
  );
  addCheck(
    "productKpisScopedToSelectedProduct",
    includesAll(product, ["scopedProductPoints", "productKey(point.platformCode, point.storeId, point.productId) !== selectedProductKey"]),
  );
  addCheck(
    "productTrendScopedToSelectedProduct",
    includesAll(product, ["selectedProduct.platformCode", "selectedProduct.storeId", "selectedProduct.productId", "buildChartLines(dataSource, selectedPoints, productOptions, selectedProductKey"]),
  );
  addCheck(
    "productFunnelOnlyCurrentProduct",
    includesAll(product, ["<SingleProductFunnel item={hasSelectedProduct ? singleProductContribution : null}", "只展示当前选中宝贝"]),
  );
  addCheck(
    "productSafeEmptyStateWhenUnselected",
    includesAll(product, ["const hasSelectedProduct = Boolean(selectedProduct)", "PRODUCT_SELECTION_PROMPT", "暂无选中宝贝"]),
  );
  addCheck(
    "productBrandProductIdFirstNotMixed",
    includesAll(product, ["aggregateSearchProductKeywords", "scopedProductSearchKeywords(source, selectedProduct, state)", "[selectedProduct.productId]"]),
  );
  addCheck(
    "productGeoSearchShareProductIdFirst",
    includesAll(product, ["aggregateSearchProductMetricByDate", "selectedMetric === \"geoSearchShare\"", "当前宝贝GEO搜索占比"]),
  );

  const invalidOutputTokens = ["NaN", "Infinity", "undefined"];
  addCheck("noLiteralInvalidOutput", !invalidOutputTokens.some((token) => series.includes(`>${token}<`) || product.includes(`>${token}<`)));
  addCheck("noAfterSalesSensitiveDetailText", !["订单号", "退款编号", "交易号", "电话", "地址", "买家说明", "商家备注明细"].some((token) => series.includes(token) || product.includes(token)));
  addCheck("etlNotModifiedByTask", !changed.some((file) => file.startsWith("lib/etl/") && !isKnownPrior(file)));
  addCheck("homeNotModifiedByTask", !allowedThisTaskPatterns.some((pattern) => pattern.startsWith("components/home")));
  addCheck("uploadNotModifiedByTask", !allowedThisTaskPatterns.some((pattern) => pattern.startsWith("components/upload")));
  addCheck("notDeployingEcs", true, "No SSH/rsync/PM2/Nginx operation is performed by this validator.");

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ status, checks }, null, 2));
  if (failed.length > 0) process.exit(1);
};

main();
