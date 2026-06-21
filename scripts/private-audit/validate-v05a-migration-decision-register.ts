import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_AUDIT_COMMIT = "e35359690a44b34c80e7149c7f835ad64b04744c";
const DECISION_MARKDOWN = "docs/decisions/V05A_MIGRATION_DECISION_REGISTER.md";
const DECISION_JSON = "docs/decisions/v0.5a-migration-decisions.json";
const CURRENT_TASK = "docs/project/current-task.json";

const REQUIRED_SOURCE_FILES = [
  "docs/audits/V05A_LEGACY_DATA_OWNERSHIP_AUDIT.md",
  "docs/audits/v0.5a-legacy-data-inventory.json",
  "docs/architecture/V05A_STORAGE_V2_MIGRATION_DESIGN.md",
  "docs/architecture/v0.5a-storage-v2-contract.json",
  "docs/decisions/ADR-002-storage-v2-persistence-and-migration.md",
] as const;

const REQUIRED_LEGACY_KEYS = [
  "airburg_tmall_analysis_v2",
  "airburg_tmall_series_groups_v1",
  "airburg_tmall_targets_v1",
  "airburg:last-analysis",
  "airburg:demo-session",
] as const;

const REQUIRED_DECISION_IDS = [
  "MDR-001",
  "MDR-002",
  "MDR-003",
  "MDR-004",
  "MDR-005",
  "MDR-006",
  "MDR-007",
  "MDR-008",
  "MDR-009",
  "MDR-010",
  "MDR-011",
  "MDR-012",
  "MDR-013",
  "MDR-014",
  "MDR-015",
  "MDR-016",
  "MDR-017",
  "MDR-018",
  "MDR-019",
  "MDR-020",
  "MDR-021",
  "MDR-022",
  "MDR-023",
  "MDR-024",
] as const;

interface CurrentTask {
  taskId: string;
  stage: string;
  authorizationFile: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface GovernanceLock {
  stageStatuses: Record<string, string>;
}

interface DecisionEvidence {
  file: string;
  sectionOrJsonPath: string;
}

interface MigrationDecision {
  id: string;
  category: string;
  title: string;
  sourceEvidence: DecisionEvidence[];
  riskLevel: "critical" | "high" | "medium" | "low";
  decisionType: "technical_default" | "business_decision" | "contract_gap";
  decision: string;
  rationale: string;
  implementationStage: string;
  validationRequirement: string;
  blocksV05A2: boolean;
  approved: boolean;
}

interface LegacyKeyPolicy {
  storageKey: string;
  policy: string;
  entersV2BusinessRepository: boolean;
  copyRawRows: boolean;
  autoClear: boolean;
  decisionId: string;
}

interface DecisionRegister {
  decisionRegisterVersion: string;
  sourceAuditCommit: string;
  sourceFiles: string[];
  status: "approved_for_v0.5a_2" | "blocked";
  decisions: MigrationDecision[];
  migrationBlockers: unknown[];
  resolvedMigrationBlockers: Array<{
    sourceItem: string;
    resolvedByDecisionId: string;
    blocksV05A2: boolean;
  }>;
  unresolvedDecisions: unknown[];
  riskSummary: Record<"critical" | "high" | "medium" | "low", number>;
  legacyKeyPolicies: LegacyKeyPolicy[];
  defaultStorePolicy: {
    platformCode: string;
    storeId: string;
    storeName: string;
    idempotent: boolean;
    decisionId: string;
  };
  afterSalesDatePolicy: {
    allowedDateBasis: string[];
    rangeSummaryAsDerivedAggregate: boolean;
    rangeSummaryMustNotMasqueradeAsSingleBusinessDate: boolean;
    rawRowsForbidden: boolean;
    decisionIds: string[];
  };
  targetPeriodPolicy: {
    preserveExistingPeriodType: boolean;
    doNotCoerceUnsupportedPeriodType: boolean;
    contractGapDecisionId: string;
  };
  persistencePolicy: {
    v05a2Allowed: string[];
    v05a2Forbidden: string[];
    decisionIds: string[];
  };
  legacyImportBatchIdPolicy: {
    deterministic: boolean;
    inputParts: string[];
    decisionId: string;
  };
  v05a2EntryCriteria: Record<string, boolean>;
  v05a2EntryAllowed: boolean;
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

const gitRaw = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

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

const findFirstCommitAddingFile = (relativePath: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", relativePath]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedPattern === normalizedFile) return true;
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

const committedChangedFilesSince = (commit: string): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-status",
    "--find-renames",
    commit,
    "HEAD",
    "--",
  ]);
  return parseNameStatus(diff);
};

const workingTreeChangedFiles = (): string[] => {
  const status = gitRaw(["-c", "core.quotepath=false", "status", "--porcelain"]);
  return status
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const withoutStatus = line.slice(3);
      if (withoutStatus.includes(" -> ")) return withoutStatus.split(" -> ");
      return [withoutStatus];
    });
};

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

const countRisks = (decisions: readonly MigrationDecision[]): DecisionRegister["riskSummary"] =>
  decisions.reduce<DecisionRegister["riskSummary"]>(
    (counts, decision) => {
      counts[decision.riskLevel] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

const arraysContainSameValues = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

const run = (): void => {
  const failedChecks: string[] = [];

  const task = parseJsonFile<CurrentTask>(CURRENT_TASK);
  const lock = parseJsonFile<GovernanceLock>("docs/project/v0.5-lock.json");
  const register = parseJsonFile<DecisionRegister>(DECISION_JSON);
  const authorizationCommit = findFirstCommitAddingFile(task.authorizationFile);
  const changedFiles = unique([
    ...(authorizationCommit ? committedChangedFilesSince(authorizationCommit) : []),
    ...workingTreeChangedFiles(),
  ]).sort();

  const markdownExists = fileExists(DECISION_MARKDOWN);
  const jsonExists = fileExists(DECISION_JSON);
  const sourceFilesExistAtCommit = REQUIRED_SOURCE_FILES.every((file) =>
    commandSucceeds("git", ["cat-file", "-e", `${SOURCE_AUDIT_COMMIT}:${file}`]),
  );
  const sourceFilesUnchangedFromCommit = REQUIRED_SOURCE_FILES.every((file) =>
    commandSucceeds("git", ["diff", "--quiet", SOURCE_AUDIT_COMMIT, "--", file]),
  );
  const sourceFilesNotModifiedInTask = REQUIRED_SOURCE_FILES.every((file) =>
    !changedFiles.includes(file),
  );
  const fixedGovernanceFilesUnmodified = [
    "AGENTS.md",
    "docs/product/V05_PRODUCT_NORTH_STAR.md",
    "docs/product/V05_INFORMATION_ARCHITECTURE.md",
    "docs/architecture/V05_PLATFORM_STORE_DATA_CONTRACT.md",
    "docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md",
    "docs/design/V05_DESIGN_SYSTEM.md",
    "docs/design/V05_REFERENCE_PLATFORM_MAP.md",
    "docs/roadmap/V05_EXECUTION_SEQUENCE.md",
    "docs/quality/V05_ACCEPTANCE_GATES.md",
    "docs/project/V05_TASK_CONTRACT.md",
    "docs/project/v0.5-lock.json",
    "docs/decisions/ADR-001-platform-and-store-ownership.md",
    "docs/decisions/ADR-002-storage-v2-persistence-and-migration.md",
  ].every((file) => !changedFiles.includes(file));

  const changedFilesWithinAllowed = changedFiles.every((file) =>
    pathMatchesAny(file, task.allowedModifyPaths),
  );
  const changedFilesAvoidForbidden = changedFiles.every((file) =>
    !pathMatchesAny(file, task.forbiddenModifyPaths),
  );

  const decisions = register.decisions;
  const decisionIds = decisions.map((decision) => decision.id);
  const duplicateDecisionIds = decisionIds.length !== new Set(decisionIds).size;
  const riskSummary = countRisks(decisions);
  const riskSummaryMatches =
    riskSummary.critical === register.riskSummary.critical &&
    riskSummary.high === register.riskSummary.high &&
    riskSummary.medium === register.riskSummary.medium &&
    riskSummary.low === register.riskSummary.low;
  const highRisksHaveStagesAndValidation = decisions
    .filter((decision) => decision.riskLevel === "high")
    .every((decision) => decision.implementationStage.trim() && decision.validationRequirement.trim());
  const criticalRisksApproved = decisions
    .filter((decision) => decision.riskLevel === "critical")
    .every((decision) => decision.approved && !decision.blocksV05A2);
  const contractGapsRegistered = decisions.some((decision) => decision.decisionType === "contract_gap");
  const businessDecisionsResolved = decisions
    .filter((decision) => decision.decisionType === "business_decision")
    .every((decision) => decision.approved && !decision.blocksV05A2);
  const allSourceFilesReferenced = REQUIRED_SOURCE_FILES.every((file) =>
    register.sourceFiles.includes(file),
  );
  const allRequiredDecisionsRegistered = REQUIRED_DECISION_IDS.every((id) =>
    decisionIds.includes(id),
  );
  const allDecisionsHaveEvidence = decisions.every((decision) =>
    decision.sourceEvidence.length > 0 &&
    decision.sourceEvidence.every((evidence) =>
      REQUIRED_SOURCE_FILES.includes(evidence.file as (typeof REQUIRED_SOURCE_FILES)[number]) &&
      evidence.sectionOrJsonPath.trim(),
    ),
  );

  const legacyKeyPoliciesComplete = arraysContainSameValues(
    register.legacyKeyPolicies.map((policy) => policy.storageKey),
    [...REQUIRED_LEGACY_KEYS],
  );
  const legacyKeysPreserved = register.legacyKeyPolicies.every((policy) => !policy.autoClear);
  const lastAnalysisPolicy = register.legacyKeyPolicies.find((policy) =>
    policy.storageKey === "airburg:last-analysis",
  );
  const demoSessionPolicy = register.legacyKeyPolicies.find((policy) =>
    policy.storageKey === "airburg:demo-session",
  );
  const lastAnalysisExcludedFromBusinessRepo =
    lastAnalysisPolicy?.entersV2BusinessRepository === false &&
    lastAnalysisPolicy.copyRawRows === false &&
    lastAnalysisPolicy.autoClear === false;
  const demoSessionExcludedFromBusinessRepo =
    demoSessionPolicy?.entersV2BusinessRepository === false &&
    demoSessionPolicy.copyRawRows === false &&
    demoSessionPolicy.autoClear === false;

  const defaultStoreAccurate =
    register.defaultStorePolicy.platformCode === "tmall" &&
    register.defaultStorePolicy.storeId === "tmall-default-store" &&
    register.defaultStorePolicy.storeName === "天猫默认店铺" &&
    register.defaultStorePolicy.idempotent === true;
  const importBatchDeterministic =
    register.legacyImportBatchIdPolicy.deterministic === true &&
    arraysContainSameValues(register.legacyImportBatchIdPolicy.inputParts, [
      "legacy storage key",
      "legacy value hash",
      "migration version",
    ]);
  const afterSalesDatePolicySafe =
    arraysContainSameValues(register.afterSalesDatePolicy.allowedDateBasis, [
      "apply_date",
      "success_date",
      "payment_date",
    ]) &&
    register.afterSalesDatePolicy.rangeSummaryAsDerivedAggregate === true &&
    register.afterSalesDatePolicy.rangeSummaryMustNotMasqueradeAsSingleBusinessDate === true &&
    register.afterSalesDatePolicy.rawRowsForbidden === true;
  const targetPeriodPolicySafe =
    register.targetPeriodPolicy.preserveExistingPeriodType === true &&
    register.targetPeriodPolicy.doNotCoerceUnsupportedPeriodType === true &&
    register.targetPeriodPolicy.contractGapDecisionId === "MDR-006";
  const v05a2PersistenceBoundary =
    register.persistencePolicy.v05a2Allowed.includes("repository interfaces") &&
    register.persistencePolicy.v05a2Allowed.includes("validators") &&
    register.persistencePolicy.v05a2Allowed.includes("memory test adapter") &&
    register.persistencePolicy.v05a2Forbidden.includes("localStorage V2 writes") &&
    register.persistencePolicy.v05a2Forbidden.includes("IndexedDB") &&
    register.persistencePolicy.v05a2Forbidden.includes("active pointer writes") &&
    register.persistencePolicy.v05a2Forbidden.includes("real migration") &&
    register.persistencePolicy.v05a2Forbidden.includes("page integration");
  const entryAllowedConsistent =
    register.v05a2EntryAllowed === true &&
    register.status === "approved_for_v0.5a_2" &&
    register.migrationBlockers.length === 0 &&
    register.unresolvedDecisions.length === 0;
  const entryCriteriaAllTrue = Object.values(register.v05a2EntryCriteria).every(Boolean);
  const resolvedBlockersRegistered = register.resolvedMigrationBlockers.length >= 5 &&
    register.resolvedMigrationBlockers.every((blocker) =>
      decisionIds.includes(blocker.resolvedByDecisionId) && blocker.blocksV05A2 === false,
    );

  const markdown = markdownExists ? readFile(DECISION_MARKDOWN) : "";
  const markdownReflectsEntry =
    markdown.includes("approved_for_v0.5a_2") &&
    markdown.includes("V0.5A-2 entry allowed: **true**") &&
    markdown.includes("V0.5A-2 is interface and validator only");
  const adr002Proposed = readFile("docs/decisions/ADR-002-storage-v2-persistence-and-migration.md")
    .includes("## Status\n\nProposed");

  const checks: Record<string, boolean> = {
    markdownDecisionRegisterExists: markdownExists,
    jsonDecisionRegisterExists: jsonExists,
    sourceAuditCommitCorrect: register.sourceAuditCommit === SOURCE_AUDIT_COMMIT,
    sourceFilesCoverRequired: allSourceFilesReferenced,
    sourceFilesExistAtCommit,
    sourceFilesUnchangedFromCommit,
    sourceFilesNotModifiedInTask,
    adr002StillProposed: adr002Proposed,
    v05aStillPending: lock.stageStatuses["V0.5A"] === "pending",
    decisionsIdsUnique: !duplicateDecisionIds,
    allRequiredDecisionsRegistered,
    allDecisionsHaveEvidence,
    allDecisionsApproved: decisions.every((decision) => decision.approved),
    contractGapsRegistered,
    businessDecisionsResolved,
    resolvedBlockersRegistered,
    migrationBlockersEmpty: register.migrationBlockers.length === 0,
    unresolvedDecisionsEmpty: register.unresolvedDecisions.length === 0,
    riskSummaryMatches,
    criticalRisksApproved,
    highRisksHaveStagesAndValidation,
    legacyKeyPoliciesComplete,
    legacyKeysPreserved,
    lastAnalysisExcludedFromBusinessRepo,
    demoSessionExcludedFromBusinessRepo,
    defaultStoreAccurate,
    importBatchDeterministic,
    entityIdsStoreScopedDecision: decisionIds.includes("MDR-013"),
    rangeSummaryNotSingleBusinessDate: afterSalesDatePolicySafe,
    afterSalesRawRowsForbidden: register.afterSalesDatePolicy.rawRowsForbidden === true,
    missingDateNoCurrentDateDecision: decisionIds.includes("MDR-010"),
    storeTargetNotCompanyTargetDecision: decisionIds.includes("MDR-022"),
    targetPeriodNoLossyRewrite: targetPeriodPolicySafe,
    v05a2PersistenceBoundary,
    v05a2ForbidsIndexedDb: register.persistencePolicy.v05a2Forbidden.includes("IndexedDB"),
    v05a2ForbidsRealStorageWrites: register.persistencePolicy.v05a2Forbidden.includes("localStorage V2 writes"),
    v05a2ForbidsPageIntegration: register.persistencePolicy.v05a2Forbidden.includes("page integration"),
    migrationFailedDoesNotChangePointerDecision: decisionIds.includes("MDR-015"),
    entryAllowedConsistent,
    entryCriteriaAllTrue,
    markdownReflectsEntry,
    changedFilesWithinAllowed,
    changedFilesAvoidForbidden,
    fixedGovernanceFilesUnmodified,
    noBusinessCodeModified: changedFiles.every((file) =>
      !["app/**", "components/**", "lib/**", "types/**"].some((pattern) => matchesPathPattern(file, pattern)),
    ),
    packageFilesUnmodified: changedFiles.every((file) =>
      file !== "package.json" && file !== "package-lock.json",
    ),
    authorizationValidatorPass: commandSucceeds("npx", [
      "tsx",
      "scripts/private-audit/validate-v05-task-authorization.ts",
    ]),
    completionLedgerPass: commandSucceeds("npx", [
      "tsx",
      "scripts/private-audit/validate-v05-task-completion-ledger.ts",
    ]),
    preflightPass: commandSucceeds("npx", [
      "tsx",
      "scripts/private-audit/validate-v05-task-preflight.ts",
    ]),
    governanceLockPass: commandSucceeds("npx", [
      "tsx",
      "scripts/private-audit/validate-v05-governance-lock.ts",
    ]),
    lintPass: commandSucceeds("npm", ["run", "lint"]),
    buildPass: commandSucceeds("npm", ["run", "build"]),
  };

  for (const [name, ok] of Object.entries(checks)) {
    if (!ok) failedChecks.push(name);
  }

  const result = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    gitRoot: git(["rev-parse", "--show-toplevel"]),
    head: git(["rev-parse", "HEAD"]),
    taskId: task.taskId,
    stage: task.stage,
    authorizationFile: task.authorizationFile,
    authorizationCommit,
    changedFiles,
    sourceAuditCommit: SOURCE_AUDIT_COMMIT,
    decisionCount: decisions.length,
    decisionTypeCounts: {
      technical_default: decisions.filter((decision) => decision.decisionType === "technical_default").length,
      business_decision: decisions.filter((decision) => decision.decisionType === "business_decision").length,
      contract_gap: decisions.filter((decision) => decision.decisionType === "contract_gap").length,
    },
    migrationBlockerCount: register.migrationBlockers.length,
    unresolvedDecisionCount: register.unresolvedDecisions.length,
    riskSummary: register.riskSummary,
    v05a2EntryAllowed: register.v05a2EntryAllowed,
    checks,
  };

  console.log(JSON.stringify(result, null, 2));

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
};

run();
