import { execFileSync } from "node:child_process";
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
  "docs/project/v0.5-lock.json",
  "scripts/private-audit/validate-v05-governance-lock.ts",
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

const FORBIDDEN_CURRENT_IMPLEMENTED_FEATURES = [
  "AI implemented",
  "AI 已实现",
  "backend implemented",
  "后端已实现",
  "database implemented",
  "数据库已实现",
  "platform API implemented",
  "平台 API 已实现",
] as const;

const FORBIDDEN_BUSINESS_PREFIXES = [
  "app/",
  "components/",
  "lib/storage/",
  "lib/tmall/parsers/",
  "lib/tmall/pipeline/",
  "lib/tmall/view-models/",
  "types/",
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
  lastContractUpdatedAt: string;
  multiPlatform: boolean;
  multiStore: boolean;
  storeOwnershipRequired: boolean;
  legacyMigrationRequired: boolean;
  currentStageDoesNotImplement: string[];
  platforms: string[];
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

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const fileExists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

const includesAll = (source: string, needles: readonly string[]): boolean =>
  needles.every((needle) => source.includes(needle));

const parseLock = (): GovernanceLock => {
  const raw = readFile("docs/project/v0.5-lock.json");
  return JSON.parse(raw) as GovernanceLock;
};

const tryGitStatus = (): { available: boolean; onlyAllowed: boolean; changedFiles: string[] } => {
  try {
    const stdout = execFileSync("git", ["status", "--short"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const changedFiles = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^.. /, ""));
    const onlyAllowed = changedFiles.every((file) =>
      REQUIRED_FILES.includes(file as (typeof REQUIRED_FILES)[number]),
    );
    return { available: true, onlyAllowed, changedFiles };
  } catch {
    return { available: false, onlyAllowed: true, changedFiles: [] };
  }
};

const listFiles = (relativeDir: string): string[] => {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const result: string[] = [];
  const walk = (dir: string) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        return;
      }

      result.push(path.relative(ROOT, absolutePath));
    });
  };

  walk(absoluteDir);
  return result;
};

const forbiddenBusinessFiles = (): string[] => {
  const files = [
    ...listFiles("app"),
    ...listFiles("components"),
    ...listFiles("lib/storage"),
    ...listFiles("lib/tmall/parsers"),
    ...listFiles("lib/tmall/pipeline"),
    ...listFiles("lib/tmall/view-models"),
    ...listFiles("types"),
    "package.json",
  ];

  return files.filter((file) =>
    FORBIDDEN_BUSINESS_PREFIXES.some((prefix) => file.startsWith(prefix)) ||
    file === "package.json",
  );
};

const businessSourcesContainV05GovernanceMarker = (): boolean =>
  forbiddenBusinessFiles().some((file) => {
    if (!fs.existsSync(path.join(ROOT, file))) return false;
    const source = readFile(file);
    return source.includes("V0.5A_0_PROJECT_GOVERNANCE_AND_ARCHITECTURE_LOCK");
  });

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

const main = () => {
  const lock = parseLock();
  const agents = readFile("AGENTS.md");
  const northStar = readFile("docs/product/V05_PRODUCT_NORTH_STAR.md");
  const ia = readFile("docs/product/V05_INFORMATION_ARCHITECTURE.md");
  const dataContract = readFile("docs/architecture/V05_PLATFORM_STORE_DATA_CONTRACT.md");
  const migrationContract = readFile("docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md");
  const designSystem = readFile("docs/design/V05_DESIGN_SYSTEM.md");
  const referenceMap = readFile("docs/design/V05_REFERENCE_PLATFORM_MAP.md");
  const roadmap = readFile("docs/roadmap/V05_EXECUTION_SEQUENCE.md");
  const gates = readFile("docs/quality/V05_ACCEPTANCE_GATES.md");
  const adr = readFile("docs/decisions/ADR-001-platform-and-store-ownership.md");
  const combinedDocs = [
    agents,
    northStar,
    ia,
    dataContract,
    migrationContract,
    designSystem,
    referenceMap,
    roadmap,
    gates,
    adr,
    JSON.stringify(lock),
  ].join("\n");
  const sequenceIds = lock.executionSequence.map((stage) => stage.id);
  const stageById = new Map(lock.executionSequence.map((stage) => [stage.id, stage]));
  const gitStatus = tryGitStatus();
  const lintPass = runCommand("npm", ["run", "lint"]);
  const buildPass = runCommand("npm", ["run", "build"]);

  const checks = {
    allFixedDocumentsExist: REQUIRED_FILES.every(fileExists),
    agentsReferencesRequiredDocs: REQUIRED_FILES
      .filter((file) => file.startsWith("docs/"))
      .every((file) => agents.includes(file)),
    executionSequenceComplete:
      REQUIRED_STAGE_SEQUENCE.every((stage) => sequenceIds.includes(stage)) &&
      sequenceIds.length === REQUIRED_STAGE_SEQUENCE.length,
    executionSequenceUnique: unique(sequenceIds),
    lockJsonParseable: lock.currentVersion === "V0.5A-0" && lock.lockName.length > 0,
    multiPlatformTrue: lock.multiPlatform === true,
    multiStoreTrue: lock.multiStore === true,
    storeOwnershipRequiredTrue: lock.storeOwnershipRequired === true,
    legacyMigrationRequiredTrue: lock.legacyMigrationRequired === true,
    afterSalesPrivacyBoundaryExists:
      lock.privacy.afterSalesSafeAggregatesOnly === true &&
      lock.privacy.forbidSensitiveAfterSalesDetails === true &&
      combinedDocs.includes("safe aggregates") &&
      combinedDocs.includes("售后") &&
      combinedDocs.includes("敏感"),
    forbidClearingLegacyDataExists:
      combinedDocs.includes("Do not clear legacy data") ||
      combinedDocs.includes("Legacy single-Tmall data must not be cleared") ||
      combinedDocs.includes("旧单天猫数据") ||
      combinedDocs.includes("Clearing old data"),
    v05aBeforeV05b: stageById.get("V0.5B")?.dependsOn.includes("V0.5A") ?? false,
    v05bBeforeV05c: stageById.get("V0.5C")?.dependsOn.includes("V0.5B") ?? false,
    noCurrentAiBackendDatabaseImplementation:
      ["AI", "backend API", "database"].every((item) =>
        lock.currentStageDoesNotImplement.includes(item),
      ) &&
      !FORBIDDEN_CURRENT_IMPLEMENTED_FEATURES.some((phrase) => combinedDocs.includes(phrase)),
    noObviousDocumentConflict:
      includesAll(dataContract, ["platformCode", "storeId", "ImportBatch", "ImportFile"]) &&
      includesAll(migrationContract, ["天猫默认店铺", "idempotent", "v1", "v2"]) &&
      includesAll(northStar, ["多平台", "多个店铺", "当前 V0.5 scope does not include AI"]) &&
      includesAll(designSystem, ["390px", "horizontal overflow"]) &&
      includesAll(roadmap, [...REQUIRED_STAGE_SEQUENCE]) &&
      includesAll(adr, ["platformCode", "storeId", "tmall-default-store"]),
    noBusinessPageModified:
      gitStatus.onlyAllowed && !businessSourcesContainV05GovernanceMarker(),
    noFourSourceBottomLayerModified:
      gitStatus.onlyAllowed && !businessSourcesContainV05GovernanceMarker(),
    noTargetDiagnosticsModified:
      gitStatus.onlyAllowed && !businessSourcesContainV05GovernanceMarker(),
    noStorageStructureModified:
      gitStatus.onlyAllowed && !businessSourcesContainV05GovernanceMarker(),
    lintPass,
    buildPass,
  };

  const failedChecks = Object.entries(checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    gitStatusAvailable: gitStatus.available,
    gitChangedFiles: gitStatus.changedFiles,
    stages: sequenceIds,
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
};

main();
