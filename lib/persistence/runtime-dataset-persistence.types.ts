import type { BIDataSet, ETLIssueLevel } from "../etl/runtime/context";

export const RUNTIME_DATASET_SCHEMA_VERSION = 1;

export type RuntimeDatasetSourceType =
  | "product_dimension"
  | "product_metric"
  | "plan_metric"
  | "search_total"
  | "search_product"
  | "after_sales"
  | "unknown";

export interface RuntimeDatasetDateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface RuntimeDatasetSafeIssue {
  code: string;
  level: ETLIssueLevel;
  sourceType: RuntimeDatasetSourceType;
  safeCount: number;
}

export interface RuntimeDatasetImportSummary {
  filesParsed: number;
  filesFailed: number;
  dedupedRecords: number;
  productMetricsCount: number;
  planMetricsCount: number;
  searchTotalKeywordsCount: number;
  searchProductKeywordsCount: number;
  afterSalesMetricsCount: number;
}

export interface RuntimeDatasetSourceCoverageItem {
  present: boolean;
  rowCount: number;
}

export interface RuntimeDatasetSourceCoverage {
  product_dimension: RuntimeDatasetSourceCoverageItem;
  product_metric: RuntimeDatasetSourceCoverageItem;
  plan_metric: RuntimeDatasetSourceCoverageItem;
  search_total: RuntimeDatasetSourceCoverageItem;
  search_product: RuntimeDatasetSourceCoverageItem;
  after_sales: RuntimeDatasetSourceCoverageItem;
}

export interface RuntimeDatasetSnapshot {
  schemaVersion: typeof RUNTIME_DATASET_SCHEMA_VERSION;
  activeDatasetId: string;
  createdAt: string;
  updatedAt: string;
  platformCode: string;
  storeId: string;
  dateRange: RuntimeDatasetDateRange;
  dataset: BIDataSet;
  safeIssues: RuntimeDatasetSafeIssue[];
  importSummary: RuntimeDatasetImportSummary;
  sourceCoverage: RuntimeDatasetSourceCoverage;
}

export interface RuntimeDatasetSnapshotSummary {
  schemaVersion: typeof RUNTIME_DATASET_SCHEMA_VERSION;
  activeDatasetId: string;
  createdAt: string;
  updatedAt: string;
  platformCode: string;
  storeId: string;
  dateRange: RuntimeDatasetDateRange;
  safeIssues: RuntimeDatasetSafeIssue[];
  importSummary: RuntimeDatasetImportSummary;
  sourceCoverage: RuntimeDatasetSourceCoverage;
}

export interface RuntimeDatasetPersistenceOptions {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
  now?: () => Date;
}

export interface SaveRuntimeDatasetSnapshotOptions extends RuntimeDatasetPersistenceOptions {
  activeDatasetId?: string;
  platformCode?: string;
  storeId?: string;
  dateRange?: RuntimeDatasetDateRange;
}

export type RuntimeDatasetPersistenceUnavailableReason =
  | "indexeddb_unavailable"
  | "open_failed"
  | "read_failed"
  | "write_failed"
  | "clear_failed";

export type RuntimeDatasetSnapshotLoadResult =
  | { status: "ok"; snapshot: RuntimeDatasetSnapshot }
  | { status: "empty" }
  | { status: "corrupted"; reason: string }
  | { status: "unavailable"; reason: RuntimeDatasetPersistenceUnavailableReason };

export type RuntimeDatasetSnapshotSaveResult =
  | { status: "saved"; snapshot: RuntimeDatasetSnapshot }
  | { status: "unavailable"; reason: RuntimeDatasetPersistenceUnavailableReason };

export type RuntimeDatasetSnapshotListResult =
  | { status: "ok"; snapshots: RuntimeDatasetSnapshotSummary[] }
  | { status: "unavailable"; reason: RuntimeDatasetPersistenceUnavailableReason; snapshots: [] };

export type RuntimeDatasetSnapshotRestoreResult =
  | { status: "restored"; snapshot: RuntimeDatasetSnapshot }
  | Exclude<RuntimeDatasetSnapshotLoadResult, { status: "ok" }>;

export type RuntimeDatasetSnapshotClearResult =
  | { status: "cleared" }
  | { status: "unavailable"; reason: RuntimeDatasetPersistenceUnavailableReason };
