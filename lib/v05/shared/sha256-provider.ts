import { sha256 as nobleSha256 } from "@noble/hashes/sha2.js";

export type Sha256Input = ArrayBuffer | Uint8Array;

export type Sha256DigestProvider = {
  digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>;
};

const HEX_BYTE_PAD = 2;

export const bytesToHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(HEX_BYTE_PAD, "0"))
    .join("");

const toUint8Array = (input: Sha256Input): Uint8Array =>
  input instanceof Uint8Array ? input : new Uint8Array(input);

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const currentSubtleCrypto = (): Sha256DigestProvider | null =>
  globalThis.crypto?.subtle ?? null;

export const sha256HexWithProvider = async (
  input: Sha256Input,
  provider: Sha256DigestProvider | null = currentSubtleCrypto(),
): Promise<string> => {
  const bytes = toUint8Array(input);

  if (provider) {
    try {
      const digest = await provider.digest("SHA-256", toArrayBuffer(bytes));
      return bytesToHex(digest);
    } catch {
      // Fall through to the audited JS implementation when Web Crypto exists
      // but cannot digest in the current browser context.
    }
  }

  return bytesToHex(nobleSha256(bytes));
};

export const sha256Hex = (input: Sha256Input): Promise<string> =>
  sha256HexWithProvider(input);

export const sha256HexString = (value: string): Promise<string> =>
  sha256Hex(new TextEncoder().encode(value));
