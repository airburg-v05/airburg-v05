import type {
  PlatformCode,
  SeriesRecord,
  TrackedProductRecord,
  V2Dataset,
} from "../domain/models";

export const DEFAULT_FOCUS_PLATFORM: PlatformCode = "tmall";
export const DEFAULT_FOCUS_STORE_ID = "tmall-default-store";

export type FocusManagementMode = "loading" | "ready" | "empty" | "invalid_store" | "corrupted" | "saving" | "success" | "conflict" | "validation_error" | "error";

export type FocusRecordStatusFilter = "active" | "inactive";

export interface FocusStoreOption {
  value: string;
  platformCode: PlatformCode;
  storeId: string;
  label: string;
  href: string;
}

export interface FocusStoreContext {
  platformCode: PlatformCode;
  storeId: string;
  storeName: string;
  platformLabel: string;
  storeKey: string;
  storeBoardHref: string;
  importHref: string;
  historyHref: string;
  qualityHref: string;
  availableStores: FocusStoreOption[];
}

export interface FocusProductCandidate {
  productId: string;
  productName: string;
  hasBusinessData: boolean;
  hasAdData: boolean;
  dataLabel: "有经营数据" | "仅推广数据";
  searchText: string;
}

export interface FocusManagementViewModel {
  mode: FocusManagementMode;
  datasetId: string | null;
  expectedCurrentDatasetId: string | null;
  storeContext: FocusStoreContext | null;
  series: SeriesRecord[];
  trackedProducts: TrackedProductRecord[];
  productCandidates: FocusProductCandidate[];
  notices: string[];
  primaryActions: Array<{ label: string; href: string }>;
  isEmpty: boolean;
}

export interface FocusManagementLoadResult {
  status: "valid" | "empty" | "invalid_store" | "corrupted" | "error";
  viewModel: FocusManagementViewModel;
  message: string;
}

export type FocusSaveStatus = "success" | "conflict" | "validation_error" | "empty" | "error";

export interface FocusSaveResult {
  status: FocusSaveStatus;
  message: string;
  datasetId: string | null;
  issueCodes: string[];
}

export interface SeriesDraft {
  seriesId?: string;
  name: string;
  productIds: string[];
}

export interface TrackedProductDraft {
  trackedProductId?: string;
  productId: string;
  displayName: string | null;
}

export interface FocusDatasetMutationInput {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  now: string;
}

export type FocusDatasetMutation = (input: FocusDatasetMutationInput) => V2Dataset | FocusSaveResult;

export interface SaveFocusDatasetInput {
  expectedCurrentDatasetId: string | null;
  platformCode: PlatformCode;
  storeId: string;
  mutation: FocusDatasetMutation;
  now?: string;
  databaseName?: string;
}

export interface FocusRuntimeContextInput {
  platformCode: string | null;
  storeId: string | null;
  databaseName?: string;
}
