import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../../types/tmall";
import { DEFAULT_TMAIL_OWNER } from "../migration/contracts";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import type { StoreRecord } from "../domain/models";
import {
  type V05BatchImportResult,
  type V05ImportContext,
  type V05ImportStoreInput,
} from "./contracts";
import { executeV05TmallBatchImport } from "./batch-import-service";

const fallbackNow = (): string => new Date().toISOString();

export const getV05ImportDatabaseName = (): string =>
  process.env.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

const defaultStoreRecord = (capturedAt = fallbackNow()): StoreRecord => ({
  schemaVersion: "airburg_storage_v2",
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  storeName: DEFAULT_TMAIL_OWNER.storeName,
  status: "active",
  createdAt: capturedAt,
  updatedAt: capturedAt,
});

const uniqueStores = (stores: StoreRecord[]): StoreRecord[] => {
  const byKey = new Map<string, StoreRecord>();
  stores.forEach((store) => {
    const key = `${store.platformCode}:${store.storeId}`;
    if (!byKey.has(key)) byKey.set(key, store);
  });
  return [...byKey.values()].sort((left, right) => {
    if (left.storeId === DEFAULT_TMAIL_OWNER.storeId) return -1;
    if (right.storeId === DEFAULT_TMAIL_OWNER.storeId) return 1;
    return left.storeName.localeCompare(right.storeName, "zh-CN");
  });
};

export const loadV05ImportContext = async (
  databaseName = getV05ImportDatabaseName(),
): Promise<V05ImportContext> => {
  const store = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    const activeDataset = await store.loadActiveDataset();
    const tmallStores = activeDataset?.stores.filter((item) => item.platformCode === "tmall") ?? [];
    const stores = uniqueStores([defaultStoreRecord(), ...tmallStores]);
    return {
      activeDatasetId: activeDataset?.datasetId ?? null,
      stores,
    };
  } finally {
    store.close();
  }
};

export const runV05BrowserTmallBatchImport = async ({
  store,
  filesBySourceType,
  compatibilityWriter,
  databaseName = getV05ImportDatabaseName(),
}: {
  store: V05ImportStoreInput;
  filesBySourceType: Record<TmallSourceType, File>;
  compatibilityWriter?: (analysis: TmallFourSourceAnalysisResult) => void;
  databaseName?: string;
}): Promise<V05BatchImportResult> => {
  const persistenceStore = await IndexedDbV2PersistenceStore.open({ databaseName });
  try {
    return await executeV05TmallBatchImport({
      platformCode: "tmall",
      store,
      filesBySourceType,
      persistenceStore,
      legacyStorage: window.localStorage,
      compatibilityWriter,
    });
  } finally {
    persistenceStore.close();
  }
};

export const validateV05NewStoreName = (
  storeName: string,
  stores: StoreRecord[],
): { valid: boolean; value: string; error: string | null } => {
  const value = storeName.trim();
  if (value.length < 2 || value.length > 40) {
    return { valid: false, value, error: "店铺名称需为 2 到 40 个字符。" };
  }
  const duplicate = stores.some(
    (store) => store.platformCode === "tmall" && store.storeName.trim() === value,
  );
  if (duplicate) return { valid: false, value, error: "同平台下已有同名店铺。" };
  return { valid: true, value, error: null };
};
