import { parseTmallTargetStorage } from "../../storage/tmall-target-storage";
import {
  V2_SCHEMA_VERSION,
  type LegacyTargetCandidate,
  type TargetDirection,
  type TargetPeriodType,
  type TargetRecord,
  type TargetScope,
  type TargetStatus,
} from "../domain/models";
import { convertLegacyTargetCandidate } from "../validation/records";
import {
  DEFAULT_TMAIL_OWNER,
  LEGACY_TARGETS_KEY,
  createDryRunIssue,
  toDryRunIssue,
  type RejectedLegacyRecord,
  type TargetMappingResult,
} from "./contracts";

interface TargetMappingInput {
  rawValue: string | null;
  availableProductIds: Set<string>;
  availableSeriesIds: Set<string>;
}

interface LegacyTargetLike {
  id: string;
  scope: TargetScope;
  periodType: string;
  periodValue: string;
  metricKey: string;
  targetValue: number;
  direction: TargetDirection;
  status: TargetStatus;
  productId?: string;
  seriesId?: string;
  createdAt: string;
  updatedAt: string;
}

const TARGET_SCOPES: TargetScope[] = ["store", "product", "series"];
const TARGET_PERIODS: TargetPeriodType[] = ["daily", "monthly"];
const TARGET_DIRECTIONS: TargetDirection[] = ["higher_is_better", "lower_is_better"];
const TARGET_STATUSES: TargetStatus[] = ["active", "paused"];
const DAILY_PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHLY_PERIOD_PATTERN = /^\d{4}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isOneOf = <TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue =>
  typeof value === "string" && allowed.includes(value as TValue);

const isSupportedPeriodValue = (periodType: string, periodValue: string): boolean => {
  if (periodType === "daily") return DAILY_PERIOD_PATTERN.test(periodValue);
  if (periodType === "monthly") return MONTHLY_PERIOD_PATTERN.test(periodValue);
  return periodValue.trim().length > 0;
};

const loadTargetLikes = (
  rawValue: string | null,
): { status: "empty" | "valid" | "corrupted"; targets: LegacyTargetLike[] } => {
  if (rawValue === null) return { status: "empty", targets: [] };

  const strictParsed = parseTmallTargetStorage(rawValue);
  if (strictParsed.status === "valid") {
    return {
      status: "valid",
      targets: strictParsed.targets.map((target) => ({
        id: target.id,
        scope: target.scope,
        periodType: target.periodType,
        periodValue: target.periodValue,
        metricKey: target.metricKey,
        targetValue: target.targetValue,
        direction: target.direction,
        status: target.status,
        ...(target.productId ? { productId: target.productId } : {}),
        ...(target.seriesId ? { seriesId: target.seriesId } : {}),
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      })),
    };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!isRecord(parsed) || parsed.version !== "tmall_targets_v1" || !Array.isArray(parsed.targets)) {
      return { status: "corrupted", targets: [] };
    }

    const targets: LegacyTargetLike[] = [];
    for (const item of parsed.targets) {
      if (!isRecord(item)) return { status: "corrupted", targets: [] };
      if (!isOneOf(item.scope, TARGET_SCOPES)) return { status: "corrupted", targets: [] };
      if (!isNonEmptyText(item.id)) return { status: "corrupted", targets: [] };
      if (!isNonEmptyText(item.periodType)) return { status: "corrupted", targets: [] };
      if (!isNonEmptyText(item.periodValue)) return { status: "corrupted", targets: [] };
      if (!isNonEmptyText(item.metricKey)) return { status: "corrupted", targets: [] };
      if (typeof item.targetValue !== "number" || !Number.isFinite(item.targetValue) || item.targetValue <= 0) {
        return { status: "corrupted", targets: [] };
      }
      if (!isOneOf(item.direction, TARGET_DIRECTIONS)) return { status: "corrupted", targets: [] };
      if (!isOneOf(item.status, TARGET_STATUSES)) return { status: "corrupted", targets: [] };
      if (!isNonEmptyText(item.createdAt) || !isNonEmptyText(item.updatedAt)) {
        return { status: "corrupted", targets: [] };
      }

      targets.push({
        id: item.id.trim(),
        scope: item.scope,
        periodType: item.periodType.trim(),
        periodValue: item.periodValue.trim(),
        metricKey: item.metricKey.trim(),
        targetValue: item.targetValue,
        direction: item.direction,
        status: item.status,
        ...(isNonEmptyText(item.productId) ? { productId: item.productId.trim() } : {}),
        ...(isNonEmptyText(item.seriesId) ? { seriesId: item.seriesId.trim() } : {}),
        createdAt: item.createdAt.trim(),
        updatedAt: item.updatedAt.trim(),
      });
    }

    return { status: "valid", targets };
  } catch {
    return { status: "corrupted", targets: [] };
  }
};

const rejectTarget = (
  rejectedRecords: RejectedLegacyRecord[],
  safeIdentity: string,
  issueCode: RejectedLegacyRecord["issueCodes"][number],
  path: string,
): void => {
  rejectedRecords.push({
    legacyKey: LEGACY_TARGETS_KEY,
    recordType: "target",
    safeIdentity,
    issueCodes: [issueCode],
    paths: [path],
  });
};

const candidateFromTarget = (target: LegacyTargetLike): LegacyTargetCandidate => ({
  schemaVersion: V2_SCHEMA_VERSION,
  legacyTargetId: target.id,
  legacyStorageKey: LEGACY_TARGETS_KEY,
  scope: target.scope,
  platformCode: DEFAULT_TMAIL_OWNER.platformCode,
  storeId: DEFAULT_TMAIL_OWNER.storeId,
  ...(target.seriesId ? { seriesId: target.seriesId } : {}),
  ...(target.productId ? { productId: target.productId } : {}),
  periodType: target.periodType,
  periodValue: target.periodValue,
  metricKey: target.metricKey,
  targetValue: target.targetValue,
  direction: target.direction,
  status: target.status,
  createdAt: target.createdAt,
  updatedAt: target.updatedAt,
});

export const mapLegacyTargetsToV2 = ({
  rawValue,
  availableProductIds,
  availableSeriesIds,
}: TargetMappingInput): TargetMappingResult => {
  const parsed = loadTargetLikes(rawValue);
  if (parsed.status === "empty") {
    return {
      status: "empty",
      targets: [],
      legacyTargetCandidates: [],
      rejectedRecords: [],
      issues: [],
    };
  }

  if (parsed.status === "corrupted") {
    return {
      status: "corrupted",
      targets: [],
      legacyTargetCandidates: [],
      rejectedRecords: [],
      issues: [
        createDryRunIssue(
          "legacy_parse_failed",
          LEGACY_TARGETS_KEY,
          "Legacy targets could not be parsed safely.",
        ),
      ],
    };
  }

  const targets: TargetRecord[] = [];
  const legacyTargetCandidates: LegacyTargetCandidate[] = [];
  const rejectedRecords: RejectedLegacyRecord[] = [];
  const issues = [];
  const seenTargetIds = new Set<string>();

  parsed.targets.forEach((target, index) => {
    const path = `targets[${index}]`;
    if (seenTargetIds.has(target.id)) {
      rejectTarget(rejectedRecords, target.id, "duplicate_key", `${path}.id`);
      return;
    }
    seenTargetIds.add(target.id);

    if (!isSupportedPeriodValue(target.periodType, target.periodValue)) {
      rejectTarget(rejectedRecords, target.id, "invalid_format", `${path}.periodValue`);
      return;
    }

    if (target.scope === "product" && !target.productId) {
      rejectTarget(rejectedRecords, target.id, "ownership_missing", `${path}.productId`);
      issues.push(
        createDryRunIssue(
          "ownership_missing",
          `${path}.productId`,
          "Product target requires a product id before it can migrate.",
        ),
      );
      return;
    }

    if (target.scope === "series" && !target.seriesId) {
      rejectTarget(rejectedRecords, target.id, "ownership_missing", `${path}.seriesId`);
      issues.push(
        createDryRunIssue(
          "ownership_missing",
          `${path}.seriesId`,
          "Series target requires a series id before it can migrate.",
        ),
      );
      return;
    }

    if (target.productId && !availableProductIds.has(target.productId)) {
      rejectTarget(rejectedRecords, target.id, "reference_missing", `${path}.productId`);
      issues.push(
        createDryRunIssue(
          "reference_missing",
          `${path}.productId`,
          "Product target references a product outside the migrated business facts.",
        ),
      );
      return;
    }

    if (target.seriesId && !availableSeriesIds.has(target.seriesId)) {
      rejectTarget(rejectedRecords, target.id, "reference_missing", `${path}.seriesId`);
      issues.push(
        createDryRunIssue(
          "reference_missing",
          `${path}.seriesId`,
          "Series target references a series outside the migrated series records.",
        ),
      );
      return;
    }

    const candidate = candidateFromTarget(target);
    if (!TARGET_PERIODS.includes(target.periodType as TargetPeriodType)) {
      legacyTargetCandidates.push(candidate);
      issues.push(
        createDryRunIssue(
          "unsupported_legacy_period_type",
          `${path}.periodType`,
          "Legacy target period type is not supported by active V2 targets.",
          "error",
          { targetCount: 1 },
        ),
      );
      return;
    }

    const conversion = convertLegacyTargetCandidate(candidate);
    issues.push(...conversion.validation.issues.map(toDryRunIssue));
    if (conversion.target) targets.push(conversion.target);
  });

  if (rejectedRecords.length > 0) {
    issues.push(
      createDryRunIssue(
        "invalid_format",
        LEGACY_TARGETS_KEY,
        "Some legacy targets could not be represented safely.",
        "error",
        { rejectedRecordCount: rejectedRecords.length },
      ),
    );
  }

  return {
    status: "valid",
    targets,
    legacyTargetCandidates,
    rejectedRecords,
    issues,
  };
};
