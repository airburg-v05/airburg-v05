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

const agentFiles = [
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/data-integrity-agent.md",
  "docs/agents/bi-semantic-agent.md",
  "docs/agents/target-agent.md",
  "docs/agents/deploy-agent.md",
  "docs/agents/qa-screenshot-agent.md",
];

const skillFiles = [
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-data-integrity-skill.md",
  "docs/skills/airburg-deploy-skill.md",
  "docs/skills/airburg-regression-skill.md",
];

const allowedTaskFiles = new Set([
  "AGENTS.md",
  ...agentFiles,
  ...skillFiles,
  "scripts/private-audit/validate-airburg-project-agent-and-skill-system-v1.ts",
]);

const forbiddenRuntimePrefixes = [
  "app/",
  "components/",
  "lib/etl/",
  "lib/bi/",
  "lib/persistence/",
  "lib/storage/",
  "lib/tmall/",
  "lib/v05/",
];

const forbiddenConfigPaths = [
  "package.json",
  "package-lock.json",
  "vercel.json",
];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const hasAll = (source: string, tokens: string[]): boolean =>
  tokens.every((token) => source.includes(token));

const main = () => {
  let status: Status = "PASS";

  addCheck("AGENTS.md exists", exists("AGENTS.md"));
  agentFiles.forEach((file) => addCheck(`${file} exists`, exists(file)));
  skillFiles.forEach((file) => addCheck(`${file} exists`, exists(file)));

  const agents = read("AGENTS.md");
  const uiAgent = read("docs/agents/ui-layout-agent.md");
  const deployAgent = read("docs/agents/deploy-agent.md");
  const qaAgent = read("docs/agents/qa-screenshot-agent.md");
  const deploySkill = read("docs/skills/airburg-deploy-skill.md");
  const uiSkill = read("docs/skills/airburg-ui-layout-skill.md");
  const regressionSkill = read("docs/skills/airburg-regression-skill.md");
  const taskSkill = read("docs/skills/airburg-task-execution-skill.md");

  addCheck(
    "AGENTS.md requires first reads",
    hasAll(agents, [
      "docs/PROJECT_CURRENT_STATE.md",
      "docs/PAGE_PROBLEM_MATRIX_V2.md",
      "docs/TASK_EXECUTION_PROTOCOL_V1.md",
      "docs/agents/*.md",
      "docs/skills/*.md",
    ]),
  );
  addCheck(
    "AGENTS.md requires problemId and layer gate",
    hasAll(agents, ["problemId", "Decide the task layer", "Confirm allowed files", "Confirm forbidden files"]),
  );
  addCheck(
    "AGENTS.md distinguishes deployment states",
    hasAll(agents, ["LOCAL_IMPLEMENTED", "LOCAL_VALIDATED", "PUBLIC_DEPLOYED", "SERVER_ALIGNED"]),
  );
  addCheck(
    "AGENTS.md forbids cross-layer UI edits",
    hasAll(agents, ["UI tasks must not modify ETL", "BI formulas", "Target formulas", "Persistence schema"]),
  );
  addCheck(
    "ui-layout-agent forbids ETL BI Target Persistence edits",
    hasAll(uiAgent, ["Do not edit `lib/etl/**`", "Do not edit BI formulas", "Do not edit Target formulas", "Do not edit Persistence schema"]),
  );
  addCheck(
    "ui-layout-agent forbids abstract labels",
    hasAll(uiAgent, ["L1", "L2", "L3", "L4", "Primary", "Secondary", "Hidden"]),
  );
  addCheck(
    "ui-layout-agent keeps derived unsupported KPI cards",
    hasAll(uiAgent, ["Do not hide KPI cards", "derived", "unsupported", "main grid"]),
  );
  addCheck(
    "deploy-agent forbids business code edits",
    hasAll(deployAgent, ["must not modify business code", "Do not modify business code"]),
  );
  addCheck(
    "deploy-agent protects port and files",
    hasAll(deployAgent, ["3000", "127.0.0.1", "private-samples", "*.xls", "*.xlsx", "*.csv", "*.pem", "*.key"]),
  );
  addCheck(
    "deploy-skill distinguishes statuses",
    hasAll(deploySkill, ["Local PASS is not public PASS", "Public PASS is not server aligned", "Route 200 is not data regression"]),
  );
  addCheck(
    "ui-layout-skill forbids invented labels",
    hasAll(uiSkill, ["L1", "L2", "L3", "L4", "Primary", "Secondary", "Hidden"]),
  );
  addCheck(
    "task-execution-skill has ten-step flow",
    hasAll(taskSkill, [
      "Step 1: Read State",
      "Step 2: Map ProblemId",
      "Step 3: Classify Layer",
      "Step 4: Check Forbidden Files",
      "Step 5: Implement Small Scope",
      "Step 6: Validate",
      "Step 7: Decide Deploy",
      "Step 8: Public Regression",
      "Step 9: Human Review",
      "Step 10: Update State",
    ]),
  );
  addCheck(
    "regression-skill includes key public regression checks",
    hasAll(regressionSkill, ["GMV", "GSV", "visitors", "paidBuyers", "adSpend", "clicks", "refund", "productId-first", "target isolation", "390px", "console"]),
  );
  addCheck(
    "qa-screenshot-agent requires screenshot manifest and human review",
    hasAll(qaAgent, ["screenshot manifest", "humanReviewRequired", "390px", "console business errors"]),
  );

  const taskFileList = [...allowedTaskFiles].sort();
  const allowedOnly = taskFileList.every((file) => {
    if (forbiddenRuntimePrefixes.some((prefix) => file.startsWith(prefix))) return false;
    if (forbiddenConfigPaths.includes(file)) return false;
    return true;
  });

  addCheck("taskDeclaredFilesAreDocsAndPrivateAuditOnly", allowedOnly, taskFileList);
  addCheck("taskDidNotDeclareBusinessCodeFiles", !taskFileList.some((file) => file.startsWith("app/") || file.startsWith("components/") || file.startsWith("lib/")), taskFileList);
  addCheck("taskDidNotDeclarePackageVercelStorageTmallV05", !taskFileList.some((file) =>
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "vercel.json" ||
    file.startsWith(".vercel/") ||
    file.startsWith("lib/storage/") ||
    file.startsWith("lib/tmall/") ||
    file.startsWith("lib/v05/"),
  ), taskFileList);

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) status = "FAIL";

  console.log(JSON.stringify({
    status,
    agentCount: agentFiles.length,
    skillCount: skillFiles.length,
    expectedFiles: {
      agents: agentFiles,
      skills: skillFiles,
      other: ["AGENTS.md", "scripts/private-audit/validate-airburg-project-agent-and-skill-system-v1.ts"],
    },
    checks,
    failed,
  }, null, 2));
  console.log(`AIRBURG_PROJECT_AGENT_AND_SKILL_SYSTEM_V1_STATUS: ${status}`);
  process.exit(status === "PASS" ? 0 : 1);
};

main();
