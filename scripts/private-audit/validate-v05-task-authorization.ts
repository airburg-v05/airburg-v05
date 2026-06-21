import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const MANDATORY_COMMANDS = [
  "npx tsx scripts/private-audit/validate-v05-task-authorization.ts",
  "npx tsx scripts/private-audit/validate-v05-governance-lock.ts",
  "npx tsx scripts/private-audit/validate-v05-task-preflight.ts",
  "npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts",
  "npm run lint",
  "npm run build",
] as const;

const SENSITIVE_TRACKED_PATTERNS = [
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  "coverage/",
  "private-samples/",
  ".codex/",
  "logs/",
  "playwright-report/",
  "test-results/",
  "chrome-profile/",
  "browser-profile/",
  "browser-profiles/",
] as const;

const SENSITIVE_TRACKED_SUFFIXES = [".log", ".har", ".webm", ".mp4"] as const;

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

interface LoadedCompletionRecord {
  path: string;
  record: TaskCompletionRecord;
}

interface DependencyResolution {
  dependencyId: string;
  satisfied: boolean;
  source: "stage_status" | "task_completion_record" | "missing" | "invalid_task_completion_record";
  recordPath: string | null;
  failures: string[];
}

interface ValidationContext {
  baselineCommitExists: boolean;
  authorizationFileTracked: boolean;
  authorizationCommitExists: boolean;
  authorizationCommitIsHeadAncestor: boolean;
  baselineCommitIsAuthorizationAncestor: boolean;
  authorizationCommitContainsOnlyAuthorizationFile: boolean;
  authorizationFileUnchanged: boolean;
  changedFiles: string[];
  instructionFiles: string[];
  trackedFiles: string[];
  dependencyResolutions: DependencyResolution[];
}

const toPosix = (value: string): string => value.split(path.sep).join("/");

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const normalizeFileContent = (value: string): string =>
  value.replace(/\r\n/g, "\n").trimEnd();

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

const listTrackedFiles = (): string[] => {
  const stdout = git(["ls-files"]);
  return stdout ? stdout.split("\n").filter(Boolean) : [];
};

const findAuthorizationCommit = (authorizationFile: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", authorizationFile]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const readFileAtCommit = (commit: string, file: string): string =>
  git(["show", `${commit}:${file}`]);

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

const completionCommandResultsPass = (
  requiredCommands: readonly string[],
  commandResults: readonly CommandResult[] | undefined,
): boolean =>
  requiredCommands.every((command) =>
    (commandResults ?? []).some((result) => result.command === command && result.status === "PASS"),
  );

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const listCompletionRecords = (): LoadedCompletionRecord[] => {
  const dir = "docs/project/task-completions";
  const absoluteDir = path.join(ROOT, dir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => {
      const recordPath = `${dir}/${entry}`;
      return { path: recordPath, record: parseJsonFile<TaskCompletionRecord>(recordPath) };
    });
};

const validateCompletionRecordForDependency = (
  loaded: LoadedCompletionRecord,
): string[] => {
  const failures: string[] = [];
  const { path: recordPath, record } = loaded;
  const firstRecordCommit = findFirstCommitAddingFile(recordPath);

  if (record.status !== "complete") failures.push("recordStatusComplete");
  if (record.recordVersion !== "v0.5-task-completion-v1") failures.push("recordVersion");
  if (!commandSucceeds("git", ["ls-files", "--error-unmatch", recordPath])) failures.push("recordGitTracked");
  if (!firstRecordCommit) {
    failures.push("recordFirstCommitExists");
  } else if (
    normalizeFileContent(readFileAtCommit(firstRecordCommit, recordPath)) !==
    normalizeFileContent(readFile(recordPath))
  ) {
    failures.push("recordUnchangedFromFirstCommit");
  }
  if (!commandSucceeds("git", ["cat-file", "-e", `${record.completionCommit}^{commit}`])) {
    failures.push("completionCommitExists");
  } else if (!commandSucceeds("git", ["merge-base", "--is-ancestor", record.completionCommit, "HEAD"])) {
    failures.push("completionCommitIsHeadAncestor");
  }
  if (!commandSucceeds("git", ["cat-file", "-e", `${record.authorizationCommit}^{commit}`])) {
    failures.push("authorizationCommitExists");
  } else if (!commandSucceeds("git", ["merge-base", "--is-ancestor", record.authorizationCommit, record.completionCommit])) {
    failures.push("authorizationCommitIsCompletionAncestor");
  }
  if (findFirstCommitAddingFile(record.authorizationFile) !== record.authorizationCommit) {
    failures.push("authorizationCommitMatchesRecord");
  }

  try {
    const authorizationAtCommit = JSON.parse(readFileAtCommit(record.authorizationCommit, record.authorizationFile)) as TaskAuthorization;
    if (calculateAuthorizationHash(authorizationAtCommit) !== record.authorizationHash) {
      failures.push("authorizationHashMatchesRecord");
    }
  } catch {
    failures.push("authorizationReadableAtCommit");
  }

  try {
    const completionTask = JSON.parse(readFileAtCommit(record.completionCommit, record.sourceTaskContractPath)) as CurrentTask;
    if (completionTask.status !== "complete") failures.push("completionTaskIsComplete");
    if (
      completionTask.taskId !== record.taskId ||
      completionTask.stage !== record.stage ||
      completionTask.authorizationFile !== record.authorizationFile ||
      completionTask.authorizationHash !== record.authorizationHash
    ) {
      failures.push("completionTaskMatchesRecord");
    }
    if (!completionCommandResultsPass(completionTask.requiredCommands, completionTask.commandResults)) {
      failures.push("completionTaskCommandResultsPass");
    }
    if (!completionCommandResultsPass(record.requiredCommands, record.commandResults)) {
      failures.push("recordCommandResultsPass");
    }
  } catch {
    failures.push("completionTaskReadable");
  }

  return failures;
};

const resolveDependency = (
  dependencyId: string,
  lock: GovernanceLock,
  records: LoadedCompletionRecord[],
): DependencyResolution => {
  if (lock.stageStatuses[dependencyId] === "complete") {
    return { dependencyId, satisfied: true, source: "stage_status", recordPath: null, failures: [] };
  }

  const candidates = records.filter(({ record }) => record.taskId === dependencyId || record.stage === dependencyId);
  if (candidates.length === 0) {
    return { dependencyId, satisfied: false, source: "missing", recordPath: null, failures: ["dependencyRecordMissing"] };
  }

  for (const candidate of candidates) {
    const failures = validateCompletionRecordForDependency(candidate);
    if (failures.length === 0) {
      return { dependencyId, satisfied: true, source: "task_completion_record", recordPath: candidate.path, failures: [] };
    }
  }

  return {
    dependencyId,
    satisfied: false,
    source: "invalid_task_completion_record",
    recordPath: candidates[0].path,
    failures: candidates.flatMap(validateCompletionRecordForDependency),
  };
};

const trackedFileIsSensitive = (file: string): boolean =>
  SENSITIVE_TRACKED_PATTERNS.some((pattern) => file.startsWith(pattern)) ||
  SENSITIVE_TRACKED_SUFFIXES.some((suffix) => file.endsWith(suffix)) ||
  file === ".env" ||
  file.startsWith(".env.");

const validateAuthorizationContract = (
  task: CurrentTask,
  authorization: TaskAuthorization,
  lock: GovernanceLock,
  context: ValidationContext,
): string[] => {
  const authorizationHash = calculateAuthorizationHash(authorization);
  const failures: string[] = [];

  const checks = {
    dependenciesComplete: context.dependencyResolutions.every((resolution) => resolution.satisfied),
    baselineCommitExists: context.baselineCommitExists,
    authorizationFileTracked: context.authorizationFileTracked,
    authorizationCommitExists: context.authorizationCommitExists,
    authorizationCommitIsHeadAncestor: context.authorizationCommitIsHeadAncestor,
    baselineCommitIsAuthorizationAncestor: context.baselineCommitIsAuthorizationAncestor,
    authorizationCommitContainsOnlyAuthorizationFile:
      context.authorizationCommitContainsOnlyAuthorizationFile,
    authorizationFileUnchanged: context.authorizationFileUnchanged,
    authorizationHashMatches: task.authorizationHash === authorizationHash,
    authorizedContractVersionMatches:
      task.authorizedContractVersion === authorization.contractVersion,
    immutableFieldsMatchAuthorization: authorizationMatchesTask(task, authorization),
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
    changedFilesWithinAllowed: context.changedFiles.every((file) =>
      pathMatchesAny(file, task.allowedModifyPaths),
    ),
    changedFilesAvoidForbidden: !context.changedFiles.some((file) =>
      pathMatchesAny(file, task.forbiddenModifyPaths),
    ),
    authorizationFileNotInExecutionChanges: !context.changedFiles.includes(task.authorizationFile),
    rootAgentsOnly:
      context.instructionFiles.length === 1 && context.instructionFiles[0] === "AGENTS.md",
    noNestedAgents: !context.instructionFiles.some(
      (file) => file !== "AGENTS.md" && file.endsWith("AGENTS.md"),
    ),
    noAgentsOverride: !context.instructionFiles.some((file) =>
      file.endsWith("AGENTS.override.md"),
    ),
    noSensitiveTrackedFiles: !context.trackedFiles.some(trackedFileIsSensitive),
  };

  Object.entries(checks).forEach(([key, value]) => {
    if (!value) failures.push(key);
  });

  return failures;
};

const buildPureFixtures = () => {
  const authorization: TaskAuthorization = {
    taskId: "PURE_TASK",
    stage: "V0.5A-0.2",
    dependsOn: ["V0.5A-0.1"],
    governanceContractHash: "governance-hash",
    requiredDocuments: [
      "AGENTS.md",
      "docs/project/v0.5-lock.json",
      "docs/project/V05_TASK_CONTRACT.md",
    ],
    allowedModifyPaths: ["AGENTS.md", "docs/project/current-task.json"],
    forbiddenModifyPaths: ["app/**", "lib/**"],
    requiredCommands: [...MANDATORY_COMMANDS],
    stopConditions: ["Stop on conflict."],
    authorizedAt: "2026-06-21T00:00:00+08:00",
    contractVersion: "v0.5-task-authorization-v1",
  };
  const task: CurrentTask = {
    ...authorization,
    baselineCommit: "baseline",
    authorizationFile: "docs/project/task-authorizations/PURE_TASK.json",
    authorizationHash: calculateAuthorizationHash(authorization),
    authorizedContractVersion: authorization.contractVersion,
    commandResults: [],
    startedAt: "2026-06-21T00:00:00+08:00",
    completedAt: null,
    status: "in_progress",
  };
  const lock: GovernanceLock = {
    currentVersion: "V0.5A-0.2",
    governanceContractFiles: [
      "AGENTS.md",
      "docs/project/v0.5-lock.json",
      "docs/project/V05_TASK_CONTRACT.md",
    ],
    executionSequence: [],
    allowedInstructionFiles: ["AGENTS.md"],
    nestedAgentsForbidden: true,
    stageStatuses: {
      "V0.5A-0.1": "complete",
    },
  };
  const context: ValidationContext = {
    baselineCommitExists: true,
    authorizationFileTracked: true,
    authorizationCommitExists: true,
    authorizationCommitIsHeadAncestor: true,
    baselineCommitIsAuthorizationAncestor: true,
    authorizationCommitContainsOnlyAuthorizationFile: true,
    authorizationFileUnchanged: true,
    changedFiles: ["AGENTS.md", "docs/project/current-task.json"],
    instructionFiles: ["AGENTS.md"],
    trackedFiles: ["AGENTS.md"],
    dependencyResolutions: [
      {
        dependencyId: "V0.5A-0.1",
        satisfied: true,
        source: "stage_status",
        recordPath: null,
        failures: [],
      },
    ],
  };

  return { authorization, task, lock, context };
};

const runPureTests = () => {
  const cases: Array<{ name: string; shouldPass: boolean; mutate: ReturnType<typeof buildPureFixtures> extends infer T ? (fixtures: T) => void : never }> = [
    {
      name: "original authorization contract",
      shouldPass: true,
      mutate: () => undefined,
    },
    {
      name: "current-task expands allowedModifyPaths",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.allowedModifyPaths = [...fixtures.task.allowedModifyPaths, "app/**"];
      },
    },
    {
      name: "current-task deletes forbiddenModifyPaths",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.forbiddenModifyPaths = [];
      },
    },
    {
      name: "current-task modifies stopConditions",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.stopConditions = ["Different stop condition."];
      },
    },
    {
      name: "current-task modifies requiredCommands",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.requiredCommands = fixtures.task.requiredCommands.filter(
          (command) => command !== "npm run build",
        );
      },
    },
    {
      name: "current-task only updates mutable status and commandResults",
      shouldPass: true,
      mutate: (fixtures) => {
        fixtures.task.status = "complete";
        fixtures.task.completedAt = "2026-06-21T01:00:00+08:00";
        fixtures.task.commandResults = fixtures.task.requiredCommands.map((command) => ({
          command,
          status: "PASS",
        }));
      },
    },
    {
      name: "authorization file modified after commit",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.context.authorizationFileUnchanged = false;
      },
    },
    {
      name: "authorization hash forged",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.authorizationHash = "forged";
      },
    },
    {
      name: "authorization commit not ancestor",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.context.authorizationCommitIsHeadAncestor = false;
      },
    },
    {
      name: "nested AGENTS.md",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.context.instructionFiles = ["AGENTS.md", "docs/AGENTS.md"];
      },
    },
    {
      name: "AGENTS.override.md",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.context.instructionFiles = ["AGENTS.md", "AGENTS.override.md"];
      },
    },
    {
      name: "allowed and forbidden overlap",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.authorization.allowedModifyPaths = ["app/**"];
        fixtures.task.allowedModifyPaths = ["app/**"];
      },
    },
    {
      name: "complete status missing command results",
      shouldPass: false,
      mutate: (fixtures) => {
        fixtures.task.status = "complete";
        fixtures.task.commandResults = [
          {
            command: "npm run lint",
            status: "PASS",
          },
        ];
      },
    },
  ];

  return cases.map((testCase) => {
    const fixtures = buildPureFixtures();
    testCase.mutate(fixtures);
    const failures = validateAuthorizationContract(
      fixtures.task,
      fixtures.authorization,
      fixtures.lock,
      fixtures.context,
    );
    const passed = failures.length === 0;
    return {
      name: testCase.name,
      expected: testCase.shouldPass ? "PASS" : "FAIL",
      actual: passed ? "PASS" : "FAIL",
      ok: passed === testCase.shouldPass,
      failures,
    };
  });
};

const buildRepositoryContext = (
  task: CurrentTask,
  authorization: TaskAuthorization,
  lock: GovernanceLock,
): ValidationContext & { authorizationCommit: string | null; authorizationHash: string } => {
  const authorizationCommit = findAuthorizationCommit(task.authorizationFile);
  const authorizationAtCommit = authorizationCommit
    ? JSON.parse(readFileAtCommit(authorizationCommit, task.authorizationFile)) as TaskAuthorization
    : null;
  const authorizationHash = calculateAuthorizationHash(authorization);
  const authorizationHashAtCommit = authorizationAtCommit
    ? calculateAuthorizationHash(authorizationAtCommit)
    : null;
  const completionRecords = listCompletionRecords();
  const dependencyResolutions = task.dependsOn.map((dependencyId) =>
    resolveDependency(dependencyId, lock, completionRecords),
  );

  return {
    baselineCommitExists: commandSucceeds("git", [
      "cat-file",
      "-e",
      `${task.baselineCommit}^{commit}`,
    ]),
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
    authorizationFileUnchanged: authorizationHashAtCommit === authorizationHash,
    changedFiles: authorizationCommit ? changedFilesSinceCommit(authorizationCommit) : [],
    instructionFiles: listInstructionFiles(),
    trackedFiles: listTrackedFiles(),
    dependencyResolutions,
    authorizationCommit,
    authorizationHash,
  };
};

const main = () => {
  const pureTests = runPureTests();
  const pureTestsPass = pureTests.every((test) => test.ok);

  const lock = parseJsonFile<GovernanceLock>("docs/project/v0.5-lock.json");
  const task = parseJsonFile<CurrentTask>("docs/project/current-task.json");
  const authorization = parseJsonFile<TaskAuthorization>(task.authorizationFile);
  const context = buildRepositoryContext(task, authorization, lock);
  const repositoryFailures = validateAuthorizationContract(task, authorization, lock, context);
  const status = pureTestsPass && repositoryFailures.length === 0 ? "PASS" : "FAIL";

  const output = {
    status,
    failedChecks: repositoryFailures,
    pureTests,
    authorizationFile: task.authorizationFile,
    authorizationCommit: context.authorizationCommit,
    authorizationHash: context.authorizationHash,
    dependencyResolutions: context.dependencyResolutions,
    changedFiles: context.changedFiles,
    instructionFiles: context.instructionFiles,
    sensitiveTrackedFiles: context.trackedFiles.filter(trackedFileIsSensitive),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (status !== "PASS") process.exitCode = 1;
};

main();
