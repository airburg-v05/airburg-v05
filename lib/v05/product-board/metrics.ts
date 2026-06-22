import type {
  OwnedAdProductFact,
  OwnedAfterSalesDistributionItem,
  OwnedAfterSalesOperationalSnapshot,
  OwnedAfterSalesRangeAggregate,
  OwnedBusinessProductFact,
  PlatformCode,
  V2Dataset,
} from "../domain/models";
import {
  buildMetricCards,
  buildTrendPoints,
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
  safeNumber,
  safeSum,
} from "../home-command-center";
import type { HomeCommandCenterDatePoint } from "../home-command-center";
import type {
  ProductBoardAdSummary,
  ProductBoardAfterSalesSummary,
  ProductBoardDateRangeState,
  ProductBoardMetric,
} from "./contracts";
import { isDateInRange, sortBusinessDatesDesc } from "./date-range";

export {
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  safeDivide,
  safeNumber,
  safeSum,
};

export interface ProductMetricAggregate {
  hasBusinessData: boolean;
  hasAdData: boolean;
  gmv: number;
  gsv: number;
  refundSuccessAmount: number;
  visitors: number;
  paidBuyers: number;
  conversionRate: number | null;
  adSpend: number | null;
  adSalesAmount: number | null;
  adRoi: number | null;
}

export const aggregateProductMetrics = ({
  businessFacts,
  adProductFacts,
}: {
  businessFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
}): ProductMetricAggregate => {
  const hasBusinessData = businessFacts.length > 0;
  const hasAdData = adProductFacts.length > 0;
  const gmv = safeSum(businessFacts, (fact) => fact.gmv);
  const gsv = safeSum(businessFacts, (fact) => fact.gsv);
  const visitors = safeSum(businessFacts, (fact) => fact.visitors);
  const paidBuyers = safeSum(businessFacts, (fact) => fact.paidBuyers);
  const adSpend = hasAdData ? safeSum(adProductFacts, (fact) => fact.adSpend) : null;
  const adSalesAmount = hasAdData ? safeSum(adProductFacts, (fact) => fact.adSalesAmount) : null;

  return {
    hasBusinessData,
    hasAdData,
    gmv,
    gsv,
    refundSuccessAmount: safeSum(businessFacts, (fact) => {
      const value = (safeNumber(fact.gmv) ?? 0) - (safeNumber(fact.gsv) ?? 0);
      return value > 0 ? value : 0;
    }),
    visitors,
    paidBuyers,
    conversionRate: hasBusinessData ? safeDivide(paidBuyers, visitors) : null,
    adSpend,
    adSalesAmount,
    adRoi: hasAdData ? safeDivide(adSalesAmount, adSpend) : null,
  };
};

export const buildProductMetricCards = (aggregate: ProductMetricAggregate): ProductBoardMetric[] =>
  buildMetricCards({
    hasBusinessData: aggregate.hasBusinessData,
    hasAdPlanData: aggregate.hasAdData,
    gmv: aggregate.gmv,
    gsv: aggregate.gsv,
    refundSuccessAmount: aggregate.refundSuccessAmount,
    visitors: aggregate.visitors,
    paidBuyers: aggregate.paidBuyers,
    conversionRate: aggregate.conversionRate,
    adSpend: aggregate.adSpend,
    adSalesAmount: aggregate.adSalesAmount,
    adRoi: aggregate.adRoi,
  }).map((card) =>
    card.key === "ad"
      ? { ...card, helper: `ROI ${formatRoi(aggregate.adRoi)}，仅使用商品推广口径。` }
      : card,
  );

export const filterV2ProductBusinessFacts = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): OwnedBusinessProductFact[] =>
  dataset.businessProductFacts.filter(
    (fact) =>
      fact.platformCode === platformCode &&
      fact.storeId === storeId &&
      fact.productId === productId &&
      isDateInRange(fact.businessDate, range),
  );

export const filterV2ProductAdFacts = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): OwnedAdProductFact[] =>
  dataset.adProductFacts.filter(
    (fact) =>
      fact.platformCode === platformCode &&
      fact.storeId === storeId &&
      fact.productId === productId &&
      isDateInRange(fact.businessDate, range),
  );

const rangeOverlaps = (
  item: { dateRange: { start: string; end: string } },
  range: ProductBoardDateRangeState,
): boolean =>
  range.valid && !!range.start && !!range.end && item.dateRange.end >= range.start && item.dateRange.start <= range.end;

export const filterV2ProductAfterSalesRangeAggregates = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): OwnedAfterSalesRangeAggregate[] =>
  dataset.afterSalesRangeAggregates.filter(
    (item) =>
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.productId === productId &&
      rangeOverlaps(item, range),
  );

export const filterV2ProductAfterSalesSnapshots = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): OwnedAfterSalesOperationalSnapshot[] =>
  dataset.afterSalesOperationalSnapshots.filter(
    (item) =>
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.productId === productId &&
      rangeOverlaps(item, range),
  );

export const filterV2ProductAfterSalesDistributionItems = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): OwnedAfterSalesDistributionItem[] =>
  dataset.afterSalesDistributionItems.filter(
    (item) =>
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.productId === productId &&
      rangeOverlaps(item, range),
  );

export const buildProductAdSummary = (adProductFacts: OwnedAdProductFact[]): ProductBoardAdSummary => {
  const hasAdData = adProductFacts.length > 0;
  const adSpend = hasAdData ? safeSum(adProductFacts, (fact) => fact.adSpend) : null;
  const adSalesAmount = hasAdData ? safeSum(adProductFacts, (fact) => fact.adSalesAmount) : null;
  const impressions = hasAdData ? safeSum(adProductFacts, (fact) => fact.impressions) : null;
  const clicks = hasAdData ? safeSum(adProductFacts, (fact) => fact.clicks) : null;
  return {
    hasAdData,
    adSpend,
    adSalesAmount,
    adRoi: hasAdData ? safeDivide(adSalesAmount, adSpend) : null,
    impressions,
    clicks,
    clickRate: hasAdData ? safeDivide(clicks, impressions) : null,
  };
};

export const buildProductAfterSalesSummary = ({
  rangeAggregates,
  snapshots,
  distributionItems,
}: {
  rangeAggregates: OwnedAfterSalesRangeAggregate[];
  snapshots: OwnedAfterSalesOperationalSnapshot[];
  distributionItems: OwnedAfterSalesDistributionItem[];
}): ProductBoardAfterSalesSummary => {
  const hasAfterSalesData =
    rangeAggregates.length > 0 ||
    snapshots.length > 0 ||
    distributionItems.length > 0;
  return {
    hasAfterSalesData,
    refundAmount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.refundAmount) : null,
    refundOrderCount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.refundOrderCount) : null,
    afterSalesApplyCount: hasAfterSalesData ? safeSum(rangeAggregates, (item) => item.afterSalesApplyCount) : null,
    pendingCount: snapshots.length > 0 ? safeSum(snapshots, (item) => item.pendingCount) : null,
    distributionCount: distributionItems.length,
  };
};

const dayRange = (range: ProductBoardDateRangeState, date: string): ProductBoardDateRangeState => ({
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

export const buildV2ProductTrendPoints = ({
  dataset,
  range,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  range: ProductBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): HomeCommandCenterDatePoint[] => {
  const dates = sortBusinessDatesDesc([
    ...filterV2ProductBusinessFacts({ dataset, range, platformCode, storeId, productId }).map((fact) => fact.businessDate),
    ...filterV2ProductAdFacts({ dataset, range, platformCode, storeId, productId }).map((fact) => fact.businessDate),
  ]).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const currentRange = dayRange(range, date);
      const daily = aggregateProductMetrics({
        businessFacts: filterV2ProductBusinessFacts({ dataset, range: currentRange, platformCode, storeId, productId }),
        adProductFacts: filterV2ProductAdFacts({ dataset, range: currentRange, platformCode, storeId, productId }),
      });
      return {
        date,
        gmv: daily.hasBusinessData ? daily.gmv : null,
        gsv: daily.hasBusinessData ? daily.gsv : null,
        visitors: daily.hasBusinessData ? daily.visitors : null,
        paidBuyers: daily.hasBusinessData ? daily.paidBuyers : null,
        conversionRate: daily.conversionRate,
        adSpend: daily.adSpend,
      };
    }),
  );
};
