import { V2_SCHEMA_VERSION, type SeriesRecord } from "../domain/models";
import { buildProductCandidates, productCandidateIds } from "./product-candidates";
import { focusError } from "./dataset-update";
import type { FocusDatasetMutation, FocusSaveResult, SeriesDraft } from "./contracts";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

const normalizeSeriesName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");

const cleanName = (value: string): string => value.trim().replace(/\s+/g, " ");

const unique = (values: string[]): string[] => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const createId = (prefix: string): string => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

const validateSeriesDraft = ({
  existingSeries,
  draft,
  currentSeriesId,
}: {
  existingSeries: SeriesRecord[];
  draft: SeriesDraft;
  currentSeriesId?: string;
}): { valid: true; name: string; productIds: string[] } | FocusSaveResult => {
  const name = cleanName(draft.name);
  if (name.length < 2 || name.length > 40) {
    return focusError("validation_error", "系列名称需为 2 到 40 个字符。", ["series_name_invalid"]);
  }
  if (CONTROL_CHAR_PATTERN.test(name)) {
    return focusError("validation_error", "系列名称不能包含控制字符。", ["series_name_control_char"]);
  }

  const normalized = normalizeSeriesName(name);
  const duplicate = existingSeries.find(
    (series) => series.seriesId !== currentSeriesId && normalizeSeriesName(series.name) === normalized,
  );
  if (duplicate) {
    return focusError(
      "validation_error",
      duplicate.status === "inactive"
        ? "同店铺已有停用的同名系列，请重新启用或换一个名称。"
        : "同店铺已有同名系列，请换一个名称。",
      ["series_name_duplicate"],
    );
  }

  return { valid: true, name, productIds: unique(draft.productIds) };
};

export const createSeriesMutation = (draft: SeriesDraft): FocusDatasetMutation => ({
  dataset,
  platformCode,
  storeId,
  now,
}) => {
  const scopedSeries = dataset.series.filter(
    (series) => series.platformCode === platformCode && series.storeId === storeId,
  );
  const validation = validateSeriesDraft({ existingSeries: scopedSeries, draft });
  if ("status" in validation) return validation;

  const candidateIds = productCandidateIds(buildProductCandidates({ dataset, platformCode, storeId }));
  const invalidProductIds = validation.productIds.filter((productId) => !candidateIds.has(productId));
  if (invalidProductIds.length > 0) {
    return focusError("validation_error", "系列只能添加当前店铺已有商品。", ["series_product_cross_store"]);
  }

  const next: SeriesRecord = {
    schemaVersion: V2_SCHEMA_VERSION,
    seriesId: createId("series"),
    platformCode,
    storeId,
    name: validation.name,
    productIds: validation.productIds,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...dataset,
    series: [...dataset.series, next],
    activeDatasetPointer: null,
  };
};

export const updateSeriesMutation = (draft: SeriesDraft & { seriesId: string }): FocusDatasetMutation => ({
  dataset,
  platformCode,
  storeId,
  now,
}) => {
  const scopedSeries = dataset.series.filter(
    (series) => series.platformCode === platformCode && series.storeId === storeId,
  );
  const current = scopedSeries.find((series) => series.seriesId === draft.seriesId);
  if (!current) return focusError("validation_error", "未找到当前店铺的系列。", ["series_missing"]);

  const validation = validateSeriesDraft({
    existingSeries: scopedSeries,
    draft,
    currentSeriesId: draft.seriesId,
  });
  if ("status" in validation) return validation;

  const candidateIds = productCandidateIds(buildProductCandidates({ dataset, platformCode, storeId }));
  const invalidProductIds = validation.productIds.filter((productId) => !candidateIds.has(productId));
  if (invalidProductIds.length > 0) {
    return focusError("validation_error", "系列只能添加当前店铺已有商品。", ["series_product_cross_store"]);
  }

  return {
    ...dataset,
    series: dataset.series.map((series) =>
      series.platformCode === platformCode && series.storeId === storeId && series.seriesId === draft.seriesId
        ? {
            ...series,
            name: validation.name,
            productIds: validation.productIds,
            updatedAt: now,
          }
        : series,
    ),
    activeDatasetPointer: null,
  };
};

export const setSeriesStatusMutation = ({
  seriesId,
  status,
}: {
  seriesId: string;
  status: SeriesRecord["status"];
}): FocusDatasetMutation => ({ dataset, platformCode, storeId, now }) => {
  const current = dataset.series.find(
    (series) => series.platformCode === platformCode && series.storeId === storeId && series.seriesId === seriesId,
  );
  if (!current) return focusError("validation_error", "未找到当前店铺的系列。", ["series_missing"]);
  return {
    ...dataset,
    series: dataset.series.map((series) =>
      series.platformCode === platformCode && series.storeId === storeId && series.seriesId === seriesId
        ? { ...series, status, updatedAt: now }
        : series,
    ),
    activeDatasetPointer: null,
  };
};
