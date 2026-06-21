import type {
  AdPlanDailyFact,
  AdProductDailyFact,
  AfterSalesAggregates,
  AfterSalesDateAggregate,
  AfterSalesPaymentDateAggregate,
  AfterSalesProductSummary,
  AfterSalesSuccessDateAggregate,
  DistributionItem,
  ProductDailyFact,
  TmallDateRange,
  TmallFourSourceAnalysisResult,
  TmallSourceHealth,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";
import {
  V2_SCHEMA_VERSION,
  type AfterSalesDateBasis,
  type AfterSalesDistributionKind,
  type DateRange,
  type ImportBatchRecord,
  type ImportFileRecord,
  type ImportFileStatus,
  type MigrationManifest,
  type OwnedAdPlanFact,
  type OwnedAdProductFact,
  type OwnedAfterSalesDailyAggregate,
  type OwnedAfterSalesDistributionItem,
  type OwnedAfterSalesOperationalSnapshot,
  type OwnedAfterSalesRangeAggregate,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type StoreRecord,
  type V2SourceType,
} from "../domain/models";
import {
  DEFAULT_TMAIL_OWNER,
  LEGACY_ANALYSIS_KEY,
  countStagingDatasetRecords,
  createDryRunIssue,
  type DryRunIssue,
  type LegacyMigrationDryRunResult,
  type RejectedLegacyRecord,
  type SourceDryRunSummary,
  type V2StagingDataset,
} from "../migration/contracts";
import { stablePersistenceStringify } from "../persistence/envelopes";
import { sha256String } from "./hash";
import {
  V05B1_IMPORT_PIPELINE_VERSION,
  V05_IMPORT_SOURCE_TYPES,
  type V05FileFingerprint,
  type V05ImportCandidate,
  type V05ImportStoreInput,
} from "./contracts";

interface OwnerInput {
  platformCode: V05ImportStoreInput["platformCode"];
  storeId: string;
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

const isBusinessDate = (value: unknown): value is string =>
  typeof value === "string" && BUSINESS_DATE_PATTERN.test(value);

const toMetric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const toSourceStatus = (value: unknown): TmallSourceStatus =>
  value === "parsed" || value === "missing" || value === "unknown" || value === "error"
    ? value
    : "unknown";

const toDetectedSourceType = (value: unknown): V2SourceType | "unknown" =>
  V05_IMPORT_SOURCE_TYPES.includes(value as V2SourceType) ? (value as V2SourceType) : "unknown";

const isParsedSource = (
  analysis: TmallFourSourceAnalysisResult,
  sourceType: TmallSourceType,
): boolean => toSourceStatus(analysis.sourceHealth[sourceType]?.status) === "parsed";

const toDateRange = (range: TmallDateRange | undefined): DateRange | null => {
  if (!range) return null;
  if (!isBusinessDate(range.start) || !isBusinessDate(range.end)) return null;
  if (range.start > range.end) return null;
  return { start: range.start, end: range.end };
};

const importFileStatusFromHealth = (health: TmallSourceHealth | undefined): ImportFileStatus => {
  const status = toSourceStatus(health?.status);
  if (status === "parsed" || status === "missing" || status === "unknown" || status === "error") return status;
  return "unknown";
};

const buildSafeWarningCodes = (health: TmallSourceHealth | undefined): string[] => {
  if (!health) return ["source_health_missing"];
  const codes = [];
  if (health.invalidDateCount > 0) codes.push("invalid_date_count");
  if (health.invalidIdCount > 0) codes.push("invalid_id_count");
  if (health.summaryRowCount > 0) codes.push("summary_row_count");
  if (health.missingRequiredFields.length > 0) codes.push("missing_required_fields");
  if (health.unknownStatuses.length > 0) codes.push("unknown_status_count");
  health.warningTypes.forEach((_warningType, index) => codes.push(`source_warning_${index + 1}`));
  return Array.from(new Set(codes));
};

export const buildV05ImportBatchId = async ({
  platformCode,
  storeId,
  fileFingerprints,
}: {
  platformCode: V05ImportStoreInput["platformCode"];
  storeId: string;
  fileFingerprints: V05FileFingerprint[];
}): Promise<string> => {
  const payload = {
    pipelineVersion: V05B1_IMPORT_PIPELINE_VERSION,
    platformCode,
    storeId,
    files: [...fileFingerprints]
      .sort((left, right) => left.sourceType.localeCompare(right.sourceType))
      .map((item) => [item.sourceType, item.fileFingerprint] as const),
  };
  const hash = await sha256String(stablePersistenceStringify(payload));
  return `v05b1_import_${hash.slice(0, 32)}`;
};

const buildPlatform = (capturedAt: string): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: "tmall",
  platformName: "天猫",
  status: "active",
  createdAt: capturedAt,
  updatedAt: capturedAt,
});

const buildStore = (store: V05ImportStoreInput, capturedAt: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: store.platformCode,
  storeId: store.storeId,
  storeName: store.storeName,
  status: "active",
  createdAt: capturedAt,
  updatedAt: capturedAt,
});

const rejectRecord = (
  rejectedRecords: RejectedLegacyRecord[],
  recordType: RejectedLegacyRecord["recordType"],
  safeIdentity: string,
  path: string,
  issueCode: DryRunIssue["code"],
): void => {
  rejectedRecords.push({
    legacyKey: LEGACY_ANALYSIS_KEY,
    recordType,
    safeIdentity,
    issueCodes: [issueCode],
    paths: [path],
  });
};

const mapBusinessProducts = (
  facts: ProductDailyFact[],
  owner: OwnerInput,
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): { records: OwnedBusinessProductFact[]; productIds: Set<string> } => {
  const seen = new Set<string>();
  const productIds = new Set<string>();
  const records: OwnedBusinessProductFact[] = [];

  facts.forEach((fact, index) => {
    const path = `productDailyFacts[${index}]`;
    if (!isBusinessDate(fact.date)) {
      rejectRecord(rejectedRecords, "business_product_fact", path, `${path}.date`, "invalid_format");
      return;
    }
    if (!toText(fact.productId)) {
      rejectRecord(rejectedRecords, "business_product_fact", path, `${path}.productId`, "required_field");
      return;
    }
    const productId = fact.productId.trim();
    const semanticKey = `${fact.date}::${productId}`;
    if (seen.has(semanticKey)) {
      rejectRecord(rejectedRecords, "business_product_fact", semanticKey, path, "semantic_duplicate");
      return;
    }
    seen.add(semanticKey);
    productIds.add(productId);
    records.push({
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: owner.platformCode,
      storeId: owner.storeId,
      businessDate: fact.date,
      sourceType: "business_product",
      importBatchId,
      productId,
      productName: toText(fact.productName),
      gmv: toMetric(fact.gmv),
      gsv: toMetric(fact.gsv),
      visitors: toMetric(fact.visitors),
      paidBuyers: toMetric(fact.paidBuyers),
      paidOrders: null,
      conversionRate: toMetric(fact.conversionRate),
      avgOrderValue: toMetric(fact.avgOrderValue),
      favorites: toMetric(fact.favorites),
      cartAdditions: toMetric(fact.cartAdditions),
    });
  });

  return { records, productIds };
};

const mapAdProducts = (
  facts: AdProductDailyFact[],
  owner: OwnerInput,
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): { records: OwnedAdProductFact[]; productIds: Set<string> } => {
  const seen = new Set<string>();
  const productIds = new Set<string>();
  const records: OwnedAdProductFact[] = [];

  facts.forEach((fact, index) => {
    const path = `adProductDailyFacts[${index}]`;
    if (!isBusinessDate(fact.date)) {
      rejectRecord(rejectedRecords, "ad_product_fact", path, `${path}.date`, "invalid_format");
      return;
    }
    if (!toText(fact.productId)) {
      rejectRecord(rejectedRecords, "ad_product_fact", path, `${path}.productId`, "required_field");
      return;
    }
    const productId = fact.productId.trim();
    const semanticKey = `${fact.date}::${productId}`;
    if (seen.has(semanticKey)) {
      rejectRecord(rejectedRecords, "ad_product_fact", semanticKey, path, "semantic_duplicate");
      return;
    }
    seen.add(semanticKey);
    productIds.add(productId);
    records.push({
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: owner.platformCode,
      storeId: owner.storeId,
      businessDate: fact.date,
      sourceType: "ad_product",
      importBatchId,
      productId,
      adSpend: toMetric(fact.adSpend),
      adSalesAmount: toMetric(fact.adTransactionAmount),
      impressions: toMetric(fact.impressions),
      clicks: toMetric(fact.clicks),
      clickRate: toMetric(fact.clickRate),
      adRoi: toMetric(fact.roi),
    });
  });

  return { records, productIds };
};

const mapAdPlans = (
  facts: AdPlanDailyFact[],
  owner: OwnerInput,
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): OwnedAdPlanFact[] => {
  const seen = new Set<string>();
  const records: OwnedAdPlanFact[] = [];

  facts.forEach((fact, index) => {
    const path = `adPlanDailyFacts[${index}]`;
    if (!isBusinessDate(fact.date)) {
      rejectRecord(rejectedRecords, "ad_plan_fact", path, `${path}.date`, "invalid_format");
      return;
    }
    if (!toText(fact.planId)) {
      rejectRecord(rejectedRecords, "ad_plan_fact", path, `${path}.planId`, "required_field");
      return;
    }
    const planId = fact.planId.trim();
    const semanticKey = `${fact.date}::${planId}`;
    if (seen.has(semanticKey)) {
      rejectRecord(rejectedRecords, "ad_plan_fact", semanticKey, path, "semantic_duplicate");
      return;
    }
    seen.add(semanticKey);
    records.push({
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: owner.platformCode,
      storeId: owner.storeId,
      businessDate: fact.date,
      sourceType: "ad_plan",
      importBatchId,
      planId,
      planName: toText(fact.planName),
      adSpend: toMetric(fact.adSpend),
      adSalesAmount: toMetric(fact.transactionAmount),
      impressions: toMetric(fact.impressions),
      clicks: toMetric(fact.clicks),
      adRoi: toMetric(fact.roi),
    });
  });

  return records;
};

const safeRange = (
  range: TmallDateRange | null,
  records: Array<{ date: string }>,
): DateRange | null => {
  if (isBusinessDate(range?.start) && isBusinessDate(range?.end) && range.start <= range.end) {
    return { start: range.start, end: range.end };
  }
  const dates = records.map((record) => record.date).filter(isBusinessDate).sort();
  if (!dates.length) return null;
  return { start: dates[0]!, end: dates[dates.length - 1]! };
};

const safeInputRange = (range: TmallDateRange | null): DateRange | null =>
  isBusinessDate(range?.start) && isBusinessDate(range?.end) && range.start <= range.end
    ? { start: range.start, end: range.end }
    : null;

const sumMetric = <TRecord>(records: TRecord[], read: (record: TRecord) => unknown): number | null => {
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

const dailyBase = (
  owner: OwnerInput,
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
  platformCode: owner.platformCode,
  storeId: owner.storeId,
  businessDate,
  sourceType: "after_sales",
  importBatchId,
  dateBasis,
  productId: null,
});

const rangeBase = (
  owner: OwnerInput,
  dateRange: DateRange,
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
  platformCode: owner.platformCode,
  storeId: owner.storeId,
  sourceType: "after_sales",
  importBatchId,
  dateRange,
  dateBasis,
  productId,
});

const derivedBase = (
  owner: OwnerInput,
  dateRange: DateRange,
  importBatchId: string,
): Pick<
  OwnedAfterSalesOperationalSnapshot,
  "schemaVersion" | "platformCode" | "storeId" | "sourceType" | "importBatchId" | "dateRange"
> => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: owner.platformCode,
  storeId: owner.storeId,
  sourceType: "after_sales",
  importBatchId,
  dateRange,
});

const pushRejectedDate = (rejectedRecords: RejectedLegacyRecord[], path: string): void => {
  rejectedRecords.push({
    legacyKey: LEGACY_ANALYSIS_KEY,
    recordType: "after_sales_aggregate",
    safeIdentity: path,
    issueCodes: ["invalid_format"],
    paths: [path],
  });
};

const mapAfterSalesDaily = (
  owner: OwnerInput,
  aggregates: AfterSalesAggregates,
  importBatchId: string,
  rejectedRecords: RejectedLegacyRecord[],
): OwnedAfterSalesDailyAggregate[] => [
  ...aggregates.byApplyDate.flatMap((record: AfterSalesDateAggregate, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.byApplyDate[${index}].date`);
      return [];
    }
    return [{
      ...dailyBase(owner, record.date, "apply_date", importBatchId),
      refundAmount: toMetric(record.refundApplyAmount),
      refundOrderCount: toMetric(record.refundApplyCount),
      afterSalesApplyCount: toMetric(record.refundApplyCount),
    }];
  }),
  ...aggregates.bySuccessDate.flatMap((record: AfterSalesSuccessDateAggregate, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.bySuccessDate[${index}].date`);
      return [];
    }
    return [{
      ...dailyBase(owner, record.date, "success_date", importBatchId),
      refundAmount: toMetric(record.refundSuccessTotalAmount),
      refundOrderCount: toMetric(record.refundSuccessCount),
      afterSalesApplyCount: null,
    }];
  }),
  ...aggregates.byPaymentDate.flatMap((record: AfterSalesPaymentDateAggregate, index) => {
    if (!isBusinessDate(record.date)) {
      pushRejectedDate(rejectedRecords, `afterSalesAggregates.byPaymentDate[${index}].date`);
      return [];
    }
    return [{
      ...dailyBase(owner, record.date, "payment_date", importBatchId),
      refundAmount: toMetric(record.refundAttributionAmount),
      refundOrderCount: toMetric(record.refundAttributionCount),
      afterSalesApplyCount: null,
    }];
  }),
];

const isSafeDistributionLabel = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const label = value.trim();
  if (!label || label.length > SAFE_LABEL_MAX_LENGTH) return false;
  if (CONTROL_CHARACTER_PATTERN.test(label)) return false;
  return !SENSITIVE_LABEL_PARTS.some((part) => label.includes(part));
};

const pushAfterSalesIssue = (
  issues: DryRunIssue[],
  code: DryRunIssue["code"],
  path: string,
  message: string,
): void => {
  issues.push(createDryRunIssue(code, path, message));
};

const mapAfterSalesDistribution = (
  records: DistributionItem[],
  distributionKind: AfterSalesDistributionKind,
  path: string,
  owner: OwnerInput,
  dateRange: DateRange | null,
  importBatchId: string,
  capturedAt: string,
  productId: string | null,
  issues: DryRunIssue[],
): OwnedAfterSalesDistributionItem[] => {
  if (records.length > 0 && !dateRange) {
    pushAfterSalesIssue(
      issues,
      "after_sales_aggregate_unmapped",
      path,
      "After-sales safe aggregate could not be mapped without a verified date range.",
    );
    return [];
  }
  if (!dateRange) return [];

  return records.flatMap((record, index) => {
    if (!isSafeDistributionLabel(record.label)) {
      pushAfterSalesIssue(
        issues,
        "after_sales_distribution_label_unsafe",
        `${path}[${index}].label`,
        "After-sales distribution label is unsafe and cannot enter V2 storage.",
      );
      return [];
    }
    if (!Number.isInteger(record.count) || record.count < 1) {
      pushAfterSalesIssue(
        issues,
        "after_sales_count_reconciliation_failed",
        `${path}[${index}].count`,
        "After-sales distribution count must be a positive integer.",
      );
      return [];
    }
    return [{
      ...derivedBase(owner, dateRange, importBatchId),
      capturedAt,
      distributionKind,
      safeLabel: record.label.trim(),
      count: record.count,
      productId,
    }];
  });
};

const mapAfterSalesAggregatesForOwner = ({
  aggregates,
  dateRange,
  owner,
  importBatchId,
  capturedAt,
  rejectedRecords,
}: {
  aggregates: AfterSalesAggregates;
  dateRange: TmallDateRange | null;
  owner: OwnerInput;
  importBatchId: string;
  capturedAt: string;
  rejectedRecords: RejectedLegacyRecord[];
}): {
  dailyAggregates: OwnedAfterSalesDailyAggregate[];
  rangeAggregates: OwnedAfterSalesRangeAggregate[];
  operationalSnapshots: OwnedAfterSalesOperationalSnapshot[];
  distributionItems: OwnedAfterSalesDistributionItem[];
  issues: DryRunIssue[];
  unmappedSafeAggregateSummary: string[];
} => {
  const issues: DryRunIssue[] = [];
  const unmappedSafeAggregateSummary: string[] = [];
  const productSummary = Array.isArray(aggregates.productSummary) ? aggregates.productSummary : [];
  const byApplyDate = Array.isArray(aggregates.byApplyDate) ? aggregates.byApplyDate : [];
  const bySuccessDate = Array.isArray(aggregates.bySuccessDate) ? aggregates.bySuccessDate : [];
  const byPaymentDate = Array.isArray(aggregates.byPaymentDate) ? aggregates.byPaymentDate : [];
  const inputRange = safeInputRange(dateRange);

  const dailyAggregates = mapAfterSalesDaily(
    owner,
    {
      ...aggregates,
      byApplyDate,
      bySuccessDate,
      byPaymentDate,
    },
    importBatchId,
    rejectedRecords,
  );
  const rangeAggregates: OwnedAfterSalesRangeAggregate[] = [];
  const applyRange = safeRange(dateRange, byApplyDate);
  if (applyRange && byApplyDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(owner, applyRange, "apply_date", importBatchId),
      refundAmount: sumMetric(byApplyDate, (record) => record.refundApplyAmount),
      refundOrderCount: sumMetric(byApplyDate, (record) => record.refundApplyCount),
      afterSalesApplyCount: sumMetric(byApplyDate, (record) => record.refundApplyCount),
    });
  }
  const successRange = safeRange(dateRange, bySuccessDate);
  if (successRange && bySuccessDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(owner, successRange, "success_date", importBatchId),
      refundAmount: sumMetric(bySuccessDate, (record) => record.refundSuccessTotalAmount),
      refundOrderCount: sumMetric(bySuccessDate, (record) => record.refundSuccessCount),
      afterSalesApplyCount: null,
    });
  }
  const paymentRange = safeRange(dateRange, byPaymentDate);
  if (paymentRange && byPaymentDate.length > 0) {
    rangeAggregates.push({
      ...rangeBase(owner, paymentRange, "payment_date", importBatchId),
      refundAmount: sumMetric(byPaymentDate, (record) => record.refundAttributionAmount),
      refundOrderCount: sumMetric(byPaymentDate, (record) => record.refundAttributionCount),
      afterSalesApplyCount: null,
    });
  }

  if (productSummary.length > 0 && !inputRange) {
    unmappedSafeAggregateSummary.push("product_summary");
    pushAfterSalesIssue(
      issues,
      "after_sales_aggregate_unmapped",
      "afterSalesAggregates.productSummary",
      "After-sales product summary could not be mapped without a verified date range.",
    );
  }
  if (inputRange) {
    productSummary.forEach((record) => {
      rangeAggregates.push({
        ...rangeBase(owner, inputRange, "apply_date", importBatchId, record.productId),
        refundAmount: toMetric(record.refundApplyAmount),
        refundOrderCount: toMetric(record.refundApplyCount),
        afterSalesApplyCount: toMetric(record.refundApplyCount),
      });
      rangeAggregates.push({
        ...rangeBase(owner, inputRange, "success_date", importBatchId, record.productId),
        refundAmount: toMetric(record.refundSuccessTotalAmount),
        refundOrderCount: toMetric(record.refundSuccessCount),
        afterSalesApplyCount: null,
      });
    });
  }

  const operationalSnapshots = inputRange
    ? productSummary.map((record: AfterSalesProductSummary) => ({
      ...derivedBase(owner, inputRange, importBatchId),
      capturedAt,
      productId: record.productId,
      pendingCount: toMetric(record.pendingCount),
      overduePendingCount: toMetric(record.overduePendingCount),
      customerServiceInterventionCount: toMetric(record.customerServiceInterventionCount),
      avgAfterSalesDurationHours: toMetric(record.avgAfterSalesDurationHours),
    }))
    : [];

  const reasonDistribution = Array.isArray(aggregates.reasonDistribution) ? aggregates.reasonDistribution : [];
  const statusDistribution = Array.isArray(aggregates.statusDistribution) ? aggregates.statusDistribution : [];
  const unknownStatus = Array.isArray(aggregates.unknownStatus) ? aggregates.unknownStatus : [];
  const distributionItems = [
    ...mapAfterSalesDistribution(
      reasonDistribution,
      "reason_distribution",
      "afterSalesAggregates.reasonDistribution",
      owner,
      inputRange,
      importBatchId,
      capturedAt,
      null,
      issues,
    ),
    ...mapAfterSalesDistribution(
      statusDistribution,
      "status_distribution",
      "afterSalesAggregates.statusDistribution",
      owner,
      inputRange,
      importBatchId,
      capturedAt,
      null,
      issues,
    ),
    ...mapAfterSalesDistribution(
      unknownStatus.map((label) => ({ label, count: 1 })),
      "unknown_status_distribution",
      "afterSalesAggregates.unknownStatus",
      owner,
      inputRange,
      importBatchId,
      capturedAt,
      null,
      issues,
    ),
    ...productSummary.flatMap((summary, index) =>
      mapAfterSalesDistribution(
        Array.isArray(summary.topReasons) ? summary.topReasons : [],
        "reason_distribution",
        `afterSalesAggregates.productSummary[${index}].topReasons`,
        owner,
        inputRange,
        importBatchId,
        capturedAt,
        summary.productId,
        issues,
      ),
    ),
  ];

  return {
    dailyAggregates,
    rangeAggregates,
    operationalSnapshots,
    distributionItems,
    issues,
    unmappedSafeAggregateSummary,
  };
};

const buildImportFiles = ({
  analysis,
  importBatchId,
  fileFingerprints,
  owner,
  capturedAt,
}: {
  analysis: TmallFourSourceAnalysisResult;
  importBatchId: string;
  fileFingerprints: V05FileFingerprint[];
  owner: OwnerInput;
  capturedAt: string;
}): ImportFileRecord[] => {
  const fingerprintBySource = new Map(fileFingerprints.map((item) => [item.sourceType, item.fileFingerprint]));
  return V05_IMPORT_SOURCE_TYPES.map((sourceType) => {
    const health = analysis.sourceHealth[sourceType as TmallSourceType];
    const fingerprint = fingerprintBySource.get(sourceType) ?? "missing_fingerprint";
    return {
      schemaVersion: V2_SCHEMA_VERSION,
      importFileId: `v05b1_file_${sourceType}_${fingerprint.slice(0, 24)}`,
      importBatchId,
      platformCode: owner.platformCode,
      storeId: owner.storeId,
      sourceType,
      detectedSourceType: toDetectedSourceType(health?.sourceType),
      fileFingerprint: fingerprint,
      rowCount: typeof health?.rowCount === "number" && Number.isInteger(health.rowCount) && health.rowCount > 0
        ? health.rowCount
        : 0,
      headerRowNumber: typeof health?.headerRowNumber === "number" && Number.isInteger(health.headerRowNumber) && health.headerRowNumber > 0
        ? health.headerRowNumber
        : null,
      dateRange: toDateRange(analysis.dateRanges[sourceType as TmallSourceType]),
      status: importFileStatusFromHealth(health),
      safeWarningCodes: buildSafeWarningCodes(health),
      createdAt: capturedAt,
      updatedAt: capturedAt,
    };
  });
};

const buildSourceSummary = (
  analysis: TmallFourSourceAnalysisResult,
  importFiles: ImportFileRecord[],
  unmappedSafeAggregateSummary: string[],
): SourceDryRunSummary[] =>
  V05_IMPORT_SOURCE_TYPES.map((sourceType) => {
    const health = analysis.sourceHealth[sourceType as TmallSourceType];
    const file = importFiles.find((item) => item.sourceType === sourceType);
    return {
      sourceType,
      status: toSourceStatus(health?.status),
      rowCount: typeof health?.rowCount === "number" && Number.isFinite(health.rowCount)
        ? Math.max(0, Math.trunc(health.rowCount))
        : 0,
      headerRowNumber: file?.headerRowNumber ?? null,
      importFileId: file?.importFileId ?? null,
      safeWarningCodeCount: file?.safeWarningCodes.length ?? 0,
      unmappedSafeAggregateSummary: sourceType === "after_sales" ? unmappedSafeAggregateSummary : [],
    };
  });

const countAfterSalesAggregateRecords = (analysis: TmallFourSourceAnalysisResult): number => {
  const aggregates = analysis.afterSalesAggregates;
  return [
    aggregates.byApplyDate,
    aggregates.bySuccessDate,
    aggregates.byPaymentDate,
    aggregates.reasonDistribution,
    aggregates.statusDistribution,
    aggregates.productSummary,
    aggregates.unknownStatus,
  ].reduce((total, records) => total + (Array.isArray(records) ? records.length : 0), 0);
};

const createSourceStateMismatchIssue = (
  sourceType: TmallSourceType,
  recordCount: number,
): DryRunIssue =>
  createDryRunIssue(
    "legacy_source_state_mismatch",
    `sourceHealth.${sourceType}.status`,
    "Source health is not parsed, but corresponding safe fact candidates exist.",
    "error",
    { sourceType, recordCount },
  );

const buildManifest = ({
  importBatchId,
  capturedAt,
  issueCodes,
}: {
  importBatchId: string;
  capturedAt: string;
  issueCodes: string[];
}): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId: `v05b1_manifest_${importBatchId}`,
  migrationVersion: V05B1_IMPORT_PIPELINE_VERSION,
  status: issueCodes.length > 0 ? "failed" : "success",
  migratedFromKeys: [],
  importBatchId,
  legacyValueHash: null,
  startedAt: capturedAt,
  completedAt: capturedAt,
  safeIssueCodes: issueCodes,
});

const buildDataset = ({
  datasetId,
  platform,
  store,
  importBatch,
  importFiles,
  businessProductFacts,
  adProductFacts,
  adPlanFacts,
  afterSalesDailyAggregates,
  afterSalesRangeAggregates,
  afterSalesOperationalSnapshots,
  afterSalesDistributionItems,
  manifest,
}: {
  datasetId: string;
  platform: PlatformRecord;
  store: StoreRecord;
  importBatch: ImportBatchRecord;
  importFiles: ImportFileRecord[];
  businessProductFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  afterSalesDailyAggregates: OwnedAfterSalesDailyAggregate[];
  afterSalesRangeAggregates: OwnedAfterSalesRangeAggregate[];
  afterSalesOperationalSnapshots: OwnedAfterSalesOperationalSnapshot[];
  afterSalesDistributionItems: OwnedAfterSalesDistributionItem[];
  manifest: MigrationManifest;
}): V2StagingDataset => ({
  schemaVersion: V2_SCHEMA_VERSION,
  datasetId,
  platforms: [platform],
  stores: [store],
  importBatches: [importBatch],
  importFiles,
  businessProductFacts,
  adProductFacts,
  adPlanFacts,
  afterSalesDailyAggregates,
  afterSalesRangeAggregates,
  afterSalesOperationalSnapshots,
  afterSalesDistributionItems,
  series: [],
  trackedProducts: [],
  targets: [],
  legacyTargetCandidates: [],
  migrationManifests: [manifest],
  activeDatasetPointer: null,
});

const buildFingerprintPayload = (dataset: V2StagingDataset): unknown => ({
  schemaVersion: dataset.schemaVersion,
  platforms: dataset.platforms,
  stores: dataset.stores,
  importBatches: dataset.importBatches,
  importFiles: dataset.importFiles,
  businessProductFacts: dataset.businessProductFacts,
  adProductFacts: dataset.adProductFacts,
  adPlanFacts: dataset.adPlanFacts,
  afterSalesDailyAggregates: dataset.afterSalesDailyAggregates,
  afterSalesRangeAggregates: dataset.afterSalesRangeAggregates,
  afterSalesOperationalSnapshots: dataset.afterSalesOperationalSnapshots,
  afterSalesDistributionItems: dataset.afterSalesDistributionItems,
  series: dataset.series,
  trackedProducts: dataset.trackedProducts,
  targets: dataset.targets,
  legacyTargetCandidates: dataset.legacyTargetCandidates,
  migrationManifests: dataset.migrationManifests,
});

export const finalizeV05ImportDryRun = async ({
  dataset,
  sourceSummary,
  issues,
}: {
  dataset: V2StagingDataset;
  sourceSummary: SourceDryRunSummary[];
  issues: DryRunIssue[];
}): Promise<LegacyMigrationDryRunResult> => {
  const recordCounts = countStagingDatasetRecords(dataset);
  const businessDatasetFingerprint = await sha256String(stablePersistenceStringify(buildFingerprintPayload(dataset)));
  const manifestFingerprint = await sha256String(
    stablePersistenceStringify({
      pipelineVersion: V05B1_IMPORT_PIPELINE_VERSION,
      datasetId: dataset.datasetId,
      manifest: dataset.migrationManifests[0] ?? null,
      recordCounts,
    }),
  );
  return {
    status: issues.some((issue) => issue.severity === "error") ? "blocked" : "ready",
    futureActivationEligible: !issues.some((issue) => issue.severity === "error"),
    migrationVersion: V05B1_IMPORT_PIPELINE_VERSION,
    defaultOwner: DEFAULT_TMAIL_OWNER,
    businessDatasetFingerprint,
    manifestFingerprint,
    stagingDataset: dataset,
    manifestCandidate: null,
    proposedActiveDatasetPointer: null,
    legacyKeySummary: [],
    sourceSummary,
    recordCounts,
    rejectedRecords: [],
    ignoredLegacyKeys: [],
    issues,
  };
};

export const buildV05TmallImportCandidate = async ({
  analysis,
  store,
  fileFingerprints,
  capturedAt,
}: {
  analysis: TmallFourSourceAnalysisResult;
  store: V05ImportStoreInput;
  fileFingerprints: V05FileFingerprint[];
  capturedAt: string;
}): Promise<V05ImportCandidate> => {
  const owner = { platformCode: store.platformCode, storeId: store.storeId };
  const importBatchId = await buildV05ImportBatchId({
    platformCode: store.platformCode,
    storeId: store.storeId,
    fileFingerprints,
  });
  const platform = buildPlatform(capturedAt);
  const storeRecord = buildStore(store, capturedAt);
  const importFiles = buildImportFiles({ analysis, importBatchId, fileFingerprints, owner, capturedAt });
  const parsedSourceCount = importFiles.filter((file) => file.status === "parsed").length;
  const importBatch: ImportBatchRecord = {
    schemaVersion: V2_SCHEMA_VERSION,
    importBatchId,
    platformCode: store.platformCode,
    storeId: store.storeId,
    importStartedAt: capturedAt,
    importCompletedAt: capturedAt,
    status: parsedSourceCount === V05_IMPORT_SOURCE_TYPES.length ? "success" : "failed",
    sourceTypes: V05_IMPORT_SOURCE_TYPES,
    createdAt: capturedAt,
    updatedAt: capturedAt,
  };

  const rejectedRecords: RejectedLegacyRecord[] = [];
  const issues: DryRunIssue[] = [];
  const rawBusinessProductFacts = Array.isArray(analysis.productDailyFacts) ? analysis.productDailyFacts : [];
  const rawAdProductFacts = Array.isArray(analysis.adProductDailyFacts) ? analysis.adProductDailyFacts : [];
  const rawAdPlanFacts = Array.isArray(analysis.adPlanDailyFacts) ? analysis.adPlanDailyFacts : [];
  const afterSalesRecordCount = countAfterSalesAggregateRecords(analysis);

  if (!isParsedSource(analysis, "business_product") && rawBusinessProductFacts.length > 0) {
    issues.push(createSourceStateMismatchIssue("business_product", rawBusinessProductFacts.length));
  }
  if (!isParsedSource(analysis, "ad_product") && rawAdProductFacts.length > 0) {
    issues.push(createSourceStateMismatchIssue("ad_product", rawAdProductFacts.length));
  }
  if (!isParsedSource(analysis, "ad_plan") && rawAdPlanFacts.length > 0) {
    issues.push(createSourceStateMismatchIssue("ad_plan", rawAdPlanFacts.length));
  }
  if (!isParsedSource(analysis, "after_sales") && afterSalesRecordCount > 0) {
    issues.push(createSourceStateMismatchIssue("after_sales", afterSalesRecordCount));
  }

  const businessProducts = mapBusinessProducts(
    isParsedSource(analysis, "business_product") ? rawBusinessProductFacts : [],
    owner,
    importBatchId,
    rejectedRecords,
  );
  const adProductFacts = mapAdProducts(
    isParsedSource(analysis, "ad_product") ? rawAdProductFacts : [],
    owner,
    importBatchId,
    rejectedRecords,
  );
  const adPlanFacts = mapAdPlans(
    isParsedSource(analysis, "ad_plan") ? rawAdPlanFacts : [],
    owner,
    importBatchId,
    rejectedRecords,
  );
  const afterSales = isParsedSource(analysis, "after_sales")
    ? mapAfterSalesAggregatesForOwner({
      aggregates: analysis.afterSalesAggregates,
      dateRange: analysis.dateRanges.after_sales,
      owner,
      importBatchId,
      capturedAt,
      rejectedRecords,
    })
    : {
      dailyAggregates: [],
      rangeAggregates: [],
      operationalSnapshots: [],
      distributionItems: [],
      issues: [],
      unmappedSafeAggregateSummary: [],
    };
  issues.push(...afterSales.issues);
  if (rejectedRecords.length > 0) {
    issues.push(
      createDryRunIssue(
        "invalid_format",
        "analysis.records",
        "Some analysis records could not be represented as V2 facts.",
        "error",
        { rejectedRecordCount: rejectedRecords.length },
      ),
    );
  }

  const safeIssueCodes = Array.from(new Set(issues.map((issue) => issue.code))).sort();
  const manifest = buildManifest({ importBatchId, capturedAt, issueCodes: safeIssueCodes });
  const baseDataset = buildDataset({
    datasetId: "pending",
    platform,
    store: storeRecord,
    importBatch,
    importFiles,
    businessProductFacts: businessProducts.records,
    adProductFacts: adProductFacts.records,
    adPlanFacts,
    afterSalesDailyAggregates: afterSales.dailyAggregates,
    afterSalesRangeAggregates: afterSales.rangeAggregates,
    afterSalesOperationalSnapshots: afterSales.operationalSnapshots,
    afterSalesDistributionItems: afterSales.distributionItems,
    manifest,
  });
  const datasetId = `v05b1_dataset_${(await sha256String(stablePersistenceStringify(buildFingerprintPayload(baseDataset)))).slice(0, 32)}`;
  const dataset = { ...baseDataset, datasetId };
  const sourceSummary = buildSourceSummary(analysis, importFiles, afterSales.unmappedSafeAggregateSummary);
  const dryRun = await finalizeV05ImportDryRun({ dataset, sourceSummary, issues });

  return {
    analysis,
    platformCode: store.platformCode,
    store,
    importBatchId,
    capturedAt,
    fileFingerprints,
    dataset,
    dryRun,
  };
};
