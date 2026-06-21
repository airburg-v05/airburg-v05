import type {
  AdProductDailyFact,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
  TmallJoinQuality,
  TmallReconciliation,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";

export interface TmallHomeSourceAvailability {
  status: TmallSourceStatus;
  rowCount: number;
  hasSelectedDateData: boolean;
}

export interface TmallHomeMetrics {
  gmv: number | null;
  gsv: number | null;
  refundSuccessAmount: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  adSpend: number | null;
  adTransactionAmount: number | null;
  adRoi: number | null;
}

export interface TmallHomeProductRankingItem {
  productId: string;
  productName: string;
  gmv: number;
  gsv: number;
  refundSuccessAmount: number;
  visitors: number;
  paidBuyers: number;
  conversionRate: number | null;
  adSpend: number | null;
  adRoi: number | null;
  hasAdData: boolean;
}

export interface TmallHomeRiskProductItem {
  productId: string;
  productName: string;
  visitors: number;
  paidBuyers: number;
  refundSuccessAmount: number;
}

export interface TmallHomeRiskAdItem {
  productId: string;
  adSpend: number;
  adTransactionAmount: number;
}

export interface TmallHomeRisks {
  noPaymentProducts: TmallHomeRiskProductItem[];
  adSpendNoTransactionProducts: TmallHomeRiskAdItem[];
  refundProducts: TmallHomeRiskProductItem[];
  dataQualityWarningCount: number;
}

export interface TmallHomeOverview {
  selectedDate: string | null;
  availableDates: string[];
  analysisTimestamp: string;
  sourceAvailability: Record<TmallSourceType, TmallHomeSourceAvailability>;
  missingBusinessData: boolean;
  metrics: TmallHomeMetrics;
  productRanking: TmallHomeProductRankingItem[];
  risks: TmallHomeRisks;
  joinQuality: TmallJoinQuality;
  reconciliation?: TmallReconciliation;
  dataQualityWarnings: string[];
}

const SOURCE_TYPES: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const productLabel = (productId: string, productName: string | null): string =>
  productName?.trim() || `商品 ${productId}`;

const groupProductFacts = (facts: ProductDailyFact[]): TmallHomeProductRankingItem[] => {
  const grouped = new Map<string, TmallHomeProductRankingItem>();

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
        conversionRate: null,
        adSpend: null,
        adRoi: null,
        hasAdData: false,
      });
      return;
    }

    current.gmv += fact.gmv;
    current.gsv += fact.gsv;
    current.refundSuccessAmount += fact.refundSuccessAmount;
    current.visitors += fact.visitors;
    current.paidBuyers += fact.paidBuyers;
  });

  return [...grouped.values()].map((item) => ({
    ...item,
    conversionRate: safeDivide(item.paidBuyers, item.visitors),
  }));
};

const groupAdProductFacts = (facts: AdProductDailyFact[]): Map<string, { adSpend: number; adTransactionAmount: number }> => {
  const grouped = new Map<string, { adSpend: number; adTransactionAmount: number }>();

  facts.forEach((fact) => {
    const current = grouped.get(fact.productId) ?? { adSpend: 0, adTransactionAmount: 0 };
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

export const getTmallBusinessDates = (result: TmallAnalysisDisplayResult): string[] =>
  [...new Set(result.productDailyFacts.map((fact) => fact.date).filter(Boolean))].sort((first, second) =>
    second.localeCompare(first),
  );

export const buildTmallHomeOverview = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): TmallHomeOverview => {
  const availableDates = getTmallBusinessDates(result);
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
  const adPlanFactsForDate = effectiveDate
    ? result.adPlanDailyFacts.filter((fact) => fact.date === effectiveDate)
    : [];

  const businessGmv = sum(productFactsForDate, (fact) => fact.gmv);
  const businessGsv = sum(productFactsForDate, (fact) => fact.gsv);
  const refundSuccessAmount = sum(productFactsForDate, (fact) => fact.refundSuccessAmount);
  const visitors = sum(productFactsForDate, (fact) => fact.visitors);
  const paidBuyers = sum(productFactsForDate, (fact) => fact.paidBuyers);
  const adSpend = sum(adPlanFactsForDate, (fact) => fact.adSpend);
  const adTransactionAmount = sum(adPlanFactsForDate, (fact) => fact.transactionAmount);

  const hasBusinessData = productFactsForDate.length > 0;
  const hasPlanAdData = adPlanFactsForDate.length > 0;

  const adByProduct = groupAdProductFacts(adProductFactsForDate);
  const productRanking = groupProductFacts(productFactsForDate)
    .map((item) => {
      const adData = adByProduct.get(item.productId);
      if (!adData) return item;

      return {
        ...item,
        adSpend: adData.adSpend,
        adRoi: safeDivide(adData.adTransactionAmount, adData.adSpend),
        hasAdData: true,
      };
    })
    .sort((first, second) => {
      if (second.gmv !== first.gmv) return second.gmv - first.gmv;
      return second.visitors - first.visitors;
    })
    .slice(0, 5);

  const productRiskItems = groupProductFacts(productFactsForDate).map((item) => ({
    productId: item.productId,
    productName: item.productName,
    visitors: item.visitors,
    paidBuyers: item.paidBuyers,
    refundSuccessAmount: item.refundSuccessAmount,
  }));

  const adSpendNoTransactionProducts = [...adByProduct.entries()]
    .map(([productId, value]) => ({
      productId,
      adSpend: value.adSpend,
      adTransactionAmount: value.adTransactionAmount,
    }))
    .filter((item) => item.adSpend > 0 && item.adTransactionAmount === 0)
    .sort((first, second) => second.adSpend - first.adSpend)
    .slice(0, 5);

  const sourceAvailability: Record<TmallSourceType, TmallHomeSourceAvailability> = {
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
      hasSelectedDateData: hasDateInAfterSales(result, effectiveDate),
    },
  };

  SOURCE_TYPES.forEach((sourceType) => {
    const health = result.sourceHealth[sourceType];
    sourceAvailability[sourceType].status = health.status;
    sourceAvailability[sourceType].rowCount = health.rowCount;
  });

  return {
    selectedDate: effectiveDate,
    availableDates,
    analysisTimestamp: result.analysisTimestamp,
    sourceAvailability,
    missingBusinessData: result.productDailyFacts.length === 0,
    metrics: {
      gmv: hasBusinessData ? businessGmv : null,
      gsv: hasBusinessData ? businessGsv : null,
      refundSuccessAmount: hasBusinessData ? refundSuccessAmount : null,
      visitors: hasBusinessData ? visitors : null,
      paidBuyers: hasBusinessData ? paidBuyers : null,
      conversionRate: hasBusinessData ? safeDivide(paidBuyers, visitors) : null,
      adSpend: hasPlanAdData ? adSpend : null,
      adTransactionAmount: hasPlanAdData ? adTransactionAmount : null,
      adRoi: hasPlanAdData ? safeDivide(adTransactionAmount, adSpend) : null,
    },
    productRanking,
    risks: {
      noPaymentProducts: productRiskItems
        .filter((item) => item.visitors > 0 && item.paidBuyers === 0)
        .sort((first, second) => second.visitors - first.visitors)
        .slice(0, 5),
      adSpendNoTransactionProducts,
      refundProducts: productRiskItems
        .filter((item) => item.refundSuccessAmount > 0)
        .sort((first, second) => second.refundSuccessAmount - first.refundSuccessAmount)
        .slice(0, 5),
      dataQualityWarningCount: result.dataQualityWarnings.length,
    },
    joinQuality: result.joinQuality,
    reconciliation: result.reconciliation,
    dataQualityWarnings: result.dataQualityWarnings,
  };
};
