import type { TmallAnalysisDisplayResult } from "../../../types/tmall";
import type {
  TmallTargetDefinition,
  TmallTargetDirection,
  TmallTargetUnit,
} from "../../../types/tmall-targets";
import {
  buildTmallTargetProgress,
  getTmallTargetMetricDefinition,
  type TmallTargetProgress,
  type TmallTargetProgressStatus,
} from "./targets";

export type TmallProductTargetSummaryTone =
  | "neutral"
  | "warning"
  | "success"
  | "danger"
  | "info";

export interface TmallProductTargetSummaryCard {
  key: string;
  title: string;
  value: string | number | null;
  helper: string;
  tone: TmallProductTargetSummaryTone;
}

export interface TmallProductTargetItem {
  targetId: string;
  targetName: string;
  metricLabel: string;
  status: TmallTargetProgressStatus;
  actualValue: number | null;
  targetValue: number;
  progressRate: number | null;
  gapValue: number | null;
  unit: TmallTargetUnit;
  direction: TmallTargetDirection;
  warnings: string[];
}

export interface TmallProductTargetSummaryViewModel {
  productId: string | null;
  totalProductTargetCount: number;
  activeProductTargetCount: number;
  pausedProductTargetCount: number;
  achievedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  missingActualCount: number;
  invalidTargetCount: number;
  summaryCards: TmallProductTargetSummaryCard[];
  targetItems: TmallProductTargetItem[];
  primaryActionHref: string;
  primaryActionLabel: string;
  notices: string[];
}

interface BuildTmallProductTargetSummaryInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  productId: string | null;
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

const productTargetsForSelection = (
  targets: TmallTargetDefinition[],
  productId: string | null,
): TmallTargetDefinition[] => {
  if (!productId) return [];
  const normalizedProductId = String(productId);
  return targets.filter(
    (target) =>
      target.scope === "product" &&
      target.productId !== undefined &&
      String(target.productId) === normalizedProductId,
  );
};

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
    warnings: ["暂无四源分析结果，商品目标暂时没有实际值。"],
  };
};

const buildProgressItems = ({
  targets,
  analysis,
  productId,
}: BuildTmallProductTargetSummaryInput): TmallTargetProgress[] => {
  const matchedProductTargets = productTargetsForSelection(targets, productId);
  if (!analysis) return matchedProductTargets.map(buildMissingActualProgress);
  return buildTmallTargetProgress(analysis, matchedProductTargets);
};

const toTargetItem = (progress: TmallTargetProgress): TmallProductTargetItem => {
  const metric = getTmallTargetMetricDefinition(progress.target.metricKey);

  return {
    targetId: progress.target.id,
    targetName: progress.target.name.trim() || "未命名商品目标",
    metricLabel: metric.label,
    status: progress.status,
    actualValue: safeNumber(progress.actualValue),
    targetValue: safeTargetValue(progress.targetValue),
    progressRate: safeNumber(progress.progressRate),
    gapValue: safeNumber(progress.gapValue),
    unit: metric.unit,
    direction: progress.target.direction,
    warnings: progress.warnings.filter((warning) => warning.trim().length > 0),
  };
};

const sortTargetItems = (
  items: TmallProductTargetItem[],
): TmallProductTargetItem[] =>
  [...items].sort((a, b) => {
    const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (priorityDiff !== 0) return priorityDiff;

    const aProgress = a.progressRate ?? Number.POSITIVE_INFINITY;
    const bProgress = b.progressRate ?? Number.POSITIVE_INFINITY;
    if (aProgress !== bProgress) return aProgress - bProgress;

    return a.targetName.localeCompare(b.targetName, "zh-CN");
  });

const countByStatus = (
  progressItems: TmallTargetProgress[],
  status: TmallTargetProgressStatus,
): number => progressItems.filter((item) => item.status === status).length;

export const buildTmallProductTargetSummary = ({
  targets,
  analysis,
  productId,
}: BuildTmallProductTargetSummaryInput): TmallProductTargetSummaryViewModel => {
  const normalizedProductId = productId ? String(productId) : null;
  const progressItems = buildProgressItems({
    targets,
    analysis,
    productId: normalizedProductId,
  });
  const totalProductTargetCount = progressItems.length;
  const activeProductTargetCount = progressItems.filter((item) => item.status !== "paused").length;
  const pausedProductTargetCount = countByStatus(progressItems, "paused");
  const achievedCount = countByStatus(progressItems, "achieved");
  const inProgressCount = countByStatus(progressItems, "in_progress");
  const atRiskCount = countByStatus(progressItems, "at_risk");
  const missingActualCount = countByStatus(progressItems, "missing_actual");
  const invalidTargetCount = countByStatus(progressItems, "invalid_target");
  const targetItems = sortTargetItems(progressItems.map(toTargetItem)).slice(0, 6);
  const notices = [
    "当前商品目标完成率基于已上传日期计算，月度目标不做预测或自然月补齐。",
    "商品推广目标只使用商品推广报表，不使用计划推广报表。",
  ];

  if (!analysis && totalProductTargetCount > 0) {
    notices.push("暂无四源分析结果，启用商品目标暂按暂无实际值显示。");
  }

  if (totalProductTargetCount > targetItems.length) {
    notices.push("完整目标请前往目标管理页面查看。");
  }

  return {
    productId: normalizedProductId,
    totalProductTargetCount,
    activeProductTargetCount,
    pausedProductTargetCount,
    achievedCount,
    inProgressCount,
    atRiskCount,
    missingActualCount,
    invalidTargetCount,
    summaryCards: [
      {
        key: "total",
        title: "商品目标总数",
        value: totalProductTargetCount,
        helper: `启用 ${activeProductTargetCount} 个，暂停 ${pausedProductTargetCount} 个。`,
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
    targetItems,
    primaryActionHref: "/targets",
    primaryActionLabel: "目标管理",
    notices,
  };
};
