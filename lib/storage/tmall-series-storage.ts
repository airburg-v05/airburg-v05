export interface TmallSeriesGroup {
  id: string;
  name: string;
  description?: string;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TmallSeriesGroupStorage {
  version: "tmall_series_groups_v1";
  groups: TmallSeriesGroup[];
}

export type TmallSeriesGroupStorageStatus = "empty" | "valid" | "corrupted";

export interface TmallSeriesGroupStorageParseResult {
  status: TmallSeriesGroupStorageStatus;
  groups: TmallSeriesGroup[];
}

export const TMALL_SERIES_STORAGE_KEY = "airburg_tmall_series_groups_v1";
export const TMALL_SERIES_STORAGE_EVENT = "airburg-tmall-series-storage-change";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const validateTmallSeriesGroup = (value: unknown): value is TmallSeriesGroup => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    isStringArray(value.productIds) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

export const validateTmallSeriesGroupStorage = (
  value: unknown,
): value is TmallSeriesGroupStorage => {
  if (!isRecord(value)) return false;

  return (
    value.version === "tmall_series_groups_v1" &&
    Array.isArray(value.groups) &&
    value.groups.every(validateTmallSeriesGroup)
  );
};

export const parseTmallSeriesGroupStorage = (
  rawValue: string | null | undefined,
): TmallSeriesGroupStorageParseResult => {
  if (rawValue === null || rawValue === undefined) return { status: "empty", groups: [] };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!validateTmallSeriesGroupStorage(parsed)) {
      return { status: "corrupted", groups: [] };
    }

    return { status: "valid", groups: parsed.groups };
  } catch {
    return { status: "corrupted", groups: [] };
  }
};

export const toTmallSeriesGroupStorage = (
  groups: TmallSeriesGroup[],
): TmallSeriesGroupStorage => ({
  version: "tmall_series_groups_v1",
  groups,
});

export const createTmallSeriesGroupId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `series_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const notifySeriesStorageChange = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TMALL_SERIES_STORAGE_EVENT));
};

export const loadTmallSeriesGroups = (): TmallSeriesGroupStorageParseResult => {
  if (typeof window === "undefined") return { status: "empty", groups: [] };

  return parseTmallSeriesGroupStorage(
    window.localStorage.getItem(TMALL_SERIES_STORAGE_KEY),
  );
};

export const saveTmallSeriesGroups = (groups: TmallSeriesGroup[]): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    TMALL_SERIES_STORAGE_KEY,
    JSON.stringify(toTmallSeriesGroupStorage(groups)),
  );
  notifySeriesStorageChange();
};

export const clearTmallSeriesGroups = (): void => {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(TMALL_SERIES_STORAGE_KEY);
  notifySeriesStorageChange();
};
