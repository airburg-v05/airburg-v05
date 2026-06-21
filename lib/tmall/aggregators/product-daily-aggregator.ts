import type { ProductDailyFact } from "../../../types/tmall";
import { safeDivide } from "../normalizers";
import type { BusinessProductRecord } from "../parsers/business-product-parser";

interface ProductAccumulator {
  date: string;
  productId: string;
  productName: string | null;
  visitors: number;
  pageViews: number;
  paidBuyers: number;
  gmv: number;
  refundSuccessAmount: number;
  favorites: number;
  cartAdditions: number;
  orderBuyers: number;
  orderAmount: number;
  searchVisitors: number;
  searchPaidBuyers: number;
}

export const aggregateProductDailyFacts = (
  records: BusinessProductRecord[],
): ProductDailyFact[] => {
  const groups = new Map<string, ProductAccumulator>();

  records.forEach((record) => {
    if (!record.date || !record.productId) return;
    const key = `${record.date}::${record.productId}`;
    const current = groups.get(key) ?? {
      date: record.date,
      productId: record.productId,
      productName: record.productName,
      visitors: 0,
      pageViews: 0,
      paidBuyers: 0,
      gmv: 0,
      refundSuccessAmount: 0,
      favorites: 0,
      cartAdditions: 0,
      orderBuyers: 0,
      orderAmount: 0,
      searchVisitors: 0,
      searchPaidBuyers: 0,
    };

    current.productName = current.productName ?? record.productName;
    current.visitors += record.visitors;
    current.pageViews += record.pageViews;
    current.paidBuyers += record.paidBuyers;
    current.gmv += record.gmv;
    current.refundSuccessAmount += record.refundSuccessAmount;
    current.favorites += record.favorites;
    current.cartAdditions += record.cartAdditions;
    current.orderBuyers += record.orderBuyers;
    current.orderAmount += record.orderAmount;
    current.searchVisitors += record.searchVisitors;
    current.searchPaidBuyers += record.searchPaidBuyers;
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((item) => {
      const gsv = item.gmv - item.refundSuccessAmount;
      return {
        platform: "tmall" as const,
        date: item.date,
        productId: item.productId,
        productName: item.productName,
        visitors: item.visitors,
        pageViews: item.pageViews,
        paidBuyers: item.paidBuyers,
        gmv: item.gmv,
        refundSuccessAmount: item.refundSuccessAmount,
        gsv,
        refundRate: safeDivide(item.refundSuccessAmount, item.gmv),
        conversionRate: safeDivide(item.paidBuyers, item.visitors),
        avgOrderValue: safeDivide(item.gmv, item.paidBuyers),
        favorites: item.favorites,
        cartAdditions: item.cartAdditions,
        orderBuyers: item.orderBuyers,
        orderAmount: item.orderAmount,
        searchVisitors: item.searchVisitors,
        searchPaidBuyers: item.searchPaidBuyers,
        hasAdData: false,
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date) || first.productId.localeCompare(second.productId));
};

