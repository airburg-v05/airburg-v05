"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { V2HomeChart } from "@/components/saas-v2/home/v2-home-chart";
import { V2HomeMetricGrid } from "@/components/saas-v2/home/v2-home-metric-grid";
import { V2HomeToolbar } from "@/components/saas-v2/home/v2-home-toolbar";
import { V2BrandSeriesManager } from "@/components/saas-v2/series/v2-brand-series-manager";
import {
  loadV2HomeViewModel,
  resolveV2HomeTimeRangePreset,
  validateV2HomeTimeRange,
} from "@/lib/v2/home/v2-home-adapter";
import {
  V2_HOME_METRIC_KEYS,
  type V2HomeComparisonMode,
  type V2HomeLoadOptions,
  type V2HomeLoadResult,
  type V2HomeTimeRange,
  type V2HomeTimeRangeMode,
} from "@/types/v2/home";

export function V2SeriesBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestId = useRef(0);
  const [result, setResult] = useState<V2HomeLoadResult | null>(null);
  const [options, setOptions] = useState<V2HomeLoadOptions>(() => ({
    selectedPlatform: searchParams.get("platform") || undefined,
    selectedStoreIds: searchParams.get("storeId") ? [searchParams.get("storeId")!] : undefined,
    selectedSeriesId: searchParams.get("seriesId") || undefined,
    seriesOptionVisibility: "all",
  }));
  const [busy, setBusy] = useState(true);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [seriesRevision, setSeriesRevision] = useState(0);
  const [chartDisplayMode, setChartDisplayMode] = useState<"single" | "dual">("dual");

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    void loadV2HomeViewModel({ ...options, seriesOptionVisibility: "all" }).then((nextResult) => {
      if (active && requestId.current === currentRequest) {
        setResult(nextResult);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [options, seriesRevision]);

  const replaceQuery = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const updateOptions = useCallback((patch: Partial<V2HomeLoadOptions>) => {
    setInteractionError(null);
    setBusy(true);
    setOptions((current) => ({ ...current, ...patch, seriesOptionVisibility: "all" }));
  }, []);

  const viewModel = result?.status === "ready" ? result.viewModel : null;

  const changeTimeMode = (mode: V2HomeTimeRangeMode) => {
    if (!viewModel?.dataset.dateRange) return;
    updateOptions({
      timeRange: resolveV2HomeTimeRangePreset(mode, viewModel.dataset.dateRange, viewModel.timeRange),
    });
  };

  const changeCustomRange = (timeRange: V2HomeTimeRange) => {
    const error = validateV2HomeTimeRange(timeRange);
    if (error) {
      setInteractionError(error);
      return;
    }
    updateOptions({ timeRange });
  };

  const comparisonMessage = useMemo(() => {
    if (!viewModel || viewModel.comparison.mode === "none") return null;
    return viewModel.comparison.message;
  }, [viewModel]);

  if (!result) {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取系列经营数据…</div>;
  }
  if (result.status === "empty") {
    return (
      <SafeEmptyState
        actionHref={result.uploadHref}
        actionLabel="前往数据接入"
        description="完成经营数据导入后，再创建系列并绑定商品 ID。"
        title="暂无系列数据"
      />
    );
  }
  if (result.status === "error") {
    return (
      <section className="rounded-xl border border-rose-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-slate-900">系列数据暂时无法读取</p>
        <p className="mt-2 text-sm text-slate-500">{result.message}</p>
      </section>
    );
  }

  const readyViewModel = result.viewModel;
  const selectedSeries = readyViewModel.scope.seriesOptions.find(
    (item) => item.id === readyViewModel.scope.selectedSeriesId,
  ) ?? null;

  const selectSeries = (seriesId: string) => {
    replaceQuery({ seriesId });
    updateOptions({ selectedSeriesId: seriesId });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="v2-series-board-dashboard">
      <V2HomeToolbar
        busy={busy}
        comparisonMode={readyViewModel.comparison.mode}
        interactionError={interactionError}
        onComparisonModeChange={(comparisonMode: V2HomeComparisonMode) => updateOptions({ comparisonMode })}
        onCustomRangeChange={changeCustomRange}
        onPlatformChange={(selectedPlatform) => {
          replaceQuery({ platform: selectedPlatform, storeId: null, seriesId: null });
          updateOptions({ selectedPlatform, selectedStoreIds: [], selectedSeriesId: null });
        }}
        onSeriesChange={(selectedSeriesId) => {
          if (!selectedSeriesId) return;
          selectSeries(selectedSeriesId);
        }}
        onStoresChange={(selectedStoreIds) => {
          replaceQuery({ storeId: selectedStoreIds.length === 1 ? selectedStoreIds[0] : null, seriesId: null });
          updateOptions({ selectedStoreIds, selectedSeriesId: null });
        }}
        onTimeModeChange={changeTimeMode}
        scope={readyViewModel.scope}
        showOperatingActions={false}
        timeRange={readyViewModel.timeRange}
        title="系列经营"
      />

      <V2BrandSeriesManager
        onChange={() => setSeriesRevision((revision) => revision + 1)}
        onSelectSeries={selectSeries}
        selectedPlatform={readyViewModel.scope.selectedPlatform}
        selectedSeriesId={readyViewModel.scope.selectedSeriesId}
        selectedStoreIds={readyViewModel.scope.selectedStoreIds}
      >
        {selectedSeries ? (
          <>
            <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-series-metrics">
              <div className="flex h-11 items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{selectedSeries.label} · 经营指标</h2>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{selectedSeries.productCount} 个商品</span>
              </div>
              <V2HomeMetricGrid
                metrics={readyViewModel.metrics}
                order={[...V2_HOME_METRIC_KEYS]}
                selectedMetricKey={readyViewModel.chart.pair.leftMetricKey}
                visibleKeys={[...V2_HOME_METRIC_KEYS]}
              />
            </section>

            <V2HomeChart
              comparisonMessage={comparisonMessage}
              displayMode={chartDisplayMode}
              model={readyViewModel.chart}
              onDisplayModeChange={setChartDisplayMode}
              onModeChange={(chartMode) => updateOptions({ chartMode })}
              onPairChange={(chartPairId) => updateOptions({ chartPairId })}
            />
          </>
        ) : (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">尚未创建可用系列</h2>
            <p className="mt-2 text-sm text-slate-500">点击“新建系列”，粘贴商品 ID 并加载绑定后即可生成系列指标和趋势。</p>
          </section>
        )}
      </V2BrandSeriesManager>
    </div>
  );
}
