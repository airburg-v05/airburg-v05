import type {
  AdPlanDailyFact,
  AdProductDailyFact,
  AfterSalesDateAggregate,
  AfterSalesPaymentDateAggregate,
  AfterSalesSuccessDateAggregate,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
  TmallDateRange,
} from "../../../types/tmall";

export type TmallTrendScope = "store" | "product" | "series";

export type TmallAfterSalesTrendDateType =
  | "applyDate"
  | "successDate"
  | "paymentDate";

export type TmallTrendMetricKey =
  | "gmv"
  | "gsv"
  | "refundSuccessAmount"
  | "refundRate"
  | "visitors"
  | "paidBuyers"
  | "conversionRate"
  | "avgOrderValue"
  | "adSpend"
  | "adTransactionAmount"
  | "adRoi"
  | "clicks"
  | "avgClickCost"
  | "clickRate"
  | "adSpendRate"
  | "adSpendRateAfterRefund"
  | "refundApplyCount"
  | "refundApplyAmount"
  | "refundOnlyCount"
  | "returnRefundCount"
  | "refundSuccessCount"
  | "refundSuccessAmountByAfterSales"
  | "refundToBuyerAmount"
  | "refundToPlatformAmount"
  | "refundAttributionCount"
  | "refundAttributionAmount";

export type TmallTrendUnit = "currency" | "integer" | "rate" | "ratio";

export type TmallTrendSource =
  | "business_product"
  | "ad_product"
  | "ad_plan"
  | "after_sales_apply"
  | "after_sales_success"
  | "after_sales_payment";

export interface TmallTrendPoint {
  date: string;
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  sourceRecordCount: number;
}

export interface TmallTrendSeries {
  scope: TmallTrendScope | "after_sales";
  metricKey: TmallTrendMetricKey;
  metricLabel: string;
  unit: TmallTrendUnit;
  source: TmallTrendSource;
  dateRange: TmallDateRange;
  points: TmallTrendPoint[];
  pointCount: number;
  missingDataSource: boolean;
  insufficientDataForTrend: boolean;
  warnings: string[];
}

export interface TmallAvailableTrendMetric {
  key: TmallTrendMetricKey;
  label: string;
  unit: TmallTrendUnit;
  source: TmallTrendSource;
}

export interface TmallTrendDateCoverageItem {
  source: TmallTrendSource;
  dateRange: TmallDateRange;
  dateCount: number;
  dates: string[];
}

export interface TmallTrendDateCoverage {
  businessProduct: TmallTrendDateCoverageItem;
  adProduct: TmallTrendDateCoverageItem;
  adPlan: TmallTrendDateCoverageItem;
  afterSalesApplyDate: TmallTrendDateCoverageItem;
  afterSalesSuccessDate: TmallTrendDateCoverageItem;
  afterSalesPaymentDate: TmallTrendDateCoverageItem;
}

export interface TmallTrendReadiness {
  businessProductPointCount: number;
  adProductPointCount: number;
  adPlanPointCount: number;
  afterSalesApplyDatePointCount: number;
  afterSalesSuccessDatePointCount: number;
  afterSalesPaymentDatePointCount: number;
  missingDataSources: TmallTrendSource[];
  singlePointSources: TmallTrendSource[];
  warnings: string[];
}

interface MetricDefinition {
  label: string;
  unit: TmallTrendUnit;
}

interface BusinessDateAggregate {
  date: string;
  gmv: number;
  gsv: number;
  refundSuccessAmount: number;
  visitors: number;
  paidBuyers: number;
  sourceRecordCount: number;
}

interface AdDateAggregate {
  date: string;
  adSpend: number;
  adTransactionAmount: number;
  impressions: number;
  clicks: number;
  sourceRecordCount: number;
}

const emptyDateRange: TmallDateRange = { start: null, end: null };

const METRIC_DEFINITIONS: Record<TmallTrendMetricKey, MetricDefinition> = {
  gmv: { label: "GMV", unit: "currency" },
  gsv: { label: "GSV", unit: "currency" },
  refundSuccessAmount: { label: "成功退款金额", unit: "currency" },
  refundRate: { label: "退款率", unit: "rate" },
  visitors: { label: "商品访客数", unit: "integer" },
  paidBuyers: { label: "支付买家数", unit: "integer" },
  conversionRate: { label: "支付转化率", unit: "rate" },
  avgOrderValue: { label: "客单价", unit: "currency" },
  adSpend: { label: "推广花费", unit: "currency" },
  adTransactionAmount: { label: "推广成交金额", unit: "currency" },
  adRoi: { label: "推广投入产出比", unit: "ratio" },
  clicks: { label: "推广点击量", unit: "integer" },
  avgClickCost: { label: "推广点击单价", unit: "currency" },
  clickRate: { label: "推广点击率", unit: "rate" },
  adSpendRate: { label: "推广费比", unit: "rate" },
  adSpendRateAfterRefund: { label: "去退推广费比", unit: "rate" },
  refundApplyCount: { label: "退款申请数", unit: "integer" },
  refundApplyAmount: { label: "退款申请金额", unit: "currency" },
  refundOnlyCount: { label: "仅退款数", unit: "integer" },
  returnRefundCount: { label: "退货退款数", unit: "integer" },
  refundSuccessCount: { label: "退款完结数", unit: "integer" },
  refundSuccessAmountByAfterSales: { label: "退款完结金额", unit: "currency" },
  refundToBuyerAmount: { label: "退给买家金额", unit: "currency" },
  refundToPlatformAmount: { label: "退给平台金额", unit: "currency" },
  refundAttributionCount: { label: "归因退款数", unit: "integer" },
  refundAttributionAmount: { label: "归因退款金额", unit: "currency" },
};

const BUSINESS_METRICS = [
  "gmv",
  "gsv",
  "refundSuccessAmount",
  "refundRate",
  "visitors",
  "paidBuyers",
  "conversionRate",
  "avgOrderValue",
] as const satisfies readonly TmallTrendMetricKey[];

const STORE_AD_METRICS = [
  "adSpend",
  "adTransactionAmount",
  "adRoi",
  "clicks",
  "avgClickCost",
  "clickRate",
] as const satisfies readonly TmallTrendMetricKey[];

const PRODUCT_AD_METRICS = [
  "adSpend",
  "adTransactionAmount",
  "adRoi",
  "clicks",
  "avgClickCost",
  "clickRate",
] as const satisfies readonly TmallTrendMetricKey[];

const SERIES_AD_METRICS = [
  "adSpend",
  "adTransactionAmount",
  "adRoi",
  "clicks",
  "avgClickCost",
  "clickRate",
  "adSpendRate",
  "adSpendRateAfterRefund",
] as const satisfies readonly TmallTrendMetricKey[];

const AFTER_SALES_APPLY_METRICS = [
  "refundApplyCount",
  "refundApplyAmount",
  "refundOnlyCount",
  "returnRefundCount",
] as const satisfies readonly TmallTrendMetricKey[];

const AFTER_SALES_SUCCESS_METRICS = [
  "refundSuccessCount",
  "refundSuccessAmountByAfterSales",
  "refundToBuyerAmount",
  "refundToPlatformAmount",
] as const satisfies readonly TmallTrendMetricKey[];

const AFTER_SALES_PAYMENT_METRICS = [
  "refundAttributionCount",
  "refundAttributionAmount",
] as const satisfies readonly TmallTrendMetricKey[];

const isMetricIn = (
  metricKey: TmallTrendMetricKey,
  metrics: readonly TmallTrendMetricKey[],
): boolean => metrics.includes(metricKey);

const finiteNumber = (value: number): number => (Number.isFinite(value) ? value : 0);

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const safeValue = (value: number | null): number | null => {
  if (value === null) return null;
  return Number.isFinite(value) ? value : null;
};

const dateRangeFromDates = (dates: string[]): TmallDateRange => {
  if (dates.length === 0) return emptyDateRange;
  return {
    start: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
  };
};

const uniqueSortedDates = <TItem extends { date: string }>(items: TItem[]): string[] =>
  [...new Set(items.map((item) => item.date).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second),
  );

const createPoint = (
  date: string,
  value: number | null,
  sourceRecordCount: number,
  numerator: number | null = null,
  denominator: number | null = null,
): TmallTrendPoint => ({
  date,
  value: safeValue(value),
  numerator: safeValue(numerator),
  denominator: safeValue(denominator),
  sourceRecordCount,
});

const createSeries = (
  scope: TmallTrendSeries["scope"],
  metricKey: TmallTrendMetricKey,
  source: TmallTrendSource,
  points: TmallTrendPoint[],
  extraWarnings: string[] = [],
): TmallTrendSeries => {
  const dates = points.map((point) => point.date);
  const missingDataSource = points.length === 0;
  const insufficientDataForTrend = points.length < 2;
  const warnings = [
    ...(missingDataSource ? ["missingDataSource"] : []),
    ...(points.length === 1 ? ["insufficientDataForTrend"] : []),
    ...extraWarnings,
  ];
  const metric = METRIC_DEFINITIONS[metricKey];

  return {
    scope,
    metricKey,
    metricLabel: metric.label,
    unit: metric.unit,
    source,
    dateRange: dateRangeFromDates(dates),
    points,
    pointCount: points.length,
    missingDataSource,
    insufficientDataForTrend,
    warnings,
  };
};

const emptySeries = (
  scope: TmallTrendSeries["scope"],
  metricKey: TmallTrendMetricKey,
  source: TmallTrendSource,
  warning = "unsupportedMetricForScope",
): TmallTrendSeries => createSeries(scope, metricKey, source, [], [warning]);

const aggregateBusinessByDate = (facts: ProductDailyFact[]): BusinessDateAggregate[] => {
  const grouped = new Map<string, BusinessDateAggregate>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.date) ?? {
      date: fact.date,
      gmv: 0,
      gsv: 0,
      refundSuccessAmount: 0,
      visitors: 0,
      paidBuyers: 0,
      sourceRecordCount: 0,
    };

    current.gmv += finiteNumber(fact.gmv);
    current.gsv += finiteNumber(fact.gsv);
    current.refundSuccessAmount += finiteNumber(fact.refundSuccessAmount);
    current.visitors += finiteNumber(fact.visitors);
    current.paidBuyers += finiteNumber(fact.paidBuyers);
    current.sourceRecordCount += 1;
    grouped.set(fact.date, current);
  });

  return [...grouped.values()].sort((first, second) => first.date.localeCompare(second.date));
};

const aggregateAdPlanByDate = (facts: AdPlanDailyFact[]): AdDateAggregate[] => {
  const grouped = new Map<string, AdDateAggregate>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.date) ?? {
      date: fact.date,
      adSpend: 0,
      adTransactionAmount: 0,
      impressions: 0,
      clicks: 0,
      sourceRecordCount: 0,
    };

    current.adSpend += finiteNumber(fact.adSpend);
    current.adTransactionAmount += finiteNumber(fact.transactionAmount);
    current.impressions += finiteNumber(fact.impressions);
    current.clicks += finiteNumber(fact.clicks);
    current.sourceRecordCount += 1;
    grouped.set(fact.date, current);
  });

  return [...grouped.values()].sort((first, second) => first.date.localeCompare(second.date));
};

const aggregateAdProductByDate = (facts: AdProductDailyFact[]): AdDateAggregate[] => {
  const grouped = new Map<string, AdDateAggregate>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.date) ?? {
      date: fact.date,
      adSpend: 0,
      adTransactionAmount: 0,
      impressions: 0,
      clicks: 0,
      sourceRecordCount: 0,
    };

    current.adSpend += finiteNumber(fact.adSpend);
    current.adTransactionAmount += finiteNumber(fact.adTransactionAmount);
    current.impressions += finiteNumber(fact.impressions);
    current.clicks += finiteNumber(fact.clicks);
    current.sourceRecordCount += 1;
    grouped.set(fact.date, current);
  });

  return [...grouped.values()].sort((first, second) => first.date.localeCompare(second.date));
};

const businessPointValue = (
  aggregate: BusinessDateAggregate,
  metricKey: TmallTrendMetricKey,
): Pick<TmallTrendPoint, "value" | "numerator" | "denominator"> => {
  switch (metricKey) {
    case "gmv":
      return { value: aggregate.gmv, numerator: null, denominator: null };
    case "gsv":
      return { value: aggregate.gsv, numerator: null, denominator: null };
    case "refundSuccessAmount":
      return { value: aggregate.refundSuccessAmount, numerator: null, denominator: null };
    case "visitors":
      return { value: aggregate.visitors, numerator: null, denominator: null };
    case "paidBuyers":
      return { value: aggregate.paidBuyers, numerator: null, denominator: null };
    case "refundRate":
      return {
        value: safeDivide(aggregate.refundSuccessAmount, aggregate.gmv),
        numerator: aggregate.refundSuccessAmount,
        denominator: aggregate.gmv,
      };
    case "conversionRate":
      return {
        value: safeDivide(aggregate.paidBuyers, aggregate.visitors),
        numerator: aggregate.paidBuyers,
        denominator: aggregate.visitors,
      };
    case "avgOrderValue":
      return {
        value: safeDivide(aggregate.gmv, aggregate.paidBuyers),
        numerator: aggregate.gmv,
        denominator: aggregate.paidBuyers,
      };
    default:
      return { value: null, numerator: null, denominator: null };
  }
};

const adPointValue = (
  aggregate: AdDateAggregate,
  metricKey: TmallTrendMetricKey,
): Pick<TmallTrendPoint, "value" | "numerator" | "denominator"> => {
  switch (metricKey) {
    case "adSpend":
      return { value: aggregate.adSpend, numerator: null, denominator: null };
    case "adTransactionAmount":
      return { value: aggregate.adTransactionAmount, numerator: null, denominator: null };
    case "clicks":
      return { value: aggregate.clicks, numerator: null, denominator: null };
    case "adRoi":
      return {
        value: safeDivide(aggregate.adTransactionAmount, aggregate.adSpend),
        numerator: aggregate.adTransactionAmount,
        denominator: aggregate.adSpend,
      };
    case "avgClickCost":
      return {
        value: safeDivide(aggregate.adSpend, aggregate.clicks),
        numerator: aggregate.adSpend,
        denominator: aggregate.clicks,
      };
    case "clickRate":
      return {
        value: safeDivide(aggregate.clicks, aggregate.impressions),
        numerator: aggregate.clicks,
        denominator: aggregate.impressions,
      };
    default:
      return { value: null, numerator: null, denominator: null };
  }
};

const buildBusinessTrendSeries = (
  scope: TmallTrendScope,
  facts: ProductDailyFact[],
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  if (!isMetricIn(metricKey, BUSINESS_METRICS)) {
    return emptySeries(scope, metricKey, "business_product");
  }

  const points = aggregateBusinessByDate(facts).map((aggregate) => {
    const metric = businessPointValue(aggregate, metricKey);
    return createPoint(
      aggregate.date,
      metric.value,
      aggregate.sourceRecordCount,
      metric.numerator,
      metric.denominator,
    );
  });

  return createSeries(scope, metricKey, "business_product", points);
};

const buildAdTrendSeries = (
  scope: TmallTrendScope,
  source: "ad_product" | "ad_plan",
  aggregates: AdDateAggregate[],
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  const availableMetrics = source === "ad_plan" ? STORE_AD_METRICS : PRODUCT_AD_METRICS;
  if (!isMetricIn(metricKey, availableMetrics)) {
    return emptySeries(scope, metricKey, source);
  }

  const points = aggregates.map((aggregate) => {
    const metric = adPointValue(aggregate, metricKey);
    return createPoint(
      aggregate.date,
      metric.value,
      aggregate.sourceRecordCount,
      metric.numerator,
      metric.denominator,
    );
  });

  return createSeries(scope, metricKey, source, points);
};

const buildSeriesAdTrendSeries = (
  adAggregates: AdDateAggregate[],
  businessAggregates: BusinessDateAggregate[],
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  if (!isMetricIn(metricKey, SERIES_AD_METRICS)) {
    return emptySeries("series", metricKey, "ad_product");
  }

  const businessByDate = new Map(businessAggregates.map((aggregate) => [aggregate.date, aggregate]));
  const points = adAggregates.map((aggregate) => {
    if (metricKey === "adSpendRate" || metricKey === "adSpendRateAfterRefund") {
      const business = businessByDate.get(aggregate.date) ?? null;
      const denominator = metricKey === "adSpendRate"
        ? business?.gmv ?? 0
        : business?.gsv ?? 0;

      return createPoint(
        aggregate.date,
        safeDivide(aggregate.adSpend, denominator),
        aggregate.sourceRecordCount,
        aggregate.adSpend,
        denominator,
      );
    }

    const metric = adPointValue(aggregate, metricKey);
    return createPoint(
      aggregate.date,
      metric.value,
      aggregate.sourceRecordCount,
      metric.numerator,
      metric.denominator,
    );
  });

  return createSeries("series", metricKey, "ad_product", points);
};

export const buildStoreTrendSeries = (
  result: TmallAnalysisDisplayResult,
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  if (isMetricIn(metricKey, BUSINESS_METRICS)) {
    return buildBusinessTrendSeries("store", result.productDailyFacts, metricKey);
  }

  if (isMetricIn(metricKey, STORE_AD_METRICS)) {
    return buildAdTrendSeries(
      "store",
      "ad_plan",
      aggregateAdPlanByDate(result.adPlanDailyFacts),
      metricKey,
    );
  }

  return emptySeries("store", metricKey, "business_product");
};

export const buildProductTrendSeries = (
  result: TmallAnalysisDisplayResult,
  productId: string,
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  const normalizedProductId = String(productId);

  if (isMetricIn(metricKey, BUSINESS_METRICS)) {
    return buildBusinessTrendSeries(
      "product",
      result.productDailyFacts.filter((fact) => String(fact.productId) === normalizedProductId),
      metricKey,
    );
  }

  if (isMetricIn(metricKey, PRODUCT_AD_METRICS)) {
    return buildAdTrendSeries(
      "product",
      "ad_product",
      aggregateAdProductByDate(
        result.adProductDailyFacts.filter((fact) => String(fact.productId) === normalizedProductId),
      ),
      metricKey,
    );
  }

  return emptySeries("product", metricKey, "business_product");
};

export const buildSeriesTrendSeries = (
  result: TmallAnalysisDisplayResult,
  productIds: string[],
  metricKey: TmallTrendMetricKey,
): TmallTrendSeries => {
  const productIdSet = new Set(productIds.map(String).filter(Boolean));
  const businessFacts = result.productDailyFacts.filter((fact) => productIdSet.has(String(fact.productId)));

  if (isMetricIn(metricKey, BUSINESS_METRICS)) {
    return buildBusinessTrendSeries("series", businessFacts, metricKey);
  }

  if (isMetricIn(metricKey, SERIES_AD_METRICS)) {
    return buildSeriesAdTrendSeries(
      aggregateAdProductByDate(
        result.adProductDailyFacts.filter((fact) => productIdSet.has(String(fact.productId))),
      ),
      aggregateBusinessByDate(businessFacts),
      metricKey,
    );
  }

  return emptySeries("series", metricKey, "business_product");
};

const buildAfterSalesApplyPoint = (
  aggregate: AfterSalesDateAggregate,
  metricKey: TmallTrendMetricKey,
): number | null => {
  switch (metricKey) {
    case "refundApplyCount":
      return aggregate.refundApplyCount;
    case "refundApplyAmount":
      return aggregate.refundApplyAmount;
    case "refundOnlyCount":
      return aggregate.refundOnlyCount;
    case "returnRefundCount":
      return aggregate.returnRefundCount;
    default:
      return null;
  }
};

const buildAfterSalesSuccessPoint = (
  aggregate: AfterSalesSuccessDateAggregate,
  metricKey: TmallTrendMetricKey,
): number | null => {
  switch (metricKey) {
    case "refundSuccessCount":
      return aggregate.refundSuccessCount;
    case "refundSuccessAmountByAfterSales":
      return aggregate.refundSuccessTotalAmount;
    case "refundToBuyerAmount":
      return aggregate.refundToBuyerAmount;
    case "refundToPlatformAmount":
      return aggregate.refundToPlatformAmount;
    default:
      return null;
  }
};

const buildAfterSalesPaymentPoint = (
  aggregate: AfterSalesPaymentDateAggregate,
  metricKey: TmallTrendMetricKey,
): number | null => {
  switch (metricKey) {
    case "refundAttributionCount":
      return aggregate.refundAttributionCount;
    case "refundAttributionAmount":
      return aggregate.refundAttributionAmount;
    default:
      return null;
  }
};

export const buildAfterSalesTrendSeries = (
  result: TmallAnalysisDisplayResult,
  metricKey: TmallTrendMetricKey,
  dateType: TmallAfterSalesTrendDateType,
): TmallTrendSeries => {
  if (dateType === "applyDate") {
    if (!isMetricIn(metricKey, AFTER_SALES_APPLY_METRICS)) {
      return emptySeries("after_sales", metricKey, "after_sales_apply");
    }

    const points = [...result.afterSalesAggregates.byApplyDate]
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((aggregate) => createPoint(
        aggregate.date,
        buildAfterSalesApplyPoint(aggregate, metricKey),
        1,
      ));

    return createSeries("after_sales", metricKey, "after_sales_apply", points);
  }

  if (dateType === "successDate") {
    if (!isMetricIn(metricKey, AFTER_SALES_SUCCESS_METRICS)) {
      return emptySeries("after_sales", metricKey, "after_sales_success");
    }

    const points = [...result.afterSalesAggregates.bySuccessDate]
      .sort((first, second) => first.date.localeCompare(second.date))
      .map((aggregate) => createPoint(
        aggregate.date,
        buildAfterSalesSuccessPoint(aggregate, metricKey),
        1,
      ));

    return createSeries("after_sales", metricKey, "after_sales_success", points);
  }

  if (!isMetricIn(metricKey, AFTER_SALES_PAYMENT_METRICS)) {
    return emptySeries("after_sales", metricKey, "after_sales_payment");
  }

  const points = [...result.afterSalesAggregates.byPaymentDate]
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((aggregate) => createPoint(
      aggregate.date,
      buildAfterSalesPaymentPoint(aggregate, metricKey),
      1,
    ));

  return createSeries("after_sales", metricKey, "after_sales_payment", points);
};

const toAvailableMetric = (
  key: TmallTrendMetricKey,
  source: TmallTrendSource,
): TmallAvailableTrendMetric => ({
  key,
  label: METRIC_DEFINITIONS[key].label,
  unit: METRIC_DEFINITIONS[key].unit,
  source,
});

export const getAvailableTrendMetrics = (
  scope: TmallTrendScope,
): TmallAvailableTrendMetric[] => {
  if (scope === "store") {
    return [
      ...BUSINESS_METRICS.map((key) => toAvailableMetric(key, "business_product")),
      ...STORE_AD_METRICS.map((key) => toAvailableMetric(key, "ad_plan")),
      ...AFTER_SALES_APPLY_METRICS.map((key) => toAvailableMetric(key, "after_sales_apply")),
      ...AFTER_SALES_SUCCESS_METRICS.map((key) => toAvailableMetric(key, "after_sales_success")),
      ...AFTER_SALES_PAYMENT_METRICS.map((key) => toAvailableMetric(key, "after_sales_payment")),
    ];
  }

  if (scope === "product") {
    return [
      ...BUSINESS_METRICS.map((key) => toAvailableMetric(key, "business_product")),
      ...PRODUCT_AD_METRICS.map((key) => toAvailableMetric(key, "ad_product")),
    ];
  }

  return [
    ...BUSINESS_METRICS.map((key) => toAvailableMetric(key, "business_product")),
    ...SERIES_AD_METRICS.map((key) => toAvailableMetric(key, "ad_product")),
  ];
};

const buildCoverageItem = (
  source: TmallTrendSource,
  dates: string[],
): TmallTrendDateCoverageItem => ({
  source,
  dateRange: dateRangeFromDates(dates),
  dateCount: dates.length,
  dates,
});

export const getTrendDateCoverage = (
  result: TmallAnalysisDisplayResult,
): TmallTrendDateCoverage => {
  const businessDates = uniqueSortedDates(result.productDailyFacts);
  const adProductDates = uniqueSortedDates(result.adProductDailyFacts);
  const adPlanDates = uniqueSortedDates(result.adPlanDailyFacts);
  const afterSalesApplyDates = uniqueSortedDates(result.afterSalesAggregates.byApplyDate);
  const afterSalesSuccessDates = uniqueSortedDates(result.afterSalesAggregates.bySuccessDate);
  const afterSalesPaymentDates = uniqueSortedDates(result.afterSalesAggregates.byPaymentDate);

  return {
    businessProduct: buildCoverageItem("business_product", businessDates),
    adProduct: buildCoverageItem("ad_product", adProductDates),
    adPlan: buildCoverageItem("ad_plan", adPlanDates),
    afterSalesApplyDate: buildCoverageItem("after_sales_apply", afterSalesApplyDates),
    afterSalesSuccessDate: buildCoverageItem("after_sales_success", afterSalesSuccessDates),
    afterSalesPaymentDate: buildCoverageItem("after_sales_payment", afterSalesPaymentDates),
  };
};

export const buildTrendReadiness = (
  result: TmallAnalysisDisplayResult,
): TmallTrendReadiness => {
  const coverage = getTrendDateCoverage(result);
  const items = [
    coverage.businessProduct,
    coverage.adProduct,
    coverage.adPlan,
    coverage.afterSalesApplyDate,
    coverage.afterSalesSuccessDate,
    coverage.afterSalesPaymentDate,
  ];
  const missingDataSources = items
    .filter((item) => item.dateCount === 0)
    .map((item) => item.source);
  const singlePointSources = items
    .filter((item) => item.dateCount === 1)
    .map((item) => item.source);
  const warnings = [
    ...missingDataSources.map((source) => `${source}:missingDataSource`),
    ...singlePointSources.map((source) => `${source}:insufficientDataForTrend`),
  ];

  return {
    businessProductPointCount: coverage.businessProduct.dateCount,
    adProductPointCount: coverage.adProduct.dateCount,
    adPlanPointCount: coverage.adPlan.dateCount,
    afterSalesApplyDatePointCount: coverage.afterSalesApplyDate.dateCount,
    afterSalesSuccessDatePointCount: coverage.afterSalesSuccessDate.dateCount,
    afterSalesPaymentDatePointCount: coverage.afterSalesPaymentDate.dateCount,
    missingDataSources,
    singlePointSources,
    warnings,
  };
};
