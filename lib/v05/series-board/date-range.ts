import type { V2Dataset } from "../domain/models";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import {
  buildHomeCommandCenterDateRange,
  isDateInRange,
  sortBusinessDatesDesc,
} from "../home-command-center";
import type { SeriesBoardDateRangeState, SeriesBoardPeriod } from "./contracts";

export { isDateInRange, sortBusinessDatesDesc };

export const buildSeriesBoardDateRange = ({
  selectedPeriod,
  selectedDate,
  customDateRange,
  availableDates,
}: {
  selectedPeriod: SeriesBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  availableDates: readonly string[];
}): SeriesBoardDateRangeState =>
  buildHomeCommandCenterDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });

export const v2DatesForSeries = ({
  dataset,
  platformCode,
  storeId,
  productIds,
}: {
  dataset: V2Dataset;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
  productIds: readonly string[];
}): string[] => {
  const productSet = new Set(productIds);
  return sortBusinessDatesDesc([
    ...dataset.businessProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          productSet.has(fact.productId),
      )
      .map((fact) => fact.businessDate),
    ...dataset.adProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          productSet.has(fact.productId),
      )
      .map((fact) => fact.businessDate),
  ]);
};

export const v2DatesForActiveSeries = ({
  dataset,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
}): string[] => {
  const activeProductIds = new Set(
    dataset.series
      .filter((series) => series.platformCode === platformCode && series.storeId === storeId && series.status === "active")
      .flatMap((series) => series.productIds),
  );
  if (activeProductIds.size === 0) return [];
  return v2DatesForSeries({ dataset, platformCode, storeId, productIds: [...activeProductIds] });
};

export const legacyDatesForSeries = ({
  analysis,
  productIds,
}: {
  analysis: TmallStoredAnalysisResult;
  productIds: readonly string[];
}): string[] => {
  const productSet = new Set(productIds);
  return sortBusinessDatesDesc([
    ...analysis.productDailyFacts
      .filter((fact) => productSet.has(String(fact.productId)))
      .map((fact) => fact.date),
    ...analysis.adProductDailyFacts
      .filter((fact) => productSet.has(String(fact.productId)))
      .map((fact) => fact.date),
  ]);
};
