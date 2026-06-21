import type { PlatformCode, V2SourceType } from "../domain/models";

export type ImportHistoryDatasetStatus =
  | "current_active"
  | "inactive_valid"
  | "rolled_back"
  | "failed"
  | "staging"
  | "validated";

export type ImportHistoryLoadStatus = "empty" | "valid" | "corrupted" | "error";

export type ImportHistoryDateFilterPreset = "all" | "last_7_days" | "last_30_days" | "custom";

export interface ImportHistoryDateRange {
  start: string | null;
  end: string | null;
}

export interface ImportHistorySourceState {
  sourceType: V2SourceType;
  sourceLabel: string;
  statusLabel: string;
  status: "parsed" | "missing" | "unknown" | "error";
  rowCount: number;
  hasDateRange: boolean;
  dateRange: ImportHistoryDateRange;
  safeWarningCodeCount: number;
}

export interface ImportHistoryActivationEvent {
  action: "activated" | "rolled_back";
  datasetId: string;
  previousDatasetId: string | null;
  createdAt: string;
}

export interface ImportHistoryEntry {
  historyKey: string;
  platformCode: PlatformCode;
  platformLabel: string;
  storeId: string;
  storeName: string;
  importBatchId: string;
  importStatus: "success" | "partial_success" | "failed";
  importStatusLabel: string;
  datasetStatus: ImportHistoryDatasetStatus;
  datasetStatusLabel: string;
  firstDatasetId: string;
  latestDatasetId: string;
  existsInActiveDataset: boolean;
  importedAt: string;
  completedAt: string | null;
  dateRange: ImportHistoryDateRange;
  sourceCount: number;
  recordCounts: {
    businessProduct: number;
    adProduct: number;
    adPlan: number;
    afterSalesSafe: number;
  };
  safeWarningCodeCount: number;
  sourceStates: ImportHistorySourceState[];
  activationEvents: ImportHistoryActivationEvent[];
  rollbackEvents: ImportHistoryActivationEvent[];
}

export interface ImportHistoryFilterOptions {
  platforms: Array<{ platformCode: PlatformCode; label: string; count: number }>;
  stores: Array<{ platformCode: PlatformCode; storeId: string; storeName: string; count: number }>;
  datasetStatuses: Array<{ status: ImportHistoryDatasetStatus; label: string; count: number }>;
}

export interface ImportHistoryFilters {
  platformCode: PlatformCode | "all";
  storeKey: string;
  datasetStatus: ImportHistoryDatasetStatus | "all";
  datePreset: ImportHistoryDateFilterPreset;
  customStartDate: string;
  customEndDate: string;
  searchTerm: string;
}

export interface ImportHistoryViewModel {
  entries: ImportHistoryEntry[];
  filteredEntries: ImportHistoryEntry[];
  filterOptions: ImportHistoryFilterOptions;
  totalEntryCount: number;
  activeDatasetId: string | null;
  datasetCount: number;
  journalCount: number;
  notices: string[];
  isEmpty: boolean;
}

export interface ImportHistoryLoadResult {
  status: ImportHistoryLoadStatus;
  viewModel: ImportHistoryViewModel | null;
  issueCodes: string[];
  message: string;
}
