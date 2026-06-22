import type {
  PlatformCode,
  SeriesRecord,
  StoreRecord,
  TargetDirection,
  TargetPeriodType,
  TargetRecord,
  TargetScope,
  V2Dataset,
} from "../domain/models";
import type { TargetAllocationSummary } from "../target-hierarchy";

export type TargetManagementMode =
  | "loading"
  | "ready"
  | "empty"
  | "corrupted"
  | "saving"
  | "success"
  | "conflict"
  | "validation_error"
  | "error";

export type TargetSaveStatus = "success" | "conflict" | "validation_error" | "empty" | "error";

export interface TargetMetricOption {
  key: string;
  label: string;
  direction: TargetDirection;
  allocationMode: "sum" | "none";
}

export interface TargetStoreOption {
  value: string;
  platformCode: PlatformCode;
  storeId: string;
  label: string;
}

export interface TargetSeriesOption {
  value: string;
  platformCode: PlatformCode;
  storeId: string;
  seriesId: string;
  label: string;
  status: SeriesRecord["status"];
}

export interface TargetProductOption {
  value: string;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
  label: string;
  dataLabel: "有经营数据" | "仅推广数据";
  searchText: string;
}

export interface TargetDraft {
  targetId?: string;
  scope: TargetScope;
  parentTargetId: string | null;
  platformCode?: PlatformCode;
  storeId?: string;
  seriesId?: string;
  productId?: string;
  periodType: TargetPeriodType;
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: TargetDirection;
}

export interface TargetParentOption {
  value: string;
  label: string;
  description: string;
}

export interface TargetAllocationChildOption {
  value: string;
  childScope: Exclude<TargetScope, "company">;
  label: string;
  description: string;
  platformCode: PlatformCode;
  storeId: string;
  seriesId?: string;
  productId?: string;
}

export interface BuildTargetAllocationChildOptionsInput {
  dataset: V2Dataset;
  parentTarget: TargetRecord;
}

export interface BuildAllocationChildDraftInput {
  parentTarget: TargetRecord;
  childOption: TargetAllocationChildOption;
  targetValue: number;
}

export interface AllocateChildTargetInput {
  parentTargetId: string;
  childOptionValue: string;
  targetValue: number;
}

export interface TargetRowViewModel {
  target: TargetRecord;
  scopeLabel: string;
  ownerLabel: string;
  parentLabel: string;
  metricLabel: string;
  periodLabel: string;
  valueLabel: string;
  statusLabel: string;
  allocationSummary: TargetAllocationSummary | null;
  allocationChildOptions: TargetAllocationChildOption[];
}

export interface TargetManagementViewModel {
  mode: TargetManagementMode;
  datasetId: string | null;
  expectedCurrentDatasetId: string | null;
  stores: TargetStoreOption[];
  seriesOptions: TargetSeriesOption[];
  productOptions: TargetProductOption[];
  dailyPeriodOptions: string[];
  monthlyPeriodOptions: string[];
  targets: TargetRowViewModel[];
  rawTargets: TargetRecord[];
  rawSeries: SeriesRecord[];
  metricOptions: TargetMetricOption[];
  notices: string[];
  primaryActions: Array<{ label: string; href: string }>;
  isEmpty: boolean;
}

export interface TargetManagementLoadResult {
  status: "valid" | "empty" | "corrupted" | "error";
  viewModel: TargetManagementViewModel;
  message: string;
}

export interface TargetSaveResult {
  status: TargetSaveStatus;
  message: string;
  datasetId: string | null;
  issueCodes: string[];
}

export interface TargetDatasetMutationInput {
  dataset: V2Dataset;
  now: string;
}

export type TargetDatasetMutation = (input: TargetDatasetMutationInput) => V2Dataset | TargetSaveResult;

export interface SaveTargetDatasetInput {
  expectedCurrentDatasetId: string | null;
  mutation: TargetDatasetMutation;
  now?: string;
  databaseName?: string;
}

export interface TargetRuntimeContextInput {
  databaseName?: string;
}

export interface BuildTargetParentOptionsInput {
  targets: TargetRecord[];
  series: SeriesRecord[];
  draft: TargetDraft;
}

export interface BuildTargetManagementViewModelInput {
  dataset: V2Dataset;
  stores?: StoreRecord[];
  expectedCurrentDatasetId: string | null;
}
