import type { TargetMetricAllocationPolicy, TargetAllocationMode } from "./contracts";

export const TARGET_METRIC_ALLOCATION_POLICIES: readonly TargetMetricAllocationPolicy[] = [
  { metricKey: "gmv", allocationMode: "sum", reason: "GMV is additive across stores, series, and products." },
  { metricKey: "gsv", allocationMode: "sum", reason: "GSV is additive after refund adjustments." },
  { metricKey: "visitors", allocationMode: "sum", reason: "Visitor counts are additive under the frozen V0.5 aggregation rules." },
  { metricKey: "paidBuyers", allocationMode: "sum", reason: "Paid buyer counts are additive under the frozen V0.5 aggregation rules." },
  { metricKey: "adSpend", allocationMode: "sum", reason: "Ad spend is an additive amount." },
  { metricKey: "refundAmount", allocationMode: "sum", reason: "Refund amount is an additive safe aggregate." },
  { metricKey: "refundSuccessAmount", allocationMode: "sum", reason: "Successful refund amount is an additive safe aggregate." },
  { metricKey: "refundOrderCount", allocationMode: "sum", reason: "Refund order count is an additive safe aggregate." },
  { metricKey: "refundApplyCount", allocationMode: "sum", reason: "Refund apply count is an additive safe aggregate." },
  { metricKey: "refundSuccessCount", allocationMode: "sum", reason: "Refund success count is an additive safe aggregate." },
  { metricKey: "afterSalesApplyCount", allocationMode: "sum", reason: "After-sales apply count is an additive safe aggregate." },
  { metricKey: "conversionRate", allocationMode: "none", reason: "Conversion rate is a ratio and must not be allocated by summing child target values." },
  { metricKey: "avgOrderValue", allocationMode: "none", reason: "Average order value is an average and must not be allocated by summing child target values." },
  { metricKey: "refundRate", allocationMode: "none", reason: "Refund rate is a ratio and must not be allocated by summing child target values." },
  { metricKey: "adRoi", allocationMode: "none", reason: "ROI is a ratio and must not be allocated by summing child target values." },
  { metricKey: "roi", allocationMode: "none", reason: "ROI is a ratio and must not be allocated by summing child target values." },
  { metricKey: "clickRate", allocationMode: "none", reason: "Click rate is a ratio and must not be allocated by summing child target values." },
  { metricKey: "adSpendRate", allocationMode: "none", reason: "Ad spend rate is a ratio and must not be allocated by summing child target values." },
  { metricKey: "adSpendRateAfterRefund", allocationMode: "none", reason: "Ad spend rate after refund is a ratio and must not be allocated by summing child target values." },
] as const;

const policyByMetricKey = new Map(
  TARGET_METRIC_ALLOCATION_POLICIES.map((policy) => [policy.metricKey, policy]),
);

export const getTargetMetricAllocationPolicy = (metricKey: string): TargetMetricAllocationPolicy => (
  policyByMetricKey.get(metricKey) ?? {
    metricKey,
    allocationMode: "none",
    reason: "Unregistered metric keys are not allocatable by default.",
  }
);

export const getTargetMetricAllocationMode = (metricKey: string): TargetAllocationMode =>
  getTargetMetricAllocationPolicy(metricKey).allocationMode;

export const isTargetMetricAllocatable = (metricKey: string): boolean =>
  getTargetMetricAllocationMode(metricKey) === "sum";
