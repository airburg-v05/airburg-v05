import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_4_POST_FREEZE_RELEASE_HANDOFF_AND_DEPLOYMENT_READINESS";
const G3_RECORD =
  "docs/project/task-completions/V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const RELEASE_DOC = "docs/releases/v0.5-final-release-candidate-freeze.md";

const OPERATION_DOCS = [
  "docs/operations/V05_RELEASE_HANDOFF.md",
  "docs/operations/V05_DEPLOYMENT_RUNBOOK.md",
  "docs/operations/V05_PRODUCTION_ACCEPTANCE_CHECKLIST.md",
  "docs/operations/V05_ROLLBACK_AND_DATA_SAFETY.md",
  "docs/operations/v0.5-deployment-readiness.json",
] as const;

const VENDOR_TERMS = ["vercel.json", "netlify.toml", "Dockerfile", "nginx.conf", "fly.toml", "render.yaml"] as const;

interface CurrentTask {
  taskId: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface CompletionRecord {
  taskId: string;
  status: string;
  completionCommit: string;
  requiredCommands: string[];
  commandResults: Array<{ command: string; status: string; releaseCandidateStatus?: string }>;
}

interface LockFile {
  stageStatuses: Record<string, string>;
  releaseCandidateStatus?: string;
  v05gFinalCompletionRecord?: string;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const json = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const toPosix = (value: string): string => value.split(path.sep).join("/");

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedFile === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  return false;
};

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean)),
  ).sort();
};

const commandResultsPass = (record: CompletionRecord): boolean =>
  record.status === "complete" &&
  record.requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );

const main = () => {
  const task = json<CurrentTask>("docs/project/current-task.json");
  const lock = json<LockFile>("docs/project/v0.5-lock.json");
  const g3 = json<CompletionRecord>(G3_RECORD);
  const packageJson = json<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> }>("package.json");
  const readiness = json<Record<string, unknown>>("docs/operations/v0.5-deployment-readiness.json");
  const docs = OPERATION_DOCS.map((docPath) => (exists(docPath) ? read(docPath) : "")).join("\n");
  const changedFiles = changedFilesSince(task.baselineCommit);

  const releaseCommit = g3.completionCommit;
  const g3ReleaseReady = g3.commandResults.some(
    (result) =>
      result.command === "npx tsx scripts/private-audit/validate-v05g3r2-release-candidate-final-audit.ts" &&
      result.status === "PASS" &&
      result.releaseCandidateStatus === "READY",
  );

  const checks = {
    currentTaskIsG4: task.taskId === TASK_ID,
    g3CompletionRecordValid:
      g3.taskId === "V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE" &&
      g3.status === "complete" &&
      commandResultsPass(g3) &&
      g3ReleaseReady,
    v05aThroughGComplete: ["V0.5A", "V0.5B", "V0.5C", "V0.5D", "V0.5E", "V0.5F", "V0.5G"].every(
      (stage) => lock.stageStatuses[stage] === "complete",
    ),
    releaseCandidateReady: lock.releaseCandidateStatus === "READY",
    lockStillReferencesG3: lock.v05gFinalCompletionRecord === G3_RECORD,
    finalFreezeDocExists: exists(RELEASE_DOC),
    operationDocsExist: OPERATION_DOCS.every(exists),
    releaseCommitDocumented: OPERATION_DOCS.every((docPath) => read(docPath).includes(releaseCommit)),
    completionRecordDocumented: docs.includes(G3_RECORD),
    buildAndStartDocumented: docs.includes("npm run build") && docs.includes("npm run start"),
    nodeNpmNextDocumented: docs.includes("v24.16.0") && docs.includes("11.13.0") && docs.includes("16.2.9"),
    originBoundaryDocumented:
      docs.includes("origin") &&
      docs.includes("localhost") &&
      docs.includes("正式域名") &&
      docs.includes("不会自动"),
    singleBrowserBoundaryDocumented:
      docs.includes("SINGLE_BROWSER_OPERATOR_READY") && docs.includes("SHARED_MULTIUSER_NOT_SUPPORTED"),
    multiUserNotReadyDocumented: docs.includes("NOT_READY_FOR_SHARED_MULTIUSER"),
    rollbackDoesNotClearData:
      docs.includes("Do not delete IndexedDB") &&
      docs.includes("Do not delete legacy localStorage keys") &&
      docs.includes("Do not use \"clear browser data\" as a standard rollback method"),
    deploymentTargetSelectionRequired:
      docs.includes("DEPLOYMENT_TARGET_STATUS") &&
      docs.includes("SELECTION_REQUIRED") &&
      readiness.deploymentTargetStatus === "SELECTION_REQUIRED",
    noVendorSpecificConfigInDocs: VENDOR_TERMS.every((term) => !docs.includes(term)),
    readinessMatrixMachineReadable:
      readiness.releaseCommit === releaseCommit &&
      readiness.operatingModelStatus === "SINGLE_BROWSER_OPERATOR_READY" &&
      readiness.productionUseCaseStatus === "NOT_READY_FOR_SHARED_MULTIUSER" &&
      readiness.runtime &&
      typeof readiness.runtime === "object",
    packageNotModified: !changedFiles.some((file) => ["package.json", "package-lock.json"].includes(file)),
    noNewDependencies:
      !JSON.stringify(packageJson.dependencies ?? {}).includes("playwright") &&
      !JSON.stringify(packageJson.devDependencies ?? {}).includes("puppeteer"),
    changedFilesWithinAllowed: changedFiles.every((file) =>
      task.allowedModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      task.forbiddenModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    noBusinessCodeChanges: !changedFiles.some((file) =>
      file.startsWith("app/") || file.startsWith("components/") || file.startsWith("lib/") || file.startsWith("types/"),
    ),
    noLockOrFreezeDocChanges: !changedFiles.some((file) =>
      file === "docs/project/v0.5-lock.json" || file === "docs/releases/v0.5-final-release-candidate-freeze.md",
    ),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);

  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    taskId: TASK_ID,
    failedChecks,
    releaseCommit,
    nodeVersion: process.version,
    npmVersion: execFileSync("npm", ["-v"], { encoding: "utf8" }).trim(),
    nextVersion: packageJson.dependencies?.next,
    deploymentTargetStatus: readiness.deploymentTargetStatus,
    operatingModelStatus: readiness.operatingModelStatus,
    productionUseCaseStatus: readiness.productionUseCaseStatus,
    operationDocs: OPERATION_DOCS,
    changedFiles,
    checks,
  }, null, 2));

  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
