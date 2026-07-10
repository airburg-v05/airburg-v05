import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

interface CheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

const root = process.cwd();
const checks: CheckResult[] = [];

const relative = (filePath: string): string => path.relative(root, filePath).split(path.sep).join("/");
const absolute = (filePath: string): string => path.join(root, filePath);
const readText = (filePath: string): string => readFileSync(absolute(filePath), "utf8");
const readJson = <T>(filePath: string): T => JSON.parse(readText(filePath)) as T;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const check = (id: string, pass: boolean, detail: string): void => {
  checks.push({ id, pass, detail });
};

const ignoredDirectoryNames = new Set([".git", ".next", ".vercel", "node_modules", "coverage", "private-samples"]);

const listFilesRecursively = (directory: string): string[] => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectoryNames.has(entry)) return [];
    const entryPath = path.join(directory, entry);
    return statSync(entryPath).isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
};

const requiredFiles = [
  "docs/project/PROJECT_SSOT.json",
  "docs/project/PROJECT_SSOT.schema.json",
  "docs/project/STATUS_MODEL_V1.json",
  "docs/project/ROUTE_DATA_SOURCE_MATRIX.json",
  "docs/project/METRIC_SEMANTIC_RECONCILIATION_V1.json",
  "docs/project/V2_HOME_DATA_FOUNDATION_DECISION.md",
  "docs/project/V2_HOME_DATA_CONTRACT.json",
  "docs/project/DEPRECATED_STATE_ARTIFACTS.md",
  "docs/project/VALIDATOR_REGISTRY.json",
  "docs/project/current-task.json",
  "docs/project/tasks/archive/V0.5G_6_SELECTED_TARGET_CONFIGURATION_AND_PREVIEW_DEPLOYMENT.json",
  "docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1/task-contract.json",
];

requiredFiles.forEach((filePath) => check(`file:${filePath}`, existsSync(absolute(filePath)), "required file exists"));

const ssot = readJson<JsonRecord>("docs/project/PROJECT_SSOT.json");
const schema = readJson<JsonRecord>("docs/project/PROJECT_SSOT.schema.json");
const tracks = isRecord(ssot.tracks) ? ssot.tracks : {};
const activeTrackEntries = Object.entries(tracks).filter(([, value]) =>
  isRecord(value) && value.role === "ACTIVE_PRODUCT_TRACK",
);

const schemaRequired = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [];
const missingSchemaKeys = schemaRequired.filter((key) => !(key in ssot));
check("ssot-schema-required", missingSchemaKeys.length === 0, `missing=${missingSchemaKeys.join(",") || "none"}`);
check("ssot-schema-version", ssot.schemaVersion === "1.0.0", `schemaVersion=${String(ssot.schemaVersion)}`);
check("ssot-authority", isRecord(ssot.authority) && ssot.authority.machineReadableSource === "docs/project/PROJECT_SSOT.json", "single machine-readable authority");
check("single-active-product-track", ssot.activeProductTrack === "SAAS_UI_V2" && activeTrackEntries.length === 1, `activeEntries=${activeTrackEntries.length}`);

const currentTask = readJson<JsonRecord>("docs/project/current-task.json");
check("single-current-task-pointer", currentTask.taskId === "V2_HOME_REAL_DATA_VERTICAL_SLICE_V1", `taskId=${String(currentTask.taskId)}`);
check("next-task-ready", currentTask.status === "READY_FOR_USER_AUTHORIZATION", `status=${String(currentTask.status)}`);
check("next-task-contract", typeof currentTask.contract === "string" && existsSync(absolute(currentTask.contract)), `contract=${String(currentTask.contract)}`);

const archivedTask = readJson<JsonRecord>("docs/project/tasks/archive/V0.5G_6_SELECTED_TARGET_CONFIGURATION_AND_PREVIEW_DEPLOYMENT.json");
check("old-task-superseded", archivedTask.status === "SUPERSEDED" && archivedTask.supersededBy === "PROJECT_SINGLE_TRACK_RECONCILIATION_AND_V2_ENTRY_GATE_V1", `status=${String(archivedTask.status)}`);

const routeMatrix = readJson<JsonRecord>("docs/project/ROUTE_DATA_SOURCE_MATRIX.json");
const routes = Array.isArray(routeMatrix.routes) ? routeMatrix.routes : [];
const routeNames = new Set(routes.filter(isRecord).map((route) => String(route.route)));
const requiredRoutes = [
  "/home", "/series-board", "/store-board", "/product-board", "/upload", "/upload/history", "/upload/quality",
  "/v2/home", "/v2/series-board", "/v2/store-board", "/v2/product-board", "/v2/upload", "/v2/data-health",
  "/v2/target-center", "/v2/search-assets", "/v2/exclusion-rules",
];
check("route-matrix-coverage", requiredRoutes.every((route) => routeNames.has(route)), `routes=${routes.length}`);

const semanticDecision = readJson<JsonRecord>("docs/project/METRIC_SEMANTIC_RECONCILIATION_V1.json");
const currentMetric = isRecord(semanticDecision.currentImplementation) ? semanticDecision.currentImplementation : {};
const requestedMetric = isRecord(semanticDecision.requestedMetric) ? semanticDecision.requestedMetric : {};
const migrationDecision = isRecord(semanticDecision.migrationDecision) ? semanticDecision.migrationDecision : {};
check("metric-semantic-keys-split", currentMetric.metricKey === "geoSearchShare" && requestedMetric.metricKey === "brandKeywordPaidShare" && migrationDecision.keysMayAlias === false, "legacy and requested metrics are independent");
check("brand-keyword-share-pending", requestedMetric.status === "PENDING_IMPLEMENTATION", `status=${String(requestedMetric.status)}`);

const deprecatedStateText = readText("docs/project/DEPRECATED_STATE_ARTIFACTS.md");
check("system-state-classification", deprecatedStateText.includes("DEPRECATED_UNBOUND_STATE_ARTIFACT") && deprecatedStateText.includes("STALE_SEMANTICS"), "deprecated classification recorded");

const businessSourceFiles = listFilesRecursively(root).filter((filePath) => {
  const file = relative(filePath);
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) return false;
  if (file === "lib/state/system-state.ts") return false;
  return !file.startsWith("docs/") && !file.startsWith("scripts/private-audit/") && !file.startsWith(".next/") && !file.startsWith("node_modules/");
});
const systemStateBusinessImports = businessSourceFiles.filter((filePath) => {
  const source = readFileSync(filePath, "utf8");
  return source.includes("lib/state/system-state") || source.includes("@/lib/state/system-state");
});
check("system-state-unbound", systemStateBusinessImports.length === 0, `businessImportCount=${systemStateBusinessImports.length}`);

const tmallV1Data = isRecord(tracks.tmallV1Data) ? tracks.tmallV1Data : {};
const tmallV1Public = isRecord(tracks.tmallV1Public) ? tracks.tmallV1Public : {};
const v05 = isRecord(tracks.v05) ? tracks.v05 : {};
const saasUiV2 = isRecord(tracks.saasUiV2) ? tracks.saasUiV2 : {};
check("v1-data-evidence", tmallV1Data.status === "DATA_E2E_PASS" || tmallV1Data.status === "NOT_REVERIFIED_THIS_RUN", `status=${String(tmallV1Data.status)}`);
check("v1-public-evidence", tmallV1Public.status === "PUBLIC_HEALTH_PASS_COMMIT_UNKNOWN" || tmallV1Public.status === "PUBLIC_ALIGNED", `status=${String(tmallV1Public.status)}`);
check("v05-foundation-classification", v05.status === "FOUNDATION_CANDIDATE" || v05.status === "ARCHIVED", `status=${String(v05.status)}`);
check("v2-static-shell", saasUiV2.status === "STATIC_SHELL" && saasUiV2.dataBound === false, `status=${String(saasUiV2.status)}, dataBound=${String(saasUiV2.dataBound)}`);
check("v2-not-overclaimed", saasUiV2.localE2EPassed === false && saasUiV2.visualAccepted === false && saasUiV2.previewDeployed === false && saasUiV2.humanAccepted === false, "no later-stage V2 claims");

const foundationDecision = readText("docs/project/V2_HOME_DATA_FOUNDATION_DECISION.md");
check("single-foundation-decision", foundationDecision.includes("`V05_DOMAIN_WITH_V1_METRIC_COMPATIBILITY_ADAPTER`") && !foundationDecision.includes("## Decision\n\n`V05_VIEW_MODEL`") && !foundationDecision.includes("## Decision\n\n`V1_BI_VIEW_MODEL_VIA_V2_ADAPTER`"), "one selected foundation");

const homeContract = readJson<JsonRecord>("docs/project/V2_HOME_DATA_CONTRACT.json");
const metrics = Array.isArray(homeContract.metrics) ? homeContract.metrics.filter(isRecord) : [];
const metricKeys = metrics.map((metric) => String(metric.metricKey));
check("v2-home-contract-count", metrics.length === 17 && new Set(metricKeys).size === 17 && homeContract.metricCount === 17, `metrics=${metrics.length}`);
check("v2-home-contract-semantic-split", metricKeys.includes("brandKeywordPaidShare") && !metricKeys.includes("geoSearchShare"), "V2 contract uses requested key without relabeling legacy key");

const registry = readJson<JsonRecord>("docs/project/VALIDATOR_REGISTRY.json");
const registryValidators = Array.isArray(registry.validators) ? registry.validators.filter(isRecord) : [];
const validatorFiles = listFilesRecursively(absolute("scripts/private-audit"))
  .map(relative)
  .filter((file) => file.endsWith(".ts"))
  .sort();
const registeredFiles = registryValidators.map((entry) => String(entry.file)).sort();
check("validator-registry-complete", JSON.stringify(validatorFiles) === JSON.stringify(registeredFiles), `actual=${validatorFiles.length}, registered=${registeredFiles.length}`);
check("validator-registry-fields", registryValidators.every((entry) => ["file", "taskName", "track", "tier", "validationType", "current", "legacy", "stageOnly", "requiresRealSamples", "requiresBrowser", "requiresHumanReview", "notes"].every((key) => key in entry)), "all required registry fields present");

const changedSinceArchive = execFileSync("git", ["diff", "--name-only", "7ade2f433d7dbd90e8fd1a0df5efdb00003ec8fa..HEAD"], { cwd: root, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const allowedGovernanceChange = (file: string): boolean =>
  file === "AGENTS.md" ||
  file.startsWith("docs/") ||
  file === "scripts/private-audit/validate-project-single-track-reconciliation-and-v2-entry-gate-v1.ts";
const forbiddenChanges = changedSinceArchive.filter((file) => !allowedGovernanceChange(file));
check("no-business-changes-since-archive", forbiddenChanges.length === 0, `forbidden=${forbiddenChanges.join(",") || "none"}`);

const trackedForbiddenPatterns = [
  /^private-samples\//,
  /^\.vercel\//,
  /^node_modules\//,
  /^\.next\//,
  /tsconfig\.tsbuildinfo$/,
  /\.(xls|xlsx|csv|pem|key)$/i,
];
const trackedFiles = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
const trackedForbidden = trackedFiles.filter((file) => trackedForbiddenPatterns.some((pattern) => pattern.test(file)));
check("forbidden-files-not-tracked", trackedForbidden.length === 0, `forbidden=${trackedForbidden.join(",") || "none"}`);

const statusBeforeExternalGates = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
check("git-clean-before-external-gates", statusBeforeExternalGates.length === 0, statusBeforeExternalGates || "clean");

const runNpmGate = (script: "lint" | "build"): { pass: boolean; detail: string } => {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    pass: result.status === 0,
    detail: result.status === 0 ? "PASS" : output.slice(-1200),
  };
};

const lint = runNpmGate("lint");
check("npm-lint", lint.pass, lint.detail);
const build = runNpmGate("build");
check("npm-build", build.pass, build.detail);

const failedChecks = checks.filter((result) => !result.pass);
const output = {
  task: "PROJECT_SINGLE_TRACK_RECONCILIATION_AND_V2_ENTRY_GATE_V1",
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  summary: {
    checks: checks.length,
    passed: checks.length - failedChecks.length,
    failed: failedChecks.length,
    activeProductTrack: ssot.activeProductTrack,
    currentTask: currentTask.taskId,
    v2Status: saasUiV2.status,
    validatorRegistryCount: registryValidators.length,
  },
  failedChecks,
};

console.log(JSON.stringify(output, null, 2));
if (failedChecks.length > 0) process.exit(1);
