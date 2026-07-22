"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadV2HomeViewModel,
  resolveV2HomeTimeRangePreset,
  saveV2HomeContext,
  validateV2HomeTimeRange,
} from "@/lib/v2/home/v2-home-adapter";
import {
  V2_HOME_DISPLAY_METRIC_KEYS,
  type V2HomeComparisonMode,
  type V2HomeLoadOptions,
  type V2HomeLoadResult,
  type V2HomeMetricKey,
  type V2HomeTimeRange,
  type V2HomeTimeRangeMode,
  type V2HomeViewModel,
} from "@/types/v2/home";
import { V2HomeChart } from "@/components/saas-v2/home/v2-home-chart";
import {
  V2HomeMetricGrid,
  V2HomeMetricSettings,
} from "@/components/saas-v2/home/v2-home-metric-grid";
import { V2HomeToolbar } from "@/components/saas-v2/home/v2-home-toolbar";

type ChartDisplayMode = "single" | "dual";

interface HomePreference {
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
  chartDisplayMode: ChartDisplayMode;
  selectedSeriesIds: string[];
}

const PREFERENCE_KEY_PREFIX = "airburg:v2-home:ui-preference:v3:";
const LEGACY_PREFERENCE_KEY = "airburg:v2-home:ui-preference:v2";
const DEFAULT_PREFERENCE: HomePreference = {
  visibleKeys: [...V2_HOME_DISPLAY_METRIC_KEYS],
  order: [...V2_HOME_DISPLAY_METRIC_KEYS],
  chartDisplayMode: "dual",
  selectedSeriesIds: [],
};

const isMetricKey = (value: unknown): value is V2HomeMetricKey =>
  typeof value === "string" && (V2_HOME_DISPLAY_METRIC_KEYS as readonly string[]).includes(value);

const migrateDisplayMetricKey = (value: unknown): unknown => {
  if (value === "mtdTurnover") return "visitors";
  if (value === "regionalFulfillmentRate") return "paidBuyers";
  return value;
};

const preferenceFromRaw = (raw: string | null): HomePreference => {
  if (!raw) return DEFAULT_PREFERENCE;
  const parsed = JSON.parse(raw) as Partial<HomePreference>;
  const visibleKeys = Array.isArray(parsed.visibleKeys)
    ? parsed.visibleKeys.map(migrateDisplayMetricKey).filter(isMetricKey)
    : [];
  const parsedOrder = Array.isArray(parsed.order)
    ? parsed.order.map(migrateDisplayMetricKey).filter(isMetricKey)
    : [];
  const uniqueVisibleKeys = Array.from(new Set(visibleKeys));
  const uniqueOrder = Array.from(new Set(parsedOrder));
  const missingOrderKeys = V2_HOME_DISPLAY_METRIC_KEYS.filter((key) => !uniqueOrder.includes(key));
  const selectedSeriesIds = Array.isArray(parsed.selectedSeriesIds)
    ? Array.from(new Set(parsed.selectedSeriesIds.filter((value): value is string => typeof value === "string"))).slice(0, 5)
    : [];
  return {
    visibleKeys: uniqueVisibleKeys.length > 0 ? uniqueVisibleKeys : [...V2_HOME_DISPLAY_METRIC_KEYS],
    order: [...uniqueOrder, ...missingOrderKeys],
    chartDisplayMode: parsed.chartDisplayMode === "single" ? "single" : "dual",
    selectedSeriesIds,
  };
};

const readPreference = (brandId: string): HomePreference => {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const current = window.localStorage.getItem(`${PREFERENCE_KEY_PREFIX}${brandId}`);
    if (current) return preferenceFromRaw(current);
    return preferenceFromRaw(window.sessionStorage.getItem(LEGACY_PREFERENCE_KEY));
  } catch {
    return DEFAULT_PREFERENCE;
  }
};

const writePreference = (brandId: string, preference: HomePreference) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PREFERENCE_KEY_PREFIX}${brandId}`, JSON.stringify(preference));
};

const targetPeriodLabel = (range: V2HomeTimeRange): string =>
  range.startDate.slice(0, 7) === range.endDate.slice(0, 7)
    ? range.startDate.slice(0, 7)
    : `${range.startDate.slice(0, 7)}~${range.endDate.slice(0, 7)}`;

function SelectedSeriesSection({
  viewModel,
  selectedCount,
}: {
  viewModel: V2HomeViewModel;
  selectedCount: number;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="border-t border-slate-100 bg-slate-50/45" data-testid="v2-home-selected-series">
      <div className="flex h-10 items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">已选系列</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{viewModel.keySeries.length}/{selectedCount}</span>
        </div>
        <span className="text-[11px] text-slate-400">在指标设置中调整</span>
      </div>
      {viewModel.keySeries.length === 0 ? (
        <div className="border-t border-slate-100 px-4 py-6 text-center text-xs text-slate-500">当前经营范围没有所选系列数据</div>
      ) : (
        <div className="flex min-w-0 overflow-x-auto border-t border-slate-100">
          {viewModel.keySeries.map((series) => (
            <a key={series.seriesId} className="flex h-[112px] w-[236px] shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-3 transition hover:bg-blue-50/35" href={series.href}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800" title={series.seriesName}>{series.seriesName}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">系列 GSV</p>
                </div>
                <strong className="shrink-0 text-lg leading-5 text-slate-950">{series.actual}</strong>
              </div>
              <div className="mt-auto flex items-center justify-between gap-3 text-[10px]">
                <span className="truncate text-slate-500">目标 <strong className="text-slate-700">{series.mtdTarget}</strong></span>
                <span className="shrink-0 font-semibold text-blue-700">{series.completionRate}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                {series.progress !== null ? <div className="h-full rounded-full bg-blue-600" style={{ width: `${series.progress}%` }} /> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function V2HomeEmptyState({ message, uploadHref }: { message: string; uploadHref: string }) {
  return (
    <section className="flex min-h-[62vh] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-5 text-center shadow-sm">
      <div className="max-w-md">
        <p className="text-lg font-semibold text-slate-900">{message}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          请从统一批量上传入口导入天猫经营文件；页面仅读取安全聚合数据，不展示原始行或敏感明细。
        </p>
        <a className="primary-button mt-5" href={uploadHref}>前往上传</a>
      </div>
    </section>
  );
}

export function V2HomeDashboard() {
  const [result, setResult] = useState<V2HomeLoadResult | null>(null);
  const [options, setOptions] = useState<V2HomeLoadOptions>({});
  const [preference, setPreference] = useState<HomePreference>(DEFAULT_PREFERENCE);
  const [preferenceBrandId, setPreferenceBrandId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (preferenceBrandId) writePreference(preferenceBrandId, preference);
  }, [preference, preferenceBrandId]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    void loadV2HomeViewModel({
      ...options,
      selectedSeriesId: null,
      selectedHomeSeriesIds: preference.selectedSeriesIds,
      seriesOptionVisibility: "all",
      targetScope: "brand",
    }).then((nextResult) => {
      if (active && requestId.current === currentRequest) {
        setResult(nextResult);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [options, preference.selectedSeriesIds, reloadToken]);

  const viewModel = result?.status === "ready" ? result.viewModel : null;

  useEffect(() => {
    if (!viewModel) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const brandId = viewModel.scope.brandId;
      if (preferenceBrandId !== brandId) {
        const stored = readPreference(brandId);
        const availableIds = new Set(viewModel.scope.seriesOptions.map((item) => item.id));
        setPreference({
          ...stored,
          selectedSeriesIds: stored.selectedSeriesIds.filter((id) => availableIds.has(id)),
        });
        setPreferenceBrandId(brandId);
        return;
      }
      const availableIds = new Set(viewModel.scope.seriesOptions.map((item) => item.id));
      const validIds = preference.selectedSeriesIds.filter((id) => availableIds.has(id));
      if (validIds.length !== preference.selectedSeriesIds.length) {
        setPreference((current) => ({ ...current, selectedSeriesIds: validIds }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [preference.selectedSeriesIds, preferenceBrandId, viewModel]);

  const persistContext = useCallback((nextOptions: V2HomeLoadOptions, current: V2HomeViewModel) => {
    const nextPairId = nextOptions.chartPairId ?? current.chart.pair.id;
    const nextPair = current.chart.availablePairs.find((pair) => pair.id === nextPairId) ?? current.chart.pair;
    void saveV2HomeContext({
      brandId: current.scope.brandId,
      selectedPlatform: nextOptions.selectedPlatform !== undefined
        ? nextOptions.selectedPlatform
        : current.scope.selectedPlatform,
      selectedStoreIds: nextOptions.selectedStoreIds ?? current.scope.selectedStoreIds,
      timeRange: nextOptions.timeRange ?? current.timeRange,
      chartMode: nextOptions.chartMode ?? current.chart.mode,
      selectedMetric: nextPair.leftMetricKey,
    });
  }, []);

  const updateOptions = useCallback((patch: Partial<V2HomeLoadOptions>, persist = false) => {
    const next = { ...options, ...patch };
    setInteractionError(null);
    setBusy(true);
    setOptions(next);
    if (persist && viewModel) persistContext(next, viewModel);
  }, [options, persistContext, viewModel]);

  const changeTimeMode = (mode: V2HomeTimeRangeMode) => {
    if (!viewModel) return;
    const timeRange = resolveV2HomeTimeRangePreset(mode, viewModel.dataset.dateRange!, viewModel.timeRange);
    updateOptions({ timeRange }, true);
  };

  const changeCustomRange = (timeRange: V2HomeTimeRange) => {
    const error = validateV2HomeTimeRange(timeRange);
    if (error) {
      setInteractionError(error);
      return;
    }
    updateOptions({ timeRange }, true);
  };

  const resetPreference = () => setPreference({
    visibleKeys: [...V2_HOME_DISPLAY_METRIC_KEYS],
    order: [...V2_HOME_DISPLAY_METRIC_KEYS],
    chartDisplayMode: "dual",
    selectedSeriesIds: [],
  });

  const comparisonMessage = useMemo(() => {
    if (!viewModel || viewModel.comparison.mode === "none") return null;
    return viewModel.comparison.message;
  }, [viewModel]);

  if (!result) {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取经营数据…</div>;
  }
  if (result.status === "empty") {
    return <V2HomeEmptyState message={result.message} uploadHref={result.uploadHref} />;
  }
  if (result.status === "error") {
    return (
      <section className="flex min-h-[62vh] items-center justify-center rounded-lg border border-rose-200 bg-white px-5 text-center">
        <div>
          <p className="text-base font-semibold text-slate-900">经营数据暂时无法读取</p>
          <p className="mt-2 text-sm text-slate-500">{result.message}</p>
          <button
            className="secondary-button mt-4"
            onClick={() => {
              setBusy(true);
              setReloadToken((token) => token + 1);
            }}
            type="button"
          >
            重新读取
          </button>
        </div>
      </section>
    );
  }
  const readyViewModel = result.viewModel;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="v2-home-dashboard">
      <V2HomeToolbar
        busy={busy}
        comparisonMode={readyViewModel.comparison.mode}
        interactionError={interactionError}
        onComparisonModeChange={(comparisonMode: V2HomeComparisonMode) => updateOptions({ comparisonMode })}
        onCustomRangeChange={changeCustomRange}
        onPlatformChange={(selectedPlatform) => updateOptions({ selectedPlatform, selectedStoreIds: [] }, true)}
        onStoresChange={(selectedStoreIds) => updateOptions({ selectedStoreIds }, true)}
        onTimeModeChange={changeTimeMode}
        scope={readyViewModel.scope}
        timeRange={readyViewModel.timeRange}
      />

      <section
        className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white"
        data-home-region="metrics"
      >
        <div className="flex h-11 items-center justify-between gap-3 px-4">
          <h2 className="text-base font-semibold text-slate-900">经营指标</h2>
          <div className="flex items-center gap-2">
            {busy ? <span className="sr-only" aria-live="polite">正在更新</span> : null}
            <button
              className="text-xs font-semibold text-blue-700 hover:text-blue-800"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              指标设置
            </button>
          </div>
        </div>
        <V2HomeMetricGrid
          metrics={readyViewModel.metrics}
          order={preference.order}
          selectedMetricKey={readyViewModel.chart.pair.leftMetricKey}
          targetPeriodLabel={targetPeriodLabel(readyViewModel.timeRange)}
          visibleKeys={preference.visibleKeys}
        />
        <SelectedSeriesSection selectedCount={preference.selectedSeriesIds.length} viewModel={readyViewModel} />
      </section>

      <V2HomeChart
        comparisonMessage={comparisonMessage}
        displayMode={preference.chartDisplayMode}
        model={readyViewModel.chart}
        onDisplayModeChange={(chartDisplayMode) => setPreference((current) => ({ ...current, chartDisplayMode }))}
        onModeChange={(chartMode) => updateOptions({ chartMode }, true)}
        onPairChange={(chartPairId) => updateOptions({ chartPairId }, true)}
      />

      {settingsOpen ? (
        <V2HomeMetricSettings
          metrics={readyViewModel.metrics}
          onClose={() => setSettingsOpen(false)}
          onOrderChange={(order) => setPreference((current) => ({ ...current, order }))}
          onReset={resetPreference}
          onSelectedSeriesIdsChange={(selectedSeriesIds) => setPreference((current) => ({ ...current, selectedSeriesIds }))}
          onVisibleKeysChange={(visibleKeys) => setPreference((current) => ({ ...current, visibleKeys }))}
          order={preference.order}
          selectedSeriesIds={preference.selectedSeriesIds}
          seriesOptions={readyViewModel.scope.seriesOptions}
          visibleKeys={preference.visibleKeys}
        />
      ) : null}
    </div>
  );
}
