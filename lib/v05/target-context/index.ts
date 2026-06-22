import type { TargetRecord, TargetScope } from "../domain/models";
import {
  buildTargetAllocationSummary,
  getTargetMetricAllocationMode,
  type TargetAllocationStatus,
} from "../target-hierarchy";

export type TargetContextTone = "blue" | "amber" | "rose" | "emerald" | "slate";

export type TargetContextAllocationStatus =
  | TargetAllocationStatus
  | "not_allocatable"
  | "terminal"
  | "standalone";

export interface TargetContextAllocationView {
  allocationStatus: TargetContextAllocationStatus;
  allocationStatusLabel: string;
  allocationTone: TargetContextTone;
}

const ALLOCATION_LABELS: Record<TargetContextAllocationStatus, string> = {
  none: "暂无子目标",
  under_allocated: "未分配完",
  fully_allocated: "已分配完成",
  over_allocated: "超额分配",
  not_allocatable: "不参与分配",
  terminal: "末级目标",
  standalone: "独立目标",
};

const ALLOCATION_TONES: Record<TargetContextAllocationStatus, TargetContextTone> = {
  none: "slate",
  under_allocated: "amber",
  fully_allocated: "emerald",
  over_allocated: "rose",
  not_allocatable: "slate",
  terminal: "slate",
  standalone: "slate",
};

export const standaloneTargetAllocationView = (): TargetContextAllocationView => ({
  allocationStatus: "standalone",
  allocationStatusLabel: ALLOCATION_LABELS.standalone,
  allocationTone: ALLOCATION_TONES.standalone,
});

export const buildTargetContextAllocationView = ({
  target,
  targets,
}: {
  target: TargetRecord;
  targets: readonly TargetRecord[];
}): TargetContextAllocationView => {
  if (target.scope === "product") {
    return {
      allocationStatus: "terminal",
      allocationStatusLabel: ALLOCATION_LABELS.terminal,
      allocationTone: ALLOCATION_TONES.terminal,
    };
  }

  if (getTargetMetricAllocationMode(target.metricKey) !== "sum") {
    return {
      allocationStatus: "not_allocatable",
      allocationStatusLabel: ALLOCATION_LABELS.not_allocatable,
      allocationTone: ALLOCATION_TONES.not_allocatable,
    };
  }

  const summary = buildTargetAllocationSummary({
    parentTarget: target,
    childTargets: [...targets],
  });

  return {
    allocationStatus: summary.allocationStatus,
    allocationStatusLabel: ALLOCATION_LABELS[summary.allocationStatus],
    allocationTone: ALLOCATION_TONES[summary.allocationStatus],
  };
};

export const targetSettingsHref = ({
  scope,
  platformCode,
  storeId,
  seriesId,
  productId,
}: {
  scope: TargetScope;
  platformCode?: string | null;
  storeId?: string | null;
  seriesId?: string | null;
  productId?: string | null;
}): string => {
  const params = new URLSearchParams({ scope });
  if (platformCode) params.set("platform", platformCode);
  if (storeId) params.set("storeId", storeId);
  if (seriesId) params.set("seriesId", seriesId);
  if (productId) params.set("productId", productId);
  return `/targets?${params.toString()}`;
};
