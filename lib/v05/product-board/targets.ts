import type { TargetDirection, TargetPeriodType, TargetRecord } from "../domain/models";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
} from "../home-command-center";
import { buildTargetContextAllocationView } from "../target-context";
import type {
  ProductBoardDateRangeState,
  ProductBoardPeriod,
  ProductBoardTargetProgress,
} from "./contracts";
import type { ProductMetricAggregate } from "./metrics";

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

export const formatProductTargetMetricValue = (metricKey: string, value: number | null): string => {
  if (["gmv", "gsv", "avgOrderValue", "adSpend"].includes(metricKey)) return formatMoney(value);
  if (["visitors", "paidBuyers"].includes(metricKey)) return formatInteger(value);
  if (["conversionRate", "refundRate", "adSpendRate", "adSpendRateAfterRefund"].includes(metricKey)) {
    return formatPercent(value);
  }
  if (metricKey === "adRoi") return formatRoi(value);
  return value === null || !Number.isFinite(value) ? "--" : String(value);
};

const targetMatchesPeriod = (
  target: Pick<TargetRecord, "periodType" | "periodValue">,
  period: ProductBoardPeriod,
  range: ProductBoardDateRangeState,
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

const metricActual = (metricKey: string, metrics: ProductMetricAggregate): number | null => {
  if (metricKey === "gmv") return metrics.hasBusinessData ? metrics.gmv : null;
  if (metricKey === "gsv") return metrics.hasBusinessData ? metrics.gsv : null;
  if (metricKey === "visitors") return metrics.hasBusinessData ? metrics.visitors : null;
  if (metricKey === "paidBuyers") return metrics.hasBusinessData ? metrics.paidBuyers : null;
  if (metricKey === "conversionRate") return metrics.conversionRate;
  if (metricKey === "avgOrderValue") return metrics.hasBusinessData ? safeDivide(metrics.gmv, metrics.paidBuyers) : null;
  if (metricKey === "refundRate") return metrics.hasBusinessData ? safeDivide(metrics.refundSuccessAmount, metrics.gmv) : null;
  if (metricKey === "adSpend") return metrics.adSpend;
  if (metricKey === "adRoi") return metrics.adRoi;
  if (metricKey === "adSpendRate") return metrics.hasBusinessData ? safeDivide(metrics.adSpend, metrics.gmv) : null;
  if (metricKey === "adSpendRateAfterRefund") return metrics.hasBusinessData ? safeDivide(metrics.adSpend, metrics.gsv) : null;
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
}): Pick<ProductBoardTargetProgress, "progressRate" | "gapValue" | "statusLabel" | "tone"> => {
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    return { progressRate: null, gapValue: null, statusLabel: "目标值异常", tone: "amber" };
  }
  if (actualValue === null || !Number.isFinite(actualValue)) {
    return { progressRate: null, gapValue: null, statusLabel: "暂无实际值", tone: "slate" };
  }
  if (direction === "higher_is_better") {
    const progressRate = safeDivide(actualValue, targetValue);
    return {
      progressRate,
      gapValue: Number.isFinite(targetValue - actualValue) ? targetValue - actualValue : null,
      statusLabel: progressRate !== null && progressRate >= 1 ? "已达成" : "跟进中",
      tone: progressRate !== null && progressRate >= 1 ? "emerald" : "amber",
    };
  }
  const progressRate = actualValue === 0 ? 1 : safeDivide(targetValue, actualValue);
  return {
    progressRate,
    gapValue: Number.isFinite(actualValue - targetValue) ? actualValue - targetValue : null,
    statusLabel: actualValue <= targetValue ? "已达成" : "需关注",
    tone: actualValue <= targetValue ? "emerald" : "amber",
  };
};

const toProgress = ({
  targetId,
  label,
  metricKey,
  actualValue,
  targetValue,
  direction,
  periodType,
  allocationView,
}: {
  targetId: string;
  label: string;
  metricKey: string;
  actualValue: number | null;
  targetValue: number;
  direction: TargetDirection;
  periodType: TargetPeriodType;
  allocationView: ReturnType<typeof buildTargetContextAllocationView>;
}): ProductBoardTargetProgress => {
  const progress = progressFor({ actualValue, targetValue, direction });
  return {
    targetId,
    label,
    metricKey,
    metricLabel: METRIC_LABELS[metricKey] ?? metricKey,
    actualValue,
    targetValue,
    direction,
    periodType,
    progressRate: progress.progressRate,
    gapValue: progress.gapValue,
    statusLabel: progress.statusLabel,
    tone: progress.tone,
    allocationStatus: allocationView.allocationStatus,
    allocationStatusLabel: allocationView.allocationStatusLabel,
    allocationTone: allocationView.allocationTone,
  };
};

export const buildV2ProductTargetProgress = ({
  targets,
  metrics,
  selectedPeriod,
  range,
  platformCode,
  storeId,
  productId,
  maxItems = 4,
}: {
  targets: TargetRecord[];
  metrics: ProductMetricAggregate;
  selectedPeriod: ProductBoardPeriod;
  range: ProductBoardDateRangeState;
  platformCode: string;
  storeId: string;
  productId: string;
  maxItems?: number;
}): ProductBoardTargetProgress[] =>
  targets
    .filter((target) => target.status === "active")
    .filter((target) => target.scope === "product")
    .filter((target) => target.platformCode === platformCode && target.storeId === storeId && target.productId === productId)
    .filter((target) => targetMatchesPeriod(target, selectedPeriod, range))
    .map((target) =>
      toProgress({
        targetId: target.targetId,
        label: `商品目标 · ${METRIC_LABELS[target.metricKey] ?? target.metricKey}`,
        metricKey: target.metricKey,
        actualValue: metricActual(target.metricKey, metrics),
        targetValue: target.targetValue,
        direction: target.direction,
        periodType: target.periodType,
        allocationView: buildTargetContextAllocationView({ target, targets }),
      }),
    )
    .sort((left, right) => {
      const leftRate = left.progressRate ?? Number.POSITIVE_INFINITY;
      const rightRate = right.progressRate ?? Number.POSITIVE_INFINITY;
      if (leftRate !== rightRate) return leftRate - rightRate;
      return left.label.localeCompare(right.label, "zh-CN");
    })
    .slice(0, maxItems);
