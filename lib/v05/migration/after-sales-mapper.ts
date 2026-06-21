import type {
  AfterSalesAggregates,
  AfterSalesDateAggregate,
  AfterSalesPaymentDateAggregate,
  AfterSalesSuccessDateAggregate,
  TmallDateRange,
} from "../../../types/tmall";
import {
  V2_SCHEMA_VERSION,
  type AfterSalesDateBasis,
  type OwnedAfterSalesDailyAggregate,
  type OwnedAfterSalesRangeAggregate,
} from "../domain/models";
import {
  DEFAULT_TMAIL_OWNER,
  LEGACY_ANALYSIS_KEY,
  createDryRunIssue,
  type DryRunIssue,
  type RejectedLegacyRecord,
} from "./contracts";

interface AfterSalesMappingInput {
  aggregates: AfterSalesAggregates;
  dateRange: TmallDateRange | null;
  importBatchId: string;
}

export interface AfterSalesMappingResult {
  dailyAggregates: OwnedAfterSalesDailyAggregate[];
  rangeAggregates: OwnedAfterSalesRangeAggregate[];
  rejectedRecords: RejectedLegacyRecord[];
  issues: DryRunIssue[];
  unmappedSafeAggregateSummary: string[];
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isBusinessDate = (value: unknown): value is string =>
  typeof value === "string" && BUSINESS_DATE_PATTERN.test(value);

const toMetric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sumMetric = <TRecord>(
  records: TRecord[],
  read: (record: TRecord) => unknown,
): number | null => {
  let total = 0;
  let hasValue = false;

  records.forEach((record) => {
    const value = toMetric(read(record));
    if (value === null) return;
    total += value;
    hasValue = true;
  });

  return hasValue ? total : null;
};

const safeRange = (
  range: TmallDateRange | null,
  records: Array<{ date: string }>,
): { start: string; end: string } | null => {
  if (isBusinessDate(range?.start) && isBusinessDate(range?.end) && range.start <= range.end) {
    return { start: range.start, end: range.end };
  }

  const dates = records.map((record) => record.date).filter(isBusinessDate).sort();
  if (!dates.length) return null;
  return { start: dates[0]!, end: dates[dates.length - 1]! };
};

const dailyBase = (
  businessDate: string,
  dateBasis: AfterSalesDateBasis,
  importBatchId: string,
): Pick<
  OwnedAfterSalesDailyAggregate,
  | "schemaVersion"
  | "platformCode"
  | "storeId"
  | "businessDate"
  | "sourceType"
  | "importBatchId"
  | "dateBasis"
  | "productId"
> => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  businessDate,
  sourceType: "after_sales",
  importBatchId,
  dateBasis,
  productId: null,
});

const rangeBase = (
  dateRange: { start: string; end: string },
  dateBasis: AfterSalesDateBasis,
  importBatchId: string,
): Pick<
  OwnedAfterSalesRangeAggregate,
  | "schemaVersion"
  | "platformCode"
  | "storeId"
  | "sourceType"
  | "importBatchId"
  | "dateRange"
  | "dateBasis"
  | "productId"
> => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  sourceType: "after_sales",
  importBatchId,
  dateRange,
  dateBasis,
  productId: null,
});

const pushRejectedDate = (
  rejectedRecords: RejectedLegacyRecord[],
  path: string,
): void => {
  rejectedRecords.push({
    legacyKey: LEGACY_ANALYSIS_KEY,
    recordType: "after_sales_aggregate",
    safeIdentity: path,
    issueCodes: ["invalid_format"],
    paths: [path],
  });
};

const mapApplyDaily = (
  records: AfterSalesDateAggregate[],
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): OwnedAfterSalesDailyAggregate[] =>
  records.flatMap((record, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.byApplyDate[${index}].date`);
      return [];
    }

    return [{
      ...dailyBase(record.date, "apply_date", importBatchId),
      refundAmount: toMetric(record.refundApplyAmount),
      refundOrderCount: toMetric(record.refundApplyCount),
      afterSalesApplyCount: toMetric(record.refundApplyCount),
    }];
  });

const mapSuccessDaily = (
  records: AfterSalesSuccessDateAggregate[],
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): OwnedAfterSalesDailyAggregate[] =>
  records.flatMap((record, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.bySuccessDate[${index}].date`);
      return [];
    }

    return [{
      ...dailyBase(record.date, "success_date", importBatchId),
      refundAmount: toMetric(record.refundSuccessTotalAmount),
      refundOrderCount: toMetric(record.refundSuccessCount),
      afterSalesApplyCount: null,
    }];
  });

const mapPaymentDaily = (
  records: AfterSalesPaymentDateAggregate[],
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): OwnedAfterSalesDailyAggregate[] =>
  records.flatMap((record, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.byPaymentDate[${index}].date`);
      return [];
    }

    return [{
      ...dailyBase(record.date, "payment_date", importBatchId),
      refundAmount: toMetric(record.refundAttributionAmount),
      refundOrderCount: toMetric(record.refundAttributionCount),
      afterSalesApplyCount: null,
    }];
  });

export const mapAfterSalesAggregatesToV2 = ({
  aggregates,
  dateRange,
  importBatchId,
}: AfterSalesMappingInput): AfterSalesMappingResult => {
  const issues: DryRunIssue[] = [];
  const rejectedRecords: RejectedLegacyRecord[] = [];
  const unmappedSafeAggregateSummary: string[] = [];

  const byApplyDate = Array.isArray(aggregates.byApplyDate) ? aggregates.byApplyDate : [];
  const bySuccessDate = Array.isArray(aggregates.bySuccessDate) ? aggregates.bySuccessDate : [];
  const byPaymentDate = Array.isArray(aggregates.byPaymentDate) ? aggregates.byPaymentDate : [];

  const dailyAggregates = [
    ...mapApplyDaily(byApplyDate, importBatchId, rejectedRecords),
    ...mapSuccessDaily(bySuccessDate, importBatchId, rejectedRecords),
    ...mapPaymentDaily(byPaymentDate, importBatchId, rejectedRecords),
  ];

  const rangeAggregates: OwnedAfterSalesRangeAggregate[] = [];
  const applyRange = safeRange(dateRange, byApplyDate);
  if (applyRange && byApplyDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(applyRange, "apply_date", importBatchId),
      refundAmount: sumMetric(byApplyDate, (record) => record.refundApplyAmount),
      refundOrderCount: sumMetric(byApplyDate, (record) => record.refundApplyCount),
      afterSalesApplyCount: sumMetric(byApplyDate, (record) => record.refundApplyCount),
    });
  }

  const successRange = safeRange(dateRange, bySuccessDate);
  if (successRange && bySuccessDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(successRange, "success_date", importBatchId),
      refundAmount: sumMetric(bySuccessDate, (record) => record.refundSuccessTotalAmount),
      refundOrderCount: sumMetric(bySuccessDate, (record) => record.refundSuccessCount),
      afterSalesApplyCount: null,
    });
  }

  const paymentRange = safeRange(dateRange, byPaymentDate);
  if (paymentRange && byPaymentDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(paymentRange, "payment_date", importBatchId),
      refundAmount: sumMetric(byPaymentDate, (record) => record.refundAttributionAmount),
      refundOrderCount: sumMetric(byPaymentDate, (record) => record.refundAttributionCount),
      afterSalesApplyCount: null,
    });
  }

  const hasAmbiguousRangeSummary =
    (Array.isArray(aggregates.productSummary) && aggregates.productSummary.length > 0) ||
    (Array.isArray(aggregates.reasonDistribution) && aggregates.reasonDistribution.length > 0) ||
    (Array.isArray(aggregates.statusDistribution) && aggregates.statusDistribution.length > 0) ||
    (Array.isArray(aggregates.unknownStatus) && aggregates.unknownStatus.length > 0);

  if (hasAmbiguousRangeSummary) {
    const summaryParts = [
      aggregates.productSummary?.length ? "product_summary" : null,
      aggregates.reasonDistribution?.length ? "reason_distribution" : null,
      aggregates.statusDistribution?.length ? "status_distribution" : null,
      aggregates.unknownStatus?.length ? "unknown_status" : null,
    ].filter((item): item is string => item !== null);

    unmappedSafeAggregateSummary.push(...summaryParts);
    issues.push(
      createDryRunIssue(
        "ambiguous_after_sales_range_basis",
        "afterSalesAggregates",
        "Some after-sales safe aggregates do not carry an explicit date basis and must remain unmapped.",
        "error",
        { summaryBucketCount: summaryParts.length },
      ),
    );
  }

  return {
    dailyAggregates,
    rangeAggregates,
    rejectedRecords,
    issues,
    unmappedSafeAggregateSummary,
  };
};
