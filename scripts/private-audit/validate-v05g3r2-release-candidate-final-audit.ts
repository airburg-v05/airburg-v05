import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE";
const RELEASE_DOC = "docs/releases/v0.5-final-release-candidate-freeze.md";
const LOCK_PATH = "docs/project/v0.5-lock.json";
const COMPLETION_PATH = `docs/project/task-completions/${TASK_ID}.json`;

const REQUIRED_COMPLETIONS = [
  "V0.5A_5_R2_FINAL_REGRESSION_AND_STAGE_FREEZE",
  "V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE",
  "V0.5C_3_1_STAGE_SCOPED_FREEZE_GATE_AND_POST_REGISTRATION_CLOSURE",
  "V0.5D_3_1_FREEZE_METADATA_CONSISTENCY_CLOSURE",
  "V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE",
  "V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE",
  "V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE",
  "V0.5G_2_ACCESSIBILITY_MOBILE_PERFORMANCE_AND_RUNTIME_CLOSURE",
] as const;

const EXPECTED_PAGES = [
  "/login",
  "/home",
  "/upload",
  "/upload/history",
  "/upload/quality",
  "/raw-data",
  "/targets",
  "/store-board",
  "/series-board",
  "/series-board/manage",
  "/product-board",
  "/product-board/tracked",
] as const;

const FORBIDDEN_PASS_RECORDS = [
  "V0.5G_3_V05_RELEASE_CANDIDATE_FINAL_AUDIT_AND_FREEZE",
  "V0.5G_3_R1_V05_RELEASE_CANDIDATE_FINAL_AUDIT_AND_FREEZE",
] as const;

interface CurrentTask {
  taskId: string;
  status: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
}

interface CompletionRecord {
  taskId: string;
  stage: string;
  status: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  requiredCommands: string[];
  commandResults: Array<{ command: string; status: string }>;
}

interface LockFile {
  stageStatuses: Record<string, string>;
  executionSequence: Array<{ id?: string; stage?: string; status: string }>;
  releaseCandidateStatus?: string;
  v05gFreezeDocument?: string;
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

const commitExists = (commit: string): boolean => {
  try {
    git(["cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

const isHeadAncestor = (commit: string): boolean => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const completionPathFor = (taskId: string): string => `docs/project/task-completions/${taskId}.json`;

const completionEvidence = (taskId: string) => {
  const recordPath = completionPathFor(taskId);
  if (!exists(recordPath)) {
    return { taskId, recordPath, ok: false, failures: ["record_missing"] };
  }
  const record = json<CompletionRecord>(recordPath);
  const failures: string[] = [];
  if (record.taskId !== taskId) failures.push("task_id_mismatch");
  if (record.status !== "complete") failures.push("status_not_complete");
  if (!commandResultsPass(record)) failures.push("required_commands_not_all_pass");
  if (!exists(record.authorizationFile)) failures.push("authorization_file_missing");
  if (!commitExists(record.authorizationCommit)) failures.push("authorization_commit_missing");
  if (!commitExists(record.completionCommit)) failures.push("completion_commit_missing");
  if (record.completionCommit && !isHeadAncestor(record.completionCommit)) failures.push("completion_commit_not_head_ancestor");
  return {
    taskId,
    recordPath,
    ok: failures.length === 0,
    failures,
    completionCommit: record.completionCommit,
    authorizationCommit: record.authorizationCommit,
    commandCount: record.requiredCommands.length,
  };
};

const findBlockedR1Evidence = (): { blockedCommit: string | null; preserved: boolean } => {
  const commits = git(["log", "--format=%H", "--", "docs/project/current-task.json"]).split("\n").filter(Boolean);
  for (const commit of commits) {
    try {
      const content = execFileSync("git", ["show", `${commit}:docs/project/current-task.json`], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const parsed = JSON.parse(content) as { taskId?: string; status?: string; blockedReason?: string };
      if (parsed.taskId === "V0.5G_3_R1_V05_RELEASE_CANDIDATE_FINAL_AUDIT_AND_FREEZE" && parsed.status === "blocked") {
        return { blockedCommit: commit, preserved: Boolean(parsed.blockedReason) };
      }
    } catch {
      // Continue scanning older current-task versions.
    }
  }
  return { blockedCommit: null, preserved: false };
};

const forbiddenPassRecords = () =>
  FORBIDDEN_PASS_RECORDS.map((taskId) => {
    const recordPath = completionPathFor(taskId);
    if (!exists(recordPath)) return { taskId, recordPath, exists: false, passRecord: false };
    const record = json<CompletionRecord>(recordPath);
    return { taskId, recordPath, exists: true, passRecord: record.status === "complete" };
  });

const main = () => {
  const task = json<CurrentTask>("docs/project/current-task.json");
  const lock = json<LockFile>(LOCK_PATH);
  const releaseDoc = exists(RELEASE_DOC) ? read(RELEASE_DOC) : "";
  const changedFiles = changedFilesSince(task.baselineCommit);
  const completionExists = exists(COMPLETION_PATH);
  const completion = completionExists ? json<CompletionRecord>(COMPLETION_PATH) : null;
  const requiredCompletionEvidence = REQUIRED_COMPLETIONS.map(completionEvidence);
  const r1Evidence = findBlockedR1Evidence();
  const forbiddenRecords = forbiddenPassRecords();

  const executionStageStatus = Object.fromEntries(lock.executionSequence.map((item) => [item.id ?? item.stage, item.status]));
  const releaseDocRegistered = releaseDoc.includes("PASS，immutable completion record 已注册，V0.5 已形成 release candidate。");
  const releaseDocPendingRegistration = releaseDoc.includes("PASS，待 immutable completion record 注册后形成 release candidate。");
  const releaseDocStatusAcceptable = completionExists ? releaseDocRegistered : releaseDocPendingRegistration || releaseDocRegistered;

  const checks = {
    currentTaskIsR2: task.taskId === TASK_ID,
    currentTaskNotBlocked: task.status !== "blocked",
    aThroughFComplete: ["V0.5A", "V0.5B", "V0.5C", "V0.5D", "V0.5E", "V0.5F"].every(
      (stage) => lock.stageStatuses[stage] === "complete" && executionStageStatus[stage] === "complete",
    ),
    v05gCompleteInLock: lock.stageStatuses["V0.5G"] === "complete" && executionStageStatus["V0.5G"] === "complete",
    releaseCandidateReady: lock.releaseCandidateStatus === "READY",
    freezeDocumentPathRegistered: lock.v05gFreezeDocument === RELEASE_DOC,
    finalCompletionPathRegistered: lock.v05gFinalCompletionRecord === COMPLETION_PATH,
    releaseDocumentExists: exists(RELEASE_DOC),
    releaseDocumentStatusAcceptable: releaseDocStatusAcceptable,
    releaseDocumentListsAllPages: EXPECTED_PAGES.every((route) => releaseDoc.includes(route)),
    releaseDocumentHasIssueLists:
      releaseDoc.includes("必须修复项") && releaseDoc.includes("建议优化项") && releaseDoc.includes("已知非阻断问题"),
    requiredHistoricalCompletionsPass: requiredCompletionEvidence.every((item) => item.ok),
    oldR1BlockedEvidencePreserved: r1Evidence.preserved,
    oldBlockedTasksNotRepresentedAsPass: forbiddenRecords.every((record) => !record.passRecord),
    completionRecordModeValid: completion
      ? completion.taskId === TASK_ID && completion.status === "complete" && commandResultsPass(completion)
      : task.status === "in_progress" || task.status === "complete",
    completionRecordCommitPresentWhenRegistered: completion ? commitExists(completion.completionCommit) : true,
    completionRecordCommitAncestorWhenRegistered: completion ? isHeadAncestor(completion.completionCommit) : true,
    changedFilesWithinAllowed: changedFiles.every((file) =>
      task.allowedModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      task.forbiddenModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    noBusinessCodeChanges: !changedFiles.some((file) =>
      file.startsWith("app/") ||
      file.startsWith("components/") ||
      file.startsWith("lib/") ||
      file.startsWith("types/"),
    ),
    noDependencyChanges: !changedFiles.some((file) =>
      ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file),
    ),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    taskId: TASK_ID,
    releaseCandidateStatus: failedChecks.length === 0 ? "READY" : "NOT_READY",
    failedChecks,
    stageStatuses: lock.stageStatuses,
    releaseDocumentPath: RELEASE_DOC,
    completionRecordPath: COMPLETION_PATH,
    completionRecordRegistered: completionExists,
    oldBlockedEvidence: {
      r1BlockedCommit: r1Evidence.blockedCommit,
      r1Preserved: r1Evidence.preserved,
      forbiddenPassRecords: forbiddenRecords,
    },
    historicalCompletions: requiredCompletionEvidence,
    pages: EXPECTED_PAGES,
    issueLists: {
      mustFixItems: [],
      suggestedOptimizations: [
        "后续版本可继续扩展真实平台 API 与更细粒度运营动作闭环，但不属于 V0.5 release candidate 阻断项。",
      ],
      knownNonBlockingIssues: [
        "favicon.ico 404 若出现仍按历史规则作为非业务资源问题记录。",
      ],
      futureVersionScope: [
        "V0.6 可规划平台 API、后端服务、团队权限和更完整的数据导出。",
      ],
    },
    changedFiles,
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
