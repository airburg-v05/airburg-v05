import type { BrandModelFilter, BISearchProductKeyword, BISearchTotalKeyword, CenterWordGroup } from "./search-keyword.types";

export type BrandModelMetricKey = "visitors" | "buyers" | "gmv";

export interface BrandModelMatchResult {
  matches: boolean;
  matchesBrand: boolean;
  matchesModel: boolean;
  matchesCenterWord: boolean;
  matchedCenterGroupIds: string[];
}

export interface BrandModelAggregate {
  visitors: number | null;
  buyers: number | null;
  gmv: number | null;
  matchedRowCount: number;
}

export interface BrandCenterResolveResult {
  matchesBrand: boolean;
  matchesCenterWord: boolean;
  matchedCenterGroups: CenterWordGroup[];
}

export const EMPTY_BRAND_MODEL_FILTER: BrandModelFilter = {
  brandWords: [],
  modelWords: [],
  centerWordGroups: [],
};

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const normalizeKeywordToken = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase();

export const normalizeCenterWordToken = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/[＿_]/g, "-")
    .replace(/\s+/g, "")
    .toLocaleUpperCase();

export const parseKeywordTokens = (input: string | string[] | null | undefined): string[] => {
  const rawItems = Array.isArray(input) ? input : String(input ?? "").split(/\n|,|，|;|；|\s+/);
  return Array.from(
    new Set(
      rawItems
        .map((item) => normalizeKeywordToken(item))
        .filter(Boolean),
    ),
  );
};

const stableCenterGroupId = (centerWord: string, index: number): string => {
  const normalized = normalizeCenterWordToken(centerWord).replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `center-${normalized || index}`;
};

export const normalizeCenterWordGroups = (
  groups: CenterWordGroup[] | null | undefined,
): CenterWordGroup[] => {
  const normalizedGroups: CenterWordGroup[] = [];
  const seenGroupIds = new Set<string>();

  (groups ?? []).forEach((group, index) => {
    const centerWord = normalizeCenterWordToken(group.centerWord || group.aliases?.[0] || "");
    if (!centerWord) return;

    const aliases = Array.from(
      new Set([centerWord, ...(group.aliases ?? []).map((alias) => normalizeCenterWordToken(alias))].filter(Boolean)),
    );
    const fallbackId = stableCenterGroupId(centerWord, index);
    let id = String(group.id || fallbackId).trim() || fallbackId;
    if (seenGroupIds.has(id)) id = `${id}-${index}`;
    seenGroupIds.add(id);

    normalizedGroups.push({
      id,
      centerWord,
      aliases,
    });
  });

  return normalizedGroups;
};

const legacyModelWordsToCenterGroups = (modelWords: string[]): CenterWordGroup[] =>
  modelWords.map((word, index) => ({
    id: `legacy-${stableCenterGroupId(word, index)}`,
    centerWord: word,
    aliases: [word],
  }));

export const normalizeBrandModelFilter = (
  filter: Partial<BrandModelFilter> | null | undefined,
): BrandModelFilter => {
  const brandWords = parseKeywordTokens(filter?.brandWords ?? []);
  const modelWords = parseKeywordTokens(filter?.modelWords ?? []);
  const centerWordGroups = normalizeCenterWordGroups([
    ...(filter?.centerWordGroups ?? []),
    ...legacyModelWordsToCenterGroups(modelWords),
  ]);

  return {
    brandWords,
    modelWords,
    centerWordGroups,
  };
};

export const hasBrandModelTokens = (filter: Partial<BrandModelFilter> | null | undefined): boolean => {
  const normalized = normalizeBrandModelFilter(filter);
  return (
    normalized.brandWords.length > 0 ||
    normalized.modelWords.length > 0 ||
    (normalized.centerWordGroups?.length ?? 0) > 0
  );
};

export const matchesAnyKeyword = (keyword: string, tokens: string[]): boolean => {
  const normalizedKeyword = normalizeKeywordToken(keyword);
  if (!normalizedKeyword) return false;
  return tokens.some((token) => normalizedKeyword.includes(token));
};

const isAsciiLetterOrDigit = (value: string | undefined): boolean =>
  typeof value === "string" && /^[A-Z0-9]$/.test(value);

const exactOrSeparatedTokenMatch = (centerWord: string, normalizedKeyword: string): boolean => {
  const token = normalizeCenterWordToken(centerWord);
  if (!token || !normalizedKeyword) return false;

  let index = normalizedKeyword.indexOf(token);
  while (index >= 0) {
    const before = index > 0 ? normalizedKeyword[index - 1] : undefined;
    const beforePrevious = index > 1 ? normalizedKeyword[index - 2] : undefined;
    const after = normalizedKeyword[index + token.length];

    const leftBoundary = !isAsciiLetterOrDigit(before);
    const rightBoundary = !isAsciiLetterOrDigit(after);
    const isHyphenatedModelSuffix = before === "-" && isAsciiLetterOrDigit(beforePrevious);

    if (leftBoundary && rightBoundary && !isHyphenatedModelSuffix) return true;
    index = normalizedKeyword.indexOf(token, index + token.length);
  }

  return false;
};

const exactOrBoundedAliasMatch = (alias: string, normalizedKeyword: string): boolean => {
  const token = normalizeCenterWordToken(alias);
  if (!token || !normalizedKeyword) return false;
  if (/^P\d+$/i.test(token)) return safeCenterWordBoundaryMatch(token, normalizedKeyword);

  let index = normalizedKeyword.indexOf(token);
  while (index >= 0) {
    const before = index > 0 ? normalizedKeyword[index - 1] : undefined;
    const after = normalizedKeyword[index + token.length];
    const leftBoundary = !isAsciiLetterOrDigit(before);
    const rightBoundary = !isAsciiLetterOrDigit(after);
    if (leftBoundary && rightBoundary) return true;
    index = normalizedKeyword.indexOf(token, index + token.length);
  }
  return false;
};

export const safeCenterWordBoundaryMatch = (centerWord: string, keyword: string): boolean => {
  const token = normalizeCenterWordToken(centerWord);
  const normalizedKeyword = normalizeCenterWordToken(keyword);
  if (!token || !normalizedKeyword) return false;
  if (exactOrSeparatedTokenMatch(token, normalizedKeyword)) return true;

  // The audited P1 center word safely includes the P1 family aliases below,
  // while excluding risk terms such as KJ500F-P1 unless users explicitly add them.
  if (token === "P1") {
    return /(^|[^A-Z0-9])KJ60F?-?P1(?=$|[^A-Z0-9])/.test(normalizedKeyword);
  }

  return false;
};

export const centerWordFilter = (group: CenterWordGroup): BrandModelFilter => ({
  brandWords: [],
  modelWords: [],
  centerWordGroups: [group],
});

export const matchingCenterWordGroups = (
  keyword: string,
  groups: CenterWordGroup[] | null | undefined,
): CenterWordGroup[] => {
  const normalizedKeyword = normalizeCenterWordToken(keyword);
  if (!normalizedKeyword) return [];

  return normalizeCenterWordGroups(groups).filter((group) => {
    if (safeCenterWordBoundaryMatch(group.centerWord, normalizedKeyword)) return true;
    return group.aliases.some((alias) => exactOrBoundedAliasMatch(alias, normalizedKeyword));
  });
};

export const resolveBrandCenterMatch = (
  keyword: string,
  filter: Partial<BrandModelFilter> | null | undefined,
): BrandCenterResolveResult => {
  const normalized = normalizeBrandModelFilter(filter);
  const matchesBrand = matchesAnyKeyword(keyword, normalized.brandWords);
  const matchedCenterGroups = matchingCenterWordGroups(keyword, normalized.centerWordGroups);

  return {
    matchesBrand,
    matchesCenterWord: matchedCenterGroups.length > 0,
    matchedCenterGroups,
  };
};

export const buildBrandModelMatch = (
  row: { keyword: string },
  filter: Partial<BrandModelFilter> | null | undefined,
): BrandModelMatchResult => {
  const resolved = resolveBrandCenterMatch(row.keyword, filter);
  const matchesModel = resolved.matchesCenterWord;
  return {
    matchesBrand: resolved.matchesBrand,
    matchesModel,
    matchesCenterWord: resolved.matchesCenterWord,
    matchedCenterGroupIds: resolved.matchedCenterGroups.map((group) => group.id),
    matches: resolved.matchesBrand || resolved.matchesCenterWord,
  };
};

const totalDedupKey = (row: BISearchTotalKeyword): string =>
  `${row.platformCode}::${row.storeId}::${row.date ?? "__no_date__"}::${normalizeKeywordToken(row.keyword)}`;

const productDedupKey = (row: BISearchProductKeyword): string =>
  `${row.platformCode}::${row.storeId}::${row.productId}::${row.date ?? "__no_date__"}::${normalizeKeywordToken(row.keyword)}`;

const aggregateRows = <T extends { visitors: number | null; buyers: number | null; gmv?: number | null }>(
  rows: T[],
): BrandModelAggregate => {
  let visitors: number | null = null;
  let buyers: number | null = null;
  let gmv: number | null = null;

  rows.forEach((row) => {
    const nextVisitors = finiteOrNull(row.visitors);
    const nextBuyers = finiteOrNull(row.buyers);
    const nextGmv = finiteOrNull(row.gmv);

    if (nextVisitors !== null) visitors = (visitors ?? 0) + nextVisitors;
    if (nextBuyers !== null) buyers = (buyers ?? 0) + nextBuyers;
    if (nextGmv !== null) gmv = (gmv ?? 0) + nextGmv;
  });

  return {
    visitors,
    buyers,
    gmv,
    matchedRowCount: rows.length,
  };
};

const matchedUniqueRows = <T>(
  rows: T[],
  filter: Partial<BrandModelFilter> | null | undefined,
  getKeyword: (row: T) => string,
  getDedupKey: (row: T) => string,
): T[] => {
  if (!hasBrandModelTokens(filter)) return [];
  const seen = new Set<string>();
  const matched: T[] = [];

  rows.forEach((row) => {
    const match = buildBrandModelMatch({ keyword: getKeyword(row) }, filter);
    if (!match.matches) return;
    const key = getDedupKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    matched.push(row);
  });

  return matched;
};

export const aggregateSearchTotalKeywords = (
  rows: BISearchTotalKeyword[],
  filter: Partial<BrandModelFilter> | null | undefined,
): BrandModelAggregate =>
  aggregateRows(
    matchedUniqueRows(rows, filter, (row) => row.keyword, totalDedupKey),
  );

export const aggregateSearchProductKeywords = (
  rows: BISearchProductKeyword[],
  filter: Partial<BrandModelFilter> | null | undefined,
  productIds: string[],
): BrandModelAggregate => {
  const productIdSet = new Set(productIds.filter(Boolean));
  if (productIdSet.size === 0) {
    return { visitors: null, buyers: null, gmv: null, matchedRowCount: 0 };
  }
  return aggregateRows(
    matchedUniqueRows(
      rows.filter((row) => productIdSet.has(row.productId)),
      filter,
      (row) => row.keyword,
      productDedupKey,
    ),
  );
};

export const effectiveKeywordDate = (
  rowDate: string | null | undefined,
  fallbackDate: string | null | undefined,
): string => rowDate || fallbackDate || "未标日期";

const metricFromAggregate = (aggregate: BrandModelAggregate, metric: BrandModelMetricKey): number | null =>
  metric === "visitors" ? aggregate.visitors : metric === "buyers" ? aggregate.buyers : aggregate.gmv;

export const aggregateSearchTotalMetricByDate = (
  rows: BISearchTotalKeyword[],
  filter: Partial<BrandModelFilter> | null | undefined,
  fallbackDate: string | null,
  metric: BrandModelMetricKey,
): Map<string, number | null> => {
  const grouped = new Map<string, BISearchTotalKeyword[]>();
  rows.forEach((row) => {
    const date = effectiveKeywordDate(row.date, fallbackDate);
    grouped.set(date, [...(grouped.get(date) ?? []), row]);
  });
  return new Map(
    Array.from(grouped.entries()).map(([date, dateRows]) => [
      date,
      metricFromAggregate(aggregateSearchTotalKeywords(dateRows, filter), metric),
    ]),
  );
};

export const aggregateSearchProductMetricByDate = (
  rows: BISearchProductKeyword[],
  filter: Partial<BrandModelFilter> | null | undefined,
  productIds: string[],
  fallbackDate: string | null,
  metric: Exclude<BrandModelMetricKey, "gmv">,
): Map<string, number | null> => {
  const grouped = new Map<string, BISearchProductKeyword[]>();
  rows.forEach((row) => {
    const date = effectiveKeywordDate(row.date, fallbackDate);
    grouped.set(date, [...(grouped.get(date) ?? []), row]);
  });
  return new Map(
    Array.from(grouped.entries()).map(([date, dateRows]) => [
      date,
      metricFromAggregate(aggregateSearchProductKeywords(dateRows, filter, productIds), metric),
    ]),
  );
};
