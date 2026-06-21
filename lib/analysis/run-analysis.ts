import { cleanBasicData } from "@/lib/cleaning/basic-clean";
import { parseAndMap } from "@/lib/data-source/parse-and-map";
import { detectAnomalies, type AnomalyItem } from "@/lib/metrics/anomaly";
import { calculateMetrics, type MetricsResult } from "@/lib/metrics/calculate";
import {
  calculateProductRanking,
  type ProductRankingResult,
} from "@/lib/metrics/product-ranking";
import type { RawDataRow } from "@/lib/parsers/shared";
import type {
  FieldMappingResult,
  FieldQualityStatus,
  FieldQualitySummary,
  StandardMetricField,
} from "@/types/metrics";

export interface AnalysisResult {
  file: {
    name: string;
    size: number;
    analyzedAt: string;
  };
  data: {
    headers: string[];
    rowCount: number;
    previewRows: RawDataRow[];
    mapping: FieldMappingResult;
    unmappedFields: string[];
    fieldStatus: Record<StandardMetricField, FieldQualityStatus>;
    fieldQuality: Record<StandardMetricField, FieldQualitySummary>;
    removedSummaryRows: number;
  };
  metrics: MetricsResult;
  ranking: ProductRankingResult;
  anomalies: AnomalyItem[];
}

export const runAnalysis = async (file: File): Promise<AnalysisResult> => {
  const parsedResult = await parseAndMap(file);
  const cleanedData = cleanBasicData(parsedResult);

  return {
    file: {
      name: file.name,
      size: file.size,
      analyzedAt: new Date().toISOString(),
    },
    data: {
      headers: cleanedData.headers,
      rowCount: cleanedData.rows.length,
      previewRows: cleanedData.rows.slice(0, 50),
      mapping: cleanedData.mapping,
      unmappedFields: parsedResult.unmappedFields,
      fieldStatus: cleanedData.fieldStatus,
      fieldQuality: cleanedData.fieldQuality,
      removedSummaryRows: cleanedData.removedSummaryRows,
    },
    metrics: calculateMetrics(cleanedData),
    ranking: calculateProductRanking(cleanedData),
    anomalies: detectAnomalies(cleanedData),
  };
};
