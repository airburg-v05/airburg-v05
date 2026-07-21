"use client";

import { getTargetMetricDefinitionByKey } from "@/lib/bi/target-metric-definitions";
import { loadActiveRuntimeDatasetSnapshot } from "@/lib/persistence/runtime-dataset-persistence";
import { loadTargetDrafts } from "@/lib/persistence/target-drafts-persistence";
import type { TargetDraftRecord } from "@/lib/persistence/target-drafts-persistence.types";
import {
  ALLOWED_PLATFORM_CODES,
  V2_SCHEMA_VERSION,
  type PlatformCode,
  type TargetRecord,
  type V2Dataset,
  type V2SourceType,
} from "@/lib/v05/domain/models";
import {
  activeBrandWorkspace,
  loadBrandWorkspaceState,
  runtimeDatabaseNameForBrand,
  targetDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import { loadBrandSeries } from "@/lib/v2/workspace/brand-series";
import type { RuntimeDatasetSnapshot } from "@/lib/persistence/runtime-dataset-persistence.types";

export type RuntimeV2DatasetLoadResult =
  | { status: "ready"; dataset: V2Dataset; issueCodes: string[]; brandId: string }
  | { status: "empty"; dataset: null; issueCodes: []; brandId: string }
  | { status: "corrupted" | "unavailable"; dataset: null; issueCodes: string[]; brandId: string };

const PLATFORM_LABELS: Record<string, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

const asPlatformCode = (value: string): PlatformCode | null =>
  ALLOWED_PLATFORM_CODES.includes(value as PlatformCode) ? value as PlatformCode : null;

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;

const adSalesFor = (row: RuntimeDatasetSnapshot["dataset"]["planMetrics"][number]): number | null => {
  const explicit = finiteOrNull(row.totalTransactionAmount);
  if (explicit !== null) return explicit;
  const spend = finiteOrNull(row.spend);
  const roi = finiteOrNull(row.roi);
  return spend !== null && roi !== null ? spend * roi : null;
};

const collectScopes = (snapshot: RuntimeDatasetSnapshot) => {
  const scopes = new Map<string, {
    platformCode: PlatformCode;
    platformName: string;
    storeId: string;
    storeName: string;
  }>();
  const add = (platformValue: string, platformName: string | null, storeId: string, storeName: string | null) => {
    const platformCode = asPlatformCode(platformValue);
    if (!platformCode || !storeId) return;
    const key = `${platformCode}::${storeId}`;
    if (!scopes.has(key)) {
      scopes.set(key, {
        platformCode,
        platformName: platformName?.trim() || PLATFORM_LABELS[platformCode] || platformCode,
        storeId,
        storeName: storeName?.trim() || storeId,
      });
    }
  };
  const dataset = snapshot.dataset;
  dataset.products.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  dataset.productMetrics.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  dataset.planMetrics.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  dataset.searchTotalKeywords.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  dataset.searchProductKeywords.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  dataset.afterSalesMetrics.forEach((row) => add(row.platformCode, row.platformName, row.storeId, row.storeName));
  return Array.from(scopes.values());
};

const targetDirection = (metricKey: string): TargetRecord["direction"] => {
  const direction = getTargetMetricDefinitionByKey(metricKey)?.direction;
  return direction === "lower_is_better" || direction === "budget"
    ? "lower_is_better"
    : "higher_is_better";
};

const mapTargetDrafts = (drafts: TargetDraftRecord[]): TargetRecord[] =>
  drafts.flatMap((draft) => {
    if (draft.scope === "brand") return [];
    const platformCode = asPlatformCode(draft.platformCode);
    if (!platformCode) return [];
    const scope = draft.scope === "platform" ? "store" : draft.scope;
    return [{
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: draft.targetId,
      scope,
      platformCode,
      storeId: draft.storeId,
      seriesId: draft.seriesId ?? undefined,
      productId: draft.productId ?? undefined,
      periodType: "monthly",
      periodValue: draft.month,
      metricKey: draft.metricKey,
      targetValue: draft.targetValue,
      direction: targetDirection(draft.metricKey),
      status: draft.status,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    }];
  });

const sourceTypesFor = (snapshot: RuntimeDatasetSnapshot): V2SourceType[] => {
  const sources: V2SourceType[] = [];
  if (snapshot.dataset.productMetrics.length > 0 || snapshot.dataset.products.length > 0) sources.push("business_product");
  if (snapshot.dataset.planMetrics.some((row) => Boolean(row.productId))) sources.push("ad_product");
  if (snapshot.dataset.planMetrics.some((row) => !row.productId)) sources.push("ad_plan");
  if (snapshot.dataset.afterSalesMetrics.length > 0) sources.push("after_sales");
  return sources;
};

const runtimeSnapshotToV2Dataset = (
  snapshot: RuntimeDatasetSnapshot,
  brandId: string,
  targetDrafts: TargetDraftRecord[],
): V2Dataset => {
  const scopes = collectScopes(snapshot);
  const now = snapshot.updatedAt;
  const importBatchId = snapshot.activeDatasetId;
  const sourceTypes = sourceTypesFor(snapshot);
  const safeWarningCodes = Array.from(new Set(snapshot.safeIssues.map((issue) => issue.code)));
  const productNames = new Map(
    snapshot.dataset.products.map((row) => [`${row.platformCode}::${row.storeId}::${row.productId}`, row.name]),
  );
  const businessProductFacts = snapshot.dataset.productMetrics.flatMap((row) => {
    const platformCode = asPlatformCode(row.platformCode);
    if (!platformCode || !row.storeId || !row.productId || !row.date) return [];
    const gmv = finiteOrNull(row.gmv);
    const visitors = finiteOrNull(row.visitors);
    const paidBuyers = finiteOrNull(row.buyers);
    return [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode,
      storeId: row.storeId,
      businessDate: row.date,
      sourceType: "business_product" as const,
      importBatchId,
      productId: row.productId,
      productName: productNames.get(`${row.platformCode}::${row.storeId}::${row.productId}`) ?? null,
      gmv,
      gsv: finiteOrNull(row.gsv),
      visitors,
      paidBuyers,
      paidOrders: null,
      conversionRate: ratio(paidBuyers, visitors),
      avgOrderValue: ratio(gmv, paidBuyers),
      favorites: null,
      cartAdditions: null,
    }];
  });
  const adProductFacts = snapshot.dataset.planMetrics.flatMap((row) => {
    const platformCode = asPlatformCode(row.platformCode);
    if (!platformCode || !row.storeId || !row.productId || !row.date) return [];
    const spend = finiteOrNull(row.spend);
    const sales = adSalesFor(row);
    return [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode,
      storeId: row.storeId,
      businessDate: row.date,
      sourceType: "ad_product" as const,
      importBatchId,
      productId: row.productId,
      adSpend: spend,
      adSalesAmount: sales,
      impressions: null,
      clicks: finiteOrNull(row.clicks),
      clickRate: null,
      adRoi: finiteOrNull(row.roi) ?? ratio(sales, spend),
    }];
  });
  const adPlanFacts = snapshot.dataset.planMetrics.flatMap((row, index) => {
    const platformCode = asPlatformCode(row.platformCode);
    if (!platformCode || !row.storeId || row.productId || !row.date) return [];
    const spend = finiteOrNull(row.spend);
    const sales = adSalesFor(row);
    return [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode,
      storeId: row.storeId,
      businessDate: row.date,
      sourceType: "ad_plan" as const,
      importBatchId,
      planId: row.planId?.trim() || `runtime_plan_${index + 1}`,
      planName: row.planName?.trim() || null,
      adSpend: spend,
      adSalesAmount: sales,
      impressions: null,
      clicks: finiteOrNull(row.clicks),
      adRoi: finiteOrNull(row.roi) ?? ratio(sales, spend),
    }];
  });
  const afterSalesDailyAggregates = snapshot.dataset.afterSalesMetrics.flatMap((row) => {
    const platformCode = asPlatformCode(row.platformCode);
    if (!platformCode || !row.storeId || !row.date) return [];
    return [{
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode,
      storeId: row.storeId,
      businessDate: row.date,
      sourceType: "after_sales" as const,
      importBatchId,
      dateBasis: "success_date" as const,
      productId: row.productId,
      refundAmount: finiteOrNull(row.refundAmount),
      refundOrderCount: finiteOrNull(row.refundCount),
      afterSalesApplyCount: null,
    }];
  });
  const afterSalesRangeAggregates = afterSalesDailyAggregates.map((row) => ({
    schemaVersion: V2_SCHEMA_VERSION,
    platformCode: row.platformCode,
    storeId: row.storeId,
    sourceType: "after_sales" as const,
    importBatchId,
    dateRange: { start: row.businessDate, end: row.businessDate },
    dateBasis: row.dateBasis,
    productId: row.productId,
    refundAmount: row.refundAmount,
    refundOrderCount: row.refundOrderCount,
    afterSalesApplyCount: row.afterSalesApplyCount,
  }));
  const series = loadBrandSeries(brandId).flatMap((record) => {
    const grouped = new Map<string, typeof record.productRefs>();
    record.productRefs.forEach((ref) => {
      const platformCode = asPlatformCode(ref.platformCode);
      if (!platformCode) return;
      const key = `${platformCode}::${ref.storeId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), ref]);
    });
    return Array.from(grouped.entries()).flatMap(([key, refs]) => {
      const [platformValue, storeId] = key.split("::");
      const platformCode = asPlatformCode(platformValue);
      if (!platformCode || !storeId) return [];
      return [{
        schemaVersion: V2_SCHEMA_VERSION,
        seriesId: record.seriesId,
        platformCode,
        storeId,
        name: record.name,
        productIds: Array.from(new Set(refs.map((ref) => ref.productId))),
        status: "active" as const,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }];
    });
  });
  const trackedProductMap = new Map<string, { platformCode: PlatformCode; storeId: string; productId: string; displayName: string | null }>();
  const track = (platformValue: string, storeId: string, productId: string, displayName: string | null) => {
    const platformCode = asPlatformCode(platformValue);
    if (!platformCode || !storeId || !productId) return;
    const key = `${platformCode}::${storeId}::${productId}`;
    const current = trackedProductMap.get(key);
    trackedProductMap.set(key, { platformCode, storeId, productId, displayName: current?.displayName ?? displayName });
  };
  snapshot.dataset.products.forEach((row) => track(row.platformCode, row.storeId, row.productId, row.name));
  snapshot.dataset.productMetrics.forEach((row) => track(
    row.platformCode,
    row.storeId,
    row.productId,
    productNames.get(`${row.platformCode}::${row.storeId}::${row.productId}`) ?? null,
  ));
  snapshot.dataset.planMetrics.forEach((row) => {
    if (row.productId) track(
      row.platformCode,
      row.storeId,
      row.productId,
      productNames.get(`${row.platformCode}::${row.storeId}::${row.productId}`) ?? null,
    );
  });
  const importFiles = sourceTypes.map((sourceType) => {
    const rowCount = sourceType === "business_product"
      ? snapshot.dataset.productMetrics.length
      : sourceType === "ad_product"
        ? adProductFacts.length
        : sourceType === "ad_plan"
          ? adPlanFacts.length
          : snapshot.dataset.afterSalesMetrics.length;
    const scope = scopes[0];
    return {
      schemaVersion: V2_SCHEMA_VERSION,
      importFileId: `${importBatchId}:${sourceType}`,
      importBatchId,
      platformCode: scope?.platformCode ?? "tmall" as PlatformCode,
      storeId: scope?.storeId ?? "unknown",
      sourceType,
      detectedSourceType: sourceType,
      fileFingerprint: `${importBatchId}:${sourceType}:safe`,
      rowCount,
      headerRowNumber: null,
      dateRange: snapshot.dateRange.startDate && snapshot.dateRange.endDate
        ? { start: snapshot.dateRange.startDate, end: snapshot.dateRange.endDate }
        : null,
      status: "parsed" as const,
      safeWarningCodes,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    };
  });

  return {
    schemaVersion: V2_SCHEMA_VERSION,
    datasetId: snapshot.activeDatasetId,
    platforms: Array.from(new Map(scopes.map((scope) => [scope.platformCode, scope])).values()).map((scope) => ({
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: scope.platformCode,
      platformName: scope.platformName,
      status: "active",
      createdAt: snapshot.createdAt,
      updatedAt: now,
    })),
    stores: scopes.map((scope) => ({
      schemaVersion: V2_SCHEMA_VERSION,
      platformCode: scope.platformCode,
      storeId: scope.storeId,
      storeName: scope.storeName,
      status: "active",
      createdAt: snapshot.createdAt,
      updatedAt: now,
    })),
    importBatches: scopes[0] ? [{
      schemaVersion: V2_SCHEMA_VERSION,
      importBatchId,
      platformCode: scopes[0].platformCode,
      storeId: scopes[0].storeId,
      importStartedAt: snapshot.createdAt,
      importCompletedAt: snapshot.updatedAt,
      status: snapshot.importSummary.filesFailed > 0 ? "partial_success" : "success",
      sourceTypes,
      createdAt: snapshot.createdAt,
      updatedAt: now,
    }] : [],
    importFiles,
    businessProductFacts,
    adProductFacts,
    adPlanFacts,
    afterSalesDailyAggregates,
    afterSalesRangeAggregates,
    afterSalesOperationalSnapshots: [],
    afterSalesDistributionItems: [],
    series,
    trackedProducts: Array.from(trackedProductMap.values()).map((row) => ({
      schemaVersion: V2_SCHEMA_VERSION,
      trackedProductId: `runtime:${row.platformCode}:${row.storeId}:${row.productId}`,
      platformCode: row.platformCode,
      storeId: row.storeId,
      productId: row.productId,
      displayName: row.displayName,
      status: "active",
      createdAt: snapshot.createdAt,
      updatedAt: now,
    })),
    targets: mapTargetDrafts(targetDrafts),
    legacyTargetCandidates: [],
    migrationManifests: [],
    activeDatasetPointer: {
      schemaVersion: V2_SCHEMA_VERSION,
      pointerId: `runtime:${brandId}`,
      state: "v2_active",
      datasetId: snapshot.activeDatasetId,
      migrationManifestId: null,
      activatedAt: snapshot.updatedAt,
    },
  };
};

export const loadActiveBrandRuntimeV2Dataset = async (
  brandId?: string,
): Promise<RuntimeV2DatasetLoadResult> => {
  const state = loadBrandWorkspaceState();
  const brand = brandId
    ? state.brands.find((item) => item.id === brandId) ?? activeBrandWorkspace(state)
    : activeBrandWorkspace(state);
  const snapshotResult = await loadActiveRuntimeDatasetSnapshot({
    brandId: brand.id,
    databaseName: runtimeDatabaseNameForBrand(brand.id),
  });
  if (snapshotResult.status === "empty") {
    return { status: "empty", dataset: null, issueCodes: [], brandId: brand.id };
  }
  if (snapshotResult.status !== "ok") {
    return {
      status: snapshotResult.status === "corrupted" ? "corrupted" : "unavailable",
      dataset: null,
      issueCodes: [`runtime_snapshot_${snapshotResult.status}`],
      brandId: brand.id,
    };
  }
  const targets = await loadTargetDrafts({}, { databaseName: targetDatabaseNameForBrand(brand.id) });
  const targetRecords = targets.status === "ok" ? targets.records : [];
  return {
    status: "ready",
    dataset: runtimeSnapshotToV2Dataset(snapshotResult.snapshot, brand.id, targetRecords),
    issueCodes: Array.from(new Set(snapshotResult.snapshot.safeIssues.map((issue) => issue.code))),
    brandId: brand.id,
  };
};
