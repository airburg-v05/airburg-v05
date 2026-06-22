"use client";

import { parseTmallStoredAnalysisResult } from "../../storage/tmall-analysis-validator";
import { TMALL_ANALYSIS_STORAGE_KEY } from "../../storage/tmall-analysis-storage";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import type { ProductBoardLoadResult, ProductBoardRuntimeContext } from "./contracts";
import { DEFAULT_TMALL_STORE_ID } from "../store-board/store-context";

declare const process: {
  env?: {
    NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?: string;
  };
};

const CORRUPTED_INSPECTION_STATUSES = new Set([
  "pointer_corrupted",
  "active_dataset_missing",
  "active_dataset_invalid",
]);

const getProductBoardDatabaseName = (): string =>
  process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

export const isLegacyDefaultProductRequest = ({
  platformCode,
  storeId,
}: {
  platformCode: string | null;
  storeId: string | null;
}): boolean =>
  (!platformCode || platformCode === "tmall") &&
  (!storeId || storeId === DEFAULT_TMALL_STORE_ID);

const readLegacyAnalysis = () =>
  parseTmallStoredAnalysisResult(window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY));

const legacyUntrackedContext = ({
  v2IssueCodes,
  message,
  platformCode,
  storeId,
}: Pick<ProductBoardRuntimeContext, "v2IssueCodes" | "message"> & {
  platformCode: string | null;
  storeId: string | null;
}): ProductBoardRuntimeContext | null => {
  if (!isLegacyDefaultProductRequest({ platformCode, storeId })) return null;
  const legacy = readLegacyAnalysis();
  if (legacy.status !== "valid" || !legacy.result) return null;
  return {
    mode: "legacy_untracked",
    dataset: null,
    legacyAnalysis: legacy.result,
    v2IssueCodes,
    message,
  };
};

export const loadProductBoardContext = async ({
  platformCode,
  storeId,
  databaseName = getProductBoardDatabaseName(),
}: {
  platformCode: string | null;
  storeId: string | null;
  databaseName?: string;
}): Promise<ProductBoardLoadResult> => {
  let store: IndexedDbV2PersistenceStore | null = null;
  try {
    store = await IndexedDbV2PersistenceStore.open({ databaseName });
    const inspection = await store.inspectState();

    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      return {
        status: "corrupted",
        context: {
          mode: "corrupted",
          dataset: null,
          legacyAnalysis: legacyUntrackedContext({
            v2IssueCodes: inspection.issueCodes,
            message: "本地多店铺数据状态不可安全读取，旧版商品池不会在本页展开。",
            platformCode,
            storeId,
          })?.legacyAnalysis ?? null,
          v2IssueCodes: inspection.issueCodes,
          message: "本地重点商品数据不可安全读取，请前往数据导入或数据质量页面处理。",
        },
        message: "本地重点商品数据不可安全读取。",
      };
    }

    const activeDataset = await store.loadActiveDataset();
    if (activeDataset) {
      return {
        status: "valid",
        context: {
          mode: "v2_valid",
          dataset: activeDataset,
          legacyAnalysis: null,
          v2IssueCodes: inspection.issueCodes,
          message: "已读取多店铺重点商品数据。",
        },
        message: "已读取多店铺重点商品数据。",
      };
    }

    const fallback = legacyUntrackedContext({
      v2IssueCodes: inspection.issueCodes,
      message: "当前只有旧版单店商品数据。请完成新数据导入并添加重点商品后查看新版宝贝看板。",
      platformCode,
      storeId,
    });
    if (fallback) return { status: "valid", context: fallback, message: fallback.message };

    return {
      status: "empty",
      context: {
        mode: "empty",
        dataset: null,
        legacyAnalysis: null,
        v2IssueCodes: inspection.issueCodes,
        message: "当前没有可用重点商品数据。",
      },
      message: "当前没有可用重点商品数据。",
    };
  } catch {
    return {
      status: "error",
      context: {
        mode: "error",
        dataset: null,
        legacyAnalysis: null,
        v2IssueCodes: ["product_board_read_error"],
        message: "读取重点商品数据失败，请刷新后重试。",
      },
      message: "读取重点商品数据失败。",
    };
  } finally {
    store?.close();
  }
};
