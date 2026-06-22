export type MajorStageStatus = "pending" | "complete";

export type MajorStageTransitionType =
  | "pending_to_pending"
  | "pending_to_complete"
  | "complete_to_complete"
  | "complete_to_pending"
  | "unknown_status";

export interface StageFreezePolicyTask {
  taskId: string;
  stage: string;
  status: "pending" | "in_progress" | "blocked" | "complete";
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

export interface ValidateMajorStageTransitionInput {
  majorStageId: string;
  baselineStageStatus: string | null;
  currentStageStatus: string | null;
  currentTask: StageFreezePolicyTask;
  immutableAuthorizationValid: boolean;
}

export interface MajorStageTransitionResult {
  baselineStageStatus: string | null;
  currentStageStatus: string | null;
  transitionType: MajorStageTransitionType;
  authorizedFreezeTask: boolean;
  transitionValid: boolean;
  rejectionReason: string | null;
}

export interface ValidateMajorStageSequenceInput {
  orderedMajorStageIds: readonly string[];
  stageStatuses: Record<string, string | undefined>;
  currentTask: StageFreezePolicyTask;
  immutableAuthorizationValid: boolean;
}

export interface MajorStageSequenceResult {
  currentTaskMajorStage: string | null;
  freezeTask: boolean;
  sequenceValid: boolean;
  failures: Array<{
    majorStageId: string;
    expected: string;
    actual: string | null;
    reason: string;
  }>;
}

const LOCK_FILE = "docs/project/v0.5-lock.json";
const FREEZE_TASK_SUFFIX = "_FINAL_REGRESSION_AND_STAGE_FREEZE";
const SUPPORTED_STATUSES = new Set(["pending", "complete"]);
const SUPPORTED_MAJOR_STAGES = ["V0.5A", "V0.5B", "V0.5C", "V0.5D", "V0.5E", "V0.5F", "V0.5G"] as const;

const matchesPathPattern = (file: string, pattern: string): boolean => {
  if (pattern === file) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    return file === suffix || file.endsWith(`/${suffix}`);
  }
  return false;
};

const transitionTypeFor = (
  baselineStageStatus: string | null,
  currentStageStatus: string | null,
): MajorStageTransitionType => {
  if (!baselineStageStatus || !currentStageStatus) return "unknown_status";
  if (!SUPPORTED_STATUSES.has(baselineStageStatus) || !SUPPORTED_STATUSES.has(currentStageStatus)) {
    return "unknown_status";
  }
  if (baselineStageStatus === "pending" && currentStageStatus === "pending") return "pending_to_pending";
  if (baselineStageStatus === "pending" && currentStageStatus === "complete") return "pending_to_complete";
  if (baselineStageStatus === "complete" && currentStageStatus === "complete") return "complete_to_complete";
  if (baselineStageStatus === "complete" && currentStageStatus === "pending") return "complete_to_pending";
  return "unknown_status";
};

export const resolveMajorStageFromTaskStage = (taskStage: string): string | null => {
  const match = /^(V0\.5[A-G])(?:$|-)/.exec(taskStage);
  if (!match) return null;
  return SUPPORTED_MAJOR_STAGES.includes(match[1] as typeof SUPPORTED_MAJOR_STAGES[number])
    ? match[1]
    : null;
};

const isFinalRegressionFreezeTask = (currentTask: StageFreezePolicyTask): boolean =>
  currentTask.taskId.endsWith(FREEZE_TASK_SUFFIX);

export const isAuthorizedMajorStageFreezeTask = ({
  majorStageId,
  currentTask,
  immutableAuthorizationValid,
}: {
  majorStageId: string;
  currentTask: StageFreezePolicyTask;
  immutableAuthorizationValid: boolean;
}): boolean => {
  const currentTaskMajorStage = resolveMajorStageFromTaskStage(currentTask.stage);
  return (
    immutableAuthorizationValid &&
    currentTaskMajorStage === majorStageId &&
    isFinalRegressionFreezeTask(currentTask) &&
    (currentTask.status === "in_progress" || currentTask.status === "complete") &&
    currentTask.allowedModifyPaths.includes(LOCK_FILE) &&
    !currentTask.forbiddenModifyPaths.some((pattern) => matchesPathPattern(LOCK_FILE, pattern))
  );
};

export const validateMajorStageSequenceForCurrentTask = ({
  orderedMajorStageIds,
  stageStatuses,
  currentTask,
  immutableAuthorizationValid,
}: ValidateMajorStageSequenceInput): MajorStageSequenceResult => {
  const freezeTask = isFinalRegressionFreezeTask(currentTask);
  const currentTaskMajorStage = resolveMajorStageFromTaskStage(currentTask.stage);
  const failures: MajorStageSequenceResult["failures"] = [];

  if (!freezeTask) {
    return {
      currentTaskMajorStage,
      freezeTask,
      sequenceValid: currentTaskMajorStage !== null,
      failures: currentTaskMajorStage === null
        ? [{
            majorStageId: currentTask.stage,
            expected: "known_major_stage",
            actual: null,
            reason: "unknown_task_stage",
          }]
        : [],
    };
  }

  if (!immutableAuthorizationValid) {
    return {
      currentTaskMajorStage,
      freezeTask,
      sequenceValid: false,
      failures: [{
        majorStageId: currentTask.stage,
        expected: "immutable_authorization_valid",
        actual: "false",
        reason: "freeze_task_requires_valid_authorization",
      }],
    };
  }

  if (currentTaskMajorStage === null) {
    return {
      currentTaskMajorStage,
      freezeTask,
      sequenceValid: false,
      failures: [{
        majorStageId: currentTask.stage,
        expected: "known_major_stage",
        actual: null,
        reason: "unknown_task_stage",
      }],
    };
  }

  const currentIndex = orderedMajorStageIds.indexOf(currentTaskMajorStage);
  if (currentIndex < 0) {
    return {
      currentTaskMajorStage,
      freezeTask,
      sequenceValid: false,
      failures: [{
        majorStageId: currentTaskMajorStage,
        expected: "stage_in_execution_sequence",
        actual: "missing",
        reason: "task_stage_not_in_sequence",
      }],
    };
  }

  orderedMajorStageIds.forEach((majorStageId, index) => {
    const actual = stageStatuses[majorStageId] ?? null;
    if (!actual || !SUPPORTED_STATUSES.has(actual)) {
      failures.push({
        majorStageId,
        expected: "pending_or_complete",
        actual,
        reason: "unsupported_stage_status",
      });
      return;
    }

    if (index < currentIndex && actual !== "complete") {
      failures.push({
        majorStageId,
        expected: "complete",
        actual,
        reason: "prior_stage_must_be_complete",
      });
      return;
    }

    if (index === currentIndex) {
      const expected = currentTask.status === "complete" ? "complete" : "pending_or_complete";
      if (currentTask.status === "complete" && actual !== "complete") {
        failures.push({
          majorStageId,
          expected,
          actual,
          reason: "completed_freeze_task_requires_current_stage_complete",
        });
      }
      return;
    }

    if (index > currentIndex && actual !== "pending") {
      failures.push({
        majorStageId,
        expected: "pending",
        actual,
        reason: "future_stage_must_remain_pending",
      });
    }
  });

  return {
    currentTaskMajorStage,
    freezeTask,
    sequenceValid: failures.length === 0,
    failures,
  };
};

export const validateMajorStageTransition = ({
  majorStageId,
  baselineStageStatus,
  currentStageStatus,
  currentTask,
  immutableAuthorizationValid,
}: ValidateMajorStageTransitionInput): MajorStageTransitionResult => {
  const transitionType = transitionTypeFor(baselineStageStatus, currentStageStatus);
  const authorizedFreezeTask = isAuthorizedMajorStageFreezeTask({
    majorStageId,
    currentTask,
    immutableAuthorizationValid,
  });
  const currentTaskMajorStage = resolveMajorStageFromTaskStage(currentTask.stage);

  const result = (transitionValid: boolean, rejectionReason: string | null): MajorStageTransitionResult => ({
    baselineStageStatus,
    currentStageStatus,
    transitionType,
    authorizedFreezeTask,
    transitionValid,
    rejectionReason,
  });

  if (transitionType === "unknown_status") return result(false, "unsupported_stage_status");

  if (currentTask.status === "blocked" && baselineStageStatus !== currentStageStatus) {
    return result(false, "blocked_task_cannot_change_stage");
  }

  if (
    isFinalRegressionFreezeTask(currentTask) &&
    currentTask.status === "complete" &&
    currentTaskMajorStage === majorStageId &&
    currentStageStatus !== "complete"
  ) {
    return result(false, "completed_freeze_task_requires_current_stage_complete");
  }

  if (transitionType === "pending_to_pending") return result(true, null);
  if (transitionType === "complete_to_complete") return result(true, null);
  if (transitionType === "complete_to_pending") return result(false, "completed_stage_cannot_return_to_pending");

  if (transitionType === "pending_to_complete") {
    if (authorizedFreezeTask) return result(true, null);
    return result(false, "pending_to_complete_requires_authorized_freeze_task");
  }

  return result(false, "unsupported_stage_transition");
};
