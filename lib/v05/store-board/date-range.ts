import type { V2Dataset } from "../domain/models";
import {
  buildHomeCommandCenterDateRange,
  legacyDatesForAnalysis,
  sortBusinessDatesDesc,
  v2DatesForDataset,
} from "../home-command-center";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import type { StoreBoardDateRangeState, StoreBoardPeriod } from "./contracts";

export const buildStoreBoardDateRange = ({
  selectedPeriod,
  selectedDate,
  customDateRange,
  availableDates,
}: {
  selectedPeriod: StoreBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  availableDates: readonly string[];
}): StoreBoardDateRangeState =>
  buildHomeCommandCenterDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });

export const v2DatesForStore = ({
  dataset,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  platformCode: V2Dataset["stores"][number]["platformCode"];
  storeId: string;
}): string[] =>
  sortBusinessDatesDesc(
    dataset.businessProductFacts
      .filter((fact) => fact.platformCode === platformCode && fact.storeId === storeId)
      .map((fact) => fact.businessDate),
  );

export const v2DatesForAnyStore = (dataset: V2Dataset): string[] => v2DatesForDataset(dataset);

export const legacyDatesForStoreAnalysis = (analysis: TmallStoredAnalysisResult): string[] =>
  legacyDatesForAnalysis(analysis);
