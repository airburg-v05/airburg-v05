import type { ImportHistoryFilters } from "./contracts";

export const DEFAULT_IMPORT_HISTORY_FILTERS: ImportHistoryFilters = {
  platformCode: "all",
  storeKey: "all",
  datasetStatus: "all",
  datePreset: "all",
  customStartDate: "",
  customEndDate: "",
  searchTerm: "",
};
