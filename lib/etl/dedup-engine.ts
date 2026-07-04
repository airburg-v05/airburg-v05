import type { BIDataSet } from "./runtime/context";

export interface DedupResult {
  dataset: BIDataSet;
  removedCount: number;
}

const uniqueBy = <T>(records: T[], keyFor: (record: T) => string): { records: T[]; removedCount: number } => {
  const seen = new Set<string>();
  const recordsWithoutDuplicates: T[] = [];
  let removedCount = 0;

  records.forEach((record) => {
    const key = keyFor(record);
    if (seen.has(key)) {
      removedCount += 1;
      return;
    }
    seen.add(key);
    recordsWithoutDuplicates.push(record);
  });

  return { records: recordsWithoutDuplicates, removedCount };
};

export const normalizeSearchDedupKeyword = (keyword: string): string =>
  keyword
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

export const searchTotalKeywordDedupKeyV2 = (
  keyword: BIDataSet["searchTotalKeywords"][number],
): string =>
  `${keyword.platformCode}::${keyword.storeId}::${keyword.date ?? "__no_date__"}::${normalizeSearchDedupKeyword(keyword.keyword)}`;

export const searchProductKeywordDedupKeyV2 = (
  keyword: BIDataSet["searchProductKeywords"][number],
): string =>
  `${keyword.platformCode}::${keyword.storeId}::${keyword.productId}::${keyword.date ?? "__no_date__"}::${normalizeSearchDedupKeyword(keyword.keyword)}`;

export const deduplicateBIDataSet = (dataset: BIDataSet): DedupResult => {
  const products = uniqueBy(
    dataset.products,
    (product) => `${product.platformCode}::${product.storeId}::${product.productId}`,
  );
  const productMetrics = uniqueBy(
    dataset.productMetrics,
    (metric) => `${metric.platformCode}::${metric.storeId}::${metric.productId}::${metric.date}`,
  );
  const planMetrics = uniqueBy(
    dataset.planMetrics,
    (metric) => `${metric.platformCode}::${metric.storeId}::${metric.productId}::${metric.date}`,
  );
  const searchTotalKeywords = uniqueBy(
    dataset.searchTotalKeywords,
    searchTotalKeywordDedupKeyV2,
  );
  const searchProductKeywords = uniqueBy(
    dataset.searchProductKeywords,
    searchProductKeywordDedupKeyV2,
  );
  const afterSalesMetrics = uniqueBy(
    dataset.afterSalesMetrics,
    (metric) =>
      `${metric.platformCode}::${metric.storeId}::${metric.productId ?? "__store__"}::${metric.date}`,
  );

  return {
    dataset: {
      products: products.records,
      productMetrics: productMetrics.records,
      planMetrics: planMetrics.records,
      searchTotalKeywords: searchTotalKeywords.records,
      searchProductKeywords: searchProductKeywords.records,
      afterSalesMetrics: afterSalesMetrics.records,
    },
    removedCount:
      products.removedCount +
      productMetrics.removedCount +
      planMetrics.removedCount +
      searchTotalKeywords.removedCount +
      searchProductKeywords.removedCount +
      afterSalesMetrics.removedCount,
  };
};
