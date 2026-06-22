import type {
  OwnedAdPlanFact,
  OwnedBusinessProductFact,
  TargetDirection,
  TargetRecord,
} from "../domain/models";
import type { TmallTargetDefinition } from "../../../types/tmall-targets";
import type {
  HomeCommandCenterDateRangeState,
  HomeCommandCenterPeriod,
  HomeCommandCenterTargetProgress,
} from "./contracts";
import {
  aggregateLegacyMetrics,
  aggregateV2Metrics,
  filterLegacyAdPlanFacts,
  filterLegacyBusinessFacts,
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
  type MetricAggregate,
} from "./metrics";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";

const METRIC_LABELS: Record<string, string> = {
  gmv: "GMV",
  gsv: "GSV",
  visitors: "商品访客",
  paidBuyers: "支付买家",
  conversionRate: "支付转化率",
  avgOrderValue: "客单价",
  refundRate: "退款率",
  adSpend: "推广花费",
  adRoi: "推广 ROI",
  adSpendRate: "推广费比",
  adSpendRateAfterRefund: "去退推广费比",
};

const TARGET_SCOPE_LABELS: Record<string, string> = {
  company: "公司",
  store: "店铺",
  product: "商品",
  series: "系列",
};

const formatTargetValue = (metricKey: string, value: number | null): string => {
  if (["gmv", "gsv", "avgOrderValue", "adSpend"].includes(metricKey)) return formatMoney(value);
  if (["visitors", "paidBuyers"].includes(metricKey)) return formatInteger(value);
  if (["conversionRate", "refundRate", "adSpendRate", "adSpendRateAfterRefund"].includes(metricKey)) {
    return formatPercent(value);
  }
  if (metricKey === "adRoi") return formatRoi(value);
  return value === null || !Number.isFinite(value) ? "--" : String(value);
};

const metricActual = (metricKey: string, metrics: MetricAggregate): number | null => {
  if (metricKey === "gmv") return metrics.hasBusinessData ? metrics.gmv : null;
  if (metricKey === "gsv") return metrics.hasBusinessData ? metrics.gsv : null;
  if (metricKey === "visitors") return metrics.hasBusinessData ? metrics.visitors : null;
  if (metricKey === "paidBuyers") return metrics.hasBusinessData ? metrics.paidBuyers : null;
  if (metricKey === "conversionRate") return metrics.conversionRate;
  if (metricKey === "avgOrderValue") return safeDivide(metrics.gmv, metrics.paidBuyers);
  if (metricKey === "refundRate") return safeDivide(metrics.refundSuccessAmount, metrics.gmv);
  if (metricKey === "adSpend") return metrics.adSpend;
  if (metricKey === "adRoi") return metrics.adRoi;
  if (metricKey === "adSpendRate") return metrics.hasBusinessData ? safeDivide(metrics.adSpend, metrics.gmv) : null;
  if (metricKey === "adSpendRateAfterRefund") {
    return metrics.hasBusinessData ? safeDivide(metrics.adSpend, metrics.gsv) : null;
  }
  return null;
};

const progressFor = ({
  actualValue,
  targetValue,
  direction,
}: {
  actualValue: number | null;
  targetValue: number;
  direction: TargetDirection;
}): Pick<HomeCommandCenterTargetProgress, "progressRate" | "gapValue" | "statusLabel" | "tone"> => {
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return { progressRate: null, gapValue: null, statusLabel: "目标值异常", tone: "amber" };
  }
  if (actualValue === null || !Number.isFinite(actualValue)) {
    return { progressRate: null, gapValue: null, statusLabel: "暂无实际值", tone: "slate" };
  }

  if (direction === "higher_is_better") {
    const progressRate = safeDivide(actualValue, targetValue);
    const gapValue = Number.isFinite(targetValue - actualValue) ? targetValue - actualValue : null;
    const achieved = progressRate !== null && progressRate >= 1;
    return {
      progressRate,
      gapValue,
      statusLabel: achieved ? "已达成" : "跟进中",
      tone: achieved ? "emerald" : "amber",
    };
  }

  const progressRate = actualValue === 0 ? 1 : safeDivide(targetValue, actualValue);
  const gapValue = Number.isFinite(actualValue - targetValue) ? actualValue - targetValue : null;
  const achieved = actualValue <= targetValue;
  return {
    progressRate,
    gapValue,
    statusLabel: achieved ? "已达成" : "需关注",
    tone: achieved ? "emerald" : "amber",
  };
};

const targetMatchesPeriod = (
  target: Pick<TargetRecord, "periodType" | "periodValue">,
  period: HomeCommandCenterPeriod,
  range: HomeCommandCenterDateRangeState,
): boolean => {
  if (!range.valid || !range.start || !range.end) return false;
  if (period === "day") {
    return target.periodType === "daily" && range.start === range.end && target.periodValue === range.start;
  }
  if (period === "month") {
    return target.periodType === "monthly" && target.periodValue === range.start.slice(0, 7);
  }
  return false;
};

const toTargetProgress = ({
  targetId,
  label,
  scope,
  metricKey,
  actualValue,
  targetValue,
  direction,
  periodType,
}: {
  targetId: string;
  label: string;
  scope: string;
  metricKey: string;
  actualValue: number | null;
  targetValue: number;
  direction: TargetDirection;
  periodType: "daily" | "monthly";
}): HomeCommandCenterTargetProgress => {
  const progress = progressFor({ actualValue, targetValue, direction });
  return {
    targetId,
    label,
    metricKey,
    metricLabel: METRIC_LABELS[metricKey] ?? metricKey,
    scopeLabel: TARGET_SCOPE_LABELS[scope] ?? "目标",
    actualValue,
    targetValue,
    progressRate: progress.progressRate,
    gapValue: progress.gapValue,
    direction,
    periodType,
    statusLabel: progress.statusLabel,
    tone: progress.tone,
  };
};

export const buildV2TargetProgress = ({
  targets,
  businessFacts,
  adPlanFacts,
  selectedPeriod,
  range,
  selectedPlatform,
  selectedStore,
}: {
  targets: TargetRecord[];
  businessFacts: OwnedBusinessProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  selectedPeriod: HomeCommandCenterPeriod;
  range: HomeCommandCenterDateRangeState;
  selectedPlatform: string;
  selectedStore: string;
}): HomeCommandCenterTargetProgress[] =>
  targets
    .filter((target) => target.status === "active")
    .filter((target) => target.scope === "company" || target.scope === "store")
    .filter((target) => targetMatchesPeriod(target, selectedPeriod, range))
    .filter((target) => {
      if (target.scope === "company") return selectedStore === "all";
      if (target.scope === "store") {
        const storeKey = `${target.platformCode}:${target.storeId}`;
        if (selectedPlatform !== "all" && target.platformCode !== selectedPlatform) return false;
        if (selectedStore !== "all" && selectedStore !== storeKey) return false;
        return true;
      }
      return false;
    })
    .map((target) => {
      const scopedBusiness = target.scope === "store"
        ? businessFacts.filter((fact) => fact.platformCode === target.platformCode && fact.storeId === target.storeId)
        : businessFacts;
      const scopedAdPlan = target.scope === "store"
        ? adPlanFacts.filter((fact) => fact.platformCode === target.platformCode && fact.storeId === target.storeId)
        : adPlanFacts;
      const metrics = aggregateV2Metrics({
        businessFacts: scopedBusiness,
        adPlanFacts: scopedAdPlan,
      });
      return toTargetProgress({
        targetId: target.targetId,
        label: `${target.scope === "store" ? "店铺目标" : "公司目标"} · ${METRIC_LABELS[target.metricKey] ?? target.metricKey}`,
        scope: target.scope,
        metricKey: target.metricKey,
        actualValue: metricActual(target.metricKey, metrics),
        targetValue: target.targetValue,
        direction: target.direction,
        periodType: target.periodType,
      });
    })
    .sort((a, b) => {
      const left = a.progressRate ?? Number.POSITIVE_INFINITY;
      const right = b.progressRate ?? Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return a.label.localeCompare(b.label, "zh-CN");
    })
    .slice(0, 3);

export const buildLegacyTargetProgress = ({
  targets,
  analysis,
  selectedPeriod,
  range,
}: {
  targets: TmallTargetDefinition[];
  analysis: TmallStoredAnalysisResult;
  selectedPeriod: HomeCommandCenterPeriod;
  range: HomeCommandCenterDateRangeState;
}): HomeCommandCenterTargetProgress[] => {
  const productFacts = filterLegacyBusinessFacts({ analysis, range });
  const adPlanFacts = filterLegacyAdPlanFacts({ analysis, range });
  const metrics = aggregateLegacyMetrics({ productFacts, adPlanFacts });

  return targets
    .filter((target) => target.status === "active")
    .filter((target) => target.scope === "store")
    .filter((target) => targetMatchesPeriod(target, selectedPeriod, range))
    .map((target) =>
      toTargetProgress({
        targetId: target.id,
        label: target.name.trim() || `店铺目标 · ${METRIC_LABELS[target.metricKey] ?? target.metricKey}`,
        scope: target.scope,
        metricKey: target.metricKey,
        actualValue: metricActual(target.metricKey, metrics),
        targetValue: target.targetValue,
        direction: target.direction,
        periodType: target.periodType,
      }),
    )
    .sort((a, b) => {
      const left = a.progressRate ?? Number.POSITIVE_INFINITY;
      const right = b.progressRate ?? Number.POSITIVE_INFINITY;
      if (left !== right) return left - right;
      return a.label.localeCompare(b.label, "zh-CN");
    })
    .slice(0, 3);
};

export const formatTargetMetricValue = formatTargetValue;
