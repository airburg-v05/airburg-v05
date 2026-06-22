import { V2_SCHEMA_VERSION, type TrackedProductRecord } from "../domain/models";
import { focusError } from "./dataset-update";
import { buildProductCandidates, productCandidateIds } from "./product-candidates";
import type {
  FocusDatasetMutation,
  FocusSaveResult,
  TrackedProductDraft,
} from "./contracts";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

const createId = (prefix: string): string => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

const normalizeDisplayName = (value: string | null): string | null => {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const validateDisplayName = (displayName: string | null): { valid: true; displayName: string | null } | FocusSaveResult => {
  const normalized = normalizeDisplayName(displayName);
  if (normalized && normalized.length > 60) {
    return focusError("validation_error", "展示名称最多 60 个字符。", ["tracked_display_name_too_long"]);
  }
  if (normalized && CONTROL_CHAR_PATTERN.test(normalized)) {
    return focusError("validation_error", "展示名称不能包含控制字符。", ["tracked_display_name_control_char"]);
  }
  return { valid: true, displayName: normalized };
};

export const createTrackedProductMutation = (draft: TrackedProductDraft): FocusDatasetMutation => ({
  dataset,
  platformCode,
  storeId,
  now,
}) => {
  const candidateIds = productCandidateIds(buildProductCandidates({ dataset, platformCode, storeId }));
  if (!candidateIds.has(draft.productId)) {
    return focusError("validation_error", "重点商品只能选择当前店铺已有商品。", ["tracked_product_cross_store"]);
  }

  const scopedProducts = dataset.trackedProducts.filter(
    (product) => product.platformCode === platformCode && product.storeId === storeId,
  );
  const duplicate = scopedProducts.find((product) => product.productId === draft.productId);
  if (duplicate) {
    return focusError(
      "validation_error",
      duplicate.status === "inactive"
        ? "当前商品已有停用记录，请重新启用原重点商品。"
        : "当前商品已经是重点商品。",
      ["tracked_product_duplicate"],
    );
  }

  const displayName = validateDisplayName(draft.displayName);
  if ("status" in displayName) return displayName;

  const next: TrackedProductRecord = {
    schemaVersion: V2_SCHEMA_VERSION,
    trackedProductId: createId("tracked"),
    platformCode,
    storeId,
    productId: draft.productId,
    displayName: displayName.displayName,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...dataset,
    trackedProducts: [...dataset.trackedProducts, next],
    activeDatasetPointer: null,
  };
};

export const updateTrackedProductMutation = (
  draft: TrackedProductDraft & { trackedProductId: string },
): FocusDatasetMutation => ({ dataset, platformCode, storeId, now }) => {
  const current = dataset.trackedProducts.find(
    (product) =>
      product.platformCode === platformCode &&
      product.storeId === storeId &&
      product.trackedProductId === draft.trackedProductId,
  );
  if (!current) return focusError("validation_error", "未找到当前店铺的重点商品。", ["tracked_product_missing"]);

  const displayName = validateDisplayName(draft.displayName);
  if ("status" in displayName) return displayName;

  return {
    ...dataset,
    trackedProducts: dataset.trackedProducts.map((product) =>
      product.platformCode === platformCode &&
      product.storeId === storeId &&
      product.trackedProductId === draft.trackedProductId
        ? {
            ...product,
            displayName: displayName.displayName,
            updatedAt: now,
          }
        : product,
    ),
    activeDatasetPointer: null,
  };
};

export const setTrackedProductStatusMutation = ({
  trackedProductId,
  status,
}: {
  trackedProductId: string;
  status: TrackedProductRecord["status"];
}): FocusDatasetMutation => ({ dataset, platformCode, storeId, now }) => {
  const current = dataset.trackedProducts.find(
    (product) =>
      product.platformCode === platformCode &&
      product.storeId === storeId &&
      product.trackedProductId === trackedProductId,
  );
  if (!current) return focusError("validation_error", "未找到当前店铺的重点商品。", ["tracked_product_missing"]);
  return {
    ...dataset,
    trackedProducts: dataset.trackedProducts.map((product) =>
      product.platformCode === platformCode &&
      product.storeId === storeId &&
      product.trackedProductId === trackedProductId
        ? { ...product, status, updatedAt: now }
        : product,
    ),
    activeDatasetPointer: null,
  };
};
