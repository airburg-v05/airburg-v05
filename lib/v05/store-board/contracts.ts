import type {
  PlatformCode,
  TargetDirection,
  TargetPeriodType,
  V2Dataset,
} from "../domain/models";
import type { TmallStoredAnalysisResult } from "../../../types/tmall";
import type { TmallTargetDefinition } from "../../../types/tmall-targets";
import type {
  HomeCommandCenterDatePoint,
  HomeCommandCenterMetricKey,
  HomeCommandCenterPeriod,
  HomeCommandCenterStatusTone,
} from "../home-command-center";

export type StoreBoardDataMode =
  | "v2_valid"
  | "legacy_fallback"
  | "v2_corrupted_with_legacy_fallback"
  | "empty"
  | "invalid_store"
  | "corrupted"
  | "error";

export type StoreBoardPeriod = HomeCommandCenterPeriod;
export type StoreBoardMetricKey = HomeCommandCenterMetricKey;
export type StoreBoardStatusTone = HomeCommandCenterStatusTone;

export interface StoreBoardRuntimeContext {
  mode: StoreBoardDataMode;
  dataset: V2Dataset | null;
  legacyAnalysis: TmallStoredAnalysisResult | null;
  legacyTargets: TmallTargetDefinition[];
  v2IssueCodes: string[];
  message: string;
}

export interface StoreBoardLoadResult {
  status: "loading" | "valid" | "empty" | "corrupted" | "error";
  context: StoreBoardRuntimeContext | null;
  message: string;
}

export interface StoreBoardBuildInput {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  selectedPeriod: StoreBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
}

export interface LegacyStoreBoardBuildInput {
  analysis: TmallStoredAnalysisResult;
  targets: TmallTargetDefinition[];
  selectedPeriod: StoreBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  fallbackNotice?: string;
}

export interface StoreBoardStoreContext {
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
  historyHref: string;
}

export interface StoreBoardMetric {
  key: string;
  label: string;
  value: number | null;
  formattedValue: string;
  helper: string;
  tone: StoreBoardStatusTone;
}

export interface StoreBoardTargetProgress {
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
  tone: StoreBoardStatusTone;
}

export interface StoreBoardProductRankItem {
  productId: string;
  productName: string;
  trackedProductId: string | null;
  productBoardHref: string | null;
  manageTrackedHref: string;
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  hasAdData: boolean;
  adSpend: number | null;
  adRoi: number | null;
}

export interface StoreBoardSeriesProgressItem {
  seriesId: string;
  name: string;
  productCount: number;
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  targetProgressRate: number | null;
}

export interface StoreBoardAdSummary {
  hasAdData: boolean;
  adSpend: number | null;
  adSalesAmount: number | null;
  adRoi: number | null;
  planCount: number;
}

export interface StoreBoardAfterSalesSummary {
  hasAfterSalesData: boolean;
  refundAmount: number | null;
  refundOrderCount: number | null;
  afterSalesApplyCount: number | null;
  pendingCount: number | null;
  distributionCount: number;
}

export interface StoreBoardDateRangeState {
  selectedPeriod: StoreBoardPeriod;
  selectedDate: string | null;
  start: string | null;
  end: string | null;
  naturalDayCount: number;
  dataDayCount: number;
  valid: boolean;
  error: string | null;
  coverageText: string;
}

export interface StoreBoardViewModel {
  mode: StoreBoardDataMode;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: StoreBoardStatusTone;
  storeContext: StoreBoardStoreContext | null;
  defaultDate: string | null;
  availableDates: string[];
  dateRange: StoreBoardDateRangeState;
  metrics: StoreBoardMetric[];
  trendMetricOptions: Array<{ key: StoreBoardMetricKey; label: string }>;
  trendPoints: HomeCommandCenterDatePoint[];
  targetProgress: StoreBoardTargetProgress[];
  productTop: StoreBoardProductRankItem[];
  seriesProgress: StoreBoardSeriesProgressItem[];
  adSummary: StoreBoardAdSummary;
  afterSalesSummary: StoreBoardAfterSalesSummary;
  dataStatus: {
    activeDatasetStatus: string;
    storeCount: number;
    warningCount: number;
    issueCodes: string[];
    qualityHref: string;
  };
  primaryActions: Array<{ label: string; href: string; tone: StoreBoardStatusTone }>;
  notices: string[];
  isEmpty: boolean;
}
