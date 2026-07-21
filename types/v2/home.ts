export const V2_HOME_METRIC_KEYS = [
  "gmv",
  "gsv",
  "adRoi",
  "adSpendRateAfterRefund",
  "directTransactionShare",
  "brandVisitors",
  "brandPaidBuyers",
  "brandKeywordPaidShare",
  "refundRate",
  "shippedRefundRate",
  "signedRefundRate",
  "averageOrderValue",
  "conversionRate",
  "adSpend",
  "cpc",
  "mtdTurnover",
  "regionalFulfillmentRate",
] as const;

export type V2HomeMetricKey = (typeof V2_HOME_METRIC_KEYS)[number];
export type V2HomeMetricFormat = "money" | "integer" | "percent" | "ratio" | "days";
export type V2HomeMetricAvailability =
  | "AVAILABLE"
  | "AVAILABLE_WITH_BRAND_FILTER"
  | "PENDING_IMPLEMENTATION"
  | "UNAVAILABLE";
export type V2HomeMetricSourceStatus = "real" | "missing" | "pending" | "unavailable";
export type V2HomeTargetRule = "required" | "derived" | "unsupported";
export type V2HomeChartMode = "mtd" | "dly";
export type V2HomeTimeRangeMode = "day" | "week" | "month" | "custom";
export type V2HomeComparisonMode = "none" | "yoy" | "previous_period";

export interface V2HomeTimeRange {
  mode: V2HomeTimeRangeMode;
  startDate: string;
  endDate: string;
}

export interface V2HomeMetricContract {
  metricKey: V2HomeMetricKey;
  title: string;
  unit: string;
  format: V2HomeMetricFormat;
  availability: V2HomeMetricAvailability;
  semanticStatus: string;
}

export interface V2HomeTargetOverlay {
  rule: V2HomeTargetRule;
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number | null;
}

export interface V2HomeMetricCard extends V2HomeMetricContract {
  actual: string;
  actualRaw: number | null;
  sourceStatus: V2HomeMetricSourceStatus;
  note: string | null;
  target: V2HomeTargetOverlay;
  comparison: V2HomeMetricComparison | null;
}

export interface V2HomeMetricComparison {
  mode: Exclude<V2HomeComparisonMode, "none">;
  label: "同比" | "环比";
  referenceRange: { startDate: string; endDate: string };
  referenceValue: number | null;
  changeRate: number | null;
  formatted: string;
  available: boolean;
}

export interface V2HomeScopeOption {
  id: string;
  label: string;
  platformCode: string;
  storeId: string | null;
}

export interface V2HomeSeriesOption {
  id: string;
  label: string;
  productCount: number;
  showOnHome: boolean;
}

export interface V2HomeScope {
  brandId: string;
  brandName: string;
  selectedPlatform: string | null;
  selectedStoreIds: string[];
  selectedSeriesId: string | null;
  platformOptions: V2HomeScopeOption[];
  storeOptions: V2HomeScopeOption[];
  seriesOptions: V2HomeSeriesOption[];
}

export interface V2HomeDatasetIdentity {
  activeDatasetId: string | null;
  sourceLabel: string;
  restoredFromPersistence: boolean;
  dateRange: { startDate: string; endDate: string } | null;
  updatedAt: string | null;
}

export interface V2HomeSeriesGsvCard {
  seriesId: string;
  seriesName: string;
  href: string;
  actual: string;
  actualRaw: number | null;
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number | null;
}

export interface V2HomeChartPair {
  id: string;
  label: string;
  leftMetricKey: V2HomeMetricKey;
  rightMetricKey: V2HomeMetricKey;
  leftLabel: string;
  rightLabel: string;
  leftUnit: string;
  rightUnit: string;
  dualAxis: boolean;
}

export interface V2HomeChartPoint {
  date: string;
  dateLabel: string;
  leftValue: number | null;
  rightValue: number | null;
  leftFormatted: string;
  rightFormatted: string;
}

export interface V2HomeChartModel {
  mode: V2HomeChartMode;
  pair: V2HomeChartPair;
  availablePairs: V2HomeChartPair[];
  points: V2HomeChartPoint[];
  empty: boolean;
}

export interface V2HomeComparisonState {
  mode: V2HomeComparisonMode;
  available: boolean;
  message: string;
  referenceRange: { startDate: string; endDate: string } | null;
}

export interface V2HomeDataHealthSummary {
  missingSourceCount: number;
  safeSkippedCount: number;
  dedupedRecordCount: number;
  nonComputableMetricCount: number;
  filesParsed: number;
  filesFailed: number;
  safeIssueCodes: string[];
}

export interface V2HomeReconciliationSummary {
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  adSpend: number | null;
  clicks: number | null;
  refundAmount: number | null;
  adSpendRateAfterRefund: number | null;
  directTransactionShare: number | null;
}

export interface V2HomeViewModel {
  status: "ready";
  dataStatusLabel: string;
  scope: V2HomeScope;
  dataset: V2HomeDatasetIdentity;
  timeRange: V2HomeTimeRange;
  comparison: V2HomeComparisonState;
  metrics: V2HomeMetricCard[];
  keySeries: V2HomeSeriesGsvCard[];
  chart: V2HomeChartModel;
  dataHealth: V2HomeDataHealthSummary;
  reconciliation: V2HomeReconciliationSummary;
  preferencePersistence: "LOCAL_UI_PREFERENCE";
}

export type V2HomeLoadResult =
  | { status: "ready"; viewModel: V2HomeViewModel }
  | { status: "empty"; message: string; uploadHref: string }
  | { status: "error"; message: string };

export interface V2HomeLoadOptions {
  brandId?: string;
  selectedPlatform?: string | null;
  selectedStoreIds?: string[];
  selectedSeriesId?: string | null;
  seriesOptionVisibility?: "home" | "all";
  timeRange?: V2HomeTimeRange;
  chartMode?: V2HomeChartMode;
  chartPairId?: string;
  comparisonMode?: V2HomeComparisonMode;
}

export interface V2HomeContextPatch {
  brandId: string;
  selectedPlatform: string | null;
  selectedStoreIds: string[];
  timeRange: V2HomeTimeRange;
  chartMode: V2HomeChartMode;
  selectedMetric: V2HomeMetricKey;
}
