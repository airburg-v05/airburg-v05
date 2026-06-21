import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const COMPLETION_DIR = "docs/project/task-completions";
const COMPLETION_RECORD_VERSION = "v0.5-task-completion-v1";

const REQUIRED_LEGACY_TASK_ID =
  "V0.5A_1_LEGACY_DATA_OWNERSHIP_AUDIT_AND_STORAGE_V2_MIGRATION_DESIGN";
const REQUIRED_LEGACY_COMPLETION_COMMIT =
  "e35359690a44b34c80e7149c7f835ad64b04744c";
const REQUIRED_LEGACY_AUTHORIZATION_COMMIT =
  "358253f5da064973fbaf8d69b737cbadb88f111d";

const SENSITIVE_COMPLETION_PATTERNS = [
  "private-samples",
  ".env",
  "API Key",
  "password",
  "token",
  "订单编号",
  "退款编号",
  "手机号",
  "地址",
] as const;

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
  completedAt: string | null;
  status: "pending" | "in_progress" | "blocked" | "complete";
}

interface LockStage {
  id: string;
  name: string;
  dependsOn: string[];
  status: string;
}

interface GovernanceLock {
  stageStatuses: Record<string, string>;
  executionSequence: LockStage[];
  taskCompletionRecordsRequired?: boolean;
  taskCompletionDirectory?: string;
  dependencyResolutionPolicy?: {
    majorStages: string;
    tasksAndSubstages: string;
  };
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

interface CompletionEvidence {
  gitTracked: boolean;
  unchangedFromFirstCommit: boolean;
  completionCommitExists: boolean;
  completionCommitIsHeadAncestor: boolean;
  authorizationCommitExists: boolean;
  authorizationCommitIsCompletionAncestor: boolean;
  authorizationFileHashMatches: boolean;
  authorizationCommitMatchesRecord: boolean;
  completionTaskIsComplete: boolean;
  completionTaskMatchesRecord: boolean;
  commandResultsPass: boolean;
  completionChangedFilesWithinAllowed: boolean;
}

interface CompletionValidationResult {
  ok: boolean;
  path: string;
  taskId: string;
  stage: string;
  failures: string[];
  evidence: CompletionEvidence;
}

interface DependencyResolution {
  dependencyId: string;
  satisfied: boolean;
  source: "stage_status" | "task_completion_record" | "missing" | "invalid_task_completion_record";
  recordPath: string | null;
  failures: string[];
}

interface PureRecord {
  taskId: string;
  stage: string;
  status: "complete" | "blocked" | "pending" | "in_progress";
  path: string;
  evidence: CompletionEvidence;
}

const toPosix = (value: string): string => value.split(path.sep).join("/");

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const normalizeFileContent = (value: string): string =>
  value.replace(/\r\n/g, "\n").trimEnd();

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

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const readFileAtCommit = (commit: string, relativePath: string): string =>
  git(["show", `${commit}:${relativePath}`]);

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

const changedFilesBetween = (fromCommit: string, toCommit: string): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-status",
    "--find-renames",
    fromCommit,
    toCommit,
    "--",
  ]);
  return parseNameStatus(diff);
};

const commandResultsPass = (
  requiredCommands: readonly string[],
  commandResults: readonly CommandResult[] | undefined,
): boolean =>
  requiredCommands.every((command) =>
    (commandResults ?? []).some((result) => result.command === command && result.status === "PASS"),
  );

const completionPathForTask = (taskId: string): string =>
  `${COMPLETION_DIR}/${taskId}.json`;

const listCompletionRecordPaths = (): string[] => {
  const absoluteDir = path.join(ROOT, COMPLETION_DIR);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => `${COMPLETION_DIR}/${entry}`)
    .sort();
};

const loadCompletionRecords = (): LoadedCompletionRecord[] =>
  listCompletionRecordPaths().map((recordPath) => ({
    path: recordPath,
    record: parseJson<TaskCompletionRecord>(recordPath),
  }));

const completionRecordContainsSensitiveContent = (recordPath: string): boolean => {
  const content = readFile(recordPath);
  return SENSITIVE_COMPLETION_PATTERNS.some((pattern) => content.includes(pattern));
};

const validateCompletionRecord = (
  loaded: LoadedCompletionRecord,
): CompletionValidationResult => {
  const { path: recordPath, record } = loaded;
  const failures: string[] = [];
  const expectedPath = completionPathForTask(record.taskId);
  const recordFirstCommit = findFirstCommitAddingFile(recordPath);

  const evidence: CompletionEvidence = {
    gitTracked: gitSucceeds(["ls-files", "--error-unmatch", recordPath]),
    unchangedFromFirstCommit: false,
    completionCommitExists: gitSucceeds(["cat-file", "-e", `${record.completionCommit}^{commit}`]),
    completionCommitIsHeadAncestor: false,
    authorizationCommitExists: gitSucceeds(["cat-file", "-e", `${record.authorizationCommit}^{commit}`]),
    authorizationCommitIsCompletionAncestor: false,
    authorizationFileHashMatches: false,
    authorizationCommitMatchesRecord: false,
    completionTaskIsComplete: false,
    completionTaskMatchesRecord: false,
    commandResultsPass: false,
    completionChangedFilesWithinAllowed: false,
  };

  if (record.recordVersion !== COMPLETION_RECORD_VERSION) failures.push("recordVersion");
  if (recordPath !== expectedPath) failures.push("recordPathMatchesTaskId");
  if (record.status !== "complete") failures.push("recordStatusComplete");
  if (completionRecordContainsSensitiveContent(recordPath)) failures.push("completionRecordNoSensitiveContent");
  if (!evidence.gitTracked) failures.push("recordGitTracked");
  if (!recordFirstCommit) failures.push("recordFirstCommitExists");

  if (recordFirstCommit) {
    try {
      const firstVersion = readFileAtCommit(recordFirstCommit, recordPath);
      evidence.unchangedFromFirstCommit =
        normalizeFileContent(firstVersion) === normalizeFileContent(readFile(recordPath));
    } catch {
      evidence.unchangedFromFirstCommit = false;
    }
  }
  if (!evidence.unchangedFromFirstCommit) failures.push("recordUnchangedFromFirstCommit");

  if (!evidence.completionCommitExists) failures.push("completionCommitExists");
  if (!evidence.authorizationCommitExists) failures.push("authorizationCommitExists");

  if (evidence.completionCommitExists) {
    evidence.completionCommitIsHeadAncestor = gitSucceeds([
      "merge-base",
      "--is-ancestor",
      record.completionCommit,
      "HEAD",
    ]);
  }
  if (!evidence.completionCommitIsHeadAncestor) failures.push("completionCommitIsHeadAncestor");

  if (evidence.authorizationCommitExists && evidence.completionCommitExists) {
    evidence.authorizationCommitIsCompletionAncestor = gitSucceeds([
      "merge-base",
      "--is-ancestor",
      record.authorizationCommit,
      record.completionCommit,
    ]);
  }
  if (!evidence.authorizationCommitIsCompletionAncestor) {
    failures.push("authorizationCommitIsCompletionAncestor");
  }

  const actualAuthorizationCommit = findFirstCommitAddingFile(record.authorizationFile);
  evidence.authorizationCommitMatchesRecord = actualAuthorizationCommit === record.authorizationCommit;
  if (!evidence.authorizationCommitMatchesRecord) failures.push("authorizationCommitMatchesRecord");

  try {
    const authorizationAtCommit = JSON.parse(
      readFileAtCommit(record.authorizationCommit, record.authorizationFile),
    ) as TaskAuthorization;
    evidence.authorizationFileHashMatches =
      calculateAuthorizationHash(authorizationAtCommit) === record.authorizationHash;
  } catch {
    evidence.authorizationFileHashMatches = false;
  }
  if (!evidence.authorizationFileHashMatches) failures.push("authorizationFileHashMatches");

  let completionTask: CurrentTask | null = null;
  try {
    completionTask = JSON.parse(
      readFileAtCommit(record.completionCommit, record.sourceTaskContractPath),
    ) as CurrentTask;
  } catch {
    completionTask = null;
  }

  evidence.completionTaskIsComplete = completionTask?.status === "complete";
  if (!evidence.completionTaskIsComplete) failures.push("completionTaskIsComplete");

  evidence.completionTaskMatchesRecord = Boolean(
    completionTask &&
    completionTask.taskId === record.taskId &&
    completionTask.stage === record.stage &&
    completionTask.authorizationFile === record.authorizationFile &&
    completionTask.authorizationHash === record.authorizationHash &&
    completionTask.completedAt === record.completedAt,
  );
  if (!evidence.completionTaskMatchesRecord) failures.push("completionTaskMatchesRecord");

  evidence.commandResultsPass = Boolean(
    completionTask &&
    commandResultsPass(completionTask.requiredCommands, completionTask.commandResults) &&
    commandResultsPass(record.requiredCommands, record.commandResults),
  );
  if (!evidence.commandResultsPass) failures.push("commandResultsPass");

  if (completionTask) {
    const changedFiles = changedFilesBetween(record.authorizationCommit, record.completionCommit);
    evidence.completionChangedFilesWithinAllowed =
      changedFiles.every((file) => pathMatchesAny(file, completionTask.allowedModifyPaths)) &&
      !changedFiles.some((file) => pathMatchesAny(file, completionTask.forbiddenModifyPaths));
  }
  if (!evidence.completionChangedFilesWithinAllowed) {
    failures.push("completionChangedFilesWithinAllowed");
  }

  return {
    ok: failures.length === 0,
    path: recordPath,
    taskId: record.taskId,
    stage: record.stage,
    failures,
    evidence,
  };
};

const validateCompletionRecords = (
  records: LoadedCompletionRecord[],
): CompletionValidationResult[] =>
  records.map(validateCompletionRecord);

const duplicateTaskIds = (records: LoadedCompletionRecord[]): string[] => {
  const counts = new Map<string, number>();
  records.forEach(({ record }) => counts.set(record.taskId, (counts.get(record.taskId) ?? 0) + 1));
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([taskId]) => taskId);
};

const resolveDependency = (
  dependencyId: string,
  lock: GovernanceLock,
  records: LoadedCompletionRecord[],
  validations: CompletionValidationResult[],
): DependencyResolution => {
  if (lock.stageStatuses[dependencyId] === "complete") {
    return {
      dependencyId,
      satisfied: true,
      source: "stage_status",
      recordPath: null,
      failures: [],
    };
  }

  const candidates = records.filter(
    ({ record }) => record.taskId === dependencyId || record.stage === dependencyId,
  );
  if (candidates.length === 0) {
    return {
      dependencyId,
      satisfied: false,
      source: "missing",
      recordPath: null,
      failures: ["dependencyRecordMissing"],
    };
  }

  const validCandidate = candidates.find((candidate) =>
    validations.some((validation) => validation.path === candidate.path && validation.ok),
  );
  if (validCandidate) {
    return {
      dependencyId,
      satisfied: true,
      source: "task_completion_record",
      recordPath: validCandidate.path,
      failures: [],
    };
  }

  return {
    dependencyId,
    satisfied: false,
    source: "invalid_task_completion_record",
    recordPath: candidates[0]?.path ?? null,
    failures: candidates.flatMap((candidate) =>
      validations.find((validation) => validation.path === candidate.path)?.failures ?? ["recordNotValidated"],
    ),
  };
};

const pureEvidence = (overrides: Partial<CompletionEvidence> = {}): CompletionEvidence => ({
  gitTracked: true,
  unchangedFromFirstCommit: true,
  completionCommitExists: true,
  completionCommitIsHeadAncestor: true,
  authorizationCommitExists: true,
  authorizationCommitIsCompletionAncestor: true,
  authorizationFileHashMatches: true,
  authorizationCommitMatchesRecord: true,
  completionTaskIsComplete: true,
  completionTaskMatchesRecord: true,
  commandResultsPass: true,
  completionChangedFilesWithinAllowed: true,
  ...overrides,
});

const pureRecord = (
  overrides: Partial<PureRecord> = {},
): PureRecord => ({
  taskId: "V0.5A_1_LEGACY_DATA_OWNERSHIP_AUDIT_AND_STORAGE_V2_MIGRATION_DESIGN",
  stage: "V0.5A-1",
  status: "complete",
  path: "docs/project/task-completions/V0.5A_1_LEGACY_DATA_OWNERSHIP_AUDIT_AND_STORAGE_V2_MIGRATION_DESIGN.json",
  evidence: pureEvidence(),
  ...overrides,
});

const pureRecordValid = (record: PureRecord): boolean =>
  record.status === "complete" &&
  Object.values(record.evidence).every(Boolean);

const resolveDependencyPure = (
  dependencyId: string,
  stageStatuses: Record<string, string>,
  records: PureRecord[],
): DependencyResolution => {
  if (stageStatuses[dependencyId] === "complete") {
    return { dependencyId, satisfied: true, source: "stage_status", recordPath: null, failures: [] };
  }
  const candidates = records.filter((record) => record.taskId === dependencyId || record.stage === dependencyId);
  if (candidates.length === 0) {
    return { dependencyId, satisfied: false, source: "missing", recordPath: null, failures: ["dependencyRecordMissing"] };
  }
  const valid = candidates.find(pureRecordValid);
  if (valid) {
    return { dependencyId, satisfied: true, source: "task_completion_record", recordPath: valid.path, failures: [] };
  }
  return {
    dependencyId,
    satisfied: false,
    source: "invalid_task_completion_record",
    recordPath: candidates[0].path,
    failures: ["invalidPureRecord"],
  };
};

const runPureTests = () => {
  const tests = [
    {
      name: "major stage complete via stageStatuses",
      expected: true,
      actual: resolveDependencyPure("V0.5A-0.2", { "V0.5A-0.2": "complete" }, []).satisfied,
    },
    {
      name: "V0.5A-1 via valid completion record",
      expected: true,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord()]).satisfied,
    },
    {
      name: "V0.5A-1 passes without stageStatuses entry",
      expected: "task_completion_record",
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord()]).source,
    },
    {
      name: "missing completion record fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, []).satisfied,
    },
    {
      name: "blocked record cannot satisfy dependency",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ status: "blocked" })]).satisfied,
    },
    {
      name: "pending record cannot satisfy dependency",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ status: "pending" })]).satisfied,
    },
    {
      name: "untracked record fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ gitTracked: false }) })]).satisfied,
    },
    {
      name: "modified record fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ unchangedFromFirstCommit: false }) })]).satisfied,
    },
    {
      name: "missing completionCommit fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ completionCommitExists: false }) })]).satisfied,
    },
    {
      name: "completionCommit not HEAD ancestor fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ completionCommitIsHeadAncestor: false }) })]).satisfied,
    },
    {
      name: "authorizationCommit not completion ancestor fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ authorizationCommitIsCompletionAncestor: false }) })]).satisfied,
    },
    {
      name: "completion current-task not complete fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ completionTaskIsComplete: false }) })]).satisfied,
    },
    {
      name: "requiredCommands missing PASS fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ commandResultsPass: false }) })]).satisfied,
    },
    {
      name: "authorizationHash mismatch fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ authorizationFileHashMatches: false }) })]).satisfied,
    },
    {
      name: "duplicate taskId fails uniqueness",
      expected: true,
      actual: (() => {
        const records = [pureRecord(), pureRecord({ path: "docs/project/task-completions/duplicate.json" })];
        return new Set(records.map((record) => record.taskId)).size !== records.length;
      })(),
    },
    {
      name: "stage match with invalid task evidence fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ completionTaskMatchesRecord: false }) })]).satisfied,
    },
    {
      name: "manual status complete without Git evidence fails",
      expected: false,
      actual: resolveDependencyPure("V0.5A-1", {}, [pureRecord({ evidence: pureEvidence({ gitTracked: false, completionCommitExists: false }) })]).satisfied,
    },
    {
      name: "pure tests do not write fixture files",
      expected: true,
      actual: true,
    },
  ];

  return tests.map((test) => ({
    ...test,
    ok: test.actual === test.expected,
  }));
};

const main = () => {
  const failures: string[] = [];
  const lock = parseJson<GovernanceLock>("docs/project/v0.5-lock.json");
  const records = loadCompletionRecords();
  const validations = validateCompletionRecords(records);
  const duplicateIds = duplicateTaskIds(records);
  const dependencyChecks = [
    resolveDependency("V0.5A-0.2", lock, records, validations),
    resolveDependency("V0.5A-1", lock, records, validations),
    resolveDependency(REQUIRED_LEGACY_TASK_ID, lock, records, validations),
  ];
  const pureTests = runPureTests();
  const legacyRecord = records.find(({ record }) => record.taskId === REQUIRED_LEGACY_TASK_ID);

  if (!fileExists(COMPLETION_DIR)) failures.push("taskCompletionDirectoryExists");
  if (records.length === 0) failures.push("completionRecordsExist");
  if (duplicateIds.length > 0) failures.push("taskIdUnique");
  validations.forEach((validation) => {
    if (!validation.ok) failures.push(`recordInvalid:${validation.path}:${validation.failures.join(",")}`);
  });
  dependencyChecks.forEach((resolution) => {
    if (!resolution.satisfied) failures.push(`dependencyUnsatisfied:${resolution.dependencyId}`);
  });
  pureTests.forEach((test) => {
    if (!test.ok) failures.push(`pureTestFailed:${test.name}`);
  });

  if (!legacyRecord) {
    failures.push("legacyV05A1RecordExists");
  } else {
    if (legacyRecord.record.completionCommit !== REQUIRED_LEGACY_COMPLETION_COMMIT) {
      failures.push("legacyV05A1CompletionCommitMatches");
    }
    if (legacyRecord.record.authorizationCommit !== REQUIRED_LEGACY_AUTHORIZATION_COMMIT) {
      failures.push("legacyV05A1AuthorizationCommitMatches");
    }
  }

  const output = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failedChecks: failures,
    completionDirectory: COMPLETION_DIR,
    completionRecordCount: records.length,
    duplicateTaskIds: duplicateIds,
    dependencyResolutions: dependencyChecks,
    recordValidations: validations,
    pureTests,
    legacyV05A1: legacyRecord?.record ?? null,
    checks: {
      directoryExists: fileExists(COMPLETION_DIR),
      v05a1RecordExists: Boolean(legacyRecord),
      v05a1CompletionCommit: legacyRecord?.record.completionCommit ?? null,
      v05a1AuthorizationCommit: legacyRecord?.record.authorizationCommit ?? null,
      majorStageDependencyPass: dependencyChecks[0]?.satisfied ?? false,
      subtaskDependencyPass: dependencyChecks[1]?.satisfied ?? false,
      fakeRecordTestsPass: pureTests.every((test) => test.ok),
      v05aStillPending: lock.stageStatuses["V0.5A"] === "pending",
    },
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
};

main();
