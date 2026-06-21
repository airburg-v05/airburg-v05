import type { CleanedDataResult } from "@/lib/cleaning/basic-clean";
import { aggregateProducts } from "@/lib/metrics/product-aggregate";

export interface ProductMetricItem {
  product_key: string;
  product_id: string | null;
  product_name: string;
  sales_amount: number;
  visitors: number;
  paid_buyers: number;
  conversion_rate: number | null;
}

export interface ProductRankingResult {
  salesAmountRanking: ProductMetricItem[];
  visitorsRanking: ProductMetricItem[];
  conversionRateRanking: ProductMetricItem[];
}

const toRankingRows = (data: CleanedDataResult): ProductMetricItem[] =>
  aggregateProducts(data).map((item) => ({
    product_key: item.product_key,
    product_id: item.product_id,
    product_name: item.product_name,
    sales_amount: item.sales_amount,
    visitors: item.visitors,
    paid_buyers: item.paid_buyers,
    conversion_rate: item.conversion_rate,
  }));

const sortByNumber = (
  rows: ProductMetricItem[],
  selectValue: (item: ProductMetricItem) => number | null,
): ProductMetricItem[] =>
  [...rows].sort((first, second) => {
    const firstValue = selectValue(first);
    const secondValue = selectValue(second);
    if (firstValue === null && secondValue === null) return 0;
    if (firstValue === null) return 1;
    if (secondValue === null) return -1;
    return secondValue - firstValue;
  });

export const calculateProductRanking = (data: CleanedDataResult): ProductRankingResult => {
  const rows = toRankingRows(data);

  return {
    salesAmountRanking: sortByNumber(rows, (item) => item.sales_amount),
    visitorsRanking: sortByNumber(rows, (item) => item.visitors),
    conversionRateRanking: sortByNumber(rows, (item) => item.conversion_rate),
  };
};
