import type { PlatformCode, StoreRecord, V2Dataset } from "../domain/models";
import type {
  HomeCommandCenterDateRangeState,
  HomeCommandCenterPeriod,
  HomeCommandCenterStorePerformance,
} from "./contracts";
import {
  aggregateV2Metrics,
  filterV2AdPlanFacts,
  filterV2BusinessFacts,
  safeDivide,
  storeLabel,
} from "./metrics";
import { buildV2TargetProgress } from "./targets";

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

const storeKey = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `${store.platformCode}:${store.storeId}`;

const DEFAULT_TMAIL_STORE_ID = "tmall-default-store";

export const platformLabel = (platformCode: PlatformCode): string =>
  PLATFORM_LABELS[platformCode] ?? platformCode;

const storeBoardHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string | null =>
  store.platformCode === "tmall" && store.storeId === DEFAULT_TMAIL_STORE_ID
    ? `/store-board?platform=tmall&storeId=${DEFAULT_TMAIL_STORE_ID}`
    : null;

const latestBatchIdForStore = (dataset: V2Dataset, store: Pick<StoreRecord, "platformCode" | "storeId">): string | null =>
  dataset.importBatches
    .filter((batch) => batch.platformCode === store.platformCode && batch.storeId === store.storeId)
    .sort((left, right) =>
      (right.importCompletedAt ?? right.updatedAt).localeCompare(left.importCompletedAt ?? left.updatedAt) ||
      right.importBatchId.localeCompare(left.importBatchId),
    )[0]?.importBatchId ?? null;

const historyHref = (dataset: V2Dataset, store: Pick<StoreRecord, "platformCode" | "storeId">): string => {
  const params = new URLSearchParams({
    platform: store.platformCode,
    storeId: store.storeId,
  });
  const batchId = latestBatchIdForStore(dataset, store);
  if (batchId) params.set("batchId", batchId);
  return `/upload/history?${params.toString()}`;
};

export const buildStoreOptions = (
  stores: StoreRecord[],
  platformFilter: PlatformCode | "all",
): Array<{ value: string | "all"; label: string; platformCode: PlatformCode | "all" }> => [
  { value: "all", label: "全部店铺", platformCode: "all" },
  ...stores
    .filter((store) => platformFilter === "all" || store.platformCode === platformFilter)
    .sort((a, b) =>
      a.platformCode.localeCompare(b.platformCode) ||
      storeLabel(a).localeCompare(storeLabel(b), "zh-CN") ||
      a.storeId.localeCompare(b.storeId),
    )
    .map((store) => ({
      value: storeKey(store),
      label: `${platformLabel(store.platformCode)} · ${storeLabel(store)}`,
      platformCode: store.platformCode,
    })),
];

export const buildPlatformOptions = (
  stores: StoreRecord[],
): Array<{ value: PlatformCode | "all"; label: string }> => {
  const platforms = [...new Set(stores.map((store) => store.platformCode))].sort();
  return [
    { value: "all", label: "全部平台" },
    ...platforms.map((platformCode) => ({
      value: platformCode,
      label: platformLabel(platformCode),
    })),
  ];
};

export const normalizeStoreFilter = ({
  stores,
  platformFilter,
  storeFilter,
}: {
  stores: StoreRecord[];
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}): string | "all" => {
  if (storeFilter === "all") return "all";
  return stores.some(
    (store) =>
      storeKey(store) === storeFilter &&
      (platformFilter === "all" || store.platformCode === platformFilter),
  )
    ? storeFilter
    : "all";
};

export const buildStorePerformance = ({
  dataset,
  range,
  selectedPeriod,
  platformFilter,
  storeFilter,
}: {
  dataset: V2Dataset;
  range: HomeCommandCenterDateRangeState;
  selectedPeriod: HomeCommandCenterPeriod;
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}): HomeCommandCenterStorePerformance[] => {
  const matchingStores = dataset.stores.filter(
    (store) =>
      (platformFilter === "all" || store.platformCode === platformFilter) &&
      (storeFilter === "all" || storeKey(store) === storeFilter),
  );
  const allBusinessFacts = filterV2BusinessFacts({
    dataset,
    range,
    platformFilter,
    storeFilter,
  });
  const totalGmv = aggregateV2Metrics({
    businessFacts: allBusinessFacts,
    adPlanFacts: [],
  }).gmv;

  return matchingStores
    .map((store) => {
      const currentStoreFilter = storeKey(store);
      const businessFacts = filterV2BusinessFacts({
        dataset,
        range,
        platformFilter: store.platformCode,
        storeFilter: currentStoreFilter,
      });
      const adPlanFacts = filterV2AdPlanFacts({
        dataset,
        range,
        platformFilter: store.platformCode,
        storeFilter: currentStoreFilter,
      });
      const metrics = aggregateV2Metrics({ businessFacts, adPlanFacts });
      const targetProgress = buildV2TargetProgress({
        targets: dataset.targets,
        businessFacts,
        adPlanFacts,
        selectedPeriod,
        range,
        selectedPlatform: store.platformCode,
        selectedStore: currentStoreFilter,
      })[0] ?? null;

      return {
        key: currentStoreFilter,
        platformCode: store.platformCode,
        platformLabel: platformLabel(store.platformCode),
        storeId: store.storeId,
        storeName: storeLabel(store),
        canOpenStoreBoard: storeBoardHref(store) !== null,
        storeBoardHref: storeBoardHref(store),
        historyHref: historyHref(dataset, store),
        gmv: metrics.hasBusinessData ? metrics.gmv : null,
        gsv: metrics.hasBusinessData ? metrics.gsv : null,
        contributionRate: metrics.hasBusinessData ? safeDivide(metrics.gmv, totalGmv) : null,
        visitors: metrics.hasBusinessData ? metrics.visitors : null,
        paidBuyers: metrics.hasBusinessData ? metrics.paidBuyers : null,
        conversionRate: metrics.conversionRate,
        adSpend: metrics.adSpend,
        adRoi: metrics.adRoi,
        targetProgressRate: targetProgress?.progressRate ?? null,
        href: storeBoardHref(store) ?? historyHref(dataset, store),
      };
    })
    .sort((a, b) => {
      const left = a.gmv ?? Number.NEGATIVE_INFINITY;
      const right = b.gmv ?? Number.NEGATIVE_INFINITY;
      if (right !== left) return right - left;
      return a.storeName.localeCompare(b.storeName, "zh-CN") || a.key.localeCompare(b.key);
    });
};
