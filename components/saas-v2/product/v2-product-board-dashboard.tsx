"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { V2HomeChart } from "@/components/saas-v2/home/v2-home-chart";
import { V2HomeMetricGrid } from "@/components/saas-v2/home/v2-home-metric-grid";
import { V2HomeToolbar } from "@/components/saas-v2/home/v2-home-toolbar";
import { V2BrandProductManager } from "@/components/saas-v2/product/v2-brand-product-manager";
import {
  loadV2HomeViewModel,
  resolveV2HomeTimeRangePreset,
  validateV2HomeTimeRange,
} from "@/lib/v2/home/v2-home-adapter";
import type { BrandProductRecord } from "@/lib/v2/workspace/brand-products";
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

export function V2ProductBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestId = useRef(0);
  const recordsRef = useRef<BrandProductRecord[]>([]);
  const [records, setRecords] = useState<BrandProductRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(searchParams.get("product"));
  const [result, setResult] = useState<V2HomeLoadResult | null>(null);
  const [options, setOptions] = useState<V2HomeLoadOptions>(() => ({
    selectedPlatform: searchParams.get("platform") || undefined,
    selectedStoreIds: searchParams.get("storeId") ? [searchParams.get("storeId")!] : undefined,
    targetScope: "product",
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
    setOptions((current) => ({ ...current, ...patch, targetScope: "product" }));
  }, []);

  const selectProduct = useCallback((recordId: string) => {
    const record = recordsRef.current.find((item) => item.recordId === recordId);
    if (!record) return;
    setSelectedRecordId(record.recordId);
    replaceQuery({
      product: record.recordId,
      platform: record.platformCode,
      storeId: record.storeId,
    });
    updateOptions({
      selectedPlatform: record.platformCode,
      selectedStoreIds: [record.storeId],
      selectedProductRef: {
        platformCode: record.platformCode,
        storeId: record.storeId,
        productId: record.productId,
      },
    });
  }, [replaceQuery, updateOptions]);

  const handleRecordsChange = useCallback((next: BrandProductRecord[]) => {
    recordsRef.current = next;
    setRecords(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      if (records.length === 0) {
        if (selectedRecordId) setSelectedRecordId(null);
        return;
      }
      if (selectedRecordId && records.some((record) => record.recordId === selectedRecordId)) return;
      selectProduct(records[0]!.recordId);
    });
    return () => {
      cancelled = true;
    };
  }, [records, selectProduct, selectedRecordId]);

  const selectedProduct = records.find((record) => record.recordId === selectedRecordId) ?? null;

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let active = true;
    const selectedProductRef = selectedProduct ? {
      platformCode: selectedProduct.platformCode,
      storeId: selectedProduct.storeId,
      productId: selectedProduct.productId,
    } : null;
    void loadV2HomeViewModel({
      ...options,
      selectedProductRef,
      targetScope: "product",
    }).then((nextResult) => {
      if (active && requestId.current === currentRequest) {
        setResult(nextResult);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [options, selectedProduct]);

  const viewModel = result?.status === "ready" ? result.viewModel : null;
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

  const selectForScope = (platformCode: string | null, storeIds: string[]) => {
    const nextRecord = records.find((record) =>
      (!platformCode || record.platformCode === platformCode) &&
      (storeIds.length === 0 || storeIds.includes(record.storeId)),
    ) ?? null;
    if (nextRecord) {
      selectProduct(nextRecord.recordId);
      return;
    }
    setSelectedRecordId(null);
    replaceQuery({ product: null });
  };

  if (!result) {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取商品经营数据…</div>;
  }
  if (result.status === "empty") {
    return <SafeEmptyState actionHref={result.uploadHref} actionLabel="前往数据接入" description="先导入经营数据，再手动添加需要跟踪的商品。" title="暂无商品数据" />;
  }
  if (result.status === "error") {
    return <section className="rounded-xl border border-rose-200 bg-white p-6 text-center"><p className="font-semibold text-slate-900">商品数据暂时无法读取</p><p className="mt-2 text-sm text-slate-500">{result.message}</p></section>;
  }

  const readyViewModel = result.viewModel;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="v2-product-board-dashboard">
      <V2HomeToolbar
        busy={busy}
        comparisonMode={readyViewModel.comparison.mode}
        interactionError={interactionError}
        onComparisonModeChange={(comparisonMode: V2HomeComparisonMode) => updateOptions({ comparisonMode })}
        onCustomRangeChange={changeCustomRange}
        onPlatformChange={(selectedPlatform) => {
          replaceQuery({ platform: selectedPlatform, storeId: null, product: null });
          updateOptions({ selectedPlatform, selectedStoreIds: [] });
          selectForScope(selectedPlatform, []);
        }}
        onStoresChange={(selectedStoreIds) => {
          replaceQuery({ storeId: selectedStoreIds.length === 1 ? selectedStoreIds[0] : null, product: null });
          updateOptions({ selectedStoreIds });
          selectForScope(readyViewModel.scope.selectedPlatform, selectedStoreIds);
        }}
        onTimeModeChange={changeTimeMode}
        scope={readyViewModel.scope}
        showOperatingActions={false}
        timeRange={readyViewModel.timeRange}
        title="商品经营"
      />

      <V2BrandProductManager
        onRecordsChange={handleRecordsChange}
        onSelectProduct={selectProduct}
        selectedPlatform={readyViewModel.scope.selectedPlatform}
        selectedRecordId={selectedRecordId}
        selectedStoreIds={readyViewModel.scope.selectedStoreIds}
      >
        {selectedProduct ? (
          <>
            <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-product-metrics">
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{selectedProduct.displayName} · 经营指标</h2>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">ID {selectedProduct.productId}</p>
                </div>
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
          </>
        ) : (
          <section className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <h2 className="text-base font-semibold text-slate-900">尚未手动添加商品</h2>
            <p className="mt-2 text-sm text-slate-500">点击“添加商品”，粘贴商品 ID 并可上传方图；保存后才会进入商品中心。</p>
          </section>
        )}
      </V2BrandProductManager>
    </div>
  );
}
