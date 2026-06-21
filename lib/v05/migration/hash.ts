import {
  createDryRunIssue,
  type DryRunIssue,
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
