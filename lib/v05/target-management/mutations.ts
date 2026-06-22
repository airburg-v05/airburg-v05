import { V2_SCHEMA_VERSION, type TargetRecord } from "../domain/models";
import { buildTargetParentOptions } from "./options";
import type { TargetDatasetMutation, TargetDraft, TargetSaveResult } from "./contracts";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export const targetError = (
  status: TargetSaveResult["status"],
  message: string,
  issueCodes: string[] = [],
): TargetSaveResult => ({
  status,
  message,
  datasetId: null,
  issueCodes,
});

const createTargetId = (): string => {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `target_${random.replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

const trimOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const validatePeriodValue = (periodType: TargetDraft["periodType"], value: string): boolean => {
  const normalized = value.trim();
  if (CONTROL_CHAR_PATTERN.test(normalized)) return false;
  return periodType === "daily" ? /^\d{4}-\d{2}-\d{2}$/.test(normalized) : /^\d{4}-\d{2}$/.test(normalized);
};

const hasRequiredOwner = (draft: TargetDraft): boolean => {
  if (draft.scope === "company") return true;
  if (!draft.platformCode || !draft.storeId) return false;
  if (draft.scope === "store") return true;
  if (draft.scope === "series") return !!draft.seriesId;
  return !!draft.productId;
};

const isTargetSaveResult = (value: TargetRecord | TargetSaveResult): value is TargetSaveResult =>
  value.status === "success" ||
  value.status === "conflict" ||
  value.status === "validation_error" ||
  value.status === "empty" ||
  value.status === "error";

const normalizeTargetDraft = ({
  draft,
  existingTarget,
  now,
}: {
  draft: TargetDraft;
  existingTarget?: TargetRecord;
  now: string;
}): TargetRecord | TargetSaveResult => {
  if (!draft.metricKey.trim()) {
    return targetError("validation_error", "请选择目标指标。", ["target_metric_required"]);
  }
  if (!validatePeriodValue(draft.periodType, draft.periodValue)) {
    return targetError("validation_error", "目标周期格式不正确。", ["target_period_invalid"]);
  }
  if (!Number.isFinite(draft.targetValue) || draft.targetValue <= 0) {
    return targetError("validation_error", "目标值必须大于 0。", ["target_value_invalid"]);
  }
  if (!hasRequiredOwner(draft)) {
    return targetError("validation_error", "请先选择目标归属。", ["target_owner_required"]);
  }

  const base = {
    schemaVersion: V2_SCHEMA_VERSION,
    targetId: existingTarget?.targetId ?? draft.targetId ?? createTargetId(),
    scope: draft.scope,
    parentTargetId: draft.parentTargetId,
    periodType: draft.periodType,
    periodValue: draft.periodValue.trim(),
    metricKey: draft.metricKey.trim(),
    targetValue: draft.targetValue,
    direction: draft.direction,
    status: existingTarget?.status ?? "active",
    createdAt: existingTarget?.createdAt ?? now,
    updatedAt: now,
  } satisfies Omit<TargetRecord, "platformCode" | "storeId" | "seriesId" | "productId">;

  if (draft.scope === "company") return base;

  const platformCode = draft.platformCode;
  const storeId = trimOptional(draft.storeId);
  if (!platformCode || !storeId) {
    return targetError("validation_error", "店铺目标必须选择平台和店铺。", ["target_store_required"]);
  }
  if (draft.scope === "store") {
    return { ...base, platformCode, storeId };
  }
  if (draft.scope === "series") {
    const seriesId = trimOptional(draft.seriesId);
    if (!seriesId) return targetError("validation_error", "系列目标必须选择系列。", ["target_series_required"]);
    return { ...base, platformCode, storeId, seriesId };
  }
  const productId = trimOptional(draft.productId);
  if (!productId) return targetError("validation_error", "商品目标必须选择商品。", ["target_product_required"]);
  return { ...base, platformCode, storeId, productId };
};

export const upsertTargetMutation = (draft: TargetDraft): TargetDatasetMutation => ({ dataset, now }) => {
  const existingTarget = draft.targetId ? dataset.targets.find((target) => target.targetId === draft.targetId) : undefined;
  if (draft.targetId && !existingTarget) {
    return targetError("validation_error", "未找到要编辑的目标。", ["target_missing"]);
  }

  const parentOptions = buildTargetParentOptions({
    targets: dataset.targets,
    series: dataset.series,
    draft,
  });
  const selectedParentOption = parentOptions.find((option) => option.value === draft.parentTargetId);
  const parentAllowed =
    draft.parentTargetId === null ||
    (selectedParentOption !== undefined && selectedParentOption.label !== "当前父目标不可用");
  if (!parentAllowed) {
    return targetError("validation_error", "父目标不符合当前 scope、归属和口径规则。", ["target_parent_invalid"]);
  }

  const target = normalizeTargetDraft({ draft, existingTarget, now });
  if (isTargetSaveResult(target)) return target;

  return {
    ...dataset,
    targets: existingTarget
      ? dataset.targets.map((item) => (item.targetId === existingTarget.targetId ? target : item))
      : [...dataset.targets, target],
    activeDatasetPointer: null,
  };
};

export const setTargetStatusMutation = ({
  targetId,
  status,
}: {
  targetId: string;
  status: "active" | "paused";
}): TargetDatasetMutation => ({ dataset, now }) => {
  const target = dataset.targets.find((item) => item.targetId === targetId);
  if (!target) return targetError("validation_error", "未找到目标。", ["target_missing"]);
  if (target.status === "deleted") {
    return targetError("validation_error", "已删除目标不能在本页重新启用。", ["target_deleted"]);
  }
  return {
    ...dataset,
    targets: dataset.targets.map((item) =>
      item.targetId === targetId
        ? {
            ...item,
            status,
            updatedAt: now,
          }
        : item,
    ),
    activeDatasetPointer: null,
  };
};
