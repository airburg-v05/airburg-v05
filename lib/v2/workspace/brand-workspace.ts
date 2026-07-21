export const DEFAULT_BRAND_ID = "airburg";
export const BRAND_WORKSPACE_STORAGE_KEY = "airburg:v2:brand-workspaces:v1";
export const BRAND_WORKSPACE_EVENT = "airburg-v2-brand-workspace-change";

export interface BrandWorkspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BrandWorkspaceState {
  version: 1;
  activeBrandId: string;
  brands: BrandWorkspace[];
}

const DEFAULT_CREATED_AT = "2026-07-21T00:00:00.000Z";

export const DEFAULT_BRAND_WORKSPACE: BrandWorkspace = {
  id: DEFAULT_BRAND_ID,
  name: "空气堡",
  createdAt: DEFAULT_CREATED_AT,
  updatedAt: DEFAULT_CREATED_AT,
};

export const createDefaultBrandWorkspaceState = (): BrandWorkspaceState => ({
  version: 1,
  activeBrandId: DEFAULT_BRAND_ID,
  brands: [{ ...DEFAULT_BRAND_WORKSPACE }],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeName = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : "";

const normalizeId = (value: unknown): string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value) ? value : "";

const normalizeTime = (value: unknown, fallback: string): string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;

const sanitizeState = (value: unknown): BrandWorkspaceState => {
  const fallback = createDefaultBrandWorkspaceState();
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.brands)) return fallback;

  const now = new Date().toISOString();
  const brands = value.brands.reduce<BrandWorkspace[]>((result, item) => {
    if (!isRecord(item)) return result;
    const id = normalizeId(item.id);
    const name = normalizeName(item.name);
    if (!id || !name || result.some((brand) => brand.id === id)) return result;
    const createdAt = normalizeTime(item.createdAt, now);
    result.push({
      id,
      name,
      createdAt,
      updatedAt: normalizeTime(item.updatedAt, createdAt),
    });
    return result;
  }, []);

  const withDefault = brands.some((brand) => brand.id === DEFAULT_BRAND_ID)
    ? brands
    : [{ ...DEFAULT_BRAND_WORKSPACE }, ...brands];
  const requestedActive = normalizeId(value.activeBrandId);
  const activeBrandId = withDefault.some((brand) => brand.id === requestedActive)
    ? requestedActive
    : DEFAULT_BRAND_ID;

  return { version: 1, activeBrandId, brands: withDefault };
};

const notify = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BRAND_WORKSPACE_EVENT));
};

export const loadBrandWorkspaceState = (): BrandWorkspaceState => {
  if (typeof window === "undefined") return createDefaultBrandWorkspaceState();
  const raw = window.localStorage.getItem(BRAND_WORKSPACE_STORAGE_KEY);
  if (!raw) return createDefaultBrandWorkspaceState();
  try {
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createDefaultBrandWorkspaceState();
  }
};

export const saveBrandWorkspaceState = (state: BrandWorkspaceState): BrandWorkspaceState => {
  const sanitized = sanitizeState(state);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BRAND_WORKSPACE_STORAGE_KEY, JSON.stringify(sanitized));
    notify();
  }
  return sanitized;
};

export const activeBrandWorkspace = (state = loadBrandWorkspaceState()): BrandWorkspace =>
  state.brands.find((brand) => brand.id === state.activeBrandId) ?? DEFAULT_BRAND_WORKSPACE;

export const createBrandWorkspace = (
  nameInput: string,
  state = loadBrandWorkspaceState(),
): { status: "created"; state: BrandWorkspaceState; brand: BrandWorkspace } | { status: "invalid" | "duplicate" } => {
  const name = normalizeName(nameInput);
  if (!name) return { status: "invalid" };
  if (state.brands.some((brand) => brand.name.toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"))) {
    return { status: "duplicate" };
  }
  const now = new Date().toISOString();
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  const brand: BrandWorkspace = {
    id: `brand_${random}`,
    name,
    createdAt: now,
    updatedAt: now,
  };
  const next = saveBrandWorkspaceState({
    version: 1,
    activeBrandId: brand.id,
    brands: [...state.brands, brand],
  });
  return { status: "created", state: next, brand };
};

export const setActiveBrandWorkspace = (
  brandId: string,
  state = loadBrandWorkspaceState(),
): BrandWorkspaceState | null => {
  if (!state.brands.some((brand) => brand.id === brandId)) return null;
  return saveBrandWorkspaceState({ ...state, activeBrandId: brandId });
};

const databaseSuffix = (brandId: string): string =>
  brandId.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64) || DEFAULT_BRAND_ID;

const databaseName = (base: string, brandId: string): string =>
  brandId === DEFAULT_BRAND_ID ? base : `${base}--${databaseSuffix(brandId)}`;

export const runtimeDatabaseNameForBrand = (brandId: string): string =>
  databaseName("airburg-runtime-dataset-v1", brandId);

export const targetDatabaseNameForBrand = (brandId: string): string =>
  databaseName("airburg-target-drafts-v1", brandId);

export const debugDatabaseNameForBrand = (brandId: string): string =>
  databaseName("airburg-debug-context-v1", brandId);
