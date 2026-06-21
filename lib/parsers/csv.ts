import Papa from "papaparse";
import { buildParseResult, type ParseResult } from "@/lib/parsers/shared";

const decodeBuffer = (buffer: ArrayBuffer): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("gb18030").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
};

export const parseCSV = async (file: File): Promise<ParseResult> => {
  const buffer = await file.arrayBuffer();
  const text = decodeBuffer(buffer);

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: false,
      skipEmptyLines: false,
      complete: (result: { data: unknown[][]; errors?: Array<{ message: string }> }) => {
        if (result.errors?.length) {
          const fatalError = result.errors.find((item) => item.message);
          if (fatalError && result.data.length === 0) {
            reject(new Error(`CSV 解析失败：${fatalError.message}`));
            return;
          }
        }

        resolve(buildParseResult(result.data ?? []));
      },
      error: (error: Error) => reject(error),
    });
  });
};
