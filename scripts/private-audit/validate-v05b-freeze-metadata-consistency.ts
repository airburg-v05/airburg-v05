import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const EXPECTED_V05B_COMPLETION_RECORD =
  "docs/project/task-completions/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json";

const EXPECTED_STAGE_STATUS: Record<string, "complete" | "pending"> = {
  "V0.5A": "complete",
  "V0.5B": "complete",
  "V0.5C": "pending",
  "V0.5D": "pending",
  "V0.5E": "pending",
  "V0.5F": "pending",
  "V0.5G": "pending",
};

interface LockStage {
  id: string;
  name: string;
  dependsOn: string[];
  status: string;
}

interface GovernanceLock {
  currentVersion: string;
  governanceEnforcementVersion: string;
  currentGovernanceStage: string;
  multiPlatform: boolean;
  multiStore: boolean;
  storeOwnershipRequired: boolean;
  legacyMigrationRequired: boolean;
  currentStageDoesNotImplement: string[];
  platforms: string[];
  dataOwnershipRequiredFields: string[];
  privacy: unknown;
  freezeRules: string[];
  executionSequence: LockStage[];
  stageStatuses: Record<string, string>;
  v05bFinalCompletionRecord: string;
  nextStage: string;
  nextTask: string;
}

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface TaskAuthorization {
  taskId: string;
  stage: string;
  dependsOn: string[];
  governanceContractHash: string;
  requiredDocuments: string[];
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  stopConditions: string[];
  authorizedAt: string;
  contractVersion: string;
}

interface CurrentTask {
  taskId: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface TaskCompletionRecord {
  recordVersion: string;
  taskId: string;
  stage: string;
  status: "complete" | "blocked" | "pending" | "in_progress";
  authorizationFile: string;
  authorizationHash: string;
  authorizationCommit: string;
  completionCommit: string;
  completedAt: string;
  requiredCommands: string[];
  commandResults: CommandResult[];
  sourceTaskContractPath: "docs/project/current-task.json";
  registeredAt: string;
}

const toPosix = (value: string): string => value.split(path.sep).join("/");

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const gitSucceeds = (args: string[]): boolean => {
  try {
    execFileSync("git", args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
};

const normalize = (value: string): string =>
  value.replace(/\r\n/g, "\n").trimEnd();

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const calculateAuthorizationHash = (authorization: TaskAuthorization): string =>
  sha256(stableStringify(authorization));

const readFileAtCommit = (commit: string, relativePath: string): string =>
  git(["show", `${commit}:${relativePath}`]);

const parseNameStatus = (stdout: string): string[] =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split("\t");
      if (parts.length >= 3) return [parts[1], parts[2]];
      if (parts.length >= 2) return [parts[1]];
      return [];
    });

const changedFilesSince = (commit: string): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-status",
    "--find-renames",
    commit,
    "--",
  ]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set([
      ...parseNameStatus(diff),
      ...untracked.split("\n").map((line) => line.trim()).filter(Boolean),
    ]),
  ).sort();
};

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedFile === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) {
    return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.startsWith("**/")) {
    return normalizedFile === normalizedPattern.slice(3) ||
      normalizedFile.endsWith(`/${normalizedPattern.slice(3)}`);
  }
  return false;
};

const pathMatchesAny = (file: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesPathPattern(file, pattern));

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const completionCommandResultsPass = (record: TaskCompletionRecord): boolean =>
  record.requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );

const sequenceSignature = (lock: GovernanceLock): unknown =>
  lock.executionSequence.map(({ id, name, dependsOn }) => ({ id, name, dependsOn }));

const main = () => {
  const failures: string[] = [];
  const lock = parseJson<GovernanceLock>("docs/project/v0.5-lock.json");
  const currentTask = parseJson<CurrentTask>("docs/project/current-task.json");
  const baselineLock = JSON.parse(
    readFileAtCommit(currentTask.baselineCommit, "docs/project/v0.5-lock.json"),
  ) as GovernanceLock;
  const freezeDoc = readFile("docs/releases/v0.5b-data-center-freeze.md");
  const completionRecordPath = lock.v05bFinalCompletionRecord;
  const completionRecord = fileExists(completionRecordPath)
    ? parseJson<TaskCompletionRecord>(completionRecordPath)
    : null;
  const authorization = completionRecord && fileExists(completionRecord.authorizationFile)
    ? parseJson<TaskAuthorization>(completionRecord.authorizationFile)
    : null;
  const firstCompletionRecordCommit = findFirstCommitAddingFile(completionRecordPath);
  const changedFiles = changedFilesSince(currentTask.baselineCommit);

  const sequenceStatuses = Object.fromEntries(
    lock.executionSequence.map((stage) => [stage.id, stage.status]),
  );
  const stageStatusMatchesSequence = Object.keys(EXPECTED_STAGE_STATUS).every(
    (stageId) => sequenceStatuses[stageId] === lock.stageStatuses[stageId],
  );
  const expectedStageStatuses = Object.entries(EXPECTED_STAGE_STATUS).every(
    ([stageId, status]) =>
      sequenceStatuses[stageId] === status && lock.stageStatuses[stageId] === status,
  );

  const protectedTopLevelFieldsUnchanged =
    lock.currentVersion === baselineLock.currentVersion &&
    lock.governanceEnforcementVersion === baselineLock.governanceEnforcementVersion &&
    lock.currentGovernanceStage === baselineLock.currentGovernanceStage &&
    lock.multiPlatform === baselineLock.multiPlatform &&
    lock.multiStore === baselineLock.multiStore &&
    lock.storeOwnershipRequired === baselineLock.storeOwnershipRequired &&
    lock.legacyMigrationRequired === baselineLock.legacyMigrationRequired;

  const productDirectionUnchanged =
    stableStringify(lock.currentStageDoesNotImplement) ===
      stableStringify(baselineLock.currentStageDoesNotImplement) &&
    stableStringify(lock.platforms) === stableStringify(baselineLock.platforms) &&
    stableStringify(lock.dataOwnershipRequiredFields) ===
      stableStringify(baselineLock.dataOwnershipRequiredFields) &&
    stableStringify(lock.freezeRules) === stableStringify(baselineLock.freezeRules);

  const executionOrderUnchanged =
    stableStringify(sequenceSignature(lock)) === stableStringify(sequenceSignature(baselineLock));
  const privacyBoundaryUnchanged =
    stableStringify(lock.privacy) === stableStringify(baselineLock.privacy);

  const freezeDocRegistered =
    freezeDoc.includes("PASS") && freezeDoc.includes("immutable completion record 已注册");
  const freezeDocNoPendingFinalRegistration =
    !/pending final (immutable completion record )?registration/i.test(freezeDoc);

  const completionRecordExists = completionRecord !== null;
  const completionRecordValid = completionRecord !== null &&
    completionRecord.recordVersion === "v0.5-task-completion-v1" &&
    completionRecord.taskId === "V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE" &&
    completionRecord.stage === "V0.5B-5" &&
    completionRecord.status === "complete" &&
    completionRecord.sourceTaskContractPath === "docs/project/current-task.json" &&
    completionCommandResultsPass(completionRecord);

  const completionRecordGitValid = completionRecord !== null &&
    firstCompletionRecordCommit !== null &&
    gitSucceeds(["cat-file", "-e", `${completionRecord.completionCommit}^{commit}`]) &&
    gitSucceeds(["cat-file", "-e", `${completionRecord.authorizationCommit}^{commit}`]) &&
    gitSucceeds(["merge-base", "--is-ancestor", completionRecord.authorizationCommit, "HEAD"]) &&
    gitSucceeds(["merge-base", "--is-ancestor", completionRecord.completionCommit, "HEAD"]) &&
    normalize(readFileAtCommit(firstCompletionRecordCommit, completionRecordPath)) ===
      normalize(readFile(completionRecordPath));

  const completionAuthorizationValid = completionRecord !== null && authorization !== null &&
    calculateAuthorizationHash(authorization) === completionRecord.authorizationHash;

  const checks = {
    lockJsonParseable: true,
    executionSequenceStageStatusesConsistent: stageStatusMatchesSequence,
    expectedStageStatuses,
    v05aComplete: sequenceStatuses["V0.5A"] === "complete" &&
      lock.stageStatuses["V0.5A"] === "complete",
    v05bComplete: sequenceStatuses["V0.5B"] === "complete" &&
      lock.stageStatuses["V0.5B"] === "complete",
    v05cToV05gPending: ["V0.5C", "V0.5D", "V0.5E", "V0.5F", "V0.5G"].every(
      (stageId) => sequenceStatuses[stageId] === "pending" &&
        lock.stageStatuses[stageId] === "pending",
    ),
    protectedTopLevelFieldsUnchanged,
    productDirectionUnchanged,
    executionOrderUnchanged,
    privacyBoundaryUnchanged,
    freezeDocRegistered,
    freezeDocNoPendingFinalRegistration,
    completionRecordPathMatches: completionRecordPath === EXPECTED_V05B_COMPLETION_RECORD,
    completionRecordExists,
    completionRecordValid,
    completionRecordGitValid,
    completionAuthorizationValid,
    nextStageCorrect: lock.nextStage === "V0.5C",
    nextTaskCorrect: lock.nextTask === "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT",
    changedFilesWithinAllowed: changedFiles.every((file) =>
      pathMatchesAny(file, currentTask.allowedModifyPaths),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      pathMatchesAny(file, currentTask.forbiddenModifyPaths),
    ),
  };

  Object.entries(checks).forEach(([name, ok]) => {
    if (!ok) failures.push(name);
  });

  const output = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failedChecks: failures,
    stageStatuses: Object.fromEntries(
      Object.keys(EXPECTED_STAGE_STATUS).map((stageId) => [
        stageId,
        {
          executionSequence: sequenceStatuses[stageId] ?? null,
          stageStatuses: lock.stageStatuses[stageId] ?? null,
        },
      ]),
    ),
    freezeStatusRegistered: freezeDocRegistered,
    completionRecordPath,
    completionRecordTaskId: completionRecord?.taskId ?? null,
    nextStage: lock.nextStage,
    nextTask: lock.nextTask,
    changedFiles,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
};

main();
