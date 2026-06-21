import {
  buildAdPlanFactKey,
  buildAdProductFactKey,
  buildAfterSalesDailyAggregateKey,
  buildAfterSalesDistributionItemKey,
  buildAfterSalesOperationalSnapshotKey,
  buildAfterSalesRangeAggregateKey,
  buildBusinessProductFactKey,
  buildImportBatchKey,
  buildImportFileKey,
  buildSeriesKey,
  buildStoreKey,
  buildTargetRecordKey,
  buildTrackedProductKey,
} from "../domain/keys";
import type {
  LegacyTargetCandidate,
  MigrationManifest,
  PlatformCode,
  PlatformRecord,
  V2Dataset,
} from "../domain/models";
import type { ValidationIssue } from "../domain/results";
import { validateV2Dataset } from "../validation/dataset";
import { validateLegacyTargetCandidate, validateMigrationManifest, validatePlatformRecord } from "../validation/records";
import type { PersistedRecordEnvelope } from "./contracts";
import { V2_RECORD_ENVELOPE_VERSION, type V2RecordStoreName } from "./schema";

type V2RecordMap = {
  platforms: PlatformRecord;
  stores: V2Dataset["stores"][number];
  importBatches: V2Dataset["importBatches"][number];
  importFiles: V2Dataset["importFiles"][number];
  businessProductFacts: V2Dataset["businessProductFacts"][number];
  adProductFacts: V2Dataset["adProductFacts"][number];
  adPlanFacts: V2Dataset["adPlanFacts"][number];
  afterSalesDailyAggregates: V2Dataset["afterSalesDailyAggregates"][number];
  afterSalesRangeAggregates: V2Dataset["afterSalesRangeAggregates"][number];
  afterSalesOperationalSnapshots: V2Dataset["afterSalesOperationalSnapshots"][number];
  afterSalesDistributionItems: V2Dataset["afterSalesDistributionItems"][number];
  series: V2Dataset["series"][number];
  trackedProducts: V2Dataset["trackedProducts"][number];
  targets: V2Dataset["targets"][number];
  legacyTargetCandidates: LegacyTargetCandidate;
  migrationManifests: MigrationManifest;
};

export type V2RecordForStore<TStoreName extends V2RecordStoreName> = V2RecordMap[TStoreName];

export const clonePersistenceValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export const stablePersistenceStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stablePersistenceStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stablePersistenceStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const buildEnvelopeId = (datasetId: string, recordKey: string): string =>
  `${encodeURIComponent(datasetId)}::${encodeURIComponent(recordKey)}`;

const ownerFromRecord = (record: unknown): {
  platformCode: PlatformCode | null;
  storeId: string | null;
  businessDate: string | null;
} => {
  if (!record || typeof record !== "object") {
    return { platformCode: null, storeId: null, businessDate: null };
  }
  const data = record as Record<string, unknown>;
  return {
    platformCode: typeof data.platformCode === "string" ? data.platformCode as PlatformCode : null,
    storeId: typeof data.storeId === "string" ? data.storeId : null,
    businessDate: typeof data.businessDate === "string" ? data.businessDate : null,
  };
};

export const recordKeyForStore = <TStoreName extends V2RecordStoreName>(
  storeName: TStoreName,
  record: V2RecordForStore<TStoreName>,
): string => {
  switch (storeName) {
    case "platforms":
      return (record as PlatformRecord).platformCode;
    case "stores":
      return buildStoreKey(record as V2Dataset["stores"][number]);
    case "importBatches":
      return buildImportBatchKey(record as V2Dataset["importBatches"][number]);
    case "importFiles":
      return buildImportFileKey(record as V2Dataset["importFiles"][number]);
    case "businessProductFacts":
      return buildBusinessProductFactKey(record as V2Dataset["businessProductFacts"][number]);
    case "adProductFacts":
      return buildAdProductFactKey(record as V2Dataset["adProductFacts"][number]);
    case "adPlanFacts":
      return buildAdPlanFactKey(record as V2Dataset["adPlanFacts"][number]);
    case "afterSalesDailyAggregates":
      return buildAfterSalesDailyAggregateKey(record as V2Dataset["afterSalesDailyAggregates"][number]);
    case "afterSalesRangeAggregates":
      return buildAfterSalesRangeAggregateKey(record as V2Dataset["afterSalesRangeAggregates"][number]);
    case "afterSalesOperationalSnapshots":
      return buildAfterSalesOperationalSnapshotKey(record as V2Dataset["afterSalesOperationalSnapshots"][number]);
    case "afterSalesDistributionItems":
      return buildAfterSalesDistributionItemKey(record as V2Dataset["afterSalesDistributionItems"][number]);
    case "series":
      return buildSeriesKey(record as V2Dataset["series"][number]);
    case "trackedProducts":
      return buildTrackedProductKey(record as V2Dataset["trackedProducts"][number]);
    case "targets":
      return buildTargetRecordKey(record as V2Dataset["targets"][number]);
    case "legacyTargetCandidates":
      return `legacy_target_candidate|${(record as LegacyTargetCandidate).legacyTargetId}`;
    case "migrationManifests":
      return `migration_manifest|${(record as MigrationManifest).migrationManifestId}`;
  }
};

export const envelopeForRecord = <TStoreName extends V2RecordStoreName>(
  datasetId: string,
  storeName: TStoreName,
  record: V2RecordForStore<TStoreName>,
): PersistedRecordEnvelope<V2RecordForStore<TStoreName>> => {
  const value = clonePersistenceValue(record);
  const recordKey = recordKeyForStore(storeName, value);
  const owner = ownerFromRecord(value);
  return {
    envelopeVersion: V2_RECORD_ENVELOPE_VERSION,
    id: buildEnvelopeId(datasetId, recordKey),
    datasetId,
    recordKey,
    platformCode: owner.platformCode,
    storeId: owner.storeId,
    businessDate: owner.businessDate,
    value,
  };
};

export const envelopesForDataset = <TStoreName extends V2RecordStoreName>(
  datasetId: string,
  storeName: TStoreName,
  records: V2RecordForStore<TStoreName>[],
): Array<PersistedRecordEnvelope<V2RecordForStore<TStoreName>>> =>
  records.map((record) => envelopeForRecord(datasetId, storeName, record));

export const validateDatasetBeforePersistence = (dataset: V2Dataset): ValidationIssue[] => {
  const issues = validateV2Dataset(dataset).issues;
  dataset.platforms.forEach((record) => issues.push(...validatePlatformRecord(record, "platforms").issues));
  dataset.legacyTargetCandidates.forEach((record) =>
    issues.push(...validateLegacyTargetCandidate(record, "legacyTargetCandidates").issues),
  );
  dataset.migrationManifests.forEach((record) =>
    issues.push(...validateMigrationManifest(record, "migrationManifests").issues),
  );
  return issues;
};

export const collectDatasetRecordKeys = (dataset: V2Dataset): string[] => [
  ...dataset.platforms.map((record) => recordKeyForStore("platforms", record)),
  ...dataset.stores.map((record) => recordKeyForStore("stores", record)),
  ...dataset.importBatches.map((record) => recordKeyForStore("importBatches", record)),
  ...dataset.importFiles.map((record) => recordKeyForStore("importFiles", record)),
  ...dataset.businessProductFacts.map((record) => recordKeyForStore("businessProductFacts", record)),
  ...dataset.adProductFacts.map((record) => recordKeyForStore("adProductFacts", record)),
  ...dataset.adPlanFacts.map((record) => recordKeyForStore("adPlanFacts", record)),
  ...dataset.afterSalesDailyAggregates.map((record) => recordKeyForStore("afterSalesDailyAggregates", record)),
  ...dataset.afterSalesRangeAggregates.map((record) => recordKeyForStore("afterSalesRangeAggregates", record)),
  ...dataset.afterSalesOperationalSnapshots.map((record) => recordKeyForStore("afterSalesOperationalSnapshots", record)),
  ...dataset.afterSalesDistributionItems.map((record) => recordKeyForStore("afterSalesDistributionItems", record)),
  ...dataset.series.map((record) => recordKeyForStore("series", record)),
  ...dataset.trackedProducts.map((record) => recordKeyForStore("trackedProducts", record)),
  ...dataset.targets.map((record) => recordKeyForStore("targets", record)),
  ...dataset.legacyTargetCandidates.map((record) => recordKeyForStore("legacyTargetCandidates", record)),
  ...dataset.migrationManifests.map((record) => recordKeyForStore("migrationManifests", record)),
].sort();
