import type { TmallTargetProgressStatus } from "@/lib/tmall/view-models/targets";
import type {
  TmallTargetDirection,
  TmallTargetPeriodType,
  TmallTargetUnit,
} from "@/types/tmall-targets";

export const formatTargetValue = (
  value: number | null,
  unit: TmallTargetUnit,
): string => {
  if (value === null || !Number.isFinite(value)) return "--";

  if (unit === "currency") {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (unit === "integer") {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  }

  if (unit === "rate") {
    return `${(value * 100).toFixed(2)}%`;
  }

  return `${value.toFixed(2)} 倍`;
};

export const formatTargetProgressRate = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${(value * 100).toFixed(2)}%`;

export const formatTargetPeriod = (
  periodType: TmallTargetPeriodType,
  periodValue: string,
): string => `${periodType === "daily" ? "日目标" : "月目标"} · ${periodValue || "--"}`;

export const formatTargetDirection = (direction: TmallTargetDirection): string =>
  direction === "higher_is_better" ? "越高越好" : "越低越好";

export const formatTargetStatus = (status: TmallTargetProgressStatus): string => {
  const labels: Record<TmallTargetProgressStatus, string> = {
    achieved: "已达成",
    in_progress: "接近目标",
    at_risk: "有风险",
    missing_actual: "暂无实际值",
    invalid_target: "目标值异常",
    paused: "已暂停",
    not_started: "未开始",
  };

  return labels[status];
};

export const targetStatusClasses = (status: TmallTargetProgressStatus): string => {
  const classes: Record<TmallTargetProgressStatus, string> = {
    achieved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
    in_progress: "bg-blue-50 text-blue-700 ring-blue-600/15",
    at_risk: "bg-amber-50 text-amber-700 ring-amber-600/15",
    missing_actual: "bg-slate-100 text-slate-600 ring-slate-500/10",
    invalid_target: "bg-rose-50 text-rose-700 ring-rose-600/15",
    paused: "bg-slate-100 text-slate-600 ring-slate-500/10",
    not_started: "bg-slate-100 text-slate-600 ring-slate-500/10",
  };

  return classes[status];
};
