import type {
  TmallFourSourceAnalysisResult,
  TmallStoredAnalysisResult,
} from "../../types/tmall";
import { parseTmallStoredAnalysisResult } from "./tmall-analysis-validator";

export type { TmallStoredAnalysisResult } from "../../types/tmall";

export const TMALL_ANALYSIS_STORAGE_KEY = "airburg_tmall_analysis_v2";
export const TMALL_ANALYSIS_STORAGE_EVENT = "airburg-tmall-storage-change";

const notifyStorageChange = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TMALL_ANALYSIS_STORAGE_EVENT));
};

export const saveTmallAnalysisResult = (result: TmallFourSourceAnalysisResult): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TMALL_ANALYSIS_STORAGE_KEY, JSON.stringify(toTmallStoredAnalysisResult(result)));
  notifyStorageChange();
};

export const toTmallStoredAnalysisResult = (result: TmallFourSourceAnalysisResult): TmallStoredAnalysisResult => ({
  version: result.version,
  analysisTimestamp: result.analysisTimestamp,
  sourceHealth: result.sourceHealth,
  dateRanges: result.dateRanges,
  productDailyFacts: result.productDailyFacts,
  adProductDailyFacts: result.adProductDailyFacts,
  adPlanDailyFacts: result.adPlanDailyFacts,
  afterSalesAggregates: result.afterSalesAggregates,
  joinQuality: result.joinQuality,
  reconciliation: result.reconciliation,
  dataQualityWarnings: result.dataQualityWarnings,
});

export const loadTmallAnalysisResult = (): TmallStoredAnalysisResult | null => {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY);
    const parsed = parseTmallStoredAnalysisResult(value);
    return parsed.status === "valid" ? parsed.result : null;
  } catch {
    return null;
  }
};

export const clearTmallAnalysisResult = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TMALL_ANALYSIS_STORAGE_KEY);
  notifyStorageChange();
};
