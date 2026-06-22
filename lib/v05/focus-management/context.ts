import type { PlatformCode, StoreRecord, V2Dataset } from "../domain/models";
import {
  DEFAULT_FOCUS_PLATFORM,
  DEFAULT_FOCUS_STORE_ID,
  type FocusManagementViewModel,
  type FocusStoreContext,
  type FocusStoreOption,
} from "./contracts";
import { buildProductCandidates } from "./product-candidates";

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

export const isPlatformCode = (value: string | null): value is PlatformCode =>
  value === "tmall" || value === "jd" || value === "pdd" || value === "douyin" || value === "youzan";

export const platformLabel = (platformCode: PlatformCode): string =>
  PLATFORM_LABELS[platformCode] ?? platformCode;

export const storeLabel = (store: Pick<StoreRecord, "storeName" | "storeId">): string =>
  store.storeName?.trim() || store.storeId;

export const storeKey = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `${store.platformCode}:${store.storeId}`;

export const focusStoreBoardHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/store-board?${new URLSearchParams({ platform: store.platformCode, storeId: store.storeId }).toString()}`;

export const focusHistoryHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/upload/history?${new URLSearchParams({ platform: store.platformCode, storeId: store.storeId }).toString()}`;

export const focusQualityHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/upload/quality?${new URLSearchParams({ platform: store.platformCode, storeId: store.storeId }).toString()}`;

export const focusImportHref = (store: Pick<StoreRecord, "platformCode" | "storeId">): string =>
  `/upload?${new URLSearchParams({ platform: store.platformCode, storeId: store.storeId }).toString()}`;

export const activeFocusStores = (dataset: V2Dataset): StoreRecord[] =>
  dataset.stores
    .filter((store) => store.status === "active")
    .sort((left, right) => {
      if (left.platformCode === DEFAULT_FOCUS_PLATFORM && left.storeId === DEFAULT_FOCUS_STORE_ID) return -1;
      if (right.platformCode === DEFAULT_FOCUS_PLATFORM && right.storeId === DEFAULT_FOCUS_STORE_ID) return 1;
      return (
        left.platformCode.localeCompare(right.platformCode) ||
        storeLabel(left).localeCompare(storeLabel(right), "zh-CN") ||
        left.storeId.localeCompare(right.storeId)
      );
    });

export const resolveFocusStore = ({
  dataset,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  platformCode: string | null;
  storeId: string | null;
}): {
  requestedPlatformCode: PlatformCode;
  requestedStoreId: string;
  store: StoreRecord | null;
  invalidExplicitStore: boolean;
} => {
  const stores = activeFocusStores(dataset);
  const requestedPlatformCode = isPlatformCode(platformCode) ? platformCode : DEFAULT_FOCUS_PLATFORM;
  const requestedStoreId = storeId?.trim() || DEFAULT_FOCUS_STORE_ID;
  const store =
    stores.find((item) => item.platformCode === requestedPlatformCode && item.storeId === requestedStoreId) ??
    null;

  return {
    requestedPlatformCode,
    requestedStoreId,
    store,
    invalidExplicitStore: !!storeId?.trim() && !store,
  };
};

export const buildFocusStoreContext = ({
  dataset,
  store,
  basePath,
}: {
  dataset: V2Dataset;
  store: StoreRecord;
  basePath: string;
}): FocusStoreContext => {
  const stores = activeFocusStores(dataset);
  const options: FocusStoreOption[] = stores.map((item) => ({
    value: storeKey(item),
    platformCode: item.platformCode,
    storeId: item.storeId,
    label: `${platformLabel(item.platformCode)} · ${storeLabel(item)}`,
    href: `${basePath}?${new URLSearchParams({ platform: item.platformCode, storeId: item.storeId }).toString()}`,
  }));

  return {
    platformCode: store.platformCode,
    storeId: store.storeId,
    storeName: storeLabel(store),
    platformLabel: platformLabel(store.platformCode),
    storeKey: storeKey(store),
    storeBoardHref: focusStoreBoardHref(store),
    importHref: focusImportHref(store),
    historyHref: focusHistoryHref(store),
    qualityHref: focusQualityHref(store),
    availableStores: options,
  };
};

export const buildEmptyFocusViewModel = (message: string): FocusManagementViewModel => ({
  mode: "empty",
  datasetId: null,
  expectedCurrentDatasetId: null,
  storeContext: null,
  series: [],
  trackedProducts: [],
  productCandidates: [],
  notices: [message],
  primaryActions: [{ label: "数据导入", href: "/upload" }],
  isEmpty: true,
});

export const buildInvalidFocusViewModel = ({
  platformCode,
  storeId,
}: {
  platformCode: string | null;
  storeId: string | null;
}): FocusManagementViewModel => ({
  ...buildEmptyFocusViewModel("当前店铺不可用，请从店铺看板或导入记录进入有效店铺。"),
  mode: "invalid_store",
  primaryActions: [
    { label: "返回店铺看板", href: "/store-board" },
    {
      label: "查看导入记录",
      href: `/upload/history?${new URLSearchParams({
        ...(platformCode ? { platform: platformCode } : {}),
        ...(storeId ? { storeId } : {}),
      }).toString()}`,
    },
  ],
});

export const buildFocusManagementViewModel = ({
  dataset,
  platformCode,
  storeId,
  basePath,
}: {
  dataset: V2Dataset;
  platformCode: string | null;
  storeId: string | null;
  basePath: string;
}): FocusManagementViewModel => {
  const resolved = resolveFocusStore({ dataset, platformCode, storeId });
  if (!resolved.store) return buildInvalidFocusViewModel({ platformCode, storeId });

  const context = buildFocusStoreContext({ dataset, store: resolved.store, basePath });
  const series = dataset.series
    .filter((item) => item.platformCode === context.platformCode && item.storeId === context.storeId)
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.seriesId.localeCompare(right.seriesId));
  const trackedProducts = dataset.trackedProducts
    .filter((item) => item.platformCode === context.platformCode && item.storeId === context.storeId)
    .sort(
      (left, right) =>
        (left.displayName ?? left.productId).localeCompare(right.displayName ?? right.productId, "zh-CN") ||
        left.trackedProductId.localeCompare(right.trackedProductId),
    );

  return {
    mode: "ready",
    datasetId: dataset.datasetId,
    expectedCurrentDatasetId: dataset.datasetId,
    storeContext: context,
    series,
    trackedProducts,
    productCandidates: buildProductCandidates({ dataset, platformCode: context.platformCode, storeId: context.storeId }),
    notices: [
      `当前只管理 ${context.platformLabel} · ${context.storeName} 的系列和重点商品。`,
      "保存会生成新的本地数据版本，不会改写旧版 legacy key。",
    ],
    primaryActions: [
      { label: "返回店铺看板", href: context.storeBoardHref },
      { label: "查看导入记录", href: context.historyHref },
    ],
    isEmpty: series.length === 0 && trackedProducts.length === 0,
  };
};
