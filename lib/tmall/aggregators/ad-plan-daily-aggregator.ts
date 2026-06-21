import type { AdPlanDailyFact } from "../../../types/tmall";
import { safeDivide } from "../normalizers";
import type { AdPlanRecord } from "../parsers/ad-plan-parser";

interface AdPlanAccumulator {
  date: string;
  planId: string;
  planName: string | null;
  sceneId: string | null;
  sceneName: string | null;
  adSpend: number;
  impressions: number;
  clicks: number;
  transactionAmount: number;
  directTransactionAmount: number;
  indirectTransactionAmount: number;
  guidedVisitors: number;
  guidedProspects: number;
  newBuyers: number;
  memberJoinCount: number;
  memberFirstBuyers: number;
}

export const aggregateAdPlanDailyFacts = (records: AdPlanRecord[]): AdPlanDailyFact[] => {
  const groups = new Map<string, AdPlanAccumulator>();

  records.forEach((record) => {
    if (!record.date || !record.planId) return;
    const key = `${record.date}::${record.planId}`;
    const current = groups.get(key) ?? {
      date: record.date,
      planId: record.planId,
      planName: record.planName,
      sceneId: record.sceneId,
      sceneName: record.sceneName,
      adSpend: 0,
      impressions: 0,
      clicks: 0,
      transactionAmount: 0,
      directTransactionAmount: 0,
      indirectTransactionAmount: 0,
      guidedVisitors: 0,
      guidedProspects: 0,
      newBuyers: 0,
      memberJoinCount: 0,
      memberFirstBuyers: 0,
    };

    current.planName = current.planName ?? record.planName;
    current.sceneId = current.sceneId ?? record.sceneId;
    current.sceneName = current.sceneName ?? record.sceneName;
    current.adSpend += record.adSpend;
    current.impressions += record.impressions;
    current.clicks += record.clicks;
    current.transactionAmount += record.transactionAmount;
    current.directTransactionAmount += record.directTransactionAmount;
    current.indirectTransactionAmount += record.indirectTransactionAmount;
    current.guidedVisitors += record.guidedVisitors;
    current.guidedProspects += record.guidedProspects;
    current.newBuyers += record.newBuyers;
    current.memberJoinCount += record.memberJoinCount;
    current.memberFirstBuyers += record.memberFirstBuyers;
    groups.set(key, current);
  });

  return [...groups.values()]
    .map((item) => ({
      platform: "tmall" as const,
      date: item.date,
      planId: item.planId,
      planName: item.planName,
      sceneId: item.sceneId,
      sceneName: item.sceneName,
      adSpend: item.adSpend,
      impressions: item.impressions,
      clicks: item.clicks,
      transactionAmount: item.transactionAmount,
      directTransactionAmount: item.directTransactionAmount,
      indirectTransactionAmount: item.indirectTransactionAmount,
      guidedVisitors: item.guidedVisitors,
      guidedProspects: item.guidedProspects,
      newBuyers: item.newBuyers,
      memberJoinCount: item.memberJoinCount,
      memberFirstBuyers: item.memberFirstBuyers,
      clickRate: safeDivide(item.clicks, item.impressions),
      avgClickCost: safeDivide(item.adSpend, item.clicks),
      roi: safeDivide(item.transactionAmount, item.adSpend),
      guidedProspectRate: safeDivide(item.guidedProspects, item.guidedVisitors),
      newBuyerRate: safeDivide(item.newBuyers, item.guidedVisitors),
      memberJoinRate: safeDivide(item.memberJoinCount, item.guidedVisitors),
    }))
    .sort((first, second) => first.date.localeCompare(second.date) || first.planId.localeCompare(second.planId));
};

