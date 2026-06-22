import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));

const forbiddenSensitiveText = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
];

const forbiddenDevTerms = [
  "V2 staging",
  "active pointer",
  "readback",
  "legacy adapter",
  "datasetId",
  "pointer",
];

const main = () => {
  const page = read("app/(workspace)/product-board/page.tsx");
  const component = read("components/product-board/v05/product-board-command-center.tsx");
  const safeState = read("components/product-board/v05/product-board-safe-state.tsx");
  const runtime = read("lib/v05/product-board/browser-runtime.ts");
  const viewModel = read("lib/v05/product-board/build-view-model.ts");
  const metrics = read("lib/v05/product-board/metrics.ts");
  const targets = read("lib/v05/product-board/targets.ts");
  const dateRange = read("lib/v05/product-board/date-range.ts");
  const storeBoard = read("components/store-board/v05/store-board-command-center.tsx");
  const storeBuild = read("lib/v05/store-board/build-view-model.ts");
  const seriesComponent = read("components/series-board/v05/series-board-command-center.tsx");
  const seriesMetrics = read("lib/v05/series-board/metrics.ts");
  const focusManagement = read("components/focus-management/focus-management-client.tsx");
  const packageJson = read("package.json");
  const source = [page, component, safeState, runtime, viewModel, metrics, targets, dateRange].join("\n");

  const oldLongModules = [
    "ProductFocusEntry",
    "ProductOperatingInsights",
    "ProductTargetDiagnostics",
    "ProductDataTable",
    "ProductBoardSectionNav",
    "TmallDataContextBar",
    "TmallGlobalDataStatusGuide",
    "TrendCard",
    "buildTmallProductBoardOverview",
    "buildTmallProductOperatingInsights",
  ];

  const checks: Check[] = [
    { name: "/product-board route uses E3 command center", pass: page.includes("ProductBoardCommandCenter") },
    { name: "old product long modules not rendered", pass: oldLongModules.every((name) => !page.includes(name)) },
    { name: "V2 runtime uses public persistence adapter", pass: runtime.includes("IndexedDbV2PersistenceStore.open") && !runtime.includes("indexedDB.open") },
    { name: "legacy fallback does not render all product pool", pass: runtime.includes("legacy_untracked") && viewModel.includes("buildLegacyUntrackedProductBoardViewModel") },
    { name: "page does not write storage", pass: !page.includes("localStorage.setItem") && !runtime.includes("localStorage.setItem") },
    { name: "page does not auto migrate", pass: !source.includes("runLegacyStorageV2") && !source.includes("migrate") },
    { name: "active TrackedProductRecord only", pass: viewModel.includes("item.status === \"active\"") && viewModel.includes("selectedTrackedProduct") },
    { name: "productId compatibility exists", pass: viewModel.includes("productId") && viewModel.includes("canonicalHref") && page.includes("router.replace") },
    { name: "not tracked safe state exists", pass: viewModel.includes("not_tracked") && viewModel.includes("尚未被用户添加为重点商品") },
    { name: "invalid store and tracked safe states", pass: viewModel.includes("invalid_store") && viewModel.includes("invalid_tracked_product") },
    { name: "no tracked products state exists", pass: viewModel.includes("no_tracked_products") && component.includes("管理重点商品") },
    { name: "tracked product selector exists", pass: component.includes("product-board-tracked-select") && component.includes("重点商品") },
    { name: "platform/store controls exist", pass: component.includes("product-board-platform-select") && component.includes("product-board-store-select") },
    { name: "period controls accessible", pass: component.includes("aria-pressed") && component.includes("日") && component.includes("周") && component.includes("月") && component.includes("自定义") },
    { name: "custom date labels exist", pass: component.includes("起始日期") && component.includes("结束日期") && component.includes("type=\"date\"") },
    { name: "six metric cards capped", pass: component.includes("viewModel.metrics.slice(0, 6)") },
    { name: "product target summary read only", pass: component.includes("当前周期暂无商品目标") && component.includes("只读") },
    { name: "main trend is single svg", pass: (component.match(/<svg/g) ?? []).length === 1 },
    { name: "trend tabs accessible", pass: component.includes("role=\"tablist\"") && component.includes("role=\"tab\"") && component.includes("aria-selected") },
    { name: "ad product only for promotion", pass: metrics.includes("filterV2ProductAdFacts") && !metrics.includes("adPlanFacts") },
    { name: "ad-only product retained", pass: metrics.includes("ad_only") || viewModel.includes("ad_only") },
    { name: "safe after-sales aggregate only", pass: metrics.includes("afterSalesRangeAggregates") && metrics.includes("afterSalesOperationalSnapshots") && !source.includes("rawRows") && !source.includes("previewRows") },
    { name: "series memberships present", pass: component.includes("所属系列") && viewModel.includes("buildProductSeriesMemberships") },
    { name: "Store Board links only tracked products to Product Board", pass: storeBuild.includes("trackedByProductId") && storeBoard.includes("未设为重点商品") && storeBoard.includes("查看重点商品") },
    { name: "Series Board links only tracked products to Product Board", pass: seriesMetrics.includes("trackedByProductId") && seriesComponent.includes("未设为重点商品") && seriesComponent.includes("查看重点商品") },
    { name: "Focus management has board entry", pass: focusManagement.includes("查看看板") && focusManagement.includes("trackedProductId") },
    { name: "390px overflow guarded", pass: component.includes("overflow-x-auto") && component.includes("max-w-full") && component.includes("min-w-0") },
    { name: "buttons declare type", pass: !/<button(?![^>]*type=)/.test(component) && !/<button(?![^>]*type=)/.test(safeState) },
    { name: "no internal dev terms in rendered UI", pass: forbiddenDevTerms.every((term) => !component.includes(term) && !safeState.includes(term) && !page.includes(term)) },
    { name: "no sensitive field names in E3 source", pass: forbiddenSensitiveText.every((keyword) => !source.includes(keyword)) },
    { name: "no NaN Infinity undefined text", pass: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(source) && !/\"(NaN|Infinity|undefined)\"/.test(source) },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
    { name: "E3 data script exists", pass: exists("scripts/private-audit/validate-v05e3-tracked-product-board-data.ts") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e3-tracked-product-board-ui",
    failedChecks,
    page: "/product-board",
    oldLongModulesStopped: checks.find((check) => check.name === "old product long modules not rendered")?.pass ?? false,
    storeBoardTrackedBoundary: checks.find((check) => check.name === "Store Board links only tracked products to Product Board")?.pass ?? false,
    seriesBoardTrackedBoundary: checks.find((check) => check.name === "Series Board links only tracked products to Product Board")?.pass ?? false,
    checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
