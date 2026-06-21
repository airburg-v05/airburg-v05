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
  stageStatuses: Record<string, string>;
}

interface CurrentTask {
  taskId: string;
  stage: string;
  dependsOn: string[];
  baselineCommit: string;
  governanceContractHash: string;
  requiredDocuments: string[];
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  requiredCommands: string[];
  stopConditions: string[];
  status: "pending" | "in_progress" | "blocked" | "complete";
}

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

const changedFilesSinceBaseline = (baselineCommit: string): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-status",
    "--find-renames",
    baselineCommit,
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

const calculateGovernanceHash = (lock: GovernanceLock): string => {
  const hash = crypto.createHash("sha256");
  lock.governanceContractFiles.forEach((file) => {
    const content = readFile(file).replace(/\r\n/g, "\n").trimEnd();
    hash.update(`FILE:${file}\n${content}\nEND_FILE\n`);
  });
  return hash.digest("hex");
};

const stageBelongsToSequence = (stage: string, lock: GovernanceLock): boolean =>
  lock.executionSequence.some((item) => stage === item.id || stage.startsWith(`${item.id}-`));

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
  const governanceHash = calculateGovernanceHash(lock);
  const instructionFiles = listInstructionFiles();
  const changedFiles = task.baselineCommit
    ? changedFilesSinceBaseline(task.baselineCommit)
    : [];

  const checks = {
    lockJsonReadable: lock.currentVersion.length > 0,
    currentTaskJsonReadable: task.taskId.length > 0,
    dependenciesComplete: task.dependsOn.every(
      (stage) => lock.stageStatuses[stage] === "complete",
    ),
    currentTaskStageValid:
      stageBelongsToSequence(task.stage, lock) || lock.stageStatuses[task.stage] !== undefined,
    baselineCommitExists:
      task.baselineCommit.length > 0 &&
      commandSucceeds("git", ["cat-file", "-e", `${task.baselineCommit}^{commit}`]),
    allowedModifyPathsNonEmpty: task.allowedModifyPaths.length > 0,
    forbiddenModifyPathsNonEmpty: task.forbiddenModifyPaths.length > 0,
    changedFilesWithinAllowed: changedFiles.every((file) =>
      pathMatchesAny(file, task.allowedModifyPaths),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      pathMatchesAny(file, task.forbiddenModifyPaths),
    ),
    governanceHashMatches: task.governanceContractHash === governanceHash,
    instructionFilesAllowed:
      instructionFiles.length === lock.allowedInstructionFiles.length &&
      instructionFiles.every((file) => lock.allowedInstructionFiles.includes(file)),
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
    governanceContractHash: governanceHash,
    changedFiles,
    instructionFiles,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (status !== "PASS") process.exitCode = 1;
};

main();
