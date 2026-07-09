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
const BLUEPRINT_PATH = "docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md";
const VALIDATOR_PATH = "scripts/private-audit/validate-airburg-saas-product-ui-blueprint-v2.ts";

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const includesAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

const gitStatusPaths = (): string[] =>
  execFileSync("git", ["status", "--porcelain", "-uall"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
    });

const forbiddenChangedPaths = (paths: string[]): string[] =>
  paths.filter(
    (filePath) =>
      filePath.startsWith("app/") ||
      filePath.startsWith("components/") ||
      filePath.startsWith("lib/") ||
      filePath === "package.json" ||
      filePath === "package-lock.json" ||
      filePath === "vercel.json" ||
      filePath.startsWith(".vercel/") ||
      filePath.startsWith("private-samples/") ||
      /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath),
  );

const expectedChangedFiles = [BLUEPRINT_PATH, VALIDATOR_PATH];

const requiredSections = [
  "产品定位",
  "用户对象",
  "SaaS 租户模型",
  "账号多品牌模型",
  "品牌别名组",
  "默认店铺单品牌策略",
  "Brand / Platform / Store / Series / Product / Keyword 数据模型",
  "首页品牌经营驾驶舱",
  "首页 17 指标展示、勾选、排序",
  "首页重点系列 GSV 模块",
  "系列中心",
  "店铺经营中心",
  "商品经营中心",
  "商品排除中心",
  "多文本排除和数据源可用性",
  "品牌词支付占比",
  "品牌搜索资产",
  "目标中心",
  "MTD 自然日线性",
  "时间系统：日 / 周 / 月 / 最长 1 年自定义 / 同比 / 环比",
  "MTD / DLY 图表",
  "双指标图表可比性规则",
  "上传自动识别 + 标准模板兜底",
  "数据覆盖健康中心",
  "AI 顾问延期",
  "V2 路由规划",
  "开源模板使用原则",
  "Codex 实施边界",
  "旧 UI legacy 策略",
  "后续实施阶段",
];

const requiredRoutes = [
  "/v2/home",
  "/v2/store-board",
  "/v2/series-board",
  "/v2/product-board",
  "/v2/upload",
  "/v2/data-health",
  "/v2/target-center",
  "/v2/search-assets",
  "/v2/exclusion-rules",
];

const requiredRouteFiles = [
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

const requiredMetrics = [
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

const requiredGuardSources = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/data-integrity-agent.md",
  "docs/agents/bi-semantic-agent.md",
  "docs/agents/target-agent.md",
  "docs/agents/deploy-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-data-integrity-skill.md",
  "docs/skills/airburg-deploy-skill.md",
  "docs/skills/airburg-regression-skill.md",
];

const run = () => {
  addCheck(`${BLUEPRINT_PATH} exists`, exists(BLUEPRINT_PATH));
  addCheck(`${VALIDATOR_PATH} exists`, exists(VALIDATOR_PATH));

  const blueprint = read(BLUEPRINT_PATH);

  addCheck("rebased task name present", blueprint.includes("AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_REBASE_FROM_LATEST_RULES"));
  addCheck("clarification patch task name present", blueprint.includes("AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_CLARIFICATION_PATCH_AND_UI_DESIGN_AUTHORITY_LOCK"));
  addCheck(
    "master task sources present",
    includesAll(blueprint, [
      "AIRBURG_SAAS_UI_V2_PAGE_LEVEL_PRODUCT_BLUEPRINT_AND_IMPLEMENTATION_PIPELINE",
      "AIRBURG_SAAS_UI_V2_PLUGIN_ASSISTED_PRODUCT_DESIGN_AND_IMPLEMENTATION_PIPELINE",
    ]),
  );
  addCheck("all guard sources listed", includesAll(blueprint, requiredGuardSources));
  addCheck("all required sections present", includesAll(blueprint, requiredSections), {
    missing: requiredSections.filter((section) => !blueprint.includes(section)),
  });
  addCheck("all V2 routes present", includesAll(blueprint, requiredRoutes), {
    missing: requiredRoutes.filter((route) => !blueprint.includes(route)),
  });
  addCheck("all actual Next route files present", includesAll(blueprint, requiredRouteFiles), {
    missing: requiredRouteFiles.filter((routeFile) => !blueprint.includes(routeFile)),
  });
  addCheck("all 17 home metrics present", includesAll(blueprint, requiredMetrics), {
    missing: requiredMetrics.filter((metric) => !blueprint.includes(metric)),
  });
  addCheck("multi-platform SaaS positioning present", includesAll(blueprint, ["multi-platform ecommerce operating analysis SaaS", "Tmall", "JD", "Douyin", "Youzan", "Pinduoduo"]));
  addCheck("tenant account multi-brand model present", includesAll(blueprint, ["Tenant", "multiple brands", "one store belongs to one brand"]));
  addCheck("StoreBrandBinding and ProductBrandBinding reserved", includesAll(blueprint, ["StoreBrandBinding", "ProductBrandBinding", "must not implement a new persistence schema or ETL branch"]));
  addCheck("Airburg alias group present", includesAll(blueprint, ["空气堡", "Airburg", "AIRBURG"]));
  addCheck("series stable identity rule present", includesAll(blueprint, ["platformCode", "brandId", "storeId", "seriesId", "seriesName", "productIds"]));
  addCheck("productId-first rule present", blueprint.includes("productId-first"));
  addCheck("unsupported data source wording present", blueprint.includes("当前数据源不支持该过滤"));
  addCheck("product exclusion scope clarified", includesAll(blueprint, ["Product ID exclusion affects product-level operating data", "Multi-text exclusion only takes effect", "order or remark fields are absent"]));
  addCheck("brand-word paid share formula present", includesAll(blueprint, ["品牌词支付占比 = 品牌词支付人数 / 总搜索词支付人数", "search-keyword paid buyers"]));
  addCheck("target overlay isolation present", includesAll(blueprint, ["Target drafts must not enter runtime dataset", "Targets never change real GMV"]));
  addCheck("MTD natural day formula present", blueprint.includes("MTD target = total target * elapsed days"));
  addCheck("time max one year and comparison present", includesAll(blueprint, ["Max custom range is 1 year", "Year-over-year", "Month-over-month"]));
  addCheck("custom range target missing rules present", includesAll(blueprint, ["Custom target should first accumulate", "If no target covers the selected period, display `--`", "Do not generate target values from nowhere"]));
  addCheck("chart safety rules present", includesAll(blueprint, ["Missing values are not drawn as zero", "No `NaN`, `undefined`, or `Infinity`", "Chart follows current `timeRange` and current scope"]));
  addCheck("upload safety rules present", includesAll(blueprint, ["success / failed / skipped", "standard templates", "rawRows", "previewRows"]));
  addCheck("standard template field contract deliverable present", includesAll(blueprint, ["AIRBURG_STANDARD_TEMPLATE_FIELD_CONTRACT_V1", "required and optional fields", "aliases", "mappings", "missing-field impact"]));
  addCheck("data health requirements present", includesAll(blueprint, ["data coverage calendar", "duplicate upload", "non-computable metrics", "safe issue code"]));
  addCheck("AI advisor explicitly deferred", includesAll(blueprint, ["V2 does not implement AI advisor now", "AI advice"]));
  addCheck("template license audit required", includesAll(blueprint, ["license audit", "shadcn/ui blocks", "Tremor", "TailAdmin", "GPL templates are visual reference only"]));
  addCheck("plugin-assisted design workflow locked", includesAll(blueprint, ["Product Design plugin", "PRODUCT_DESIGN_PLUGIN_UNAVAILABLE", "Build Web Apps plugin", "BUILD_WEB_APPS_PLUGIN_UNAVAILABLE", "Vercel plugin"]));
  addCheck("template selection stage present", includesAll(blueprint, ["AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN", "APPROVE_TEMPLATE_SELECTION_V2", "Do not create V2 shell until"]));
  addCheck("no dependency/package approval rule present", includesAll(blueprint, ["Do not add dependencies without user confirmation", "Do not modify `package.json` without user confirmation"]));
  addCheck("legacy strategy present", includesAll(blueprint, ["Legacy V1 remains the public safety baseline", "Do not replace legacy routes"]));
  addCheck("forbids old wrong abstractions", includesAll(blueprint, ["L1/L2/L3/L4", "Primary/Secondary/Hidden", "Hidden KPI", "5 KPI compression"]));
  addCheck("UI Design Authority Lock present", includesAll(blueprint, ["UI Design Authority Lock", "Codex does not own UI design decisions", "Codex cannot autonomously decide page layout", "Codex cannot autonomously choose templates"]));
  addCheck("percent target format rule present", includesAll(blueprint, ["Input may accept `92`, `92%`, or `0.92`", "UI must display these consistently as `92%`", "UI must not display `9.200%`"]));
  addCheck("approval tokens present", includesAll(blueprint, [
    "APPROVE_BLUEPRINT_V2",
    "APPROVE_PRODUCT_DESIGN_PROTOTYPE_V2",
    "APPROVE_TEMPLATE_AUDIT_V2",
    "APPROVE_TEMPLATE_SELECTION_V2",
    "APPROVE_UI_SHELL_V2",
    "APPROVE_HOME_V2",
    "APPROVE_SERIES_V2",
    "APPROVE_STORE_V2",
    "APPROVE_PRODUCT_V2",
    "APPROVE_UPLOAD_DATA_HEALTH_V2",
    "APPROVE_TARGET_CENTER_V2",
    "APPROVE_SEARCH_ASSETS_EXCLUSION_V2",
    "APPROVE_V2_LOCAL_REGRESSION",
    "APPROVE_DEPLOY_V2_PREVIEW",
  ]));
  addCheck("deploy preview approval gate present", includesAll(blueprint, ["V2 local full regression cannot auto-deploy", "Preview deployment requires explicit `APPROVE_DEPLOY_V2_PREVIEW`"]));
  addCheck("explicit stop rule present", blueprint.includes("No confirmation token, no next stage"));

  const changedFiles = gitStatusPaths();
  const unexpectedChanged = changedFiles.filter((filePath) => !expectedChangedFiles.includes(filePath));
  const missingExpectedChange = expectedChangedFiles.filter((filePath) => !changedFiles.includes(filePath));
  const forbiddenChanges = forbiddenChangedPaths(changedFiles);

  addCheck("only blueprint and validator changed", unexpectedChanged.length === 0 && missingExpectedChange.length === 0, {
    changedFiles,
    unexpectedChanged,
    missingExpectedChange,
  });
  addCheck("no business code modified", forbiddenChanges.length === 0, { forbiddenChanges });
  addCheck("package/vercel/storage/tmall/v05 untouched", !changedFiles.some((filePath) =>
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "vercel.json" ||
    filePath.startsWith(".vercel/") ||
    filePath.startsWith("lib/storage/") ||
    filePath.startsWith("lib/tmall/") ||
    filePath.startsWith("lib/v05/"),
  ));
};

let status: Status = "PASS";

try {
  run();
  if (checks.some((check) => !check.pass)) status = "FAIL";
} catch (error) {
  status = "FAIL";
  addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
}

const output = {
  status,
  task: "AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_CLARIFICATION_PATCH_AND_UI_DESIGN_AUTHORITY_LOCK",
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (status !== "PASS") {
  process.exit(1);
}

console.log("AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_CLARIFICATION_PATCH_VALIDATOR_STATUS: PASS");
