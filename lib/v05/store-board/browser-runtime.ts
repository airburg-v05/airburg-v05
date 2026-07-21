"use client";

import { loadActiveBrandRuntimeV2Dataset } from "@/lib/v2/runtime/runtime-v2-dataset";
import type { StoreBoardLoadResult } from "./contracts";

export const loadStoreBoardContext = async (_request: {
  platformCode: string | null;
  storeId: string | null;
  databaseName?: string;
}): Promise<StoreBoardLoadResult> => {
  void _request;
  try {
    const runtime = await loadActiveBrandRuntimeV2Dataset();
    if (runtime.status === "ready") {
      return {
        status: "valid",
        context: {
          mode: "v2_valid",
          dataset: runtime.dataset,
          legacyAnalysis: null,
          legacyTargets: [],
          v2IssueCodes: runtime.issueCodes,
          message: "已读取当前品牌统一经营数据。",
        },
        message: "已读取当前品牌统一经营数据。",
      };
    }
    const corrupted = runtime.status !== "empty";
    const message = corrupted ? "当前品牌经营数据不可安全读取。" : "当前品牌尚未上传经营数据。";
    return {
      status: corrupted ? "corrupted" : "empty",
      context: {
        mode: corrupted ? "corrupted" : "empty",
        dataset: null,
        legacyAnalysis: null,
        legacyTargets: [],
        v2IssueCodes: runtime.issueCodes,
        message,
      },
      message,
    };
  } catch {
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
  }
};
