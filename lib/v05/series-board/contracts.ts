import type {
  PlatformCode,
  TargetDirection,
  TargetPeriodType,
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
import type { TmallTargetDefinition } from "../../../types/tmall-targets";
import type { TmallSeriesGroup } from "../../storage/tmall-series-storage";

export type SeriesBoardDataMode =
  | "v2_valid"
  | "legacy_fallback"
  | "v2_corrupted_with_legacy_fallback"
  | "no_series"
  | "empty_series"
  | "empty"
  | "invalid_store"
  | "invalid_series"
  | "corrupted"
  | "error";

export type SeriesBoardPeriod = HomeCommandCenterPeriod;
export type SeriesBoardMetricKey = HomeCommandCenterMetricKey;
export type SeriesBoardStatusTone = HomeCommandCenterStatusTone;

export interface SeriesBoardRuntimeContext {
  mode: SeriesBoardDataMode;
  dataset: V2Dataset | null;
  legacyAnalysis: TmallStoredAnalysisResult | null;
  legacySeriesGroups: TmallSeriesGroup[];
  legacyTargets: TmallTargetDefinition[];
  v2IssueCodes: string[];
  message: string;
}

export interface SeriesBoardLoadResult {
  status: "loading" | "valid" | "empty" | "corrupted" | "error";
  context: SeriesBoardRuntimeContext | null;
  message: string;
}

export interface SeriesBoardBuildInput {
  dataset: V2Dataset;
  platformCode: PlatformCode;
  storeId: string;
  seriesId: string | null;
  selectedPeriod: SeriesBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
}

export interface LegacySeriesBoardBuildInput {
  analysis: TmallStoredAnalysisResult;
  legacySeriesGroups: TmallSeriesGroup[];
  targets: TmallTargetDefinition[];
  seriesId: string | null;
  selectedPeriod: SeriesBoardPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  fallbackNotice?: string;
}

export interface SeriesBoardStoreContext {
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
  manageSeriesHref: string;
  historyHref: string;
  qualityHref: string;
}

export interface SeriesBoardSeriesOption {
  seriesId: string;
  name: string;
  productCount: number;
  href: string;
}

export interface SeriesBoardMetric {
  key: string;
  label: string;
  value: number | null;
  formattedValue: string;
  helper: string;
  tone: SeriesBoardStatusTone;
}

export interface SeriesBoardTargetProgress {
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
  tone: SeriesBoardStatusTone;
  allocationStatus: TargetContextAllocationStatus;
  allocationStatusLabel: string;
  allocationTone: TargetContextTone;
}

export interface SeriesBoardDateRangeState {
  selectedPeriod: SeriesBoardPeriod;
  selectedDate: string | null;
  start: string | null;
  end: string | null;
  naturalDayCount: number;
  dataDayCount: number;
  valid: boolean;
  error: string | null;
  coverageText: string;
}

export interface SeriesBoardProductRow {
  productId: string;
  productName: string;
  dataStatus: "business" | "ad_only" | "no_range_data";
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  hasAdData: boolean;
  adSpend: number | null;
  adRoi: number | null;
  refundAmount: number | null;
  trackedProductId: string | null;
  productBoardHref: string | null;
  fallbackHref: string;
}

export interface SeriesBoardDataStatus {
  activeDatasetStatus: string;
  storeCount: number;
  seriesCount: number;
  warningCount: number;
  issueCodes: string[];
  qualityHref: string;
}

export interface SeriesBoardViewModel {
  mode: SeriesBoardDataMode;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: SeriesBoardStatusTone;
  storeContext: SeriesBoardStoreContext | null;
  selectedSeriesId: string | null;
  selectedSeriesName: string | null;
  selectedSeriesProductCount: number;
  seriesOptions: SeriesBoardSeriesOption[];
  defaultDate: string | null;
  availableDates: string[];
  dateRange: SeriesBoardDateRangeState;
  metrics: SeriesBoardMetric[];
  trendMetricOptions: Array<{ key: SeriesBoardMetricKey; label: string }>;
  trendPoints: HomeCommandCenterDatePoint[];
  targetProgress: SeriesBoardTargetProgress[];
  productRows: SeriesBoardProductRow[];
  dataStatus: SeriesBoardDataStatus;
  primaryActions: Array<{ label: string; href: string; tone: SeriesBoardStatusTone }>;
  notices: string[];
  isEmpty: boolean;
}
