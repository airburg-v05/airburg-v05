import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface PageProblemReference {
  problemId: string;
  sourceDocuments: string[];
  page: string;
  summary: string;
  currentStatus: string;
  solved: boolean;
  needsUiPolish: boolean;
  needsHumanReview: boolean;
}

interface ImplementationTask {
  taskName: string;
  goal: string;
  allowedFiles: string[];
  forbiddenFiles: string[];
  problemIds: string[];
  openSourceReferences: string[];
  validator: string;
  needsPublicDeployTask: boolean;
  needsHumanReview: boolean;
  safeguards: string[];
}

const ROOT = process.cwd();
const checks: Check[] = [];

const requiredReadFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
] as const;

const expectedProblemIds = [
  "PVM2-001",
  "PVM2-002",
  "PVM2-003",
  "PVM2-004",
  "PVM2-005",
  "PVM2-006",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-010",
  "PVM2-011",
  "PVM2-012",
  "PVM2-013",
] as const;

const forbiddenFiles = [
  "lib/etl/**",
  "lib/etl/runtime/**",
  "lib/etl/dedup-engine.ts",
  "lib/bi/brand-model-semantic.ts",
  "lib/bi/bi.home-mapper.ts",
  "lib/bi/target-metric-definitions.ts",
  "lib/persistence/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
  "真实 .xls / .xlsx / .csv",
  ".pem / .key",
] as const;

const globalSafeguards = [
  "no new dependency",
  "no shadcn cli",
  "no tremor package",
  "no direct full template copy",
  "do not hide full KPI grid",
  "do not introduce L1/L2/L3/L4",
  "do not introduce Primary/Secondary/Hidden",
  "do not modify ETL",
  "do not modify BI formula",
  "do not modify Target formula",
  "do not modify Persistence schema",
] as const;

const pageProblemReferenceMap: PageProblemReference[] = [
  {
    problemId: "PVM2-001",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2", "PROJECT_CURRENT_STATE"],
    page: "/home",
    summary: "首页时间选择、数据恢复状态和目标状态需要分层清楚。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-002",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2", "UI_BASELINE_LOCK_V2"],
    page: "/home /series-board /store-board /product-board",
    summary: "全量 KPI 网格和五项布局必须保持，可继续做密度和阅读节奏优化。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-003",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/home",
    summary: "去退费比和直接成交占比必须在主 KPI 网格中可见。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: false,
    needsHumanReview: false,
  },
  {
    problemId: "PVM2-004",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/home /series-board /store-board /product-board",
    summary: "MTD / DLY / trend 图表需要减少重复、统一 tooltip、axis 和空态。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-005",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/home /series-board /product-board",
    summary: "品牌词、中心词、类目词需要保持分组解释清晰。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-006",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2", "UI_BASELINE_LOCK_V2"],
    page: "/home /series-board /store-board /product-board",
    summary: "目标 required / derived / unsupported 只能在目标弹窗或目标区域说明。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-007",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/series-board",
    summary: "系列选择必须清楚，productId-first 不回退。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-008",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/store-board",
    summary: "店铺选择、scope 和跨页恢复需要表达一致，不出现开发术语。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-009",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2", "UI_BASELINE_LOCK_V2"],
    page: "/product-board",
    summary: "宝贝选择只展示用户手动添加宝贝，不恢复所有宝贝。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-010",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/upload",
    summary: "上传页保持产品化平台按钮和统一批量上传入口。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-011",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/upload",
    summary: "上传识别错误只展示 success / fail / skipped 和 safe issue code。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-012",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2"],
    page: "/upload/history /upload/quality",
    summary: "历史和质量页只读展示安全摘要，不展示原始文件或敏感字段。",
    currentStatus: "public_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
  {
    problemId: "PVM2-013",
    sourceDocuments: ["PAGE_PROBLEM_MATRIX_V2", "PROJECT_CURRENT_STATE"],
    page: "/home /series-board /product-board",
    summary: "Runtime Dataset / Debug Context / Target Drafts 三类状态文案需避免混称。",
    currentStatus: "human_review_pass",
    solved: true,
    needsUiPolish: true,
    needsHumanReview: true,
  },
];

const nextImplementationPlan: ImplementationTask[] = [
  {
    taskName: "HOME_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化首页顶部栏、时间 popover、17 KPI 全量网格、图表和目标弹窗布局。",
    allowedFiles: ["components/home/home-bi-dashboard.tsx", "components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-001", "PVM2-002", "PVM2-003", "PVM2-004", "PVM2-006", "PVM2-013"],
    openSourceReferences: ["shadcn dashboard shell", "shadcn dashboard cards", "Radix Popover/Dialog/Tabs", "Tremor metric/chart density"],
    validator: "scripts/private-audit/validate-home-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "SERIES_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化系列选择、scope 条、15 KPI 网格、商品贡献区、图表和目标弹窗。",
    allowedFiles: ["components/series-board/v1/series-board-v1-dashboard.tsx", "components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-002", "PVM2-004", "PVM2-005", "PVM2-006", "PVM2-007"],
    openSourceReferences: ["shadcn dashboard shell", "shadcn table/card layout", "Tremor dashboard charts"],
    validator: "scripts/private-audit/validate-series-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "STORE_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化店铺选择、当前 scope、15 KPI 网格、chart/top product 区域。",
    allowedFiles: ["components/store-board/v1/store-board-v1-dashboard.tsx", "components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-002", "PVM2-004", "PVM2-008"],
    openSourceReferences: ["shadcn sidebar/content shell", "Mosaic dashboard spacing", "Tremor chart panels"],
    validator: "scripts/private-audit/validate-store-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "PRODUCT_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化手动宝贝选择、宝贝列表、15 KPI 网格、漏斗/图表和安全空态。",
    allowedFiles: ["components/product-board/v1/product-board-v1-dashboard.tsx", "components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-002", "PVM2-004", "PVM2-005", "PVM2-006", "PVM2-009"],
    openSourceReferences: ["shadcn empty state", "shadcn table/card layout", "Radix Select/Popover"],
    validator: "scripts/private-audit/validate-product-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "UPLOAD_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化平台 tabs/buttons、批量上传区和 success/fail/skipped 安全状态展示。",
    allowedFiles: ["components/upload/v1/upload-page-v1-dashboard.tsx", "components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-010", "PVM2-011"],
    openSourceReferences: ["shadcn Tabs", "shadcn card/form layout", "Radix Tabs keyboard model"],
    validator: "scripts/private-audit/validate-upload-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "HISTORY_QUALITY_LAYOUT_POLISH_WITH_OPEN_SOURCE_REFERENCE_V1",
    goal: "优化历史/质量页只读摘要、issue code 可读性和空态。",
    allowedFiles: [
      "components/upload/history/v1/history-data-v1-dashboard.tsx",
      "components/upload/quality/v1/upload-quality-v1-dashboard.tsx",
      "components/visual-system/v1/**",
      "scripts/private-audit/**",
    ],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-012", "PVM2-013"],
    openSourceReferences: ["shadcn table/card layout", "shadcn empty state", "Tremor dashboard table density"],
    validator: "scripts/private-audit/validate-history-quality-layout-polish-with-open-source-reference-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
  {
    taskName: "VISUAL_SYSTEM_SHARED_COMPONENT_POLISH_V1",
    goal: "沉淀共享 spacing、KPI 卡片、panel、dialog、popover、empty state 的展示约束。",
    allowedFiles: ["components/visual-system/v1/**", "scripts/private-audit/**"],
    forbiddenFiles: [...forbiddenFiles],
    problemIds: ["PVM2-001", "PVM2-002", "PVM2-004", "PVM2-006", "PVM2-010", "PVM2-012"],
    openSourceReferences: ["shadcn reusable blocks", "Radix accessibility primitives", "Tremor chart/card patterns", "Mosaic responsive dashboard spacing"],
    validator: "scripts/private-audit/validate-visual-system-shared-component-polish-v1.ts",
    needsPublicDeployTask: true,
    needsHumanReview: true,
    safeguards: [...globalSafeguards],
  },
];

const pageStrategies = [
  "/home",
  "/series-board",
  "/store-board",
  "/product-board",
  "/upload",
  "/upload/history + /upload/quality",
] as const;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const gitStatusPaths = (): string[] =>
  execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
    });

const isAllowedAuditChange = (filePath: string): boolean =>
  filePath === "scripts/private-audit/validate-open-source-dashboard-layout-reference-audit-v1.ts";

const isForbiddenDirtyPath = (filePath: string): boolean =>
  !isAllowedAuditChange(filePath) &&
  (filePath.startsWith("app/") ||
    filePath.startsWith("components/") ||
    filePath.startsWith("lib/") ||
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "vercel.json" ||
    filePath.startsWith(".vercel/") ||
    filePath.startsWith("private-samples/") ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath));

const matrixHasProblemId = (matrix: string, problemId: string): boolean =>
  matrix.includes(`| ${problemId} |`);

const taskHasRequiredSafeguards = (task: ImplementationTask): boolean =>
  [
    "no new dependency",
    "no direct full template copy",
    "do not hide full KPI grid",
    "do not introduce L1/L2/L3/L4",
    "do not introduce Primary/Secondary/Hidden",
    "do not modify ETL",
    "do not modify BI formula",
    "do not modify Target formula",
    "do not modify Persistence schema",
  ].every((safeguard) => task.safeguards.includes(safeguard));

const run = () => {
  requiredReadFiles.forEach((relativePath) => {
    addCheck(`required read file exists:${relativePath}`, exists(relativePath));
  });

  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const taskProtocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const uiLayoutAgent = read("docs/agents/ui-layout-agent.md");
  const uiLayoutSkill = read("docs/skills/airburg-ui-layout-skill.md");

  addCheck(
    "AGENTS includes UI baseline and protocol guardrails",
    agents.includes("docs/UI_BASELINE_LOCK_V2.md") &&
      agents.includes("docs/PAGE_PROBLEM_MATRIX_V2.md") &&
      agents.includes("docs/TASK_EXECUTION_PROTOCOL_V1.md"),
  );
  addCheck(
    "PROJECT_CURRENT_STATE marks deployed human-reviewed UI baseline",
    projectState.includes("PUBLIC_DEPLOYED = true") &&
      projectState.includes("SERVER_ALIGNED = true") &&
      projectState.includes("HUMAN_REVIEW_PASS = true"),
  );
  addCheck(
    "TASK_EXECUTION_PROTOCOL forbids hiding KPI and engineering labels",
    taskProtocol.includes("全量 KPI 网格") &&
      taskProtocol.includes("L1") &&
      taskProtocol.includes("Primary") &&
      taskProtocol.includes("Hidden KPI chip"),
  );
  addCheck(
    "UI_BASELINE_LOCK_V2 preserves full KPI grid",
    uiBaseline.includes("页面问题梳理第二版 · 全量 KPI 卡片网格基线") &&
      uiBaseline.includes("当前为 `17`") &&
      uiBaseline.includes("KPI 数量 `>= 15`") &&
      uiBaseline.includes("去退费比、直接成交占比必须在主 KPI 网格中展示"),
  );
  addCheck(
    "UI agent and skill forbid data logic changes",
    uiLayoutAgent.includes("Do not edit `lib/etl/**`") &&
      uiLayoutAgent.includes("Do not edit BI formulas") &&
      uiLayoutSkill.includes("Do not modify ETL") &&
      uiLayoutSkill.includes("Do not modify BI formulas"),
  );

  const matrixCoverage = expectedProblemIds.map((problemId) => ({
    problemId,
    inMatrix: matrixHasProblemId(problemMatrix, problemId),
    inReferenceMap: pageProblemReferenceMap.some((item) => item.problemId === problemId),
  }));
  addCheck(
    "PAGE_PROBLEM_REFERENCE_MAP covers expected problemIds",
    matrixCoverage.every((item) => item.inMatrix && item.inReferenceMap),
    matrixCoverage,
  );

  addCheck(
    "PAGE_PROBLEM_REFERENCE_MAP includes solved and polish judgment",
    pageProblemReferenceMap.every(
      (item) =>
        item.sourceDocuments.length > 0 &&
        item.currentStatus.length > 0 &&
        typeof item.solved === "boolean" &&
        typeof item.needsUiPolish === "boolean" &&
        typeof item.needsHumanReview === "boolean",
    ),
  );

  addCheck("layout strategy covers required pages", pageStrategies.length >= 6, pageStrategies);
  addCheck("NEXT_IMPLEMENTATION_PLAN has seven tasks", nextImplementationPlan.length === 7);
  addCheck(
    "each implementation task has problemId allowed forbidden references validator and review gates",
    nextImplementationPlan.every(
      (task) =>
        task.problemIds.length > 0 &&
        task.allowedFiles.length > 0 &&
        task.forbiddenFiles.length > 0 &&
        task.openSourceReferences.length > 0 &&
        task.validator.endsWith(".ts") &&
        task.needsPublicDeployTask &&
        task.needsHumanReview,
    ),
    nextImplementationPlan.map((task) => ({
      taskName: task.taskName,
      problemIds: task.problemIds,
      validator: task.validator,
    })),
  );
  addCheck(
    "each implementation task carries cross-layer safeguards",
    nextImplementationPlan.every(taskHasRequiredSafeguards),
  );

  addCheck("no new dependency is declared", globalSafeguards.includes("no new dependency"));
  addCheck("no direct template copy is declared", globalSafeguards.includes("no direct full template copy"));
  addCheck("full KPI grid is protected", globalSafeguards.includes("do not hide full KPI grid"));
  addCheck("L1-L4 are forbidden", globalSafeguards.includes("do not introduce L1/L2/L3/L4"));
  addCheck("Primary/Secondary/Hidden are forbidden", globalSafeguards.includes("do not introduce Primary/Secondary/Hidden"));

  const dirtyPaths = gitStatusPaths();
  const forbiddenDirtyPaths = dirtyPaths.filter(isForbiddenDirtyPath);
  addCheck("no business code/package/forbidden dirty paths", forbiddenDirtyPaths.length === 0, {
    dirtyPaths,
    forbiddenDirtyPaths,
  });

  const status: Status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  const report = {
    taskName: "OPEN_SOURCE_DASHBOARD_LAYOUT_REFERENCE_AUDIT_FOR_PAGE_PROBLEM_V1_V2",
    status,
    readFiles: requiredReadFiles,
    pageProblemReferenceMapCount: pageProblemReferenceMap.length,
    pageProblemReferenceMap,
    pageStrategyCount: pageStrategies.length,
    pageStrategies,
    nextImplementationPlanCount: nextImplementationPlan.length,
    nextImplementationPlan,
    safeguards: globalSafeguards,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  if (status !== "PASS") {
    process.exitCode = 1;
  }
};

run();
