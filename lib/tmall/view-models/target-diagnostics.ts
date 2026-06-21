import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type { TmallAnalysisDisplayResult } from "../../../types/tmall";
import type {
  TmallTargetDefinition,
  TmallTargetMetricKey,
  TmallTargetScope,
  TmallTargetUnit,
} from "../../../types/tmall-targets";
import {
  buildTmallTargetProgress,
  getTmallTargetMetricDefinition,
  type TmallTargetProgress,
  type TmallTargetProgressStatus,
} from "./targets";

export type TmallTargetDiagnosticScope =
  | "home"
  | "store"
  | "product"
  | "series";

export type TmallTargetDiagnosticSeverity =
  | "critical"
  | "warning"
  | "info"
  | "success";

export type TmallTargetDiagnosticCategory =
  | "target_gap"
  | "missing_actual"
  | "invalid_target"
  | "paused"
  | "sales"
  | "traffic"
  | "conversion"
  | "refund"
  | "ad_spend"
  | "ad_roi"
  | "ad_spend_rate"
  | "normal";

export interface TmallTargetDiagnosticItem {
  id: string;
  targetId: string;
  targetName: string;
  scope: TmallTargetScope;
  metricKey: TmallTargetMetricKey;
  metricLabel: string;
  severity: TmallTargetDiagnosticSeverity;
  category: TmallTargetDiagnosticCategory;
  status: TmallTargetProgressStatus;
  title: string;
  message: string;
  suggestion: string;
  actualValue: number | null;
  targetValue: number;
  progressRate: number | null;
  gapValue: number | null;
  unit: TmallTargetUnit;
}

export interface TmallTargetDiagnosticSummary {
  scope: TmallTargetDiagnosticScope;
  totalDiagnosticCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  successCount: number;
  items: TmallTargetDiagnosticItem[];
  notices: string[];
}

export interface TmallTargetDiagnosticOptions {
  maxItems?: number;
  includePaused?: boolean;
}

interface BuildTmallTargetDiagnosticsInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  seriesGroups?: TmallSeriesGroup[];
  scope?: TmallTargetDiagnosticScope;
  options?: TmallTargetDiagnosticOptions;
}

interface BuildTmallProductTargetDiagnosticsInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  productId: string | null;
  options?: TmallTargetDiagnosticOptions;
}

interface BuildTmallSeriesTargetDiagnosticsInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  seriesGroups: TmallSeriesGroup[];
  seriesId: string | null;
  options?: TmallTargetDiagnosticOptions;
}

interface DiagnosticRule {
  category: TmallTargetDiagnosticCategory;
  atRiskMessage: string;
  atRiskSuggestion: string;
}

const DEFAULT_MAX_ITEMS = 8;

const STATUS_PRIORITY: Record<TmallTargetProgressStatus, number> = {
  invalid_target: 0,
  at_risk: 1,
  missing_actual: 2,
  in_progress: 3,
  achieved: 4,
  paused: 5,
  not_started: 6,
};

const METRIC_RULES: Record<TmallTargetMetricKey, DiagnosticRule> = {
  gmv: {
    category: "sales",
    atRiskMessage: "销售目标缺口较大，当前完成率低于安全区间。",
    atRiskSuggestion: "检查核心商品销售、活动节奏、价格竞争力和转化承接。",
  },
  gsv: {
    category: "sales",
    atRiskMessage: "去退销售目标缺口较大，需要同时关注成交和退款影响。",
    atRiskSuggestion: "检查核心商品销售、活动节奏、价格竞争力和转化承接。",
  },
  visitors: {
    category: "traffic",
    atRiskMessage: "访客目标缺口较大，当前流量不足以支撑目标。",
    atRiskSuggestion: "检查搜索、推荐、付费引流和内容曝光。",
  },
  paidBuyers: {
    category: "conversion",
    atRiskMessage: "支付买家数目标缺口较大，成交承接不足。",
    atRiskSuggestion: "检查访客质量、成交路径、价格和活动门槛。",
  },
  conversionRate: {
    category: "conversion",
    atRiskMessage: "支付转化率低于目标安全区间，成交效率偏弱。",
    atRiskSuggestion: "检查主图、价格、详情页、评价、优惠和客服承接。",
  },
  avgOrderValue: {
    category: "sales",
    atRiskMessage: "客单价低于目标安全区间，高客单承接不足。",
    atRiskSuggestion: "检查套装、加购搭配、满减门槛和高客单商品曝光。",
  },
  refundRate: {
    category: "refund",
    atRiskMessage: "退款率高于目标安全区间，售后风险偏高。",
    atRiskSuggestion: "检查售后原因、商品承诺、物流体验和详情页预期。",
  },
  adSpend: {
    category: "ad_spend",
    atRiskMessage: "推广花费超出目标安全区间，需要控制投放消耗。",
    atRiskSuggestion: "推广花费超目标，检查高花费低成交计划、商品和人群。",
  },
  adRoi: {
    category: "ad_roi",
    atRiskMessage: "推广投入产出比未达目标，投放效率偏弱。",
    atRiskSuggestion: "ROI 未达目标，检查点击成本、成交金额和转化效率。",
  },
  adSpendRate: {
    category: "ad_spend_rate",
    atRiskMessage: "推广费比高于目标安全区间，投放成本占比偏高。",
    atRiskSuggestion: "推广费比偏高，检查投放结构和自然成交占比。",
  },
  adSpendRateAfterRefund: {
    category: "ad_spend_rate",
    atRiskMessage: "去退推广费比高于目标安全区间，退款后投放成本压力偏高。",
    atRiskSuggestion: "去退推广费比偏高，需同时关注退款和推广效率。",
  },
};

const isAdMetric = (metricKey: TmallTargetMetricKey): boolean =>
  ["adSpend", "adRoi", "adSpendRate", "adSpendRateAfterRefund"].includes(metricKey);

const safeNumber = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

const safeTargetValue = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const targetName = (target: TmallTargetDefinition): string =>
  target.name.trim() || "未命名目标";

const missingActualMessage = (progress: TmallTargetProgress): string => {
  if (isAdMetric(progress.target.metricKey)) {
    if (progress.target.scope === "product") {
      return "当前目标暂无商品推广实际值，不能按推广花费或推广效率判断。";
    }

    if (progress.target.scope === "series") {
      return "当前系列暂无商品推广实际值，不能按推广花费或推广效率判断。";
    }
  }

  return progress.warnings[0] ?? "当前目标暂无实际值，暂不能判断完成情况。";
};

const missingActualSuggestion = (progress: TmallTargetProgress): string => {
  if (isAdMetric(progress.target.metricKey) && progress.target.scope !== "store") {
    return "请确认对应商品推广报表是否包含该宝贝或系列商品；该类目标只以商品推广报表为准。";
  }

  return "请先补充对应周期的四源数据，再回到目标完成情况中复核。";
};

const severityForStatus = (
  status: TmallTargetProgressStatus,
): TmallTargetDiagnosticSeverity => {
  if (status === "invalid_target") return "critical";
  if (status === "at_risk") return "warning";
  if (status === "achieved") return "success";
  return "info";
};

const titleForStatus = (status: TmallTargetProgressStatus): string => {
  if (status === "at_risk") return "目标存在风险";
  if (status === "missing_actual") return "暂无实际值";
  if (status === "invalid_target") return "目标值异常";
  if (status === "in_progress") return "目标接近达成";
  if (status === "achieved") return "目标已达成";
  if (status === "paused") return "目标已暂停";
  return "目标待观察";
};

const buildItem = (progress: TmallTargetProgress): TmallTargetDiagnosticItem => {
  const metric = getTmallTargetMetricDefinition(progress.target.metricKey);
  const rule = METRIC_RULES[progress.target.metricKey];
  const status = progress.status;

  const category =
    status === "invalid_target"
      ? "invalid_target"
      : status === "missing_actual"
        ? "missing_actual"
        : status === "paused"
          ? "paused"
          : status === "at_risk"
            ? rule.category
            : "normal";

  const message =
    status === "invalid_target"
      ? "目标值不是有效正数，当前无法计算完成率。"
      : status === "missing_actual"
        ? missingActualMessage(progress)
        : status === "paused"
          ? "该目标已暂停，不参与当前诊断。"
          : status === "achieved"
            ? "当前目标已达到或优于设定值。"
            : status === "in_progress"
              ? "当前目标接近达成，建议继续观察变化。"
              : status === "at_risk"
                ? rule.atRiskMessage
                : "当前目标需要继续观察。";

  const suggestion =
    status === "invalid_target"
      ? "请到目标管理修正目标值后再判断。"
      : status === "missing_actual"
        ? missingActualSuggestion(progress)
        : status === "paused"
          ? "如需继续跟踪，请先在目标管理中启用该目标。"
          : status === "achieved"
            ? "当前目标已达成，保持观察并关注后续波动。"
            : status === "in_progress"
              ? "保持当前节奏，优先关注仍未达成的关键目标。"
              : status === "at_risk"
                ? rule.atRiskSuggestion
                : "持续观察该目标的完成情况。";

  return {
    id: `${progress.target.id}:${progress.target.metricKey}:${status}`,
    targetId: progress.target.id,
    targetName: targetName(progress.target),
    scope: progress.target.scope,
    metricKey: progress.target.metricKey,
    metricLabel: metric.label,
    severity: severityForStatus(status),
    category,
    status,
    title: titleForStatus(status),
    message,
    suggestion,
    actualValue: safeNumber(progress.actualValue),
    targetValue: safeTargetValue(progress.targetValue),
    progressRate: safeNumber(progress.progressRate),
    gapValue: safeNumber(progress.gapValue),
    unit: metric.unit,
  };
};

const sortItems = (
  items: TmallTargetDiagnosticItem[],
): TmallTargetDiagnosticItem[] =>
  [...items].sort((first, second) => {
    const priorityDiff =
      STATUS_PRIORITY[first.status] - STATUS_PRIORITY[second.status];
    if (priorityDiff !== 0) return priorityDiff;

    const firstProgress = first.progressRate ?? Number.POSITIVE_INFINITY;
    const secondProgress = second.progressRate ?? Number.POSITIVE_INFINITY;
    if (firstProgress !== secondProgress) return firstProgress - secondProgress;

    return first.targetName.localeCompare(second.targetName, "zh-CN");
  });

const createMissingProgress = (
  target: TmallTargetDefinition,
  warning: string,
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

  if (!Number.isFinite(target.targetValue) || target.targetValue <= 0) {
    return {
      target,
      actualValue: null,
      targetValue: safeTargetValue(target.targetValue),
      progressRate: null,
      gapValue: null,
      status: "invalid_target",
      warnings: ["目标值必须是有限正数。"],
    };
  }

  return {
    target,
    actualValue: null,
    targetValue: safeTargetValue(target.targetValue),
    progressRate: null,
    gapValue: null,
    status: "missing_actual",
    warnings: [warning],
  };
};

const progressFromInput = (
  targets: TmallTargetDefinition[],
  analysis: TmallAnalysisDisplayResult | null,
  seriesGroups: TmallSeriesGroup[] = [],
): TmallTargetProgress[] =>
  analysis
    ? buildTmallTargetProgress(analysis, targets, seriesGroups)
    : targets.map((target) =>
        createMissingProgress(target, "暂无四源分析结果，目标暂时没有实际值。"),
      );

const countSeverity = (
  items: TmallTargetDiagnosticItem[],
  severity: TmallTargetDiagnosticSeverity,
): number => items.filter((item) => item.severity === severity).length;

const buildNotices = (
  scope: TmallTargetDiagnosticScope,
  items: TmallTargetDiagnosticItem[],
): string[] => {
  const notices = [
    "目标诊断基于已有目标完成率结果生成，不修改 V0.4C 目标口径。",
    "月度目标仅基于已上传日期判断，不做 MTD/DLY、预测或自然月补齐。",
  ];

  if (
    (scope === "product" || scope === "series" || scope === "home") &&
    items.some((item) => isAdMetric(item.metricKey) && item.scope !== "store")
  ) {
    notices.push("宝贝和系列推广目标只使用商品推广报表，不使用计划推广报表补齐。");
  }

  return notices;
};

export const buildTmallTargetDiagnosticsFromProgress = (
  progressItems: TmallTargetProgress[],
  options: TmallTargetDiagnosticOptions & {
    scope?: TmallTargetDiagnosticScope;
  } = {},
): TmallTargetDiagnosticSummary => {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const includePaused = options.includePaused ?? false;
  const allItems = progressItems
    .filter((progress) => includePaused || progress.status !== "paused")
    .map(buildItem);
  const items = sortItems(allItems).slice(0, Math.max(0, maxItems));
  const scope = options.scope ?? "home";

  return {
    scope,
    totalDiagnosticCount: allItems.length,
    criticalCount: countSeverity(allItems, "critical"),
    warningCount: countSeverity(allItems, "warning"),
    infoCount: countSeverity(allItems, "info"),
    successCount: countSeverity(allItems, "success"),
    items,
    notices: buildNotices(scope, allItems),
  };
};

export const buildTmallTargetDiagnostics = ({
  targets,
  analysis,
  seriesGroups = [],
  scope = "home",
  options = {},
}: BuildTmallTargetDiagnosticsInput): TmallTargetDiagnosticSummary => {
  const scopedTargets =
    scope === "home"
      ? targets
      : targets.filter((target) => target.scope === scope);

  return buildTmallTargetDiagnosticsFromProgress(
    progressFromInput(scopedTargets, analysis, seriesGroups),
    { ...options, scope },
  );
};

export const buildTmallStoreTargetDiagnostics = ({
  targets,
  analysis,
  options = {},
}: {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  options?: TmallTargetDiagnosticOptions;
}): TmallTargetDiagnosticSummary =>
  buildTmallTargetDiagnostics({
    targets: targets.filter((target) => target.scope === "store"),
    analysis,
    scope: "store",
    options,
  });

export const buildTmallProductTargetDiagnostics = ({
  targets,
  analysis,
  productId,
  options = {},
}: BuildTmallProductTargetDiagnosticsInput): TmallTargetDiagnosticSummary => {
  const normalizedProductId = productId ? String(productId) : null;
  const productTargets = normalizedProductId
    ? targets.filter(
        (target) =>
          target.scope === "product" &&
          target.productId !== undefined &&
          String(target.productId) === normalizedProductId,
      )
    : [];

  return buildTmallTargetDiagnosticsFromProgress(
    progressFromInput(productTargets, analysis),
    { ...options, scope: "product" },
  );
};

export const buildTmallSeriesTargetDiagnostics = ({
  targets,
  analysis,
  seriesGroups,
  seriesId,
  options = {},
}: BuildTmallSeriesTargetDiagnosticsInput): TmallTargetDiagnosticSummary => {
  const normalizedSeriesId = seriesId ? String(seriesId) : null;
  const seriesTargets = normalizedSeriesId
    ? targets.filter(
        (target) =>
          target.scope === "series" &&
          target.seriesId !== undefined &&
          String(target.seriesId) === normalizedSeriesId,
      )
    : [];

  return buildTmallTargetDiagnosticsFromProgress(
    progressFromInput(seriesTargets, analysis, seriesGroups),
    { ...options, scope: "series" },
  );
};
