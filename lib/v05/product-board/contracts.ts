import type {
  PlatformCode,
  TargetDirection,
  TargetPeriodType,
  TrackedProductRecord,
  V2Dataset,
} from "../domain/models";
import type {
  HomeCommandCenterDatePoint,
  HomeCommandCenterMetricKey,
  HomeCommandCenterPeriod,
  HomeCommandCenterStatusTone,
} from "../home-command-center";
import type { TargetContextAllocationStatus, TargetContextTone } from "../target-context";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";

export type ProductBoardDataMode =
  | "v2_valid"
  | "no_tracked_products"
  | "tracked_product_no_data"
  | "legacy_untracked"
  | "empty"
  | "invalid_store"
  | "invalid_tracked_product"
  | "not_tracked"
  | "corrupted"
  | "error";

export type ProductBoardPeriod = HomeCommandCenterPeriod;
export type ProductBoardMetricKey = HomeCommandCenterMetricKey;
export type ProductBoardStatusTone = HomeCommandCenterStatusTone;

export interface ProductBoardRuntimeContext {
  mode: ProductBoardDataMode;
  dataset: V2Dataset | null;
  legacyAnalysis: TmallStoredAnalysisResult | null;
  v2IssueCodes: string[];
  message: string;
}

export interface ProductBoardLoadResult {
  status: "loading" | "valid" | "empty" | "corrupted" | "error";
  context: ProductBoardRuntimeContext | null;
  message: string;
}

export interface ProductBoardBuildInput {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  trackedProductId: string | null;
  productId: string | null;
  selectedPeriod: ProductBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
}

export interface ProductBoardStoreContext {
  platformCode: PlatformCode;
  platformLabel: string;
  storeId: string;
  storeName: string;
  storeKey: string;
  isDefaultLegacyStore: boolean;
  availableStores: Array<{
    value: string;
    label: string;
    platformCode: PlatformCode;
    href: string;
  }>;
  storeBoardHref: string;
  manageTrackedHref: string;
  historyHref: string;
  qualityHref: string;
}

export interface ProductBoardTrackedOption {
  trackedProductId: string;
  productId: string;
  displayName: string;
  dataLabel: "有经营数据" | "仅推广数据" | "暂无事实数据";
  href: string;
}

export interface ProductBoardMetric {
  key: string;
  label: string;
  value: number | null;
  formattedValue: string;
  helper: string;
  tone: ProductBoardStatusTone;
}

export interface ProductBoardTargetProgress {
  targetId: string;
  label: string;
  metricKey: string;
  metricLabel: string;
  actualValue: number | null;
  targetValue: number | null;
  progressRate: number | null;
  gapValue: number | null;
  direction: TargetDirection;
  periodType: TargetPeriodType;
  statusLabel: string;
  tone: ProductBoardStatusTone;
  allocationStatus: TargetContextAllocationStatus;
  allocationStatusLabel: string;
  allocationTone: TargetContextTone;
}

export interface ProductBoardDateRangeState {
  selectedPeriod: ProductBoardPeriod;
  selectedDate: string | null;
  start: string | null;
  end: string | null;
  naturalDayCount: number;
  dataDayCount: number;
  valid: boolean;
  error: string | null;
  coverageText: string;
}

export interface ProductBoardAdSummary {
  hasAdData: boolean;
  adSpend: number | null;
  adSalesAmount: number | null;
  adRoi: number | null;
  impressions: number | null;
  clicks: number | null;
  clickRate: number | null;
}

export interface ProductBoardAfterSalesSummary {
  hasAfterSalesData: boolean;
  refundAmount: number | null;
  refundOrderCount: number | null;
  afterSalesApplyCount: number | null;
  pendingCount: number | null;
  distributionCount: number;
}

export interface ProductBoardSeriesMembership {
  seriesId: string;
  name: string;
  productCount: number;
  href: string;
}

export interface ProductBoardIdentity {
  trackedProductId: string | null;
  productId: string | null;
  displayName: string | null;
  sourceRecord: TrackedProductRecord | null;
  dataStatus: "business" | "ad_only" | "no_range_data";
  canonicalHref: string | null;
}

export interface ProductBoardDataStatus {
  activeDatasetStatus: string;
  storeCount: number;
  trackedProductCount: number;
  warningCount: number;
  issueCodes: string[];
  qualityHref: string;
}

export interface ProductBoardViewModel {
  mode: ProductBoardDataMode;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: ProductBoardStatusTone;
  storeContext: ProductBoardStoreContext | null;
  selectedTrackedProduct: ProductBoardIdentity;
  trackedOptions: ProductBoardTrackedOption[];
  defaultDate: string | null;
  availableDates: string[];
  dateRange: ProductBoardDateRangeState;
  metrics: ProductBoardMetric[];
  trendMetricOptions: Array<{ key: ProductBoardMetricKey; label: string }>;
  trendPoints: HomeCommandCenterDatePoint[];
  targetProgress: ProductBoardTargetProgress[];
  adSummary: ProductBoardAdSummary;
  afterSalesSummary: ProductBoardAfterSalesSummary;
  seriesMemberships: ProductBoardSeriesMembership[];
  dataStatus: ProductBoardDataStatus;
  primaryActions: Array<{ label: string; href: string; tone: ProductBoardStatusTone }>;
  notices: string[];
  isEmpty: boolean;
}
