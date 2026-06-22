import type { PlatformCode, V2Dataset } from "../domain/models";
import {
  buildHomeCommandCenterDateRange,
  isDateInRange,
  sortBusinessDatesDesc,
} from "../home-command-center";
import type { ProductBoardDateRangeState, ProductBoardPeriod } from "./contracts";

export { isDateInRange, sortBusinessDatesDesc };

export const buildProductBoardDateRange = ({
  selectedPeriod,
  selectedDate,
  customDateRange,
  availableDates,
}: {
  selectedPeriod: ProductBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  availableDates: readonly string[];
}): ProductBoardDateRangeState =>
  buildHomeCommandCenterDateRange({
    selectedPeriod,
    selectedDate,
    customDateRange,
    availableDates,
  });

export const v2DatesForProduct = ({
  dataset,
  platformCode,
  storeId,
  productId,
}: {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
}): string[] =>
  sortBusinessDatesDesc([
    ...dataset.businessProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          fact.productId === productId,
      )
      .map((fact) => fact.businessDate),
    ...dataset.adProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          fact.productId === productId,
      )
      .map((fact) => fact.businessDate),
  ]);

export const v2DatesForActiveTrackedProducts = ({
  dataset,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
}): string[] => {
  const productIds = new Set(
    dataset.trackedProducts
      .filter((item) => item.platformCode === platformCode && item.storeId === storeId && item.status === "active")
      .map((item) => item.productId),
  );
  if (productIds.size === 0) return [];
  return sortBusinessDatesDesc([
    ...dataset.businessProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          productIds.has(fact.productId),
      )
      .map((fact) => fact.businessDate),
    ...dataset.adProductFacts
      .filter(
        (fact) =>
          fact.platformCode === platformCode &&
          fact.storeId === storeId &&
          productIds.has(fact.productId),
      )
      .map((fact) => fact.businessDate),
  ]);
};
