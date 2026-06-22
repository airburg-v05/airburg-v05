import type {
  OwnedAdPlanFact,
  OwnedBusinessProductFact,
  SeriesRecord,
  TargetRecord,
} from "../domain/models";
import {
  aggregateV2Metrics,
  safeDivide,
  safeSum,
} from "../home-command-center";
import type {
  StoreBoardDateRangeState,
  StoreBoardPeriod,
  StoreBoardSeriesProgressItem,
} from "./contracts";
import { buildV2StoreTargetProgress } from "./targets";

const seriesMetrics = ({
  series,
  businessFacts,
}: {
  series: SeriesRecord;
  businessFacts: OwnedBusinessProductFact[];
}): Pick<StoreBoardSeriesProgressItem, "gmv" | "gsv" | "visitors" | "paidBuyers" | "conversionRate"> => {
  const productSet = new Set(series.productIds);
  const facts = businessFacts.filter((fact) => productSet.has(fact.productId));
  if (facts.length === 0) {
    return { gmv: null, gsv: null, visitors: null, paidBuyers: null, conversionRate: null };
  }
  const visitors = safeSum(facts, (fact) => fact.visitors);
  const paidBuyers = safeSum(facts, (fact) => fact.paidBuyers);
  return {
    gmv: safeSum(facts, (fact) => fact.gmv),
    gsv: safeSum(facts, (fact) => fact.gsv),
    visitors,
    paidBuyers,
    conversionRate: safeDivide(paidBuyers, visitors),
  };
};

const seriesTargetProgress = ({
  series,
  targets,
  businessFacts,
  adPlanFacts,
  selectedPeriod,
  range,
}: {
  series: SeriesRecord;
  targets: TargetRecord[];
  businessFacts: OwnedBusinessProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  selectedPeriod: StoreBoardPeriod;
  range: StoreBoardDateRangeState;
}): number | null => {
  const productSet = new Set(series.productIds);
  const scopedBusiness = businessFacts.filter((fact) => productSet.has(fact.productId));
  const scopedAdPlan = adPlanFacts;
  const target = targets.find(
    (item) =>
      item.status === "active" &&
      item.scope === "series" &&
      item.platformCode === series.platformCode &&
      item.storeId === series.storeId &&
      item.seriesId === series.seriesId,
  );
  if (!target) return null;
  const proxy = buildV2StoreTargetProgress({
    targets: [{
      ...target,
      scope: "store",
      storeId: series.storeId,
      platformCode: series.platformCode,
    }],
    businessFacts: scopedBusiness,
    adPlanFacts: scopedAdPlan,
    selectedPeriod,
    range,
    platformCode: series.platformCode,
    storeId: series.storeId,
    maxItems: 1,
  });
  return proxy[0]?.progressRate ?? null;
};

export const buildV2StoreSeriesProgress = ({
  series,
  businessFacts,
  adPlanFacts,
  targets,
  selectedPeriod,
  range,
  maxItems = 5,
}: {
  series: SeriesRecord[];
  businessFacts: OwnedBusinessProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  targets: TargetRecord[];
  selectedPeriod: StoreBoardPeriod;
  range: StoreBoardDateRangeState;
  maxItems?: number;
}): StoreBoardSeriesProgressItem[] =>
  series
    .filter((item) => item.status === "active")
    .map((item) => {
      const metrics = seriesMetrics({ series: item, businessFacts });
      return {
        seriesId: item.seriesId,
        name: item.name,
        productCount: item.productIds.length,
        ...metrics,
        targetProgressRate: seriesTargetProgress({
          series: item,
          targets,
          businessFacts,
          adPlanFacts,
          selectedPeriod,
          range,
        }),
      };
    })
    .sort((left, right) => {
      const diff = (right.gmv ?? Number.NEGATIVE_INFINITY) - (left.gmv ?? Number.NEGATIVE_INFINITY);
      if (diff !== 0) return diff;
      return left.name.localeCompare(right.name, "zh-CN") || left.seriesId.localeCompare(right.seriesId);
    })
    .slice(0, maxItems);

export const hasSeriesBusinessData = (item: StoreBoardSeriesProgressItem): boolean =>
  aggregateV2Metrics({
    businessFacts: item.gmv === null ? [] : [{
      schemaVersion: "airburg_storage_v2",
      platformCode: "tmall",
      storeId: "placeholder",
      businessDate: "2026-01-01",
      sourceType: "business_product",
      importBatchId: "placeholder",
      productId: "placeholder",
      productName: null,
      gmv: item.gmv,
      gsv: item.gsv,
      visitors: item.visitors,
      paidBuyers: item.paidBuyers,
      paidOrders: null,
      conversionRate: item.conversionRate,
      avgOrderValue: null,
      favorites: null,
      cartAdditions: null,
    }],
    adPlanFacts: [],
  }).hasBusinessData;
