"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadV2HomeViewModel,
  resolveV2HomeTimeRangePreset,
  saveV2HomeContext,
  validateV2HomeTimeRange,
} from "@/lib/v2/home/v2-home-adapter";
import {
  V2_HOME_METRIC_KEYS,
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
}

const PREFERENCE_KEY = "airburg:v2-home:ui-preference:v2";
const DEFAULT_PREFERENCE: HomePreference = {
  visibleKeys: [...V2_HOME_METRIC_KEYS],
  order: [...V2_HOME_METRIC_KEYS],
  chartDisplayMode: "dual",
};

const isMetricKey = (value: unknown): value is V2HomeMetricKey =>
  typeof value === "string" && (V2_HOME_METRIC_KEYS as readonly string[]).includes(value);

const readPreference = (): HomePreference => {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const raw = window.sessionStorage.getItem(PREFERENCE_KEY);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<HomePreference>;
    const visibleKeys = Array.isArray(parsed.visibleKeys) ? parsed.visibleKeys.filter(isMetricKey) : [];
    const parsedOrder = Array.isArray(parsed.order) ? parsed.order.filter(isMetricKey) : [];
    const uniqueVisibleKeys = Array.from(new Set(visibleKeys));
    const uniqueOrder = Array.from(new Set(parsedOrder));
    const missingOrderKeys = V2_HOME_METRIC_KEYS.filter((key) => !uniqueOrder.includes(key));
    return {
      visibleKeys: uniqueVisibleKeys.length > 0 ? uniqueVisibleKeys : [...V2_HOME_METRIC_KEYS],
      order: [...uniqueOrder, ...missingOrderKeys],
      chartDisplayMode: parsed.chartDisplayMode === "single" ? "single" : "dual",
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
};

const writePreference = (preference: HomePreference) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
};

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
  const [preference, setPreference] = useState<HomePreference>(readPreference);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    writePreference(preference);
  }, [preference]);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    void loadV2HomeViewModel(options).then((nextResult) => {
      if (active && requestId.current === currentRequest) {
        setResult(nextResult);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [options, reloadToken]);

  const viewModel = result?.status === "ready" ? result.viewModel : null;

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
    visibleKeys: [...V2_HOME_METRIC_KEYS],
    order: [...V2_HOME_METRIC_KEYS],
    chartDisplayMode: "dual",
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
        onPlatformChange={(selectedPlatform) => updateOptions({ selectedPlatform, selectedStoreIds: [], selectedSeriesId: null }, true)}
        onSeriesChange={(selectedSeriesId) => updateOptions({ selectedSeriesId })}
        onStoresChange={(selectedStoreIds) => updateOptions({ selectedStoreIds, selectedSeriesId: null }, true)}
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
          visibleKeys={preference.visibleKeys}
        />
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
          onVisibleKeysChange={(visibleKeys) => setPreference((current) => ({ ...current, visibleKeys }))}
          order={preference.order}
          visibleKeys={preference.visibleKeys}
        />
      ) : null}
    </div>
  );
}
