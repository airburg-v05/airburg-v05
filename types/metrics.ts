export type StandardMetricField =
  | "platform"
  | "date"
  | "product_id"
  | "product_name"
  | "visitors"
  | "sales_amount"
  | "refund_amount"
  | "paid_buyers"
  | "conversion_rate"
  | "avg_order_value"
  | "favorites"
  | "cart_additions"
  | "ad_spend"
  | "ad_clicks"
  | "ad_sales_amount"
  | "direct_sales_amount"
  | "indirect_sales_amount";

export type FieldMappingStatus = "matched" | "ambiguous" | "missing";

export interface FieldMatch {
  rawField: string | null;
  status: FieldMappingStatus;
}

export type FieldMappingResult = Record<StandardMetricField, FieldMatch>;

export type FieldQualityStatus = "valid" | "partial" | "missing" | "invalid";

export interface FieldQualitySummary {
  status: FieldQualityStatus;
  validCount: number;
  missingCount: number;
  invalidCount: number;
}
