"use client";

import { parseTmallTargetStorage, TMALL_TARGET_STORAGE_KEY } from "../../storage/tmall-target-storage";
import {
  parseTmallStoredAnalysisResult,
} from "../../storage/tmall-analysis-validator";
import { TMALL_ANALYSIS_STORAGE_KEY } from "../../storage/tmall-analysis-storage";
import { IndexedDbV2PersistenceStore } from "../persistence/indexeddb-adapter";
import type { HomeCommandCenterLoadResult, HomeCommandCenterRuntimeContext } from "./contracts";

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

const getHomeCommandCenterDatabaseName = (): string => {
  return process.env?.NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME?.trim() || "airburg-v05";
};

const legacyFallbackContext = ({
  mode,
  v2IssueCodes,
  message,
}: Pick<HomeCommandCenterRuntimeContext, "mode" | "v2IssueCodes" | "message">): HomeCommandCenterRuntimeContext | null => {
  const legacy = readLegacyContext();
  if (legacy.legacyAnalysis.status !== "valid" || !legacy.legacyAnalysis.result) return null;
  return {
    mode,
    dataset: null,
    legacyAnalysis: legacy.legacyAnalysis.result,
    legacyTargets: legacy.legacyTargets,
    legacyStatus: legacy.legacyAnalysis.status,
    v2IssueCodes,
    message,
  };
};

export const loadHomeCommandCenterContext = async (
  databaseName = getHomeCommandCenterDatabaseName(),
): Promise<HomeCommandCenterLoadResult> => {
  let store: IndexedDbV2PersistenceStore | null = null;
  try {
    store = await IndexedDbV2PersistenceStore.open({ databaseName });
    const inspection = await store.inspectState();

    if (CORRUPTED_INSPECTION_STATUSES.has(inspection.status)) {
      const fallback = legacyFallbackContext({
        mode: "v2_corrupted_with_legacy_fallback",
        v2IssueCodes: inspection.issueCodes,
        message: "本地多店铺数据状态不可安全读取，当前显示旧版单店数据。",
      });
      if (fallback) {
        return { status: "valid", context: fallback, message: fallback.message };
      }
      return {
        status: "corrupted",
        context: {
          mode: "corrupted",
          dataset: null,
          legacyAnalysis: null,
          legacyTargets: [],
          legacyStatus: "corrupted",
          v2IssueCodes: inspection.issueCodes,
          message: "本地经营数据不可安全读取，请前往数据导入重新处理。",
        },
        message: "本地经营数据不可安全读取。",
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
          legacyStatus: "empty",
          v2IssueCodes: inspection.issueCodes,
          message: "已读取多店铺经营数据。",
        },
        message: "已读取多店铺经营数据。",
      };
    }

    const fallback = legacyFallbackContext({
      mode: "legacy_fallback",
      v2IssueCodes: inspection.issueCodes,
      message: "当前显示旧版单店数据，完成新数据导入后可查看多店铺汇总。",
    });
    if (fallback) return { status: "valid", context: fallback, message: fallback.message };

    return {
      status: "empty",
      context: {
        mode: "empty",
        dataset: null,
        legacyAnalysis: null,
        legacyTargets: [],
        legacyStatus: "empty",
        v2IssueCodes: inspection.issueCodes,
        message: "当前没有可用经营数据。",
      },
      message: "当前没有可用经营数据。",
    };
  } catch {
    const fallback = legacyFallbackContext({
      mode: "v2_corrupted_with_legacy_fallback",
      v2IssueCodes: ["home_command_center_read_error"],
      message: "多店铺数据读取失败，当前显示旧版单店数据。",
    });
    if (fallback) return { status: "valid", context: fallback, message: fallback.message };

    return {
      status: "error",
      context: {
        mode: "error",
        dataset: null,
        legacyAnalysis: null,
        legacyTargets: [],
        legacyStatus: "corrupted",
        v2IssueCodes: ["home_command_center_read_error"],
        message: "读取经营数据失败，请刷新后重试。",
      },
      message: "读取经营数据失败，请刷新后重试。",
    };
  } finally {
    store?.close();
  }
};
