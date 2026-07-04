import type { TargetMetricScope } from "../bi/target-metric-definitions";

export const TARGET_DRAFT_SCHEMA_VERSION = 1;

export type TargetDraftScope = TargetMetricScope;

export type TargetDraftStatus = "active" | "paused";

export interface TargetDraftRecord {
  schemaVersion: typeof TARGET_DRAFT_SCHEMA_VERSION;
  targetId: string;
  scope: TargetDraftScope;
  platformCode: string;
  storeId: string;
  seriesId?: string | null;
  productId?: string | null;
  month: string;
  metricKey: string;
  targetValue: number;
  unit: string;
  createdAt: string;
  updatedAt: string;
  status: TargetDraftStatus;
}

export interface TargetDraftQuery {
  platformCode?: string;
  storeId?: string;
  seriesId?: string | null;
  productId?: string | null;
  scope?: TargetDraftScope;
  month?: string;
  metricKey?: string;
}

export interface TargetDraftPersistenceOptions {
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
  now?: () => Date;
}

export type TargetDraftPersistenceUnavailableReason =
  | "indexeddb_unavailable"
  | "open_failed"
  | "read_failed"
  | "write_failed"
  | "delete_failed"
  | "clear_failed";

export type TargetDraftValidationError =
  | "record_not_object"
  | "target_id_required"
  | "scope_invalid"
  | "platform_code_required"
  | "store_id_required"
  | "series_id_required"
  | "product_id_required"
  | "month_invalid"
  | "metric_key_unknown"
  | "metric_scope_unsupported"
  | "target_value_invalid"
  | "unit_invalid"
  | "roi_unit_invalid"
  | "status_invalid";

export type TargetDraftCorruptedReason =
  | "schema_version_incompatible"
  | "stored_record_invalid";

export type TargetDraftValidationResult =
  | { status: "valid"; record: TargetDraftRecord }
  | { status: "invalid"; errors: TargetDraftValidationError[] }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason };

export type TargetDraftSaveResult =
  | { status: "saved"; record: TargetDraftRecord }
  | { status: "invalid"; errors: TargetDraftValidationError[] }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason };

export type TargetDraftBulkSaveResult =
  | { status: "saved"; records: TargetDraftRecord[] }
  | { status: "invalid"; errors: TargetDraftValidationError[] }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason };

export type TargetDraftLoadResult =
  | { status: "ok"; records: TargetDraftRecord[] }
  | { status: "empty"; records: [] }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason; records: [] };

export type TargetDraftDeleteResult =
  | { status: "deleted"; targetId: string }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason };

export type TargetDraftPauseResult =
  | { status: "paused"; record: TargetDraftRecord }
  | { status: "not_found"; targetId: string }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason };

export type TargetDraftClearResult =
  | { status: "cleared"; count: number }
  | { status: "invalid"; errors: ["empty_query"] }
  | { status: "corrupted"; reason: TargetDraftCorruptedReason }
  | { status: "unavailable"; reason: TargetDraftPersistenceUnavailableReason };
