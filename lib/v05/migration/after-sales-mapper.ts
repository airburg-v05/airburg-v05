import type {
  AfterSalesAggregates,
  AfterSalesDateAggregate,
  AfterSalesPaymentDateAggregate,
  AfterSalesProductSummary,
  AfterSalesSuccessDateAggregate,
  DistributionItem,
  TmallDateRange,
} from "../../../types/tmall";
import {
  V2_SCHEMA_VERSION,
  type AfterSalesDateBasis,
  type AfterSalesDistributionKind,
  type OwnedAfterSalesDailyAggregate,
  type OwnedAfterSalesDistributionItem,
  type OwnedAfterSalesOperationalSnapshot,
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
  capturedAt: string;
}

export interface AfterSalesMappingResult {
  dailyAggregates: OwnedAfterSalesDailyAggregate[];
  rangeAggregates: OwnedAfterSalesRangeAggregate[];
  operationalSnapshots: OwnedAfterSalesOperationalSnapshot[];
  distributionItems: OwnedAfterSalesDistributionItem[];
  rejectedRecords: RejectedLegacyRecord[];
  issues: DryRunIssue[];
  unmappedSafeAggregateSummary: string[];
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isBusinessDate = (value: unknown): value is string =>
  typeof value === "string" && BUSINESS_DATE_PATTERN.test(value);

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const SAFE_LABEL_MAX_LENGTH = 120;
const SENSITIVE_LABEL_PARTS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
  "手机号",
  "电话",
  "地址",
  "收件人",
] as const;

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

const safeInputRange = (range: TmallDateRange | null): { start: string; end: string } | null =>
  isBusinessDate(range?.start) && isBusinessDate(range?.end) && range.start <= range.end
    ? { start: range.start, end: range.end }
    : null;

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
  productId: string | null = null,
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
  productId,
});

const derivedBase = (
  dateRange: { start: string; end: string },
  importBatchId: string,
): Pick<
  OwnedAfterSalesOperationalSnapshot,
  | "schemaVersion"
  | "platformCode"
  | "storeId"
  | "sourceType"
  | "importBatchId"
  | "dateRange"
> => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  sourceType: "after_sales",
  importBatchId,
  dateRange,
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

const isSafeDistributionLabel = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const label = value.trim();
  if (!label) return false;
  if (label.length > SAFE_LABEL_MAX_LENGTH) return false;
  if (CONTROL_CHARACTER_PATTERN.test(label)) return false;
  return !SENSITIVE_LABEL_PARTS.some((part) => label.includes(part));
};

const pushUnsafeLabelIssue = (
  issues: DryRunIssue[],
  path: string,
): void => {
  issues.push(
    createDryRunIssue(
      "after_sales_distribution_label_unsafe",
      path,
      "After-sales distribution label is unsafe and cannot enter V2 storage.",
    ),
  );
};

const pushUnmappedIssue = (
  issues: DryRunIssue[],
  unmappedSafeAggregateSummary: string[],
  path: string,
  summaryType: string,
): void => {
  unmappedSafeAggregateSummary.push(summaryType);
  issues.push(
    createDryRunIssue(
      "after_sales_aggregate_unmapped",
      path,
      "After-sales safe aggregate could not be mapped without a verified date range.",
      "error",
      { summaryType },
    ),
  );
};

const mapProductSummaryRanges = (
  records: AfterSalesProductSummary[],
  dateRange: { start: string; end: string } | null,
  importBatchId: string,
  issues: DryRunIssue[],
  unmappedSafeAggregateSummary: string[],
): OwnedAfterSalesRangeAggregate[] => {
  if (records.length > 0 && !dateRange) {
    pushUnmappedIssue(
      issues,
      unmappedSafeAggregateSummary,
      "afterSalesAggregates.productSummary",
      "product_summary",
    );
    return [];
  }
  if (!dateRange) return [];

  return records.flatMap((record) => [
    {
      ...rangeBase(dateRange, "apply_date", importBatchId, record.productId),
      refundAmount: toMetric(record.refundApplyAmount),
      refundOrderCount: toMetric(record.refundApplyCount),
      afterSalesApplyCount: toMetric(record.refundApplyCount),
    },
    {
      ...rangeBase(dateRange, "success_date", importBatchId, record.productId),
      refundAmount: toMetric(record.refundSuccessTotalAmount),
      refundOrderCount: toMetric(record.refundSuccessCount),
      afterSalesApplyCount: null,
    },
  ]);
};

const mapOperationalSnapshots = (
  records: AfterSalesProductSummary[],
  dateRange: { start: string; end: string } | null,
  importBatchId: string,
  capturedAt: string,
  issues: DryRunIssue[],
  unmappedSafeAggregateSummary: string[],
): OwnedAfterSalesOperationalSnapshot[] => {
  if (records.length > 0 && !dateRange) {
    pushUnmappedIssue(
      issues,
      unmappedSafeAggregateSummary,
      "afterSalesAggregates.productSummary",
      "operational_snapshot",
    );
    return [];
  }
  if (!dateRange) return [];

  return records.map((record) => ({
    ...derivedBase(dateRange, importBatchId),
    capturedAt,
    productId: record.productId,
    pendingCount: toMetric(record.pendingCount),
    overduePendingCount: toMetric(record.overduePendingCount),
    customerServiceInterventionCount: toMetric(record.customerServiceInterventionCount),
    avgAfterSalesDurationHours: toMetric(record.avgAfterSalesDurationHours),
  }));
};

const mapDistribution = (
  records: DistributionItem[],
  distributionKind: AfterSalesDistributionKind,
  path: string,
  dateRange: { start: string; end: string } | null,
  importBatchId: string,
  capturedAt: string,
  productId: string | null,
  issues: DryRunIssue[],
  unmappedSafeAggregateSummary: string[],
): OwnedAfterSalesDistributionItem[] => {
  if (records.length > 0 && !dateRange) {
    pushUnmappedIssue(issues, unmappedSafeAggregateSummary, path, distributionKind);
    return [];
  }
  if (!dateRange) return [];

  return records.flatMap((record, index) => {
    if (!isSafeDistributionLabel(record.label)) {
      pushUnsafeLabelIssue(issues, `${path}[${index}].label`);
      return [];
    }

    if (!Number.isInteger(record.count) || record.count < 1) {
      issues.push(
        createDryRunIssue(
          "after_sales_count_reconciliation_failed",
          `${path}[${index}].count`,
          "After-sales distribution count must be a positive integer.",
        ),
      );
      return [];
    }

    return [{
      ...derivedBase(dateRange, importBatchId),
      capturedAt,
      distributionKind,
      safeLabel: record.label.trim(),
      count: record.count,
      productId,
    }];
  });
};

const mapUnknownStatusDistribution = (
  records: string[],
  dateRange: { start: string; end: string } | null,
  importBatchId: string,
  capturedAt: string,
  issues: DryRunIssue[],
  unmappedSafeAggregateSummary: string[],
): OwnedAfterSalesDistributionItem[] =>
  mapDistribution(
    records.map((label) => ({ label, count: 1 })),
    "unknown_status_distribution",
    "afterSalesAggregates.unknownStatus",
    dateRange,
    importBatchId,
    capturedAt,
    null,
    issues,
    unmappedSafeAggregateSummary,
  );

export const mapAfterSalesAggregatesToV2 = ({
  aggregates,
  dateRange,
  importBatchId,
  capturedAt,
}: AfterSalesMappingInput): AfterSalesMappingResult => {
  const issues: DryRunIssue[] = [];
  const rejectedRecords: RejectedLegacyRecord[] = [];
  const unmappedSafeAggregateSummary: string[] = [];

  const byApplyDate = Array.isArray(aggregates.byApplyDate) ? aggregates.byApplyDate : [];
  const bySuccessDate = Array.isArray(aggregates.bySuccessDate) ? aggregates.bySuccessDate : [];
  const byPaymentDate = Array.isArray(aggregates.byPaymentDate) ? aggregates.byPaymentDate : [];
  const productSummary = Array.isArray(aggregates.productSummary) ? aggregates.productSummary : [];
  const reasonDistribution = Array.isArray(aggregates.reasonDistribution) ? aggregates.reasonDistribution : [];
  const statusDistribution = Array.isArray(aggregates.statusDistribution) ? aggregates.statusDistribution : [];
  const unknownStatus = Array.isArray(aggregates.unknownStatus) ? aggregates.unknownStatus : [];

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

  const inputRange = safeInputRange(dateRange);
  rangeAggregates.push(...mapProductSummaryRanges(
    productSummary,
    inputRange,
    importBatchId,
    issues,
    unmappedSafeAggregateSummary,
  ));
  const operationalSnapshots = mapOperationalSnapshots(
    productSummary,
    inputRange,
    importBatchId,
    capturedAt,
    issues,
    unmappedSafeAggregateSummary,
  );
  const distributionItems = [
    ...mapDistribution(
      reasonDistribution,
      "reason_distribution",
      "afterSalesAggregates.reasonDistribution",
      inputRange,
      importBatchId,
      capturedAt,
      null,
      issues,
      unmappedSafeAggregateSummary,
    ),
    ...mapDistribution(
      statusDistribution,
      "status_distribution",
      "afterSalesAggregates.statusDistribution",
      inputRange,
      importBatchId,
      capturedAt,
      null,
      issues,
      unmappedSafeAggregateSummary,
    ),
    ...mapUnknownStatusDistribution(
      unknownStatus,
      inputRange,
      importBatchId,
      capturedAt,
      issues,
      unmappedSafeAggregateSummary,
    ),
    ...productSummary.flatMap((summary, index) =>
      mapDistribution(
        Array.isArray(summary.topReasons) ? summary.topReasons : [],
        "reason_distribution",
        `afterSalesAggregates.productSummary[${index}].topReasons`,
        inputRange,
        importBatchId,
        capturedAt,
        summary.productId,
        issues,
        unmappedSafeAggregateSummary,
      ),
    ),
  ];

  return {
    dailyAggregates,
    rangeAggregates,
    operationalSnapshots,
    distributionItems,
    rejectedRecords,
    issues,
    unmappedSafeAggregateSummary,
  };
};
