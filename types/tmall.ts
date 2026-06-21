export type TmallSourceType =
  | "business_product"
  | "ad_product"
  | "ad_plan"
  | "after_sales";

export type TmallDetectedSourceType = TmallSourceType | "unknown";

export type TmallSourceStatus = "parsed" | "missing" | "unknown" | "error";

export interface TmallDateRange {
  start: string | null;
  end: string | null;
}

export interface TmallSourceHealth {
  sourceType: TmallDetectedSourceType;
  expectedSourceType?: TmallSourceType;
  status: TmallSourceStatus;
  fileName: string | null;
  encoding: string | null;
  sheetNames: string[];
  headerRowNumber: number | null;
  headers: string[];
  rowCount: number;
  missingRequiredFields: string[];
  invalidDateCount: number;
  invalidIdCount: number;
  summaryRowCount: number;
  unknownStatuses: string[];
  warningTypes: string[];
}

export interface ProductDailyFact {
  platform: "tmall";
  date: string;
  productId: string;
  productName: string | null;
  visitors: number;
  pageViews: number;
  paidBuyers: number;
  gmv: number;
  refundSuccessAmount: number;
  gsv: number;
  refundRate: number | null;
  conversionRate: number | null;
  avgOrderValue: number | null;
  favorites: number;
  cartAdditions: number;
  orderBuyers: number;
  orderAmount: number;
  searchVisitors: number;
  searchPaidBuyers: number;
  hasAdData: boolean;
}

export interface AdProductDailyFact {
  platform: "tmall";
  date: string;
  productId: string;
  adSpend: number;
  impressions: number;
  clicks: number;
  adTransactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  favoriteCartCount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
  clickRate: number | null;
  avgClickCost: number | null;
  cpm: number | null;
  roi: number | null;
  directTransactionShare: number | null;
  indirectTransactionShare: number | null;
  favoriteCartCost: number | null;
  hasAdData: boolean;
}

export interface AdPlanDailyFact {
  platform: "tmall";
  date: string;
  planId: string;
  planName: string | null;
  sceneId: string | null;
  sceneName: string | null;
  adSpend: number;
  impressions: number;
  clicks: number;
  transactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
  memberFirstBuyers: number;
  clickRate: number | null;
  avgClickCost: number | null;
  roi: number | null;
  guidedProspectRate: number | null;
  newBuyerRate: number | null;
  memberJoinRate: number | null;
}

export interface AfterSalesDateAggregate {
  date: string;
  refundApplyCount: number;
  refundApplyAmount: number;
  refundOnlyCount: number;
  returnRefundCount: number;
  fullRefundCount: number;
  partialRefundCount: number;
}

export interface AfterSalesSuccessDateAggregate {
  date: string;
  refundSuccessCount: number;
  refundSuccessTotalAmount: number;
  refundToBuyerAmount: number;
  refundToPlatformAmount: number;
}

export interface AfterSalesPaymentDateAggregate {
  date: string;
  refundAttributionCount: number;
  refundAttributionAmount: number;
}

export interface DistributionItem {
  label: string;
  count: number;
}

export interface AfterSalesProductSummary {
  productId: string;
  refundApplyCount: number;
  refundSuccessCount: number;
  refundApplyAmount: number;
  refundSuccessTotalAmount: number;
  pendingCount: number;
  overduePendingCount: number;
  customerServiceInterventionCount: number;
  avgAfterSalesDurationHours: number | null;
  topReasons: DistributionItem[];
}

export interface AfterSalesAggregates {
  byApplyDate: AfterSalesDateAggregate[];
  bySuccessDate: AfterSalesSuccessDateAggregate[];
  byPaymentDate: AfterSalesPaymentDateAggregate[];
  reasonDistribution: DistributionItem[];
  statusDistribution: DistributionItem[];
  productSummary: AfterSalesProductSummary[];
  unknownStatus: string[];
}

export interface TmallJoinQuality {
  advertisedProductJoinRate: number | null;
  advertisedProductJoinedCount: number;
  advertisedProductCount: number;
  storePromotionCoverage: number | null;
  promotedProductCount: number;
  storeProductCount: number;
  planJoinRate: number | null;
  joinedPlanCount: number;
  adProductPlanCount: number;
  afterSalesProductJoinRate: number | null;
  joinedAfterSalesProductCount: number;
  afterSalesProductCount: number;
}

export interface TmallReconciliation {
  comparedDateRange: TmallDateRange;
  planAdSpend: number;
  productAdSpend: number;
  adSpendDifference: number;
  planTransactionAmount: number;
  productTransactionAmount: number;
  transactionAmountDifference: number;
  reconciliationStatus: "matched" | "different" | "missing_comparable_dates";
}

export interface TmallFourSourceAnalysisResult {
  version: "tmall_four_source_v1";
  analysisTimestamp: string;
  sourceHealth: Record<TmallSourceType, TmallSourceHealth>;
  dateRanges: Record<TmallSourceType, TmallDateRange>;
  productDailyFacts: ProductDailyFact[];
  adProductDailyFacts: AdProductDailyFact[];
  adPlanDailyFacts: AdPlanDailyFact[];
  afterSalesAggregates: AfterSalesAggregates;
  joinQuality: TmallJoinQuality;
  reconciliation: TmallReconciliation;
  dataQualityWarnings: string[];
}

export type TmallStoredAnalysisResult = Pick<
  TmallFourSourceAnalysisResult,
  | "version"
  | "analysisTimestamp"
  | "sourceHealth"
  | "dateRanges"
  | "productDailyFacts"
  | "adProductDailyFacts"
  | "adPlanDailyFacts"
  | "afterSalesAggregates"
  | "joinQuality"
  | "dataQualityWarnings"
> & {
  reconciliation?: TmallReconciliation;
};

export type TmallAnalysisDisplayResult =
  | TmallFourSourceAnalysisResult
  | TmallStoredAnalysisResult;
