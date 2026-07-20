import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

type Json = Record<string, unknown>;
interface CurrentTaskRecord {
  taskId: string;
  status: string;
  contract: string;
  nextGate?: string;
}

interface ProjectSsot {
  currentTask: CurrentTaskRecord;
  nextAuthorizedEntryGate: string;
  repository: {
    headCommit: string;
  };
  tracks: {
    saasUiV2: {
      status: string;
      dataBound: boolean;
      dataBoundRoutes: string[];
      remainingStaticShellRouteCount: number;
      localE2EPassed: boolean;
      previewDeployed: boolean;
      visualAccepted: boolean;
      humanAccepted: boolean;
      visualReviewStatus: string;
      humanReviewRequired: boolean;
      deploymentCommit: string;
    };
  };
}

interface StatusModel {
  requiredSaasUiV2CurrentState: {
    previewDeployed: boolean;
    visualAccepted: boolean;
    humanAccepted: boolean;
    nextGate: string;
  };
  states: Record<string, string>;
}

interface PassStatusRecord {
  taskId: string;
  status: string;
}

interface GateManifestRecord {
  deliverable_status: string;
}

interface DataContractRecord {
  implementationStatus: string;
  deploymentCommit: string;
  previewDeployed: boolean;
  visualAccepted: boolean;
  humanAccepted: boolean;
}

interface RouteMatrixRecord {
  routes: Array<{
    route: string;
    isPublic: boolean;
    isDataBound: boolean;
    isStaticShell: boolean;
    status: string;
  }>;
}

interface RegistryRecord {
  totalValidators: number;
  countsByTier: Record<string, number>;
  countsByValidationType: Record<string, number>;
  validators: Array<{
    file: string;
    tier: string;
    validationType: string;
  }>;
}

interface EvidenceRecord {
  taskId: string;
  status: string;
  outOfBandConnection: {
    method: string;
  };
  sshRootCauseReport: {
    rootCause: string;
  };
  sshRecovery: {
    sshdConfigTest: string;
    consecutivePasses: number;
    serverBannerReceived: boolean;
    authenticationCompleted: boolean;
    wholeInstanceRebooted: boolean;
  };
  deployment: {
    deploymentCommit: string;
    packageSha256: string;
    remoteNpmCi: string;
    remoteBuild: string;
    pm2: string;
    nginx: string;
    nodePortBinding: string;
    publicPort3000Reachable: boolean;
    realSamplesCopiedToServer: boolean;
  };
  publicRegression: {
    realFileCount: number;
    importCounts: {
      success: number;
      failed: number;
      skipped: number;
    };
    totals: {
      gmv: number;
      gsv: number;
    };
    refreshRestore: boolean;
    reopenRestore: boolean;
    duplicateImportDoesNotDouble: boolean;
    mobile390HorizontalOverflow: boolean;
    consoleBusinessErrors: number;
    failedBusinessRequests: number;
    invalidNumericText: boolean;
    sensitiveText: boolean;
    screenshotCount: number;
    screenshotManifest: string;
  };
  stateBoundary: {
    visualAccepted: boolean;
    humanAccepted: boolean;
  };
}

const ROOT = process.cwd();
const TASK_ID = "ECS_OUT_OF_BAND_SSH_RECOVERY_AND_RESUME_V2_HOME_PREVIEW_DEPLOY_V1";
const TASK_DIR = `docs/project/tasks/${TASK_ID}`;
const DEPLOYMENT_COMMIT = "a293db7e75b14853d68d9711e131cc348d2f3ea0";
const DEPLOYMENT_DIGEST = "8790c30cadcc7579cfdfe205d70e1e383b1e30ead30dd67045fdda5d9e2747b8";

const checks: Check[] = [];
const check = (name: string, pass: boolean, details?: unknown) =>
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const json = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

const countBy = (records: Json[], key: string) =>
  records.reduce<Record<string, number>>((counts, record) => {
    const value = String(record[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const sameRecord = (left: Record<string, number>, right: Record<string, number>) => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  return keys.every((key) => left[key] === right[key]);
};

const main = () => {
  const ssot = json<ProjectSsot>("docs/project/PROJECT_SSOT.json");
  const statusModel = json<StatusModel>("docs/project/STATUS_MODEL_V1.json");
  const currentTask = json<CurrentTaskRecord>("docs/project/current-task.json");
  const contract = json<PassStatusRecord>(`${TASK_DIR}/task-contract.json`);
  const evidence = json<EvidenceRecord>(`${TASK_DIR}/evidence.json`);
  const gate = json<GateManifestRecord>(`${TASK_DIR}/gate-manifest.json`);
  const dataContract = json<DataContractRecord>("docs/project/V2_HOME_DATA_CONTRACT.json");
  const routeMatrix = json<RouteMatrixRecord>("docs/project/ROUTE_DATA_SOURCE_MATRIX.json");
  const registry = json<RegistryRecord>("docs/project/VALIDATOR_REGISTRY.json");

  check("taskContractCompleted", contract.taskId === TASK_ID && contract.status === "PASS");
  check("gateManifestCompleted", gate.deliverable_status === "complete");
  check("evidenceCompleted", evidence.taskId === TASK_ID && evidence.status === "PASS");
  check(
    "currentTaskPendingHumanReview",
    currentTask.taskId === TASK_ID &&
      currentTask.status === "PENDING_HUMAN_REVIEW" &&
      currentTask.nextGate === "V2_HOME_HUMAN_VISUAL_REVIEW",
  );
  check(
    "ssotTaskAligned",
    ssot.currentTask.taskId === currentTask.taskId &&
      ssot.currentTask.status === currentTask.status &&
      ssot.currentTask.contract === currentTask.contract &&
      ssot.nextAuthorizedEntryGate === "V2_HOME_HUMAN_VISUAL_REVIEW",
  );

  const v2 = ssot.tracks.saasUiV2;
  check(
    "v2HomePreviewStateExact",
    v2.status === "HOME_VERTICAL_SLICE_LOCAL_E2E_PASS" &&
      v2.dataBound === true &&
      v2.dataBoundRoutes.join(",") === "/v2/home" &&
      v2.remainingStaticShellRouteCount === 8 &&
      v2.localE2EPassed === true &&
      v2.previewDeployed === true &&
      v2.visualAccepted === false &&
      v2.humanAccepted === false &&
      v2.visualReviewStatus === "PENDING_HUMAN_REVIEW" &&
      v2.humanReviewRequired === true,
  );
  check(
    "deploymentIdentityExact",
    ssot.repository.headCommit === DEPLOYMENT_COMMIT &&
      v2.deploymentCommit === DEPLOYMENT_COMMIT &&
      evidence.deployment.deploymentCommit === DEPLOYMENT_COMMIT &&
      evidence.deployment.packageSha256 === DEPLOYMENT_DIGEST,
  );
  check(
    "statusModelMatchesPreviewGate",
    statusModel.requiredSaasUiV2CurrentState.previewDeployed === true &&
      statusModel.requiredSaasUiV2CurrentState.visualAccepted === false &&
      statusModel.requiredSaasUiV2CurrentState.humanAccepted === false &&
      statusModel.requiredSaasUiV2CurrentState.nextGate === "V2_HOME_HUMAN_VISUAL_REVIEW" &&
      typeof statusModel.states.PENDING_HUMAN_REVIEW === "string",
  );
  check(
    "dataContractRecordsPreviewWithoutAcceptance",
    dataContract.implementationStatus === "PREVIEW_DEPLOYED_PENDING_HUMAN_REVIEW" &&
      dataContract.deploymentCommit === DEPLOYMENT_COMMIT &&
      dataContract.previewDeployed === true &&
      dataContract.visualAccepted === false &&
      dataContract.humanAccepted === false,
  );

  const v2Routes = routeMatrix.routes.filter((route) => route.route.startsWith("/v2/"));
  const home = v2Routes.find((route) => route.route === "/v2/home");
  const staticRoutes = v2Routes.filter((route) => route.route !== "/v2/home");
  check(
    "routeMatrixRecordsOnePublicDataBoundPreview",
    v2Routes.length === 9 &&
      home?.isPublic === true &&
      home?.isDataBound === true &&
      home?.isStaticShell === false &&
      home?.status === "PREVIEW_DEPLOYED",
  );
  check(
    "otherV2RoutesRemainPublicStaticShells",
    staticRoutes.length === 8 &&
      staticRoutes.every(
        (route: Json) =>
          route.isPublic === true &&
          route.isDataBound === false &&
          route.isStaticShell === true &&
          route.status === "STATIC_SHELL_ROUTE_200",
      ),
  );

  check(
    "sshRecoveryEvidenceComplete",
    evidence.outOfBandConnection.method === "ALIYUN_WORKBENCH" &&
      evidence.sshRootCauseReport.rootCause === "ALIYUN_SECURITY_CONTROL" &&
      evidence.sshRecovery.sshdConfigTest === "PASS" &&
      evidence.sshRecovery.consecutivePasses === 3 &&
      evidence.sshRecovery.serverBannerReceived === true &&
      evidence.sshRecovery.authenticationCompleted === true &&
      evidence.sshRecovery.wholeInstanceRebooted === false,
  );
  check(
    "deploymentRuntimeEvidenceComplete",
    evidence.deployment.remoteNpmCi === "PASS" &&
      evidence.deployment.remoteBuild === "PASS" &&
      evidence.deployment.pm2 === "online" &&
      evidence.deployment.nginx === "active_and_config_valid" &&
      evidence.deployment.nodePortBinding === "127.0.0.1:3000" &&
      evidence.deployment.publicPort3000Reachable === false &&
      evidence.deployment.realSamplesCopiedToServer === false,
  );
  check(
    "publicRealDataEvidenceComplete",
    evidence.publicRegression.realFileCount === 18 &&
      evidence.publicRegression.importCounts.success === 17 &&
      evidence.publicRegression.importCounts.failed === 0 &&
      evidence.publicRegression.importCounts.skipped === 1 &&
      evidence.publicRegression.totals.gmv === 125596 &&
      evidence.publicRegression.totals.gsv === 85455.96 &&
      evidence.publicRegression.refreshRestore === true &&
      evidence.publicRegression.reopenRestore === true &&
      evidence.publicRegression.duplicateImportDoesNotDouble === true,
  );
  check(
    "publicSafetyEvidenceComplete",
    evidence.publicRegression.mobile390HorizontalOverflow === false &&
      evidence.publicRegression.consoleBusinessErrors === 0 &&
      evidence.publicRegression.failedBusinessRequests === 0 &&
      evidence.publicRegression.invalidNumericText === false &&
      evidence.publicRegression.sensitiveText === false &&
      evidence.stateBoundary.visualAccepted === false &&
      evidence.stateBoundary.humanAccepted === false,
  );
  check(
    "publicScreenshotManifestRecorded",
    evidence.publicRegression.screenshotCount === 10 &&
      typeof evidence.publicRegression.screenshotManifest === "string" &&
      evidence.publicRegression.screenshotManifest.endsWith("/manifest.json"),
  );

  const validatorFiles = fs
    .readdirSync(path.join(ROOT, "scripts/private-audit"))
    .filter((file) => file.startsWith("validate-") && file.endsWith(".ts"))
    .map((file) => `scripts/private-audit/${file}`)
    .sort();
  const registeredFiles = registry.validators.map((record) => record.file).sort();
  check("validatorRegistryMatchesFiles", JSON.stringify(validatorFiles) === JSON.stringify(registeredFiles));
  check(
    "validatorRegistryCountsDerived",
    registry.totalValidators === registry.validators.length &&
      sameRecord(registry.countsByTier, countBy(registry.validators, "tier")) &&
      sameRecord(registry.countsByValidationType, countBy(registry.validators, "validationType")),
  );

  check("deploymentCommitExists", git(["cat-file", "-t", DEPLOYMENT_COMMIT]) === "commit");
  check("activeBranchExact", git(["branch", "--show-current"]) === "feature/saas-ui-v2-shell");
  const allowedChanges = [
    "docs/PROJECT_CURRENT_STATE.md",
    "docs/project/PROJECT_SSOT.json",
    "docs/project/ROUTE_DATA_SOURCE_MATRIX.json",
    "docs/project/STATUS_MODEL_V1.json",
    "docs/project/V2_HOME_DATA_CONTRACT.json",
    "docs/project/VALIDATOR_REGISTRY.json",
    "docs/project/current-task.json",
    `${TASK_DIR}/evidence.json`,
    `${TASK_DIR}/gate-manifest.json`,
    `${TASK_DIR}/handoff.md`,
    `${TASK_DIR}/task-contract.json`,
    "scripts/private-audit/validate-v2-home-preview-deployment-current-state-v1.ts",
  ];
  const changed = execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
  check(
    "workingTreeChangesAreGovernanceOnly",
    changed.every((file) => allowedChanges.includes(file)),
    changed,
  );

  const failed = checks.filter((item) => !item.pass);
  console.log(
    JSON.stringify(
      {
        status: failed.length === 0 ? "PASS" : "FAIL",
        task: "V2_HOME_PREVIEW_DEPLOYMENT_CURRENT_STATE_V1",
        deploymentCommit: DEPLOYMENT_COMMIT,
        nextGate: currentTask.nextGate,
        checks,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "FAIL",
        task: "V2_HOME_PREVIEW_DEPLOYMENT_CURRENT_STATE_V1",
        safeError: error instanceof Error ? error.message : "unknown_error",
        checks,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
