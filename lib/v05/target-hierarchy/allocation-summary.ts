import type { TargetRecord } from "../domain/models";
import type { TargetAllocationSummary, TargetAllocationSummaryInput } from "./contracts";
import { isActiveTarget, isDeletedTarget, isPausedTarget, normalizeParentTargetId } from "./target-normalization";

const DEFAULT_EPSILON = 0.000001;

const sumTargetValues = (targets: TargetRecord[]): number =>
  targets.reduce((total, target) => total + target.targetValue, 0);

export const buildTargetAllocationSummary = ({
  parentTarget,
  childTargets,
  epsilon = DEFAULT_EPSILON,
}: TargetAllocationSummaryInput): TargetAllocationSummary => {
  const directChildren = childTargets.filter((target) => normalizeParentTargetId(target) === parentTarget.targetId);
  const activeChildren = directChildren.filter(isActiveTarget);
  const pausedChildren = directChildren.filter(isPausedTarget);
  const deletedChildren = directChildren.filter(isDeletedTarget);
  const activeAllocatedValue = sumTargetValues(activeChildren);
  const pausedAllocatedValue = sumTargetValues(pausedChildren);
  const remainingValue = Math.max(parentTarget.targetValue - activeAllocatedValue, 0);
  const overAllocatedValue = Math.max(activeAllocatedValue - parentTarget.targetValue, 0);

  const allocationStatus =
    activeChildren.length === 0
      ? "none"
      : overAllocatedValue > epsilon
        ? "over_allocated"
        : remainingValue > epsilon
          ? "under_allocated"
          : "fully_allocated";

  return {
    parentTargetId: parentTarget.targetId,
    parentTargetValue: parentTarget.targetValue,
    activeChildCount: activeChildren.length,
    pausedChildCount: pausedChildren.length,
    deletedChildCount: deletedChildren.length,
    activeAllocatedValue,
    pausedAllocatedValue,
    remainingValue,
    overAllocatedValue,
    allocationStatus,
  };
};
