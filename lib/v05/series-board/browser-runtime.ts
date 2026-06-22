"use client";

import {
  parseTmallStoredAnalysisResult,
} from "../../storage/tmall-analysis-validator";
import { TMALL_ANALYSIS_STORAGE_KEY } from "../../storage/tmall-analysis-storage";
import { parseTmallTargetStorage, TMALL_TARGET_STORAGE_KEY } from "../../storage/tmall-target-storage";
import {
  parseTmallSeriesGroupStorage,
  TMALL_SERIES_STORAGE_KEY,
} from "../../storage/tmall-series-storage";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import type { SeriesBoardLoadResult, SeriesBoardRuntimeContext } from "./contracts";
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

const getSeriesBoardDatabaseName = (): string =>
  process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";

export const isLegacyDefaultSeriesRequest = ({
  platformCode,
  storeId,
}: {
  platformCode: string | null;
  storeId: string | null;
}): boolean =>
  (!platformCode || platformCode === "tmall") &&
  (!storeId || storeId === DEFAULT_TMALL_STORE_ID);

const readLegacyContext = () => {
  const legacyAnalysis = parseTmallStoredAnalysisResult(
    window.localStorage.getItem(TMALL_ANALYSIS_STORAGE_KEY),
  );
  const legacyTargets = parseTmallTargetStorage(
    window.localStorage.getItem(TMALL_TARGET_STORAGE_KEY),
  );
  const legacySeries = parseTmallSeriesGroupStorage(
    window.localStorage.getItem(TMALL_SERIES_STORAGE_KEY),
  );
  return {
    legacyAnalysis,
    legacyTargets: legacyTargets.status === "valid" ? legacyTargets.targets : [],
    legacySeriesGroups: legacySeries.status === "valid" ? legacySeries.groups : [],
  };
};

const legacyFallbackContext = ({
  mode,
  v2IssueCodes,
  message,
  platformCode,
  storeId,
}: Pick<SeriesBoardRuntimeContext, "mode" | "v2IssueCodes" | "message"> & {
  platformCode: string | null;
  storeId: string | null;
}): SeriesBoardRuntimeContext | null => {
  if (!isLegacyDefaultSeriesRequest({ platformCode, storeId })) return null;
  const legacy = readLegacyContext();
  if (legacy.legacyAnalysis.status !== "valid" || !legacy.legacyAnalysis.result) return null;
  return {
    mode,
    dataset: null,
    legacyAnalysis: legacy.legacyAnalysis.result,
    legacySeriesGroups: legacy.legacySeriesGroups,
    legacyTargets: legacy.legacyTargets,
    v2IssueCodes,
    message,
  };
};

export const loadSeriesBoardContext = async ({
  platformCode,
  storeId,
  databaseName = getSeriesBoardDatabaseName(),
}: {
  platformCode: string | null;
  storeId: string | null;
  databaseName?: string;
}): Promise<SeriesBoardLoadResult> => {
  let store: IndexedDbV2PersistenceStore | null = null;
  try {
    store = await IndexedDbV2PersistenceStore.open({ databaseName });
    const inspection = await store.inspectState();

    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      const fallback = legacyFallbackContext({
        mode: "v2_corrupted_with_legacy_fallback",
        v2IssueCodes: inspection.issueCodes,
        message: "本地多店铺数据状态不可安全读取，当前显示旧版默认店铺系列数据。",
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
          legacySeriesGroups: [],
          legacyTargets: [],
          v2IssueCodes: inspection.issueCodes,
          message: "本地系列数据不可安全读取，请前往数据导入重新处理。",
        },
        message: "本地系列数据不可安全读取。",
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
          legacySeriesGroups: [],
          legacyTargets: [],
          v2IssueCodes: inspection.issueCodes,
          message: "已读取多店铺系列数据。",
        },
        message: "已读取多店铺系列数据。",
      };
    }

    const fallback = legacyFallbackContext({
      mode: "legacy_fallback",
      v2IssueCodes: inspection.issueCodes,
      message: "当前显示旧版默认店铺系列数据，完成新数据导入后可查看多店铺系列看板。",
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
        legacySeriesGroups: [],
        legacyTargets: [],
        v2IssueCodes: inspection.issueCodes,
        message: "当前没有可用系列数据。",
      },
      message: "当前没有可用系列数据。",
    };
  } catch {
    const fallback = legacyFallbackContext({
      mode: "v2_corrupted_with_legacy_fallback",
      v2IssueCodes: ["series_board_read_error"],
      message: "多店铺系列数据读取失败，当前显示旧版默认店铺系列数据。",
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
        legacySeriesGroups: [],
        legacyTargets: [],
        v2IssueCodes: ["series_board_read_error"],
        message: "读取系列数据失败，请刷新后重试。",
      },
      message: "读取系列数据失败，请刷新后重试。",
    };
  } finally {
    store?.close();
  }
};
