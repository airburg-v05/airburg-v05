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
  const page = read("app/(workspace)/series-board/page.tsx");
  const component = read("components/series-board/v05/series-board-command-center.tsx");
  const safeState = read("components/series-board/v05/series-board-safe-state.tsx");
  const runtime = read("lib/v05/series-board/browser-runtime.ts");
  const viewModel = read("lib/v05/series-board/build-view-model.ts");
  const metrics = read("lib/v05/series-board/metrics.ts");
  const targets = read("lib/v05/series-board/targets.ts");
  const dateRange = read("lib/v05/series-board/date-range.ts");
  const storeBoard = read("components/store-board/v05/store-board-command-center.tsx");
  const packageJson = read("package.json");
  const source = [page, component, safeState, runtime, viewModel, metrics, targets, dateRange].join("\n");

  const oldLongModules = [
    "SeriesGroupManager",
    "SeriesCurrentSummary",
    "SeriesTrendSection",
    "SeriesMetricGrid",
    "SeriesProductTable",
    "SeriesTargetDiagnostics",
    "系列看板说明",
    "新建 / 编辑系列",
  ];

  const checks: Check[] = [
    { name: "/series-board route uses E2 command center", pass: page.includes("SeriesBoardCommandCenter") },
    { name: "V2 runtime uses public persistence adapter", pass: runtime.includes("IndexedDbV2PersistenceStore.open") && !runtime.includes("indexedDB.open") },
    { name: "legacy fallback is default-store scoped", pass: runtime.includes("isLegacyDefaultSeriesRequest") && runtime.includes("DEFAULT_TMALL_STORE_ID") },
    { name: "page does not write storage", pass: !page.includes("localStorage.setItem") && !runtime.includes("localStorage.setItem") },
    { name: "page does not auto migrate", pass: !source.includes("runLegacyStorageV2") && !source.includes("migrate") },
    { name: "active SeriesRecord only", pass: viewModel.includes("item.status === \"active\"") && dateRange.includes("series.status === \"active\"") },
    { name: "invalid store safe state", pass: viewModel.includes("invalid_store") && component.includes("返回店铺看板") },
    { name: "invalid series safe state", pass: viewModel.includes("invalid_series") && viewModel.includes("当前系列不存在") },
    { name: "no series state exists", pass: viewModel.includes("no_series") && viewModel.includes("当前店铺还没有启用的系列") },
    { name: "empty series state exists", pass: viewModel.includes("empty_series") && viewModel.includes("当前系列尚未添加商品") },
    { name: "platform/store controls exist", pass: component.includes("series-board-platform-select") && component.includes("series-board-store-select") },
    { name: "series selector exists", pass: component.includes("series-board-series-select") && component.includes("系列") },
    { name: "manage series link exists", pass: component.includes("管理系列") && component.includes("manageSeriesHref") },
    { name: "period controls accessible", pass: component.includes("aria-pressed") && component.includes("日") && component.includes("周") && component.includes("月") && component.includes("自定义") },
    { name: "custom date labels exist", pass: component.includes("起始日期") && component.includes("结束日期") && component.includes("type=\"date\"") },
    { name: "six metric cards capped", pass: component.includes("viewModel.metrics.slice(0, 6)") },
    { name: "target summary read only", pass: component.includes("只展示当前系列可匹配当前周期的只读目标") && component.includes("当前周期暂无系列目标") },
    { name: "main trend is single svg", pass: (component.match(/<svg/g) ?? []).length === 1 },
    { name: "trend tabs accessible", pass: component.includes("role=\"tablist\"") && component.includes("role=\"tab\"") && component.includes("aria-selected") },
    { name: "product list exists", pass: component.includes("系列商品组成") && component.includes("productRows") },
    { name: "default Product Board link retained", pass: metrics.includes("productBoardHref") && metrics.includes("/product-board?") },
    { name: "non-default Product Board stays disabled", pass: component.includes("商品看板待升级") && component.includes("disabled") },
    { name: "ad-only product status retained", pass: metrics.includes("ad_only") && component.includes("仅推广数据") },
    { name: "ad plan is not used for product promotion", pass: !metrics.includes("adPlanFacts") && !viewModel.includes("adPlanFacts") },
    { name: "Store Board non-default series entry open", pass: storeBoard.includes("!isProduct") && storeBoard.includes("/series-board?") },
    { name: "Store Board non-default product entry still disabled", pass: storeBoard.includes("商品看板待升级") && storeBoard.includes("context.isDefaultLegacyStore || !isProduct") },
    { name: "old long modules not rendered", pass: oldLongModules.every((name) => !page.includes(name)) },
    { name: "390px overflow guarded", pass: component.includes("overflow-x-auto") && component.includes("max-w-full") && component.includes("min-w-0") },
    { name: "buttons declare type", pass: !/<button(?![^>]*type=)/.test(component) && !/<button(?![^>]*type=)/.test(safeState) },
    { name: "no internal dev terms in rendered UI", pass: forbiddenDevTerms.every((term) => !component.includes(term) && !safeState.includes(term) && !page.includes(term)) },
    { name: "no sensitive field names in E2 source", pass: forbiddenSensitiveText.every((keyword) => !source.includes(keyword)) },
    { name: "no NaN Infinity undefined text", pass: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(source) && !/\"(NaN|Infinity|undefined)\"/.test(source) },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
    { name: "E2 data script exists", pass: exists("scripts/private-audit/validate-v05e2-series-board-data.ts") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e2-series-board-ui",
    failedChecks,
    page: "/series-board",
    storeBoardSeriesEntryOpened: checks.find((check) => check.name === "Store Board non-default series entry open")?.pass ?? false,
    checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
