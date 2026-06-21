import {
  ALLOWED_PLATFORM_CODES,
  type PlatformCode,
  type V2SourceType,
} from "../domain/models";
import { createIssue, type ValidationIssue, type ValidationResult, validResult } from "../domain/results";

export type UnknownRecord = Record<string, unknown>;

export const isPlainRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isAllowedPlatformCode = (value: unknown): value is PlatformCode =>
  typeof value === "string" && (ALLOWED_PLATFORM_CODES as readonly string[]).includes(value);

export const isSourceType = (value: unknown): value is V2SourceType =>
  value === "business_product" || value === "ad_product" || value === "ad_plan" || value === "after_sales";

export const isBusinessDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const isIsoLikeDateTime = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const hasOwn = (record: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

export const forbiddenFieldNames = [
  "fileName",
  "rawRows",
  "previewRows",
  "rawContent",
  "fileContent",
  "headers",
  "File",
  "Blob",
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
] as const;

const lowerForbiddenFieldNames = new Set(forbiddenFieldNames.map((name) => name.toLowerCase()));

export const pushIssue = (
  issues: ValidationIssue[],
  code: ValidationIssue["code"],
  path: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): void => {
  issues.push(createIssue(code, path, message, "error", details));
};

export const validateNoUndefined = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void => {
  if (value === undefined) {
    pushIssue(issues, "invalid_type", path, "Undefined is not allowed in V2 records.");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoUndefined(item, `${path}[${index}]`, issues));
    return;
  }

  if (isPlainRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateNoUndefined(item, `${path}.${key}`, issues));
  }
};

export const validateNoForbiddenFields = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoForbiddenFields(item, `${path}[${index}]`, issues));
    return;
  }

  if (!isPlainRecord(value)) return;

  Object.entries(value).forEach(([key, item]) => {
    if (lowerForbiddenFieldNames.has(key.toLowerCase())) {
      const code = key.startsWith("raw") || key.includes("订单") || key.includes("退款")
        ? "sensitive_detail_forbidden"
        : "forbidden_field";
      pushIssue(issues, code, `${path}.${key}`, "This field is not allowed in V2 records.");
    }

    validateNoForbiddenFields(item, `${path}.${key}`, issues);
  });
};

export const validateFiniteNumbers = (
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    pushIssue(issues, "non_finite_number", path, "Only finite numbers are allowed.");
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateFiniteNumbers(item, `${path}[${index}]`, issues));
    return;
  }

  if (isPlainRecord(value)) {
    Object.entries(value).forEach(([key, item]) => validateFiniteNumbers(item, `${path}.${key}`, issues));
  }
};

export const validateRecordEnvelope = (record: unknown, path: string): {
  issues: ValidationIssue[];
  record: UnknownRecord | null;
} => {
  const issues: ValidationIssue[] = [];

  if (!isPlainRecord(record)) {
    pushIssue(issues, "invalid_type", path, "Expected a record object.");
    return { issues, record: null };
  }

  validateNoUndefined(record, path, issues);
  validateNoForbiddenFields(record, path, issues);
  validateFiniteNumbers(record, path, issues);

  return { issues, record };
};

export const requireString = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null => {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    pushIssue(issues, "required_field", `${path}.${key}`, "A non-empty string is required.");
    return null;
  }

  return value;
};

export const optionalString = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null | undefined => {
  if (!hasOwn(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  if (!isNonEmptyString(value)) {
    pushIssue(issues, "invalid_type", `${path}.${key}`, "Expected a string or null.");
    return undefined;
  }
  return value;
};

export const requirePlatformCode = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): PlatformCode | null => {
  const value = record[key];
  if (!isAllowedPlatformCode(value)) {
    pushIssue(issues, "ownership_missing", `${path}.${key}`, "A supported platform code is required.");
    return null;
  }
  return value;
};

export const requireBusinessDate = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null => {
  const value = record[key];
  if (!isBusinessDate(value)) {
    pushIssue(issues, hasOwn(record, key) ? "invalid_format" : "required_field", `${path}.${key}`, "Date must use YYYY-MM-DD.");
    return null;
  }
  return value;
};

export const requireSourceType = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): V2SourceType | null => {
  const value = record[key];
  if (!isSourceType(value)) {
    pushIssue(issues, hasOwn(record, key) ? "invalid_type" : "required_field", `${path}.${key}`, "A valid source type is required.");
    return null;
  }
  return value;
};

export const requireFinitePositiveNumber = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): number | null => {
  const value = record[key];
  if (!isFiniteNumber(value) || value <= 0) {
    pushIssue(issues, "invalid_type", `${path}.${key}`, "A positive finite number is required.");
    return null;
  }
  return value;
};

export const validateNullableNumberField = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  const value = record[key];
  if (value !== null && !isFiniteNumber(value)) {
    pushIssue(issues, "invalid_type", `${path}.${key}`, "Expected a finite number or null.");
  }
};

export const validateStringArrayField = (
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void => {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    pushIssue(issues, "invalid_type", `${path}.${key}`, "Expected an array of non-empty strings.");
  }
};

export const validateResultFromIssues = (issues: ValidationIssue[]): ValidationResult =>
  validResult(issues);
