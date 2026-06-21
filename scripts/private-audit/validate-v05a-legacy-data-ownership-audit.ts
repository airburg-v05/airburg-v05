import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "docs/audits/V05A_LEGACY_DATA_OWNERSHIP_AUDIT.md",
  "docs/audits/v0.5a-legacy-data-inventory.json",
  "docs/architecture/V05A_STORAGE_V2_MIGRATION_DESIGN.md",
  "docs/architecture/v0.5a-storage-v2-contract.json",
  "docs/decisions/ADR-002-storage-v2-persistence-and-migration.md",
  "scripts/private-audit/validate-v05a-legacy-data-ownership-audit.ts",
] as const;

const EXPECTED_STORAGE_KEYS = [
  "airburg_tmall_analysis_v2",
  "airburg_tmall_series_groups_v1",
  "airburg_tmall_targets_v1",
  "airburg:last-analysis",
  "airburg:demo-session",
] as const;

const REQUIRED_OWNERSHIP_FIELDS = [
  "platformCode",
  "storeId",
  "businessDate",
  "sourceType",
  "importBatchId",
] as const;

const OWNED_FACT_RECORDS = [
  "OwnedBusinessProductFact",
  "OwnedAdProductFact",
  "OwnedAdPlanFact",
  "OwnedAfterSalesAggregate",
] as const;

const CORE_ENTITY_MAPPINGS = [
  "ProductDailyFact",
  "AdProductDailyFact",
  "AdPlanDailyFact",
  "AfterSalesAggregates",
  "TmallSeriesGroup",
  "TmallTargetDefinition",
] as const;

const REQUIRED_NEXT_TASKS = [
  "V0.5A-2",
  "V0.5A-3",
  "V0.5A-4",
  "V0.5A-5",
  "V0.5A-6",
] as const;

const FORBIDDEN_CHANGED_PATTERNS = [
  "app/**",
  "components/**",
  "lib/**",
  "types/**",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "private-samples/**",
] as const;

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface CurrentTask {
  taskId: string;
  authorizationFile: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
  commandResults?: CommandResult[];
  status: "pending" | "in_progress" | "blocked" | "complete";
}

interface StorageInventoryItem {
  storageKey: string;
  schemaVersion: string;
  entityType: string;
  definedIn: string[];
  writers: string[];
  readers: string[];
  clearers: string[];
  eventNames: string[];
  validator: string;
  currentShape: string;
  containsPlatformCode: boolean;
  containsStoreId: boolean;
  containsBusinessDate: boolean;
  containsSourceType: boolean;
  containsImportBatchId: boolean;
  containsSensitiveAfterSalesDetail: boolean;
  migrationRequired: boolean;
  migrationRisk: "low" | "medium" | "high";
  notes: string[];
}

interface EntityMapping {
  legacyEntity: string;
  v2Entity: string;
  ownershipGap: string[];
  migrationAction: string;
}

interface LegacyInventory {
  auditVersion: string;
  taskId: string;
  scope: {
    readOnlyAudit: boolean;
    migrationExecuted: boolean;
    businessCodeModified: boolean;
    privateSamplesRead: boolean;
  };
  defaultMigrationOwner: {
    platformCode: string;
    storeId: string;
    storeName: string;
  };
  requiredV2OwnershipFields: string[];
  storageItems: StorageInventoryItem[];
  entityMappings: EntityMapping[];
  migrationBlockers: string[];
}

interface StorageV2Contract {
  contractVersion: string;
  schemaVersion: string;
  migrationVersion: string;
  status: string;
  implemented: boolean;
  defaultLegacyStore: {
    platformCode: string;
    storeId: string;
    storeName: string;
  };
  requiredOwnershipFields: string[];
  globalRules: Record<string, boolean>;
  records: Record<string, {
    requiredFields?: string[];
    forbiddenFields?: string[];
    sourceType?: string;
    rules?: string[];
  }>;
  compositeUniqueness: Array<{
    record: string;
    fields: string[];
  }>;
  forbiddenDuringV05A1: string[];
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

const findAuthorizationCommit = (authorizationFile: string): string | null => {
  const stdout = git(["log", "--diff-filter=A", "--format=%H", "--", authorizationFile]);
  const commits = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  return commits.at(-1) ?? null;
};

const includesAll = (values: readonly string[], expected: readonly string[]): boolean =>
  expected.every((item) => values.includes(item));

const textIncludesAll = (text: string, expected: readonly string[]): boolean =>
  expected.every((item) => text.includes(item));

const hasNoInvalidNumberText = (text: string): boolean =>
  !/(^|[^A-Za-z])(NaN|Infinity|undefined)([^A-Za-z]|$)/.test(text);

const collectSourceStorageKeys = (): string[] => {
  const sourceFiles = [
    "lib/storage/tmall-analysis-storage.ts",
    "lib/storage/tmall-series-storage.ts",
    "lib/storage/tmall-target-storage.ts",
    "lib/storage/analysis-storage.ts",
  ];
  const keys = new Set<string>();
  sourceFiles.forEach((file) => {
    const content = readFile(file);
    Array.from(content.matchAll(/"airburg[^"]+"/g)).forEach((match) => {
      const value = match[0].slice(1, -1);
      if (!value.endsWith("-change")) keys.add(value);
    });
  });
  return [...keys].sort();
};

const main = () => {
  const failures: string[] = [];

  const currentTask = parseJson<CurrentTask>("docs/project/current-task.json");
  const authorizationCommit = findAuthorizationCommit(currentTask.authorizationFile);
  if (!authorizationCommit) failures.push("Authorization commit not found.");

  const changedFiles = authorizationCommit ? changedFilesSinceCommit(authorizationCommit) : [];

  REQUIRED_FILES.forEach((file) => {
    if (!fileExists(file)) failures.push(`Required file missing: ${file}`);
  });

  const authPass = runCommand("npx", ["tsx", "scripts/private-audit/validate-v05-task-authorization.ts"]);
  const preflightPass = runCommand("npx", ["tsx", "scripts/private-audit/validate-v05-task-preflight.ts"]);
  const governancePass = runCommand("npx", ["tsx", "scripts/private-audit/validate-v05-governance-lock.ts"]);

  if (!authPass) failures.push("Task authorization validation failed.");
  if (!preflightPass) failures.push("Task preflight validation failed.");
  if (!governancePass) failures.push("Governance lock validation failed.");

  changedFiles.forEach((file) => {
    if (!pathMatchesAny(file, currentTask.allowedModifyPaths)) {
      failures.push(`Changed file is outside allowed paths: ${file}`);
    }
    if (pathMatchesAny(file, currentTask.forbiddenModifyPaths) || pathMatchesAny(file, FORBIDDEN_CHANGED_PATTERNS)) {
      failures.push(`Changed file is forbidden: ${file}`);
    }
  });

  const inventory = parseJson<LegacyInventory>("docs/audits/v0.5a-legacy-data-inventory.json");
  const contract = parseJson<StorageV2Contract>("docs/architecture/v0.5a-storage-v2-contract.json");
  const auditReport = readFile("docs/audits/V05A_LEGACY_DATA_OWNERSHIP_AUDIT.md");
  const migrationDesign = readFile("docs/architecture/V05A_STORAGE_V2_MIGRATION_DESIGN.md");
  const adr = readFile("docs/decisions/ADR-002-storage-v2-persistence-and-migration.md");

  const discoveredStorageKeys = collectSourceStorageKeys();
  const inventoryKeys = inventory.storageItems.map((item) => item.storageKey);

  if (!includesAll(inventoryKeys, EXPECTED_STORAGE_KEYS)) {
    failures.push("Inventory does not include all expected storage keys.");
  }
  if (!includesAll(inventoryKeys, discoveredStorageKeys)) {
    failures.push("Inventory does not include all storage keys discovered in source files.");
  }

  inventory.storageItems.forEach((item) => {
    const requiredStringArrays = [
      item.definedIn,
      item.writers,
      item.readers,
      item.clearers,
      item.eventNames,
      item.notes,
    ];
    if (requiredStringArrays.some((values) => !Array.isArray(values))) {
      failures.push(`Inventory item has invalid arrays: ${item.storageKey}`);
    }
    if (!item.schemaVersion || !item.entityType || !item.validator || !item.currentShape) {
      failures.push(`Inventory item missing required description fields: ${item.storageKey}`);
    }
    if (item.containsSensitiveAfterSalesDetail) {
      failures.push(`Inventory item flags sensitive after-sales detail: ${item.storageKey}`);
    }
  });

  const mappingNames = inventory.entityMappings.map((item) => item.legacyEntity);
  if (!includesAll(mappingNames, CORE_ENTITY_MAPPINGS)) {
    failures.push("Inventory does not map every core legacy entity.");
  }

  if (inventory.scope.migrationExecuted) failures.push("Inventory claims migration was executed.");
  if (inventory.scope.businessCodeModified) failures.push("Inventory claims business code was modified.");
  if (inventory.scope.privateSamplesRead) failures.push("Inventory claims private samples were read.");
  if (inventory.defaultMigrationOwner.storeId !== "tmall-default-store") {
    failures.push("Default migration owner storeId is not tmall-default-store.");
  }

  if (!includesAll(inventory.requiredV2OwnershipFields, REQUIRED_OWNERSHIP_FIELDS)) {
    failures.push("Inventory missing required V2 ownership fields.");
  }
  if (!includesAll(contract.requiredOwnershipFields, REQUIRED_OWNERSHIP_FIELDS)) {
    failures.push("V2 contract missing required ownership fields.");
  }
  if (contract.defaultLegacyStore.platformCode !== "tmall" || contract.defaultLegacyStore.storeId !== "tmall-default-store") {
    failures.push("V2 contract default legacy store is incorrect.");
  }
  if (contract.implemented !== false || contract.status !== "design_only") {
    failures.push("V2 contract must remain design_only and implemented=false.");
  }

  OWNED_FACT_RECORDS.forEach((recordName) => {
    const record = contract.records[recordName];
    if (!record) {
      failures.push(`V2 contract missing record: ${recordName}`);
      return;
    }
    if (!includesAll(record.requiredFields ?? [], REQUIRED_OWNERSHIP_FIELDS)) {
      failures.push(`V2 record missing ownership fields: ${recordName}`);
    }
    const uniqueness = contract.compositeUniqueness.find((item) => item.record === recordName);
    if (!uniqueness || !includesAll(uniqueness.fields, REQUIRED_OWNERSHIP_FIELDS)) {
      failures.push(`V2 uniqueness missing ownership fields: ${recordName}`);
    }
  });

  const requiredRecords = [
    "PlatformRecord",
    "StoreRecord",
    "ImportBatchRecord",
    "ImportFileRecord",
    "SeriesRecord",
    "TrackedProductRecord",
    "TargetRecord",
    "MigrationManifest",
    "RepositoryResult",
    "ActiveDatasetPointer",
  ];
  requiredRecords.forEach((recordName) => {
    if (!contract.records[recordName]) failures.push(`V2 contract missing record: ${recordName}`);
  });

  if (!contract.globalRules.legacyKeysMustBePreserved) failures.push("V2 contract does not preserve legacy keys.");
  if (!contract.globalRules.missingDataIsNotZero) failures.push("V2 contract does not enforce missing data is not zero.");
  if (!contract.globalRules.afterSalesRawRowsForbidden) failures.push("V2 contract does not forbid after-sales raw rows.");
  if (!contract.globalRules.pagesMustUseRepositories) failures.push("V2 contract does not require repositories.");
  if (!contract.globalRules.indexedDbRequiresLaterAuthorization) failures.push("V2 contract does not gate IndexedDB.");

  const afterSalesRecord = contract.records.OwnedAfterSalesAggregate;
  if (!afterSalesRecord?.forbiddenFields?.includes("rawRows") || !afterSalesRecord.forbiddenFields.includes("previewRows")) {
    failures.push("After-sales V2 contract does not forbid rawRows and previewRows.");
  }

  if (!adr.includes("## Status\n\nProposed")) failures.push("ADR-002 status must be Proposed.");
  if (!adr.includes("repository interfaces with replaceable persistence adapters")) {
    failures.push("ADR-002 does not recommend repository interfaces with replaceable adapters.");
  }
  if (!adr.includes("IndexedDB only in a later locked task")) {
    failures.push("ADR-002 does not defer IndexedDB to later authorization.");
  }

  if (!textIncludesAll(migrationDesign, REQUIRED_NEXT_TASKS)) {
    failures.push("Migration design does not include the required V0.5A future task split.");
  }
  if (!migrationDesign.includes("Prepare phase must not switch the active dataset pointer")) {
    failures.push("Migration design does not protect active pointer during prepare.");
  }
  if (!migrationDesign.includes("Do not delete legacy keys")) {
    failures.push("Migration design does not forbid deleting legacy keys on failure.");
  }
  if (!migrationDesign.includes("tmall-default-store")) {
    failures.push("Migration design does not define default Tmall store.");
  }

  const requiredAuditSections = [
    "## 1. Audit Scope",
    "## 2. Governance Boundary",
    "## 3. Legacy Storage Inventory",
    "## 4. localStorage And sessionStorage Audit",
    "## 5. Analysis Result Storage",
    "## 6. Series Group Storage",
    "## 7. Target Storage",
    "## 8. Prototype Storage Keys",
    "## 9. Reader Writer Clearer Matrix",
    "## 10. Page Access Audit",
    "## 11. Fact Ownership Gap",
    "## 12. Source, Date, And Import Batch Gap",
    "## 13. Series And Target Ownership Gap",
    "## 14. Privacy And After-sales Boundary",
    "## 15. Empty, Corrupted, And Migration States",
    "## 16. Risk Register",
    "## 17. Storage V2 Mapping Plan",
    "## 18. Required Next Stages And No-go List",
  ];
  if (!textIncludesAll(auditReport, requiredAuditSections)) {
    failures.push("Audit report does not contain all 18 required sections.");
  }
  if (!textIncludesAll(auditReport, ["critical", "high", "medium", "low"])) {
    failures.push("Audit report does not cover all risk levels.");
  }

  const combinedText = [auditReport, migrationDesign, adr, JSON.stringify(inventory), JSON.stringify(contract)].join("\n");
  if (!hasNoInvalidNumberText(combinedText)) {
    failures.push("Generated docs contain invalid number display tokens.");
  }
  if (combinedText.includes("private-samples/")) {
    failures.push("Generated docs must not reference private sample paths.");
  }
  if (combinedText.includes("AI 分析已实现") || combinedText.includes("server database implemented")) {
    failures.push("Generated docs imply forbidden functionality is implemented.");
  }

  const lintPass = runCommand("npm", ["run", "lint"]);
  const buildPass = runCommand("npm", ["run", "build"]);
  if (!lintPass) failures.push("npm run lint failed.");
  if (!buildPass) failures.push("npm run build failed.");

  const result = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    taskId: inventory.taskId,
    authorizationCommit,
    changedFiles,
    discoveredStorageKeys,
    inventoryKeys,
    requiredOwnershipFields: REQUIRED_OWNERSHIP_FIELDS,
    ownedFactRecords: OWNED_FACT_RECORDS,
    checks: {
      authPass,
      preflightPass,
      governancePass,
      lintPass,
      buildPass,
      requiredFilesPresent: REQUIRED_FILES.every(fileExists),
      noBusinessFilesChanged: changedFiles.every((file) => !pathMatchesAny(file, FORBIDDEN_CHANGED_PATTERNS)),
      inventoryCoversStorageKeys: includesAll(inventoryKeys, EXPECTED_STORAGE_KEYS) && includesAll(inventoryKeys, discoveredStorageKeys),
      v2ContractDesignOnly: contract.status === "design_only" && contract.implemented === false,
      afterSalesPrivacyBoundary: Boolean(afterSalesRecord?.forbiddenFields?.includes("rawRows")),
      migrationPreservesLegacyKeys: contract.globalRules.legacyKeysMustBePreserved,
      repositoryBoundaryRequired: contract.globalRules.pagesMustUseRepositories,
      adrStatusProposed: adr.includes("## Status\n\nProposed"),
    },
    failures,
  };

  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
};

main();
