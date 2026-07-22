"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { V2HomeChart } from "@/components/saas-v2/home/v2-home-chart";
import { V2HomeMetricGrid } from "@/components/saas-v2/home/v2-home-metric-grid";
import { V2HomeToolbar } from "@/components/saas-v2/home/v2-home-toolbar";
import {
  loadV2HomeViewModel,
  resolveV2HomeTimeRangePreset,
  validateV2HomeTimeRange,
} from "@/lib/v2/home/v2-home-adapter";
import {
  V2_HOME_DISPLAY_METRIC_KEYS,
  type V2HomeComparisonMode,
  type V2HomeLoadOptions,
  type V2HomeLoadResult,
  type V2HomeTimeRange,
  type V2HomeTimeRangeMode,
} from "@/types/v2/home";

const targetPeriodLabel = (range: V2HomeTimeRange): string =>
  range.startDate.slice(0, 7) === range.endDate.slice(0, 7)
    ? range.startDate.slice(0, 7)
    : `${range.startDate.slice(0, 7)}~${range.endDate.slice(0, 7)}`;

export function V2StoreBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestId = useRef(0);
  const needsSingleStore = useRef(!searchParams.get("storeId"));
  const [result, setResult] = useState<V2HomeLoadResult | null>(null);
  const [options, setOptions] = useState<V2HomeLoadOptions>(() => ({
    selectedPlatform: searchParams.get("platform") || undefined,
    selectedStoreIds: searchParams.get("storeId") ? [searchParams.get("storeId")!] : undefined,
    targetScope: "platform",
  }));
  const [busy, setBusy] = useState(true);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [chartDisplayMode, setChartDisplayMode] = useState<"single" | "dual">("dual");

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
    setOptions((current) => ({ ...current, ...patch, targetScope: "platform" }));
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    void loadV2HomeViewModel({ ...options, targetScope: "platform" }).then((nextResult) => {
      if (active && requestId.current === currentRequest) {
        setResult(nextResult);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [options]);

  const viewModel = result?.status === "ready" ? result.viewModel : null;

  useEffect(() => {
    if (!viewModel || !needsSingleStore.current || viewModel.scope.storeOptions.length === 0) return;
    needsSingleStore.current = false;
    const firstStore = viewModel.scope.storeOptions[0]!;
    replaceQuery({ platform: firstStore.platformCode, storeId: firstStore.id });
    updateOptions({ selectedPlatform: firstStore.platformCode, selectedStoreIds: [firstStore.id] });
  }, [replaceQuery, updateOptions, viewModel]);

  const comparisonMessage = useMemo(() => {
    if (!viewModel || viewModel.comparison.mode === "none") return null;
    return viewModel.comparison.message;
  }, [viewModel]);

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

  if (!result) {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取店铺经营数据…</div>;
  }
  if (result.status === "empty") {
    return <SafeEmptyState actionHref={result.uploadHref} actionLabel="前往数据接入" description="完成经营数据导入后，再返回查看店铺中心。" title="暂无店铺数据" />;
  }
  if (result.status === "error") {
    return <section className="rounded-xl border border-rose-200 bg-white p-6 text-center"><p className="font-semibold text-slate-900">店铺数据暂时无法读取</p><p className="mt-2 text-sm text-slate-500">{result.message}</p></section>;
  }

  const readyViewModel = result.viewModel;
  const selectedStoreNames = readyViewModel.scope.storeOptions
    .filter((store) => readyViewModel.scope.selectedStoreIds.includes(store.id))
    .map((store) => store.label);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="v2-store-board-dashboard">
      <V2HomeToolbar
        busy={busy}
        comparisonMode={readyViewModel.comparison.mode}
        interactionError={interactionError}
        onComparisonModeChange={(comparisonMode: V2HomeComparisonMode) => updateOptions({ comparisonMode })}
        onCustomRangeChange={changeCustomRange}
        onPlatformChange={(selectedPlatform) => {
          needsSingleStore.current = true;
          replaceQuery({ platform: selectedPlatform, storeId: null });
          updateOptions({ selectedPlatform, selectedStoreIds: [] });
        }}
        onStoresChange={(selectedStoreIds) => {
          needsSingleStore.current = false;
          replaceQuery({ storeId: selectedStoreIds.length === 1 ? selectedStoreIds[0] : null });
          updateOptions({ selectedStoreIds });
        }}
        onTimeModeChange={changeTimeMode}
        scope={readyViewModel.scope}
        showOperatingActions={false}
        storeSelectionMode="single"
        timeRange={readyViewModel.timeRange}
        title="店铺经营"
      />

      <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-store-metrics">
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">店铺经营指标</h2>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{selectedStoreNames.join("、") || "当前店铺范围"}</p>
          </div>
          {readyViewModel.scope.selectedStoreIds.length > 1 ? <span className="shrink-0 text-[11px] text-amber-700">多店汇总不合并单店目标</span> : null}
        </div>
        <V2HomeMetricGrid
          metrics={readyViewModel.metrics}
          order={[...V2_HOME_DISPLAY_METRIC_KEYS]}
          selectedMetricKey={readyViewModel.chart.pair.leftMetricKey}
          targetPeriodLabel={targetPeriodLabel(readyViewModel.timeRange)}
          visibleKeys={[...V2_HOME_DISPLAY_METRIC_KEYS]}
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
    </div>
  );
}
