"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import type { MetricV2 } from "@/components/saas-v2/data";
import { mapHrefToAuthorizedV2Route } from "@/lib/v2/route-mapping";
import type { PlatformCode } from "@/lib/v05/domain/models";
import {
  buildEmptySeriesBoardViewModel,
  buildLegacySeriesBoardViewModel,
  buildV2SeriesBoardViewModel,
  formatMoney,
  formatPercent,
  formatRoi,
  formatSeriesTargetMetricValue,
  loadSeriesBoardContext,
  type SeriesBoardMetricKey,
  type SeriesBoardPeriod,
  type SeriesBoardViewModel,
} from "@/lib/v05/series-board";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; viewModel: SeriesBoardViewModel }
  | { status: "error"; message: string };

type TrendMode = "mtd" | "dly";

const PERIODS: SeriesBoardPeriod[] = ["day", "week", "month", "custom"];
const PERIOD_LABEL: Record<SeriesBoardPeriod, string> = {
  day: "日",
  week: "周",
  month: "月",
  custom: "自定义",
};

const TREND_LABELS: Record<SeriesBoardMetricKey, string> = {
  gmv: "GMV",
  gsv: "GSV",
  visitors: "访客",
  paidBuyers: "支付买家",
  conversionRate: "转化率",
  adSpend: "推广花费",
};

const isPeriod = (value: string | null): value is SeriesBoardPeriod =>
  value !== null && PERIODS.includes(value as SeriesBoardPeriod);

const isTrendMetric = (value: string | null): value is SeriesBoardMetricKey =>
  value !== null && Object.prototype.hasOwnProperty.call(TREND_LABELS, value);

const clampProgress = (value: number | null): number => {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value * 100));
};

const metricValueLabel = (metricKey: SeriesBoardMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") {
    if (value === null || !Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  }
  if (metricKey === "adSpend") return formatMoney(value);
  return formatMoney(value);
};

const metricCardUnit = (label: string): string | undefined => {
  if (label.includes("率")) return "%";
  if (label === "ROI") return "倍";
  if (label.includes("访客") || label.includes("买家")) return "人";
  if (label.includes("花费") || label.includes("GMV") || label.includes("GSV")) return "元";
  return undefined;
};

const blockedRouteNode = (key: string, reason: string) => (
  <span
    key={key}
    className="text-xs font-semibold text-amber-700"
    title={reason}
  >
    暂未开放
  </span>
);

const actionNodeFromLegacyHref = (
  key: string,
  href: string | null | undefined,
  label: string,
) => {
  const mapped = mapHrefToAuthorizedV2Route(href);
  if (!mapped) return "—";
  if (mapped.status === "mapped" && mapped.href) {
    return <Link key={key} className="text-blue-700 hover:text-blue-800" href={mapped.href}>{label}</Link>;
  }
  return blockedRouteNode(key, mapped.reason);
};

const metricRowsFromViewModel = (viewModel: SeriesBoardViewModel): MetricV2[] =>
  viewModel.metrics.map((metric, index) => {
    const target = viewModel.targetProgress.find((item) => item.metricLabel === metric.label || item.metricKey === metric.key);
    return {
      label: metric.label,
      value: metric.formattedValue,
      unit: metricCardUnit(metric.label),
      mtdTarget: "--",
      totalTarget: target ? formatSeriesTargetMetricValue(target.metricKey, target.targetValue) : "--",
      delta: target ? formatSeriesTargetMetricValue(target.metricKey, target.gapValue) : "--",
      completion: target && target.progressRate !== null ? formatPercent(target.progressRate) : "--",
      progress: target ? clampProgress(target.progressRate) : 0,
      note: index === 0 ? viewModel.notices[0] ?? "按当前系列范围展示。" : metric.helper,
    };
  });

const axisLabel = (metricKey: SeriesBoardMetricKey, value: number): string => {
  if (metricKey === "conversionRate") return `${Math.round(value * 100)}%`;
  if (metricKey === "visitors" || metricKey === "paidBuyers") return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
};

const buildTrendSegments = ({
  values,
  xPositions,
  yFor,
  baselineY,
}: {
  values: Array<number | null>;
  xPositions: number[];
  yFor: (value: number) => number;
  baselineY: number;
}): Array<{ linePath: string; areaPath: string }> => {
  const segments: Array<{ linePath: string; areaPath: string }> = [];
  let current: Array<{ x: number; y: number }> = [];

  const flush = () => {
    if (current.length === 0) return;
    const linePath = current
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const areaPath = `${linePath} L${last.x.toFixed(2)},${baselineY.toFixed(2)} L${first.x.toFixed(2)},${baselineY.toFixed(2)} Z`;
    segments.push({ linePath, areaPath });
    current = [];
  };

  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      flush();
      return;
    }
    current.push({ x: xPositions[index]!, y: yFor(value) });
  });

  flush();
  return segments;
};

function SeriesTrendChart({
  viewModel,
  trendMetric,
  trendMode,
  onMetricChange,
  onModeChange,
}: {
  viewModel: SeriesBoardViewModel;
  trendMetric: SeriesBoardMetricKey;
  trendMode: TrendMode;
  onMetricChange: (metric: SeriesBoardMetricKey) => void;
  onModeChange: (mode: TrendMode) => void;
}) {
  const width = 960;
  const height = 280;
  const padding = { left: 52, right: 20, top: 20, bottom: 32 };
  const points = viewModel.trendPoints;
  const values = points.map((point) => {
    if (trendMode === "mtd") return point.cumulative[trendMetric];
    return point[trendMetric];
  });
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));

  if (points.length === 0 || finite.length === 0) {
    return (
      <div className="flex h-52 flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-slate-900">当前范围暂无趋势数据</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          该系列在当前平台、店铺、日期范围内暂无趋势点。
        </p>
      </div>
    );
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const spread = max - min;
  const pad = spread === 0 ? Math.max(Math.abs(max) * 0.1, 1) : spread * 0.12;
  const scale = { min: min - pad, max: max + pad };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xPositions = points.map((_, index) =>
    points.length === 1 ? padding.left + plotWidth / 2 : padding.left + (index / (points.length - 1)) * plotWidth,
  );
  const yFor = (value: number) => padding.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
  const segments = buildTrendSegments({
    values,
    xPositions,
    yFor,
    baselineY: height - padding.bottom,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
            onChange={(event) => onMetricChange(event.target.value as SeriesBoardMetricKey)}
            value={trendMetric}
          >
            {viewModel.trendMetricOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <div className="flex h-8 items-center rounded-md bg-white p-0.5 shadow-sm">
            {(["mtd", "dly"] as const).map((mode) => (
              <button
                key={mode}
                className={`h-7 rounded px-3 text-xs font-semibold ${trendMode === mode ? "bg-slate-900 text-white" : "text-slate-500"}`}
                onClick={() => onModeChange(mode)}
                type="button"
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {trendMode === "mtd" ? "按当前范围累计值绘制。" : "按单日值绘制，缺失日期会中断曲线。"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg className="block h-auto w-full min-w-[720px]" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = padding.top + (tick / 4) * plotHeight;
            const value = scale.max - (tick / 4) * (scale.max - scale.min);
            return (
              <g key={tick}>
                <line stroke="#e2e8f0" strokeWidth="1" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                <text fill="#94a3b8" fontSize="11" textAnchor="end" x={padding.left - 8} y={y + 4}>
                  {axisLabel(trendMetric, value)}
                </text>
              </g>
            );
          })}

          {segments.map((segment, index) => (
            <g key={`segment-${index}`}>
              <path d={segment.areaPath} fill="#2563eb" fillOpacity="0.08" stroke="none" />
              <path d={segment.linePath} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
            </g>
          ))}

          {points.map((point, index) => {
            const value = values[index];
            if (value === null || !Number.isFinite(value)) return null;
            return (
              <g key={point.date}>
                <circle cx={xPositions[index]} cy={yFor(value)} fill="#fff" r="3.5" stroke="#2563eb" strokeWidth="2" />
                <text fill="#64748b" fontSize="11" textAnchor="middle" x={xPositions[index]} y={height - 10}>
                  {point.date.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">
        当前指标：{TREND_LABELS[trendMetric]} · 最新值 {metricValueLabel(trendMetric, values[values.length - 1] ?? null)}
      </div>
    </div>
  );
}

export function V2SeriesBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const requestedSeriesId = searchParams.get("seriesId");
  const selectedPeriod = isPeriod(searchParams.get("period")) ? (searchParams.get("period") as SeriesBoardPeriod) : "day";
  const selectedDate = searchParams.get("date");
  const customStart = searchParams.get("start");
  const customEnd = searchParams.get("end");
  const trendMetric = isTrendMetric(searchParams.get("metric")) ? (searchParams.get("metric") as SeriesBoardMetricKey) : "gsv";
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

    void loadSeriesBoardContext({
      platformCode: requestedPlatform,
      storeId: requestedStoreId,
    }).then((result) => {
      if (!active) return;
      if (!result.context) {
        setState({
          status: "ready",
          viewModel: buildEmptySeriesBoardViewModel(result.message),
        });
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
          setState({
            status: "ready",
            viewModel: buildEmptySeriesBoardViewModel("当前没有可读取的店铺系列数据。"),
          });
          return;
        }
        setState({
          status: "ready",
          viewModel: buildV2SeriesBoardViewModel({
            dataset: context.dataset,
            platformCode,
            storeId,
            seriesId: requestedSeriesId,
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
          viewModel: buildLegacySeriesBoardViewModel({
            analysis: context.legacyAnalysis,
            legacySeriesGroups: context.legacySeriesGroups,
            targets: context.legacyTargets,
            seriesId: requestedSeriesId,
            selectedPeriod,
            selectedDate,
            customDateRange: { start: customStart, end: customEnd },
            fallbackNotice: context.message,
          }),
        });
        return;
      }

      setState({
        status: "ready",
        viewModel: buildEmptySeriesBoardViewModel(result.message),
      });
    }).catch(() => {
      if (active) setState({ status: "error", message: "读取系列数据失败，请刷新后重试。" });
    });

    return () => {
      active = false;
    };
  }, [customEnd, customStart, requestedPlatform, requestedSeriesId, requestedStoreId, selectedDate, selectedPeriod]);

  const viewModel = state.status === "ready" ? state.viewModel : null;

  const metricRows = useMemo(() => (viewModel ? metricRowsFromViewModel(viewModel) : []), [viewModel]);

  const seriesRows = useMemo(() => {
    if (!viewModel?.storeContext) return [];
    return viewModel.seriesOptions.map((item) => ([
      item.name,
      `${viewModel.storeContext?.platformLabel} / ${viewModel.storeContext?.storeName}`,
      `${item.productCount} 个商品 ID`,
      <button
        key={`${item.seriesId}-open`}
        className="text-xs font-semibold text-blue-700 hover:text-blue-800"
        onClick={() => {
          const params = new URLSearchParams(item.href.split("?")[1] ?? "");
          replaceQuery({
            platform: params.get("platform"),
            storeId: params.get("storeId"),
            seriesId: params.get("seriesId"),
          });
        }}
        type="button"
      >
        打开
      </button>,
    ]));
  }, [replaceQuery, viewModel]);

  const productRows = useMemo(() => (
    viewModel?.productRows.map((row) => ([
      row.productName,
      formatMoney(row.gsv),
      row.hasAdData ? formatRoi(row.adRoi) : "--",
      row.productBoardHref
        ? actionNodeFromLegacyHref(`${row.productId}-product`, row.productBoardHref, "查看商品")
        : row.fallbackHref
          ? actionNodeFromLegacyHref(`${row.productId}-fallback`, row.fallbackHref, "管理重点商品")
          : "—",
    ]))
  ) ?? [], [viewModel]);

  const mappedManageSeriesHref = mapHrefToAuthorizedV2Route(viewModel?.storeContext?.manageSeriesHref);
  const mappedStoreBoardHref = mapHrefToAuthorizedV2Route(viewModel?.storeContext?.storeBoardHref);

  const targetRows = useMemo(() => (
    viewModel?.targetProgress.map((item) => ([
      item.metricLabel,
      formatSeriesTargetMetricValue(item.metricKey, item.targetValue),
      formatSeriesTargetMetricValue(item.metricKey, item.gapValue),
      item.progressRate !== null ? formatPercent(item.progressRate) : "--",
    ]))
  ) ?? [], [viewModel]);

  if (state.status === "loading") {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取系列经营数据…</div>;
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-rose-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-slate-900">系列数据暂时无法读取</p>
        <p className="mt-2 text-sm text-slate-500">{state.message}</p>
      </section>
    );
  }

  if (!viewModel || !viewModel.storeContext || viewModel.statusLabel === "暂无数据") {
    return <SafeEmptyState title="暂无系列数据" description="完成数据导入或系列维护后，再返回查看系列中心。" />;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="v2-series-board-dashboard">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{viewModel.statusLabel}</span>
              {viewModel.storeContext ? (
                <span className="text-sm text-slate-500">
                  {viewModel.storeContext.platformLabel} · {viewModel.storeContext.storeName}
                </span>
              ) : null}
              {viewModel.selectedSeriesName ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {viewModel.selectedSeriesName}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">筛选与范围</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              选择平台、店铺、系列和时间范围后查看系列经营表现。
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="系列周期选择">
              {PERIODS.map((period) => (
                <button
                  key={period}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${selectedPeriod === period ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                  onClick={() => replaceQuery({ period, date: null })}
                  type="button"
                >
                  {PERIOD_LABEL[period]}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">平台</span>
                <select
                  className="form-input"
                  onChange={(event) => replaceQuery({ platform: event.target.value || null, storeId: null, seriesId: null })}
                  value={viewModel.storeContext?.platformCode ?? ""}
                >
                  {Array.from(new Map((viewModel.storeContext?.availableStores ?? []).map((item) => [item.platformCode, item.platformCode])).keys()).map((platformCode) => (
                    <option key={platformCode} value={platformCode}>{platformCode}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">店铺</span>
                <select
                  className="form-input"
                  onChange={(event) => {
                    const selected = viewModel.storeContext?.availableStores.find((item) => item.value === event.target.value);
                    const params = new URLSearchParams(selected?.href.split("?")[1] ?? "");
                    replaceQuery({ platform: params.get("platform"), storeId: params.get("storeId"), seriesId: null });
                  }}
                  value={viewModel.storeContext?.storeKey ?? ""}
                >
                  {(viewModel.storeContext?.availableStores ?? []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">系列</span>
                <select
                  className="form-input"
                  onChange={(event) => replaceQuery({ seriesId: event.target.value || null })}
                  value={viewModel.selectedSeriesId ?? ""}
                >
                  {(viewModel.seriesOptions ?? []).map((item) => (
                    <option key={item.seriesId} value={item.seriesId}>{item.name}（{item.productCount}）</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">经营日期</span>
                <select
                  className="form-input"
                  onChange={(event) => replaceQuery({ date: event.target.value || null })}
                  value={viewModel.dateRange.selectedDate ?? ""}
                >
                  {(viewModel.availableDates ?? []).map((date) => (
                    <option key={date} value={date}>{date}</option>
                  ))}
                </select>
              </label>
            </div>

            {selectedPeriod === "custom" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">起始日期</span>
                  <input className="form-input" onChange={(event) => replaceQuery({ start: event.target.value || null })} type="date" value={customStart ?? ""} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">结束日期</span>
                  <input className="form-input" onChange={(event) => replaceQuery({ end: event.target.value || null })} type="date" value={customEnd ?? ""} />
                </label>
              </div>
            ) : null}

            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {viewModel.dateRange.coverageText}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
            {mappedManageSeriesHref?.status === "mapped" && mappedManageSeriesHref.href ? (
              <Link className="primary-button justify-center" href={mappedManageSeriesHref.href}>
                管理系列
              </Link>
            ) : mappedManageSeriesHref ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700" title={mappedManageSeriesHref.reason}>
                管理页暂未开放
              </span>
            ) : null}
            {mappedStoreBoardHref?.status === "mapped" && mappedStoreBoardHref.href ? (
              <Link className="secondary-button justify-center" href={mappedStoreBoardHref.href}>
                返回店铺中心
              </Link>
            ) : mappedStoreBoardHref ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700" title={mappedStoreBoardHref.reason}>
                暂未开放
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
        <DataTableV2
          action={
            mappedManageSeriesHref?.status === "mapped" && mappedManageSeriesHref.href
              ? <Link className="primary-button" href={mappedManageSeriesHref.href}>维护系列</Link>
              : mappedManageSeriesHref
                ? <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" title={mappedManageSeriesHref.reason}>管理页暂未开放</span>
                : null
          }
          columns={["系列", "归属", "商品 ID", "操作"]}
          description="系列属于平台、品牌和店铺；商品 ID 清单由用户维护。"
          rows={seriesRows}
          title="系列列表"
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">当前系列概览</h2>
              <p className="mt-1 text-sm text-slate-500">当前系列商品数：{viewModel.selectedSeriesProductCount}。</p>
            </div>
            <Link className="text-xs font-semibold text-blue-700 hover:text-blue-800" href="/v2/home">
              返回首页重点系列
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {viewModel.notices.slice(0, 4).map((notice) => (
              <div key={notice} className="rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {notice}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">系列 KPI</h2>
        <p className="mt-1 text-sm text-slate-500">当前接入系列范围指标，目标进度按已设置目标展示。</p>
        <div className="mt-4">
          <MetricGridV2 metrics={metricRows} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          columns={["商品", "GSV", "ROI", "动作"]}
          description="展示当前系列维护商品的贡献。"
          rows={productRows}
          title="系列商品贡献"
        />
        <DataTableV2
          columns={["目标", "目标值", "差值", "完成率"]}
          description="展示当前系列可匹配的目标进度。"
          rows={targetRows}
          title="系列目标进度"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">系列搜索表现</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            当前系列级搜索表现还需要稳定的“搜索词 → 商品 → 系列”绑定路径。
            接入后会在这里展示品牌词、中心词对系列的贡献。
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            可先在搜索资产中维护品牌词与中心词，后续接通表现数据后会自动用于分析。
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">数据状态与健康提示</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-slate-400">活跃数据状态</dt>
              <dd className="mt-1 font-semibold text-slate-800">{viewModel.dataStatus.activeDatasetStatus}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-slate-400">数据提示数</dt>
              <dd className="mt-1 font-semibold text-slate-800">{viewModel.dataStatus.warningCount}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {viewModel.dataStatus.issueCodes.length > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                数据健康有 {viewModel.dataStatus.issueCodes.length} 条提示
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                暂无额外提示
              </span>
            )}
          </div>
        </div>
      </section>

      <ChartPanelV2
        content={(
          <SeriesTrendChart
            onMetricChange={(metric) => replaceQuery({ metric })}
            onModeChange={(mode) => replaceQuery({ chart: mode })}
            trendMetric={trendMetric}
            trendMode={trendMode}
            viewModel={viewModel}
          />
        )}
        description="趋势跟随当前系列、平台、店铺和时间范围；MTD 显示累计，DLY 显示单日。"
        recommendedPairs={["GSV vs 推广花费", "GMV vs GSV", "品牌词访客 vs 品牌词支付人数"]}
        title="系列趋势"
      />
    </div>
  );
}
