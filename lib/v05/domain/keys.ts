import type {
  OwnedAdPlanFact,
  OwnedAdProductFact,
  OwnedAfterSalesDailyAggregate,
  OwnedAfterSalesRangeAggregate,
  OwnedBusinessProductFact,
  PlatformCode,
  SeriesRecord,
  StoreScope,
  TargetRecord,
  TrackedProductRecord,
} from "./models";

const encodePart = (value: string | number | null | undefined): string => {
  const normalized = value === null || value === undefined ? "" : String(value);
  return `${normalized.length}:${normalized}`;
};

const composeKey = (prefix: string, parts: Array<string | number | null | undefined>): string =>
  `${prefix}|${parts.map(encodePart).join("|")}`;

export const buildStoreKey = (scope: StoreScope): string =>
  composeKey("store", [scope.platformCode, scope.storeId]);

export const buildImportBatchKey = (params: {
  platformCode: PlatformCode;
  storeId: string;
  importBatchId: string;
}): string => composeKey("import_batch", [params.platformCode, params.storeId, params.importBatchId]);

export const buildImportFileKey = (params: {
  platformCode: PlatformCode;
  storeId: string;
  importBatchId: string;
  importFileId: string;
}): string =>
  composeKey("import_file", [
    params.platformCode,
    params.storeId,
    params.importBatchId,
    params.importFileId,
  ]);

export const buildBusinessProductFactKey = (fact: Pick<
  OwnedBusinessProductFact,
  "platformCode" | "storeId" | "businessDate" | "sourceType" | "importBatchId" | "productId"
>): string =>
  composeKey("business_product_fact", [
    fact.platformCode,
    fact.storeId,
    fact.businessDate,
    fact.sourceType,
    fact.importBatchId,
    fact.productId,
  ]);

export const buildAdProductFactKey = (fact: Pick<
  OwnedAdProductFact,
  "platformCode" | "storeId" | "businessDate" | "sourceType" | "importBatchId" | "productId"
>): string =>
  composeKey("ad_product_fact", [
    fact.platformCode,
    fact.storeId,
    fact.businessDate,
    fact.sourceType,
    fact.importBatchId,
    fact.productId,
  ]);

export const buildAdPlanFactKey = (fact: Pick<
  OwnedAdPlanFact,
  "platformCode" | "storeId" | "businessDate" | "sourceType" | "importBatchId" | "planId"
>): string =>
  composeKey("ad_plan_fact", [
    fact.platformCode,
    fact.storeId,
    fact.businessDate,
    fact.sourceType,
    fact.importBatchId,
    fact.planId,
  ]);

export const buildAfterSalesDailyAggregateKey = (aggregate: Pick<
  OwnedAfterSalesDailyAggregate,
  | "platformCode"
  | "storeId"
  | "businessDate"
  | "sourceType"
  | "importBatchId"
  | "dateBasis"
  | "productId"
>): string =>
  composeKey("after_sales_daily", [
    aggregate.platformCode,
    aggregate.storeId,
    aggregate.businessDate,
    aggregate.sourceType,
    aggregate.importBatchId,
    aggregate.dateBasis,
    aggregate.productId ?? "store",
  ]);

export const buildAfterSalesRangeAggregateKey = (aggregate: Pick<
  OwnedAfterSalesRangeAggregate,
  "platformCode" | "storeId" | "sourceType" | "importBatchId" | "dateBasis" | "productId" | "dateRange"
>): string =>
  composeKey("after_sales_range", [
    aggregate.platformCode,
    aggregate.storeId,
    aggregate.sourceType,
    aggregate.importBatchId,
    aggregate.dateRange.start,
    aggregate.dateRange.end,
    aggregate.dateBasis,
    aggregate.productId ?? "store",
  ]);

export const buildSeriesKey = (series: Pick<SeriesRecord, "platformCode" | "storeId" | "seriesId">): string =>
  composeKey("series", [series.platformCode, series.storeId, series.seriesId]);

export const buildTrackedProductKey = (
  product: Pick<TrackedProductRecord, "platformCode" | "storeId" | "trackedProductId">,
): string => composeKey("tracked_product", [product.platformCode, product.storeId, product.trackedProductId]);

export const buildTargetRecordKey = (target: Pick<TargetRecord, "targetId">): string =>
  composeKey("target_record", [target.targetId]);

export const buildTargetSemanticKey = (target: Pick<
  TargetRecord,
  | "scope"
  | "platformCode"
  | "storeId"
  | "seriesId"
  | "productId"
  | "metricKey"
  | "periodType"
  | "periodValue"
>): string =>
  composeKey("target_semantic", [
    target.scope,
    target.platformCode ?? "company",
    target.storeId ?? "company",
    target.seriesId ?? "",
    target.productId ?? "",
    target.metricKey,
    target.periodType,
    target.periodValue,
  ]);
