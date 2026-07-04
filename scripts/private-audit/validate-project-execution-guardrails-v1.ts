import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface MatrixRow {
  problemId: string;
  page: string;
  originalProblem: string;
  layer: string;
  currentStatus: string;
  evidence: string;
  nextAction: string;
  forbiddenChanges: string;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const docs = {
  projectState: "docs/PROJECT_CURRENT_STATE.md",
  problemMatrix: "docs/PAGE_PROBLEM_MATRIX_V2.md",
  taskProtocol: "docs/TASK_EXECUTION_PROTOCOL_V1.md",
};

const allowedTaskFiles = new Set([
  docs.projectState,
  docs.problemMatrix,
  docs.taskProtocol,
  "scripts/private-audit/validate-project-execution-guardrails-v1.ts",
]);

const layers = new Set(["ETL", "BI", "Target", "UI", "Persistence", "Deploy"]);
const statuses = new Set(["unresolved", "local_pass", "public_pass", "needs_user_check", "blocked"]);

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const gitStatus = (): string[] =>
  execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const pathFromStatusLine = (line: string): string => {
  const raw = line.slice(3).trim();
  const renamed = raw.includes(" -> ") ? raw.split(" -> ").pop() ?? raw : raw;
  return renamed.replace(/^"|"$/g, "");
};

const parseMatrixRows = (source: string): MatrixRow[] =>
  source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\| PVM2-\d+ \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        problemId: cells[0] ?? "",
        page: cells[1] ?? "",
        originalProblem: cells[2] ?? "",
        layer: cells[3] ?? "",
        currentStatus: cells[4] ?? "",
        evidence: cells[5] ?? "",
        nextAction: cells[6] ?? "",
        forbiddenChanges: cells[7] ?? "",
      };
    });

const run = () => {
  addCheck("projectCurrentStateExists", exists(docs.projectState));
  addCheck("pageProblemMatrixExists", exists(docs.problemMatrix));
  addCheck("taskExecutionProtocolExists", exists(docs.taskProtocol));

  const projectState = read(docs.projectState);
  const problemMatrix = read(docs.problemMatrix);
  const taskProtocol = read(docs.taskProtocol);

  ["/upload", "/home", "/series-board", "/product-board", "/store-board", "/upload/history", "/upload/quality"].forEach((route) => {
    addCheck(`projectCurrentStateContainsRoute:${route}`, projectState.includes(route));
  });

  [
    "ETL_FILE_ROUTER V2",
    "Runtime append STRICT V1",
    "Search keyword dedup V2",
    "Brand / center unified resolver",
    "去退费比 / 直接成交占比",
    "Target required / derived / unsupported",
    "Runtime Dataset Persistence",
    "Target Drafts Persistence",
    "Server alignment full redeploy",
  ].forEach((capability) => {
    addCheck(`projectCurrentStateContainsCapability:${capability}`, projectState.includes(capability));
  });

  [
    "不改 ETL",
    "不改 BI 公式",
    "不改 target persistence schema",
    "不改 runtime append",
    "不改 search dedup",
    "不改 brand / center 语义",
    "UI 任务不得改数据口径",
    "未确认部署前不得说已上线",
  ].forEach((rule) => {
    addCheck(`projectCurrentStateContainsForbiddenRule:${rule}`, projectState.includes(rule));
  });

  addCheck("projectCurrentStateMarksSsotLocalOnly", projectState.includes("SSOT + State Layer") && projectState.includes("LOCAL_VALIDATED") && projectState.includes("尚未记录为：`PUBLIC_DEPLOYED`"));

  const rows = parseMatrixRows(problemMatrix);
  addCheck("pageProblemMatrixAtLeast12Items", rows.length >= 12, { count: rows.length });
  addCheck("pageProblemMatrixEveryItemHasLayer", rows.every((row) => layers.has(row.layer)), rows.filter((row) => !layers.has(row.layer)));
  addCheck("pageProblemMatrixEveryItemHasCurrentStatus", rows.every((row) => statuses.has(row.currentStatus)), rows.filter((row) => !statuses.has(row.currentStatus)));
  addCheck("pageProblemMatrixEveryItemHasEvidence", rows.every((row) => row.evidence.length > 0));
  addCheck("pageProblemMatrixEveryItemHasNextAction", rows.every((row) => row.nextAction.length > 0));
  addCheck("pageProblemMatrixEveryItemHasForbiddenChanges", rows.every((row) => row.forbiddenChanges.length > 0));

  [
    "LOCAL_IMPLEMENTED",
    "LOCAL_VALIDATED",
    "PUBLIC_DEPLOYED",
    "SERVER_ALIGNED",
  ].forEach((status) => {
    addCheck(`taskProtocolContainsStatus:${status}`, taskProtocol.includes(status));
  });

  [
    "是否跨层",
    "是否允许改 ETL",
    "是否允许改 BI",
    "是否允许改 Target",
    "是否允许改 UI",
    "是否允许改 persistence",
    "跨层修改检查",
  ].forEach((phrase) => {
    addCheck(`taskProtocolContainsCrossLayerCheck:${phrase}`, taskProtocol.includes(phrase));
  });

  [
    "修改文件",
    "新增文件",
    "是否修改 ETL",
    "是否修改 BI",
    "是否修改 Target",
    "是否修改 UI",
    "是否修改 persistence",
    "是否部署",
    "是否公网回归",
    "是否需要人工核查",
  ].forEach((phrase) => {
    addCheck(`taskProtocolContainsOutputField:${phrase}`, taskProtocol.includes(phrase));
  });

  const statusLines = gitStatus();
  const changedPaths = statusLines.map(pathFromStatusLine);
  const forbiddenChangedPaths = changedPaths.filter((filePath) =>
    filePath === "package.json" ||
    filePath === "package-lock.json" ||
    filePath === "vercel.json" ||
    filePath.startsWith(".vercel/") ||
    filePath.startsWith("private-samples/") ||
    filePath.startsWith("lib/storage/") ||
    filePath.startsWith("lib/tmall/") ||
    filePath.startsWith("lib/v05/"),
  );
  addCheck("noForbiddenPackageVercelStorageTmallV05Changes", forbiddenChangedPaths.length === 0, forbiddenChangedPaths);

  const guardrailTaskFilesPresent = [...allowedTaskFiles].every(exists);
  addCheck("guardrailTaskFilesPresent", guardrailTaskFilesPresent, [...allowedTaskFiles]);

  const nonGuardrailDocsChanged = changedPaths.filter((filePath) =>
    (filePath.startsWith("docs/") || filePath === "scripts/private-audit/validate-project-execution-guardrails-v1.ts") &&
    !allowedTaskFiles.has(filePath),
  );
  addCheck("guardrailTaskDidNotTouchUnexpectedDocsOrScript", nonGuardrailDocsChanged.length === 0, nonGuardrailDocsChanged);

  const businessCodeStatusLines = statusLines.filter((line) => {
    const filePath = pathFromStatusLine(line);
    return filePath.startsWith("app/") || filePath.startsWith("components/") || filePath.startsWith("lib/");
  });
  addCheck(
    "businessCodeChangesArePreExistingBaselineScope",
    businessCodeStatusLines.every((line) => {
      const filePath = pathFromStatusLine(line);
      return (
        filePath.startsWith("app/(workspace)/") ||
        filePath.startsWith("components/") ||
        filePath.startsWith("lib/bi/") ||
        filePath.startsWith("lib/etl/") ||
        filePath.startsWith("lib/persistence/") ||
        filePath.startsWith("lib/state/")
      );
    }),
    businessCodeStatusLines,
  );
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
  pageProblemCount: exists(docs.problemMatrix) ? parseMatrixRows(read(docs.problemMatrix)).length : 0,
  addedFiles: [...allowedTaskFiles],
  checks,
};

console.log(JSON.stringify(output, null, 2));
process.exit(status === "PASS" ? 0 : 1);
