import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type {
  AdPlanDailyFact,
  AdProductDailyFact,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
} from "../../../types/tmall";
import type {
  TmallTargetDefinition,
  TmallTargetDirection,
  TmallTargetMetricKey,
  TmallTargetScope,
  TmallTargetUnit,
} from "../../../types/tmall-targets";

export type TmallTargetActualValueSource =
  | "business_product"
  | "ad_product"
  | "ad_plan"
  | "series_group";

export interface TmallTargetMetricDefinition {
  metricKey: TmallTargetMetricKey;
  label: string;
  unit: TmallTargetUnit;
  direction: TmallTargetDirection;
  supportedScopes: TmallTargetScope[];
  helper: string;
}

export interface TmallTargetActualValue {
  value: number | null;
  numerator?: number | null;
  denominator?: number | null;
  source: TmallTargetActualValueSource;
  datePointCount: number;
  warnings: string[];
}

export type TmallTargetProgressStatus =
  | "not_started"
  | "in_progress"
  | "achieved"
  | "at_risk"
  | "missing_actual"
  | "invalid_target"
  | "paused";

export interface TmallTargetProgress {
  target: TmallTargetDefinition;
  actualValue: number | null;
  targetValue: number;
  progressRate: number | null;
  gapValue: number | null;
  status: TmallTargetProgressStatus;
  warnings: string[];
}

interface BusinessAggregate {
  hasData: boolean;
  datePointCount: number;
  gmv: number;
  gsv: number;
  visitors: number;
  paidBuyers: number;
  refundSuccessAmount: number;
}

interface AdAggregate {
  hasData: boolean;
  datePointCount: number;
  adSpend: number;
  adTransactionAmount: number;
}

const STORE_PRODUCT_SERIES: TmallTargetScope[] = ["store", "product", "series"];

const BUSINESS_METRICS = [
  "gmv",
  "gsv",
  "visitors",
  "paidBuyers",
  "conversionRate",
  "avgOrderValue",
  "refundRate",
] as const satisfies readonly TmallTargetMetricKey[];

const TARGET_METRIC_DEFINITIONS: Record<
  TmallTargetMetricKey,
  TmallTargetMetricDefinition
> = {
  gmv: {
    metricKey: "gmv",
    label: "GMV",
    unit: "currency",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "支付金额合计。",
  },
  gsv: {
    metricKey: "gsv",
    label: "GSV",
    unit: "currency",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "支付金额扣除成功退款金额后的经营收入。",
  },
  visitors: {
    metricKey: "visitors",
    label: "商品访客数",
    unit: "integer",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "商品访客数合计。",
  },
  paidBuyers: {
    metricKey: "paidBuyers",
    label: "支付买家数",
    unit: "integer",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "支付买家数合计。",
  },
  conversionRate: {
    metricKey: "conversionRate",
    label: "支付转化率",
    unit: "rate",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "支付买家数合计除以商品访客数合计。",
  },
  avgOrderValue: {
    metricKey: "avgOrderValue",
    label: "客单价",
    unit: "currency",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "GMV 除以支付买家数。",
  },
  refundRate: {
    metricKey: "refundRate",
    label: "退款率",
    unit: "rate",
    direction: "lower_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "成功退款金额除以 GMV。",
  },
  adSpend: {
    metricKey: "adSpend",
    label: "推广花费",
    unit: "currency",
    direction: "lower_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "店铺目标使用计划推广数据，宝贝和系列目标使用商品推广数据。",
  },
  adRoi: {
    metricKey: "adRoi",
    label: "推广投入产出比",
    unit: "ratio",
    direction: "higher_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "推广成交金额除以推广花费。",
  },
  adSpendRate: {
    metricKey: "adSpendRate",
    label: "推广费比",
    unit: "rate",
    direction: "lower_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "推广花费除以 GMV。",
  },
  adSpendRateAfterRefund: {
    metricKey: "adSpendRateAfterRefund",
    label: "去退推广费比",
    unit: "rate",
    direction: "lower_is_better",
    supportedScopes: STORE_PRODUCT_SERIES,
    helper: "推广花费除以 GSV。",
  },
};

const isBusinessMetric = (metricKey: TmallTargetMetricKey): boolean =>
  (BUSINESS_METRICS as readonly TmallTargetMetricKey[]).includes(metricKey);

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const safeNumber = (value: number | null): number | null =>
  value === null || Number.isFinite(value) ? value : null;

const uniqueDateCount = <TItem extends { date: string }>(items: TItem[]): number =>
  new Set(items.map((item) => item.date).filter(Boolean)).size;

const matchesTargetPeriod = (
  date: string,
  target: TmallTargetDefinition,
): boolean => {
  if (target.periodType === "daily") return date === target.periodValue;
  return date.startsWith(`${target.periodValue}-`);
};

const periodWarnings = (target: TmallTargetDefinition): string[] =>
  target.periodType === "monthly"
    ? ["月度目标仅基于已上传日期计算，当前不做 MTD/DLY、预测或自然月补齐。"]
    : [];

const aggregateBusiness = (facts: ProductDailyFact[]): BusinessAggregate => ({
  hasData: facts.length > 0,
  datePointCount: uniqueDateCount(facts),
  gmv: sum(facts, (fact) => fact.gmv),
  gsv: sum(facts, (fact) => fact.gsv),
  visitors: sum(facts, (fact) => fact.visitors),
  paidBuyers: sum(facts, (fact) => fact.paidBuyers),
  refundSuccessAmount: sum(facts, (fact) => fact.refundSuccessAmount),
});

const aggregateAdPlan = (facts: AdPlanDailyFact[]): AdAggregate => ({
  hasData: facts.length > 0,
  datePointCount: uniqueDateCount(facts),
  adSpend: sum(facts, (fact) => fact.adSpend),
  adTransactionAmount: sum(facts, (fact) => fact.transactionAmount),
});

const aggregateAdProduct = (facts: AdProductDailyFact[]): AdAggregate => ({
  hasData: facts.length > 0,
  datePointCount: uniqueDateCount(facts),
  adSpend: sum(facts, (fact) => fact.adSpend),
  adTransactionAmount: sum(facts, (fact) => fact.adTransactionAmount),
});

const actualSource = (
  target: TmallTargetDefinition,
  metricKey: TmallTargetMetricKey,
): TmallTargetActualValueSource => {
  if (target.scope === "series") return "series_group";
  if (isBusinessMetric(metricKey)) return "business_product";
  return target.scope === "store" ? "ad_plan" : "ad_product";
};

const emptyActual = (
  target: TmallTargetDefinition,
  warnings: string[],
): TmallTargetActualValue => ({
  value: null,
  numerator: null,
  denominator: null,
  source: actualSource(target, target.metricKey),
  datePointCount: 0,
  warnings,
});

const findSeriesGroup = (
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): TmallSeriesGroup | null => {
  if (target.scope !== "series" || !target.seriesId) return null;
  return seriesGroups.find((group) => group.id === target.seriesId) ?? null;
};

const targetProductIds = (
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): string[] | null => {
  if (target.scope === "product") return target.productId ? [String(target.productId)] : null;
  if (target.scope === "series") {
    const group = findSeriesGroup(target, seriesGroups);
    return group ? group.productIds.map(String).filter(Boolean) : null;
  }
  return null;
};

const filterBusinessFacts = (
  result: TmallAnalysisDisplayResult,
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): ProductDailyFact[] => {
  const periodFacts = result.productDailyFacts.filter((fact) =>
    matchesTargetPeriod(fact.date, target),
  );

  if (target.scope === "store") return periodFacts;

  const productIds = targetProductIds(target, seriesGroups);
  if (!productIds) return [];

  const productIdSet = new Set(productIds);
  return periodFacts.filter((fact) => productIdSet.has(String(fact.productId)));
};

const filterAdProductFacts = (
  result: TmallAnalysisDisplayResult,
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): AdProductDailyFact[] => {
  const productIds = targetProductIds(target, seriesGroups);
  if (!productIds) return [];

  const productIdSet = new Set(productIds);
  return result.adProductDailyFacts.filter(
    (fact) =>
      matchesTargetPeriod(fact.date, target) &&
      productIdSet.has(String(fact.productId)),
  );
};

const filterAdPlanFacts = (
  result: TmallAnalysisDisplayResult,
  target: TmallTargetDefinition,
): AdPlanDailyFact[] =>
  result.adPlanDailyFacts.filter((fact) => matchesTargetPeriod(fact.date, target));

const businessMetricActual = (
  target: TmallTargetDefinition,
  business: BusinessAggregate,
  warnings: string[],
): TmallTargetActualValue => {
  const source = actualSource(target, target.metricKey);
  if (!business.hasData) {
    return {
      value: null,
      numerator: null,
      denominator: null,
      source,
      datePointCount: 0,
      warnings,
    };
  }

  switch (target.metricKey) {
    case "gmv":
      return { value: business.gmv, source, datePointCount: business.datePointCount, warnings };
    case "gsv":
      return { value: business.gsv, source, datePointCount: business.datePointCount, warnings };
    case "visitors":
      return { value: business.visitors, source, datePointCount: business.datePointCount, warnings };
    case "paidBuyers":
      return { value: business.paidBuyers, source, datePointCount: business.datePointCount, warnings };
    case "conversionRate":
      return {
        value: safeDivide(business.paidBuyers, business.visitors),
        numerator: business.paidBuyers,
        denominator: business.visitors,
        source,
        datePointCount: business.datePointCount,
        warnings,
      };
    case "avgOrderValue":
      return {
        value: safeDivide(business.gmv, business.paidBuyers),
        numerator: business.gmv,
        denominator: business.paidBuyers,
        source,
        datePointCount: business.datePointCount,
        warnings,
      };
    case "refundRate":
      return {
        value: safeDivide(business.refundSuccessAmount, business.gmv),
        numerator: business.refundSuccessAmount,
        denominator: business.gmv,
        source,
        datePointCount: business.datePointCount,
        warnings,
      };
    default:
      return emptyActual(target, warnings);
  }
};

const adMetricActual = (
  target: TmallTargetDefinition,
  business: BusinessAggregate,
  ad: AdAggregate,
  warnings: string[],
): TmallTargetActualValue => {
  const source = actualSource(target, target.metricKey);
  if (!ad.hasData) {
    return {
      value: null,
      numerator: null,
      denominator: null,
      source,
      datePointCount: 0,
      warnings,
    };
  }

  switch (target.metricKey) {
    case "adSpend":
      return { value: ad.adSpend, source, datePointCount: ad.datePointCount, warnings };
    case "adRoi":
      return {
        value: safeDivide(ad.adTransactionAmount, ad.adSpend),
        numerator: ad.adTransactionAmount,
        denominator: ad.adSpend,
        source,
        datePointCount: ad.datePointCount,
        warnings,
      };
    case "adSpendRate":
      return {
        value: business.hasData ? safeDivide(ad.adSpend, business.gmv) : null,
        numerator: ad.adSpend,
        denominator: business.hasData ? business.gmv : null,
        source,
        datePointCount: ad.datePointCount,
        warnings,
      };
    case "adSpendRateAfterRefund":
      return {
        value: business.hasData ? safeDivide(ad.adSpend, business.gsv) : null,
        numerator: ad.adSpend,
        denominator: business.hasData ? business.gsv : null,
        source,
        datePointCount: ad.datePointCount,
        warnings,
      };
    default:
      return emptyActual(target, warnings);
  }
};

export const getAvailableTargetMetrics = (
  scope: TmallTargetScope,
): TmallTargetMetricDefinition[] =>
  Object.values(TARGET_METRIC_DEFINITIONS).filter((metric) =>
    metric.supportedScopes.includes(scope),
  );

export const getTmallTargetMetricDefinition = (
  metricKey: TmallTargetMetricKey,
): TmallTargetMetricDefinition => TARGET_METRIC_DEFINITIONS[metricKey];

export const buildTmallTargetActualValue = (
  result: TmallAnalysisDisplayResult,
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): TmallTargetActualValue => {
  const warnings = periodWarnings(target);

  if (target.scope === "product" && !target.productId) {
    return emptyActual(target, [...warnings, "宝贝目标缺少商品 ID。"]);
  }

  if (target.scope === "series") {
    const group = findSeriesGroup(target, seriesGroups);
    if (!group) {
      return emptyActual(target, [...warnings, "未匹配到系列分组。"]);
    }
  }

  const business = aggregateBusiness(filterBusinessFacts(result, target, seriesGroups));
  if (isBusinessMetric(target.metricKey)) {
    return businessMetricActual(target, business, warnings);
  }

  const ad = target.scope === "store"
    ? aggregateAdPlan(filterAdPlanFacts(result, target))
    : aggregateAdProduct(filterAdProductFacts(result, target, seriesGroups));

  return adMetricActual(target, business, ad, warnings);
};

const validTargetValue = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const progressValue = (value: number | null): number | null =>
  safeNumber(value);

const buildProgressForTarget = (
  result: TmallAnalysisDisplayResult,
  target: TmallTargetDefinition,
  seriesGroups: TmallSeriesGroup[] = [],
): TmallTargetProgress => {
  if (target.status === "paused") {
    return {
      target,
      actualValue: null,
      targetValue: target.targetValue,
      progressRate: null,
      gapValue: null,
      status: "paused",
      warnings: ["目标已暂停。"],
    };
  }

  if (!validTargetValue(target.targetValue)) {
    return {
      target,
      actualValue: null,
      targetValue: target.targetValue,
      progressRate: null,
      gapValue: null,
      status: "invalid_target",
      warnings: ["目标值必须是有限正数。"],
    };
  }

  const actual = buildTmallTargetActualValue(result, target, seriesGroups);
  const actualValue = actual.value;
  if (actualValue === null) {
    return {
      target,
      actualValue,
      targetValue: target.targetValue,
      progressRate: null,
      gapValue: null,
      status: "missing_actual",
      warnings: actual.warnings,
    };
  }

  if (target.direction === "higher_is_better") {
    const progressRate = progressValue(safeDivide(actualValue, target.targetValue));
    const gapValue = progressValue(target.targetValue - actualValue);
    return {
      target,
      actualValue,
      targetValue: target.targetValue,
      progressRate,
      gapValue,
      status:
        progressRate === null
          ? "missing_actual"
          : progressRate >= 1
            ? "achieved"
            : progressRate >= 0.8
              ? "in_progress"
              : "at_risk",
      warnings: actual.warnings,
    };
  }

  const progressRate = actualValue === 0
    ? 1
    : progressValue(safeDivide(target.targetValue, actualValue));
  const gapValue = progressValue(actualValue - target.targetValue);

  return {
    target,
    actualValue,
    targetValue: target.targetValue,
    progressRate,
    gapValue,
    status:
      actualValue <= target.targetValue
        ? "achieved"
        : actualValue <= target.targetValue * 1.2
          ? "in_progress"
          : "at_risk",
    warnings: actual.warnings,
  };
};

export const buildTmallTargetProgress = (
  result: TmallAnalysisDisplayResult,
  targets: TmallTargetDefinition[],
  seriesGroups: TmallSeriesGroup[] = [],
): TmallTargetProgress[] =>
  targets.map((target) => buildProgressForTarget(result, target, seriesGroups));
