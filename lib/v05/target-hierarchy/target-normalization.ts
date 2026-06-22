import type { StoreScope, TargetRecord } from "../domain/models";

export const normalizeParentTargetId = (target: Pick<TargetRecord, "parentTargetId">): string | null =>
  target.parentTargetId ?? null;

export const isDeletedTarget = (target: Pick<TargetRecord, "status">): boolean =>
  target.status === "deleted";

export const isActiveTarget = (target: Pick<TargetRecord, "status">): boolean =>
  target.status === "active";

export const isPausedTarget = (target: Pick<TargetRecord, "status">): boolean =>
  target.status === "paused";

export const targetStoreOwner = (target: Pick<TargetRecord, "platformCode" | "storeId">): StoreScope | null =>
  target.platformCode && target.storeId
    ? { platformCode: target.platformCode, storeId: target.storeId }
    : null;

export const sameStoreOwner = (
  left: Pick<TargetRecord, "platformCode" | "storeId">,
  right: Pick<TargetRecord, "platformCode" | "storeId">,
): boolean =>
  left.platformCode === right.platformCode && left.storeId === right.storeId;
