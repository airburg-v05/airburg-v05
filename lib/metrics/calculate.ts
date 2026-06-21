import type { CleanedDataResult } from "@/lib/cleaning/basic-clean";

export interface MetricsResult {
  totals: {
    sales_amount: number;
    refund_amount: number;
    gsv: number;
    visitors: number;
    paid_buyers: number;
    conversion_rate: number | null;
    avg_order_value: number | null;
    refund_rate: number | null;
    ad_spend: number;
    ad_clicks: number;
    avg_cpc: number | null;
    ad_sales_amount: number;
    roi: number | null;
    ad_spend_ratio: number | null;
    ad_spend_ratio_after_refund: number | null;
  };
}

const toSafeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const sumMappedField = (
  data: CleanedDataResult,
  standardField:
    | "sales_amount"
    | "refund_amount"
    | "visitors"
    | "paid_buyers"
    | "ad_spend"
    | "ad_clicks"
    | "ad_sales_amount",
): number => {
  const match = data.mapping[standardField];
  if (match.status !== "matched" || !match.rawField) return 0;

  return data.rows.reduce((sum, row) => {
    const value = toSafeNumber(row[match.rawField as string]);
    return value === null ? sum : sum + value;
  }, 0);
};

const divide = (numerator: number, denominator: number): number | null =>
  denominator > 0 && Number.isFinite(numerator / denominator)
    ? numerator / denominator
    : null;

export const calculateMetrics = (data: CleanedDataResult): MetricsResult => {
  const salesAmount = sumMappedField(data, "sales_amount");
  const refundAmount = sumMappedField(data, "refund_amount");
  const visitors = sumMappedField(data, "visitors");
  const paidBuyers = sumMappedField(data, "paid_buyers");
  const adSpend = sumMappedField(data, "ad_spend");
  const adClicks = sumMappedField(data, "ad_clicks");
  const adSalesAmount = sumMappedField(data, "ad_sales_amount");
  const gsv = Math.max(0, salesAmount - refundAmount);

  return {
    totals: {
      sales_amount: salesAmount,
      refund_amount: refundAmount,
      gsv,
      visitors,
      paid_buyers: paidBuyers,
      conversion_rate: visitors > 0 ? paidBuyers / visitors : null,
      avg_order_value: divide(salesAmount, paidBuyers),
      refund_rate: divide(refundAmount, salesAmount),
      ad_spend: adSpend,
      ad_clicks: adClicks,
      avg_cpc: divide(adSpend, adClicks),
      ad_sales_amount: adSalesAmount,
      roi: divide(adSalesAmount, adSpend),
      ad_spend_ratio: divide(adSpend, salesAmount),
      ad_spend_ratio_after_refund: divide(adSpend, gsv),
    },
  };
};
