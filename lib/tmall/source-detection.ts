import type { TmallDetectedSourceType, TmallSourceType } from "../../types/tmall";
import { TMALL_REQUIRED_HEADERS } from "./source-types";
import { normalizeHeader } from "./normalizers";

export interface TmallSourceDetectionResult {
  sourceType: TmallDetectedSourceType;
  missingRequiredFields: string[];
}

const hasHeader = (headers: string[], requiredHeader: string): boolean => {
  const normalizedRequired = normalizeHeader(requiredHeader);
  return headers.some((header) => normalizeHeader(header) === normalizedRequired);
};

const getMissingHeaders = (headers: string[], sourceType: TmallSourceType): string[] =>
  TMALL_REQUIRED_HEADERS[sourceType].filter((requiredHeader) => !hasHeader(headers, requiredHeader));

export const detectTmallSource = (headers: string[]): TmallSourceDetectionResult => {
  const normalizedHeaders = headers.map(normalizeHeader);
  const candidates: TmallSourceType[] = [
    "business_product",
    "ad_product",
    "ad_plan",
    "after_sales",
  ];

  for (const sourceType of candidates) {
    const missingRequiredFields = getMissingHeaders(normalizedHeaders, sourceType);
    if (missingRequiredFields.length === 0) {
      if (sourceType === "ad_plan" && hasHeader(normalizedHeaders, "主体ID")) {
        continue;
      }
      return { sourceType, missingRequiredFields: [] };
    }
  }

  const closest = candidates
    .map((sourceType) => ({
      sourceType,
      missingRequiredFields: getMissingHeaders(normalizedHeaders, sourceType),
    }))
    .sort((first, second) => first.missingRequiredFields.length - second.missingRequiredFields.length)[0];

  return {
    sourceType: "unknown",
    missingRequiredFields: closest?.missingRequiredFields ?? [],
  };
};

export const detectExpectedTmallSource = (
  headers: string[],
  expectedSourceType: TmallSourceType,
): TmallSourceDetectionResult => {
  const detected = detectTmallSource(headers);
  if (detected.sourceType === expectedSourceType) return detected;

  return {
    sourceType: detected.sourceType,
    missingRequiredFields: getMissingHeaders(headers, expectedSourceType),
  };
};

