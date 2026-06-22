import type {
  OwnedAdPlanFact,
  OwnedBusinessProductFact,
  PlatformCode,
  StoreRecord,
  V2Dataset,
} from "../domain/models";
import type {
  AdPlanDailyFact,
  ProductDailyFact,
  TmallStoredAnalysisResult,
} from "../../../types/tmall";
import type {
  HomeCommandCenterDatePoint,
  HomeCommandCenterMetric,
  HomeCommandCenterMetricKey,
} from "./contracts";
import { isDateInRange, sortBusinessDatesDesc } from "./date-range";
import type { HomeCommandCenterDateRangeState } from "./contracts";

export interface MetricAggregate {
  hasBusinessData: boolean;
  hasAdPlanData: boolean;
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

export interface StoreScopedFacts {
  businessFacts: OwnedBusinessProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
}

export const formatMoney = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

export const formatDecimalMoney = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

export const formatInteger = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);

export const formatPercent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${(value * 100).toFixed(2)}%`;

export const formatRoi = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(2)} 倍`;

export const safeNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const safeSum = <TItem>(items: readonly TItem[], getValue: (item: TItem) => number | null | undefined): number =>
  items.reduce((total, item) => total + (safeNumber(getValue(item)) ?? 0), 0);

export const safeDivide = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const productRefundSuccessAmount = (gmv: number | null, gsv: number | null): number => {
  if (gmv === null || gsv === null) return 0;
  const value = gmv - gsv;
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const aggregateV2Metrics = ({
  businessFacts,
  adPlanFacts,
}: StoreScopedFacts): MetricAggregate => {
  const hasBusinessData = businessFacts.length > 0;
  const hasAdPlanData = adPlanFacts.length > 0;
  const gmv = safeSum(businessFacts, (fact) => fact.gmv);
  const gsv = safeSum(businessFacts, (fact) => fact.gsv);
  const visitors = safeSum(businessFacts, (fact) => fact.visitors);
  const paidBuyers = safeSum(businessFacts, (fact) => fact.paidBuyers);
  const adSpend = hasAdPlanData ? safeSum(adPlanFacts, (fact) => fact.adSpend) : null;
  const adSalesAmount = hasAdPlanData ? safeSum(adPlanFacts, (fact) => fact.adSalesAmount) : null;

  return {
    hasBusinessData,
    hasAdPlanData,
    gmv,
    gsv,
    refundSuccessAmount: safeSum(businessFacts, (fact) =>
      productRefundSuccessAmount(safeNumber(fact.gmv), safeNumber(fact.gsv)),
    ),
    visitors,
    paidBuyers,
    conversionRate: hasBusinessData ? safeDivide(paidBuyers, visitors) : null,
    adSpend,
    adSalesAmount,
    adRoi: hasAdPlanData ? safeDivide(adSalesAmount, adSpend) : null,
  };
};

export const aggregateLegacyMetrics = ({
  productFacts,
  adPlanFacts,
}: {
  productFacts: ProductDailyFact[];
  adPlanFacts: AdPlanDailyFact[];
}): MetricAggregate => {
  const hasBusinessData = productFacts.length > 0;
  const hasAdPlanData = adPlanFacts.length > 0;
  const gmv = safeSum(productFacts, (fact) => fact.gmv);
  const gsv = safeSum(productFacts, (fact) => fact.gsv);
  const visitors = safeSum(productFacts, (fact) => fact.visitors);
  const paidBuyers = safeSum(productFacts, (fact) => fact.paidBuyers);
  const adSpend = hasAdPlanData ? safeSum(adPlanFacts, (fact) => fact.adSpend) : null;
  const adSalesAmount = hasAdPlanData ? safeSum(adPlanFacts, (fact) => fact.transactionAmount) : null;

  return {
    hasBusinessData,
    hasAdPlanData,
    gmv,
    gsv,
    refundSuccessAmount: safeSum(productFacts, (fact) => fact.refundSuccessAmount),
    visitors,
    paidBuyers,
    conversionRate: hasBusinessData ? safeDivide(paidBuyers, visitors) : null,
    adSpend,
    adSalesAmount,
    adRoi: hasAdPlanData ? safeDivide(adSalesAmount, adSpend) : null,
  };
};

export const buildMetricCards = (aggregate: MetricAggregate): HomeCommandCenterMetric[] => [
  {
    key: "gmv",
    label: "GMV",
    value: aggregate.hasBusinessData ? aggregate.gmv : null,
    formattedValue: aggregate.hasBusinessData ? formatMoney(aggregate.gmv) : "--",
    helper: "支付金额合计。",
    tone: "blue",
  },
  {
    key: "gsv",
    label: "GSV",
    value: aggregate.hasBusinessData ? aggregate.gsv : null,
    formattedValue: aggregate.hasBusinessData ? formatMoney(aggregate.gsv) : "--",
    helper: `已扣成功退款 ${formatMoney(aggregate.hasBusinessData ? aggregate.refundSuccessAmount : null)}。`,
    tone: "blue",
  },
  {
    key: "visitors",
    label: "商品访客",
    value: aggregate.hasBusinessData ? aggregate.visitors : null,
    formattedValue: aggregate.hasBusinessData ? formatInteger(aggregate.visitors) : "--",
    helper: "商品访客数合计。",
    tone: "slate",
  },
  {
    key: "paidBuyers",
    label: "支付买家",
    value: aggregate.hasBusinessData ? aggregate.paidBuyers : null,
    formattedValue: aggregate.hasBusinessData ? formatInteger(aggregate.paidBuyers) : "--",
    helper: "支付买家数合计。",
    tone: "slate",
  },
  {
    key: "conversionRate",
    label: "支付转化率",
    value: aggregate.conversionRate,
    formattedValue: formatPercent(aggregate.conversionRate),
    helper: "支付买家数 / 商品访客数。",
    tone: "emerald",
  },
  {
    key: "ad",
    label: "推广花费与 ROI",
    value: aggregate.adSpend,
    formattedValue: formatMoney(aggregate.adSpend),
    helper: `ROI ${formatRoi(aggregate.adRoi)}，使用计划推广口径。`,
    tone: "amber",
  },
];

const getMetricValue = (point: Omit<HomeCommandCenterDatePoint, "cumulative">, metricKey: HomeCommandCenterMetricKey): number | null => {
  if (metricKey === "gmv") return point.gmv;
  if (metricKey === "gsv") return point.gsv;
  if (metricKey === "visitors") return point.visitors;
  if (metricKey === "paidBuyers") return point.paidBuyers;
  if (metricKey === "conversionRate") return point.conversionRate;
  return point.adSpend;
};

export const buildTrendPoints = (
  dailyAggregates: Array<Omit<HomeCommandCenterDatePoint, "cumulative">>,
): HomeCommandCenterDatePoint[] => {
  let cumulativeGmv = 0;
  let cumulativeGsv = 0;
  let cumulativeVisitors = 0;
  let cumulativePaidBuyers = 0;
  let cumulativeAdSpend = 0;

  return [...dailyAggregates]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => {
      cumulativeGmv += point.gmv ?? 0;
      cumulativeGsv += point.gsv ?? 0;
      cumulativeVisitors += point.visitors ?? 0;
      cumulativePaidBuyers += point.paidBuyers ?? 0;
      cumulativeAdSpend += point.adSpend ?? 0;

      return {
        ...point,
        cumulative: {
          gmv: point.gmv === null ? null : cumulativeGmv,
          gsv: point.gsv === null ? null : cumulativeGsv,
          visitors: point.visitors === null ? null : cumulativeVisitors,
          paidBuyers: point.paidBuyers === null ? null : cumulativePaidBuyers,
          conversionRate: safeDivide(cumulativePaidBuyers, cumulativeVisitors),
          adSpend: point.adSpend === null ? null : cumulativeAdSpend,
        },
      };
    });
};

export const v2DatesForDataset = (dataset: V2Dataset): string[] =>
  sortBusinessDatesDesc(dataset.businessProductFacts.map((fact) => fact.businessDate));

export const legacyDatesForAnalysis = (analysis: TmallStoredAnalysisResult): string[] =>
  sortBusinessDatesDesc(analysis.productDailyFacts.map((fact) => fact.date));

export const filterV2BusinessFacts = ({
  dataset,
  range,
  platformFilter,
  storeFilter,
}: {
  dataset: V2Dataset;
  range: HomeCommandCenterDateRangeState;
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}): OwnedBusinessProductFact[] =>
  dataset.businessProductFacts.filter(
    (fact) =>
      isDateInRange(fact.businessDate, range) &&
      (platformFilter === "all" || fact.platformCode === platformFilter) &&
      (storeFilter === "all" || `${fact.platformCode}:${fact.storeId}` === storeFilter),
  );

export const filterV2AdPlanFacts = ({
  dataset,
  range,
  platformFilter,
  storeFilter,
}: {
  dataset: V2Dataset;
  range: HomeCommandCenterDateRangeState;
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}): OwnedAdPlanFact[] =>
  dataset.adPlanFacts.filter(
    (fact) =>
      isDateInRange(fact.businessDate, range) &&
      (platformFilter === "all" || fact.platformCode === platformFilter) &&
      (storeFilter === "all" || `${fact.platformCode}:${fact.storeId}` === storeFilter),
  );

export const filterLegacyBusinessFacts = ({
  analysis,
  range,
}: {
  analysis: TmallStoredAnalysisResult;
  range: HomeCommandCenterDateRangeState;
}): ProductDailyFact[] =>
  analysis.productDailyFacts.filter((fact) => isDateInRange(fact.date, range));

export const filterLegacyAdPlanFacts = ({
  analysis,
  range,
}: {
  analysis: TmallStoredAnalysisResult;
  range: HomeCommandCenterDateRangeState;
}): AdPlanDailyFact[] =>
  analysis.adPlanDailyFacts.filter((fact) => isDateInRange(fact.date, range));

export const storeLabel = (store: StoreRecord): string =>
  store.storeName.trim() || `${store.platformCode}:${store.storeId}`;

export const metricValueOfPoint = (
  point: HomeCommandCenterDatePoint,
  metricKey: HomeCommandCenterMetricKey,
): number | null => getMetricValue(point, metricKey);
