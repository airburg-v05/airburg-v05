import type { CleanedDataResult } from "@/lib/cleaning/basic-clean";
import { aggregateProducts } from "@/lib/metrics/product-aggregate";

export type AnomalyType =
  | "high_traffic_low_conversion"
  | "high_cart_low_payment"
  | "data_missing";

export interface AnomalyItem {
  product_key: string;
  product_id: string | null;
  product_name: string;
  type: AnomalyType;
  reason: string;
}

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export const detectAnomalies = (data: CleanedDataResult): AnomalyItem[] => {
  const products = aggregateProducts(data);
  if (products.length === 0) return [];

  const validConversions = products
    .map((item) => item.conversion_rate)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const averageConversion = average(validConversions);
  const averageVisitors = average(
    products.filter((item) => item.hasVisitors).map((item) => item.visitors),
  );
  const averageCart = average(
    products.filter((item) => item.hasCartAdditions).map((item) => item.cart_additions),
  );
  const averagePaidBuyers = average(
    products.filter((item) => item.hasPaidBuyers).map((item) => item.paid_buyers),
  );

  const anomalies: AnomalyItem[] = [];

  products.forEach((item) => {
    const base = {
      product_key: item.product_key,
      product_id: item.product_id,
      product_name: item.product_name,
    };

    if (!item.hasVisitors || !item.hasSales || !item.hasPaidBuyers) {
      anomalies.push({
        ...base,
        type: "data_missing",
        reason: "该商品缺少访客数、支付金额或支付买家数，暂时不能完成完整判断。",
      });
      return;
    }

    if (
      item.visitors > averageVisitors &&
      item.conversion_rate !== null &&
      item.conversion_rate < averageConversion
    ) {
      anomalies.push({
        ...base,
        type: "high_traffic_low_conversion",
        reason: `访客数高于商品均值，但支付转化率低于商品均值，建议优先检查价格、主图、详情页和评价。`,
      });
    }

    if (
      item.hasCartAdditions &&
      item.cart_additions > averageCart &&
      item.paid_buyers < averagePaidBuyers
    ) {
      anomalies.push({
        ...base,
        type: "high_cart_low_payment",
        reason: "加购表现高于商品均值，但支付买家数偏低，建议检查促销门槛、价格和支付承接。",
      });
    }
  });

  return anomalies;
};
