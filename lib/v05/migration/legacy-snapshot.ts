import {
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_STORAGE_KEYS,
  createDryRunIssue,
  type IgnoredLegacyKeySummary,
  type LegacyHashSummary,
  type LegacyKeySummary,
  type LegacySnapshotValidationResult,
  type LegacyStorageKey,
  type LegacyStorageSnapshot,
} from "./contracts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const validateLegacyStorageSnapshot = (
  value: unknown,
): LegacySnapshotValidationResult => {
  const issues = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      snapshot: null,
      issues: [
        createDryRunIssue(
          "legacy_snapshot_invalid",
          "snapshot",
          "Legacy snapshot must be an object supplied by the caller.",
        ),
      ],
    };
  }

  if (typeof value.capturedAt !== "string" || !value.capturedAt.trim()) {
    issues.push(
      createDryRunIssue(
        "required_field",
        "snapshot.capturedAt",
        "Snapshot capturedAt must be supplied by the caller.",
      ),
    );
  }

  if (!isRecord(value.values)) {
    issues.push(
      createDryRunIssue(
        "required_field",
        "snapshot.values",
        "Snapshot values must include every legacy key.",
      ),
    );
  }

  const values = isRecord(value.values) ? value.values : {};
  const normalizedValues = {} as Record<LegacyStorageKey, string | null>;

  LEGACY_STORAGE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      issues.push(
        createDryRunIssue(
          "legacy_key_missing",
          `snapshot.values.${key}`,
          "Every known legacy key must be represented with a string or null value.",
        ),
      );
      normalizedValues[key] = null;
      return;
    }

    const rawValue = values[key];
    if (rawValue !== null && typeof rawValue !== "string") {
      issues.push(
        createDryRunIssue(
          "invalid_type",
          `snapshot.values.${key}`,
          "Legacy key values must be strings or null.",
        ),
      );
      normalizedValues[key] = null;
      return;
    }

    normalizedValues[key] = rawValue;
  });

  if (issues.some((issue) => issue.severity === "error")) {
    return { valid: false, snapshot: null, issues };
  }

  const capturedAt = value.capturedAt as string;

  return {
    valid: true,
    snapshot: {
      capturedAt,
      values: normalizedValues,
    },
    issues,
  };
};

export const summarizeLegacyKeys = (
  snapshot: LegacyStorageSnapshot,
  hashes: LegacyHashSummary[],
): LegacyKeySummary[] => {
  const hashByKey = new Map(hashes.map((item) => [item.key, item.valueHash]));

  return LEGACY_STORAGE_KEYS.map((key) => {
    const rawValue = snapshot.values[key];
    return {
      key,
      present: rawValue !== null,
      rawLength: rawValue === null ? 0 : rawValue.length,
      valueHash: hashByKey.get(key) ?? null,
    };
  });
};

export const summarizeIgnoredLegacyKeys = (
  snapshot: LegacyStorageSnapshot,
): IgnoredLegacyKeySummary[] => [
  {
    key: LEGACY_LAST_ANALYSIS_KEY,
    present: snapshot.values[LEGACY_LAST_ANALYSIS_KEY] !== null,
    reason: "ignored_deprecated_preview",
  },
  {
    key: LEGACY_DEMO_SESSION_KEY,
    present: snapshot.values[LEGACY_DEMO_SESSION_KEY] !== null,
    reason: "ignored_non_business_session",
  },
];
