import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../../types/tmall";
import type {
  PlatformCode,
  StoreRecord,
  V2Dataset,
  V2SourceType,
} from "../domain/models";
import type {
  DryRunIssue,
  DryRunRecordCounts,
  LegacyMigrationDryRunResult,
  V2StagingDataset,
} from "../migration/contracts";
import type {
  V2ActivationData,
  V2PersistenceStore,
  V2ReadBackValidationData,
} from "../persistence/contracts";

export const V05B1_IMPORT_PIPELINE_VERSION = "v05b1_tmall_batch_import_v1" as const;

export const V05B1_AUDIT_DATABASE_NAME = "airburg-v05-b1-audit" as const;

export const V05_IMPORT_SOURCE_TYPES: V2SourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

export const V05_IMPORT_SOURCE_LABELS: Record<V2SourceType, string> = {
  business_product: "生意参谋商品表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales: "售后退货表",
};

export interface V05ImportPlatformOption {
  platformCode: PlatformCode;
  label: string;
  enabled: boolean;
  statusLabel: string;
}

export const V05_IMPORT_PLATFORM_OPTIONS: V05ImportPlatformOption[] = [
  { platformCode: "tmall", label: "天猫", enabled: true, statusLabel: "已开放" },
  { platformCode: "jd", label: "京东", enabled: false, statusLabel: "暂未开放" },
  { platformCode: "pdd", label: "拼多多", enabled: false, statusLabel: "暂未开放" },
  { platformCode: "douyin", label: "抖音", enabled: false, statusLabel: "暂未开放" },
  { platformCode: "youzan", label: "有赞", enabled: false, statusLabel: "暂未开放" },
];

export interface V05ImportStoreInput {
  platformCode: PlatformCode;
  storeId: string;
  storeName: string;
  isNew?: boolean;
}

export type V05BatchFileStatus =
  | "identified"
  | "duplicate"
  | "unknown"
  | "error";

export interface V05BatchDetectedFile {
  temporaryId: string;
  file: File;
  fileName: string;
  fileSize: number;
  status: V05BatchFileStatus;
  detectedSourceType: V2SourceType | "unknown";
  sourceType: V2SourceType | null;
  sourceLabel: string;
  rowCount: number | null;
  headerRowNumber: number | null;
  missingRequiredFields: string[];
  error: string | null;
}

export interface V05BatchDetectionResult {
  files: V05BatchDetectedFile[];
  filesBySourceType: Partial<Record<V2SourceType, File>>;
  missingSourceTypes: V2SourceType[];
  duplicateSourceTypes: V2SourceType[];
  unknownFileCount: number;
  errorFileCount: number;
  canImport: boolean;
  blockingReasons: string[];
}

export interface V05FileFingerprint {
  sourceType: V2SourceType;
  fileFingerprint: string;
}

export type V05ImportRunStatus =
  | "success"
  | "already_imported"
  | "conflict"
  | "blocked"
  | "failed";

export interface V05ImportCandidate {
  analysis: TmallFourSourceAnalysisResult;
  platformCode: PlatformCode;
  store: V05ImportStoreInput;
  importBatchId: string;
  capturedAt: string;
  fileFingerprints: V05FileFingerprint[];
  dataset: V2Dataset;
  dryRun: LegacyMigrationDryRunResult;
}

export interface V05DatasetMergeResult {
  status: "merged" | "already_imported" | "conflict";
  dataset: V2StagingDataset | null;
  issueCodes: string[];
  recordCounts: DryRunRecordCounts;
}

export interface V05BatchImportInput {
  platformCode: PlatformCode;
  store: V05ImportStoreInput;
  filesBySourceType: Record<TmallSourceType, File>;
  persistenceStore: V2PersistenceStore;
  legacyStorage?: Storage | null;
  compatibilityWriter?: (analysis: TmallFourSourceAnalysisResult) => void;
  now?: () => string;
}

export interface V05BatchImportResult {
  status: V05ImportRunStatus;
  message: string;
  platformCode: PlatformCode;
  storeId: string;
  storeName: string;
  importBatchId: string | null;
  datasetId: string | null;
  previousDatasetId: string | null;
  analysisTimestamp: string | null;
  sourceCount: number;
  parsedSourceCount: number;
  recordCounts: DryRunRecordCounts;
  issueCodes: string[];
  legacyCompatibilitySaved: boolean;
  legacyMigrationStatus: string | null;
  prepareStatus: string | null;
  readBackStatus: V2ReadBackValidationData | null;
  activationStatus: V2ActivationData | null;
}

export interface V05ImportContext {
  activeDatasetId: string | null;
  stores: StoreRecord[];
}

export type V05ImportIssueLike = DryRunIssue | { code: string };
