import fs from "node:fs";
import path from "node:path";
import { validateMajorStageTransition, type StageFreezePolicyTask } from "./lib/v05-stage-freeze-policy";

const ROOT = process.cwd();
const LOCK_FILE = "docs/project/v0.5-lock.json";

interface Scenario {
  name: string;
  majorStageId: string;
  baselineStageStatus: string | null;
  currentStageStatus: string | null;
  currentTask: StageFreezePolicyTask;
  immutableAuthorizationValid: boolean;
  expected: boolean;
}

const normalTask: StageFreezePolicyTask = {
  taskId: "V0.5A_4_1_REAL_INDEXEDDB_ADAPTER_BROWSER_INTEGRATION_CLOSURE",
  stage: "V0.5A-4.1",
  status: "complete",
  allowedModifyPaths: ["scripts/private-audit/example.ts"],
  forbiddenModifyPaths: [LOCK_FILE],
};

const freezeTask = ({
  status = "in_progress",
  allowedModifyPaths = [LOCK_FILE],
  forbiddenModifyPaths = [],
  majorStageId = "V0.5A",
}: {
  status?: StageFreezePolicyTask["status"];
  allowedModifyPaths?: string[];
  forbiddenModifyPaths?: string[];
  majorStageId?: string;
} = {}): StageFreezePolicyTask => ({
  taskId: `${majorStageId.replace(".", "")}_FINAL_REGRESSION_AND_STAGE_FREEZE`,
  stage: `${majorStageId}-5`,
  status,
  allowedModifyPaths,
  forbiddenModifyPaths,
});

const scenarios: Scenario[] = [
  {
    name: "pending -> pending, normal task PASS",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "pending",
    currentTask: normalTask,
    immutableAuthorizationValid: true,
    expected: true,
  },
  {
    name: "pending -> complete, normal task FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: normalTask,
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "pending -> complete, freeze task without lock permission FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ allowedModifyPaths: [] }),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "pending -> complete, freeze task with lock forbidden FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ forbiddenModifyPaths: [LOCK_FILE] }),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "pending -> complete, authorized freeze in_progress PASS",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ status: "in_progress" }),
    immutableAuthorizationValid: true,
    expected: true,
  },
  {
    name: "pending -> complete, authorized freeze complete PASS",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ status: "complete" }),
    immutableAuthorizationValid: true,
    expected: true,
  },
  {
    name: "freeze complete but lock pending FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "pending",
    currentTask: freezeTask({ status: "complete" }),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "freeze blocked cannot complete stage FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ status: "blocked" }),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "complete -> complete, later normal task PASS",
    majorStageId: "V0.5A",
    baselineStageStatus: "complete",
    currentStageStatus: "complete",
    currentTask: normalTask,
    immutableAuthorizationValid: true,
    expected: true,
  },
  {
    name: "complete -> pending FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "complete",
    currentStageStatus: "pending",
    currentTask: normalTask,
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "unknown status FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: "ready",
    currentStageStatus: "complete",
    currentTask: freezeTask(),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "baseline commit missing equivalent FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: null,
    currentStageStatus: "pending",
    currentTask: normalTask,
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "baseline lock unparsable equivalent FAIL",
    majorStageId: "V0.5A",
    baselineStageStatus: null,
    currentStageStatus: "complete",
    currentTask: freezeTask(),
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "old blocked A-5 does not satisfy transition",
    majorStageId: "V0.5A",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: {
      ...freezeTask({ status: "blocked" }),
      taskId: "V0.5A_5_FINAL_REGRESSION_AND_STAGE_FREEZE",
      stage: "V0.5A-5",
    },
    immutableAuthorizationValid: true,
    expected: false,
  },
  {
    name: "V0.5B authorized freeze uses same strategy PASS",
    majorStageId: "V0.5B",
    baselineStageStatus: "pending",
    currentStageStatus: "complete",
    currentTask: freezeTask({ majorStageId: "V0.5B", status: "in_progress" }),
    immutableAuthorizationValid: true,
    expected: true,
  },
];

const scenarioResults = scenarios.map((scenario) => {
  const result = validateMajorStageTransition(scenario);
  return {
    name: scenario.name,
    expected: scenario.expected,
    actual: result.transitionValid,
    ok: result.transitionValid === scenario.expected,
    transitionType: result.transitionType,
    authorizedFreezeTask: result.authorizedFreezeTask,
    rejectionReason: result.rejectionReason,
  };
});

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, LOCK_FILE), "utf8")) as {
  stageStatuses?: Record<string, string>;
};
const currentV05AStatus = lock.stageStatuses?.["V0.5A"] ?? null;

const output = {
  status: scenarioResults.every((result) => result.ok) && currentV05AStatus === "pending" ? "PASS" : "FAIL",
  currentV05AStatus,
  lockUnmodifiedExpectation: "V0.5A remains pending in this task",
  scenarioResults,
  failedScenarios: scenarioResults.filter((result) => !result.ok).map((result) => result.name),
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.status !== "PASS") process.exitCode = 1;
