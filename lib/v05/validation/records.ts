import {
  ALLOWED_PLATFORM_CODES,
  V2_SCHEMA_VERSION,
  type AfterSalesDateBasis,
  type EntityStatus,
  type ImportBatchStatus,
  type ImportFileStatus,
  type LegacyTargetCandidate,
  type MigrationManifestStatus,
  type TargetDirection,
  type TargetPeriodType,
  type TargetRecord,
  type TargetScope,
  type TargetStatus,
  type V2SourceType,
} from "../domain/models";
import type { ValidationIssue, ValidationResult } from "../domain/results";
import {
  hasOwn,
  isBusinessDate,
  isNonEmptyString,
  isPlainRecord,
  optionalString,
  pushIssue,
  requireBusinessDate,
  requireFinitePositiveNumber,
  requirePlatformCode,
  requireSourceType,
  requireString,
  validateNullableNumberField,
  validateRecordEnvelope,
  validateResultFromIssues,
  validateStringArrayField,
  type UnknownRecord,
} from "./core";

type Validator = (record: unknown, path?: string) => ValidationResult;

const SOURCE_TYPES: V2SourceType[] = ["business_product", "ad_product", "ad_plan", "after_sales"];
const ENTITY_STATUSES: EntityStatus[] = ["active", "inactive"];
const BATCH_STATUSES: ImportBatchStatus[] = ["pending", "success", "partial_success", "failed"];
const FILE_STATUSES: ImportFileStatus[] = ["parsed", "missing", "unknown", "error"];
const DATE_BASIS: AfterSalesDateBasis[] = ["apply_date", "success_date", "payment_date"];
const TARGET_SCOPES: TargetScope[] = ["company", "store", "series", "product"];
const TARGET_PERIODS: TargetPeriodType[] = ["daily", "monthly"];
const TARGET_DIRECTIONS: TargetDirection[] = ["higher_is_better", "lower_is_better"];
const TARGET_STATUSES: TargetStatus[] = ["active", "paused", "deleted"];
const MANIFEST_STATUSES: MigrationManifestStatus[] = ["pending", "success", "partial_success", "failed"];

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T =>
  typeof value === "string" && options.includes(value as T);

const requireSchemaVersion = (record: UnknownRecord, path: string, issues: ValidationIssue[]): void => {
  if (record.schemaVersion !== V2_SCHEMA_VERSION) {
    pushIssue(issues, "invalid_format", `${path}.schemaVersion`, "Schema version is invalid.");
  }
};

const requireEnum = <T extends string>(
  record: UnknownRecord,
  key: string,
  options: readonly T[],
  path: string,
  issues: ValidationIssue[],
): T | null => {
  const value = record[key];
  if (!isOneOf(value, options)) {
    pushIssue(issues, hasOwn(record, key) ? "invalid_type" : "required_field", `${path}.${key}`, "Unsupported value.");
    return null;
  }
  return value;
};

const validateOwner = (record: UnknownRecord, path: string, issues: ValidationIssue[]): void => {
  requirePlatformCode(record, "platformCode", path, issues);
  requireString(record, "storeId", path, issues);
};

const validateOwnedFactBase = (
  record: UnknownRecord,
  expectedSourceType: V2SourceType,
  path: string,
  issues: ValidationIssue[],
): void => {
  validateOwner(record, path, issues);
  requireBusinessDate(record, "businessDate", path, issues);
  requireString(record, "importBatchId", path, issues);
  const sourceType = requireSourceType(record, "sourceType", path, issues);
  if (sourceType !== null && sourceType !== expectedSourceType) {
    pushIssue(issues, "source_type_mismatch", `${path}.sourceType`, "Source type does not match record type.");
  }
};

const validateDateRange = (record: UnknownRecord, key: string, path: string, issues: ValidationIssue[]): void => {
  const value = record[key];
  if (!isPlainRecord(value)) {
    pushIssue(issues, "invalid_date_range", `${path}.${key}`, "Date range is required.");
    return;
  }

  if (!isBusinessDate(value.start)) {
    pushIssue(issues, "invalid_date_range", `${path}.${key}.start`, "Date range start must use YYYY-MM-DD.");
  }

  if (!isBusinessDate(value.end)) {
    pushIssue(issues, "invalid_date_range", `${path}.${key}.end`, "Date range end must use YYYY-MM-DD.");
  }

  if (isBusinessDate(value.start) && isBusinessDate(value.end) && value.start > value.end) {
    pushIssue(issues, "invalid_date_range", `${path}.${key}`, "Date range start must not be after end.");
  }
};

const validateNullableMetricFields = (
  record: UnknownRecord,
  path: string,
  issues: ValidationIssue[],
  fields: string[],
): void => fields.forEach((field) => validateNullableNumberField(record, field, path, issues));

const finalize = (issues: ValidationIssue[]): ValidationResult => validateResultFromIssues(issues);

export const validatePlatformRecord: Validator = (record, path = "platform") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  requirePlatformCode(data, "platformCode", path, issues);
  requireString(data, "platformName", path, issues);
  requireEnum(data, "status", ENTITY_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateStoreRecord: Validator = (record, path = "store") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "storeName", path, issues);
  requireEnum(data, "status", ENTITY_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateImportBatchRecord: Validator = (
  record,
  path = "importBatch",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "importBatchId", path, issues);
  requireString(data, "importStartedAt", path, issues);
  if (data.importCompletedAt !== null && !isNonEmptyString(data.importCompletedAt)) {
    pushIssue(issues, "invalid_type", `${path}.importCompletedAt`, "Expected a string or null.");
  }
  requireEnum(data, "status", BATCH_STATUSES, path, issues);
  const sourceTypes = data.sourceTypes;
  if (!Array.isArray(sourceTypes) || sourceTypes.some((sourceType) => !isOneOf(sourceType, SOURCE_TYPES))) {
    pushIssue(issues, "invalid_type", `${path}.sourceTypes`, "Expected source type array.");
  }
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateImportFileRecord: Validator = (record, path = "importFile") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "importFileId", path, issues);
  requireString(data, "importBatchId", path, issues);
  requireSourceType(data, "sourceType", path, issues);
  const detected = data.detectedSourceType;
  if (detected !== "unknown" && !isOneOf(detected, SOURCE_TYPES)) {
    pushIssue(issues, "invalid_type", `${path}.detectedSourceType`, "Expected detected source type.");
  }
  requireString(data, "fileFingerprint", path, issues);
  const rowCount = data.rowCount;
  if (typeof rowCount !== "number" || !Number.isInteger(rowCount) || rowCount < 0) {
    pushIssue(issues, "invalid_type", `${path}.rowCount`, "Row count must be a non-negative integer.");
  }
  const headerRowNumber = data.headerRowNumber;
  if (
    headerRowNumber !== null &&
    (typeof headerRowNumber !== "number" || !Number.isInteger(headerRowNumber) || headerRowNumber < 1)
  ) {
    pushIssue(issues, "invalid_type", `${path}.headerRowNumber`, "Header row must be a positive integer or null.");
  }
  if (data.dateRange !== null) validateDateRange(data, "dateRange", path, issues);
  requireEnum(data, "status", FILE_STATUSES, path, issues);
  validateStringArrayField(data, "safeWarningCodes", path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateOwnedBusinessProductFact: Validator = (
  record,
  path = "businessProductFact",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwnedFactBase(data, "business_product", path, issues);
  requireString(data, "productId", path, issues);
  optionalString(data, "productName", path, issues);
  validateNullableMetricFields(data, path, issues, [
    "gmv",
    "gsv",
    "visitors",
    "paidBuyers",
    "paidOrders",
    "conversionRate",
    "avgOrderValue",
    "favorites",
    "cartAdditions",
  ]);

  return finalize(issues);
};

export const validateOwnedAdProductFact: Validator = (
  record,
  path = "adProductFact",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwnedFactBase(data, "ad_product", path, issues);
  requireString(data, "productId", path, issues);
  validateNullableMetricFields(data, path, issues, [
    "adSpend",
    "adSalesAmount",
    "impressions",
    "clicks",
    "clickRate",
    "adRoi",
  ]);

  return finalize(issues);
};

export const validateOwnedAdPlanFact: Validator = (record, path = "adPlanFact") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwnedFactBase(data, "ad_plan", path, issues);
  requireString(data, "planId", path, issues);
  optionalString(data, "planName", path, issues);
  validateNullableMetricFields(data, path, issues, [
    "adSpend",
    "adSalesAmount",
    "impressions",
    "clicks",
    "adRoi",
  ]);

  return finalize(issues);
};

export const validateOwnedAfterSalesDailyAggregate: Validator = (
  record,
  path = "afterSalesDailyAggregate",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  if (hasOwn(data, "dateRange")) {
    pushIssue(issues, "range_summary_in_daily_repository", `${path}.dateRange`, "Range aggregate cannot be stored as daily aggregate.");
  }
  requireSchemaVersion(data, path, issues);
  validateOwnedFactBase(data, "after_sales", path, issues);
  requireEnum(data, "dateBasis", DATE_BASIS, path, issues);
  optionalString(data, "productId", path, issues);
  validateNullableMetricFields(data, path, issues, ["refundAmount", "refundOrderCount", "afterSalesApplyCount"]);

  return finalize(issues);
};

export const validateOwnedAfterSalesRangeAggregate: Validator = (
  record,
  path = "afterSalesRangeAggregate",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "importBatchId", path, issues);
  const sourceType = requireSourceType(data, "sourceType", path, issues);
  if (sourceType !== null && sourceType !== "after_sales") {
    pushIssue(issues, "source_type_mismatch", `${path}.sourceType`, "Source type does not match record type.");
  }
  if (hasOwn(data, "businessDate")) {
    pushIssue(issues, "range_summary_in_daily_repository", `${path}.businessDate`, "Range aggregate must not contain a business date.");
  }
  validateDateRange(data, "dateRange", path, issues);
  requireEnum(data, "dateBasis", DATE_BASIS, path, issues);
  optionalString(data, "productId", path, issues);
  validateNullableMetricFields(data, path, issues, ["refundAmount", "refundOrderCount", "afterSalesApplyCount"]);

  return finalize(issues);
};

export const validateSeriesRecord: Validator = (record, path = "series") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "seriesId", path, issues);
  requireString(data, "name", path, issues);
  validateStringArrayField(data, "productIds", path, issues);
  requireEnum(data, "status", ENTITY_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateTrackedProductRecord: Validator = (
  record,
  path = "trackedProduct",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  validateOwner(data, path, issues);
  requireString(data, "trackedProductId", path, issues);
  requireString(data, "productId", path, issues);
  optionalString(data, "displayName", path, issues);
  requireEnum(data, "status", ENTITY_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

const validateTargetScopeFields = (data: UnknownRecord, path: string, issues: ValidationIssue[]): void => {
  const scope = requireEnum(data, "scope", TARGET_SCOPES, path, issues);
  if (scope === null) return;

  if (scope === "company") {
    if (hasOwn(data, "storeId") || hasOwn(data, "platformCode") || hasOwn(data, "seriesId") || hasOwn(data, "productId")) {
      pushIssue(issues, "scope_mismatch", `${path}.scope`, "Company target must not contain store, series, or product owner fields.");
    }
    return;
  }

  requirePlatformCode(data, "platformCode", path, issues);
  requireString(data, "storeId", path, issues);

  if (scope === "store") {
    if (hasOwn(data, "seriesId") || hasOwn(data, "productId")) {
      pushIssue(issues, "scope_mismatch", `${path}.scope`, "Store target must not contain series or product fields.");
    }
    return;
  }

  if (scope === "series") {
    requireString(data, "seriesId", path, issues);
    if (hasOwn(data, "productId")) {
      pushIssue(issues, "scope_mismatch", `${path}.productId`, "Series target must not contain product field.");
    }
    return;
  }

  requireString(data, "productId", path, issues);
  if (hasOwn(data, "seriesId")) {
    pushIssue(issues, "scope_mismatch", `${path}.seriesId`, "Product target must not contain series field.");
  }
};

export const validateTargetRecord: Validator = (record, path = "target") => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  requireString(data, "targetId", path, issues);
  validateTargetScopeFields(data, path, issues);
  requireEnum(data, "periodType", TARGET_PERIODS, path, issues);
  requireString(data, "periodValue", path, issues);
  requireString(data, "metricKey", path, issues);
  requireFinitePositiveNumber(data, "targetValue", path, issues);
  requireEnum(data, "direction", TARGET_DIRECTIONS, path, issues);
  requireEnum(data, "status", TARGET_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const validateLegacyTargetCandidate: Validator = (
  record,
  path = "legacyTargetCandidate",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  requireString(data, "legacyTargetId", path, issues);
  requireString(data, "legacyStorageKey", path, issues);
  validateTargetScopeFields(data, path, issues);
  requireString(data, "periodType", path, issues);
  requireString(data, "periodValue", path, issues);
  requireString(data, "metricKey", path, issues);
  requireFinitePositiveNumber(data, "targetValue", path, issues);
  requireEnum(data, "direction", TARGET_DIRECTIONS, path, issues);
  requireEnum(data, "status", TARGET_STATUSES, path, issues);
  requireString(data, "createdAt", path, issues);
  requireString(data, "updatedAt", path, issues);

  return finalize(issues);
};

export const convertLegacyTargetCandidate = (
  candidate: LegacyTargetCandidate,
): { target: TargetRecord | null; validation: ValidationResult } => {
  const validation = validateLegacyTargetCandidate(candidate);
  const issues = [...validation.issues];

  if (!TARGET_PERIODS.includes(candidate.periodType as TargetPeriodType)) {
    issues.push(
      {
        code: "unsupported_legacy_period_type",
        path: "legacyTargetCandidate.periodType",
        message: "Legacy target period type is not supported by active V2 targets.",
        severity: "error",
        details: { periodType: candidate.periodType },
      },
    );
    return { target: null, validation: validateResultFromIssues(issues) };
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return { target: null, validation: validateResultFromIssues(issues) };
  }

  const target: TargetRecord = {
    schemaVersion: V2_SCHEMA_VERSION,
    targetId: candidate.legacyTargetId,
    scope: candidate.scope,
    ...(candidate.platformCode ? { platformCode: candidate.platformCode } : {}),
    ...(candidate.storeId ? { storeId: candidate.storeId } : {}),
    ...(candidate.seriesId ? { seriesId: candidate.seriesId } : {}),
    ...(candidate.productId ? { productId: candidate.productId } : {}),
    periodType: candidate.periodType as TargetPeriodType,
    periodValue: candidate.periodValue,
    metricKey: candidate.metricKey,
    targetValue: candidate.targetValue,
    direction: candidate.direction,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  return { target, validation: validateResultFromIssues(issues) };
};

export const validateMigrationManifest: Validator = (
  record,
  path = "migrationManifest",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  requireString(data, "migrationManifestId", path, issues);
  requireString(data, "migrationVersion", path, issues);
  requireEnum(data, "status", MANIFEST_STATUSES, path, issues);
  validateStringArrayField(data, "migratedFromKeys", path, issues);
  optionalString(data, "importBatchId", path, issues);
  optionalString(data, "legacyValueHash", path, issues);
  requireString(data, "startedAt", path, issues);
  optionalString(data, "completedAt", path, issues);
  validateStringArrayField(data, "safeIssueCodes", path, issues);

  return finalize(issues);
};

export const validateActiveDatasetPointer: Validator = (
  record,
  path = "activeDatasetPointer",
) => {
  const { issues, record: data } = validateRecordEnvelope(record, path);
  if (!data) return finalize(issues);

  requireSchemaVersion(data, path, issues);
  requireString(data, "pointerId", path, issues);
  requireEnum(data, "state", ["none", "legacy_readonly", "v2_staged", "v2_active", "migration_failed"], path, issues);
  optionalString(data, "datasetId", path, issues);
  optionalString(data, "migrationManifestId", path, issues);
  optionalString(data, "activatedAt", path, issues);

  return finalize(issues);
};

export const validateV2Record = (record: unknown, kind: string): ValidationResult => {
  const validators: Record<string, Validator> = {
    platform: validatePlatformRecord,
    store: validateStoreRecord,
    importBatch: validateImportBatchRecord,
    importFile: validateImportFileRecord,
    businessProductFact: validateOwnedBusinessProductFact,
    adProductFact: validateOwnedAdProductFact,
    adPlanFact: validateOwnedAdPlanFact,
    afterSalesDailyAggregate: validateOwnedAfterSalesDailyAggregate,
    afterSalesRangeAggregate: validateOwnedAfterSalesRangeAggregate,
    series: validateSeriesRecord,
    trackedProduct: validateTrackedProductRecord,
    target: validateTargetRecord,
    legacyTargetCandidate: validateLegacyTargetCandidate,
    migrationManifest: validateMigrationManifest,
    activeDatasetPointer: validateActiveDatasetPointer,
  };

  return validators[kind]?.(record) ??
    validateResultFromIssues([
      {
        code: "invalid_type",
        path: "record",
        message: "Unknown record kind.",
        severity: "error",
      },
    ]);
};

export const isKnownPlatformCode = (value: string): boolean =>
  (ALLOWED_PLATFORM_CODES as readonly string[]).includes(value);
