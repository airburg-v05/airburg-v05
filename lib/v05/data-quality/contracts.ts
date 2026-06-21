import type { PlatformCode, V2SourceType } from "../domain/models";

export type DataQualityLoadStatus = "empty" | "valid" | "corrupted" | "error";

export type DataQualityStatus = "normal" | "watch" | "risk" | "empty" | "corrupted";

export type DataQualityIssueType =
  | "all"
  | "source_missing"
  | "source_parse_failed"
  | "invalid_date_count"
  | "invalid_id_count"
  | "missing_required_fields"
  | "source_state_mismatch"
  | "summary_row_count"
  | "unknown_status_count"
  | "activation_failed"
  | "conflict"
  | "safe_warning";

export type DataQualitySeverity = "watch" | "risk";

export interface DataQualityDateRange {
  start: string | null;
  end: string | null;
}

export interface DataQualitySourceState {
  sourceType: V2SourceType;
  sourceLabel: string;
  status: "parsed" | "missing" | "unknown" | "error";
  statusLabel: string;
  rowCount: number;
  safeWarningCodeCount: number;
  dateRange: DataQualityDateRange;
}

export interface V2DataQualityIssue {
  issueKey: string;
  platformCode: PlatformCode;
  storeId: string;
  importBatchId: string;
  datasetId: string;
  sourceType: V2SourceType | null;
  issueType: Exclude<DataQualityIssueType, "all">;
  code: string;
  severity: DataQualitySeverity;
  count: number;
  title: string;
  safeDescription: string;
  suggestion: string;
  repairable: boolean;
}

export interface V2DataQualitySummary {
  summaryKey: string;
  platformCode: PlatformCode;
  platformLabel: string;
  storeId: string;
  storeName: string;
  importBatchId: string;
  datasetId: string;
  datasetStatus: "current_active" | "inactive_valid" | "rolled_back" | "failed" | "staging" | "validated";
  datasetStatusLabel: string;
  status: Exclude<DataQualityStatus, "empty" | "corrupted">;
  statusLabel: string;
  importStartedAt: string;
  importCompletedAt: string | null;
  sourceCount: number;
  parsedSourceCount: number;
  warningCount: number;
  blockingIssueCount: number;
  dateRange: DataQualityDateRange;
  sourceStates: DataQualitySourceState[];
  issues: V2DataQualityIssue[];
}

export interface DataQualityFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  count: number;
}

export interface DataQualityFilterOptions {
  platforms: Array<DataQualityFilterOption<PlatformCode>>;
  stores: Array<DataQualityFilterOption<string> & { platformCode: PlatformCode; storeId: string }>;
  batches: Array<DataQualityFilterOption<string>>;
  issueTypes: Array<DataQualityFilterOption<DataQualityIssueType>>;
  statuses: Array<DataQualityFilterOption<DataQualityStatus>>;
}

export interface DataQualityFilters {
  platformCode: PlatformCode | "all";
  storeKey: string;
  importBatchId: string;
  issueType: DataQualityIssueType;
  status: DataQualityStatus | "all";
  searchTerm: string;
}

export interface DataQualityViewModel {
  summaries: V2DataQualitySummary[];
  filteredSummaries: V2DataQualitySummary[];
  filterOptions: DataQualityFilterOptions;
  activeDatasetId: string | null;
  datasetCount: number;
  totalIssueCount: number;
  repairableIssueCount: number;
  notices: string[];
  isEmpty: boolean;
}

export interface DataQualityLoadResult {
  status: DataQualityLoadStatus;
  viewModel: DataQualityViewModel | null;
  issueCodes: string[];
  message: string;
}

export interface ReimportContext {
  mode: "reimport";
  platformCode: PlatformCode;
  storeId: string;
  sourceBatchId: string;
}
