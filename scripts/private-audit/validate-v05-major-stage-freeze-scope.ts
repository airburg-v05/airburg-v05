import { execFileSync } from "node:child_process";
import {
  resolveMajorStageFromTaskStage,
  validateMajorStageSequenceForCurrentTask,
  validateMajorStageTransition,
  type StageFreezePolicyTask,
} from "./lib/v05-stage-freeze-policy";

const STAGES = ["V0.5A", "V0.5B", "V0.5C", "V0.5D", "V0.5E", "V0.5F", "V0.5G"] as const;
const LOCK_FILE = "docs/project/v0.5-lock.json";

type StageStatus = "pending" | "complete";

interface TestCase {
  name: string;
  task: StageFreezePolicyTask;
  baseline: Record<string, StageStatus>;
  current: Record<string, StageStatus>;
  executionSequenceStatuses?: Record<string, StageStatus>;
  expectedPass: boolean;
}

const gitStatus = (): string =>
  execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const completeThrough = (stage: string | null): Record<string, StageStatus> => {
  const stageIndex = stage === null ? -1 : STAGES.indexOf(stage as typeof STAGES[number]);
  return Object.fromEntries(
    STAGES.map((stageId, index) => [stageId, index <= stageIndex ? "complete" : "pending"]),
  ) as Record<string, StageStatus>;
};

const freezeTask = (stage: string, status: StageFreezePolicyTask["status"] = "complete"): StageFreezePolicyTask => ({
  taskId: `${stage.replace("-", "_")}_FINAL_REGRESSION_AND_STAGE_FREEZE`,
  stage: `${stage}-5`,
  status,
  allowedModifyPaths: [LOCK_FILE],
  forbiddenModifyPaths: [],
});

const normalTask = (stage: string): StageFreezePolicyTask => ({
  taskId: `${stage.replace("-", "_")}_NORMAL_TASK`,
  stage: `${stage}-1`,
  status: "in_progress",
  allowedModifyPaths: [],
  forbiddenModifyPaths: [LOCK_FILE],
});

const unknownStageTask = (): StageFreezePolicyTask => ({
  taskId: "V0.5Z_5_FINAL_REGRESSION_AND_STAGE_FREEZE",
  stage: "V0.5Z-5",
  status: "complete",
  allowedModifyPaths: [LOCK_FILE],
  forbiddenModifyPaths: [],
});

const evaluate = (testCase: TestCase) => {
  const transitionResults = Object.fromEntries(
    STAGES.map((stageId) => [
      stageId,
      validateMajorStageTransition({
        majorStageId: stageId,
        baselineStageStatus: testCase.baseline[stageId],
        currentStageStatus: testCase.current[stageId],
        currentTask: testCase.task,
        immutableAuthorizationValid: true,
      }),
    ]),
  );
  const sequenceResult = validateMajorStageSequenceForCurrentTask({
    orderedMajorStageIds: STAGES,
    stageStatuses: testCase.current,
    currentTask: testCase.task,
    immutableAuthorizationValid: true,
  });
  const executionStatuses = testCase.executionSequenceStatuses ?? testCase.current;
  const executionSequenceMatchesStageStatuses = STAGES.every(
    (stageId) => executionStatuses[stageId] === testCase.current[stageId],
  );
  const actualPass =
    Object.values(transitionResults).every((result) => result.transitionValid) &&
    sequenceResult.sequenceValid &&
    executionSequenceMatchesStageStatuses;

  return {
    name: testCase.name,
    expectedPass: testCase.expectedPass,
    actualPass,
    ok: actualPass === testCase.expectedPass,
    currentTaskMajorStage: resolveMajorStageFromTaskStage(testCase.task.stage),
    transitionResults,
    sequenceResult,
    executionSequenceMatchesStageStatuses,
  };
};

const baselineA = completeThrough(null);
const baselineB = completeThrough("V0.5A");
const baselineC = completeThrough("V0.5B");
const baselineD = completeThrough("V0.5C");
const currentA = completeThrough("V0.5A");
const currentB = completeThrough("V0.5B");
const currentC = completeThrough("V0.5C");
const currentD = completeThrough("V0.5D");

const cWithDComplete = { ...currentC, "V0.5D": "complete" as const };
const cWithCPending = { ...currentC, "V0.5C": "pending" as const };
const cWithBPending = { ...currentC, "V0.5B": "pending" as const };
const cWithSequenceMismatch = { ...currentC, "V0.5D": "complete" as const };

const tests: TestCase[] = [
  {
    name: "A freeze complete accepts A complete and B-G pending",
    task: freezeTask("V0.5A"),
    baseline: baselineA,
    current: currentA,
    expectedPass: true,
  },
  {
    name: "B freeze complete accepts A-B complete and C-G pending",
    task: freezeTask("V0.5B"),
    baseline: baselineB,
    current: currentB,
    expectedPass: true,
  },
  {
    name: "C freeze complete accepts A-C complete and D-G pending",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: currentC,
    expectedPass: true,
  },
  {
    name: "C freeze complete rejects D complete",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: cWithDComplete,
    expectedPass: false,
  },
  {
    name: "C freeze complete rejects C pending",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: cWithCPending,
    expectedPass: false,
  },
  {
    name: "C freeze complete rejects B pending",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: cWithBPending,
    expectedPass: false,
  },
  {
    name: "D freeze complete accepts A-D complete and E-G pending",
    task: freezeTask("V0.5D"),
    baseline: baselineD,
    current: currentD,
    expectedPass: true,
  },
  {
    name: "non-freeze C task cannot mark C complete",
    task: normalTask("V0.5C"),
    baseline: baselineC,
    current: currentC,
    expectedPass: false,
  },
  {
    name: "blocked C freeze task cannot mark C complete",
    task: freezeTask("V0.5C", "blocked"),
    baseline: baselineC,
    current: currentC,
    expectedPass: false,
  },
  {
    name: "complete stage cannot return to pending",
    task: normalTask("V0.5A"),
    baseline: currentA,
    current: baselineA,
    expectedPass: false,
  },
  {
    name: "executionSequence and stageStatuses mismatch fails",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: currentC,
    executionSequenceStatuses: cWithSequenceMismatch,
    expectedPass: false,
  },
  {
    name: "unknown task stage fails",
    task: unknownStageTask(),
    baseline: baselineC,
    current: currentC,
    expectedPass: false,
  },
  {
    name: "current real C3 post-registration state passes",
    task: freezeTask("V0.5C"),
    baseline: baselineC,
    current: currentC,
    expectedPass: true,
  },
];

const statusBefore = gitStatus();
const results = tests.map(evaluate);
const statusAfter = gitStatus();
const failedChecks = results
  .filter((result) => !result.ok)
  .map((result) => result.name);

const output = {
  status: failedChecks.length === 0 && statusBefore === statusAfter ? "PASS" : "FAIL",
  failedChecks: [
    ...failedChecks,
    ...(statusBefore === statusAfter ? [] : ["worktreeMutated"]),
  ],
  testCount: tests.length,
  results,
  worktreeMutated: statusBefore !== statusAfter,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (output.status !== "PASS") process.exitCode = 1;
