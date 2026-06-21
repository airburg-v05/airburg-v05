import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface LockStage {
  id: string;
  name: string;
  dependsOn: string[];
  status: string;
}

interface GovernanceLock {
  currentVersion: string;
  governanceContractFiles: string[];
  executionSequence: LockStage[];
  allowedInstructionFiles: string[];
  nestedAgentsForbidden: boolean;
  stageStatuses: Record<string, string>;
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
  stage: string;
  dependsOn: string[];
  baselineCommit: string;
  authorizationFile: string;
  authorizationHash: string;
  authorizedContractVersion: string;
  governanceContractHash: string;
  requiredDocuments: string[];
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  commandResults?: CommandResult[];
  stopConditions: string[];
  startedAt: string;
  completedAt: string | null;
  status: "pending" | "in_progress" | "blocked" | "complete";
}

const MANDATORY_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npm run lint",
  "npm run build",
] as const;

const toPosix = (value: string): string => value.split(path.sep).join("/");

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const parseJsonFile = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const commandSucceeds = (command: string, args: string[]): boolean => {
  try {
    execFileSync(command, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

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

const calculateGovernanceHash = (lock: GovernanceLock): string => {
  const hash = crypto.createHash("sha256");
  lock.governanceContractFiles.forEach((file) => {
    const content = readFile(file).replace(/\r\n/g, "\n").trimEnd();
    hash.update(`FILE:${file}\n${content}\nEND_FILE\n`);
  });
  return hash.digest("hex");
};

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);

  if (normalizedPattern === normalizedFile) return true;
  if (normalizedPattern.endsWith("/**")) {
    return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.startsWith("**/")) {
    return (
      normalizedFile === normalizedPattern.slice(3) ||
      normalizedFile.endsWith(`/${normalizedPattern.slice(3)}`)
    );
  }

  return false;
};

const pathMatchesAny = (file: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesPathPattern(file, pattern));

const patternsOverlap = (allowed: readonly string[], forbidden: readonly string[]): boolean =>
  allowed.some((allowedPattern) =>
    forbidden.some((forbiddenPattern) => {
      if (allowedPattern === forbiddenPattern) return true;
      if (forbiddenPattern.endsWith("/**")) {
        return allowedPattern.startsWith(forbiddenPattern.slice(0, -3));
      }
      if (allowedPattern.endsWith("/**")) {
        return forbiddenPattern.startsWith(allowedPattern.slice(0, -3));
      }
      return false;
    }),
  );

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

const changedFilesSinceCommit = (commit: string): string[] => {
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

const listInstructionFiles = (): string[] => {
  const result: string[] = [];
  const ignoredDirs = new Set([".git", ".next", "node_modules"]);

  const walk = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (ignoredDirs.has(entry.name)) return;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }
      if (entry.name === "AGENTS.md" || entry.name === "AGENTS.override.md") {
        result.push(toPosix(path.relative(ROOT, absolutePath)));
      }
    });
  };

  walk(ROOT);
  return result.sort();
};

const findAuthorizationCommit = (authorizationFile: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", authorizationFile]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const readFileAtCommit = (commit: string, file: string): string =>
  git(["show", `${commit}:${file}`]);

const stageBelongsToSequence = (stage: string, lock: GovernanceLock): boolean =>
  lock.executionSequence.some((item) => stage === item.id || stage.startsWith(`${item.id}-`));

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean =>
  stableStringify(left) === stableStringify(right);

const authorizationMatchesTask = (
  task: CurrentTask,
  authorization: TaskAuthorization,
): boolean =>
  task.taskId === authorization.taskId &&
  task.stage === authorization.stage &&
  arraysEqual(task.dependsOn, authorization.dependsOn) &&
  task.governanceContractHash === authorization.governanceContractHash &&
  arraysEqual(task.requiredDocuments, authorization.requiredDocuments) &&
  arraysEqual(task.allowedModifyPaths, authorization.allowedModifyPaths) &&
  arraysEqual(task.forbiddenModifyPaths, authorization.forbiddenModifyPaths) &&
  arraysEqual(task.requiredCommands, authorization.requiredCommands) &&
  arraysEqual(task.stopConditions, authorization.stopConditions);

const commandResultsPass = (task: CurrentTask): boolean => {
  if (task.status !== "complete") return true;
  const results = task.commandResults ?? [];
  return task.requiredCommands.every((command) =>
    results.some((result) => result.command === command && result.status === "PASS"),
  );
};

const main = () => {
  const failures: string[] = [];
  let status: "PASS" | "FAIL" | "BLOCKED" = "PASS";
  let gitRoot = "";

  try {
    gitRoot = git(["rev-parse", "--show-toplevel"]);
  } catch {
    status = "BLOCKED";
    failures.push("gitRootAvailable");
  }

  if (gitRoot && path.resolve(gitRoot) !== path.resolve(ROOT)) {
    status = "BLOCKED";
    failures.push("currentWorkingDirectoryIsGitRoot");
  }

  const lock = parseJsonFile<GovernanceLock>("docs/project/v0.5-lock.json");
  const task = parseJsonFile<CurrentTask>("docs/project/current-task.json");
  const authorization = parseJsonFile<TaskAuthorization>(task.authorizationFile);
  const authorizationHash = calculateAuthorizationHash(authorization);
  const governanceHash = calculateGovernanceHash(lock);
  const authorizationCommit = findAuthorizationCommit(task.authorizationFile);
  const changedFiles = authorizationCommit ? changedFilesSinceCommit(authorizationCommit) : [];
  const instructionFiles = listInstructionFiles();
  const authorizationAtCommit = authorizationCommit
    ? JSON.parse(readFileAtCommit(authorizationCommit, task.authorizationFile)) as TaskAuthorization
    : null;

  const checks = {
    lockJsonReadable: lock.currentVersion.length > 0,
    currentTaskJsonReadable: task.taskId.length > 0,
    authorizationFileReadable: authorization.taskId.length > 0,
    dependenciesComplete: task.dependsOn.every(
      (stage) => lock.stageStatuses[stage] === "complete",
    ),
    currentTaskStageValid:
      stageBelongsToSequence(task.stage, lock) || lock.stageStatuses[task.stage] !== undefined,
    baselineCommitExists:
      task.baselineCommit.length > 0 &&
      commandSucceeds("git", ["cat-file", "-e", `${task.baselineCommit}^{commit}`]),
    authorizationFileTracked: commandSucceeds("git", [
      "ls-files",
      "--error-unmatch",
      task.authorizationFile,
    ]),
    authorizationCommitExists: authorizationCommit !== null,
    authorizationCommitIsHeadAncestor:
      authorizationCommit !== null &&
      commandSucceeds("git", ["merge-base", "--is-ancestor", authorizationCommit, "HEAD"]),
    baselineCommitIsAuthorizationAncestor:
      authorizationCommit !== null &&
      commandSucceeds("git", ["merge-base", "--is-ancestor", task.baselineCommit, authorizationCommit]),
    authorizationCommitContainsOnlyAuthorizationFile:
      authorizationCommit !== null &&
      git(["show", "--name-only", "--format=", authorizationCommit])
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .every((file) => file === task.authorizationFile),
    authorizationFileUnchanged:
      authorizationAtCommit !== null &&
      calculateAuthorizationHash(authorizationAtCommit) === authorizationHash,
    authorizationHashMatches: task.authorizationHash === authorizationHash,
    authorizedContractVersionMatches:
      task.authorizedContractVersion === authorization.contractVersion,
    authorizationMatchesCurrentTask: authorizationMatchesTask(task, authorization),
    requiredDocumentsIncludeAgents: task.requiredDocuments.includes("AGENTS.md"),
    requiredDocumentsIncludeGovernanceFiles: lock.governanceContractFiles.every((file) =>
      task.requiredDocuments.includes(file),
    ),
    mandatoryCommandsPresent: MANDATORY_COMMANDS.every((command) =>
      task.requiredCommands.includes(command),
    ),
    commandResultsPass: commandResultsPass(task),
    allowedModifyPathsNonEmpty: task.allowedModifyPaths.length > 0,
    forbiddenModifyPathsNonEmpty: task.forbiddenModifyPaths.length > 0,
    allowedForbiddenDoNotOverlap: !patternsOverlap(
      task.allowedModifyPaths,
      task.forbiddenModifyPaths,
    ),
    changedFilesWithinAllowed: changedFiles.every((file) =>
      pathMatchesAny(file, task.allowedModifyPaths),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      pathMatchesAny(file, task.forbiddenModifyPaths),
    ),
    authorizationFileNotInExecutionChanges: !changedFiles.includes(task.authorizationFile),
    instructionFilesAllowed:
      instructionFiles.length === lock.allowedInstructionFiles.length &&
      instructionFiles.every((file) => lock.allowedInstructionFiles.includes(file)),
    nestedAgentsForbidden:
      lock.nestedAgentsForbidden === true &&
      !instructionFiles.some((file) => file !== "AGENTS.md" && file.endsWith("AGENTS.md")),
    noInstructionOverride: !instructionFiles.some((file) => file.endsWith("AGENTS.override.md")),
  };

  Object.entries(checks).forEach(([key, value]) => {
    if (!value) failures.push(key);
  });

  if (failures.length > 0 && status !== "BLOCKED") status = "FAIL";

  const output = {
    status,
    failedChecks: failures,
    gitRoot,
    taskId: task.taskId,
    stage: task.stage,
    baselineCommit: task.baselineCommit,
    authorizationFile: task.authorizationFile,
    authorizationCommit,
    authorizationHash,
    authorizationGovernanceContractHash: authorization.governanceContractHash,
    currentGovernanceContractHash: governanceHash,
    changedFiles,
    instructionFiles,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (status !== "PASS") process.exitCode = 1;
};

main();
