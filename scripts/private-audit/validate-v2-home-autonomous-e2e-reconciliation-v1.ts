import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMPLEMENTATION_BASELINE = "e3037c51ae40936268d6e580f8c3ac5046e8ba1b";
const IMPLEMENTATION_HEAD = "8b69e46fee532379be5f5f0b2ef4fe44c87a87aa";
const TASK_DIR = "docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface CurrentTask {
  taskId: string;
  status: string;
  contract: string;
  authorized: boolean;
  executionStarted: boolean;
  latestImplementationCommit: string;
  nextGate: string;
}

interface TaskContract {
  taskId: string;
  status: string;
  authorized: boolean;
  executionStarted: boolean;
  latestImplementationCommit: string;
  nextGate: string;
  humanReviewRequired: boolean;
  gitPolicy: { pushAllowed: boolean };
  deployPolicy: { deployAllowed: boolean };
}

interface ProjectSsot {
  repository: {
    activeBranch: string;
    headCommit: string;
    workingTree: string;
  };
  currentTask: { taskId: string; status: string; contract: string };
  nextAuthorizedEntryGate: string;
  tracks: {
    saasUiV2: {
      status: string;
      dataBound: boolean;
      dataBoundRoutes: string[];
      remainingStaticShellRouteCount: number;
      localE2EPassed: boolean;
      visualAccepted: boolean;
      previewDeployed: boolean;
      humanAccepted: boolean;
      humanReviewRequired: boolean;
      homeVerticalSlice: {
        latestImplementationCommit: string;
        safeSkippedCount: number;
        multiMonthTargetPolicy: string;
      };
    };
  };
}

interface StatusModel {
  states: Record<string, string>;
  requiredSaasUiV2CurrentState: {
    status: string;
    dataBound: boolean;
    dataBoundRoutes: string[];
    remainingStaticShellRouteCount: number;
    localE2EPassed: boolean;
    visualAccepted: boolean;
    previewDeployed: boolean;
    humanAccepted: boolean;
    nextGate: string;
  };
}

interface DataContract {
  adapterImplemented: boolean;
  adapterPath: string;
  implementationStatus: string;
  latestImplementationCommit: string;
  visualAccepted: boolean;
  metrics: unknown[];
}

interface SsotSchema {
  properties: {
    nextAuthorizedEntryGate: { const: string };
    repository: { properties: { headCommit: { pattern: string } } };
  };
  $defs: { track: { properties: { status: { enum: string[] } } } };
}

interface ValidatorRecord {
  file: string;
  tier: string;
  validationType: string;
  current: boolean;
  requiresRealSamples: boolean;
  requiresBrowser: boolean;
  requiresHumanReview: boolean;
}

interface ValidatorRegistry {
  totalValidators: number;
  countsByTier: Record<string, number>;
  countsByValidationType: Record<string, number>;
  validators: ValidatorRecord[];
}

interface RouteMatrix {
  routes: Array<{ route: string; status: string; isDataBound: boolean; isStaticShell: boolean }>;
}

interface Evidence {
  status: string;
  visualAccepted: boolean;
  visualReviewStatus: string;
  humanReviewRequired: boolean;
  postTaskReconciliation?: {
    status: string;
    implementationCommit: string;
    safeSkippedCount: number;
    multiMonthTargetPolicy: string;
    pushExecuted: boolean;
    deployExecuted: boolean;
  };
}

const checks: Check[] = [];
const check = (name: string, pass: boolean, details?: unknown) => checks.push({ name, pass, details });
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
const git = (args: string[]) => execFileSync("git", args, {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
}).trim();

const countsBy = (records: ValidatorRecord[], key: "tier" | "validationType") =>
  records.reduce<Record<string, number>>((counts, record) => {
    counts[record[key]] = (counts[record[key]] ?? 0) + 1;
    return counts;
  }, {});

const sameCounts = (left: Record<string, number>, right: Record<string, number>) => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  return keys.every((key) => left[key] === right[key]);
};

const main = () => {
  const ssot = readJson<ProjectSsot>("docs/project/PROJECT_SSOT.json");
  const currentTask = readJson<CurrentTask>("docs/project/current-task.json");
  const contract = readJson<TaskContract>(`${TASK_DIR}/task-contract.json`);
  const statusModel = readJson<StatusModel>("docs/project/STATUS_MODEL_V1.json");
  const dataContract = readJson<DataContract>("docs/project/V2_HOME_DATA_CONTRACT.json");
  const schema = readJson<SsotSchema>("docs/project/PROJECT_SSOT.schema.json");
  const registry = readJson<ValidatorRegistry>("docs/project/VALIDATOR_REGISTRY.json");
  const routeMatrix = readJson<RouteMatrix>("docs/project/ROUTE_DATA_SOURCE_MATRIX.json");
  const evidence = readJson<Evidence>(`${TASK_DIR}/evidence.json`);

  check(
    "ssotCurrentTaskAligned",
    ssot.currentTask.taskId === currentTask.taskId &&
      ssot.currentTask.status === currentTask.status &&
      ssot.currentTask.contract === currentTask.contract,
  );
  check(
    "taskAndContractAreCompletedLocalE2E",
    currentTask.status === "LOCAL_E2E_PASS" &&
      currentTask.authorized &&
      currentTask.executionStarted &&
      contract.status === "LOCAL_E2E_PASS" &&
      contract.authorized &&
      contract.executionStarted,
  );
  check(
    "taskImplementationIdentityAligned",
    currentTask.latestImplementationCommit === IMPLEMENTATION_HEAD &&
      contract.latestImplementationCommit === IMPLEMENTATION_HEAD &&
      ssot.repository.headCommit === IMPLEMENTATION_HEAD,
  );
  check(
    "nextGateIsHumanVisualReview",
    currentTask.nextGate === "V2_HOME_HUMAN_VISUAL_REVIEW" &&
      contract.nextGate === "V2_HOME_HUMAN_VISUAL_REVIEW" &&
      ssot.nextAuthorizedEntryGate === "V2_HOME_HUMAN_VISUAL_REVIEW",
  );
  check(
    "ssotV2HomeStateExact",
    ssot.tracks.saasUiV2.status === "HOME_VERTICAL_SLICE_LOCAL_E2E_PASS" &&
      ssot.tracks.saasUiV2.dataBound &&
      ssot.tracks.saasUiV2.dataBoundRoutes.join(",") === "/v2/home" &&
      ssot.tracks.saasUiV2.remainingStaticShellRouteCount === 8 &&
      ssot.tracks.saasUiV2.localE2EPassed,
  );
  check(
    "statusModelMatchesSsot",
    statusModel.requiredSaasUiV2CurrentState.status === ssot.tracks.saasUiV2.status &&
      statusModel.requiredSaasUiV2CurrentState.dataBound === ssot.tracks.saasUiV2.dataBound &&
      statusModel.requiredSaasUiV2CurrentState.dataBoundRoutes.join(",") === "/v2/home" &&
      statusModel.requiredSaasUiV2CurrentState.remainingStaticShellRouteCount === 8 &&
      statusModel.requiredSaasUiV2CurrentState.localE2EPassed &&
      statusModel.requiredSaasUiV2CurrentState.nextGate === ssot.nextAuthorizedEntryGate &&
      typeof statusModel.states.HOME_VERTICAL_SLICE_LOCAL_E2E_PASS === "string",
  );
  check(
    "schemaMatchesCurrentSsot",
    schema.properties.nextAuthorizedEntryGate.const === ssot.nextAuthorizedEntryGate &&
      schema.$defs.track.properties.status.enum.includes(ssot.tracks.saasUiV2.status) &&
      new RegExp(schema.properties.repository.properties.headCommit.pattern).test(ssot.repository.headCommit),
  );
  check(
    "dataContractImplementationStateAligned",
    dataContract.adapterImplemented &&
      dataContract.adapterPath === "lib/v2/home/v2-home-adapter.ts" &&
      dataContract.implementationStatus === "LOCAL_E2E_PASS" &&
      dataContract.latestImplementationCommit === IMPLEMENTATION_HEAD &&
      dataContract.visualAccepted === false &&
      dataContract.metrics.length === 17,
  );

  const v2Routes = routeMatrix.routes.filter((route) => route.route.startsWith("/v2/"));
  const dataBoundV2Routes = v2Routes.filter((route) => route.isDataBound);
  check(
    "routeMatrixHasOneDataBoundV2Route",
    dataBoundV2Routes.length === 1 &&
      dataBoundV2Routes[0]?.route === "/v2/home" &&
      dataBoundV2Routes[0]?.status === "LOCAL_E2E_PASS" &&
      v2Routes.filter((route) => route.route !== "/v2/home").every((route) => route.isStaticShell && !route.isDataBound),
  );

  const actualValidatorFiles = fs.readdirSync(path.join(ROOT, "scripts/private-audit"))
    .filter((file) => file.startsWith("validate-") && file.endsWith(".ts"))
    .map((file) => `scripts/private-audit/${file}`)
    .sort();
  const registeredValidatorFiles = registry.validators.map((record) => record.file).sort();
  check(
    "validatorRegistryExactlyMatchesTopLevelValidators",
    JSON.stringify(actualValidatorFiles) === JSON.stringify(registeredValidatorFiles),
    { actual: actualValidatorFiles.length, registered: registeredValidatorFiles.length },
  );
  check(
    "validatorRegistryCountsAreDerived",
    registry.totalValidators === registry.validators.length &&
      sameCounts(registry.countsByTier, countsBy(registry.validators, "tier")) &&
      sameCounts(registry.countsByValidationType, countsBy(registry.validators, "validationType")),
  );
  check(
    "validatorRegistryContainsCurrentV2Gates",
    [
      "scripts/private-audit/validate-v2-home-autonomous-e2e-reconciliation-v1.ts",
      "scripts/private-audit/validate-v2-home-real-data-vertical-slice-v1.ts",
      "scripts/private-audit/validate-v2-home-textual-reference-visual-rebase-and-minimalism-v2.ts",
    ].every((file) => registry.validators.some((record) => record.file === file && record.tier === "TIER_A_RELEASE_CRITICAL" && record.current)),
  );
  check(
    "validatorRegistryExcludesHelpers",
    !registry.validators.some((record) => record.file.includes("/lib/")),
  );

  const implementationPaths = git(["diff", "--name-only", IMPLEMENTATION_BASELINE, IMPLEMENTATION_HEAD, "--"])
    .split("\n")
    .filter(Boolean)
    .sort();
  const expectedImplementationPaths = [
    "components/upload/v1/upload-page-v1-dashboard.tsx",
    "lib/v2/home/v2-home-adapter.ts",
    "scripts/private-audit/validate-upload-page-v2-unified-batch-etl-entry.ts",
    "scripts/private-audit/validate-v2-home-real-data-vertical-slice-v1.ts",
    "scripts/private-audit/validate-v2-home-textual-reference-visual-rebase-and-minimalism-v2.ts",
  ].sort();
  check(
    "implementationCommitScopeExact",
    JSON.stringify(implementationPaths) === JSON.stringify(expectedImplementationPaths),
    implementationPaths,
  );
  check(
    "implementationDidNotChangeFrozenLayers",
    !implementationPaths.some((file) =>
      file.startsWith("lib/etl/") ||
      file.startsWith("lib/bi/") ||
      file.startsWith("lib/persistence/") ||
      file.startsWith("lib/storage/") ||
      file.startsWith("lib/tmall/") ||
      file.startsWith("lib/v05/") ||
      ["package.json", "package-lock.json", "vercel.json"].includes(file),
    ),
  );

  const uploadSource = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const adapterSource = read("lib/v2/home/v2-home-adapter.ts");
  const homeValidatorSource = read("scripts/private-audit/validate-v2-home-real-data-vertical-slice-v1.ts");
  const uploadValidatorSource = read("scripts/private-audit/validate-upload-page-v2-unified-batch-etl-entry.ts");
  const textualValidatorSource = read("scripts/private-audit/validate-v2-home-textual-reference-visual-rebase-and-minimalism-v2.ts");
  const safeSkippedHelper = uploadSource.slice(
    uploadSource.indexOf("const buildSafeSkippedIssues"),
    uploadSource.indexOf("const hasDataSetRecords"),
  );
  check(
    "safeSkippedSummaryIsPersistedWithoutRawName",
    safeSkippedHelper.includes("upload_unsupported_plan_summary_skipped") &&
      safeSkippedHelper.includes("safe_upload_input") &&
      !safeSkippedHelper.includes("file.name"),
  );
  check(
    "multiMonthTargetIsolationImplemented",
    adapterSource.includes("const targetMonthForRange") &&
      adapterSource.includes("startMonth === endMonth ? endMonth : null") &&
      adapterSource.includes("if (!targetMonth) return []"),
  );
  check(
    "activeBrowserValidatorsUseChromeOwnedPort",
    [homeValidatorSource, uploadValidatorSource].every((source) =>
      source.includes("--remote-debugging-port=0") &&
      source.includes("DevToolsActivePort") &&
      !source.includes("Math.random()"),
    ),
  );
  check(
    "completedTaskValidatorsAreForwardSafe",
    homeValidatorSource.includes(`const TASK_COMPLETION_HEAD = "${IMPLEMENTATION_BASELINE}"`) &&
      textualValidatorSource.includes(`const TASK_COMPLETION_HEAD = "${IMPLEMENTATION_BASELINE}"`) &&
      textualValidatorSource.includes("INITIAL_HEAD, TASK_COMPLETION_HEAD") &&
      uploadValidatorSource.includes("const TASK_COMPLETION_HEAD = \"640028371cc4baba777f84b82950caff50e08edb\"") &&
      uploadValidatorSource.includes("TASK_BASELINE_HEAD,\n    TASK_COMPLETION_HEAD"),
  );

  check(
    "visualAndDeploymentStateNotOverclaimed",
    !ssot.tracks.saasUiV2.visualAccepted &&
      !ssot.tracks.saasUiV2.previewDeployed &&
      !ssot.tracks.saasUiV2.humanAccepted &&
      ssot.tracks.saasUiV2.humanReviewRequired &&
      !statusModel.requiredSaasUiV2CurrentState.visualAccepted &&
      !statusModel.requiredSaasUiV2CurrentState.previewDeployed &&
      !statusModel.requiredSaasUiV2CurrentState.humanAccepted &&
      !contract.gitPolicy.pushAllowed &&
      !contract.deployPolicy.deployAllowed,
  );
  check(
    "evidenceRecordsReconciliationWithoutOverclaim",
    evidence.status === "LOCAL_E2E_PASS" &&
      !evidence.visualAccepted &&
      evidence.visualReviewStatus === "PENDING_HUMAN_REVIEW" &&
      evidence.humanReviewRequired &&
      evidence.postTaskReconciliation?.status === "PASS" &&
      evidence.postTaskReconciliation.implementationCommit === IMPLEMENTATION_HEAD &&
      evidence.postTaskReconciliation.safeSkippedCount === 1 &&
      evidence.postTaskReconciliation.multiMonthTargetPolicy === "NO_SINGLE_MONTH_TARGET_REUSE" &&
      !evidence.postTaskReconciliation.pushExecuted &&
      !evidence.postTaskReconciliation.deployExecuted,
  );
  check(
    "reconciliationDocumentsExist",
    fs.existsSync(path.join(ROOT, `${TASK_DIR}/autonomous-e2e-reconciliation-v1.md`)) &&
      fs.existsSync(path.join(ROOT, `${TASK_DIR}/handoff.md`)),
  );
  check("activeBranchRecorded", ssot.repository.activeBranch === "feature/saas-ui-v2-shell");
  check("implementationCommitExists", git(["cat-file", "-t", IMPLEMENTATION_HEAD]) === "commit");

  const failed = checks.filter((item) => !item.pass);
  const result = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    task: "V2_HOME_AUTONOMOUS_E2E_RECONCILIATION_V1",
    implementationCommit: IMPLEMENTATION_HEAD,
    currentTask: currentTask.taskId,
    nextGate: currentTask.nextGate,
    checks,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    status: "FAIL",
    task: "V2_HOME_AUTONOMOUS_E2E_RECONCILIATION_V1",
    safeError: error instanceof Error ? error.message : "unknown_error",
    checks,
  }, null, 2));
  process.exitCode = 1;
}
