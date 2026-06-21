import type { TmallSourceType } from "../../../types/tmall";
import { parseTmallTableFile } from "../../tmall/parsers/table-parser";
import {
  V05_IMPORT_SOURCE_LABELS,
  V05_IMPORT_SOURCE_TYPES,
  type V05BatchDetectedFile,
  type V05BatchDetectionResult,
} from "./contracts";

const acceptedExtensions = new Set(["csv", "xls", "xlsx"]);

const extensionOf = (filename: string): string =>
  filename.split(".").pop()?.toLowerCase() ?? "";

const fileTemporaryId = (file: File, index: number): string =>
  `${index + 1}:${file.name}:${file.size}:${file.lastModified}`;

const sourceLabel = (sourceType: TmallSourceType | "unknown"): string =>
  sourceType === "unknown" ? "未识别来源" : V05_IMPORT_SOURCE_LABELS[sourceType];

const duplicateMessage = (sourceType: TmallSourceType): string =>
  `${V05_IMPORT_SOURCE_LABELS[sourceType]} 本次只能选择一个文件，请保留正确文件后重新选择。`;

export const detectV05TmallBatchFiles = async (files: File[]): Promise<V05BatchDetectionResult> => {
  const parsed = await Promise.all(
    files.map(async (file, index): Promise<V05BatchDetectedFile> => {
      if (!acceptedExtensions.has(extensionOf(file.name))) {
        return {
          temporaryId: fileTemporaryId(file, index),
          file,
          fileName: file.name,
          fileSize: file.size,
          status: "error",
          detectedSourceType: "unknown",
          sourceType: null,
          sourceLabel: "不支持的文件",
          rowCount: null,
          headerRowNumber: null,
          missingRequiredFields: [],
          error: "仅支持 CSV、XLS、XLSX 文件。",
        };
      }

      try {
        const table = await parseTmallTableFile(file);
        const detectedSourceType = table.detectedSourceType;
        const missingRequiredFields = table.missingRequiredFields;
        const sourceType = detectedSourceType === "unknown" ? null : detectedSourceType;
        const hasMissingFields = missingRequiredFields.length > 0;

        return {
          temporaryId: fileTemporaryId(file, index),
          file,
          fileName: file.name,
          fileSize: file.size,
          status: detectedSourceType === "unknown" || hasMissingFields ? "unknown" : "identified",
          detectedSourceType,
          sourceType,
          sourceLabel: sourceLabel(detectedSourceType),
          rowCount: table.rows.length,
          headerRowNumber: table.headerRowNumber,
          missingRequiredFields,
          error: hasMissingFields
            ? `缺少必需字段：${missingRequiredFields.join("、")}。`
            : detectedSourceType === "unknown"
              ? "未识别为天猫四源报表，请检查导出文件。"
              : null,
        };
      } catch {
        return {
          temporaryId: fileTemporaryId(file, index),
          file,
          fileName: file.name,
          fileSize: file.size,
          status: "error",
          detectedSourceType: "unknown",
          sourceType: null,
          sourceLabel: "读取失败",
          rowCount: null,
          headerRowNumber: null,
          missingRequiredFields: [],
          error: "文件读取失败，请重新导出后再选择。",
        };
      }
    }),
  );

  const countsBySource = new Map<TmallSourceType, number>();
  parsed.forEach((item) => {
    if (!item.sourceType || item.status !== "identified") return;
    countsBySource.set(item.sourceType, (countsBySource.get(item.sourceType) ?? 0) + 1);
  });

  const duplicateSourceTypes = V05_IMPORT_SOURCE_TYPES.filter(
    (sourceType) => (countsBySource.get(sourceType) ?? 0) > 1,
  ) as TmallSourceType[];

  const filesWithDuplicateState = parsed.map((item) => {
    if (!item.sourceType || !duplicateSourceTypes.includes(item.sourceType)) return item;
    return {
      ...item,
      status: "duplicate" as const,
      error: duplicateMessage(item.sourceType),
    };
  });

  const filesBySourceType: Partial<Record<TmallSourceType, File>> = {};
  filesWithDuplicateState.forEach((item) => {
    if (!item.sourceType || item.status !== "identified") return;
    filesBySourceType[item.sourceType] = item.file;
  });

  const missingSourceTypes = V05_IMPORT_SOURCE_TYPES.filter(
    (sourceType) => !filesBySourceType[sourceType],
  ) as TmallSourceType[];
  const unknownFileCount = filesWithDuplicateState.filter((item) => item.status === "unknown").length;
  const errorFileCount = filesWithDuplicateState.filter((item) => item.status === "error").length;

  const blockingReasons = [
    missingSourceTypes.length > 0
      ? `还缺少：${missingSourceTypes.map((sourceType) => V05_IMPORT_SOURCE_LABELS[sourceType]).join("、")}。`
      : null,
    duplicateSourceTypes.length > 0
      ? `存在重复来源：${duplicateSourceTypes.map((sourceType) => V05_IMPORT_SOURCE_LABELS[sourceType]).join("、")}。`
      : null,
    unknownFileCount > 0 ? "存在未识别文件，请移除或重新选择。" : null,
    errorFileCount > 0 ? "存在读取失败文件，请移除或重新选择。" : null,
  ].filter((reason): reason is string => !!reason);

  return {
    files: filesWithDuplicateState,
    filesBySourceType,
    missingSourceTypes,
    duplicateSourceTypes,
    unknownFileCount,
    errorFileCount,
    canImport: blockingReasons.length === 0,
    blockingReasons,
  };
};
