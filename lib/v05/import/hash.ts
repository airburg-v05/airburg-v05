const HEX_BYTE_PAD = 2;

const bytesToHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(HEX_BYTE_PAD, "0"))
    .join("");

const getSubtleCrypto = (): SubtleCrypto => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("hash_provider_unavailable");
  return subtle;
};

export const sha256ArrayBuffer = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await getSubtleCrypto().digest("SHA-256", buffer);
  return bytesToHex(digest);
};

export const sha256String = async (value: string): Promise<string> =>
  sha256ArrayBuffer(new TextEncoder().encode(value).buffer);

export const sha256File = async (file: File): Promise<string> =>
  sha256ArrayBuffer(await file.arrayBuffer());
