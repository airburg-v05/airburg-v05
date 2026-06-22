import type { PlatformCode, SeriesRecord, V2Dataset } from "../domain/models";
import type { ProductBoardSeriesMembership } from "./contracts";

export const buildProductSeriesMemberships = ({
  dataset,
  platformCode,
  storeId,
  productId,
  maxItems = 5,
}: {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  productId: string;
  maxItems?: number;
}): ProductBoardSeriesMembership[] =>
  dataset.series
    .filter(
      (series): series is SeriesRecord =>
        series.platformCode === platformCode &&
        series.storeId === storeId &&
        series.status === "active" &&
        series.productIds.includes(productId),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.seriesId.localeCompare(right.seriesId))
    .slice(0, maxItems)
    .map((series) => ({
      seriesId: series.seriesId,
      name: series.name,
      productCount: series.productIds.length,
      href: `/series-board?${new URLSearchParams({
        platform: platformCode,
        storeId,
        seriesId: series.seriesId,
      }).toString()}`,
    }));
