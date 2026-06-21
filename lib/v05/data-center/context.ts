import type { PlatformCode } from "../domain/models";

export type DataCenterPageKey = "upload" | "history" | "quality";

export interface DataCenterContextQuery {
  platformCode: PlatformCode | null;
  storeId: string | null;
  batchId: string | null;
}

interface SearchParamReader {
  get(name: string): string | null;
}

const SUPPORTED_PLATFORM_CODES: PlatformCode[] = ["tmall", "jd", "pdd", "douyin", "youzan"];

const SAFE_TOKEN_PATTERN = /^[a-zA-Z0-9:_-]{2,160}$/;

export const EMPTY_DATA_CENTER_CONTEXT: DataCenterContextQuery = {
  platformCode: null,
  storeId: null,
  batchId: null,
};

export const isSafeDataCenterToken = (value: string | null | undefined): value is string => {
  const text = value?.trim() ?? "";
  return SAFE_TOKEN_PATTERN.test(text);
};

const parsePlatformCode = (value: string | null): PlatformCode | null => {
  const text = value?.trim() ?? "";
  return SUPPORTED_PLATFORM_CODES.includes(text as PlatformCode) ? (text as PlatformCode) : null;
};

export const parseDataCenterSearchParams = (
  params: SearchParamReader | null | undefined,
): DataCenterContextQuery => {
  if (!params) return EMPTY_DATA_CENTER_CONTEXT;
  const platformCode = parsePlatformCode(params.get("platform"));
  const storeId = isSafeDataCenterToken(params.get("storeId")) ? params.get("storeId")!.trim() : null;
  const batchCandidate = params.get("batchId") ?? params.get("sourceBatchId");
  const batchId = isSafeDataCenterToken(batchCandidate) ? batchCandidate.trim() : null;
  return {
    platformCode,
    storeId,
    batchId,
  };
};

export const dataCenterStoreKey = (context: Pick<DataCenterContextQuery, "platformCode" | "storeId">): string =>
  context.platformCode && context.storeId ? `${context.platformCode}:${context.storeId}` : "all";

const appendContext = (params: URLSearchParams, context: Partial<DataCenterContextQuery>) => {
  if (context.platformCode) params.set("platform", context.platformCode);
  if (isSafeDataCenterToken(context.storeId)) params.set("storeId", context.storeId);
  if (isSafeDataCenterToken(context.batchId)) params.set("batchId", context.batchId);
};

const DATA_CENTER_PATHS: Record<DataCenterPageKey, string> = {
  upload: "/upload",
  history: "/upload/history",
  quality: "/upload/quality",
};

export const dataCenterHref = (
  page: DataCenterPageKey,
  context: Partial<DataCenterContextQuery> | null | undefined = null,
): string => {
  const params = new URLSearchParams();
  if (context) appendContext(params, context);
  const query = params.toString();
  return query ? `${DATA_CENTER_PATHS[page]}?${query}` : DATA_CENTER_PATHS[page];
};

export const dataCenterReimportHref = (
  context: Pick<DataCenterContextQuery, "platformCode" | "storeId" | "batchId">,
): string => {
  const params = new URLSearchParams();
  params.set("mode", "reimport");
  if (context.platformCode) params.set("platform", context.platformCode);
  if (isSafeDataCenterToken(context.storeId)) params.set("storeId", context.storeId);
  if (isSafeDataCenterToken(context.batchId)) params.set("sourceBatchId", context.batchId);
  const query = params.toString();
  return query ? `/upload?${query}` : "/upload";
};

export const shortDataCenterId = (value: string | null | undefined): string => {
  if (!value) return "--";
  return value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;
};
