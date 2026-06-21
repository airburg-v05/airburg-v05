import type {
  AfterSalesAggregates,
  AfterSalesDateAggregate,
  AfterSalesPaymentDateAggregate,
  AfterSalesProductSummary,
  AfterSalesSuccessDateAggregate,
} from "../../../types/tmall";
import { hoursBetween, mapToDistribution, safeDivide } from "../normalizers";
import type { AfterSalesRecord } from "../parsers/after-sales-parser";

const increment = <TValue>(
  map: Map<string, TValue>,
  key: string | null,
  createValue: (dateOrKey: string) => TValue,
  updateValue: (value: TValue) => void,
) => {
  if (!key) return;
  const current = map.get(key) ?? createValue(key);
  updateValue(current);
  map.set(key, current);
};

const isRefundOnly = (value: string | null): boolean => !!value && value.includes("仅退款");
const isReturnRefund = (value: string | null): boolean => !!value && value.includes("退货退款");
const isFullRefund = (value: string | null): boolean => !!value && value.includes("全额");
const isPartialRefund = (value: string | null): boolean => !!value && value.includes("部分");

const sortByDate = <TValue extends { date: string }>(values: TValue[]) =>
  values.sort((first, second) => first.date.localeCompare(second.date));

export const aggregateAfterSales = (
  records: AfterSalesRecord[],
  analysisTimestamp: string,
): AfterSalesAggregates => {
  const analysisTime = new Date(analysisTimestamp);
  const byApplyDate = new Map<string, AfterSalesDateAggregate>();
  const bySuccessDate = new Map<string, AfterSalesSuccessDateAggregate>();
  const byPaymentDate = new Map<string, AfterSalesPaymentDateAggregate>();
  const reasonCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const productBuckets = new Map<string, AfterSalesRecord[]>();

  records.forEach((record) => {
    increment(
      byApplyDate,
      record.applyDate,
      (date) => ({
        date,
        refundApplyCount: 0,
        refundApplyAmount: 0,
        refundOnlyCount: 0,
        returnRefundCount: 0,
        fullRefundCount: 0,
        partialRefundCount: 0,
      }),
      (value) => {
        value.refundApplyCount += 1;
        value.refundApplyAmount += record.refundTotalAmount;
        if (isRefundOnly(record.afterSalesType)) value.refundOnlyCount += 1;
        if (isReturnRefund(record.afterSalesType)) value.returnRefundCount += 1;
        if (isFullRefund(record.partialFullType)) value.fullRefundCount += 1;
        if (isPartialRefund(record.partialFullType)) value.partialRefundCount += 1;
      },
    );

    if (record.statusType === "success") {
      increment(
        bySuccessDate,
        record.successDate,
        (date) => ({
          date,
          refundSuccessCount: 0,
          refundSuccessTotalAmount: 0,
          refundToBuyerAmount: 0,
          refundToPlatformAmount: 0,
        }),
        (value) => {
          value.refundSuccessCount += 1;
          value.refundSuccessTotalAmount += record.refundTotalAmount;
          value.refundToBuyerAmount += record.refundToBuyerAmount;
          value.refundToPlatformAmount += record.refundToPlatformAmount;
        },
      );
    }

    increment(
      byPaymentDate,
      record.paymentDate,
      (date) => ({
        date,
        refundAttributionCount: 0,
        refundAttributionAmount: 0,
      }),
      (value) => {
        value.refundAttributionCount += 1;
        value.refundAttributionAmount += record.refundTotalAmount;
      },
    );

    if (record.reason) reasonCounts.set(record.reason, (reasonCounts.get(record.reason) ?? 0) + 1);
    if (record.status) statusCounts.set(record.status, (statusCounts.get(record.status) ?? 0) + 1);
    if (record.productId) {
      const bucket = productBuckets.get(record.productId) ?? [];
      bucket.push(record);
      productBuckets.set(record.productId, bucket);
    }
  });

  const productSummary: AfterSalesProductSummary[] = [...productBuckets.entries()]
    .map(([productId, bucket]) => {
      const successRecords = bucket.filter((record) => record.statusType === "success");
      const pendingRecords = bucket.filter((record) => record.statusType === "pending");
      const durations = successRecords
        .map((record) => hoursBetween(record.applyAt, record.successAt))
        .filter((value): value is number => value !== null);
      const reasonDistribution = mapToDistribution(
        bucket.reduce((counts, record) => {
          if (record.reason) counts.set(record.reason, (counts.get(record.reason) ?? 0) + 1);
          return counts;
        }, new Map<string, number>()),
      );

      return {
        productId,
        refundApplyCount: bucket.length,
        refundSuccessCount: successRecords.length,
        refundApplyAmount: bucket.reduce((sum, record) => sum + record.refundTotalAmount, 0),
        refundSuccessTotalAmount: successRecords.reduce((sum, record) => sum + record.refundTotalAmount, 0),
        pendingCount: pendingRecords.length,
        overduePendingCount: pendingRecords.filter(
          (record) => record.timeoutAt && record.timeoutAt.getTime() < analysisTime.getTime(),
        ).length,
        customerServiceInterventionCount: bucket.filter((record) => record.customerServiceIntervention).length,
        avgAfterSalesDurationHours:
          durations.length > 0 ? safeDivide(durations.reduce((sum, value) => sum + value, 0), durations.length) : null,
        topReasons: reasonDistribution.slice(0, 5),
      };
    })
    .sort((first, second) => second.refundApplyCount - first.refundApplyCount || first.productId.localeCompare(second.productId));

  return {
    byApplyDate: sortByDate([...byApplyDate.values()]),
    bySuccessDate: sortByDate([...bySuccessDate.values()]),
    byPaymentDate: sortByDate([...byPaymentDate.values()]),
    reasonDistribution: mapToDistribution(reasonCounts),
    statusDistribution: mapToDistribution(statusCounts),
    productSummary,
    unknownStatus: [...new Set(records.filter((record) => record.statusType === "unknown").map((record) => record.status))]
      .filter(Boolean)
      .sort((first, second) => first.localeCompare(second, "zh-CN")),
  };
};

