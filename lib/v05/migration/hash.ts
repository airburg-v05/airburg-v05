import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  createDryRunIssue,
  type DryRunIssue,
  type LegacyHashSummary,
  type LegacyStorageKey,
  type LegacyValueHasher,
} from "./contracts";

const HEX_BYTE_PAD = 2;

const bytesToHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(HEX_BYTE_PAD, "0"))
    .join("");

export const createWebCryptoLegacyValueHasher = (): LegacyValueHasher => ({
  hash: async (rawValue: string): Promise<string> => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
      throw new Error("hash_provider_unavailable");
    }

    const bytes = new TextEncoder().encode(rawValue);
    const digest = await subtle.digest("SHA-256", bytes);
    return bytesToHex(digest);
  },
});

export const hashLegacyValue = async (
  key: LegacyStorageKey,
  rawValue: string | null,
  hasher: LegacyValueHasher,
): Promise<{ valueHash: string | null; issues: DryRunIssue[] }> => {
  if (rawValue === null) return { valueHash: null, issues: [] };

  try {
    const valueHash = await hasher.hash(rawValue);
    if (!/^[a-f0-9]{64}$/i.test(valueHash)) {
      return {
        valueHash: null,
        issues: [
          createDryRunIssue(
            "invalid_format",
            `values.${key}`,
            "Legacy value hash must be stable hexadecimal text.",
          ),
        ],
      };
    }

    return { valueHash: valueHash.toLowerCase(), issues: [] };
  } catch {
    return {
      valueHash: null,
      issues: [
        createDryRunIssue(
          "hash_provider_unavailable",
          `values.${key}`,
          "A stable hash provider is required before creating a dry-run candidate.",
        ),
      ],
    };
  }
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const hashFromSummary = (
  hashes: LegacyHashSummary[],
  key: LegacyStorageKey,
): string | null => hashes.find((item) => item.key === key)?.valueHash ?? null;

export const createBusinessDatasetFingerprintPayload = (
  hashes: LegacyHashSummary[],
): Array<[typeof LEGACY_ANALYSIS_KEY | typeof LEGACY_SERIES_KEY | typeof LEGACY_TARGETS_KEY, string | null]> => [
  [LEGACY_ANALYSIS_KEY, hashFromSummary(hashes, LEGACY_ANALYSIS_KEY)],
  [LEGACY_SERIES_KEY, hashFromSummary(hashes, LEGACY_SERIES_KEY)],
  [LEGACY_TARGETS_KEY, hashFromSummary(hashes, LEGACY_TARGETS_KEY)],
];

export const createManifestFingerprintPayload = (
  hashes: LegacyHashSummary[],
): Array<[LegacyStorageKey, boolean, string | null]> => [
  LEGACY_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
].map((key) => {
  const valueHash = hashFromSummary(hashes, key);
  return [key, valueHash !== null, valueHash];
});

export const hashStableFingerprintPayload = async (
  payload: unknown,
  hasher: LegacyValueHasher,
): Promise<{ fingerprint: string | null; issues: DryRunIssue[] }> => {
  try {
    const fingerprint = await hasher.hash(stableStringify(payload));
    if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
      return {
        fingerprint: null,
        issues: [
          createDryRunIssue(
            "invalid_format",
            "fingerprint",
            "Stable fingerprint must be hexadecimal text.",
          ),
        ],
      };
    }

    return { fingerprint: fingerprint.toLowerCase(), issues: [] };
  } catch {
    return {
      fingerprint: null,
      issues: [
        createDryRunIssue(
          "hash_provider_unavailable",
          "fingerprint",
          "A stable hash provider is required before creating a dry-run fingerprint.",
        ),
      ],
    };
  }
};
