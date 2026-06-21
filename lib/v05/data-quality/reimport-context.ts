import type { PlatformCode } from "../domain/models";
import type { ReimportContext } from "./contracts";

const SUPPORTED_REIMPORT_PLATFORMS = new Set<PlatformCode>(["tmall"]);

const safeToken = (value: string | null): string | null => {
  const text = value?.trim() ?? "";
  if (!text) return null;
  return /^[a-zA-Z0-9:_-]{2,120}$/.test(text) ? text : null;
};

export const parseReimportContext = (params: URLSearchParams): ReimportContext | null => {
  if (params.get("mode") !== "reimport") return null;
  const platformCode = safeToken(params.get("platform")) as PlatformCode | null;
  const storeId = safeToken(params.get("storeId"));
  const sourceBatchId = safeToken(params.get("sourceBatchId"));
  if (!platformCode || !SUPPORTED_REIMPORT_PLATFORMS.has(platformCode) || !storeId || !sourceBatchId) {
    return null;
  }
  return {
    mode: "reimport",
    platformCode,
    storeId,
    sourceBatchId,
  };
};
