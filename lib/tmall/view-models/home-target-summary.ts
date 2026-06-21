import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type { TmallAnalysisDisplayResult } from "../../../types/tmall";
import type {
  TmallTargetDefinition,
  TmallTargetScope,
  TmallTargetUnit,
} from "../../../types/tmall-targets";
import {
  buildTmallTargetProgress,
  getTmallTargetMetricDefinition,
  type TmallTargetProgress,
  type TmallTargetProgressStatus,
} from "./targets";

export type TmallHomeTargetSummaryTone =
  | "neutral"
  | "warning"
  | "success"
  | "danger"
  | "info";

export interface TmallHomeTargetSummaryCard {
  key: string;
  title: string;
  value: string | number | null;
  helper: string;
  tone: TmallHomeTargetSummaryTone;
}

export interface TmallHomeTargetAttentionItem {
  targetId: string;
  targetName: string;
  scope: TmallTargetScope;
  metricLabel: string;
  status: TmallTargetProgressStatus;
  progressRate: number | null;
  actualValue: number | null;
  targetValue: number;
  unit: TmallTargetUnit;
  warningText: string | null;
}

export interface TmallHomeTargetSummaryViewModel {
  totalTargetCount: number;
  activeTargetCount: number;
  pausedTargetCount: number;
  achievedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  missingActualCount: number;
  invalidTargetCount: number;
  storeTargetCount: number;
  productTargetCount: number;
  seriesTargetCount: number;
  topAttentionItems: TmallHomeTargetAttentionItem[];
  summaryCards: TmallHomeTargetSummaryCard[];
  primaryActionHref: string;
  primaryActionLabel: string;
  notices: string[];
}

interface BuildTmallHomeTargetSummaryInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  seriesGroups?: TmallSeriesGroup[];
}

const STATUS_PRIORITY: Record<TmallTargetProgressStatus, number> = {
  at_risk: 0,
  missing_actual: 1,
  invalid_target: 2,
  in_progress: 3,
  achieved: 4,
  not_started: 5,
  paused: 6,
};

const safeNumber = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

const safeTargetValue = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const buildMissingActualProgress = (
  target: TmallTargetDefinition,
): TmallTargetProgress => {
  if (target.status === "paused") {
    return {
      target,
      actualValue: null,
      targetValue: safeTargetValue(target.targetValue),
      progressRate: null,
      gapValue: null,
      status: "paused",
      warnings: ["目标已暂停。"],
    };
  }

  return {
    target,
    actualValue: null,
    targetValue: safeTargetValue(target.targetValue),
    progressRate: null,
    gapValue: null,
    status: "missing_actual",
    warnings: ["暂无四源分析结果，目标暂时没有实际值。"],
  };
};

const buildProgressItems = ({
  targets,
  analysis,
  seriesGroups = [],
}: BuildTmallHomeTargetSummaryInput): TmallTargetProgress[] => {
  if (!analysis) {
    return targets.map(buildMissingActualProgress);
  }

  return buildTmallTargetProgress(analysis, targets, seriesGroups);
};

const warningText = (progress: TmallTargetProgress): string | null => {
  if (progress.status === "at_risk") return "低于目标安全区间，需要优先关注。";
  if (progress.status === "missing_actual") {
    return progress.warnings[0] ?? "当前目标缺少实际值。";
  }
  if (progress.status === "invalid_target") return "目标值异常，请到目标管理页面检查。";
  if (progress.status === "in_progress") return "目标进行中，建议持续跟进。";
  if (progress.status === "achieved") return "当前目标已达成。";
  return null;
};

const toAttentionItem = (
  progress: TmallTargetProgress,
): TmallHomeTargetAttentionItem => {
  const metric = getTmallTargetMetricDefinition(progress.target.metricKey);

  return {
    targetId: progress.target.id,
    targetName: progress.target.name.trim() || "未命名目标",
    scope: progress.target.scope,
    metricLabel: metric.label,
    status: progress.status,
    progressRate: safeNumber(progress.progressRate),
    actualValue: safeNumber(progress.actualValue),
    targetValue: safeTargetValue(progress.targetValue),
    unit: metric.unit,
    warningText: warningText(progress),
  };
};

const sortAttentionItems = (
  items: TmallHomeTargetAttentionItem[],
): TmallHomeTargetAttentionItem[] =>
  [...items].sort((a, b) => {
    const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (priorityDiff !== 0) return priorityDiff;

    const aProgress = a.progressRate ?? Number.POSITIVE_INFINITY;
    const bProgress = b.progressRate ?? Number.POSITIVE_INFINITY;
    if (aProgress !== bProgress) return aProgress - bProgress;

    return a.targetName.localeCompare(b.targetName, "zh-CN");
  });

const buildTopAttentionItems = (
  progressItems: TmallTargetProgress[],
): TmallHomeTargetAttentionItem[] => {
  const activeItems = progressItems
    .filter((progress) => progress.status !== "paused")
    .map(toAttentionItem);

  const attentionItems = activeItems.filter((item) =>
    ["at_risk", "missing_actual", "invalid_target", "in_progress"].includes(item.status),
  );

  const candidates =
    attentionItems.length > 0
      ? attentionItems
      : activeItems.filter((item) => item.status === "achieved");

  return sortAttentionItems(candidates).slice(0, 5);
};

const countByStatus = (
  progressItems: TmallTargetProgress[],
  status: TmallTargetProgressStatus,
): number => progressItems.filter((item) => item.status === status).length;

export const buildTmallHomeTargetSummary = ({
  targets,
  analysis,
  seriesGroups = [],
}: BuildTmallHomeTargetSummaryInput): TmallHomeTargetSummaryViewModel => {
  const progressItems = buildProgressItems({ targets, analysis, seriesGroups });
  const totalTargetCount = targets.length;
  const activeTargetCount = progressItems.filter((item) => item.status !== "paused").length;
  const pausedTargetCount = countByStatus(progressItems, "paused");
  const achievedCount = countByStatus(progressItems, "achieved");
  const inProgressCount = countByStatus(progressItems, "in_progress");
  const atRiskCount = countByStatus(progressItems, "at_risk");
  const missingActualCount = countByStatus(progressItems, "missing_actual");
  const invalidTargetCount = countByStatus(progressItems, "invalid_target");
  const activeTargets = targets.filter((target) => target.status !== "paused");
  const storeTargetCount = activeTargets.filter((target) => target.scope === "store").length;
  const productTargetCount = activeTargets.filter((target) => target.scope === "product").length;
  const seriesTargetCount = activeTargets.filter((target) => target.scope === "series").length;

  const notices = [
    "当前目标完成率基于已上传日期计算，月度目标不做预测或自然月补齐。",
  ];

  if (!analysis && totalTargetCount > 0) {
    notices.push("暂无四源分析结果，启用目标暂按暂无实际值显示。");
  }

  return {
    totalTargetCount,
    activeTargetCount,
    pausedTargetCount,
    achievedCount,
    inProgressCount,
    atRiskCount,
    missingActualCount,
    invalidTargetCount,
    storeTargetCount,
    productTargetCount,
    seriesTargetCount,
    topAttentionItems: buildTopAttentionItems(progressItems),
    summaryCards: [
      {
        key: "total",
        title: "目标总数",
        value: totalTargetCount,
        helper: `启用 ${activeTargetCount} 个，暂停 ${pausedTargetCount} 个。`,
        tone: "info",
      },
      {
        key: "achieved",
        title: "已达成",
        value: achievedCount,
        helper: "已达到或优于目标。",
        tone: "success",
      },
      {
        key: "at-risk",
        title: "有风险",
        value: atRiskCount,
        helper: "低于目标安全区间，需要关注。",
        tone: atRiskCount > 0 ? "warning" : "neutral",
      },
      {
        key: "missing-actual",
        title: "暂无实际值",
        value: missingActualCount,
        helper: "缺少当前实际值或关联数据。",
        tone: missingActualCount > 0 ? "warning" : "neutral",
      },
    ],
    primaryActionHref: "/targets",
    primaryActionLabel: "目标管理",
    notices,
  };
};
