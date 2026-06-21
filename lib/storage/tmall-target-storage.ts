import type {
  TmallTargetDefinition,
  TmallTargetDirection,
  TmallTargetMetricKey,
  TmallTargetPeriodType,
  TmallTargetScope,
  TmallTargetStatus,
  TmallTargetStorage,
} from "../../types/tmall-targets";

export type {
  TmallTargetDefinition,
  TmallTargetDirection,
  TmallTargetMetricKey,
  TmallTargetPeriodType,
  TmallTargetScope,
  TmallTargetStatus,
  TmallTargetStorage,
} from "../../types/tmall-targets";

export type TmallTargetStorageStatus = "empty" | "valid" | "corrupted";

export interface TmallTargetStorageParseResult {
  status: TmallTargetStorageStatus;
  targets: TmallTargetDefinition[];
}

export const TMALL_TARGET_STORAGE_KEY = "airburg_tmall_targets_v1";
export const TMALL_TARGET_STORAGE_EVENT = "airburg-tmall-target-storage-change";

const TARGET_SCOPES: TmallTargetScope[] = ["store", "product", "series"];
const TARGET_PERIOD_TYPES: TmallTargetPeriodType[] = ["daily", "monthly"];
const TARGET_METRIC_KEYS: TmallTargetMetricKey[] = [
  "gmv",
  "gsv",
  "visitors",
  "paidBuyers",
  "conversionRate",
  "avgOrderValue",
  "refundRate",
  "adSpend",
  "adRoi",
  "adSpendRate",
  "adSpendRateAfterRefund",
];
const TARGET_DIRECTIONS: TmallTargetDirection[] = [
  "higher_is_better",
  "lower_is_better",
];
const TARGET_STATUSES: TmallTargetStatus[] = ["active", "paused"];

const DAILY_PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHLY_PERIOD_PATTERN = /^\d{4}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isOneOf = <TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
): value is TValue =>
  typeof value === "string" && allowedValues.includes(value as TValue);

const isValidPeriodValue = (
  periodType: TmallTargetPeriodType,
  periodValue: unknown,
): periodValue is string => {
  if (typeof periodValue !== "string") return false;
  if (periodType === "daily") return DAILY_PERIOD_PATTERN.test(periodValue);
  return MONTHLY_PERIOD_PATTERN.test(periodValue);
};

const hasValidScopeIdentity = (value: Record<string, unknown>): boolean => {
  if (value.scope === "store") {
    return value.productId === undefined && value.seriesId === undefined;
  }

  if (value.scope === "product") {
    return typeof value.productId === "string" && value.productId.trim().length > 0;
  }

  if (value.scope === "series") {
    return typeof value.seriesId === "string" && value.seriesId.trim().length > 0;
  }

  return false;
};

export const validateTmallTargetDefinition = (
  value: unknown,
): value is TmallTargetDefinition => {
  if (!isRecord(value)) return false;
  if (!isOneOf(value.scope, TARGET_SCOPES)) return false;
  if (!isOneOf(value.periodType, TARGET_PERIOD_TYPES)) return false;

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isValidPeriodValue(value.periodType, value.periodValue) &&
    isOneOf(value.metricKey, TARGET_METRIC_KEYS) &&
    typeof value.targetValue === "number" &&
    Number.isFinite(value.targetValue) &&
    value.targetValue > 0 &&
    isOneOf(value.direction, TARGET_DIRECTIONS) &&
    isOneOf(value.status, TARGET_STATUSES) &&
    hasValidScopeIdentity(value) &&
    (value.productId === undefined || typeof value.productId === "string") &&
    (value.seriesId === undefined || typeof value.seriesId === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

export const validateTmallTargetStorage = (
  value: unknown,
): value is TmallTargetStorage => {
  if (!isRecord(value)) return false;

  return (
    value.version === "tmall_targets_v1" &&
    Array.isArray(value.targets) &&
    value.targets.every(validateTmallTargetDefinition)
  );
};

export const parseTmallTargetStorage = (
  rawValue: string | null | undefined,
): TmallTargetStorageParseResult => {
  if (rawValue === null || rawValue === undefined) {
    return { status: "empty", targets: [] };
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!validateTmallTargetStorage(parsed)) {
      return { status: "corrupted", targets: [] };
    }

    return { status: "valid", targets: parsed.targets };
  } catch {
    return { status: "corrupted", targets: [] };
  }
};

export const toTmallTargetStorage = (
  targets: TmallTargetDefinition[],
): TmallTargetStorage => ({
  version: "tmall_targets_v1",
  targets,
});

export const createTmallTargetId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `target_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const notifyTargetStorageChange = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TMALL_TARGET_STORAGE_EVENT));
};

export const loadTmallTargets = (): TmallTargetStorageParseResult => {
  if (typeof window === "undefined") return { status: "empty", targets: [] };

  return parseTmallTargetStorage(
    window.localStorage.getItem(TMALL_TARGET_STORAGE_KEY),
  );
};

export const saveTmallTargets = (targets: TmallTargetDefinition[]): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    TMALL_TARGET_STORAGE_KEY,
    JSON.stringify(toTmallTargetStorage(targets)),
  );
  notifyTargetStorageChange();
};

export const clearTmallTargets = (): void => {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(TMALL_TARGET_STORAGE_KEY);
  notifyTargetStorageChange();
};
