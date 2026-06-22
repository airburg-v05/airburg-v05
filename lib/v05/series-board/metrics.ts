import type {
  OwnedAdProductFact,
  OwnedBusinessProductFact,
  OwnedAfterSalesRangeAggregate,
  PlatformCode,
  V2Dataset,
} from "../domain/models";
import type { ProductDailyFact, TmallStoredAnalysisResult } from "../../../types/tmall";
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
  SeriesBoardDateRangeState,
  SeriesBoardMetric,
  SeriesBoardProductRow,
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

export interface SeriesMetricAggregate {
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

export const aggregateSeriesMetrics = ({
  businessFacts,
  adProductFacts,
}: {
  businessFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
}): SeriesMetricAggregate => {
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

export const buildSeriesMetricCards = (aggregate: SeriesMetricAggregate): SeriesBoardMetric[] =>
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

export const filterV2SeriesBusinessFacts = ({
  dataset,
  range,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  range: SeriesBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productIds: readonly string[];
}): OwnedBusinessProductFact[] => {
  const productSet = new Set(productIds);
  return dataset.businessProductFacts.filter(
    (fact) =>
      fact.platformCode === platformCode &&
      fact.storeId === storeId &&
      productSet.has(fact.productId) &&
      isDateInRange(fact.businessDate, range),
  );
};

export const filterV2SeriesAdProductFacts = ({
  dataset,
  range,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  range: SeriesBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productIds: readonly string[];
}): OwnedAdProductFact[] => {
  const productSet = new Set(productIds);
  return dataset.adProductFacts.filter(
    (fact) =>
      fact.platformCode === platformCode &&
      fact.storeId === storeId &&
      productSet.has(fact.productId) &&
      isDateInRange(fact.businessDate, range),
  );
};

export const filterV2SeriesAfterSalesRangeAggregates = ({
  dataset,
  range,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  range: SeriesBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productIds: readonly string[];
}): OwnedAfterSalesRangeAggregate[] => {
  const productSet = new Set(productIds);
  const overlaps = (item: OwnedAfterSalesRangeAggregate) =>
    range.valid && !!range.start && !!range.end && item.dateRange.end >= range.start && item.dateRange.start <= range.end;
  return dataset.afterSalesRangeAggregates.filter(
    (item) =>
      item.platformCode === platformCode &&
      item.storeId === storeId &&
      item.productId !== null &&
      productSet.has(item.productId) &&
      overlaps(item),
  );
};

const productNameFromBusiness = (facts: readonly OwnedBusinessProductFact[], productId: string): string | null =>
  facts.find((fact) => fact.productId === productId)?.productName?.trim() || null;

export const buildV2SeriesProductRows = ({
  dataset,
  range,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  range: SeriesBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productIds: readonly string[];
}): SeriesBoardProductRow[] => {
  const scopedBusinessAll = dataset.businessProductFacts.filter(
    (fact) => fact.platformCode === platformCode && fact.storeId === storeId,
  );
  const businessFacts = filterV2SeriesBusinessFacts({ dataset, range, platformCode, storeId, productIds });
  const adProductFacts = filterV2SeriesAdProductFacts({ dataset, range, platformCode, storeId, productIds });
  const afterSales = filterV2SeriesAfterSalesRangeAggregates({ dataset, range, platformCode, storeId, productIds });

  return [...new Set(productIds)]
    .map((productId) => {
      const productBusiness = businessFacts.filter((fact) => fact.productId === productId);
      const productAds = adProductFacts.filter((fact) => fact.productId === productId);
      const productAfterSales = afterSales.filter((item) => item.productId === productId);
      const visitors = productBusiness.length > 0 ? safeSum(productBusiness, (fact) => fact.visitors) : null;
      const paidBuyers = productBusiness.length > 0 ? safeSum(productBusiness, (fact) => fact.paidBuyers) : null;
      const gmv = productBusiness.length > 0 ? safeSum(productBusiness, (fact) => fact.gmv) : null;
      const gsv = productBusiness.length > 0 ? safeSum(productBusiness, (fact) => fact.gsv) : null;
      const adSpend = productAds.length > 0 ? safeSum(productAds, (fact) => fact.adSpend) : null;
      const adSalesAmount = productAds.length > 0 ? safeSum(productAds, (fact) => fact.adSalesAmount) : null;
      return {
        productId,
        productName: productNameFromBusiness(scopedBusinessAll, productId) ?? productId,
        dataStatus:
          productBusiness.length > 0
            ? "business"
            : productAds.length > 0
              ? "ad_only"
              : "no_range_data",
        gmv,
        gsv,
        visitors,
        paidBuyers,
        conversionRate: safeDivide(paidBuyers, visitors),
        hasAdData: productAds.length > 0,
        adSpend,
        adRoi: productAds.length > 0 ? safeDivide(adSalesAmount, adSpend) : null,
        refundAmount: productAfterSales.length > 0 ? safeSum(productAfterSales, (item) => item.refundAmount) : null,
        productBoardHref:
          platformCode === "tmall" && storeId === "tmall-default-store"
            ? `/product-board?${new URLSearchParams({ platform: platformCode, storeId, productId }).toString()}`
            : null,
        fallbackHref: `/product-board/tracked?${new URLSearchParams({ platform: platformCode, storeId }).toString()}`,
      } satisfies SeriesBoardProductRow;
    })
    .sort((left, right) => {
      const leftGmv = left.gmv ?? Number.NEGATIVE_INFINITY;
      const rightGmv = right.gmv ?? Number.NEGATIVE_INFINITY;
      if (leftGmv !== rightGmv) return rightGmv - leftGmv;
      return left.productName.localeCompare(right.productName, "zh-CN") || left.productId.localeCompare(right.productId);
    });
};

const dayRange = (range: SeriesBoardDateRangeState, date: string): SeriesBoardDateRangeState => ({
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

export const buildV2SeriesTrendPoints = ({
  dataset,
  range,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  range: SeriesBoardDateRangeState;
  platformCode: PlatformCode;
  storeId: string;
  productIds: readonly string[];
}): HomeCommandCenterDatePoint[] => {
  const dates = sortBusinessDatesDesc([
    ...filterV2SeriesBusinessFacts({ dataset, range, platformCode, storeId, productIds }).map((fact) => fact.businessDate),
    ...filterV2SeriesAdProductFacts({ dataset, range, platformCode, storeId, productIds }).map((fact) => fact.businessDate),
  ]).reverse();

  return buildTrendPoints(
    dates.map((date) => {
      const currentRange = dayRange(range, date);
      const metrics = aggregateSeriesMetrics({
        businessFacts: filterV2SeriesBusinessFacts({ dataset, range: currentRange, platformCode, storeId, productIds }),
        adProductFacts: filterV2SeriesAdProductFacts({ dataset, range: currentRange, platformCode, storeId, productIds }),
      });
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

export const filterLegacySeriesBusinessFacts = ({
  analysis,
  range,
  productIds,
}: {
  analysis: TmallStoredAnalysisResult;
  range: SeriesBoardDateRangeState;
  productIds: readonly string[];
}): ProductDailyFact[] => {
  const productSet = new Set(productIds);
  return analysis.productDailyFacts.filter(
    (fact) => productSet.has(String(fact.productId)) && isDateInRange(fact.date, range),
  );
};
