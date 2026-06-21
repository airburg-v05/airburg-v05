import type { TmallStoredAnalysisResult } from "../../types/tmall";

export type TmallStoredAnalysisStatus = "loading" | "empty" | "valid" | "corrupted";

export interface TmallStoredAnalysisParseResult {
  status: TmallStoredAnalysisStatus;
  result: TmallStoredAnalysisResult | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const validateTmallStoredAnalysisResult = (
  value: unknown,
): value is TmallStoredAnalysisResult => {
  if (!isRecord(value)) return false;

  return (
    typeof value.version === "string" &&
    typeof value.analysisTimestamp === "string" &&
    isRecord(value.sourceHealth) &&
    isRecord(value.dateRanges) &&
    Array.isArray(value.productDailyFacts) &&
    Array.isArray(value.adProductDailyFacts) &&
    Array.isArray(value.adPlanDailyFacts) &&
    isRecord(value.afterSalesAggregates) &&
    isRecord(value.joinQuality) &&
    Array.isArray(value.dataQualityWarnings)
  );
};

export const parseTmallStoredAnalysisResult = (
  rawValue: string | null | undefined,
): TmallStoredAnalysisParseResult => {
  if (rawValue === undefined) return { status: "loading", result: null };
  if (rawValue === null) return { status: "empty", result: null };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!validateTmallStoredAnalysisResult(parsed)) {
      return { status: "corrupted", result: null };
    }

    return { status: "valid", result: parsed };
  } catch {
    return { status: "corrupted", result: null };
  }
};
