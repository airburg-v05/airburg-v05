import type { TargetRecord, TargetScope } from "../domain/models";

export type TargetAllocationMode = "sum" | "none";

export type TargetAllocationStatus =
  | "none"
  | "under_allocated"
  | "fully_allocated"
  | "over_allocated";

export interface TargetMetricAllocationPolicy {
  metricKey: string;
  allocationMode: TargetAllocationMode;
  reason: string;
}

export interface TargetAllocationSummaryInput {
  parentTarget: TargetRecord;
  childTargets: TargetRecord[];
  epsilon?: number;
}

export interface TargetAllocationSummary {
  parentTargetId: string;
  parentTargetValue: number;
  activeChildCount: number;
  pausedChildCount: number;
  deletedChildCount: number;
  activeAllocatedValue: number;
  pausedAllocatedValue: number;
  remainingValue: number;
  overAllocatedValue: number;
  allocationStatus: TargetAllocationStatus;
}

export interface TargetHierarchyEdge {
  parentScope: TargetScope;
  childScope: TargetScope;
}

export const TARGET_HIERARCHY_EDGES: readonly TargetHierarchyEdge[] = [
  { parentScope: "company", childScope: "store" },
  { parentScope: "store", childScope: "series" },
  { parentScope: "series", childScope: "product" },
] as const;
