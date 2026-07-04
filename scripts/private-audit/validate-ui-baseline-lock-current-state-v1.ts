import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface MatrixRow {
  problemId: string;
  currentStatus: string;
}

const ROOT = process.cwd();

const checks: Check[] = [];

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

const currentTaskDeclaredFiles = [
  "AGENTS.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "scripts/private-audit/validate-project-execution-guardrails-current-state-v1.ts",
  "scripts/private-audit/validate-ui-baseline-lock-current-state-v1.ts",
] as const;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

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

const parseMatrixRows = (source: string): MatrixRow[] =>
  source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\| PVM2-\d+ \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        problemId: cells[0] ?? "",
        currentStatus: cells[4] ?? "",
      };
    });

const forbiddenTaskPathPatterns = [
  /^app\//,
  /^components\//,
  /^lib\/etl\//,
  /^lib\/bi\//,
  /^lib\/persistence\//,
  /^lib\/state\//,
  /^lib\/storage\//,
  /^lib\/tmall\//,
  /^lib\/v05\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vercel\.json$/,
  /^\.vercel\//,
  /^private-samples\//,
  /\.(?:xls|xlsx|csv)$/i,
];

const forbiddenChangedPaths = (paths: string[]): string[] =>
  paths.filter(
    (filePath) =>
      filePath === "package.json" ||
      filePath === "package-lock.json" ||
      filePath === "vercel.json" ||
      filePath.startsWith(".vercel/") ||
      filePath.startsWith("private-samples/") ||
      filePath.startsWith("lib/storage/") ||
      filePath.startsWith("lib/tmall/") ||
      filePath.startsWith("lib/v05/") ||
      /\.(?:xls|xlsx|csv)$/i.test(filePath),
  );

const run = () => {
  const uiLockPath = "docs/UI_BASELINE_LOCK_V2.md";
  addCheck("docs/UI_BASELINE_LOCK_V2.md exists", exists(uiLockPath));

  const uiLock = read(uiLockPath);
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");

  addCheck(
    "UI_BASELINE_LOCK_V2 records full KPI grid baseline name",
    uiLock.includes("页面问题梳理第二版 · 全量 KPI 卡片网格基线"),
  );
  addCheck("UI_BASELINE_LOCK_V2 records PUBLIC_DEPLOYED true", uiLock.includes("PUBLIC_DEPLOYED = true"));
  addCheck("UI_BASELINE_LOCK_V2 records SERVER_ALIGNED true", uiLock.includes("SERVER_ALIGNED = true"));
  addCheck(
    "UI_BASELINE_LOCK_V2 records human review pass",
    uiLock.includes("HUMAN_REVIEW_PASS = true") &&
      uiLock.includes("PAGE_PROBLEM_V1_V2_LAYOUT_PUBLIC_HUMAN_REVIEW_ACCEPTANCE_NOTE") &&
      uiLock.includes("人工核查通过"),
  );

  ["L1", "L2", "L3", "L4"].forEach((token) => {
    addCheck(`UI_BASELINE_LOCK_V2 forbids ${token}`, uiLock.includes(token));
  });
  ["Primary", "Secondary", "Hidden"].forEach((token) => {
    addCheck(`UI_BASELINE_LOCK_V2 forbids ${token}`, uiLock.includes(token));
  });
  addCheck("UI_BASELINE_LOCK_V2 forbids Hidden KPI chip", uiLock.includes("Hidden KPI chip"));
  addCheck(
    "UI_BASELINE_LOCK_V2 forbids 5 KPI compressed version",
    uiLock.includes("用 5 个主 KPI 替代全量 KPI 网格") || uiLock.includes("5 KPI"),
  );

  addCheck("UI_BASELINE_LOCK_V2 requires home KPI >= 15", uiLock.includes("KPI 数量 `>= 15`"));
  addCheck("UI_BASELINE_LOCK_V2 records home current KPI 17", uiLock.includes("当前为 `17`"));
  addCheck(
    "UI_BASELINE_LOCK_V2 requires series store product KPI >= 15",
    ["### 系列看板", "### 店铺看板", "### 宝贝看板"].every((section) => uiLock.includes(section)) &&
      (uiLock.match(/KPI 数量 `>= 15`/g)?.length ?? 0) >= 4,
  );
  ["当前值", "MTD目标", "总目标", "差值", "完成率", "进度条"].forEach((field) => {
    addCheck(`UI_BASELINE_LOCK_V2 includes KPI five-field layout:${field}`, uiLock.includes(field));
  });
  addCheck(
    "UI_BASELINE_LOCK_V2 says derived unsupported KPI are not hidden",
    uiLock.includes("`derived` / `unsupported` 对应 KPI 不隐藏") &&
      uiLock.includes("将 `derived` / `unsupported` KPI 从主网格隐藏"),
  );

  const rows = parseMatrixRows(problemMatrix);
  const problemStatusDetails = requiredProblemIds.map((problemId) => {
    const row = rows.find((item) => item.problemId === problemId);
    return {
      problemId,
      hasRow: Boolean(row),
      currentStatus: row?.currentStatus ?? null,
      statusOk: row?.currentStatus === "human_review_pass",
    };
  });
  addCheck(
    "PAGE_PROBLEM_MATRIX_V2 required problemIds are human_review_pass",
    problemStatusDetails.every((item) => item.hasRow && item.statusOk),
    problemStatusDetails,
  );

  addCheck(
    "PROJECT_CURRENT_STATE records UI baseline public deployed server aligned human reviewed",
    projectState.includes("docs/UI_BASELINE_LOCK_V2.md") &&
      projectState.includes("PUBLIC_DEPLOYED = true") &&
      projectState.includes("SERVER_ALIGNED = true") &&
      projectState.includes("HUMAN_REVIEW_PASS = true") &&
      projectState.includes("Page Problem V1/V2 layout public human review"),
  );

  addCheck(
    "current-state validator does not expect local-only flags",
    !uiLock.includes("PUBLIC_DEPLOYED = false") &&
      !uiLock.includes("SERVER_ALIGNED = false") &&
      !problemMatrix.includes("local_pass_waiting_public_deploy | 保持当前基线"),
  );

  const disallowedTaskFiles = currentTaskDeclaredFiles.filter((filePath) =>
    forbiddenTaskPathPatterns.some((pattern) => pattern.test(filePath)),
  );
  addCheck("current task declared files exclude business code", disallowedTaskFiles.length === 0, {
    currentTaskDeclaredFiles,
    disallowedTaskFiles,
  });

  const forbiddenChanges = forbiddenChangedPaths(gitStatusPaths());
  addCheck("package/vercel/storage/tmall/v05 and real sample changes are absent", forbiddenChanges.length === 0, {
    forbiddenChanges,
  });
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
  validator: "validate-ui-baseline-lock-current-state-v1",
  checks,
  failed: checks.filter((check) => !check.pass),
};

console.log(JSON.stringify(output, null, 2));
console.log(`UI_BASELINE_LOCK_CURRENT_STATE_V1_STATUS: ${status}`);

process.exit(status === "PASS" ? 0 : 1);
