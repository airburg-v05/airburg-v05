import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  type LegacyStorageSnapshot,
} from "../migration/contracts";

export interface ReadonlyLegacyStorage {
  getItem(key: string): string | null;
}

export const captureLegacyStorageSnapshot = ({
  storage,
  capturedAt,
}: {
  storage: ReadonlyLegacyStorage;
  capturedAt: string;
}): LegacyStorageSnapshot => ({
  capturedAt,
  values: {
    [LEGACY_ANALYSIS_KEY]: storage.getItem(LEGACY_ANALYSIS_KEY),
    [LEGACY_SERIES_KEY]: storage.getItem(LEGACY_SERIES_KEY),
    [LEGACY_TARGETS_KEY]: storage.getItem(LEGACY_TARGETS_KEY),
    [LEGACY_LAST_ANALYSIS_KEY]: storage.getItem(LEGACY_LAST_ANALYSIS_KEY),
    [LEGACY_DEMO_SESSION_KEY]: storage.getItem(LEGACY_DEMO_SESSION_KEY),
  },
});
