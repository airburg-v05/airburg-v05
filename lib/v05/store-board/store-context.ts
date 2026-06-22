import type { PlatformCode, StoreRecord, V2Dataset } from "../domain/models";
import { storeLabel } from "../home-command-center";
import type { StoreBoardStoreContext } from "./contracts";

export const DEFAULT_TMALL_STORE_ID = "tmall-default-store";
export const DEFAULT_TMALL_STORE_KEY = `tmall:${DEFAULT_TMALL_STORE_ID}`;

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

export const platformLabel = (platformCode: PlatformCode): string =>
  PLATFORM_LABELS[platformCode] ?? platformCode;

export const storeKey = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `${store.platformCode}:${store.storeId}`;

export const storeBoardHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/store-board?platform=${encodeURIComponent(store.platformCode)}&storeId=${encodeURIComponent(store.storeId)}`;

const latestBatchIdForStore = (
  dataset: V2Dataset | null,
  store: Pick<StoreRecord, "platformCode" | "storeId">,
): string | null =>
  dataset?.importBatches
    .filter((batch) => batch.platformCode === store.platformCode && batch.storeId === store.storeId)
    .sort((left, right) =>
      (right.importCompletedAt ?? right.updatedAt).localeCompare(left.importCompletedAt ?? left.updatedAt) ||
      right.importBatchId.localeCompare(left.importBatchId),
    )[0]?.importBatchId ?? null;

export const historyHrefForStore = (
  dataset: V2Dataset | null,
  store: Pick<StoreRecord, "platformCode" | "storeId">,
): string => {
  const params = new URLSearchParams({
    platform: store.platformCode,
    storeId: store.storeId,
  });
  const batchId = latestBatchIdForStore(dataset, store);
  if (batchId) params.set("batchId", batchId);
  return `/upload/history?${params.toString()}`;
};

export const activeStores = (dataset: V2Dataset): StoreRecord[] =>
  dataset.stores
    .filter((store) => store.status === "active")
    .sort((left, right) =>
      left.platformCode.localeCompare(right.platformCode) ||
      storeLabel(left).localeCompare(storeLabel(right), "zh-CN") ||
      left.storeId.localeCompare(right.storeId),
    );

export const findStore = (
  stores: readonly StoreRecord[],
  platformCode: PlatformCode,
  storeId: string,
): StoreRecord | null =>
  stores.find((store) => store.platformCode === platformCode && store.storeId === storeId) ?? null;

export const buildStoreContext = ({
  dataset,
  store,
}: {
  dataset: V2Dataset | null;
  store: StoreRecord;
}): StoreBoardStoreContext => {
  const stores = dataset ? activeStores(dataset) : [store];
  return {
    platformCode: store.platformCode,
    platformLabel: platformLabel(store.platformCode),
    storeId: store.storeId,
    storeName: storeLabel(store),
    storeKey: storeKey(store),
    isDefaultLegacyStore: store.platformCode === "tmall" && store.storeId === DEFAULT_TMALL_STORE_ID,
    availableStores: stores.map((item) => ({
      value: storeKey(item),
      label: `${platformLabel(item.platformCode)} · ${storeLabel(item)}`,
      platformCode: item.platformCode,
      href: storeBoardHref(item),
    })),
    historyHref: historyHrefForStore(dataset, store),
  };
};

export const buildLegacyDefaultStoreRecord = (): StoreRecord => ({
  schemaVersion: "airburg_storage_v2",
  platformCode: "tmall",
  storeId: DEFAULT_TMALL_STORE_ID,
  storeName: "天猫默认店铺",
  status: "active",
  createdAt: "2026-06-22T00:00:00.000Z",
  updatedAt: "2026-06-22T00:00:00.000Z",
});
