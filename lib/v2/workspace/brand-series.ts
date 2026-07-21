import type { BIHomeSeriesDefinition } from "@/lib/bi/bi.data-source";
import {
  DEFAULT_BRAND_ID,
  type BrandWorkspace,
} from "@/lib/v2/workspace/brand-workspace";

export const MAX_HOME_SERIES = 5;
export const BRAND_SERIES_EVENT = "airburg-v2-brand-series-change";

export interface BrandSeriesProductRef {
  platformCode: string;
  storeId: string;
  productId: string;
}

export interface BrandSeriesRecord {
  seriesId: string;
  name: string;
  productRefs: BrandSeriesProductRef[];
  showOnHome: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BrandSeriesState {
  version: 1;
  brandId: string;
  series: BrandSeriesRecord[];
}

const storageKey = (brandId: string) => `airburg:v2:brand-series:v1:${brandId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown, max = 80): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

const sanitizeRefs = (value: unknown): BrandSeriesProductRef[] => {
  if (!Array.isArray(value)) return [];
  const refs: BrandSeriesProductRef[] = [];
  value.forEach((item) => {
    if (!isRecord(item)) return;
    const platformCode = cleanText(item.platformCode, 40);
    const storeId = cleanText(item.storeId, 120);
    const productId = cleanText(item.productId, 160);
    if (!platformCode || !storeId || !productId) return;
    const key = `${platformCode}:${storeId}:${productId}`;
    if (!refs.some((ref) => `${ref.platformCode}:${ref.storeId}:${ref.productId}` === key)) {
      refs.push({ platformCode, storeId, productId });
    }
  });
  return refs;
};

const sanitizeState = (value: unknown, brandId: string): BrandSeriesState => {
  if (!isRecord(value) || value.version !== 1 || value.brandId !== brandId || !Array.isArray(value.series)) {
    return { version: 1, brandId, series: [] };
  }
  let homeCount = 0;
  const series = value.series.reduce<BrandSeriesRecord[]>((result, item) => {
    if (!isRecord(item)) return result;
    const seriesId = cleanText(item.seriesId, 100);
    const name = cleanText(item.name, 40);
    if (!seriesId || !name || result.some((record) => record.seriesId === seriesId)) return result;
    const createdAt = cleanText(item.createdAt, 40) || new Date().toISOString();
    const requestedHome = item.showOnHome === true;
    const showOnHome = requestedHome && homeCount < MAX_HOME_SERIES;
    if (showOnHome) homeCount += 1;
    result.push({
      seriesId,
      name,
      productRefs: sanitizeRefs(item.productRefs),
      showOnHome,
      createdAt,
      updatedAt: cleanText(item.updatedAt, 40) || createdAt,
    });
    return result;
  }, []);
  return { version: 1, brandId, series };
};

const notify = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BRAND_SERIES_EVENT));
};

export const loadBrandSeries = (brandId: string): BrandSeriesRecord[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(storageKey(brandId));
  if (!raw) return [];
  try {
    return sanitizeState(JSON.parse(raw), brandId).series;
  } catch {
    return [];
  }
};

export const saveBrandSeries = (brandId: string, series: BrandSeriesRecord[]): BrandSeriesRecord[] => {
  const state = sanitizeState({ version: 1, brandId, series }, brandId);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(brandId), JSON.stringify(state));
    notify();
  }
  return state.series;
};

export const createBrandSeriesId = (): string => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `series_${random}`;
};

export const homeSeriesDefinitions = (
  brand: BrandWorkspace,
  storeLabels: Map<string, { platformName: string | null; storeName: string | null }>,
): BIHomeSeriesDefinition[] =>
  loadBrandSeries(brand.id)
    .filter((series) => series.showOnHome && series.productRefs.length > 0)
    .flatMap((series) => {
      const refsByStore = new Map<string, BrandSeriesProductRef[]>();
      series.productRefs.forEach((ref) => {
        const key = `${ref.platformCode}::${ref.storeId}`;
        refsByStore.set(key, [...(refsByStore.get(key) ?? []), ref]);
      });
      return Array.from(refsByStore.entries()).map(([key, refs]) => {
        const [platformCode, storeId] = key.split("::", 2);
        const labels = storeLabels.get(key);
        return {
          platformCode,
          platformName: labels?.platformName ?? platformCode,
          storeId,
          storeName: labels?.storeName ?? storeId,
          seriesId: series.seriesId,
          seriesName: series.name,
          productIds: refs.map((ref) => ref.productId),
        };
      });
    });

export const defaultBrandForSeries = (): BrandWorkspace => ({
  id: DEFAULT_BRAND_ID,
  name: "空气堡",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
});
