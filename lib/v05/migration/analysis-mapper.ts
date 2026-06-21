import type {
  AdPlanDailyFact,
  AdProductDailyFact,
  ProductDailyFact,
  TmallDateRange,
  TmallSourceHealth,
  TmallSourceStatus,
  TmallSourceType,
  TmallStoredAnalysisResult,
} from "../../../types/tmall";
import {
  V2_MIGRATION_VERSION,
  V2_SCHEMA_VERSION,
  type DateRange,
  type ImportBatchRecord,
  type ImportFileRecord,
  type ImportFileStatus,
  type OwnedAdPlanFact,
  type OwnedAdProductFact,
  type OwnedBusinessProductFact,
  type PlatformRecord,
  type StoreRecord,
  type V2SourceType,
} from "../domain/models";
import { buildDeterministicLegacyImportBatchId } from "../domain/legacy";
import { mapAfterSalesAggregatesToV2 } from "./after-sales-mapper";
import {
  DEFAULT_TMAIL_OWNER,
  LEGACY_ANALYSIS_KEY,
  createDryRunIssue,
  type AnalysisMappingResult,
  type DryRunIssue,
  type RejectedLegacyRecord,
  type SourceDryRunSummary,
} from "./contracts";

interface AnalysisMappingInput {
  analysis: TmallStoredAnalysisResult;
  analysisHash: string;
  capturedAt: string;
  migrationVersion?: string;
}

const SOURCE_TYPES: V2SourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  SOURCE_TYPES.includes(value as V2SourceType) ? (value as V2SourceType) : "unknown";

const isParsedSource = (
  analysis: TmallStoredAnalysisResult,
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
  if (status === "parsed" || status === "missing" || status === "unknown" || status === "error") {
    return status;
  }
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
  health.warningTypes.forEach((_warningType, index) => {
    codes.push(`source_warning_${index + 1}`);
  });

  return Array.from(new Set(codes));
};

const buildSafeImportFileId = (
  sourceType: V2SourceType,
  analysisHash: string,
  migrationVersion: string,
): string =>
  [
    "legacy_import_file",
    sourceType,
    analysisHash.slice(0, 16),
    encodeURIComponent(migrationVersion).replace(/%/g, "~"),
  ].join("_");

const buildPlatform = (capturedAt: string): PlatformRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  platformName: "天猫",
  status: "active",
  createdAt: capturedAt,
  updatedAt: capturedAt,
});

const buildStore = (capturedAt: string): StoreRecord => ({
  schemaVersion: V2_SCHEMA_VERSION,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  storeName: DEFAULT_TMAIL_OWNER.storeName,
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
      platformCode: DEFAULT_TMAIL_OWNER.platformCode,
      storeId: DEFAULT_TMAIL_OWNER.storeId,
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
      platformCode: DEFAULT_TMAIL_OWNER.platformCode,
      storeId: DEFAULT_TMAIL_OWNER.storeId,
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
      platformCode: DEFAULT_TMAIL_OWNER.platformCode,
      storeId: DEFAULT_TMAIL_OWNER.storeId,
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

const buildImportFiles = (
  analysis: TmallStoredAnalysisResult,
  analysisHash: string,
  importBatchId: string,
  capturedAt: string,
  migrationVersion: string,
): ImportFileRecord[] =>
  SOURCE_TYPES.map((sourceType) => {
    const health = analysis.sourceHealth[sourceType as TmallSourceType];
    return {
      schemaVersion: V2_SCHEMA_VERSION,
      importFileId: buildSafeImportFileId(sourceType, analysisHash, migrationVersion),
      importBatchId,
      platformCode: DEFAULT_TMAIL_OWNER.platformCode,
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      sourceType,
      detectedSourceType: toDetectedSourceType(health?.sourceType),
      fileFingerprint: `legacy_${sourceType}_${analysisHash.slice(0, 24)}`,
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

const buildSourceSummary = (
  analysis: TmallStoredAnalysisResult,
  importFiles: ImportFileRecord[],
  unmappedSafeAggregateSummary: string[],
): SourceDryRunSummary[] =>
  SOURCE_TYPES.map((sourceType) => {
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

const countAfterSalesAggregateRecords = (analysis: TmallStoredAnalysisResult): number => {
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
    "Legacy source health is not parsed, but corresponding safe fact candidates exist.",
    "error",
    { sourceType, recordCount },
  );

export const mapTmallAnalysisToV2 = ({
  analysis,
  analysisHash,
  capturedAt,
  migrationVersion = V2_MIGRATION_VERSION,
}: AnalysisMappingInput): AnalysisMappingResult => {
  const importBatchId = buildDeterministicLegacyImportBatchId({
    legacyStorageKey: LEGACY_ANALYSIS_KEY,
    legacyValueHash: analysisHash,
    migrationVersion,
  });

  const platform = buildPlatform(capturedAt);
  const store = buildStore(capturedAt);
  const importFiles = buildImportFiles(
    analysis,
    analysisHash,
    importBatchId,
    capturedAt,
    migrationVersion,
  );
  const parsedSourceCount = importFiles.filter((file) => file.status === "parsed").length;
  const importBatch: ImportBatchRecord = {
    schemaVersion: V2_SCHEMA_VERSION,
    importBatchId,
    platformCode: DEFAULT_TMAIL_OWNER.platformCode,
    storeId: DEFAULT_TMAIL_OWNER.storeId,
    importStartedAt: capturedAt,
    importCompletedAt: capturedAt,
    status: parsedSourceCount === SOURCE_TYPES.length
      ? "success"
      : parsedSourceCount > 0
        ? "partial_success"
        : "failed",
    sourceTypes: SOURCE_TYPES,
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
    importBatchId,
    rejectedRecords,
  );
  const adProductFacts = mapAdProducts(
    isParsedSource(analysis, "ad_product") ? rawAdProductFacts : [],
    importBatchId,
    rejectedRecords,
  );
  const adPlanFacts = mapAdPlans(
    isParsedSource(analysis, "ad_plan") ? rawAdPlanFacts : [],
    importBatchId,
    rejectedRecords,
  );
  const afterSales = isParsedSource(analysis, "after_sales")
    ? mapAfterSalesAggregatesToV2({
      aggregates: analysis.afterSalesAggregates,
      dateRange: analysis.dateRanges.after_sales,
      importBatchId,
      capturedAt,
    })
    : {
      dailyAggregates: [],
      rangeAggregates: [],
      operationalSnapshots: [],
      distributionItems: [],
      rejectedRecords: [],
      issues: [],
      unmappedSafeAggregateSummary: [],
    };

  issues.push(...afterSales.issues);
  rejectedRecords.push(...afterSales.rejectedRecords);
  if (rejectedRecords.length > 0) {
    issues.push(
      createDryRunIssue(
        "invalid_format",
        "analysis.records",
        "Some legacy analysis records could not be represented as V2 facts.",
        "error",
        { rejectedRecordCount: rejectedRecords.length },
      ),
    );
  }

  return {
    platform,
    store,
    importBatch,
    importFiles,
    businessProductFacts: businessProducts.records,
    adProductFacts: adProductFacts.records,
    adPlanFacts,
    afterSalesDailyAggregates: afterSales.dailyAggregates,
    afterSalesRangeAggregates: afterSales.rangeAggregates,
    afterSalesOperationalSnapshots: afterSales.operationalSnapshots,
    afterSalesDistributionItems: afterSales.distributionItems,
    sourceSummary: buildSourceSummary(
      analysis,
      importFiles,
      afterSales.unmappedSafeAggregateSummary,
    ),
    rejectedRecords,
    issues,
    productIds: new Set([
      ...businessProducts.productIds,
      ...adProductFacts.productIds,
    ]),
    parsedSourceCount,
    sourceCount: SOURCE_TYPES.length,
  };
};
