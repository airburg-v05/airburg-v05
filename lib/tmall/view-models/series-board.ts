import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type {
  AdProductDailyFact,
  AfterSalesProductSummary,
  DistributionItem,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
  TmallDateRange,
} from "../../../types/tmall";

export type SeriesMetricFormat = "currency" | "integer" | "rate" | "roi";

export interface TmallSeriesMetric {
  key: string;
  label: string;
  value: number | null;
  format: SeriesMetricFormat;
  source: "生意参谋商品表" | "商品推广报表";
  formula: string;
}

export interface TmallSeriesProductOption {
  productId: string;
  productName: string;
  gmv: number;
  gsv: number;
  visitors: number;
  paidBuyers: number;
  conversionRate: number | null;
  refundSuccessAmount: number;
  hasBeenGrouped: boolean;
}

export interface TmallSeriesGroupPreview {
  group: TmallSeriesGroup;
  productCount: number;
  matchedProductCount: number;
  unmatchedProductCount: number;
  matchedGmv: number;
  matchedGsv: number;
  matchedVisitors: number;
  matchedAdProductCount: number;
  matchedAdSpend: number;
  matchedRefundSuccessAmount: number;
}

export interface TmallSeriesOption {
  id: string;
  name: string;
  productCount: number;
  matchedProductCount: number;
}

export interface TmallSeriesAudienceSummary {
  hasAdData: boolean;
  guidedVisitors: number | null;
  guidedProspects: number | null;
  prospectRate: number | null;
  newBuyers: number | null;
  memberJoinCount: number | null;
}

export interface TmallSeriesAfterSalesSummary {
  hasAfterSalesData: boolean;
  dateRange: TmallDateRange;
  refundApplyCount: number | null;
  refundSuccessCount: number | null;
  refundApplyAmount: number | null;
  refundSuccessTotalAmount: number | null;
  pendingCount: number | null;
  overduePendingCount: number | null;
  customerServiceInterventionCount: number | null;
  topReasons: DistributionItem[];
}

export interface TmallSeriesProductRow {
  productId: string;
  productName: string | null;
  matchStatus: "matched" | "unmatched";
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  hasAdData: boolean;
  adSpend: number | null;
  adRoi: number | null;
  refundSuccessAmount: number | null;
}

export interface TmallSeriesBoardProductPool {
  selectedDate: string | null;
  availableDates: string[];
  products: TmallSeriesProductOption[];
  groups: TmallSeriesGroupPreview[];
  missingBusinessData: boolean;
  hasSelectedDateProducts: boolean;
}

export interface TmallSeriesBoardOverview extends TmallSeriesBoardProductPool {
  seriesGroups: TmallSeriesGroupPreview[];
  selectedSeriesId: string | null;
  selectedSeries: TmallSeriesGroupPreview | null;
  seriesOptions: TmallSeriesOption[];
  seriesBusinessMetrics: TmallSeriesMetric[];
  seriesAdMetrics: TmallSeriesMetric[];
  seriesAudienceSummary: TmallSeriesAudienceSummary | null;
  seriesAfterSalesSummary: TmallSeriesAfterSalesSummary | null;
  seriesProductRows: TmallSeriesProductRow[];
  unmatchedProductIds: string[];
  hasSelectedSeriesAdData: boolean;
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
  clicks: number;
  adTransactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
}

const emptyDateRange: TmallDateRange = { start: null, end: null };

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const productLabel = (productId: string, productName: string | null): string =>
  productName?.trim() || `商品 ${productId}`;

const uniqueProductIds = (productIds: string[]): string[] => [
  ...new Set(productIds.map(String).filter(Boolean)),
];

const topItems = <TItem>(items: TItem[], limit = 5): TItem[] => items.slice(0, limit);

const groupProductFacts = (facts: ProductDailyFact[]): ProductAggregate[] => {
  const grouped = new Map<string, ProductAggregate>();

  facts.forEach((fact) => {
    const productId = String(fact.productId);
    const current = grouped.get(productId);

    if (!current) {
      grouped.set(productId, {
        productId,
        productName: productLabel(productId, fact.productName),
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

const groupAdProductFacts = (
  facts: AdProductDailyFact[],
): Map<string, AdProductAggregate> => {
  const grouped = new Map<string, AdProductAggregate>();

  facts.forEach((fact) => {
    const productId = String(fact.productId);
    const current = grouped.get(productId) ?? {
      productId,
      adSpend: 0,
      clicks: 0,
      adTransactionAmount: 0,
      directTransactionAmount: 0,
      indirectTransactionAmount: 0,
      guidedVisitors: 0,
      guidedProspects: 0,
      newBuyers: 0,
      memberJoinCount: 0,
    };

    current.adSpend += fact.adSpend;
    current.clicks += fact.clicks;
    current.adTransactionAmount += fact.adTransactionAmount;
    current.directTransactionAmount += fact.directTransactionAmount;
    current.indirectTransactionAmount += fact.indirectTransactionAmount;
    current.guidedVisitors += fact.guidedVisitors;
    current.guidedProspects += fact.guidedProspects;
    current.newBuyers += fact.newBuyers;
    current.memberJoinCount += fact.memberJoinCount;
    grouped.set(productId, current);
  });

  return grouped;
};

const aggregateAdProducts = (items: AdProductAggregate[]): AdProductAggregate | null => {
  if (items.length === 0) return null;

  return {
    productId: "series",
    adSpend: sum(items, (item) => item.adSpend),
    clicks: sum(items, (item) => item.clicks),
    adTransactionAmount: sum(items, (item) => item.adTransactionAmount),
    directTransactionAmount: sum(items, (item) => item.directTransactionAmount),
    indirectTransactionAmount: sum(items, (item) => item.indirectTransactionAmount),
    guidedVisitors: sum(items, (item) => item.guidedVisitors),
    guidedProspects: sum(items, (item) => item.guidedProspects),
    newBuyers: sum(items, (item) => item.newBuyers),
    memberJoinCount: sum(items, (item) => item.memberJoinCount),
  };
};

const combineTopReasons = (items: AfterSalesProductSummary[]): DistributionItem[] => {
  const reasonCounts = new Map<string, number>();

  items.forEach((item) => {
    item.topReasons.forEach((reason) => {
      reasonCounts.set(reason.label, (reasonCounts.get(reason.label) ?? 0) + reason.count);
    });
  });

  return topItems(
    [...reasonCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((first, second) => second.count - first.count),
  );
};

export const getTmallSeriesBoardDates = (result: TmallAnalysisDisplayResult): string[] =>
  [...new Set(result.productDailyFacts.map((fact) => fact.date).filter(Boolean))].sort(
    (first, second) => second.localeCompare(first),
  );

export const getSeriesProductOptions = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
  groups: TmallSeriesGroup[] = [],
): TmallSeriesProductOption[] => {
  const groupedProductIds = new Set(groups.flatMap((group) => group.productIds.map(String)));
  const productFactsForDate = selectedDate
    ? result.productDailyFacts.filter((fact) => fact.date === selectedDate)
    : [];

  return groupProductFacts(productFactsForDate)
    .map((product) => ({
      ...product,
      conversionRate: safeDivide(product.paidBuyers, product.visitors),
      hasBeenGrouped: groupedProductIds.has(product.productId),
    }))
    .sort((first, second) => second.gmv - first.gmv || second.visitors - first.visitors);
};

const buildBusinessMetrics = (
  matchedProducts: TmallSeriesProductOption[],
): TmallSeriesMetric[] => {
  const hasData = matchedProducts.length > 0;
  const gmv = sum(matchedProducts, (product) => product.gmv);
  const gsv = sum(matchedProducts, (product) => product.gsv);
  const refundSuccessAmount = sum(matchedProducts, (product) => product.refundSuccessAmount);
  const visitors = sum(matchedProducts, (product) => product.visitors);
  const paidBuyers = sum(matchedProducts, (product) => product.paidBuyers);
  const matchedProductCount = matchedProducts.length;

  return [
    { key: "gmv", label: "GMV", value: hasData ? gmv : null, format: "currency", source: "生意参谋商品表", formula: "系列匹配商品 GMV 求和" },
    { key: "gsv", label: "GSV", value: hasData ? gsv : null, format: "currency", source: "生意参谋商品表", formula: "系列匹配商品 GSV 求和" },
    { key: "refundSuccessAmount", label: "成功退款金额", value: hasData ? refundSuccessAmount : null, format: "currency", source: "生意参谋商品表", formula: "成功退款金额求和" },
    { key: "refundRate", label: "退款率", value: hasData ? safeDivide(refundSuccessAmount, gmv) : null, format: "rate", source: "生意参谋商品表", formula: "成功退款金额 ÷ GMV" },
    { key: "visitors", label: "商品访客数合计", value: hasData ? visitors : null, format: "integer", source: "生意参谋商品表", formula: "商品访客数加总" },
    { key: "paidBuyers", label: "商品支付买家数合计", value: hasData ? paidBuyers : null, format: "integer", source: "生意参谋商品表", formula: "商品支付买家数加总" },
    { key: "conversionRate", label: "支付转化率", value: hasData ? safeDivide(paidBuyers, visitors) : null, format: "rate", source: "生意参谋商品表", formula: "商品支付买家数合计 ÷ 商品访客数合计" },
    { key: "avgOrderValue", label: "客单价", value: hasData ? safeDivide(gmv, paidBuyers) : null, format: "currency", source: "生意参谋商品表", formula: "GMV ÷ 商品支付买家数合计" },
    { key: "matchedProductCount", label: "匹配商品数", value: hasData ? matchedProductCount : null, format: "integer", source: "生意参谋商品表", formula: "当前日期匹配到的商品 ID 数量" },
  ];
};

const buildAdMetrics = (
  ad: AdProductAggregate | null,
  matchedProducts: TmallSeriesProductOption[],
): TmallSeriesMetric[] => {
  const gmv = sum(matchedProducts, (product) => product.gmv);
  const gsv = sum(matchedProducts, (product) => product.gsv);
  const adSpend = ad?.adSpend ?? null;
  const clicks = ad?.clicks ?? null;
  const adTransactionAmount = ad?.adTransactionAmount ?? null;
  const directTransactionAmount = ad?.directTransactionAmount ?? null;
  const indirectTransactionAmount = ad?.indirectTransactionAmount ?? null;

  return [
    { key: "adSpend", label: "推广花费", value: adSpend, format: "currency", source: "商品推广报表", formula: "系列匹配商品推广花费求和" },
    { key: "clicks", label: "推广点击量", value: clicks, format: "integer", source: "商品推广报表", formula: "系列匹配商品点击量求和" },
    { key: "avgClickCost", label: "推广点击单价", value: adSpend === null || clicks === null ? null : safeDivide(adSpend, clicks), format: "currency", source: "商品推广报表", formula: "推广花费 ÷ 推广点击量" },
    { key: "adTransactionAmount", label: "推广成交金额", value: adTransactionAmount, format: "currency", source: "商品推广报表", formula: "推广成交金额求和" },
    { key: "directTransactionShare", label: "直接成交占比", value: directTransactionAmount === null || adTransactionAmount === null ? null : safeDivide(directTransactionAmount, adTransactionAmount), format: "rate", source: "商品推广报表", formula: "直接成交金额 ÷ 推广成交金额" },
    { key: "indirectTransactionShare", label: "间接成交占比", value: indirectTransactionAmount === null || adTransactionAmount === null ? null : safeDivide(indirectTransactionAmount, adTransactionAmount), format: "rate", source: "商品推广报表", formula: "间接成交金额 ÷ 推广成交金额" },
    { key: "roi", label: "推广投入产出比", value: adTransactionAmount === null || adSpend === null ? null : safeDivide(adTransactionAmount, adSpend), format: "roi", source: "商品推广报表", formula: "推广成交金额 ÷ 推广花费" },
    { key: "adSpendRate", label: "推广费比", value: adSpend === null ? null : safeDivide(adSpend, gmv), format: "rate", source: "商品推广报表", formula: "推广花费 ÷ 系列 GMV" },
    { key: "adSpendRateAfterRefund", label: "去退推广费比", value: adSpend === null ? null : safeDivide(adSpend, gsv), format: "rate", source: "商品推广报表", formula: "推广花费 ÷ 系列 GSV" },
  ];
};

const buildAudienceSummary = (ad: AdProductAggregate | null): TmallSeriesAudienceSummary | null => {
  if (!ad) return null;

  return {
    hasAdData: true,
    guidedVisitors: ad.guidedVisitors,
    guidedProspects: ad.guidedProspects,
    prospectRate: safeDivide(ad.guidedProspects, ad.guidedVisitors),
    newBuyers: ad.newBuyers,
    memberJoinCount: ad.memberJoinCount,
  };
};

const buildAfterSalesSummary = (
  result: TmallAnalysisDisplayResult,
  matchedProductIds: Set<string>,
): TmallSeriesAfterSalesSummary | null => {
  const summaries = result.afterSalesAggregates.productSummary.filter((item) =>
    matchedProductIds.has(String(item.productId)),
  );
  if (summaries.length === 0) {
    return null;
  }

  return {
    hasAfterSalesData: true,
    dateRange: result.dateRanges.after_sales ?? emptyDateRange,
    refundApplyCount: sum(summaries, (item) => item.refundApplyCount),
    refundSuccessCount: sum(summaries, (item) => item.refundSuccessCount),
    refundApplyAmount: sum(summaries, (item) => item.refundApplyAmount),
    refundSuccessTotalAmount: sum(summaries, (item) => item.refundSuccessTotalAmount),
    pendingCount: sum(summaries, (item) => item.pendingCount),
    overduePendingCount: sum(summaries, (item) => item.overduePendingCount),
    customerServiceInterventionCount: sum(summaries, (item) => item.customerServiceInterventionCount),
    topReasons: combineTopReasons(summaries),
  };
};

const buildProductRows = (
  productIds: string[],
  productsById: Map<string, TmallSeriesProductOption>,
  adByProduct: Map<string, AdProductAggregate>,
): TmallSeriesProductRow[] => {
  const rows = productIds.map((productId) => {
    const product = productsById.get(productId) ?? null;
    const ad = adByProduct.get(productId) ?? null;

    if (!product) {
      return {
        productId,
        productName: null,
        matchStatus: "unmatched" as const,
        gmv: null,
        gsv: null,
        visitors: null,
        paidBuyers: null,
        conversionRate: null,
        hasAdData: false,
        adSpend: null,
        adRoi: null,
        refundSuccessAmount: null,
      };
    }

    return {
      productId,
      productName: product.productName,
      matchStatus: "matched" as const,
      gmv: product.gmv,
      gsv: product.gsv,
      visitors: product.visitors,
      paidBuyers: product.paidBuyers,
      conversionRate: product.conversionRate,
      hasAdData: !!ad,
      adSpend: ad ? ad.adSpend : null,
      adRoi: ad ? safeDivide(ad.adTransactionAmount, ad.adSpend) : null,
      refundSuccessAmount: product.refundSuccessAmount,
    };
  });

  return rows.sort((first, second) => {
    if (first.matchStatus !== second.matchStatus) return first.matchStatus === "matched" ? -1 : 1;
    return (second.gmv ?? -1) - (first.gmv ?? -1);
  });
};

const buildGroupPreviews = (
  groups: TmallSeriesGroup[],
  productsById: Map<string, TmallSeriesProductOption>,
  adByProduct: Map<string, AdProductAggregate>,
): TmallSeriesGroupPreview[] =>
  groups.map((group) => {
    const productIds = uniqueProductIds(group.productIds);
    const matchedProducts = productIds
      .map((productId) => productsById.get(productId))
      .filter((product): product is TmallSeriesProductOption => !!product);
    const matchedAdSpend = matchedProducts.reduce(
      (total, product) => total + (adByProduct.get(product.productId)?.adSpend ?? 0),
      0,
    );
    const matchedAdProductCount = matchedProducts.filter((product) => adByProduct.has(product.productId)).length;

    return {
      group,
      productCount: productIds.length,
      matchedProductCount: matchedProducts.length,
      unmatchedProductCount: Math.max(productIds.length - matchedProducts.length, 0),
      matchedGmv: sum(matchedProducts, (product) => product.gmv),
      matchedGsv: sum(matchedProducts, (product) => product.gsv),
      matchedVisitors: sum(matchedProducts, (product) => product.visitors),
      matchedAdProductCount,
      matchedAdSpend,
      matchedRefundSuccessAmount: sum(matchedProducts, (product) => product.refundSuccessAmount),
    };
  });

export const buildSeriesBoardProductPool = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
  groups: TmallSeriesGroup[],
): TmallSeriesBoardProductPool => {
  const overview = buildTmallSeriesBoardOverview(result, selectedDate, groups, null);

  return {
    selectedDate: overview.selectedDate,
    availableDates: overview.availableDates,
    products: overview.products,
    groups: overview.seriesGroups,
    missingBusinessData: overview.missingBusinessData,
    hasSelectedDateProducts: overview.hasSelectedDateProducts,
  };
};

export const buildTmallSeriesBoardOverview = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
  groups: TmallSeriesGroup[],
  selectedSeriesId: string | null,
): TmallSeriesBoardOverview => {
  const availableDates = getTmallSeriesBoardDates(result);
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const products = getSeriesProductOptions(result, effectiveDate, groups);
  const productsById = new Map(products.map((product) => [product.productId, product]));
  const adFactsForDate = effectiveDate
    ? result.adProductDailyFacts.filter((fact) => fact.date === effectiveDate)
    : [];
  const adByProduct = groupAdProductFacts(adFactsForDate);
  const seriesGroups = buildGroupPreviews(groups, productsById, adByProduct);
  const effectiveSeriesId =
    selectedSeriesId && groups.some((group) => group.id === selectedSeriesId)
      ? selectedSeriesId
      : groups[0]?.id ?? null;
  const selectedSeries =
    seriesGroups.find((preview) => preview.group.id === effectiveSeriesId) ?? null;
  const selectedProductIds = selectedSeries ? uniqueProductIds(selectedSeries.group.productIds) : [];
  const matchedProducts = selectedProductIds
    .map((productId) => productsById.get(productId))
    .filter((product): product is TmallSeriesProductOption => !!product);
  const matchedProductIds = new Set(matchedProducts.map((product) => product.productId));
  const unmatchedProductIds = selectedProductIds.filter((productId) => !matchedProductIds.has(productId));
  const selectedAdAggregate = aggregateAdProducts(
    matchedProducts
      .map((product) => adByProduct.get(product.productId))
      .filter((ad): ad is AdProductAggregate => !!ad),
  );

  return {
    selectedDate: effectiveDate,
    availableDates,
    products,
    groups: seriesGroups,
    seriesGroups,
    selectedSeriesId: effectiveSeriesId,
    selectedSeries,
    seriesOptions: seriesGroups.map((preview) => ({
      id: preview.group.id,
      name: preview.group.name,
      productCount: preview.productCount,
      matchedProductCount: preview.matchedProductCount,
    })),
    seriesBusinessMetrics: buildBusinessMetrics(matchedProducts),
    seriesAdMetrics: buildAdMetrics(selectedAdAggregate, matchedProducts),
    seriesAudienceSummary: buildAudienceSummary(selectedAdAggregate),
    seriesAfterSalesSummary: buildAfterSalesSummary(result, matchedProductIds),
    seriesProductRows: buildProductRows(selectedProductIds, productsById, adByProduct),
    unmatchedProductIds,
    missingBusinessData: result.productDailyFacts.length === 0,
    hasSelectedDateProducts: products.length > 0,
    hasSelectedSeriesAdData: selectedAdAggregate !== null,
  };
};
