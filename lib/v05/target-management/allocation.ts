import type { TargetRecord, TargetScope } from "../domain/models";
import { getTargetMetricAllocationMode, normalizeParentTargetId } from "../target-hierarchy";
import type {
  BuildAllocationChildDraftInput,
  BuildTargetAllocationChildOptionsInput,
  TargetAllocationChildOption,
  TargetDraft,
} from "./contracts";
import { buildProductOptions } from "./options";

const childScopeForParent = (scope: TargetScope): Exclude<TargetScope, "company"> | null => {
  if (scope === "company") return "store";
  if (scope === "store") return "series";
  if (scope === "series") return "product";
  return null;
};

const targetMatchesChildOption = (
  target: TargetRecord,
  parentTarget: TargetRecord,
  childOption: TargetAllocationChildOption,
): boolean => {
  if (target.status === "deleted") return false;
  if (target.scope !== childOption.childScope) return false;
  if (target.metricKey !== parentTarget.metricKey) return false;
  if (target.periodType !== parentTarget.periodType || target.periodValue !== parentTarget.periodValue) return false;
  if (target.direction !== parentTarget.direction) return false;
  if (target.platformCode !== childOption.platformCode || target.storeId !== childOption.storeId) return false;
  if (childOption.childScope === "store") return true;
  if (childOption.childScope === "series") return target.seriesId === childOption.seriesId;
  return target.productId === childOption.productId;
};

const childAlreadyHasSameTarget = (
  targets: TargetRecord[],
  parentTarget: TargetRecord,
  childOption: TargetAllocationChildOption,
): boolean => targets.some((target) => targetMatchesChildOption(target, parentTarget, childOption));

export const buildTargetAllocationChildOptions = ({
  dataset,
  parentTarget,
}: BuildTargetAllocationChildOptionsInput): TargetAllocationChildOption[] => {
  if (parentTarget.status === "deleted") return [];
  if (getTargetMetricAllocationMode(parentTarget.metricKey) !== "sum") return [];

  const childScope = childScopeForParent(parentTarget.scope);
  if (!childScope) return [];

  if (childScope === "store") {
    return dataset.stores
      .filter((store) => store.status === "active")
      .map((store) => ({
        value: `store:${store.platformCode}:${store.storeId}`,
        childScope,
        label: store.storeName,
        description: `${store.platformCode} / ${store.storeId}`,
        platformCode: store.platformCode,
        storeId: store.storeId,
      }))
      .filter((option) => !childAlreadyHasSameTarget(dataset.targets, parentTarget, option))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN") || left.value.localeCompare(right.value));
  }

  if (!parentTarget.platformCode || !parentTarget.storeId) return [];

  if (childScope === "series") {
    return dataset.series
      .filter((series) => series.status === "active")
      .filter((series) => series.platformCode === parentTarget.platformCode && series.storeId === parentTarget.storeId)
      .map((series) => ({
        value: `series:${series.platformCode}:${series.storeId}:${series.seriesId}`,
        childScope,
        label: series.name,
        description: `系列商品 ${series.productIds.length} 个`,
        platformCode: series.platformCode,
        storeId: series.storeId,
        seriesId: series.seriesId,
      }))
      .filter((option) => !childAlreadyHasSameTarget(dataset.targets, parentTarget, option))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN") || left.value.localeCompare(right.value));
  }

  if (!parentTarget.seriesId) return [];

  const parentSeries = dataset.series.find(
    (series) =>
      series.platformCode === parentTarget.platformCode &&
      series.storeId === parentTarget.storeId &&
      series.seriesId === parentTarget.seriesId,
  );
  if (!parentSeries) return [];

  const productOptionsById = new Map(
    buildProductOptions(dataset)
      .filter((product) => product.platformCode === parentTarget.platformCode && product.storeId === parentTarget.storeId)
      .map((product) => [product.productId, product]),
  );

  return parentSeries.productIds
    .map((productId) => {
      const product = productOptionsById.get(productId);
      return {
        value: `product:${parentTarget.platformCode}:${parentTarget.storeId}:${parentSeries.seriesId}:${productId}`,
        childScope,
        label: product?.label ?? productId,
        description: product ? `${product.productId} / ${product.dataLabel}` : `${productId} / 当前商品事实缺失`,
        platformCode: parentTarget.platformCode!,
        storeId: parentTarget.storeId!,
        seriesId: parentSeries.seriesId,
        productId,
      } satisfies TargetAllocationChildOption;
    })
    .filter((option) => !childAlreadyHasSameTarget(dataset.targets, parentTarget, option))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN") || left.productId!.localeCompare(right.productId!));
};

export const buildAllocationChildDraft = ({
  parentTarget,
  childOption,
  targetValue,
}: BuildAllocationChildDraftInput): TargetDraft => ({
  scope: childOption.childScope,
  parentTargetId: parentTarget.targetId,
  platformCode: childOption.platformCode,
  storeId: childOption.storeId,
  seriesId: childOption.childScope === "series" ? childOption.seriesId : undefined,
  productId: childOption.childScope === "product" ? childOption.productId : undefined,
  periodType: parentTarget.periodType,
  periodValue: parentTarget.periodValue,
  metricKey: parentTarget.metricKey,
  targetValue,
  direction: parentTarget.direction,
});

export const parentTargetCanAllocate = (target: TargetRecord): boolean =>
  target.scope !== "product" &&
  target.status !== "deleted" &&
  normalizeParentTargetId(target) !== target.targetId &&
  getTargetMetricAllocationMode(target.metricKey) === "sum";
