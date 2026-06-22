"use client";

import {
  parseTmallStoredAnalysisResult,
} from "../../storage/tmall-analysis-validator";
import { TMALL_ANALYSIS_STORAGE_KEY } from "../../storage/tmall-analysis-storage";
import { parseTmallTargetStorage, TMALL_TARGET_STORAGE_KEY } from "../../storage/tmall-target-storage";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import type { StoreBoardLoadResult, StoreBoardRuntimeContext } from "./contracts";
import { isLegacyDefaultStoreRequest } from "./build-view-model";

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

const getStoreBoardDatabaseName = (): string =>
  process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

const readLegacyContext = () => {
  const legacyAnalysis = parseTmallStoredAnalysisResult(
    window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY),
  );
  const legacyTargets = parseTmallTargetStorage(
    window.localStorage.getItem(TMALL_TARGET_STORAGE_KEY),
  );
  return {
    legacyAnalysis,
    legacyTargets: legacyTargets.status === "valid" ? legacyTargets.targets : [],
  };
};

const legacyFallbackContext = ({
  mode,
  v2IssueCodes,
  message,
  platformCode,
  storeId,
}: Pick<StoreBoardRuntimeContext, "mode" | "v2IssueCodes" | "message"> & {
  platformCode: string | null;
  storeId: string | null;
}): StoreBoardRuntimeContext | null => {
  if (!isLegacyDefaultStoreRequest({ platformCode, storeId })) return null;
  const legacy = readLegacyContext();
  if (legacy.legacyAnalysis.status !== "valid" || !legacy.legacyAnalysis.result) return null;
  return {
    mode,
    dataset: null,
    legacyAnalysis: legacy.legacyAnalysis.result,
    legacyTargets: legacy.legacyTargets,
    v2IssueCodes,
    message,
  };
};

export const loadStoreBoardContext = async ({
  platformCode,
  storeId,
  databaseName = getStoreBoardDatabaseName(),
}: {
  platformCode: string | null;
  storeId: string | null;
  databaseName?: string;
}): Promise<StoreBoardLoadResult> => {
  let store: IndexedDbV2PersistenceStore | null = null;
  try {
    store = await IndexedDbV2PersistenceStore.open({ databaseName });
    const inspection = await store.inspectState();

    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      const fallback = legacyFallbackContext({
        mode: "v2_corrupted_with_legacy_fallback",
        v2IssueCodes: inspection.issueCodes,
        message: "本地多店铺数据状态不可安全读取，当前显示旧版默认店铺数据。",
        platformCode,
        storeId,
      });
      if (fallback) return { status: "valid", context: fallback, message: fallback.message };
      return {
        status: "corrupted",
        context: {
          mode: "corrupted",
          dataset: null,
          legacyAnalysis: null,
          legacyTargets: [],
          v2IssueCodes: inspection.issueCodes,
          message: "本地店铺数据不可安全读取，请前往数据导入重新处理。",
        },
        message: "本地店铺数据不可安全读取。",
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
          legacyTargets: [],
          v2IssueCodes: inspection.issueCodes,
          message: "已读取多店铺店铺数据。",
        },
        message: "已读取多店铺店铺数据。",
      };
    }

    const fallback = legacyFallbackContext({
      mode: "legacy_fallback",
      v2IssueCodes: inspection.issueCodes,
      message: "当前显示旧版默认店铺数据，完成新数据导入后可查看多店铺看板。",
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
        legacyTargets: [],
        v2IssueCodes: inspection.issueCodes,
        message: "当前没有可用店铺数据。",
      },
      message: "当前没有可用店铺数据。",
    };
  } catch {
    const fallback = legacyFallbackContext({
      mode: "v2_corrupted_with_legacy_fallback",
      v2IssueCodes: ["store_board_read_error"],
      message: "多店铺店铺数据读取失败，当前显示旧版默认店铺数据。",
      platformCode,
      storeId,
    });
    if (fallback) return { status: "valid", context: fallback, message: fallback.message };

    return {
      status: "error",
      context: {
        mode: "error",
        dataset: null,
        legacyAnalysis: null,
        legacyTargets: [],
        v2IssueCodes: ["store_board_read_error"],
        message: "读取店铺数据失败，请刷新后重试。",
      },
      message: "读取店铺数据失败，请刷新后重试。",
    };
  } finally {
    store?.close();
  }
};
