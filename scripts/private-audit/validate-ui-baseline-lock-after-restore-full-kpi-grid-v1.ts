import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Check = {
  name: string;
  pass: boolean;
  details?: unknown;
};

const repoRoot = process.cwd();
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(repoRoot, relativePath));

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const runCommand = (command: string, args: string[]): { pass: boolean; summary: string } => {
  try {
    execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { pass: true, summary: `${command} ${args.join(" ")} PASS` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { pass: false, summary: message.slice(0, 2000) };
  }
};

const requiredProblemIds = [
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
  "PVM2-013",
] as const;

const taskDeclaredFiles = [
  "AGENTS.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "scripts/private-audit/validate-ui-baseline-lock-after-restore-full-kpi-grid-v1.ts",
] as const;

const forbiddenTaskPathPatterns = [
  /^app\//,
  /^components\//,
  /^lib\/etl\//,
  /^lib\/bi\//,
  /^lib\/persistence\//,
  /^lib\/storage\//,
  /^lib\/tmall\//,
  /^lib\/v05\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vercel\.json$/,
  /^\.vercel\//,
  /^private-samples\//,
];

const uiLockPath = "docs/UI_BASELINE_LOCK_V2.md";
addCheck("docs/UI_BASELINE_LOCK_V2.md exists", exists(uiLockPath));

const uiLock = exists(uiLockPath) ? read(uiLockPath) : "";
const projectState = read("docs/PROJECT_CURRENT_STATE.md");
const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
const taskProtocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
const agents = read("AGENTS.md");

addCheck(
  "UI_BASELINE_LOCK_V2 contains baseline name",
  uiLock.includes("页面问题梳理第二版 · 全量 KPI 卡片网格基线"),
);
addCheck("UI_BASELINE_LOCK_V2 marks LOCAL_VALIDATED", uiLock.includes("LOCAL_VALIDATED"));
addCheck("UI_BASELINE_LOCK_V2 marks PUBLIC_DEPLOYED false", uiLock.includes("PUBLIC_DEPLOYED = false"));
addCheck("UI_BASELINE_LOCK_V2 marks SERVER_ALIGNED false", uiLock.includes("SERVER_ALIGNED = false"));
addCheck("UI_BASELINE_LOCK_V2 states home KPI >= 15", uiLock.includes("KPI 数量 `>= 15`"));
addCheck("UI_BASELINE_LOCK_V2 states home current KPI 17", uiLock.includes("当前为 `17`"));
addCheck(
  "UI_BASELINE_LOCK_V2 states series store product KPI >= 15",
  ["### 系列看板", "### 店铺看板", "### 宝贝看板"].every((section) => uiLock.includes(section)) &&
    (uiLock.match(/KPI 数量 `>= 15`/g)?.length ?? 0) >= 4,
);
addCheck("UI_BASELINE_LOCK_V2 forbids L1-L4", ["L1", "L2", "L3", "L4"].every((token) => uiLock.includes(token)));
addCheck(
  "UI_BASELINE_LOCK_V2 forbids Primary Secondary Hidden",
  ["Primary", "Secondary", "Hidden"].every((token) => uiLock.includes(token)),
);
addCheck("UI_BASELINE_LOCK_V2 forbids Hidden KPI chip", uiLock.includes("Hidden KPI chip"));
addCheck(
  "UI_BASELINE_LOCK_V2 forbids hiding derived unsupported KPI",
  uiLock.includes("将 `derived` / `unsupported` KPI 从主网格隐藏") &&
    uiLock.includes("`derived` / `unsupported` 对应 KPI 不隐藏"),
);

addCheck(
  "PROJECT_CURRENT_STATE references UI_BASELINE_LOCK_V2",
  projectState.includes("docs/UI_BASELINE_LOCK_V2.md") &&
    projectState.includes("RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_V1") &&
    projectState.includes("PUBLIC_DEPLOYED = false") &&
    projectState.includes("SERVER_ALIGNED = false"),
);

const matrixStatusDetails = requiredProblemIds.map((problemId) => {
  const row = problemMatrix
    .split("\n")
    .find((line) => line.startsWith(`| ${problemId} `));
  return {
    problemId,
    hasRow: Boolean(row),
    statusOk: Boolean(row?.includes("| local_pass_waiting_public_deploy |")),
    localValidation: Boolean(row?.includes("local validation = PASS")),
    publicPending: Boolean(row?.includes("public deployment = pending")),
    nextAction: Boolean(row?.includes("deploy full KPI grid baseline to ECS")),
    forbiddenRules: Boolean(
      row?.includes("no ETL change") &&
        row.includes("no BI formula change") &&
        row.includes("no Target formula change") &&
        row.includes("no Persistence schema change") &&
        row.includes("no L1/L2/L3/L4") &&
        row.includes("no Primary/Secondary/Hidden") &&
        row.includes("no Hidden KPI chip"),
    ),
  };
});

addCheck(
  "PAGE_PROBLEM_MATRIX_V2 target problemIds local_pass_waiting_public_deploy",
  matrixStatusDetails.every((item) => item.hasRow && item.statusOk),
  matrixStatusDetails,
);
addCheck(
  "PAGE_PROBLEM_MATRIX_V2 target problemIds contain deployment pending protocol",
  matrixStatusDetails.every((item) => item.localValidation && item.publicPending && item.nextAction && item.forbiddenRules),
  matrixStatusDetails,
);

addCheck(
  "AGENTS.md requires UI tasks read UI_BASELINE_LOCK_V2",
  agents.includes("For every UI task") &&
    agents.includes("docs/UI_BASELINE_LOCK_V2.md") &&
    agents.includes("changes KPI display count") &&
    agents.includes("output `BLOCKED`"),
);
addCheck(
  "TASK_EXECUTION_PROTOCOL requires UI tasks read UI_BASELINE_LOCK_V2",
  taskProtocol.includes("UI 任务必须先读取") &&
    taskProtocol.includes("docs/UI_BASELINE_LOCK_V2.md") &&
    taskProtocol.includes("改变 KPI 展示数量") &&
    taskProtocol.includes("输出 `BLOCKED`"),
);

const forbiddenDeclaredFiles = taskDeclaredFiles.filter((file) =>
  forbiddenTaskPathPatterns.some((pattern) => pattern.test(file)),
);
addCheck("thisTaskDeclaredFilesAreDocsAndPrivateAuditOnly", forbiddenDeclaredFiles.length === 0, {
  taskDeclaredFiles,
  forbiddenDeclaredFiles,
});
addCheck("thisTaskDidNotDeclareAppComponentsLibBusinessCode", forbiddenDeclaredFiles.length === 0, {
  taskDeclaredFiles,
});
addCheck("thisTaskDidNotDeclarePackageVercelStorageTmallV05", forbiddenDeclaredFiles.length === 0, {
  taskDeclaredFiles,
});

const lintResult = runCommand("npm", ["run", "lint"]);
addCheck("npm run lint PASS", lintResult.pass, lintResult.summary);

const buildResult = runCommand("npm", ["run", "build"]);
addCheck("npm run build PASS", buildResult.pass, buildResult.summary);

const failed = checks.filter((check) => !check.pass);
const status = failed.length === 0 ? "PASS" : "FAIL";

console.log(
  JSON.stringify(
    {
      status,
      baseline: "页面问题梳理第二版 · 全量 KPI 卡片网格基线",
      problemIdsUpdated: matrixStatusDetails.filter((item) => item.statusOk).length,
      publicDeployed: false,
      serverAligned: false,
      checks,
      failed,
    },
    null,
    2,
  ),
);
console.log(`UI_BASELINE_LOCK_AFTER_RESTORE_FULL_KPI_GRID_V1_STATUS: ${status}`);

if (failed.length > 0) {
  process.exit(1);
}
