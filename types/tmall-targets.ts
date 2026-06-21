export type TmallTargetScope = "store" | "product" | "series";

export type TmallTargetPeriodType = "daily" | "monthly";

export type TmallTargetMetricKey =
  | "gmv"
  | "gsv"
  | "visitors"
  | "paidBuyers"
  | "conversionRate"
  | "avgOrderValue"
  | "refundRate"
  | "adSpend"
  | "adRoi"
  | "adSpendRate"
  | "adSpendRateAfterRefund";

export type TmallTargetDirection = "higher_is_better" | "lower_is_better";

export type TmallTargetStatus = "active" | "paused";

export type TmallTargetUnit = "currency" | "integer" | "rate" | "ratio";

export interface TmallTargetDefinition {
  id: string;
  name: string;
  scope: TmallTargetScope;
  periodType: TmallTargetPeriodType;
  periodValue: string;
  metricKey: TmallTargetMetricKey;
  targetValue: number;
  direction: TmallTargetDirection;
  status: TmallTargetStatus;
  productId?: string;
  seriesId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TmallTargetStorage {
  version: "tmall_targets_v1";
  targets: TmallTargetDefinition[];
}
