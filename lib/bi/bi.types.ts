import type { BrandModelFilter } from "./search-keyword.types";

export type BIEntityLevel = "platform" | "store" | "series" | "product" | "date";

export type BITimeRangeMode = "day" | "week" | "month" | "custom";

export type BIMetricKey =
  | "gmv"
  | "gsv"
  | "visitors"
  | "paidBuyers"
  | "conversionRate"
  | "averageOrderValue"
  | "adSpend"
  | "adRevenue"
  | "adRoi"
  | "adSpendRateAfterRefund"
  | "refundAmount"
  | "refundCount"
  | "refundRate"
  | "shippedRefundAmount"
  | "shippedRefundCount"
  | "shippedRefundRate"
  | "signedRefundAmount"
  | "signedRefundCount"
  | "signedRefundRate"
  | "directTransactionAmount"
  | "indirectTransactionAmount"
  | "totalTransactionAmount"
  | "directTransactionShare"
  | (string & {});

export interface BaseEntity {
  platformCode: string;
  platformName: string | null;
  storeId: string | null;
  storeName: string | null;
  seriesId: string | null;
  seriesName: string | null;
  productId: string | null;
  productName: string | null;
  businessDate: string;
}

export interface BITimeRange {
  mode: BITimeRangeMode;
  startDate: string | null;
  endDate: string | null;
}

export type BIMetricValue = number | null;

export type BIMetricMap = Partial<Record<BIMetricKey, BIMetricValue>>;

export interface BIDataPoint extends BaseEntity {
  metrics: BIMetricMap;
}

export interface PlatformAgg {
  entity: Pick<BaseEntity, "platformCode" | "platformName">;
  dateRange: BITimeRange;
  storeCount: number;
  seriesCount: number;
  productCount: number;
  metrics: BIMetricMap;
}

export interface SeriesAgg {
  entity: Pick<
    BaseEntity,
    "platformCode" | "platformName" | "storeId" | "storeName" | "seriesId" | "seriesName"
  >;
  dateRange: BITimeRange;
  productIds: string[];
  productCount: number;
  metrics: BIMetricMap;
}

export type KPICardTone = "neutral" | "positive" | "warning" | "danger";

export interface KPICard {
  id: string;
  metricKey: BIMetricKey;
  title: string;
  value: string;
  rawValue: BIMetricValue;
  tone: KPICardTone;
  linkedChartSeriesIds: string[];
  linkedSeriesIds: string[];
  description: string | null;
}

export interface ChartPoint {
  date: string;
  value: BIMetricValue;
}

export interface ChartSeries {
  id: string;
  name: string;
  entityLevel: Exclude<BIEntityLevel, "date">;
  entityId: string;
  points: ChartPoint[];
}

export interface ChartModel {
  id: string;
  metricKey: BIMetricKey;
  title: string;
  xAxis: string[];
  series: ChartSeries[];
  lines: ChartSeries[];
  empty: boolean;
}

export interface UIState {
  selectedPlatform: string | null;
  selectedSeries: string | null;
  selectedStores: string[];
  timeRange: BITimeRange;
  selectedMetric: BIMetricKey;
  excludedProductIds: string[];
  excludedRemarkKeywords: string[];
  brandModelFilter?: BrandModelFilter;
  targetDrafts: Record<string, number>;
}

export type BIHomeDataMode =
  | "loading"
  | "v2_valid"
  | "legacy_fallback"
  | "v2_corrupted_with_legacy_fallback"
  | "empty"
  | "corrupted"
  | "error";

export interface BIHomeDataStatus {
  mode: BIHomeDataMode;
  label: string;
  storeCount: number;
  platformCount: number;
  hasRealData: boolean;
  safeWarnings: string[];
}
