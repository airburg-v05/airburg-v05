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

const LOCK_FILE = "docs/project/v0.5-lock.json";
const FREEZE_TASK_SUFFIX = "_FINAL_REGRESSION_AND_STAGE_FREEZE";
const SUPPORTED_STATUSES = new Set(["pending", "complete"]);

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

export const isAuthorizedMajorStageFreezeTask = ({
  majorStageId,
  currentTask,
  immutableAuthorizationValid,
}: {
  majorStageId: string;
  currentTask: StageFreezePolicyTask;
  immutableAuthorizationValid: boolean;
}): boolean =>
  immutableAuthorizationValid &&
  currentTask.stage.startsWith(`${majorStageId}-`) &&
  currentTask.taskId.endsWith(FREEZE_TASK_SUFFIX) &&
  (currentTask.status === "in_progress" || currentTask.status === "complete") &&
  currentTask.allowedModifyPaths.includes(LOCK_FILE) &&
  !currentTask.forbiddenModifyPaths.some((pattern) => matchesPathPattern(LOCK_FILE, pattern));

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
    currentTask.taskId.endsWith(FREEZE_TASK_SUFFIX) &&
    currentTask.status === "complete" &&
    currentStageStatus !== "complete"
  ) {
    return result(false, "completed_freeze_task_requires_complete_stage");
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
