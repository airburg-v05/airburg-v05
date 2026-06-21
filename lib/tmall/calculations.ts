import type {
  AdPlanDailyFact,
  AdProductDailyFact,
  ProductDailyFact,
  TmallDateRange,
  TmallJoinQuality,
  TmallReconciliation,
} from "../../types/tmall";
import type { AdProductRecord } from "./parsers/ad-product-parser";
import { safeDivide } from "./normalizers";

export const getDateRange = (dates: Array<string | null>): TmallDateRange => {
  const validDates = dates.filter((date): date is string => !!date).sort();
  return {
    start: validDates[0] ?? null,
    end: validDates[validDates.length - 1] ?? null,
  };
};

const unique = (values: Array<string | null>): Set<string> =>
  new Set(values.filter((value): value is string => !!value));

export const calculateJoinQuality = (
  productFacts: ProductDailyFact[],
  adProductRecords: AdProductRecord[],
  adPlanFacts: AdPlanDailyFact[],
  afterSalesProductIds: string[],
): TmallJoinQuality => {
  const storeProductIds = unique(productFacts.map((fact) => fact.productId));
  const advertisedProductIds = unique(adProductRecords.map((record) => record.productId));
  const adProductPlanIds = unique(adProductRecords.map((record) => record.planId));
  const adPlanIds = unique(adPlanFacts.map((fact) => fact.planId));
  const afterSalesIds = unique(afterSalesProductIds);

  const joinedAdvertisedProductIds = [...advertisedProductIds].filter((productId) => storeProductIds.has(productId));
  const joinedPlanIds = [...adProductPlanIds].filter((planId) => adPlanIds.has(planId));
  const joinedAfterSalesIds = [...afterSalesIds].filter((productId) => storeProductIds.has(productId));

  return {
    advertisedProductJoinRate: safeDivide(joinedAdvertisedProductIds.length, advertisedProductIds.size),
    advertisedProductJoinedCount: joinedAdvertisedProductIds.length,
    advertisedProductCount: advertisedProductIds.size,
    storePromotionCoverage: safeDivide(joinedAdvertisedProductIds.length, storeProductIds.size),
    promotedProductCount: joinedAdvertisedProductIds.length,
    storeProductCount: storeProductIds.size,
    planJoinRate: safeDivide(joinedPlanIds.length, adProductPlanIds.size),
    joinedPlanCount: joinedPlanIds.length,
    adProductPlanCount: adProductPlanIds.size,
    afterSalesProductJoinRate: safeDivide(joinedAfterSalesIds.length, afterSalesIds.size),
    joinedAfterSalesProductCount: joinedAfterSalesIds.length,
    afterSalesProductCount: afterSalesIds.size,
  };
};

export const markProductsWithAdData = (
  productFacts: ProductDailyFact[],
  adProductFacts: AdProductDailyFact[],
): ProductDailyFact[] => {
  const adKeys = new Set(adProductFacts.map((fact) => `${fact.date}::${fact.productId}`));
  return productFacts.map((fact) => ({
    ...fact,
    hasAdData: adKeys.has(`${fact.date}::${fact.productId}`),
  }));
};

const sumByCommonDates = <TFact>(
  facts: TFact[],
  dates: Set<string>,
  getDate: (fact: TFact) => string,
  getAmount: (fact: TFact) => number,
): number =>
  facts.reduce((sum, fact) => {
    if (!dates.has(getDate(fact))) return sum;
    return sum + getAmount(fact);
  }, 0);

export const calculateReconciliation = (
  adProductFacts: AdProductDailyFact[],
  adPlanFacts: AdPlanDailyFact[],
): TmallReconciliation => {
  const productDates = unique(adProductFacts.map((fact) => fact.date));
  const planDates = unique(adPlanFacts.map((fact) => fact.date));
  const commonDates = new Set([...productDates].filter((date) => planDates.has(date)));
  const comparedDates = [...commonDates].sort();

  if (commonDates.size === 0) {
    return {
      comparedDateRange: { start: null, end: null },
      planAdSpend: 0,
      productAdSpend: 0,
      adSpendDifference: 0,
      planTransactionAmount: 0,
      productTransactionAmount: 0,
      transactionAmountDifference: 0,
      reconciliationStatus: "missing_comparable_dates",
    };
  }

  const planAdSpend = sumByCommonDates(adPlanFacts, commonDates, (fact) => fact.date, (fact) => fact.adSpend);
  const productAdSpend = sumByCommonDates(adProductFacts, commonDates, (fact) => fact.date, (fact) => fact.adSpend);
  const planTransactionAmount = sumByCommonDates(adPlanFacts, commonDates, (fact) => fact.date, (fact) => fact.transactionAmount);
  const productTransactionAmount = sumByCommonDates(
    adProductFacts,
    commonDates,
    (fact) => fact.date,
    (fact) => fact.adTransactionAmount,
  );
  const adSpendDifference = planAdSpend - productAdSpend;
  const transactionAmountDifference = planTransactionAmount - productTransactionAmount;

  return {
    comparedDateRange: {
      start: comparedDates[0] ?? null,
      end: comparedDates[comparedDates.length - 1] ?? null,
    },
    planAdSpend,
    productAdSpend,
    adSpendDifference,
    planTransactionAmount,
    productTransactionAmount,
    transactionAmountDifference,
    reconciliationStatus:
      Math.abs(adSpendDifference) < 0.0001 && Math.abs(transactionAmountDifference) < 0.0001
        ? "matched"
        : "different",
  };
};

