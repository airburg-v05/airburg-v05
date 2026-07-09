import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

const branch = git(["branch", "--show-current"]).trim();
assert(branch === "feature/saas-ui-v2-shell", `unexpected branch: ${branch}`);

const evidenceFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md",
  "docs/product-blueprint-v2/PLUGIN_AVAILABILITY_REPORT_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/PRODUCT_DESIGN_PROTOTYPE_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PREPLAN.md",
  "docs/product-blueprint-v2/AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN.md",
];

for (const file of evidenceFiles) {
  assert(existsSync(path.join(root, file)), `missing evidence file: ${file}`);
}

const requiredRoutes = [
  "app/(workspace-v2)/v2/home/page.tsx",
  "app/(workspace-v2)/v2/store-board/page.tsx",
  "app/(workspace-v2)/v2/series-board/page.tsx",
  "app/(workspace-v2)/v2/product-board/page.tsx",
  "app/(workspace-v2)/v2/upload/page.tsx",
  "app/(workspace-v2)/v2/data-health/page.tsx",
  "app/(workspace-v2)/v2/target-center/page.tsx",
  "app/(workspace-v2)/v2/search-assets/page.tsx",
  "app/(workspace-v2)/v2/exclusion-rules/page.tsx",
];

for (const file of requiredRoutes) {
  assert(existsSync(path.join(root, file)), `missing route: ${file}`);
}

const requiredComponents = [
  "components/saas-v2/layout/saas-v2-shell.tsx",
  "components/saas-v2/layout/saas-v2-sidebar.tsx",
  "components/saas-v2/layout/saas-v2-topbar.tsx",
  "components/saas-v2/layout/saas-v2-page-header.tsx",
  "components/saas-v2/controls/brand-scope-control.tsx",
  "components/saas-v2/controls/platform-store-scope-control.tsx",
  "components/saas-v2/controls/time-range-control.tsx",
  "components/saas-v2/controls/compare-mode-control.tsx",
  "components/saas-v2/cards/metric-card-v2.tsx",
  "components/saas-v2/cards/metric-grid-v2.tsx",
  "components/saas-v2/cards/key-series-gsv-card.tsx",
  "components/saas-v2/cards/data-health-summary-card.tsx",
  "components/saas-v2/charts/chart-panel-v2.tsx",
  "components/saas-v2/charts/dual-metric-compare-control.tsx",
  "components/saas-v2/tables/data-table-v2.tsx",
  "components/saas-v2/empty/safe-empty-state.tsx",
  "components/saas-v2/badges/safe-issue-code-badge.tsx",
  "components/saas-v2/data.ts",
];

for (const file of requiredComponents) {
  assert(existsSync(path.join(root, file)), `missing component: ${file}`);
}

const data = read("components/saas-v2/data.ts");
const metricNames = [
  "GMV",
  "GSV",
  "投入产出比",
  "去退费比",
  "直接成交占比",
  "品牌词访客",
  "品牌词支付人数",
  "品牌词支付占比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "客单价",
  "转化率",
  "推广花费",
  "推广点击单价",
  "MTD周转",
  "同区履约率",
];

for (const metric of metricNames) {
  assert(data.includes(metric), `/v2/home missing metric: ${metric}`);
}

const home = read("app/(workspace-v2)/v2/home/page.tsx");
assert(home.includes("勾选显示"), "home missing metric visibility entry");
assert(home.includes("自主排序"), "home missing metric sorting entry");
assert(home.includes("KeySeriesGsvCard"), "home missing key series GSV module");
assert(home.includes("ChartPanelV2"), "home missing MTD/DLY chart panel");
assert(home.includes("recommendedMetricPairs"), "home missing dual metric comparison entry");

const series = read("app/(workspace-v2)/v2/series-board/page.tsx");
for (const token of ["系列列表", "新建系列", "编辑系列", "商品 ID"]) {
  assert(series.includes(token), `series page missing ${token}`);
}

const upload = read("app/(workspace-v2)/v2/upload/page.tsx");
for (const token of ["自动识别", "标准模板", "success", "failed", "skipped"]) {
  assert(upload.includes(token) || data.includes(token), `upload page missing ${token}`);
}

const health = read("app/(workspace-v2)/v2/data-health/page.tsx");
for (const token of ["数据覆盖日历", "缺失", "重复", "skipped", "不可计算"]) {
  assert(health.includes(token) || data.includes(token), `data health page missing ${token}`);
}

const target = read("app/(workspace-v2)/v2/target-center/page.tsx");
for (const token of ["品牌目标", "平台目标", "店铺目标", "系列目标", "商品目标"]) {
  assert(target.includes(token) || data.includes(token), `target center missing ${token}`);
}

const searchAssets = read("app/(workspace-v2)/v2/search-assets/page.tsx");
for (const token of ["品牌别名", "品牌词支付占比"]) {
  assert(searchAssets.includes(token), `search assets missing ${token}`);
}

const exclusion = read("app/(workspace-v2)/v2/exclusion-rules/page.tsx");
for (const token of ["商品 ID 排除", "多文本排除", "当前数据源不支持该过滤"]) {
  assert(exclusion.includes(token) || data.includes(token), `exclusion rules missing ${token}`);
}

const workspaceV2Status = git(["status", "--porcelain", "-uall", "--", "app/(workspace-v2)", "components/saas-v2"]);
assert(workspaceV2Status.trim().length > 0, "expected V2 workspace files in git status");

const forbiddenLegacyStatus = git([
  "status",
  "--porcelain",
  "-uall",
  "--",
  "app/(workspace)",
  "components/home",
  "components/series-board",
  "components/store-board",
  "components/product-board",
  "components/upload",
  "components/visual-system",
  "lib/etl",
  "lib/bi",
  "lib/persistence",
  "lib/state",
  "lib/storage",
  "lib/tmall",
  "lib/v05",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel",
  "private-samples",
]);

assert(forbiddenLegacyStatus.trim().length === 0, `forbidden changes detected:\n${forbiddenLegacyStatus}`);

const combined = [
  ...requiredRoutes.map(read),
  ...requiredComponents.map(read),
].join("\n");

const forbiddenText = [
  "L1",
  "L2",
  "L3",
  "L4",
  "Primary",
  "Secondary",
  "Hidden KPI",
  "StoreRecord",
  "ProductRecord",
  "TrackedProductRecord",
  "rawRows",
  "previewRows",
  "NaN",
  "Infinity",
  "undefined",
  "所有宝贝",
];

const forbiddenHits = forbiddenText.filter((token) => combined.includes(token));
assert(forbiddenHits.length === 0, `forbidden UI text found: ${forbiddenHits.join(", ")}`);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      branch,
      routes: requiredRoutes.length,
      components: requiredComponents.length,
      homeMetrics: metricNames.length,
      forbiddenLegacyChanges: 0,
      forbiddenTextHits: 0,
      nextRequiredExternalChecks: ["npm run lint", "npm run build", "browser local route QA"],
    },
    null,
    2,
  ),
);
