import type {
  AdProductDailyFact,
  DistributionItem,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
  TmallDateRange,
  TmallJoinQuality,
  TmallReconciliation,
  TmallSourceHealth,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";

export type StoreMetricFormat = "currency" | "integer" | "rate" | "roi";

export interface TmallStoreMetric {
  key: string;
  label: string;
  value: number | null;
  format: StoreMetricFormat;
  helper: string;
}

export interface TmallStoreSourceAvailability {
  status: TmallSourceStatus;
  rowCount: number;
  hasSelectedDateData: boolean;
}

export interface TmallStoreProductItem {
  productId: string;
  productName: string;
  gmv: number;
  gsv: number;
  refundSuccessAmount: number;
  visitors: number;
  paidBuyers: number;
  conversionRate: number | null;
  refundRate: number | null;
}

export interface TmallStoreAdRiskItem {
  productId: string;
  adSpend: number;
  adTransactionAmount: number;
}

export interface TmallStoreProductRankings {
  gmvTopProducts: TmallStoreProductItem[];
  refundTopProducts: TmallStoreProductItem[];
  noPaymentProducts: TmallStoreProductItem[];
  adSpendNoTransactionProducts: TmallStoreAdRiskItem[];
  promotedProductCount: number;
  noAdProductCount: number;
  productCount: number;
}

export interface TmallStoreRiskSummary {
  noPaymentCount: number;
  adSpendNoTransactionCount: number;
  refundProductCount: number;
  dataQualityWarningCount: number;
}

export interface TmallStoreAfterSalesOverview {
  hasAfterSalesData: boolean;
  dateRange: TmallDateRange;
  selectedDateMetrics: {
    refundApplyCount: number | null;
    refundApplyAmount: number | null;
    refundSuccessCount: number | null;
    refundSuccessTotalAmount: number | null;
  };
  rangeSummary: {
    refundOnlyCount: number | null;
    returnRefundCount: number | null;
    pendingCount: number | null;
    overduePendingCount: number | null;
    customerServiceInterventionCount: number | null;
    topReasons: DistributionItem[];
    statusDistribution: DistributionItem[];
  };
}

export interface TmallStoreReconciliationOverview {
  status: TmallReconciliation["reconciliationStatus"] | "missing";
  comparedDateRange: TmallDateRange;
  adSpendDifference: number | null;
  transactionAmountDifference: number | null;
  message: string;
}

export interface TmallStoreBoardOverview {
  selectedDate: string | null;
  availableDates: string[];
  analysisTimestamp: string;
  sourceAvailability: Record<TmallSourceType, TmallStoreSourceAvailability>;
  businessMetrics: TmallStoreMetric[];
  adMetrics: TmallStoreMetric[];
  afterSalesMetrics: TmallStoreAfterSalesOverview;
  productRankings: TmallStoreProductRankings;
  riskSummary: TmallStoreRiskSummary;
  joinQuality: TmallJoinQuality;
  reconciliation: TmallReconciliation | null;
  reconciliationOverview: TmallStoreReconciliationOverview;
  sourceHealth: Record<TmallSourceType, TmallSourceHealth>;
  dateRanges: Record<TmallSourceType, TmallDateRange>;
  dataQualityWarnings: string[];
  missingBusinessData: boolean;
  hasSelectedDateProducts: boolean;
  hasSelectedDatePlanAdData: boolean;
}

interface ProductAggregate {
  productId: string;
  productName: string;
  gmv: number;
  gsv: number;
  refundSuccessAmount: number;
  visitors: number;
  paidBuyers: number;
}

interface AdProductAggregate {
  productId: string;
  adSpend: number;
  adTransactionAmount: number;
}

const SOURCE_TYPES: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const emptyDateRange: TmallDateRange = { start: null, end: null };

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const productLabel = (productId: string, productName: string | null): string =>
  productName?.trim() || `商品 ${productId}`;

const toMetricValue = (hasData: boolean, value: number | null): number | null =>
  hasData ? value : null;

const topItems = <TItem>(items: TItem[], limit = 5): TItem[] => items.slice(0, limit);

export const getTmallStoreBoardDates = (result: TmallAnalysisDisplayResult): string[] =>
  [...new Set(result.productDailyFacts.map((fact) => fact.date).filter(Boolean))].sort((first, second) =>
    second.localeCompare(first),
  );

const groupProductFacts = (facts: ProductDailyFact[]): ProductAggregate[] => {
  const grouped = new Map<string, ProductAggregate>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.productId);
    if (!current) {
      grouped.set(fact.productId, {
        productId: fact.productId,
        productName: productLabel(fact.productId, fact.productName),
        gmv: fact.gmv,
        gsv: fact.gsv,
        refundSuccessAmount: fact.refundSuccessAmount,
        visitors: fact.visitors,
        paidBuyers: fact.paidBuyers,
      });
      return;
    }

    current.gmv += fact.gmv;
    current.gsv += fact.gsv;
    current.refundSuccessAmount += fact.refundSuccessAmount;
    current.visitors += fact.visitors;
    current.paidBuyers += fact.paidBuyers;
  });

  return [...grouped.values()];
};

const toProductItem = (aggregate: ProductAggregate): TmallStoreProductItem => ({
  ...aggregate,
  conversionRate: safeDivide(aggregate.paidBuyers, aggregate.visitors),
  refundRate: safeDivide(aggregate.refundSuccessAmount, aggregate.gmv),
});

const groupAdProductFacts = (facts: AdProductDailyFact[]): Map<string, AdProductAggregate> => {
  const grouped = new Map<string, AdProductAggregate>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.productId) ?? {
      productId: fact.productId,
      adSpend: 0,
      adTransactionAmount: 0,
    };

    current.adSpend += fact.adSpend;
    current.adTransactionAmount += fact.adTransactionAmount;
    grouped.set(fact.productId, current);
  });

  return grouped;
};

const hasDateInAfterSales = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): boolean => {
  if (!selectedDate) return false;
  return (
    result.afterSalesAggregates.byApplyDate.some((item) => item.date === selectedDate) ||
    result.afterSalesAggregates.bySuccessDate.some((item) => item.date === selectedDate) ||
    result.afterSalesAggregates.byPaymentDate.some((item) => item.date === selectedDate)
  );
};

const buildSourceAvailability = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
  productFactsForDate: ProductDailyFact[],
): Record<TmallSourceType, TmallStoreSourceAvailability> => {
  const adProductFactsForDate = selectedDate
    ? result.adProductDailyFacts.filter((fact) => fact.date === selectedDate)
    : [];
  const adPlanFactsForDate = selectedDate
    ? result.adPlanDailyFacts.filter((fact) => fact.date === selectedDate)
    : [];

  const availability = {
    business_product: {
      status: result.sourceHealth.business_product.status,
      rowCount: result.sourceHealth.business_product.rowCount,
      hasSelectedDateData: productFactsForDate.length > 0,
    },
    ad_product: {
      status: result.sourceHealth.ad_product.status,
      rowCount: result.sourceHealth.ad_product.rowCount,
      hasSelectedDateData: adProductFactsForDate.length > 0,
    },
    ad_plan: {
      status: result.sourceHealth.ad_plan.status,
      rowCount: result.sourceHealth.ad_plan.rowCount,
      hasSelectedDateData: adPlanFactsForDate.length > 0,
    },
    after_sales: {
      status: result.sourceHealth.after_sales.status,
      rowCount: result.sourceHealth.after_sales.rowCount,
      hasSelectedDateData: hasDateInAfterSales(result, selectedDate),
    },
  };

  SOURCE_TYPES.forEach((sourceType) => {
    const health = result.sourceHealth[sourceType];
    availability[sourceType].status = health.status;
    availability[sourceType].rowCount = health.rowCount;
  });

  return availability;
};

const buildBusinessMetrics = (
  productFactsForDate: ProductDailyFact[],
): { metrics: TmallStoreMetric[]; productItems: TmallStoreProductItem[] } => {
  const hasData = productFactsForDate.length > 0;
  const productItems = groupProductFacts(productFactsForDate).map(toProductItem);
  const gmv = sum(productFactsForDate, (fact) => fact.gmv);
  const gsv = sum(productFactsForDate, (fact) => fact.gsv);
  const refundSuccessAmount = sum(productFactsForDate, (fact) => fact.refundSuccessAmount);
  const visitors = sum(productFactsForDate, (fact) => fact.visitors);
  const paidBuyers = sum(productFactsForDate, (fact) => fact.paidBuyers);
  const productCount = new Set(productFactsForDate.map((fact) => fact.productId)).size;

  return {
    productItems,
    metrics: [
      { key: "gmv", label: "GMV", value: toMetricValue(hasData, gmv), format: "currency", helper: "支付金额合计" },
      { key: "gsv", label: "GSV", value: toMetricValue(hasData, gsv), format: "currency", helper: "支付金额 - 成功退款金额" },
      { key: "refundSuccessAmount", label: "成功退款金额", value: toMetricValue(hasData, refundSuccessAmount), format: "currency", helper: "成功退款金额合计" },
      { key: "refundRate", label: "退款率", value: hasData ? safeDivide(refundSuccessAmount, gmv) : null, format: "rate", helper: "成功退款金额 ÷ GMV" },
      { key: "visitors", label: "商品访客数合计", value: toMetricValue(hasData, visitors), format: "integer", helper: "商品维度加总，不等于全店去重访客" },
      { key: "paidBuyers", label: "商品支付买家数合计", value: toMetricValue(hasData, paidBuyers), format: "integer", helper: "商品维度加总，不等于全店去重买家" },
      { key: "conversionRate", label: "支付转化率", value: hasData ? safeDivide(paidBuyers, visitors) : null, format: "rate", helper: "商品支付买家数合计 ÷ 商品访客数合计" },
      { key: "avgOrderValue", label: "客单价", value: hasData ? safeDivide(gmv, paidBuyers) : null, format: "currency", helper: "GMV ÷ 商品支付买家数合计" },
      { key: "productCount", label: "商品数", value: toMetricValue(hasData, productCount), format: "integer", helper: "当前日期商品 ID 去重数量" },
    ],
  };
};

const buildAdMetrics = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): { metrics: TmallStoreMetric[]; hasSelectedDatePlanAdData: boolean } => {
  const adPlanFactsForDate = selectedDate
    ? result.adPlanDailyFacts.filter((fact) => fact.date === selectedDate)
    : [];
  const hasData = adPlanFactsForDate.length > 0;
  const adSpend = sum(adPlanFactsForDate, (fact) => fact.adSpend);
  const transactionAmount = sum(adPlanFactsForDate, (fact) => fact.transactionAmount);
  const clicks = sum(adPlanFactsForDate, (fact) => fact.clicks);
  const impressions = sum(adPlanFactsForDate, (fact) => fact.impressions);
  const planCount = new Set(adPlanFactsForDate.map((fact) => fact.planId)).size;

  return {
    hasSelectedDatePlanAdData: hasData,
    metrics: [
      { key: "adSpend", label: "推广花费", value: toMetricValue(hasData, adSpend), format: "currency", helper: "计划推广报表花费合计" },
      { key: "transactionAmount", label: "推广成交金额", value: toMetricValue(hasData, transactionAmount), format: "currency", helper: "计划推广报表成交金额合计" },
      { key: "roi", label: "推广投入产出比", value: hasData ? safeDivide(transactionAmount, adSpend) : null, format: "roi", helper: "推广成交金额 ÷ 推广花费" },
      { key: "clicks", label: "推广点击量", value: toMetricValue(hasData, clicks), format: "integer", helper: "计划推广报表点击量合计" },
      { key: "avgClickCost", label: "平均点击花费", value: hasData ? safeDivide(adSpend, clicks) : null, format: "currency", helper: "推广花费 ÷ 推广点击量" },
      { key: "clickRate", label: "点击率", value: hasData ? safeDivide(clicks, impressions) : null, format: "rate", helper: "推广点击量 ÷ 展现量" },
      { key: "planCount", label: "计划数量", value: toMetricValue(hasData, planCount), format: "integer", helper: "当前日期计划 ID 去重数量" },
      { key: "planJoinRate", label: "计划关联成功率", value: hasData ? result.joinQuality.planJoinRate : null, format: "rate", helper: "商品推广报表计划 ID 与计划报表匹配率" },
    ],
  };
};

const buildAfterSalesMetrics = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): TmallStoreAfterSalesOverview => {
  const hasAfterSalesData =
    result.sourceHealth.after_sales.status === "parsed" &&
    (result.afterSalesAggregates.byApplyDate.length > 0 ||
      result.afterSalesAggregates.bySuccessDate.length > 0 ||
      result.afterSalesAggregates.productSummary.length > 0);
  const applyDate = selectedDate
    ? result.afterSalesAggregates.byApplyDate.find((item) => item.date === selectedDate)
    : null;
  const successDate = selectedDate
    ? result.afterSalesAggregates.bySuccessDate.find((item) => item.date === selectedDate)
    : null;
  const pendingCount = sum(result.afterSalesAggregates.productSummary, (item) => item.pendingCount);
  const overduePendingCount = sum(result.afterSalesAggregates.productSummary, (item) => item.overduePendingCount);
  const customerServiceInterventionCount = sum(
    result.afterSalesAggregates.productSummary,
    (item) => item.customerServiceInterventionCount,
  );

  return {
    hasAfterSalesData,
    dateRange: result.dateRanges.after_sales ?? emptyDateRange,
    selectedDateMetrics: {
      refundApplyCount: hasAfterSalesData ? applyDate?.refundApplyCount ?? 0 : null,
      refundApplyAmount: hasAfterSalesData ? applyDate?.refundApplyAmount ?? 0 : null,
      refundSuccessCount: hasAfterSalesData ? successDate?.refundSuccessCount ?? 0 : null,
      refundSuccessTotalAmount: hasAfterSalesData ? successDate?.refundSuccessTotalAmount ?? 0 : null,
    },
    rangeSummary: {
      refundOnlyCount: hasAfterSalesData ? sum(result.afterSalesAggregates.byApplyDate, (item) => item.refundOnlyCount) : null,
      returnRefundCount: hasAfterSalesData ? sum(result.afterSalesAggregates.byApplyDate, (item) => item.returnRefundCount) : null,
      pendingCount: hasAfterSalesData ? pendingCount : null,
      overduePendingCount: hasAfterSalesData ? overduePendingCount : null,
      customerServiceInterventionCount: hasAfterSalesData ? customerServiceInterventionCount : null,
      topReasons: hasAfterSalesData ? topItems(result.afterSalesAggregates.reasonDistribution, 5) : [],
      statusDistribution: hasAfterSalesData ? result.afterSalesAggregates.statusDistribution : [],
    },
  };
};

const buildProductRankings = (
  productItems: TmallStoreProductItem[],
  adProductFactsForDate: AdProductDailyFact[],
): TmallStoreProductRankings => {
  const adByProduct = groupAdProductFacts(adProductFactsForDate);
  const promotedProductCount = productItems.filter((item) => adByProduct.has(item.productId)).length;
  const productCount = productItems.length;
  const adSpendNoTransactionProducts = topItems(
    [...adByProduct.values()]
      .filter((item) => item.adSpend > 0 && item.adTransactionAmount === 0)
      .sort((first, second) => second.adSpend - first.adSpend),
  );

  return {
    gmvTopProducts: topItems([...productItems].sort((first, second) => second.gmv - first.gmv || second.visitors - first.visitors)),
    refundTopProducts: topItems(
      [...productItems]
        .filter((item) => item.refundSuccessAmount > 0)
        .sort((first, second) => second.refundSuccessAmount - first.refundSuccessAmount),
    ),
    noPaymentProducts: topItems(
      [...productItems]
        .filter((item) => item.visitors > 0 && item.paidBuyers === 0)
        .sort((first, second) => second.visitors - first.visitors),
    ),
    adSpendNoTransactionProducts,
    promotedProductCount,
    noAdProductCount: Math.max(productCount - promotedProductCount, 0),
    productCount,
  };
};

const buildReconciliationOverview = (
  reconciliation: TmallReconciliation | undefined,
): TmallStoreReconciliationOverview => {
  if (!reconciliation) {
    return {
      status: "missing",
      comparedDateRange: emptyDateRange,
      adSpendDifference: null,
      transactionAmountDifference: null,
      message: "当前本地保存结果缺少推广对账数据，重新上传并分析后会补齐。",
    };
  }

  if (reconciliation.reconciliationStatus === "different") {
    return {
      status: "different",
      comparedDateRange: reconciliation.comparedDateRange,
      adSpendDifference: reconciliation.adSpendDifference,
      transactionAmountDifference: reconciliation.transactionAmountDifference,
      message: "计划推广报表与商品推广报表存在金额口径差异，店铺推广总量当前采用计划推广报表。",
    };
  }

  if (reconciliation.reconciliationStatus === "missing_comparable_dates") {
    return {
      status: "missing_comparable_dates",
      comparedDateRange: reconciliation.comparedDateRange,
      adSpendDifference: reconciliation.adSpendDifference,
      transactionAmountDifference: reconciliation.transactionAmountDifference,
      message: "当前日期缺少可对比的商品推广或计划推广数据。",
    };
  }

  return {
    status: "matched",
    comparedDateRange: reconciliation.comparedDateRange,
    adSpendDifference: reconciliation.adSpendDifference,
    transactionAmountDifference: reconciliation.transactionAmountDifference,
    message: "推广对账一致。",
  };
};

export const buildTmallStoreBoardOverview = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): TmallStoreBoardOverview => {
  const availableDates = getTmallStoreBoardDates(result);
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const productFactsForDate = effectiveDate
    ? result.productDailyFacts.filter((fact) => fact.date === effectiveDate)
    : [];
  const adProductFactsForDate = effectiveDate
    ? result.adProductDailyFacts.filter((fact) => fact.date === effectiveDate)
    : [];
  const business = buildBusinessMetrics(productFactsForDate);
  const ad = buildAdMetrics(result, effectiveDate);
  const productRankings = buildProductRankings(business.productItems, adProductFactsForDate);
  const sourceAvailability = buildSourceAvailability(result, effectiveDate, productFactsForDate);

  return {
    selectedDate: effectiveDate,
    availableDates,
    analysisTimestamp: result.analysisTimestamp,
    sourceAvailability,
    businessMetrics: business.metrics,
    adMetrics: ad.metrics,
    afterSalesMetrics: buildAfterSalesMetrics(result, effectiveDate),
    productRankings,
    riskSummary: {
      noPaymentCount: productRankings.noPaymentProducts.length,
      adSpendNoTransactionCount: productRankings.adSpendNoTransactionProducts.length,
      refundProductCount: productRankings.refundTopProducts.length,
      dataQualityWarningCount: result.dataQualityWarnings.length,
    },
    joinQuality: result.joinQuality,
    reconciliation: result.reconciliation ?? null,
    reconciliationOverview: buildReconciliationOverview(result.reconciliation),
    sourceHealth: result.sourceHealth,
    dateRanges: result.dateRanges,
    dataQualityWarnings: result.dataQualityWarnings,
    missingBusinessData: result.productDailyFacts.length === 0,
    hasSelectedDateProducts: productFactsForDate.length > 0,
    hasSelectedDatePlanAdData: ad.hasSelectedDatePlanAdData,
  };
};
