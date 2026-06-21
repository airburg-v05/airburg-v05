export const V2_INDEXEDDB_DATABASE_NAME = "airburg-v05" as const;
export const V2_INDEXEDDB_AUDIT_DATABASE_NAME = "airburg-v05-a4r1-audit" as const;
export const V2_INDEXEDDB_VERSION = 1;
export const V2_RECORD_ENVELOPE_VERSION = "v2_record_envelope_v1" as const;
export const V2_ACTIVE_POINTER_KEY = "activeDatasetPointer" as const;

export const V2_RECORD_STORE_NAMES = [
  "platforms",
  "stores",
  "importBatches",
  "importFiles",
  "businessProductFacts",
  "adProductFacts",
  "adPlanFacts",
  "afterSalesDailyAggregates",
  "afterSalesRangeAggregates",
  "afterSalesOperationalSnapshots",
  "afterSalesDistributionItems",
  "series",
  "trackedProducts",
  "targets",
  "legacyTargetCandidates",
  "migrationManifests",
] as const;

export const V2_META_STORE_NAMES = [
  "metadata",
  "datasetMetadata",
  "activationJournal",
] as const;

export const V2_OBJECT_STORE_NAMES = [
  ...V2_META_STORE_NAMES,
  ...V2_RECORD_STORE_NAMES,
] as const;

export type V2RecordStoreName = (typeof V2_RECORD_STORE_NAMES)[number];
export type V2ObjectStoreName = (typeof V2_OBJECT_STORE_NAMES)[number];

export const V2_ENVELOPE_INDEXES = [
  "datasetId",
  "recordKey",
  "platformCode",
  "storeId",
  "businessDate",
] as const;

export const V2_DATASET_METADATA_INDEXES = [
  "status",
  "manifestId",
] as const;

export const V2_ACTIVATION_JOURNAL_INDEXES = [
  "datasetId",
  "action",
  "createdAt",
] as const;

export const V2_METADATA_INDEXES = [
  "value.datasetId",
  "value.state",
] as const;
