import type { DataQualityFilters } from "./contracts";

export const DEFAULT_DATA_QUALITY_FILTERS: DataQualityFilters = {
  platformCode: "all",
  storeKey: "all",
  importBatchId: "all",
  issueType: "all",
  status: "all",
  searchTerm: "",
};

export const normalizeDataQualityFilters = (
  filters: Partial<DataQualityFilters> | null | undefined,
): DataQualityFilters => ({
  ...DEFAULT_DATA_QUALITY_FILTERS,
  ...filters,
  searchTerm: filters?.searchTerm?.trim() ?? DEFAULT_DATA_QUALITY_FILTERS.searchTerm,
});
