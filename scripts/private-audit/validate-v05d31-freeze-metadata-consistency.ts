import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LOCK_FILE = "docs/project/v0.5-lock.json";
const FREEZE_DOC = "docs/releases/v0.5d-multi-store-board-freeze.md";
const D3_COMPLETION = "docs/project/task-completions/V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE.json";

const EXPECTED_STATUS = "状态：PASS，immutable completion record 已注册，V0.5D 已作为冻结基线。";
const OLD_STATUS = "状态：PASS，待 immutable completion record 注册后作为 V0.5D 冻结基线。";

interface CompletionRecord {
  taskId?: string;
  status?: string;
  completionCommit?: string;
  commandResults?: Array<{ status?: string }>;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const commitExists = (commit: string): boolean => {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

const isAncestor = (ancestor: string): boolean => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, "HEAD"], {
      cwd: ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
};

const recordAddCommit = (relativePath: string): string | null => {
  const commits = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath])
    .split("\n")
    .filter(Boolean);
  return commits.at(-1) ?? null;
};

const main = () => {
  const lock = JSON.parse(read(LOCK_FILE)) as {
    stageStatuses: Record<string, string>;
    executionSequence: Array<{ id: string; status: string }>;
    nextTask?: string;
  };
  const freezeDoc = read(FREEZE_DOC);
  const completion = JSON.parse(read(D3_COMPLETION)) as CompletionRecord;
  const executionStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id, item.status]));
  const completionRecordCommit = recordAddCommit(D3_COMPLETION);

  const checks = {
    d3CompletionRecordComplete:
      completion.taskId === "V0.5D_3_FINAL_REGRESSION_AND_STAGE_FREEZE" &&
      completion.status === "complete" &&
      completion.commandResults?.every((result) => result.status === "PASS") === true,
    d3CompletionCommitExists:
      typeof completion.completionCommit === "string" &&
      commitExists(completion.completionCommit) &&
      isAncestor(completion.completionCommit),
    d3CompletionRecordCommitExists:
      typeof completionRecordCommit === "string" &&
      commitExists(completionRecordCommit) &&
      isAncestor(completionRecordCommit),
    executionSequenceV05DComplete: executionStatus["V0.5D"] === "complete",
    stageStatusesV05DComplete: lock.stageStatuses["V0.5D"] === "complete",
    executionSequenceV05EPending: executionStatus["V0.5E"] === "pending",
    stageStatusesV05EPending: lock.stageStatuses["V0.5E"] === "pending",
    nextTaskCorrect: lock.nextTask === "V0.5E_1_STORE_SCOPED_SERIES_AND_TRACKED_PRODUCT_MANAGEMENT",
    freezeDocStatusUpdated: freezeDoc.includes(EXPECTED_STATUS),
    freezeDocOldStatusRemoved: !freezeDoc.includes(OLD_STATUS),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05d31-freeze-metadata-consistency",
    failedChecks,
    d3CompletionRecordStatus: completion.status ?? null,
    d3CompletionCommit: completion.completionCommit ?? null,
    d3CompletionRecordCommit: completionRecordCommit,
    v05dExecutionStatus: executionStatus["V0.5D"] ?? null,
    v05dStageStatus: lock.stageStatuses["V0.5D"] ?? null,
    v05eExecutionStatus: executionStatus["V0.5E"] ?? null,
    v05eStageStatus: lock.stageStatuses["V0.5E"] ?? null,
    nextTask: lock.nextTask ?? null,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05d31-freeze-metadata-consistency",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
}
