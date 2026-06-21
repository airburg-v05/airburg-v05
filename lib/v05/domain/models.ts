export const V2_SCHEMA_VERSION = "airburg_storage_v2" as const;
export const V2_MIGRATION_VERSION = "legacy_tmall_v1_to_storage_v2_v1" as const;

export const ALLOWED_PLATFORM_CODES = ["tmall", "jd", "pdd", "douyin", "youzan"] as const;

export type PlatformCode = (typeof ALLOWED_PLATFORM_CODES)[number];

export type V2SourceType = "business_product" | "ad_product" | "ad_plan" | "after_sales";

export type EntityStatus = "active" | "inactive";
export type ImportBatchStatus = "pending" | "success" | "partial_success" | "failed";
export type ImportFileStatus = "parsed" | "missing" | "unknown" | "error";
export type AfterSalesDateBasis = "apply_date" | "success_date" | "payment_date";
export type TargetScope = "company" | "store" | "series" | "product";
export type TargetPeriodType = "daily" | "monthly";
export type TargetDirection = "higher_is_better" | "lower_is_better";
export type TargetStatus = "active" | "paused" | "deleted";
export type MigrationManifestStatus = "pending" | "success" | "partial_success" | "failed";
export type ActiveDatasetPointerState =
  | "none"
  | "legacy_readonly"
  | "v2_staged"
  | "v2_active"
  | "migration_failed";

export interface StoreScope {
  platformCode: PlatformCode;
  storeId: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface PlatformRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  platformCode: PlatformCode;
  platformName: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoreRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  platformCode: PlatformCode;
  storeId: string;
  storeName: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ImportBatchRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  importBatchId: string;
  platformCode: PlatformCode;
  storeId: string;
  importStartedAt: string;
  importCompletedAt: string | null;
  status: ImportBatchStatus;
  sourceTypes: V2SourceType[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportFileRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  importFileId: string;
  importBatchId: string;
  platformCode: PlatformCode;
  storeId: string;
  sourceType: V2SourceType;
  detectedSourceType: V2SourceType | "unknown";
  fileFingerprint: string;
  rowCount: number;
  headerRowNumber: number | null;
  dateRange: DateRange | null;
  status: ImportFileStatus;
  safeWarningCodes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OwnedFactBase {
  platformCode: PlatformCode;
  storeId: string;
  businessDate: string;
  sourceType: V2SourceType;
  importBatchId: string;
}

export interface OwnedBusinessProductFact extends OwnedFactBase {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  sourceType: "business_product";
  productId: string;
  productName: string | null;
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  paidOrders: number | null;
  conversionRate: number | null;
  avgOrderValue: number | null;
  favorites: number | null;
  cartAdditions: number | null;
}

export interface OwnedAdProductFact extends OwnedFactBase {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  sourceType: "ad_product";
  productId: string;
  adSpend: number | null;
  adSalesAmount: number | null;
  impressions: number | null;
  clicks: number | null;
  clickRate: number | null;
  adRoi: number | null;
}

export interface OwnedAdPlanFact extends OwnedFactBase {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  sourceType: "ad_plan";
  planId: string;
  planName: string | null;
  adSpend: number | null;
  adSalesAmount: number | null;
  impressions: number | null;
  clicks: number | null;
  adRoi: number | null;
}

export interface OwnedAfterSalesDailyAggregate extends OwnedFactBase {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  sourceType: "after_sales";
  dateBasis: AfterSalesDateBasis;
  productId: string | null;
  refundAmount: number | null;
  refundOrderCount: number | null;
  afterSalesApplyCount: number | null;
}

export interface OwnedDerivedAggregateBase {
  platformCode: PlatformCode;
  storeId: string;
  sourceType: "after_sales";
  importBatchId: string;
  dateRange: DateRange;
}

export interface OwnedAfterSalesRangeAggregate extends OwnedDerivedAggregateBase {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  dateBasis: AfterSalesDateBasis;
  productId: string | null;
  refundAmount: number | null;
  refundOrderCount: number | null;
  afterSalesApplyCount: number | null;
}

export interface SeriesRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  seriesId: string;
  platformCode: PlatformCode;
  storeId: string;
  name: string;
  productIds: string[];
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedProductRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  trackedProductId: string;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
  displayName: string | null;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TargetRecord {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  targetId: string;
  scope: TargetScope;
  platformCode?: PlatformCode;
  storeId?: string;
  seriesId?: string;
  productId?: string;
  periodType: TargetPeriodType;
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: TargetDirection;
  status: TargetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyTargetCandidate {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  legacyTargetId: string;
  legacyStorageKey: string;
  scope: TargetScope;
  platformCode?: PlatformCode;
  storeId?: string;
  seriesId?: string;
  productId?: string;
  periodType: string;
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: TargetDirection;
  status: TargetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationManifest {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  migrationManifestId: string;
  migrationVersion: typeof V2_MIGRATION_VERSION | string;
  status: MigrationManifestStatus;
  migratedFromKeys: string[];
  importBatchId: string | null;
  legacyValueHash: string | null;
  startedAt: string;
  completedAt: string | null;
  safeIssueCodes: string[];
}

export interface ActiveDatasetPointer {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  pointerId: string;
  state: ActiveDatasetPointerState;
  datasetId: string | null;
  migrationManifestId: string | null;
  activatedAt: string | null;
}

export interface V2Dataset {
  schemaVersion: typeof V2_SCHEMA_VERSION;
  datasetId: string;
  platforms: PlatformRecord[];
  stores: StoreRecord[];
  importBatches: ImportBatchRecord[];
  importFiles: ImportFileRecord[];
  businessProductFacts: OwnedBusinessProductFact[];
  adProductFacts: OwnedAdProductFact[];
  adPlanFacts: OwnedAdPlanFact[];
  afterSalesDailyAggregates: OwnedAfterSalesDailyAggregate[];
  afterSalesRangeAggregates: OwnedAfterSalesRangeAggregate[];
  series: SeriesRecord[];
  trackedProducts: TrackedProductRecord[];
  targets: TargetRecord[];
  legacyTargetCandidates: LegacyTargetCandidate[];
  migrationManifests: MigrationManifest[];
  activeDatasetPointer: ActiveDatasetPointer | null;
}
