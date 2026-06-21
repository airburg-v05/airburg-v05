import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "AGENTS.md",
  "docs/product/V05_PRODUCT_NORTH_STAR.md",
  "docs/product/V05_INFORMATION_ARCHITECTURE.md",
  "docs/architecture/V05_PLATFORM_STORE_DATA_CONTRACT.md",
  "docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md",
  "docs/design/V05_DESIGN_SYSTEM.md",
  "docs/design/V05_REFERENCE_PLATFORM_MAP.md",
  "docs/roadmap/V05_EXECUTION_SEQUENCE.md",
  "docs/quality/V05_ACCEPTANCE_GATES.md",
  "docs/decisions/ADR-001-platform-and-store-ownership.md",
  "docs/project/V05_TASK_CONTRACT.md",
  "docs/project/v0.5-lock.json",
  "docs/project/current-task.json",
  "scripts/private-audit/validate-v05-governance-lock.ts",
  "scripts/private-audit/validate-v05-task-preflight.ts",
] as const;

const REQUIRED_STAGE_SEQUENCE = [
  "V0.5A",
  "V0.5B",
  "V0.5C",
  "V0.5D",
  "V0.5E",
  "V0.5F",
  "V0.5G",
] as const;

const SENSITIVE_TRACKED_PATTERNS = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "private-samples/",
  ".env",
  ".env.",
] as const;

interface LockStage {
  id: string;
  name: string;
  dependsOn: string[];
  status: string;
}

interface GovernanceLock {
  currentVersion: string;
  lockName: string;
  multiPlatform: boolean;
  multiStore: boolean;
  storeOwnershipRequired: boolean;
  legacyMigrationRequired: boolean;
  gitBaselineRequired: boolean;
  currentTaskContractRequired: boolean;
  governanceContractHashRequired: boolean;
  serverDatabaseForbidden: boolean;
  indexedDbRequiresExplicitStageAuthorization: boolean;
  allowedInstructionFiles: string[];
  forbiddenInstructionFiles: string[];
  governanceContractFiles: string[];
  currentStageDoesNotImplement: string[];
  dataOwnershipRequiredFields: string[];
  privacy: {
    afterSalesSafeAggregatesOnly: boolean;
    forbidSensitiveAfterSalesDetails: boolean;
    forbiddenOutput: string[];
  };
  freezeRules: string[];
  executionSequence: LockStage[];
  forbiddenModifyPaths: string[];
  allowedInThisTask: string[];
  stageStatuses: Record<string, string>;
}

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
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
  commandResults?: CommandResult[];
  stopConditions: string[];
  status: "pending" | "in_progress" | "blocked" | "complete";
}

const toPosix = (value: string): string => value.split(path.sep).join("/");

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const parseJsonFile = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const runCommand = (command: string, args: string[]): boolean => {
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

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

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

const parseGitStatus = (): string[] => {
  const stdout = execFileSync(
    "git",
    ["-c", "core.quotepath=false", "status", "--short", "--untracked-files=all"],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!stdout) return [];

  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .flatMap((line) => {
      const rawPath = line.slice(3);
      if (rawPath.includes(" -> ")) return rawPath.split(" -> ");
      return [rawPath];
    });
};

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
  return [
    ...parseNameStatus(diff),
    ...untracked.split("\n").map((line) => line.trim()).filter(Boolean),
  ];
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

const listTrackedFiles = (): string[] => {
  const stdout = git(["ls-files"]);
  return stdout ? stdout.split("\n").filter(Boolean) : [];
};

const calculateGovernanceHash = (lock: GovernanceLock): string => {
  const hash = crypto.createHash("sha256");
  lock.governanceContractFiles.forEach((file) => {
    const content = readFile(file).replace(/\r\n/g, "\n").trimEnd();
    hash.update(`FILE:${file}\n${content}\nEND_FILE\n`);
  });
  return hash.digest("hex");
};

const commandResultsPass = (task: CurrentTask): boolean => {
  if (task.status !== "complete") return true;

  const results = task.commandResults ?? [];
  return task.requiredCommands.every((command) =>
    results.some((result) => result.command === command && result.status === "PASS"),
  );
};

const main = () => {
  const failures: string[] = [];
  let gitRoot = "";

  try {
    gitRoot = git(["rev-parse", "--show-toplevel"]);
  } catch {
    failures.push("gitRootAvailable");
  }

  const normalizedRoot = path.resolve(ROOT);
  const normalizedGitRoot = gitRoot ? path.resolve(gitRoot) : "";
  const rootIsGitRoot = normalizedRoot === normalizedGitRoot;
  if (!rootIsGitRoot) failures.push("currentWorkingDirectoryIsGitRoot");

  const lock = parseJsonFile<GovernanceLock>("docs/project/v0.5-lock.json");
  const task = parseJsonFile<CurrentTask>("docs/project/current-task.json");
  const agents = readFile("AGENTS.md");
  const sequenceIds = lock.executionSequence.map((stage) => stage.id);
  const stageById = new Map(lock.executionSequence.map((stage) => [stage.id, stage]));
  const changedFiles = Array.from(
    new Set([...parseGitStatus(), ...changedFilesSinceBaseline(task.baselineCommit)]),
  ).sort();
  const instructionFiles = listInstructionFiles();
  const trackedFiles = listTrackedFiles();
  const governanceHash = calculateGovernanceHash(lock);
  const remotes = git(["remote", "-v"]);
  const lintPass = runCommand("npm", ["run", "lint"]);
  const buildPass = runCommand("npm", ["run", "build"]);

  const checks = {
    allFixedDocumentsExist: REQUIRED_FILES.every(fileExists),
    agentsReferencesCurrentTask: agents.includes("docs/project/current-task.json"),
    agentsRequiresPreflight: agents.includes("PRE-FLIGHT"),
    agentsBlocksOnPreflightFailure: agents.includes("BLOCKED"),
    executionSequenceComplete:
      REQUIRED_STAGE_SEQUENCE.every((stage) => sequenceIds.includes(stage)) &&
      sequenceIds.length === REQUIRED_STAGE_SEQUENCE.length,
    executionSequenceUnique: unique(sequenceIds),
    lockJsonParseable: lock.currentVersion === "V0.5A-0.1" && lock.lockName.length > 0,
    multiPlatformTrue: lock.multiPlatform === true,
    multiStoreTrue: lock.multiStore === true,
    storeOwnershipRequiredTrue: lock.storeOwnershipRequired === true,
    legacyMigrationRequiredTrue: lock.legacyMigrationRequired === true,
    gitBaselineRequired: lock.gitBaselineRequired === true,
    currentTaskContractRequired: lock.currentTaskContractRequired === true,
    governanceContractHashRequired: lock.governanceContractHashRequired === true,
    serverDatabaseForbidden: lock.serverDatabaseForbidden === true,
    indexedDbRequiresExplicitAuthorization:
      lock.indexedDbRequiresExplicitStageAuthorization === true,
    allowedInstructionFilesOnly:
      instructionFiles.length === 1 && instructionFiles[0] === "AGENTS.md",
    noAgentsOverride: !instructionFiles.some((file) => file.endsWith("AGENTS.override.md")),
    afterSalesPrivacyBoundaryExists:
      lock.privacy.afterSalesSafeAggregatesOnly === true &&
      lock.privacy.forbidSensitiveAfterSalesDetails === true,
    forbidClearingLegacyDataExists:
      [
        readFile("AGENTS.md"),
        readFile("docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md"),
        JSON.stringify(lock),
      ].join("\n").includes("clear legacy data") ||
      readFile("docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md").includes(
        "must not be cleared",
      ),
    v05aBeforeV05b: stageById.get("V0.5B")?.dependsOn.includes("V0.5A") ?? false,
    v05bBeforeV05c: stageById.get("V0.5C")?.dependsOn.includes("V0.5B") ?? false,
    noCurrentAiBackendDatabaseImplementation:
      ["AI", "backend API", "server database"].every((item) =>
        lock.currentStageDoesNotImplement.includes(item),
      ) && !lock.currentStageDoesNotImplement.includes("database implemented"),
    currentTaskExists: task.taskId.length > 0 && task.stage.length > 0,
    currentTaskBaselineExists: runCommand("git", [
      "cat-file",
      "-e",
      `${task.baselineCommit}^{commit}`,
    ]),
    currentTaskAllowedPathsNonEmpty: task.allowedModifyPaths.length > 0,
    currentTaskForbiddenPathsNonEmpty: task.forbiddenModifyPaths.length > 0,
    governanceHashMatchesTask: task.governanceContractHash === governanceHash,
    commandResultsPass: commandResultsPass(task),
    changedFilesAreAllowed: changedFiles.every((file) =>
      pathMatchesAny(file, task.allowedModifyPaths),
    ),
    changedFilesDoNotHitForbidden: !changedFiles.some((file) =>
      pathMatchesAny(file, task.forbiddenModifyPaths),
    ),
    sensitiveFilesNotTracked: !trackedFiles.some((file) =>
      SENSITIVE_TRACKED_PATTERNS.some((pattern) => file === pattern || file.startsWith(pattern)),
    ),
    noGitRemote: remotes.length === 0,
    lintPass,
    buildPass,
  };

  Object.entries(checks).forEach(([key, value]) => {
    if (!value) failures.push(key);
  });

  const output = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failedChecks: failures,
    gitRoot,
    baselineCommit: task.baselineCommit,
    governanceContractHash: governanceHash,
    instructionFiles,
    changedFiles,
    remotes: remotes ? remotes.split("\n").filter(Boolean) : [],
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
};

main();
