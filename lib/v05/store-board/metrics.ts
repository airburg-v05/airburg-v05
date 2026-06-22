import type {
  OwnedAdPlanFact,
  OwnedAdProductFact,
  OwnedBusinessProductFact,
  V2Dataset,
} from "../domain/models";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import {
  aggregateLegacyMetrics,
  aggregateV2Metrics,
  buildMetricCards,
  buildTrendPoints,
  filterLegacyAdPlanFacts,
  filterLegacyBusinessFacts,
  filterV2AdPlanFacts,
  filterV2BusinessFacts,
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
  safeNumber,
  safeSum,
} from "../home-command-center";
import type {
  HomeCommandCenterDatePoint,
} from "../home-command-center";
import { isDateInRange, sortBusinessDatesDesc } from "../home-command-center";
import type {
  StoreBoardAdSummary,
  StoreBoardAfterSalesSummary,
  StoreBoardDateRangeState,
  StoreBoardMetric,
  StoreBoardProductRankItem,
} from "./contracts";
import { storeKey } from "./store-context";

export {
  aggregateLegacyMetrics,
  aggregateV2Metrics,
  buildMetricCards,
  filterLegacyAdPlanFacts,
  filterLegacyBusinessFacts,
  filterV2AdPlanFacts,
  filterV2BusinessFacts,
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
  safeNumber,
  safeSum,
};

export const buildStoreMetricCards = (
  aggregate: ReturnType<typeof aggregateV2Metrics>,
): StoreBoardMetric[] => buildMetricCards(aggregate);

const dayRange = (range: StoreBoardDateRangeState, date: string): StoreBoardDateRangeState => ({
  ...range,
  selectedDate: date,
  start: date,
  end: date,
  naturalDayCount: 1,
  dataDayCount: 1,
  valid: true,
  error: null,
  coverageText: "单日数据。",
});

export const buildV2StoreTrendPoints = ({
  dataset,
  range,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  range: StoreBoardDateRangeState;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
}): HomeCommandCenterDatePoint[] => {
  const currentStoreKey = `${platformCode}:${storeId}`;
  const dates = sortBusinessDatesDesc(
    dataset.businessProductFacts
      .filter((fact) => fact.platformCode === platformCode && fact.storeId === storeId)
      .map((fact) => fact.businessDate)
      .filter((date) => isDateInRange(date, range)),
  ).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const businessFacts = filterV2BusinessFacts({
        dataset,
        range: dayRange(range, date),
        platformFilter: platformCode,
        storeFilter: currentStoreKey,
      });
      const adPlanFacts = filterV2AdPlanFacts({
        dataset,
        range: dayRange(range, date),
        platformFilter: platformCode,
        storeFilter: currentStoreKey,
      });
      const metrics = aggregateV2Metrics({ businessFacts, adPlanFacts });
      return {
        date,
        gmv: metrics.hasBusinessData ? metrics.gmv : null,
        gsv: metrics.hasBusinessData ? metrics.gsv : null,
        visitors: metrics.hasBusinessData ? metrics.visitors : null,
        paidBuyers: metrics.hasBusinessData ? metrics.paidBuyers : null,
        conversionRate: metrics.conversionRate,
        adSpend: metrics.adSpend,
      };
    }),
  );
};

export const buildLegacyStoreTrendPoints = ({
  analysis,
  range,
}: {
  analysis: TmallStoredAnalysisResult;
  range: StoreBoardDateRangeState;
}): HomeCommandCenterDatePoint[] => {
  const dates = sortBusinessDatesDesc(
    analysis.productDailyFacts
      .map((fact) => fact.date)
      .filter((date) => isDateInRange(date, range)),
  ).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const currentRange = dayRange(range, date);
      const productFacts = filterLegacyBusinessFacts({ analysis, range: currentRange });
      const adPlanFacts = filterLegacyAdPlanFacts({ analysis, range: currentRange });
      const metrics = aggregateLegacyMetrics({ productFacts, adPlanFacts });
      return {
        date,
        gmv: metrics.hasBusinessData ? metrics.gmv : null,
        gsv: metrics.hasBusinessData ? metrics.gsv : null,
        visitors: metrics.hasBusinessData ? metrics.visitors : null,
        paidBuyers: metrics.hasBusinessData ? metrics.paidBuyers : null,
        conversionRate: metrics.conversionRate,
        adSpend: metrics.adSpend,
      };
    }),
  );
};

const productNameOf = (facts: OwnedBusinessProductFact[], productId: string): string =>
  facts.find((fact) => fact.productId === productId)?.productName?.trim() || productId;

const aggregateAdProductFacts = (facts: OwnedAdProductFact[]): {
  hasAdData: boolean;
  adSpend: number | null;
  adSalesAmount: number | null;
  adRoi: number | null;
} => {
  if (facts.length === 0) return { hasAdData: false, adSpend: null, adSalesAmount: null, adRoi: null };
  const adSpend = safeSum(facts, (fact) => fact.adSpend);
  const adSalesAmount = safeSum(facts, (fact) => fact.adSalesAmount);
  return {
    hasAdData: true,
    adSpend,
    adSalesAmount,
    adRoi: safeDivide(adSalesAmount, adSpend),
  };
};

export const buildV2ProductTop = ({
  businessFacts,
  adProductFacts,
  maxItems = 5,
}: {
  businessFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
  maxItems?: number;
}): StoreBoardProductRankItem[] => {
  const grouped = new Map<string, OwnedBusinessProductFact[]>();
  businessFacts.forEach((fact) => {
    const items = grouped.get(fact.productId) ?? [];
    items.push(fact);
    grouped.set(fact.productId, items);
  });

  return [...grouped.entries()]
    .map(([productId, facts]) => {
      const visitors = safeSum(facts, (fact) => fact.visitors);
      const paidBuyers = safeSum(facts, (fact) => fact.paidBuyers);
      const ad = aggregateAdProductFacts(adProductFacts.filter((fact) => fact.productId === productId));
      return {
        productId,
        productName: productNameOf(facts, productId),
        gmv: safeSum(facts, (fact) => fact.gmv),
        gsv: safeSum(facts, (fact) => fact.gsv),
        visitors,
        paidBuyers,
        conversionRate: safeDivide(paidBuyers, visitors),
        hasAdData: ad.hasAdData,
        adSpend: ad.adSpend,
        adRoi: ad.adRoi,
      };
    })
    .sort((left, right) => {
      const diff = (right.gmv ?? Number.NEGATIVE_INFINITY) - (left.gmv ?? Number.NEGATIVE_INFINITY);
      if (diff !== 0) return diff;
      return left.productName.localeCompare(right.productName, "zh-CN") || left.productId.localeCompare(right.productId);
    })
    .slice(0, maxItems);
};

export const buildLegacyProductTop = ({
  analysis,
  range,
  maxItems = 5,
}: {
  analysis: TmallStoredAnalysisResult;
  range: StoreBoardDateRangeState;
  maxItems?: number;
}): StoreBoardProductRankItem[] => {
  const businessFacts = filterLegacyBusinessFacts({ analysis, range });
  const adFacts = analysis.adProductDailyFacts.filter((fact) => isDateInRange(fact.date, range));
  return businessFacts
    .map((fact) => {
      const productAdFacts = adFacts.filter((item) => item.productId === fact.productId);
      const hasAdData = productAdFacts.length > 0;
      const adSpend = hasAdData ? safeSum(productAdFacts, (item) => item.adSpend) : null;
      const adSalesAmount = hasAdData ? safeSum(productAdFacts, (item) => item.adTransactionAmount) : null;
      return {
        productId: fact.productId,
        productName: fact.productName?.trim() || fact.productId,
        gmv: safeNumber(fact.gmv),
        gsv: safeNumber(fact.gsv),
        visitors: safeNumber(fact.visitors),
        paidBuyers: safeNumber(fact.paidBuyers),
        conversionRate: safeDivide(safeNumber(fact.paidBuyers), safeNumber(fact.visitors)),
        hasAdData,
        adSpend,
        adRoi: hasAdData ? safeDivide(adSalesAmount, adSpend) : null,
      };
    })
    .sort((left, right) => {
      const diff = (right.gmv ?? Number.NEGATIVE_INFINITY) - (left.gmv ?? Number.NEGATIVE_INFINITY);
      if (diff !== 0) return diff;
      return left.productName.localeCompare(right.productName, "zh-CN") || left.productId.localeCompare(right.productId);
    })
    .slice(0, maxItems);
};

export const buildAdSummary = (adPlanFacts: OwnedAdPlanFact[]): StoreBoardAdSummary => {
  const hasAdData = adPlanFacts.length > 0;
  const adSpend = hasAdData ? safeSum(adPlanFacts, (fact) => fact.adSpend) : null;
  const adSalesAmount = hasAdData ? safeSum(adPlanFacts, (fact) => fact.adSalesAmount) : null;
  return {
    hasAdData,
    adSpend,
    adSalesAmount,
    adRoi: hasAdData ? safeDivide(adSalesAmount, adSpend) : null,
    planCount: new Set(adPlanFacts.map((fact) => fact.planId)).size,
  };
};

export const buildAfterSalesSummary = ({
  dataset,
  range,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  range: StoreBoardDateRangeState;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
}): StoreBoardAfterSalesSummary => {
  const inStore = <T extends { platformCode: string; storeId: string }>(item: T) =>
    item.platformCode === platformCode && item.storeId === storeId;
  const rangeMatches = (item: { dateRange: { start: string; end: string } }) =>
    range.valid && !!range.start && !!range.end && item.dateRange.end >= range.start && item.dateRange.start <= range.end;
  const rangeAggregates = dataset.afterSalesRangeAggregates.filter((item) => inStore(item) && rangeMatches(item));
  const snapshots = dataset.afterSalesOperationalSnapshots.filter((item) => inStore(item) && rangeMatches(item));
  const distributionItems = dataset.afterSalesDistributionItems.filter((item) => inStore(item) && rangeMatches(item));
  const hasAfterSalesData = rangeAggregates.length > 0 || snapshots.length > 0 || distributionItems.length > 0;
  return {
    hasAfterSalesData,
    refundAmount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.refundAmount) : null,
    refundOrderCount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.refundOrderCount) : null,
    afterSalesApplyCount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.afterSalesApplyCount) : null,
    pendingCount: snapshots.length > 0 ? safeSum(snapshots, (item) => item.pendingCount) : null,
    distributionCount: distributionItems.length,
  };
};

export const buildLegacyAfterSalesSummary = ({
  analysis,
}: {
  analysis: TmallStoredAnalysisResult;
  range: StoreBoardDateRangeState;
}): StoreBoardAfterSalesSummary => {
  const aggregates = analysis.afterSalesAggregates;
  const hasAfterSalesData =
    aggregates.byApplyDate.length > 0 ||
    aggregates.bySuccessDate.length > 0 ||
    aggregates.productSummary.length > 0;
  return {
    hasAfterSalesData,
    refundAmount: hasAfterSalesData ? safeSum(aggregates.bySuccessDate, (item) => item.refundSuccessTotalAmount) : null,
    refundOrderCount: hasAfterSalesData ? safeSum(aggregates.bySuccessDate, (item) => item.refundSuccessCount) : null,
    afterSalesApplyCount: hasAfterSalesData ? safeSum(aggregates.byApplyDate, (item) => item.refundApplyCount) : null,
    pendingCount: hasAfterSalesData ? safeSum(aggregates.productSummary, (item) => item.pendingCount) : null,
    distributionCount: aggregates.reasonDistribution.length + aggregates.statusDistribution.length + aggregates.unknownStatus.length,
  };
};

export const filterV2AdProductFacts = ({
  dataset,
  range,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  range: StoreBoardDateRangeState;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
}): OwnedAdProductFact[] =>
  dataset.adProductFacts.filter(
    (fact) =>
      fact.platformCode === platformCode &&
      fact.storeId === storeId &&
      isDateInRange(fact.businessDate, range),
  );

export const storeFilterFor = (platformCode: string, storeId: string): string =>
  storeKey({ platformCode: platformCode as never, storeId });
