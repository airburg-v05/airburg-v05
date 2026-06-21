import type {
  AfterSalesProductSummary,
  ProductDailyFact,
  TmallAnalysisDisplayResult,
  TmallDateRange,
  TmallJoinQuality,
  TmallSourceHealth,
  TmallSourceType,
} from "../../../types/tmall";

export type ProductMetricFormat = "currency" | "integer" | "rate" | "roi";

export interface TmallProductMetric {
  key: string;
  label: string;
  value: number | null;
  format: ProductMetricFormat;
  source: "生意参谋商品表" | "商品推广报表";
  formula: string;
}

export interface TmallProductOption {
  productId: string;
  productName: string;
  gmv: number;
  visitors: number;
  rank: number;
  hasAdData: boolean;
  hasAfterSalesData: boolean;
}

export interface TmallProductAudienceSummary {
  guidedVisitors: number;
  guidedProspects: number;
  prospectRate: number | null;
  newBuyers: number;
  memberJoinCount: number;
}

export interface TmallProductAfterSalesSummary {
  refundApplyCount: number;
  refundSuccessCount: number;
  refundApplyAmount: number;
  refundSuccessTotalAmount: number;
  pendingCount: number;
  overduePendingCount: number;
  customerServiceInterventionCount: number;
  avgAfterSalesDurationHours: number | null;
  topReasons: Array<{
    label: string;
    count: number;
  }>;
}

export interface TmallProductTableRow {
  productId: string;
  productName: string;
  gmv: number;
  gsv: number;
  visitors: number;
  paidBuyers: number;
  conversionRate: number | null;
  hasAdData: boolean;
  adSpend: number | null;
  adRoi: number | null;
  refundSuccessAmount: number;
}

export interface TmallProductBoardOverview {
  selectedDate: string | null;
  availableDates: string[];
  selectedProductId: string | null;
  selectedProduct: TmallProductOption | null;
  products: TmallProductOption[];
  businessMetrics: TmallProductMetric[];
  adMetrics: TmallProductMetric[];
  audienceSummary: TmallProductAudienceSummary | null;
  afterSalesSummary: TmallProductAfterSalesSummary | null;
  afterSalesDateRange: TmallDateRange;
  productTableRows: TmallProductTableRow[];
  sourceHealth: Record<TmallSourceType, TmallSourceHealth>;
  dateRanges: Record<TmallSourceType, TmallDateRange>;
  joinQuality: TmallJoinQuality;
  missingBusinessData: boolean;
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

const productLabel = (productId: string, productName: string | null): string =>
  productName?.trim() || `商品 ${productId}`;

export const getTmallProductBoardDates = (result: TmallAnalysisDisplayResult): string[] =>
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

  return [...grouped.values()].sort((first, second) => {
    if (second.gmv !== first.gmv) return second.gmv - first.gmv;
    return second.visitors - first.visitors;
  });
};

const groupAdProductFacts = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): Map<string, AdProductAggregate> => {
  const grouped = new Map<string, AdProductAggregate>();
  if (!selectedDate) return grouped;

  result.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate)
    .forEach((fact) => {
      const current = grouped.get(fact.productId) ?? {
        productId: fact.productId,
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
      grouped.set(fact.productId, current);
    });

  return grouped;
};

const afterSalesByProduct = (
  result: TmallAnalysisDisplayResult,
): Map<string, AfterSalesProductSummary> =>
  new Map(result.afterSalesAggregates.productSummary.map((item) => [item.productId, item]));

export const getProductsForDate = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): TmallProductOption[] => {
  if (!selectedDate) return [];

  const adByProduct = groupAdProductFacts(result, selectedDate);
  const afterSalesMap = afterSalesByProduct(result);

  return groupProductFacts(result.productDailyFacts.filter((fact) => fact.date === selectedDate)).map((item, index) => ({
    productId: item.productId,
    productName: item.productName,
    gmv: item.gmv,
    visitors: item.visitors,
    rank: index + 1,
    hasAdData: adByProduct.has(item.productId),
    hasAfterSalesData: afterSalesMap.has(item.productId),
  }));
};

const buildBusinessMetrics = (product: ProductAggregate | null): TmallProductMetric[] => {
  const gmv = product?.gmv ?? null;
  const gsv = product?.gsv ?? null;
  const refundSuccessAmount = product?.refundSuccessAmount ?? null;
  const visitors = product?.visitors ?? null;
  const paidBuyers = product?.paidBuyers ?? null;

  return [
    { key: "gmv", label: "GMV", value: gmv, format: "currency", source: "生意参谋商品表", formula: "支付金额" },
    { key: "gsv", label: "GSV", value: gsv, format: "currency", source: "生意参谋商品表", formula: "支付金额 - 成功退款金额" },
    {
      key: "refundSuccessAmount",
      label: "成功退款金额",
      value: refundSuccessAmount,
      format: "currency",
      source: "生意参谋商品表",
      formula: "成功退款金额",
    },
    {
      key: "refundRate",
      label: "退款率",
      value: gmv === null || refundSuccessAmount === null ? null : safeDivide(refundSuccessAmount, gmv),
      format: "rate",
      source: "生意参谋商品表",
      formula: "成功退款金额 ÷ GMV",
    },
    { key: "dailyGmv", label: "日均 GMV", value: gmv, format: "currency", source: "生意参谋商品表", formula: "当前经营日期 GMV" },
    { key: "visitors", label: "商品访客数", value: visitors, format: "integer", source: "生意参谋商品表", formula: "商品访客数" },
    {
      key: "conversionRate",
      label: "支付转化率",
      value: paidBuyers === null || visitors === null ? null : safeDivide(paidBuyers, visitors),
      format: "rate",
      source: "生意参谋商品表",
      formula: "商品支付买家数 ÷ 商品访客数",
    },
    {
      key: "avgOrderValue",
      label: "客单价",
      value: gmv === null || paidBuyers === null ? null : safeDivide(gmv, paidBuyers),
      format: "currency",
      source: "生意参谋商品表",
      formula: "GMV ÷ 商品支付买家数",
    },
    {
      key: "paidBuyers",
      label: "商品支付买家数",
      value: paidBuyers,
      format: "integer",
      source: "生意参谋商品表",
      formula: "商品支付买家数",
    },
  ];
};

const buildAdMetrics = (product: ProductAggregate | null, ad: AdProductAggregate | null): TmallProductMetric[] => {
  const adSpend = ad?.adSpend ?? null;
  const clicks = ad?.clicks ?? null;
  const adTransactionAmount = ad?.adTransactionAmount ?? null;
  const directTransactionAmount = ad?.directTransactionAmount ?? null;
  const indirectTransactionAmount = ad?.indirectTransactionAmount ?? null;
  const gmv = product?.gmv ?? null;
  const gsv = product?.gsv ?? null;

  return [
    { key: "adSpend", label: "推广花费", value: adSpend, format: "currency", source: "商品推广报表", formula: "推广花费" },
    { key: "clicks", label: "推广点击量", value: clicks, format: "integer", source: "商品推广报表", formula: "推广点击量" },
    {
      key: "avgClickCost",
      label: "推广点击单价",
      value: adSpend === null || clicks === null ? null : safeDivide(adSpend, clicks),
      format: "currency",
      source: "商品推广报表",
      formula: "推广花费 ÷ 推广点击量",
    },
    {
      key: "adTransactionAmount",
      label: "推广成交金额",
      value: adTransactionAmount,
      format: "currency",
      source: "商品推广报表",
      formula: "推广成交金额",
    },
    {
      key: "directTransactionShare",
      label: "直接成交占比",
      value:
        directTransactionAmount === null || adTransactionAmount === null
          ? null
          : safeDivide(directTransactionAmount, adTransactionAmount),
      format: "rate",
      source: "商品推广报表",
      formula: "直接成交金额 ÷ 推广成交金额",
    },
    {
      key: "indirectTransactionShare",
      label: "间接成交占比",
      value:
        indirectTransactionAmount === null || adTransactionAmount === null
          ? null
          : safeDivide(indirectTransactionAmount, adTransactionAmount),
      format: "rate",
      source: "商品推广报表",
      formula: "间接成交金额 ÷ 推广成交金额",
    },
    {
      key: "roi",
      label: "推广投入产出比",
      value: adTransactionAmount === null || adSpend === null ? null : safeDivide(adTransactionAmount, adSpend),
      format: "roi",
      source: "商品推广报表",
      formula: "推广成交金额 ÷ 推广花费",
    },
    {
      key: "adSpendRate",
      label: "推广费比",
      value: adSpend === null || gmv === null ? null : safeDivide(adSpend, gmv),
      format: "rate",
      source: "商品推广报表",
      formula: "推广花费 ÷ GMV",
    },
    {
      key: "adSpendRateAfterRefund",
      label: "去退推广费比",
      value: adSpend === null || gsv === null ? null : safeDivide(adSpend, gsv),
      format: "rate",
      source: "商品推广报表",
      formula: "推广花费 ÷ GSV",
    },
  ];
};

const buildAudienceSummary = (ad: AdProductAggregate | null): TmallProductAudienceSummary | null => {
  if (!ad) return null;

  return {
    guidedVisitors: ad.guidedVisitors,
    guidedProspects: ad.guidedProspects,
    prospectRate: safeDivide(ad.guidedProspects, ad.guidedVisitors),
    newBuyers: ad.newBuyers,
    memberJoinCount: ad.memberJoinCount,
  };
};

const buildAfterSalesSummary = (
  productSummary: AfterSalesProductSummary | undefined,
): TmallProductAfterSalesSummary | null => {
  if (!productSummary) return null;

  return {
    refundApplyCount: productSummary.refundApplyCount,
    refundSuccessCount: productSummary.refundSuccessCount,
    refundApplyAmount: productSummary.refundApplyAmount,
    refundSuccessTotalAmount: productSummary.refundSuccessTotalAmount,
    pendingCount: productSummary.pendingCount,
    overduePendingCount: productSummary.overduePendingCount,
    customerServiceInterventionCount: productSummary.customerServiceInterventionCount,
    avgAfterSalesDurationHours: productSummary.avgAfterSalesDurationHours,
    topReasons: productSummary.topReasons.slice(0, 3).map((reason) => ({
      label: reason.label,
      count: reason.count,
    })),
  };
};

export const buildTmallProductBoardOverview = (
  result: TmallAnalysisDisplayResult,
  selectedDate: string | null,
  selectedProductId: string | null,
): TmallProductBoardOverview => {
  const availableDates = getTmallProductBoardDates(result);
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const products = getProductsForDate(result, effectiveDate);
  const effectiveProductId =
    selectedProductId && products.some((product) => product.productId === selectedProductId)
      ? selectedProductId
      : products[0]?.productId ?? null;
  const productFactsForSelection =
    effectiveDate && effectiveProductId
      ? result.productDailyFacts.filter((fact) => fact.date === effectiveDate && fact.productId === effectiveProductId)
      : [];
  const selectedProductAggregate = groupProductFacts(productFactsForSelection)[0] ?? null;
  const adByProduct = groupAdProductFacts(result, effectiveDate);
  const selectedAdAggregate = effectiveProductId ? adByProduct.get(effectiveProductId) ?? null : null;
  const afterSalesMap = afterSalesByProduct(result);
  const selectedAfterSalesSummary = effectiveProductId ? afterSalesMap.get(effectiveProductId) : undefined;
  const selectedProduct = products.find((product) => product.productId === effectiveProductId) ?? null;
  const productTableRows = products.map((product) => {
    const facts = result.productDailyFacts.filter(
      (fact) => fact.date === effectiveDate && fact.productId === product.productId,
    );
    const aggregate = groupProductFacts(facts)[0];
    const ad = adByProduct.get(product.productId) ?? null;

    return {
      productId: product.productId,
      productName: product.productName,
      gmv: aggregate?.gmv ?? 0,
      gsv: aggregate?.gsv ?? 0,
      visitors: aggregate?.visitors ?? 0,
      paidBuyers: aggregate?.paidBuyers ?? 0,
      conversionRate: aggregate ? safeDivide(aggregate.paidBuyers, aggregate.visitors) : null,
      hasAdData: !!ad,
      adSpend: ad ? ad.adSpend : null,
      adRoi: ad ? safeDivide(ad.adTransactionAmount, ad.adSpend) : null,
      refundSuccessAmount: aggregate?.refundSuccessAmount ?? 0,
    };
  });

  return {
    selectedDate: effectiveDate,
    availableDates,
    selectedProductId: effectiveProductId,
    selectedProduct,
    products,
    businessMetrics: buildBusinessMetrics(selectedProductAggregate),
    adMetrics: buildAdMetrics(selectedProductAggregate, selectedAdAggregate),
    audienceSummary: buildAudienceSummary(selectedAdAggregate),
    afterSalesSummary: buildAfterSalesSummary(selectedAfterSalesSummary),
    afterSalesDateRange: result.dateRanges.after_sales ?? emptyDateRange,
    productTableRows,
    sourceHealth: result.sourceHealth,
    dateRanges: result.dateRanges,
    joinQuality: result.joinQuality,
    missingBusinessData: result.productDailyFacts.length === 0,
  };
};
