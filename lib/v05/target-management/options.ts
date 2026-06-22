import type { PlatformCode, TargetDirection, TargetRecord, TargetScope, V2Dataset } from "../domain/models";
import {
  getTargetMetricAllocationMode,
  normalizeParentTargetId,
  type TargetAllocationMode,
} from "../target-hierarchy";
import type {
  BuildTargetParentOptionsInput,
  TargetDraft,
  TargetMetricOption,
  TargetParentOption,
  TargetProductOption,
  TargetSeriesOption,
  TargetStoreOption,
} from "./contracts";

const platformLabel = (platformCode: PlatformCode): string => {
  if (platformCode === "tmall") return "天猫";
  if (platformCode === "jd") return "京东";
  if (platformCode === "pdd") return "拼多多";
  if (platformCode === "douyin") return "抖音";
  if (platformCode === "youzan") return "有赞";
  return platformCode;
};

export const TARGET_METRIC_OPTIONS: TargetMetricOption[] = [
  { key: "gmv", label: "GMV", direction: "higher_is_better", allocationMode: "sum" },
  { key: "gsv", label: "GSV", direction: "higher_is_better", allocationMode: "sum" },
  { key: "visitors", label: "商品访客数", direction: "higher_is_better", allocationMode: "sum" },
  { key: "paidBuyers", label: "支付买家数", direction: "higher_is_better", allocationMode: "sum" },
  { key: "conversionRate", label: "支付转化率", direction: "higher_is_better", allocationMode: "none" },
  { key: "avgOrderValue", label: "客单价", direction: "higher_is_better", allocationMode: "none" },
  { key: "refundRate", label: "退款率", direction: "lower_is_better", allocationMode: "none" },
  { key: "adSpend", label: "推广花费", direction: "lower_is_better", allocationMode: "sum" },
  { key: "adRoi", label: "推广 ROI", direction: "higher_is_better", allocationMode: "none" },
  { key: "adSpendRate", label: "推广费比", direction: "lower_is_better", allocationMode: "none" },
  { key: "adSpendRateAfterRefund", label: "去退推广费比", direction: "lower_is_better", allocationMode: "none" },
  { key: "refundSuccessAmount", label: "成功退款金额", direction: "lower_is_better", allocationMode: "sum" },
];

export const targetMetricLabel = (metricKey: string): string =>
  TARGET_METRIC_OPTIONS.find((option) => option.key === metricKey)?.label ?? metricKey;

export const targetScopeLabel = (scope: TargetScope): string => {
  if (scope === "company") return "公司";
  if (scope === "store") return "店铺";
  if (scope === "series") return "系列";
  return "商品";
};

export const targetDirectionLabel = (direction: TargetDirection): string =>
  direction === "higher_is_better" ? "越高越好" : "越低越好";

export const buildStoreOptions = (dataset: V2Dataset): TargetStoreOption[] =>
  dataset.stores
    .map((store) => ({
      value: `${store.platformCode}:${store.storeId}`,
      platformCode: store.platformCode,
      storeId: store.storeId,
      label: `${platformLabel(store.platformCode)} / ${store.storeName}`,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));

export const buildSeriesOptions = (dataset: V2Dataset): TargetSeriesOption[] =>
  dataset.series
    .map((series) => ({
      value: `${series.platformCode}:${series.storeId}:${series.seriesId}`,
      platformCode: series.platformCode,
      storeId: series.storeId,
      seriesId: series.seriesId,
      label: `${series.name}${series.status === "inactive" ? "（停用）" : ""}`,
      status: series.status,
    }))
    .sort((left, right) =>
      left.platformCode.localeCompare(right.platformCode) ||
      left.storeId.localeCompare(right.storeId) ||
      left.label.localeCompare(right.label, "zh-CN"),
    );

export const buildProductOptions = (dataset: V2Dataset): TargetProductOption[] => {
  const products = new Map<string, TargetProductOption>();
  dataset.businessProductFacts.forEach((fact) => {
    const key = `${fact.platformCode}:${fact.storeId}:${fact.productId}`;
    const label = fact.productName?.trim() || fact.productId;
    products.set(key, {
      value: key,
      platformCode: fact.platformCode,
      storeId: fact.storeId,
      productId: fact.productId,
      label,
      dataLabel: "有经营数据",
      searchText: `${label} ${fact.productId}`.toLowerCase(),
    });
  });
  dataset.adProductFacts.forEach((fact) => {
    const key = `${fact.platformCode}:${fact.storeId}:${fact.productId}`;
    if (products.has(key)) return;
    products.set(key, {
      value: key,
      platformCode: fact.platformCode,
      storeId: fact.storeId,
      productId: fact.productId,
      label: fact.productId,
      dataLabel: "仅推广数据",
      searchText: fact.productId.toLowerCase(),
    });
  });

  return [...products.values()].sort((left, right) =>
    left.platformCode.localeCompare(right.platformCode) ||
    left.storeId.localeCompare(right.storeId) ||
    left.label.localeCompare(right.label, "zh-CN") ||
    left.productId.localeCompare(right.productId),
  );
};

const directParentScope = (scope: TargetScope): TargetScope | null => {
  if (scope === "store") return "company";
  if (scope === "series") return "store";
  if (scope === "product") return "series";
  return null;
};

const parentOwnerMatches = (parent: TargetRecord, draft: TargetDraft, seriesById: Map<string, Set<string>>): boolean => {
  if (draft.scope === "store") return parent.scope === "company";
  if (draft.scope === "series") {
    return parent.platformCode === draft.platformCode && parent.storeId === draft.storeId;
  }
  if (draft.scope === "product") {
    if (parent.platformCode !== draft.platformCode || parent.storeId !== draft.storeId) return false;
    if (!draft.productId || !parent.seriesId) return true;
    return seriesById.get(`${parent.platformCode}:${parent.storeId}:${parent.seriesId}`)?.has(draft.productId) ?? false;
  }
  return false;
};

const parentLabel = (target: TargetRecord): string => {
  const metric = targetMetricLabel(target.metricKey);
  if (target.scope === "company") return `公司目标 / ${metric} / ${target.periodValue}`;
  if (target.scope === "store") return `店铺目标 / ${target.storeId ?? "--"} / ${metric} / ${target.periodValue}`;
  if (target.scope === "series") return `系列目标 / ${target.seriesId ?? "--"} / ${metric} / ${target.periodValue}`;
  return `商品目标 / ${target.productId ?? "--"} / ${metric} / ${target.periodValue}`;
};

export const buildTargetParentOptions = ({
  targets,
  series,
  draft,
}: BuildTargetParentOptionsInput): TargetParentOption[] => {
  const noneOption: TargetParentOption = {
    value: "",
    label: "不绑定父目标（独立目标）",
    description: "作为 standalone 目标保存，不参与父子分配。",
  };
  const parentScope = directParentScope(draft.scope);
  if (!parentScope) return [noneOption];

  const seriesById = new Map(
    series.map((item) => [`${item.platformCode}:${item.storeId}:${item.seriesId}`, new Set(item.productIds)]),
  );
  const allocationMode: TargetAllocationMode = getTargetMetricAllocationMode(draft.metricKey);
  if (allocationMode !== "sum") return [noneOption];

  const legalParents = targets
    .filter((target) => target.targetId !== draft.targetId)
    .filter((target) => target.status !== "deleted")
    .filter((target) => target.scope === parentScope)
    .filter((target) => target.metricKey === draft.metricKey)
    .filter((target) => target.periodType === draft.periodType && target.periodValue === draft.periodValue)
    .filter((target) => target.direction === draft.direction)
    .filter((target) => parentOwnerMatches(target, draft, seriesById))
    .sort((left, right) => parentLabel(left).localeCompare(parentLabel(right), "zh-CN"))
    .map((target) => ({
      value: target.targetId,
      label: parentLabel(target),
      description: `父级 ${targetScopeLabel(target.scope)}，当前状态：${target.status === "paused" ? "暂停" : "启用"}`,
    }));

  const currentParentId = normalizeParentTargetId(draft);
  if (currentParentId && !legalParents.some((option) => option.value === currentParentId)) {
    return [
      noneOption,
      {
        value: currentParentId,
        label: "当前父目标不可用",
        description: "该父目标不再满足直接父级、口径或归属规则，请重新选择。",
      },
      ...legalParents,
    ];
  }

  return [noneOption, ...legalParents];
};
