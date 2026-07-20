import { sha256Hex, sha256HexString } from "../shared/sha256-provider";

export const sha256ArrayBuffer = async (buffer: ArrayBuffer): Promise<string> => {
  return sha256Hex(buffer);
};

export const sha256String = async (value: string): Promise<string> =>
  sha256HexString(value);

export const sha256File = async (file: File): Promise<string> =>
  sha256ArrayBuffer(await file.arrayBuffer());
