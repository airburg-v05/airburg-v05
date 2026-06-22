import { buildSeriesKey } from "../domain/keys";
import type { SeriesRecord, TargetRecord, V2Dataset } from "../domain/models";
import { createIssue, type ValidationIssue } from "../domain/results";
import { isTargetMetricAllocatable } from "./metric-allocation-policy";
import { normalizeParentTargetId, sameStoreOwner } from "./target-normalization";

type TargetHierarchyDataset = Pick<V2Dataset, "targets" | "series">;

const issue = (code: ValidationIssue["code"], path: string, message: string): ValidationIssue =>
  createIssue(code, path, message);

const seriesIndex = (series: readonly SeriesRecord[]): Map<string, SeriesRecord> =>
  new Map(series.map((record) => [buildSeriesKey(record), record]));

const directParentIsLegal = (parent: TargetRecord, child: TargetRecord): boolean =>
  (parent.scope === "company" && child.scope === "store") ||
  (parent.scope === "store" && child.scope === "series") ||
  (parent.scope === "series" && child.scope === "product");

const pathForTarget = (targets: readonly TargetRecord[], target: TargetRecord): string =>
  `targets[${targets.indexOf(target)}]`;

const validateTargetParentRelation = (
  child: TargetRecord,
  parent: TargetRecord,
  targets: readonly TargetRecord[],
  seriesByKey: Map<string, SeriesRecord>,
  issues: ValidationIssue[],
): void => {
  const path = pathForTarget(targets, child);

  if (!directParentIsLegal(parent, child)) {
    issues.push(issue("scope_mismatch", `${path}.parentTargetId`, "Target parent must use an adjacent company -> store -> series -> product level."));
  }

  if (child.status !== "deleted" && parent.status === "deleted") {
    issues.push(issue("reference_missing", `${path}.parentTargetId`, "Active or paused target cannot reference a deleted parent target."));
  }

  if (!isTargetMetricAllocatable(parent.metricKey)) {
    issues.push(issue("invalid_format", `${path}.metricKey`, "Target hierarchy can only be created for additive metric keys."));
  }

  if (parent.metricKey !== child.metricKey) {
    issues.push(issue("invalid_format", `${path}.metricKey`, "Child target metric key must match parent target metric key."));
  }

  if (parent.periodType !== child.periodType || parent.periodValue !== child.periodValue) {
    issues.push(issue("invalid_format", `${path}.periodValue`, "Child target period must match parent target period."));
  }

  if (parent.direction !== child.direction) {
    issues.push(issue("invalid_format", `${path}.direction`, "Child target direction must match parent target direction."));
  }

  if (child.scope === "series" || child.scope === "product") {
    if (!sameStoreOwner(parent, child)) {
      issues.push(issue("cross_store_reference", `${path}.parentTargetId`, "Series and product target parents must share the same store owner."));
    }
  }

  if (child.scope === "product") {
    if (!parent.platformCode || !parent.storeId || !parent.seriesId) return;
    const parentSeries = seriesByKey.get(buildSeriesKey({
      platformCode: parent.platformCode,
      storeId: parent.storeId,
      seriesId: parent.seriesId,
    }));
    if (!parentSeries) {
      issues.push(issue("reference_missing", `${path}.parentTargetId`, "Product target parent series does not exist."));
      return;
    }
    if (!child.productId || !parentSeries.productIds.includes(child.productId)) {
      issues.push(issue("cross_store_reference", `${path}.productId`, "Product target must reference a product in the parent series."));
    }
  }
};

const validateTargetPath = (
  target: TargetRecord,
  targetsById: Map<string, TargetRecord>,
  targets: readonly TargetRecord[],
  issues: ValidationIssue[],
): void => {
  const visited = new Set<string>();
  let current: TargetRecord | undefined = target;
  let depth = 0;

  while (current) {
    if (visited.has(current.targetId)) {
      issues.push(issue("scope_mismatch", `${pathForTarget(targets, target)}.parentTargetId`, "Target hierarchy cannot contain a cycle."));
      return;
    }
    visited.add(current.targetId);

    const parentTargetId = normalizeParentTargetId(current);
    if (!parentTargetId) return;
    depth += 1;
    if (depth > 3) {
      issues.push(issue("scope_mismatch", `${pathForTarget(targets, target)}.parentTargetId`, "Target hierarchy cannot exceed company -> store -> series -> product depth."));
      return;
    }
    current = targetsById.get(parentTargetId);
    if (!current) return;
  }
};

export const validateTargetHierarchyRelationships = (dataset: TargetHierarchyDataset): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const targetsById = new Map(dataset.targets.map((target) => [target.targetId, target]));
  const seriesByKey = seriesIndex(dataset.series);

  dataset.targets.forEach((target) => {
    const path = pathForTarget(dataset.targets, target);
    const parentTargetId = normalizeParentTargetId(target);

    if (target.scope === "company" && parentTargetId !== null) {
      issues.push(issue("scope_mismatch", `${path}.parentTargetId`, "Company target cannot have a parent target."));
    }

    if (!parentTargetId) return;

    if (parentTargetId === target.targetId) {
      issues.push(issue("scope_mismatch", `${path}.parentTargetId`, "Target cannot reference itself as parent."));
      return;
    }

    const parent = targetsById.get(parentTargetId);
    if (!parent) {
      issues.push(issue("reference_missing", `${path}.parentTargetId`, "Parent target does not exist."));
      return;
    }

    validateTargetParentRelation(target, parent, dataset.targets, seriesByKey, issues);
  });

  dataset.targets.forEach((target) => validateTargetPath(target, targetsById, dataset.targets, issues));
  return issues;
};
