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
  layer: string;
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

const docs = {
  agents: "AGENTS.md",
  projectState: "docs/PROJECT_CURRENT_STATE.md",
  problemMatrix: "docs/PAGE_PROBLEM_MATRIX_V2.md",
  taskProtocol: "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  uiBaseline: "docs/UI_BASELINE_LOCK_V2.md",
};

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const listMarkdownFiles = (relativePath: string): string[] => {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) return [];

  return fs
    .readdirSync(absolutePath)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();
};

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
        layer: cells[3] ?? "",
        currentStatus: cells[4] ?? "",
      };
    });

const forbiddenRuntimePatterns = [
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

const forbiddenPackageAndLegacyChanges = (paths: string[]): string[] =>
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
  Object.entries(docs).forEach(([key, relativePath]) => {
    addCheck(`${key}:exists`, exists(relativePath));
  });

  const agents = read(docs.agents);
  const projectState = read(docs.projectState);
  const problemMatrix = read(docs.problemMatrix);
  const taskProtocol = read(docs.taskProtocol);
  const uiBaseline = read(docs.uiBaseline);

  const agentDocs = listMarkdownFiles("docs/agents");
  const skillDocs = listMarkdownFiles("docs/skills");

  addCheck("docs/agents count >= 9", agentDocs.length >= 9, agentDocs);
  addCheck("docs/skills count >= 5", skillDocs.length >= 5, skillDocs);

  addCheck(
    "PROJECT_CURRENT_STATE marks Tmall V1 internal beta",
    projectState.includes("天猫 V1 内测排查版") && projectState.includes("不是正式多用户生产版"),
  );
  addCheck(
    "PROJECT_CURRENT_STATE records page problem layout human review",
    projectState.includes("Page Problem V1/V2 layout public human review") &&
      projectState.includes("用户已人工核查 7 个公网页面"),
  );
  addCheck(
    "PROJECT_CURRENT_STATE references current UI baseline final state",
    projectState.includes("docs/UI_BASELINE_LOCK_V2.md") &&
      projectState.includes("PUBLIC_DEPLOYED = true") &&
      projectState.includes("SERVER_ALIGNED = true") &&
      projectState.includes("HUMAN_REVIEW_PASS = true"),
  );

  const matrixRows = parseMatrixRows(problemMatrix);
  const problemStatusDetails = requiredProblemIds.map((problemId) => {
    const row = matrixRows.find((item) => item.problemId === problemId);
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

  [
    "LOCAL_IMPLEMENTED",
    "LOCAL_VALIDATED",
    "PUBLIC_DEPLOYED",
    "SERVER_ALIGNED",
  ].forEach((status) => {
    addCheck(`TASK_EXECUTION_PROTOCOL includes status:${status}`, taskProtocol.includes(status));
  });

  addCheck(
    "AGENTS.md requires project state matrix protocol and UI baseline reads",
    agents.includes("docs/PROJECT_CURRENT_STATE.md") &&
      agents.includes("docs/PAGE_PROBLEM_MATRIX_V2.md") &&
      agents.includes("docs/TASK_EXECUTION_PROTOCOL_V1.md") &&
      agents.includes("docs/UI_BASELINE_LOCK_V2.md"),
  );

  addCheck(
    "docs/agents and docs/skills are allowed current guardrail docs",
    agents.includes("docs/agents/*.md") &&
      agents.includes("docs/skills/*.md") &&
      taskProtocol.includes("docs/agents/**") &&
      taskProtocol.includes("docs/skills/**"),
  );

  addCheck(
    "current final baseline validators are referenced",
    agents.includes("validate-project-execution-guardrails-current-state-v1.ts") &&
      agents.includes("validate-ui-baseline-lock-current-state-v1.ts") &&
      taskProtocol.includes("validate-project-execution-guardrails-current-state-v1.ts") &&
      taskProtocol.includes("validate-ui-baseline-lock-current-state-v1.ts"),
  );

  addCheck(
    "historical validators retained but not current final blockers",
    agents.includes("validate-project-execution-guardrails-v1.ts") &&
      agents.includes("historical") &&
      taskProtocol.includes("validate-ui-baseline-lock-after-restore-full-kpi-grid-v1.ts") &&
      taskProtocol.includes("历史阶段"),
  );

  addCheck(
    "UI_BASELINE_LOCK_V2 confirms final public state",
    uiBaseline.includes("PUBLIC_DEPLOYED = true") &&
      uiBaseline.includes("SERVER_ALIGNED = true") &&
      uiBaseline.includes("HUMAN_REVIEW_PASS = true"),
  );

  const disallowedTaskFiles = currentTaskDeclaredFiles.filter((filePath) =>
    forbiddenRuntimePatterns.some((pattern) => pattern.test(filePath)),
  );
  addCheck("current task declared files exclude business code", disallowedTaskFiles.length === 0, {
    currentTaskDeclaredFiles,
    disallowedTaskFiles,
  });

  const forbiddenChangedPaths = forbiddenPackageAndLegacyChanges(gitStatusPaths());
  addCheck("package/vercel/storage/tmall/v05 and real sample changes are absent", forbiddenChangedPaths.length === 0, {
    forbiddenChangedPaths,
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
  validator: "validate-project-execution-guardrails-current-state-v1",
  agentDocCount: listMarkdownFiles("docs/agents").length,
  skillDocCount: listMarkdownFiles("docs/skills").length,
  checks,
  failed: checks.filter((check) => !check.pass),
};

console.log(JSON.stringify(output, null, 2));
console.log(`PROJECT_EXECUTION_GUARDRAILS_CURRENT_STATE_V1_STATUS: ${status}`);

process.exit(status === "PASS" ? 0 : 1);
