import type {
  ImportBatchRecord,
  ImportFileRecord,
  LegacyTargetCandidate,
  MigrationManifest,
  OwnedAdPlanFact,
  OwnedAdProductFact,
  OwnedAfterSalesDailyAggregate,
  OwnedAfterSalesRangeAggregate,
  OwnedBusinessProductFact,
  PlatformRecord,
  SeriesRecord,
  StoreRecord,
  TargetRecord,
  V2Dataset,
  V2_MIGRATION_VERSION,
  V2SourceType,
} from "../domain/models";
import type { ValidationIssue, ValidationIssueCode, ValidationSeverity } from "../domain/results";

export const LEGACY_ANALYSIS_KEY = "airburg_tmall_analysis_v2" as const;
export const LEGACY_SERIES_KEY = "airburg_tmall_series_groups_v1" as const;
export const LEGACY_TARGETS_KEY = "airburg_tmall_targets_v1" as const;
export const LEGACY_LAST_ANALYSIS_KEY = "airburg:last-analysis" as const;
export const LEGACY_DEMO_SESSION_KEY = "airburg:demo-session" as const;

export const LEGACY_STORAGE_KEYS = [
  LEGACY_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
] as const;

export type LegacyStorageKey = (typeof LEGACY_STORAGE_KEYS)[number];

export const DEFAULT_TMAIL_OWNER = {
  platformCode: "tmall",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
} as const;

export type DryRunStatus = "empty" | "ready" | "ready_partial" | "blocked" | "migration_failed";

export type MigrationOnlyIssueCode =
  | "legacy_snapshot_invalid"
  | "legacy_key_missing"
  | "legacy_parse_failed"
  | "hash_provider_unavailable"
  | "ambiguous_after_sales_range_basis"
  | "ignored_deprecated_preview"
  | "ignored_non_business_session"
  | "memory_validation_failed";

export type DryRunIssueCode = ValidationIssueCode | MigrationOnlyIssueCode;

export interface DryRunIssue {
  code: DryRunIssueCode;
  path: string;
  message: string;
  severity: ValidationSeverity;
  details?: Record<string, string | number | boolean | null>;
}

export interface LegacyStorageSnapshot {
  capturedAt: string;
  values: Record<LegacyStorageKey, string | null>;
}

export interface LegacyKeySummary {
  key: LegacyStorageKey;
  present: boolean;
  rawLength: number;
  valueHash: string | null;
}

export interface IgnoredLegacyKeySummary {
  key: typeof LEGACY_LAST_ANALYSIS_KEY | typeof LEGACY_DEMO_SESSION_KEY;
  present: boolean;
  reason: "ignored_deprecated_preview" | "ignored_non_business_session";
}

export interface SourceDryRunSummary {
  sourceType: V2SourceType;
  status: "parsed" | "missing" | "unknown" | "error";
  rowCount: number;
  headerRowNumber: number | null;
  importFileId: string | null;
  safeWarningCodeCount: number;
  unmappedSafeAggregateSummary: string[];
}

export interface DryRunRecordCounts {
  platforms: number;
  stores: number;
  importBatches: number;
  importFiles: number;
  businessProductFacts: number;
  adProductFacts: number;
  adPlanFacts: number;
  afterSalesDailyAggregates: number;
  afterSalesRangeAggregates: number;
  series: number;
  trackedProducts: number;
  targets: number;
  legacyTargetCandidates: number;
  migrationManifests: number;
}

export interface RejectedLegacyRecord {
  legacyKey: LegacyStorageKey;
  recordType:
    | "business_product_fact"
    | "ad_product_fact"
    | "ad_plan_fact"
    | "after_sales_aggregate"
    | "series"
    | "target";
  safeIdentity: string;
  issueCodes: DryRunIssueCode[];
  paths: string[];
}

export interface V2StagingDataset extends Omit<V2Dataset, "activeDatasetPointer"> {
  activeDatasetPointer: null;
}

export interface DryRunMigrationManifest extends Omit<MigrationManifest, "status"> {
  status: "dry_run_ready" | "dry_run_partial" | "dry_run_blocked" | "dry_run_failed";
  stagingDatasetId: string | null;
  futureActivationEligible: boolean;
}

export interface AnalysisMappingResult {
  platform: PlatformRecord;
  store: StoreRecord;
  importBatch: ImportBatchRecord;
  importFiles: ImportFileRecord[];
  businessProductFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  afterSalesDailyAggregates: OwnedAfterSalesDailyAggregate[];
  afterSalesRangeAggregates: OwnedAfterSalesRangeAggregate[];
  sourceSummary: SourceDryRunSummary[];
  rejectedRecords: RejectedLegacyRecord[];
  issues: DryRunIssue[];
  productIds: Set<string>;
  parsedSourceCount: number;
  sourceCount: number;
}

export interface SeriesMappingResult {
  status: "empty" | "valid" | "corrupted";
  series: SeriesRecord[];
  rejectedRecords: RejectedLegacyRecord[];
  issues: DryRunIssue[];
}

export interface TargetMappingResult {
  status: "empty" | "valid" | "corrupted";
  targets: TargetRecord[];
  legacyTargetCandidates: LegacyTargetCandidate[];
  rejectedRecords: RejectedLegacyRecord[];
  issues: DryRunIssue[];
}

export interface LegacyMigrationDryRunResult {
  status: DryRunStatus;
  futureActivationEligible: boolean;
  migrationVersion: typeof V2_MIGRATION_VERSION;
  defaultOwner: typeof DEFAULT_TMAIL_OWNER;
  stagingDataset: V2StagingDataset | null;
  manifestCandidate: DryRunMigrationManifest | null;
  proposedActiveDatasetPointer: null;
  legacyKeySummary: LegacyKeySummary[];
  sourceSummary: SourceDryRunSummary[];
  recordCounts: DryRunRecordCounts;
  rejectedRecords: RejectedLegacyRecord[];
  ignoredLegacyKeys: IgnoredLegacyKeySummary[];
  issues: DryRunIssue[];
}

export interface LegacyValueHasher {
  hash(rawValue: string): Promise<string>;
}

export interface LegacyMigrationDryRunInput {
  snapshot: LegacyStorageSnapshot;
  migrationVersion?: typeof V2_MIGRATION_VERSION;
  hasher?: LegacyValueHasher;
}

export interface LegacyHashSummary {
  key: LegacyStorageKey;
  valueHash: string | null;
}

export interface LegacySnapshotValidationResult {
  valid: boolean;
  snapshot: LegacyStorageSnapshot | null;
  issues: DryRunIssue[];
}

export const createDryRunIssue = (
  code: DryRunIssueCode,
  path: string,
  message: string,
  severity: ValidationSeverity = "error",
  details?: Record<string, string | number | boolean | null>,
): DryRunIssue => ({
  code,
  path,
  message,
  severity,
  ...(details ? { details } : {}),
});

export const toDryRunIssue = (issue: ValidationIssue): DryRunIssue => ({
  code: issue.code,
  path: issue.path,
  message: issue.message,
  severity: issue.severity,
  ...(issue.details ? { details: issue.details } : {}),
});

export const emptyRecordCounts = (): DryRunRecordCounts => ({
  platforms: 0,
  stores: 0,
  importBatches: 0,
  importFiles: 0,
  businessProductFacts: 0,
  adProductFacts: 0,
  adPlanFacts: 0,
  afterSalesDailyAggregates: 0,
  afterSalesRangeAggregates: 0,
  series: 0,
  trackedProducts: 0,
  targets: 0,
  legacyTargetCandidates: 0,
  migrationManifests: 0,
});

export const countStagingDatasetRecords = (dataset: V2StagingDataset | null): DryRunRecordCounts => {
  if (!dataset) return emptyRecordCounts();

  return {
    platforms: dataset.platforms.length,
    stores: dataset.stores.length,
    importBatches: dataset.importBatches.length,
    importFiles: dataset.importFiles.length,
    businessProductFacts: dataset.businessProductFacts.length,
    adProductFacts: dataset.adProductFacts.length,
    adPlanFacts: dataset.adPlanFacts.length,
    afterSalesDailyAggregates: dataset.afterSalesDailyAggregates.length,
    afterSalesRangeAggregates: dataset.afterSalesRangeAggregates.length,
    series: dataset.series.length,
    trackedProducts: dataset.trackedProducts.length,
    targets: dataset.targets.length,
    legacyTargetCandidates: dataset.legacyTargetCandidates.length,
    migrationManifests: dataset.migrationManifests.length,
  };
};
