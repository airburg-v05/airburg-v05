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

const PREFERENCE_KEY = "airburg:v2-home:ui-preference:v1";
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
    const missingOrderKeys = V2_HOME_METRIC_KEYS.filter((key) => !parsedOrder.includes(key));
    return {
      visibleKeys: visibleKeys.length > 0 ? Array.from(new Set(visibleKeys)) : [...V2_HOME_METRIC_KEYS],
      order: [...Array.from(new Set(parsedOrder)), ...missingOrderKeys],
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

function KeySeriesSection({ viewModel }: { viewModel: V2HomeViewModel }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="v2-home-key-series">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">重点系列 GSV</h2>
          <p className="mt-1 text-xs text-slate-500">读取当前已维护系列配置，不自动创建系列。</p>
        </div>
        <a className="shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-800" href="/v2/series-board">查看系列</a>
      </div>
      {viewModel.keySeries.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-slate-800">尚未维护重点系列</p>
          <p className="mt-1 text-xs text-slate-500">配置系列后，这里只展示 3-5 个系列的 GSV 目标状态。</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {viewModel.keySeries.map((series) => (
            <a
              key={series.seriesId}
              className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 hover:bg-white"
              href={series.href}
            >
              <p className="truncate text-sm font-semibold text-slate-800" title={series.seriesName}>{series.seriesName}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{series.actual}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div><dt className="text-slate-400">MTD目标</dt><dd className="mt-0.5 truncate font-semibold text-slate-700">{series.mtdTarget}</dd></div>
                <div><dt className="text-slate-400">总目标</dt><dd className="mt-0.5 truncate font-semibold text-slate-700">{series.totalTarget}</dd></div>
                <div><dt className="text-slate-400">差值</dt><dd className="mt-0.5 truncate font-semibold text-slate-700">{series.difference}</dd></div>
                <div><dt className="text-slate-400">完成率</dt><dd className="mt-0.5 truncate font-semibold text-slate-700">{series.completionRate}</dd></div>
              </dl>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                {series.progress !== null ? <div className="h-full rounded-full bg-emerald-500" style={{ width: `${series.progress}%` }} /> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function DataHealthSection({ viewModel }: { viewModel: V2HomeViewModel }) {
  const health = viewModel.dataHealth;
  const rows = [
    { label: "数据缺失", value: health.missingSourceCount },
    { label: "安全跳过", value: health.safeSkippedCount },
    { label: "重复隔离", value: health.dedupedRecordCount },
    { label: "不可计算", value: health.nonComputableMetricCount },
  ];
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="v2-home-data-health">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-950">数据摘要</h2>
          <p className="mt-1 text-xs text-slate-500">仅显示安全聚合状态。</p>
        </div>
        <a className="text-xs font-semibold text-blue-700 hover:text-blue-800" href="/v2/data-health">详情</a>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{row.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{row.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <p>解析成功 {health.filesParsed} · 失败 {health.filesFailed}</p>
        {health.safeIssueCodes.length > 0 ? (
          <p className="mt-1 truncate" title={health.safeIssueCodes.join(" / ")}>安全 issue：{health.safeIssueCodes.join(" / ")}</p>
        ) : null}
      </div>
    </aside>
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
        dataStatusLabel={readyViewModel.dataStatusLabel}
        datasetRange={readyViewModel.dataset.dateRange!}
        onComparisonModeChange={(comparisonMode: V2HomeComparisonMode) => updateOptions({ comparisonMode })}
        onCustomRangeChange={changeCustomRange}
        onOpenMetricSettings={() => setSettingsOpen(true)}
        onPlatformChange={(selectedPlatform) => updateOptions({ selectedPlatform, selectedStoreIds: [] }, true)}
        onStoresChange={(selectedStoreIds) => updateOptions({ selectedStoreIds }, true)}
        onTimeModeChange={changeTimeMode}
        scope={readyViewModel.scope}
        timeRange={readyViewModel.timeRange}
      />

      {interactionError ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">{interactionError}</div>
      ) : null}

      <section className="min-w-0">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">经营指标</h2>
            <p className="mt-1 text-xs text-slate-500">默认展示全部 17 项，目标仅作为展示叠加，不改变实际值。</p>
          </div>
          {busy ? <span className="text-xs font-medium text-blue-700">正在更新…</span> : null}
        </div>
        <V2HomeMetricGrid
          metrics={readyViewModel.metrics}
          order={preference.order}
          visibleKeys={preference.visibleKeys}
        />
      </section>

      <KeySeriesSection viewModel={readyViewModel} />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(220px,1fr)]">
        <V2HomeChart
          comparisonMessage={comparisonMessage}
          displayMode={preference.chartDisplayMode}
          model={readyViewModel.chart}
          onDisplayModeChange={(chartDisplayMode) => setPreference((current) => ({ ...current, chartDisplayMode }))}
          onModeChange={(chartMode) => updateOptions({ chartMode }, true)}
          onPairChange={(chartPairId) => updateOptions({ chartPairId }, true)}
        />
        <DataHealthSection viewModel={readyViewModel} />
      </section>

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
