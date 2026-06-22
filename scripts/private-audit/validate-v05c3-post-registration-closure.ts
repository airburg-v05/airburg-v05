import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface CompletionRecord {
  taskId: string;
  stage: string;
  status: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  requiredCommands: string[];
  commandResults: Array<{
    command: string;
    status: "PASS" | "FAIL";
  }>;
}

interface LockFile {
  stageStatuses: Record<string, string>;
  v05cFreezeDocument?: string;
  v05cFinalCompletionRecord?: string;
  nextStage?: string;
  nextTask?: string;
}

const C1_RECORD = "docs/project/task-completions/V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT.json";
const C2_RECORD = "docs/project/task-completions/V0.5C_2_HOME_VISUAL_DRILLDOWN_AND_RUNTIME_CLOSURE.json";
const C3_RECORD = "docs/project/task-completions/V0.5C_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const C3_AUTH = "docs/project/task-authorizations/V0.5C_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json";
const FREEZE_DOC = "docs/releases/v0.5c-home-command-center-freeze.md";

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const run = (command: string, args: string[]): boolean => {
  try {
    execFileSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
};

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const normalize = (value: string): string => value.replace(/\r\n/g, "\n").trimEnd();

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const commitExists = (commit: string): boolean =>
  run("git", ["cat-file", "-e", `${commit}^{commit}`]);

const firstAddedCommit = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const fileUnchangedFromFirstCommit = (relativePath: string): boolean => {
  const firstCommit = firstAddedCommit(relativePath);
  if (!firstCommit) return false;
  return normalize(git(["show", `${firstCommit}:${relativePath}`])) === normalize(readFile(relativePath));
};

const hasPass = (record: CompletionRecord, command: string): boolean =>
  record.commandResults.some((result) => result.command === command && result.status === "PASS");

const completionRecordValid = (recordPath: string): boolean => {
  if (!fileExists(recordPath)) return false;
  const record = parseJson<CompletionRecord>(recordPath);
  return (
    record.status === "complete" &&
    fileUnchangedFromFirstCommit(recordPath) &&
    commitExists(record.authorizationCommit) &&
    commitExists(record.completionCommit) &&
    run("git", ["merge-base", "--is-ancestor", record.authorizationCommit, record.completionCommit]) &&
    run("git", ["merge-base", "--is-ancestor", record.completionCommit, "HEAD"]) &&
    record.requiredCommands.every((command) => hasPass(record, command))
  );
};

const main = () => {
  const failedChecks: string[] = [];
  const c3Record = fileExists(C3_RECORD) ? parseJson<CompletionRecord>(C3_RECORD) : null;
  const lock = parseJson<LockFile>("docs/project/v0.5-lock.json");
  const freezeDoc = fileExists(FREEZE_DOC) ? readFile(FREEZE_DOC) : "";

  const checks = {
    c1CompletionRecordValid: completionRecordValid(C1_RECORD),
    c2CompletionRecordValid: completionRecordValid(C2_RECORD),
    c3CompletionRecordExists: fileExists(C3_RECORD),
    c3CompletionRecordUnchanged: fileUnchangedFromFirstCommit(C3_RECORD),
    c3AuthorizationExists: fileExists(C3_AUTH),
    c3AuthorizationCommitExists: c3Record ? commitExists(c3Record.authorizationCommit) : false,
    c3ImplementationCommitExists: c3Record ? commitExists(c3Record.completionCommit) : false,
    c3CompletionRecordCommitExists: firstAddedCommit(C3_RECORD) !== null,
    c3CompletionRecordCommitIsHeadAncestor: (() => {
      const commit = firstAddedCommit(C3_RECORD);
      return commit !== null && run("git", ["merge-base", "--is-ancestor", commit, "HEAD"]);
    })(),
    c3RequiredCommandsPass: c3Record
      ? c3Record.requiredCommands.every((command) => hasPass(c3Record, command))
      : false,
    c3FinalBrowserRuntimePass: c3Record
      ? hasPass(c3Record, "npx tsx scripts/private-audit/validate-v05c-final-browser-runtime.ts")
      : false,
    c3FinalRegressionPass: c3Record
      ? hasPass(c3Record, "npx tsx scripts/private-audit/validate-v05c-final-regression-and-freeze.ts")
      : false,
    c3LintBuildPass: c3Record
      ? hasPass(c3Record, "npm run lint") && hasPass(c3Record, "npm run build")
      : false,
    currentLockV05cComplete: lock.stageStatuses["V0.5C"] === "complete",
    currentLockV05dPending: lock.stageStatuses["V0.5D"] === "pending",
    currentLockFutureStagesPending: ["V0.5D", "V0.5E", "V0.5F", "V0.5G"].every(
      (stage) => lock.stageStatuses[stage] === "pending",
    ),
    governanceLockPass: run("npx", ["tsx", "scripts/private-audit/validate-v05-governance-lock.ts"]),
    freezeDocExists: fileExists(FREEZE_DOC),
    freezeDocRegisteredStatus:
      freezeDoc.includes("PASS，immutable completion record 已注册，post-registration governance validation 已通过。") &&
      !freezeDoc.includes("待 immutable completion record 注册"),
    lockReferencesC3Record: lock.v05cFinalCompletionRecord === C3_RECORD,
    lockReferencesFreezeDoc: lock.v05cFreezeDocument === FREEZE_DOC,
    nextStageV05d: lock.nextStage === "V0.5D",
    nextTaskV05d1: lock.nextTask === "V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT",
  };

  Object.entries(checks).forEach(([key, value]) => {
    if (!value) failedChecks.push(key);
  });

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    c3CompletionRecord: C3_RECORD,
    c3CompletionRecordCommit: firstAddedCommit(C3_RECORD),
    c3ImplementationCommit: c3Record?.completionCommit ?? null,
    v05cStatus: lock.stageStatuses["V0.5C"] ?? null,
    v05dStatus: lock.stageStatuses["V0.5D"] ?? null,
    futureStatuses: Object.fromEntries(
      ["V0.5D", "V0.5E", "V0.5F", "V0.5G"].map((stage) => [stage, lock.stageStatuses[stage] ?? null]),
    ),
    freezeDoc: FREEZE_DOC,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
