import type { PlatformCode, V2Dataset } from "../domain/models";
import type { FocusProductCandidate } from "./contracts";

const safeName = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

export const buildProductCandidates = ({
  dataset,
  platformCode,
  storeId,
}: {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
}): FocusProductCandidate[] => {
  const candidates = new Map<string, FocusProductCandidate>();

  dataset.businessProductFacts
    .filter((fact) => fact.platformCode === platformCode && fact.storeId === storeId)
    .forEach((fact) => {
      const existing = candidates.get(fact.productId);
      const productName = safeName(fact.productName, existing?.productName ?? fact.productId);
      candidates.set(fact.productId, {
        productId: fact.productId,
        productName,
        hasBusinessData: true,
        hasAdData: existing?.hasAdData ?? false,
        dataLabel: "有经营数据",
        searchText: `${productName} ${fact.productId}`.toLocaleLowerCase("zh-CN"),
      });
    });

  dataset.adProductFacts
    .filter((fact) => fact.platformCode === platformCode && fact.storeId === storeId)
    .forEach((fact) => {
      const existing = candidates.get(fact.productId);
      const productName = existing?.productName ?? fact.productId;
      candidates.set(fact.productId, {
        productId: fact.productId,
        productName,
        hasBusinessData: existing?.hasBusinessData ?? false,
        hasAdData: true,
        dataLabel: existing?.hasBusinessData ? "有经营数据" : "仅推广数据",
        searchText: `${productName} ${fact.productId}`.toLocaleLowerCase("zh-CN"),
      });
    });

  return [...candidates.values()].sort((left, right) => {
    if (left.hasBusinessData !== right.hasBusinessData) return left.hasBusinessData ? -1 : 1;
    if (left.hasAdData !== right.hasAdData) return left.hasAdData ? -1 : 1;
    return left.productName.localeCompare(right.productName, "zh-CN") || left.productId.localeCompare(right.productId);
  });
};

export const filterProductCandidates = ({
  candidates,
  query,
  limit = 50,
}: {
  candidates: FocusProductCandidate[];
  query: string;
  limit?: number;
}): FocusProductCandidate[] => {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  const filtered = normalized
    ? candidates.filter((candidate) => candidate.searchText.includes(normalized))
    : candidates;
  return filtered.slice(0, limit);
};

export const productCandidateIds = (candidates: FocusProductCandidate[]): Set<string> =>
  new Set(candidates.map((candidate) => candidate.productId));
