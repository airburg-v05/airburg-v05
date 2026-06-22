import type { TargetRecord, V2Dataset } from "../domain/models";
import { buildTargetAllocationSummary, normalizeParentTargetId } from "../target-hierarchy";
import type {
  BuildTargetManagementViewModelInput,
  TargetManagementViewModel,
  TargetRowViewModel,
} from "./contracts";
import { buildTargetAllocationChildOptions } from "./allocation";
import {
  TARGET_METRIC_OPTIONS,
  buildProductOptions,
  buildSeriesOptions,
  buildStoreOptions,
  targetMetricLabel,
  targetScopeLabel,
} from "./options";

export const buildEmptyTargetManagementViewModel = (notice: string): TargetManagementViewModel => ({
  mode: "empty",
  datasetId: null,
  expectedCurrentDatasetId: null,
  stores: [],
  seriesOptions: [],
  productOptions: [],
  dailyPeriodOptions: [],
  monthlyPeriodOptions: [],
  targets: [],
  rawTargets: [],
  rawSeries: [],
  metricOptions: TARGET_METRIC_OPTIONS,
  notices: [notice],
  primaryActions: [{ label: "数据导入", href: "/upload" }],
  isEmpty: true,
});

const formatNumber = (value: number): string =>
  Number.isFinite(value)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)
    : "--";

const periodLabel = (target: TargetRecord): string =>
  target.periodType === "daily" ? `日目标 ${target.periodValue}` : `月目标 ${target.periodValue}`;

const ownerLabel = (target: TargetRecord, dataset: V2Dataset): string => {
  if (target.scope === "company") return "公司整体";
  const store = dataset.stores.find((item) => item.platformCode === target.platformCode && item.storeId === target.storeId);
  if (target.scope === "store") return store?.storeName ?? target.storeId ?? "--";
  if (target.scope === "series") {
    const series = dataset.series.find(
      (item) => item.platformCode === target.platformCode && item.storeId === target.storeId && item.seriesId === target.seriesId,
    );
    return `${store?.storeName ?? target.storeId ?? "--"} / ${series?.name ?? target.seriesId ?? "--"}`;
  }
  const productName = dataset.businessProductFacts.find(
    (fact) => fact.platformCode === target.platformCode && fact.storeId === target.storeId && fact.productId === target.productId,
  )?.productName;
  return `${store?.storeName ?? target.storeId ?? "--"} / ${productName?.trim() || target.productId || "--"}`;
};

const parentLabel = (target: TargetRecord, parentById: Map<string, TargetRecord>, dataset: V2Dataset): string => {
  const parentId = normalizeParentTargetId(target);
  if (!parentId) return "独立目标";
  const parent = parentById.get(parentId);
  if (!parent) return "父目标缺失";
  return `${targetScopeLabel(parent.scope)} / ${ownerLabel(parent, dataset)} / ${targetMetricLabel(parent.metricKey)}`;
};

const statusLabel = (status: TargetRecord["status"]): string => {
  if (status === "active") return "启用";
  if (status === "paused") return "暂停";
  return "已删除";
};

const rowSortKey = (target: TargetRecord): string =>
  [
    ["company", "store", "series", "product"].indexOf(target.scope),
    target.platformCode ?? "",
    target.storeId ?? "",
    target.seriesId ?? "",
    target.productId ?? "",
    target.metricKey,
    target.periodType,
    target.periodValue,
    target.targetId,
  ].join("::");

const buildTargetRows = (dataset: V2Dataset): TargetRowViewModel[] => {
  const parentById = new Map(dataset.targets.map((target) => [target.targetId, target]));
  return [...dataset.targets]
    .sort((left, right) => rowSortKey(left).localeCompare(rowSortKey(right), "zh-CN"))
    .map((target) => ({
      target,
      scopeLabel: targetScopeLabel(target.scope),
      ownerLabel: ownerLabel(target, dataset),
      parentLabel: parentLabel(target, parentById, dataset),
      metricLabel: targetMetricLabel(target.metricKey),
      periodLabel: periodLabel(target),
      valueLabel: formatNumber(target.targetValue),
      statusLabel: statusLabel(target.status),
      allocationSummary:
        target.status === "deleted"
          ? null
          : buildTargetAllocationSummary({
              parentTarget: target,
              childTargets: dataset.targets,
            }),
      allocationChildOptions: buildTargetAllocationChildOptions({ dataset, parentTarget: target }),
    }));
};

const buildDailyPeriodOptions = (dataset: V2Dataset): string[] =>
  Array.from(
    new Set([
      ...dataset.businessProductFacts.map((fact) => fact.businessDate),
      ...dataset.adProductFacts.map((fact) => fact.businessDate),
      ...dataset.adPlanFacts.map((fact) => fact.businessDate),
      ...dataset.afterSalesDailyAggregates.map((fact) => fact.businessDate),
    ]),
  )
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((left, right) => right.localeCompare(left));

const buildMonthlyPeriodOptions = (dailyPeriods: string[]): string[] =>
  Array.from(new Set(dailyPeriods.map((date) => date.slice(0, 7)))).sort((left, right) => right.localeCompare(left));

export const buildTargetManagementViewModel = ({
  dataset,
  expectedCurrentDatasetId,
}: BuildTargetManagementViewModelInput): TargetManagementViewModel => {
  const rows = buildTargetRows(dataset);
  const dailyPeriodOptions = buildDailyPeriodOptions(dataset);
  return {
    mode: "ready",
    datasetId: dataset.datasetId,
    expectedCurrentDatasetId,
    stores: buildStoreOptions(dataset),
    seriesOptions: buildSeriesOptions(dataset),
    productOptions: buildProductOptions(dataset),
    dailyPeriodOptions,
    monthlyPeriodOptions: buildMonthlyPeriodOptions(dailyPeriodOptions),
    targets: rows,
    rawTargets: [...dataset.targets].sort((left, right) => rowSortKey(left).localeCompare(rowSortKey(right), "zh-CN")),
    rawSeries: [...dataset.series],
    metricOptions: TARGET_METRIC_OPTIONS,
    notices: rows.length === 0 ? ["当前 active V2 数据中还没有目标。"] : [],
    primaryActions: [
      { label: "数据导入", href: "/upload" },
      { label: "首页", href: "/home" },
    ],
    isEmpty: rows.length === 0,
  };
};
