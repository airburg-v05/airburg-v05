import type { CleanedDataResult } from "@/lib/cleaning/basic-clean";

export interface ProductAggregate {
  product_key: string;
  product_id: string | null;
  product_name: string;
  sales_amount: number;
  refund_amount: number;
  visitors: number;
  paid_buyers: number;
  favorites: number;
  cart_additions: number;
  conversion_rate: number | null;
  hasSales: boolean;
  hasVisitors: boolean;
  hasPaidBuyers: boolean;
  hasFavorites: boolean;
  hasCartAdditions: boolean;
}

const toSafeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const toSafeText = (value: unknown): string => `${value ?? ""}`.trim();

export const aggregateProducts = (data: CleanedDataResult): ProductAggregate[] => {
  const productIdField =
    data.mapping.product_id.status === "matched" ? data.mapping.product_id.rawField : null;
  const productNameField =
    data.mapping.product_name.status === "matched" ? data.mapping.product_name.rawField : null;

  if (!productIdField && !productNameField) return [];

  const aggregates = new Map<string, ProductAggregate>();

  data.rows.forEach((row, rowIndex) => {
    const productId = productIdField ? toSafeText(row[productIdField]) : "";
    const productName = productNameField ? toSafeText(row[productNameField]) : "";
    if (!productId && !productName) return;

    const productKey = productId ? `id:${productId}` : `name:${productName}`;
    const existing = aggregates.get(productKey) ?? {
      product_key: productKey || `row:${rowIndex}`,
      product_id: productId || null,
      product_name: productName || `商品 ${productId}`,
      sales_amount: 0,
      refund_amount: 0,
      visitors: 0,
      paid_buyers: 0,
      favorites: 0,
      cart_additions: 0,
      conversion_rate: null,
      hasSales: false,
      hasVisitors: false,
      hasPaidBuyers: false,
      hasFavorites: false,
      hasCartAdditions: false,
    };

    if (productName && existing.product_name !== productName) {
      existing.product_name = productName;
    }

    const addMetric = (
      field: "sales_amount" | "refund_amount" | "visitors" | "paid_buyers" | "favorites" | "cart_additions",
      hasField: "hasSales" | "hasVisitors" | "hasPaidBuyers" | "hasFavorites" | "hasCartAdditions" | null,
    ) => {
      const mapping = data.mapping[field];
      if (mapping.status !== "matched" || !mapping.rawField) return;
      const value = toSafeNumber(row[mapping.rawField]);
      if (value === null) return;
      existing[field] += value;
      if (hasField) existing[hasField] = true;
    };

    addMetric("sales_amount", "hasSales");
    addMetric("refund_amount", null);
    addMetric("visitors", "hasVisitors");
    addMetric("paid_buyers", "hasPaidBuyers");
    addMetric("favorites", "hasFavorites");
    addMetric("cart_additions", "hasCartAdditions");

    existing.conversion_rate =
      existing.hasVisitors && existing.visitors > 0 && existing.hasPaidBuyers
        ? existing.paid_buyers / existing.visitors
        : null;

    aggregates.set(productKey, existing);
  });

  return Array.from(aggregates.values());
};
