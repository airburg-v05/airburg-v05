export const BRAND_PRODUCTS_EVENT = "airburg-v2-brand-products-change";

export interface BrandProductRecord {
  recordId: string;
  platformCode: string;
  storeId: string;
  productId: string;
  displayName: string;
  imageDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BrandProductState {
  version: 1;
  brandId: string;
  products: BrandProductRecord[];
}

const storageKey = (brandId: string) => `airburg:v2:brand-products:v1:${brandId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown, max = 120): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

const cleanImage = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length > 700_000) return null;
  return /^data:image\/(?:jpeg|png|webp);base64,/i.test(value) ? value : null;
};

const sanitizeState = (value: unknown, brandId: string): BrandProductState => {
  if (!isRecord(value) || value.version !== 1 || value.brandId !== brandId || !Array.isArray(value.products)) {
    return { version: 1, brandId, products: [] };
  }
  const products = value.products.reduce<BrandProductRecord[]>((result, item) => {
    if (!isRecord(item)) return result;
    const recordId = cleanText(item.recordId, 100);
    const platformCode = cleanText(item.platformCode, 40);
    const storeId = cleanText(item.storeId, 120);
    const productId = cleanText(item.productId, 160);
    const displayName = cleanText(item.displayName, 120) || productId;
    if (!recordId || !platformCode || !storeId || !productId) return result;
    const duplicate = result.some((record) =>
      record.recordId === recordId ||
      (record.platformCode === platformCode && record.storeId === storeId && record.productId === productId),
    );
    if (duplicate) return result;
    const createdAt = cleanText(item.createdAt, 40) || new Date().toISOString();
    result.push({
      recordId,
      platformCode,
      storeId,
      productId,
      displayName,
      imageDataUrl: cleanImage(item.imageDataUrl),
      createdAt,
      updatedAt: cleanText(item.updatedAt, 40) || createdAt,
    });
    return result;
  }, []);
  return { version: 1, brandId, products };
};

const notify = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BRAND_PRODUCTS_EVENT));
};

export const loadBrandProducts = (brandId: string): BrandProductRecord[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(storageKey(brandId));
  if (!raw) return [];
  try {
    return sanitizeState(JSON.parse(raw), brandId).products;
  } catch {
    return [];
  }
};

export const saveBrandProducts = (
  brandId: string,
  products: BrandProductRecord[],
): BrandProductRecord[] => {
  const state = sanitizeState({ version: 1, brandId, products }, brandId);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(brandId), JSON.stringify(state));
    notify();
  }
  return state.products;
};

export const createBrandProductId = (): string => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `product_${random}`;
};
