import {
  buildTmallTargetProgress,
  getTmallTargetMetricDefinition,
  type TmallTargetProgress,
} from "./targets";
import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";
import type { TmallAnalysisDisplayResult } from "../../../types/tmall";
import type {
  TmallTargetDefinition,
  TmallTargetMetricKey,
  TmallTargetPeriodType,
  TmallTargetScope,
  TmallTargetStatus,
} from "../../../types/tmall-targets";

export interface TmallStoreTargetFormValues {
  name: string;
  periodType: TmallTargetPeriodType;
  periodValue: string;
  metricKey: TmallTargetMetricKey;
  targetValue: number;
  status: TmallTargetStatus;
}

export type TmallTargetFormScope = Extract<TmallTargetScope, "store" | "product" | "series">;

export interface TmallTargetFormValues extends TmallStoreTargetFormValues {
  scope: TmallTargetFormScope;
  productId?: string;
  seriesId?: string;
}

export interface TmallTargetProductOption {
  productId: string;
  productName: string;
  gmv: number;
  visitors: number;
  paidBuyers: number;
}

export interface TmallTargetSeriesOption {
  seriesId: string;
  seriesName: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TmallTargetPageViewModel {
  storeTargets: TmallTargetDefinition[];
  productTargets: TmallTargetDefinition[];
  seriesTargets: TmallTargetDefinition[];
  nonStoreTargets: TmallTargetDefinition[];
  storeProgressItems: TmallTargetProgress[];
  productProgressItems: TmallTargetProgress[];
  seriesProgressItems: TmallTargetProgress[];
  progressItems: TmallTargetProgress[];
  unsupportedTargetCount: number;
  productOptions: TmallTargetProductOption[];
  seriesOptions: TmallTargetSeriesOption[];
}

const isFinitePositive = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const safeNumber = (value: number): number =>
  Number.isFinite(value) ? value : 0;

const missingActualProgress = (
  target: TmallTargetDefinition,
): TmallTargetProgress => {
  if (target.status === "paused") {
    return {
      target,
      actualValue: null,
      targetValue: target.targetValue,
      progressRate: null,
      gapValue: null,
      status: "paused",
      warnings: ["目标已暂停。"],
    };
  }

  if (!isFinitePositive(target.targetValue)) {
    return {
      target,
      actualValue: null,
      targetValue: target.targetValue,
      progressRate: null,
      gapValue: null,
      status: "invalid_target",
      warnings: ["目标值必须是有限正数。"],
    };
  }

  return {
    target,
    actualValue: null,
    targetValue: target.targetValue,
    progressRate: null,
    gapValue: null,
    status: "missing_actual",
    warnings: ["暂无实际值，请先上传天猫经营、推广和售后数据。"],
  };
};

export const getStoreTargets = (
  targets: TmallTargetDefinition[],
): TmallTargetDefinition[] => targets.filter((target) => target.scope === "store");

export const getProductTargets = (
  targets: TmallTargetDefinition[],
): TmallTargetDefinition[] => targets.filter((target) => target.scope === "product");

export const getSeriesTargets = (
  targets: TmallTargetDefinition[],
): TmallTargetDefinition[] => targets.filter((target) => target.scope === "series");

export const getNonStoreTargets = (
  targets: TmallTargetDefinition[],
): TmallTargetDefinition[] => targets.filter((target) => target.scope !== "store");

const latestBusinessDate = (analysis: TmallAnalysisDisplayResult | null): string | null =>
  analysis
    ? [...new Set(analysis.productDailyFacts.map((fact) => fact.date).filter(Boolean))]
      .sort((first, second) => second.localeCompare(first))[0] ?? null
    : null;

export const buildTmallTargetProductOptions = (
  analysis: TmallAnalysisDisplayResult | null,
  selectedDate?: string | null,
): TmallTargetProductOption[] => {
  if (!analysis) return [];

  const effectiveDate = selectedDate || latestBusinessDate(analysis);
  if (!effectiveDate) return [];

  const grouped = new Map<string, TmallTargetProductOption>();
  analysis.productDailyFacts
    .filter((fact) => fact.date === effectiveDate && String(fact.productId).trim().length > 0)
    .forEach((fact) => {
      const productId = String(fact.productId);
      const existing = grouped.get(productId);
      const productName = fact.productName?.trim() || existing?.productName || "未命名商品";

      if (!existing) {
        grouped.set(productId, {
          productId,
          productName,
          gmv: safeNumber(fact.gmv),
          visitors: safeNumber(fact.visitors),
          paidBuyers: safeNumber(fact.paidBuyers),
        });
        return;
      }

      grouped.set(productId, {
        productId,
        productName: existing.productName || productName,
        gmv: existing.gmv + safeNumber(fact.gmv),
        visitors: existing.visitors + safeNumber(fact.visitors),
        paidBuyers: existing.paidBuyers + safeNumber(fact.paidBuyers),
      });
    });

  return [...grouped.values()].sort((first, second) => {
    if (second.gmv !== first.gmv) return second.gmv - first.gmv;
    if (second.visitors !== first.visitors) return second.visitors - first.visitors;
    return first.productId.localeCompare(second.productId);
  });
};

export const buildTmallTargetSeriesOptions = (
  seriesGroups: TmallSeriesGroup[],
): TmallTargetSeriesOption[] =>
  seriesGroups
    .map((group) => ({
      seriesId: String(group.id),
      seriesName: group.name.trim() || "未命名系列",
      productCount: group.productIds.length,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    }))
    .sort((first, second) => {
      const updatedCompare = second.updatedAt.localeCompare(first.updatedAt);
      if (updatedCompare !== 0) return updatedCompare;
      return first.seriesId.localeCompare(second.seriesId);
    });

export const buildTmallTargetPageViewModel = ({
  targets,
  analysis,
  selectedDate,
  seriesGroups = [],
}: {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  selectedDate?: string | null;
  seriesGroups?: TmallSeriesGroup[];
}): TmallTargetPageViewModel => {
  const storeTargets = getStoreTargets(targets);
  const productTargets = getProductTargets(targets);
  const seriesTargets = getSeriesTargets(targets);
  const nonStoreTargets = getNonStoreTargets(targets);
  const storeProgressItems = analysis
    ? buildTmallTargetProgress(analysis, storeTargets)
    : storeTargets.map(missingActualProgress);
  const productProgressItems = analysis
    ? buildTmallTargetProgress(analysis, productTargets)
    : productTargets.map(missingActualProgress);
  const seriesProgressItems = analysis
    ? buildTmallTargetProgress(analysis, seriesTargets, seriesGroups)
    : seriesTargets.map(missingActualProgress);

  return {
    storeTargets,
    productTargets,
    seriesTargets,
    nonStoreTargets,
    storeProgressItems,
    productProgressItems,
    seriesProgressItems,
    progressItems: storeProgressItems,
    unsupportedTargetCount: 0,
    productOptions: buildTmallTargetProductOptions(analysis, selectedDate),
    seriesOptions: buildTmallTargetSeriesOptions(seriesGroups),
  };
};

export const buildDefaultTargetName = (
  scope: TmallTargetFormScope,
  metricKey: TmallTargetMetricKey,
  periodType: TmallTargetPeriodType,
): string => {
  const metric = getTmallTargetMetricDefinition(metricKey);
  const scopeLabel = scope === "store" ? "店铺" : scope === "product" ? "宝贝" : "系列";
  return `${scopeLabel}${periodType === "daily" ? "日" : "月"}${metric.label}目标`;
};

export const buildDefaultStoreTargetName = (
  metricKey: TmallTargetMetricKey,
  periodType: TmallTargetPeriodType,
): string => buildDefaultTargetName("store", metricKey, periodType);

export const getDefaultTargetPeriodValues = (
  analysis: TmallAnalysisDisplayResult | null,
  today = new Date(),
): { daily: string; monthly: string } => {
  const fallbackDaily = today.toISOString().slice(0, 10);
  const daily = latestBusinessDate(analysis) ?? fallbackDaily;

  return {
    daily,
    monthly: daily.slice(0, 7),
  };
};

export const buildTargetDefinition = ({
  values,
  id,
  now,
  existingTarget,
}: {
  values: TmallTargetFormValues;
  id: string;
  now: string;
  existingTarget?: TmallTargetDefinition | null;
}): TmallTargetDefinition => {
  const metric = getTmallTargetMetricDefinition(values.metricKey);
  const baseTarget = {
    id,
    name: values.name.trim(),
    periodType: values.periodType,
    periodValue: values.periodValue.trim(),
    metricKey: values.metricKey,
    targetValue: values.targetValue,
    direction: metric.direction,
    status: values.status,
    createdAt: existingTarget?.createdAt ?? now,
    updatedAt: now,
  };

  if (values.scope === "product") {
    return {
      ...baseTarget,
      scope: "product",
      productId: String(values.productId ?? "").trim(),
    };
  }

  if (values.scope === "series") {
    return {
      ...baseTarget,
      scope: "series",
      seriesId: String(values.seriesId ?? "").trim(),
    };
  }

  return {
    ...baseTarget,
    scope: "store",
  };
};

export const buildStoreTargetDefinition = ({
  values,
  id,
  now,
  existingTarget,
}: {
  values: TmallStoreTargetFormValues;
  id: string;
  now: string;
  existingTarget?: TmallTargetDefinition | null;
}): TmallTargetDefinition => {
  return buildTargetDefinition({
    values: {
      ...values,
      scope: "store",
    },
    id,
    now,
    existingTarget,
  });
};

export const upsertTarget = (
  targets: TmallTargetDefinition[],
  target: TmallTargetDefinition,
): TmallTargetDefinition[] => {
  const exists = targets.some((item) => item.id === target.id);
  if (!exists) return [...targets, target];

  return targets.map((item) => (item.id === target.id ? target : item));
};

export const upsertStoreTarget = upsertTarget;

export const updateTargetStatus = ({
  targets,
  targetId,
  status,
  updatedAt,
}: {
  targets: TmallTargetDefinition[];
  targetId: string;
  status: TmallTargetStatus;
  updatedAt: string;
}): TmallTargetDefinition[] =>
  targets.map((target) =>
    target.id === targetId
      ? { ...target, status, updatedAt }
      : target,
  );

export const deleteTargetById = (
  targets: TmallTargetDefinition[],
  targetId: string,
): TmallTargetDefinition[] => targets.filter((target) => target.id !== targetId);
