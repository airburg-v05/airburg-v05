export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssueCode =
  | "required_field"
  | "invalid_type"
  | "invalid_format"
  | "non_finite_number"
  | "forbidden_field"
  | "ownership_missing"
  | "source_type_mismatch"
  | "scope_mismatch"
  | "duplicate_key"
  | "semantic_duplicate"
  | "reference_missing"
  | "cross_store_reference"
  | "unsupported_legacy_period_type"
  | "invalid_date_range"
  | "range_summary_in_daily_repository"
  | "sensitive_detail_forbidden"
  | "after_sales_snapshot_invalid"
  | "after_sales_distribution_label_unsafe"
  | "migration_state_invalid";

export interface ValidationIssue {
  code: ValidationIssueCode;
  path: string;
  message: string;
  severity: ValidationSeverity;
  details?: Record<string, string | number | boolean | null>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type RepositoryResultStatus =
  | "success"
  | "empty"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "corrupted"
  | "migration_failed";

export interface RepositoryResult<T> {
  status: RepositoryResultStatus;
  data: T | null;
  issues: ValidationIssue[];
}

export const createIssue = (
  code: ValidationIssueCode,
  path: string,
  message: string,
  severity: ValidationSeverity = "error",
  details?: Record<string, string | number | boolean | null>,
): ValidationIssue => ({
  code,
  path,
  message,
  severity,
  ...(details ? { details } : {}),
});

export const validResult = (issues: ValidationIssue[] = []): ValidationResult => ({
  valid: !issues.some((issue) => issue.severity === "error"),
  issues,
});

export const invalidResult = (issues: ValidationIssue[]): ValidationResult => ({
  valid: false,
  issues,
});

export const mergeValidationResults = (...results: ValidationResult[]): ValidationResult => {
  const issues = results.flatMap((result) => result.issues);
  return validResult(issues);
};

export const repositorySuccess = <T>(data: T): RepositoryResult<T> => ({
  status: "success",
  data,
  issues: [],
});

export const repositoryEmpty = <T>(): RepositoryResult<T> => ({
  status: "empty",
  data: null,
  issues: [],
});

export const repositoryNotFound = <T>(path: string): RepositoryResult<T> => ({
  status: "not_found",
  data: null,
  issues: [createIssue("reference_missing", path, "The requested record was not found.")],
});

export const repositoryValidationError = <T>(issues: ValidationIssue[]): RepositoryResult<T> => ({
  status: "validation_error",
  data: null,
  issues,
});

export const repositoryConflict = <T>(path: string): RepositoryResult<T> => ({
  status: "conflict",
  data: null,
  issues: [createIssue("duplicate_key", path, "A record with the same key already exists.")],
});
