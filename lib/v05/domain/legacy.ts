import { createIssue, type ValidationResult, validResult } from "./results";

export interface LegacyImportBatchIdInput {
  legacyStorageKey: string;
  legacyValueHash: string;
  migrationVersion: string;
}

const SAFE_HASH_PATTERN = /^[a-f0-9]{16,128}$/i;

const normalizeIdPart = (value: string): string =>
  encodeURIComponent(value.trim()).replace(/%/g, "~").replace(/[()]/g, "");

export const validateLegacyImportBatchIdInput = (
  input: LegacyImportBatchIdInput,
): ValidationResult => {
  const issues = [];

  if (!input.legacyStorageKey.trim()) {
    issues.push(createIssue("required_field", "legacyStorageKey", "Legacy storage key is required."));
  }

  if (!SAFE_HASH_PATTERN.test(input.legacyValueHash.trim())) {
    issues.push(
      createIssue("invalid_format", "legacyValueHash", "Legacy value hash must be stable hexadecimal text."),
    );
  }

  if (!input.migrationVersion.trim()) {
    issues.push(createIssue("required_field", "migrationVersion", "Migration version is required."));
  }

  return validResult(issues);
};

export const buildDeterministicLegacyImportBatchId = (
  input: LegacyImportBatchIdInput,
): string => {
  const validation = validateLegacyImportBatchIdInput(input);
  if (!validation.valid) {
    throw new Error("Invalid legacy import batch id input.");
  }

  return [
    "legacy_import_batch",
    normalizeIdPart(input.legacyStorageKey),
    input.legacyValueHash.trim().toLowerCase(),
    normalizeIdPart(input.migrationVersion),
  ].join("_");
};
