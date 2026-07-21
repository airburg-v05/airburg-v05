"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import {
  V2SimpleTrendChart,
  type V2SimpleTrendMetricOption,
} from "@/components/saas-v2/charts/v2-simple-trend-chart";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import type { MetricV2 } from "@/components/saas-v2/data";
import type { PlatformCode } from "@/lib/v05/domain/models";
import {
  buildEmptyStoreBoardViewModel,
  buildLegacyStoreBoardViewModel,
  buildV2StoreBoardViewModel,
  formatPercent,
  formatTargetMetricValue,
  loadStoreBoardContext,
  type StoreBoardMetricKey,
  type StoreBoardPeriod,
  type StoreBoardViewModel,
} from "@/lib/v05/store-board";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; viewModel: StoreBoardViewModel }
  | { status: "error"; message: string };

type TrendMode = "mtd" | "dly";

const PERIODS: StoreBoardPeriod[] = ["day", "week", "month", "custom"];
const PERIOD_LABEL: Record<StoreBoardPeriod, string> = { day: "日", week: "周", month: "月", custom: "自定义" };
const TREND_OPTIONS: V2SimpleTrendMetricOption[] = [
  { key: "gmv", label: "GMV", format: "money" },
  { key: "gsv", label: "GSV", format: "money" },
  { key: "visitors", label: "访客", format: "integer" },
  { key: "paidBuyers", label: "支付买家", format: "integer" },
  { key: "conversionRate", label: "转化率", format: "percent" },
  { key: "adSpend", label: "推广花费", format: "money" },
];

const isPeriod = (value: string | null): value is StoreBoardPeriod =>
  value !== null && PERIODS.includes(value as StoreBoardPeriod);

const isTrendMetric = (value: string | null): value is StoreBoardMetricKey =>
  value !== null && TREND_OPTIONS.some((item) => item.key === value);

const clampProgress = (value: number | null): number => {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
};

const metricCardUnit = (label: string): string | undefined => {
  if (label.includes("率")) return "%";
  if (label === "ROI") return "倍";
  if (label.includes("访客") || label.includes("买家")) return "人";
  if (label.includes("花费") || label.includes("GMV") || label.includes("GSV")) return "元";
  return undefined;
};

const metricRowsFromViewModel = (viewModel: StoreBoardViewModel): MetricV2[] =>
  viewModel.metrics.map((metric, index) => {
    const target = viewModel.targetProgress.find((item) => item.metricLabel === metric.label || item.metricKey === metric.key);
    return {
      label: metric.label,
      value: metric.formattedValue,
      unit: metricCardUnit(metric.label),
      mtdTarget: "--",
      totalTarget: target ? formatTargetMetricValue(target.metricKey, target.targetValue) : "--",
      delta: target ? formatTargetMetricValue(target.metricKey, target.gapValue) : "--",
      completion: target?.progressRate !== null && target?.progressRate !== undefined ? formatPercent(target.progressRate) : "--",
      progress: target ? clampProgress(target.progressRate) : 0,
      note: index === 0 ? viewModel.notices[0] ?? "按当前店铺范围展示。" : metric.helper,
    };
  });

export function V2StoreBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const selectedPeriod = isPeriod(searchParams.get("period")) ? searchParams.get("period") as StoreBoardPeriod : "day";
  const selectedDate = searchParams.get("date");
  const customStart = searchParams.get("start");
  const customEnd = searchParams.get("end");
  const trendMetric = isTrendMetric(searchParams.get("metric")) ? searchParams.get("metric") as StoreBoardMetricKey : "gsv";
  const trendMode: TrendMode = searchParams.get("chart") === "dly" ? "dly" : "mtd";
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  const replaceQuery = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    let active = true;
    void loadStoreBoardContext({ platformCode: requestedPlatform, storeId: requestedStoreId }).then((result) => {
      if (!active) return;
      if (!result.context) {
        setState({ status: "ready", viewModel: buildEmptyStoreBoardViewModel(result.message) });
        return;
      }
      if (result.status === "error") {
        setState({ status: "error", message: result.message });
        return;
      }
      const context = result.context;
      if (context.dataset) {
        const defaultStore = context.dataset.stores.find((item) => item.status === "active") ?? null;
        const platformCode = (requestedPlatform ?? defaultStore?.platformCode ?? null) as PlatformCode | null;
        const storeId = requestedStoreId ?? defaultStore?.storeId ?? null;
        if (!platformCode || !storeId) {
          setState({ status: "ready", viewModel: buildEmptyStoreBoardViewModel("当前没有可读取的店铺数据。") });
          return;
        }
        setState({
          status: "ready",
          viewModel: buildV2StoreBoardViewModel({
            dataset: context.dataset,
            platformCode,
            storeId,
            selectedPeriod,
            selectedDate,
            customDateRange: { start: customStart, end: customEnd },
          }),
        });
        return;
      }
      if (context.legacyAnalysis) {
        setState({
          status: "ready",
          viewModel: buildLegacyStoreBoardViewModel({
            analysis: context.legacyAnalysis,
            targets: context.legacyTargets,
            selectedPeriod,
            selectedDate,
            customDateRange: { start: customStart, end: customEnd },
            fallbackNotice: context.message,
          }),
        });
        return;
      }
      setState({ status: "ready", viewModel: buildEmptyStoreBoardViewModel(result.message) });
    }).catch(() => {
      if (active) setState({ status: "error", message: "读取店铺数据失败，请刷新后重试。" });
    });
    return () => {
      active = false;
    };
  }, [customEnd, customStart, requestedPlatform, requestedStoreId, selectedDate, selectedPeriod]);

  const viewModel = state.status === "ready" ? state.viewModel : null;
  const metricRows = useMemo(() => viewModel ? metricRowsFromViewModel(viewModel) : [], [viewModel]);
  const trendPoints = useMemo(() => viewModel?.trendPoints.map((point) => ({
    date: point.date,
    values: {
      gmv: point.gmv,
      gsv: point.gsv,
      visitors: point.visitors,
      paidBuyers: point.paidBuyers,
      conversionRate: point.conversionRate,
      adSpend: point.adSpend,
    },
    cumulative: {
      gmv: point.cumulative.gmv,
      gsv: point.cumulative.gsv,
      visitors: point.cumulative.visitors,
      paidBuyers: point.cumulative.paidBuyers,
      conversionRate: point.cumulative.conversionRate,
      adSpend: point.cumulative.adSpend,
    },
  })) ?? [], [viewModel]);

  if (state.status === "loading") return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取店铺经营数据…</div>;
  if (state.status === "error") return <section className="rounded-xl border border-rose-200 bg-white p-6 text-center"><p className="font-semibold text-slate-900">店铺数据暂时无法读取</p><p className="mt-2 text-sm text-slate-500">{state.message}</p></section>;
  if (!viewModel?.storeContext || viewModel.statusLabel === "暂无数据") {
    return <SafeEmptyState actionHref="/v2/upload" actionLabel="前往数据接入" description="完成数据导入后，再返回查看店铺中心。" title="暂无店铺数据" />;
  }

  const platformCodes = Array.from(new Set(viewModel.storeContext.availableStores.map((item) => item.platformCode)));

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="v2-store-board-dashboard">
      <section className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4" data-testid="v2-store-scope-bar">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-1 text-xl font-semibold text-slate-900">店铺经营</h1>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{viewModel.statusLabel}</span>
          <span className="text-xs text-slate-500">{viewModel.storeContext.platformLabel} · {viewModel.storeContext.storeName}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
          <div className="flex h-8 items-center rounded-md bg-slate-100 p-0.5">
            {PERIODS.map((period) => <button key={period} className={`h-7 rounded px-2.5 text-xs font-semibold ${selectedPeriod === period ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => replaceQuery({ period, date: null })} type="button">{PERIOD_LABEL[period]}</button>)}
          </div>
          <label className="text-[11px] font-semibold text-slate-500">平台<select className="ml-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" onChange={(event) => replaceQuery({ platform: event.target.value || null, storeId: null })} value={viewModel.storeContext.platformCode}>{platformCodes.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-slate-500">店铺<select className="ml-1 h-8 max-w-52 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" onChange={(event) => {
            const selected = viewModel.storeContext?.availableStores.find((item) => item.value === event.target.value);
            const params = new URLSearchParams(selected?.href.split("?")[1] ?? "");
            replaceQuery({ platform: params.get("platform"), storeId: params.get("storeId") });
          }} value={viewModel.storeContext.storeKey}>{viewModel.storeContext.availableStores.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="text-[11px] font-semibold text-slate-500">日期<select className="ml-1 h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700" onChange={(event) => replaceQuery({ date: event.target.value || null })} value={viewModel.dateRange.selectedDate ?? ""}>{viewModel.availableDates.map((date) => <option key={date} value={date}>{date}</option>)}</select></label>
          <span className="ml-auto text-xs text-slate-500">{viewModel.dateRange.coverageText}</span>
        </div>
        {selectedPeriod === "custom" ? <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2"><input className="h-8 rounded-md border border-slate-200 px-2 text-xs" aria-label="起始日期" onChange={(event) => replaceQuery({ start: event.target.value || null })} type="date" value={customStart ?? ""} /><input className="h-8 rounded-md border border-slate-200 px-2 text-xs" aria-label="结束日期" onChange={(event) => replaceQuery({ end: event.target.value || null })} type="date" value={customEnd ?? ""} /></div> : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex h-11 items-center px-4"><h2 className="text-base font-semibold text-slate-900">店铺经营指标</h2></div>
        <MetricGridV2 metrics={metricRows} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-base font-semibold text-slate-900">店铺趋势</h2>
        <V2SimpleTrendChart emptyTitle="当前范围暂无店铺趋势数据" metricKey={trendMetric} metricOptions={TREND_OPTIONS} mode={trendMode} onMetricChange={(metric) => replaceQuery({ metric })} onModeChange={(chart) => replaceQuery({ chart })} points={trendPoints} />
      </section>
    </div>
  );
}
