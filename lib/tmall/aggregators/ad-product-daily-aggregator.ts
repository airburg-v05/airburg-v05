import type { AdProductDailyFact } from "../../../types/tmall";
import { safeDivide } from "../normalizers";
import type { AdProductRecord } from "../parsers/ad-product-parser";

interface AdProductAccumulator {
  date: string;
  productId: string;
  adSpend: number;
  impressions: number;
  clicks: number;
  adTransactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  favoriteCartCount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
}

export const aggregateAdProductDailyFacts = (
  records: AdProductRecord[],
): AdProductDailyFact[] => {
  const groups = new Map<string, AdProductAccumulator>();

  records.forEach((record) => {
    if (!record.date || !record.productId) return;
    const key = `${record.date}::${record.productId}`;
    const current = groups.get(key) ?? {
      date: record.date,
      productId: record.productId,
      adSpend: 0,
      impressions: 0,
      clicks: 0,
      adTransactionAmount: 0,
      directTransactionAmount: 0,
      indirectTransactionAmount: 0,
      favoriteCartCount: 0,
      guidedVisitors: 0,
      guidedProspects: 0,
      newBuyers: 0,
      memberJoinCount: 0,
    };

    current.adSpend += record.adSpend;
    current.impressions += record.impressions;
    current.clicks += record.clicks;
    current.adTransactionAmount += record.adTransactionAmount;
    current.directTransactionAmount += record.directTransactionAmount;
    current.indirectTransactionAmount += record.indirectTransactionAmount;
    current.favoriteCartCount += record.favoriteCartCount;
    current.guidedVisitors += record.guidedVisitors;
    current.guidedProspects += record.guidedProspects;
    current.newBuyers += record.newBuyers;
    current.memberJoinCount += record.memberJoinCount;
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((item) => ({
      platform: "tmall" as const,
      date: item.date,
      productId: item.productId,
      adSpend: item.adSpend,
      impressions: item.impressions,
      clicks: item.clicks,
      adTransactionAmount: item.adTransactionAmount,
      directTransactionAmount: item.directTransactionAmount,
      indirectTransactionAmount: item.indirectTransactionAmount,
      favoriteCartCount: item.favoriteCartCount,
      guidedVisitors: item.guidedVisitors,
      guidedProspects: item.guidedProspects,
      newBuyers: item.newBuyers,
      memberJoinCount: item.memberJoinCount,
      clickRate: safeDivide(item.clicks, item.impressions),
      avgClickCost: safeDivide(item.adSpend, item.clicks),
      cpm: safeDivide(item.adSpend * 1000, item.impressions),
      roi: safeDivide(item.adTransactionAmount, item.adSpend),
      directTransactionShare: safeDivide(item.directTransactionAmount, item.adTransactionAmount),
      indirectTransactionShare: safeDivide(item.indirectTransactionAmount, item.adTransactionAmount),
      favoriteCartCost: safeDivide(item.adSpend, item.favoriteCartCount),
      hasAdData: true,
    }))
    .sort((first, second) => first.date.localeCompare(second.date) || first.productId.localeCompare(second.productId));
};

