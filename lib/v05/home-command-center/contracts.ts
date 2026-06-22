import type { PlatformCode, TargetDirection, TargetPeriodType } from "../domain/models";
import type { TmallStoredAnalysisStatus } from "../../storage/tmall-analysis-validator";

export type HomeCommandCenterDataMode =
  | "v2_valid"
  | "legacy_fallback"
  | "v2_corrupted_with_legacy_fallback"
  | "empty"
  | "corrupted"
  | "error";

export type HomeCommandCenterPeriod = "day" | "week" | "month" | "custom";

export type HomeCommandCenterMetricKey =
  | "gmv"
  | "gsv"
  | "visitors"
  | "paidBuyers"
  | "conversionRate"
  | "adSpend";

export type HomeCommandCenterStatusTone = "blue" | "amber" | "rose" | "emerald" | "slate";

export interface HomeCommandCenterRuntimeContext {
  mode: HomeCommandCenterDataMode;
  dataset: import("../domain/models").V2Dataset | null;
  legacyAnalysis: import("../../../types/tmall").TmallStoredAnalysisResult | null;
  legacyTargets: import("../../../types/tmall-targets").TmallTargetDefinition[];
  legacyStatus: TmallStoredAnalysisStatus;
  v2IssueCodes: string[];
  message: string;
}

export interface HomeCommandCenterBuildInput {
  dataset: import("../domain/models").V2Dataset;
  selectedPeriod: HomeCommandCenterPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
  platformFilter: PlatformCode | "all";
  storeFilter: string | "all";
}

export interface LegacyHomeCommandCenterBuildInput {
  analysis: import("../../../types/tmall").TmallStoredAnalysisResult;
  targets: import("../../../types/tmall-targets").TmallTargetDefinition[];
  selectedPeriod: HomeCommandCenterPeriod;
  selectedDate: string | null;
  customDateRange: { start: string | null; end: string | null };
}

export interface HomeCommandCenterMetric {
  key: string;
  label: string;
  value: number | null;
  formattedValue: string;
  helper: string;
  tone: HomeCommandCenterStatusTone;
}

export interface HomeCommandCenterDatePoint {
  date: string;
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  adSpend: number | null;
  cumulative: Record<HomeCommandCenterMetricKey, number | null>;
}

export interface HomeCommandCenterTargetProgress {
  targetId: string;
  label: string;
  metricKey: string;
  metricLabel: string;
  scopeLabel: string;
  actualValue: number | null;
  targetValue: number | null;
  progressRate: number | null;
  gapValue: number | null;
  direction: TargetDirection;
  periodType: TargetPeriodType;
  statusLabel: string;
  tone: HomeCommandCenterStatusTone;
}

export interface HomeCommandCenterStorePerformance {
  key: string;
  platformCode: PlatformCode;
  platformLabel: string;
  storeId: string;
  storeName: string;
  gmv: number | null;
  gsv: number | null;
  contributionRate: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  conversionRate: number | null;
  adSpend: number | null;
  adRoi: number | null;
  targetProgressRate: number | null;
  href: string;
}

export interface HomeCommandCenterDateRangeState {
  selectedPeriod: HomeCommandCenterPeriod;
  selectedDate: string | null;
  start: string | null;
  end: string | null;
  naturalDayCount: number;
  dataDayCount: number;
  valid: boolean;
  error: string | null;
  coverageText: string;
}

export interface HomeCommandCenterViewModel {
  mode: HomeCommandCenterDataMode;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: HomeCommandCenterStatusTone;
  platformOptions: Array<{ value: PlatformCode | "all"; label: string }>;
  storeOptions: Array<{ value: string | "all"; label: string; platformCode: PlatformCode | "all" }>;
  selectedPlatform: PlatformCode | "all";
  selectedStore: string | "all";
  defaultDate: string | null;
  availableDates: string[];
  dateRange: HomeCommandCenterDateRangeState;
  metrics: HomeCommandCenterMetric[];
  trendMetricOptions: Array<{ key: HomeCommandCenterMetricKey; label: string }>;
  trendPoints: HomeCommandCenterDatePoint[];
  targetProgress: HomeCommandCenterTargetProgress[];
  storePerformance: HomeCommandCenterStorePerformance[];
  dataStatus: {
    activeDatasetStatus: string;
    platformCount: number;
    storeCount: number;
    warningCount: number;
    issueCodes: string[];
    qualityHref: string;
  };
  primaryActions: Array<{ label: string; href: string; tone: HomeCommandCenterStatusTone }>;
  notices: string[];
  isEmpty: boolean;
}

export interface HomeCommandCenterLoadResult {
  status: "loading" | "valid" | "empty" | "corrupted" | "error";
  context: HomeCommandCenterRuntimeContext | null;
  message: string;
}
