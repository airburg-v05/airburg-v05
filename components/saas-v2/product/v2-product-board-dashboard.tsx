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
  buildEmptyProductBoardViewModel,
  buildLegacyUntrackedProductBoardViewModel,
  buildV2ProductBoardViewModel,
  formatMoney,
  formatPercent,
  formatProductTargetMetricValue,
  formatRoi,
  loadProductBoardContext,
  type ProductBoardMetricKey,
  type ProductBoardPeriod,
  type ProductBoardViewModel,
} from "@/lib/v05/product-board";

type DashboardState =
  | { status: "loading" }
  | { status: "ready"; viewModel: ProductBoardViewModel }
  | { status: "error"; message: string };

type TrendMode = "mtd" | "dly";

const PERIODS: ProductBoardPeriod[] = ["day", "week", "month", "custom"];
const PERIOD_LABEL: Record<ProductBoardPeriod, string> = {
  day: "日",
  week: "周",
  month: "月",
  custom: "自定义",
};

const TREND_LABELS: Record<ProductBoardMetricKey, string> = {
  gmv: "GMV",
  gsv: "GSV",
  visitors: "访客",
  paidBuyers: "支付买家",
  conversionRate: "转化率",
  adSpend: "推广花费",
};

const isPeriod = (value: string | null): value is ProductBoardPeriod =>
  value !== null && PERIODS.includes(value as ProductBoardPeriod);

const isTrendMetric = (value: string | null): value is ProductBoardMetricKey =>
  value !== null && Object.prototype.hasOwnProperty.call(TREND_LABELS, value);

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

const metricRowsFromViewModel = (viewModel: ProductBoardViewModel): MetricV2[] =>
  viewModel.metrics.map((metric, index) => {
    const target = viewModel.targetProgress.find((item) => item.metricLabel === metric.label || item.metricKey === metric.key);
    return {
      label: metric.label,
      value: metric.formattedValue,
      unit: metricCardUnit(metric.label),
      mtdTarget: "--",
      totalTarget: target ? formatProductTargetMetricValue(target.metricKey, target.targetValue) : "--",
      delta: target ? formatProductTargetMetricValue(target.metricKey, target.gapValue) : "--",
      completion: target && target.progressRate !== null ? formatPercent(target.progressRate) : "--",
      progress: target ? clampProgress(target.progressRate) : 0,
      note: index === 0 ? viewModel.notices[0] ?? "按当前重点商品范围展示。" : metric.helper,
    };
  });

const blockedRouteNode = (key: string, reason: string) => (
  <span key={key} className="text-xs font-semibold text-amber-700" title={reason}>
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

const axisLabel = (metricKey: ProductBoardMetricKey, value: number): string => {
  if (metricKey === "conversionRate") return `${Math.round(value * 100)}%`;
  if (metricKey === "visitors" || metricKey === "paidBuyers") {
    return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
  }
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
};

const metricValueLabel = (metricKey: ProductBoardMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") {
    if (value === null || !Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  }
  return formatMoney(value);
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

function ProductTrendChart({
  viewModel,
  trendMetric,
  trendMode,
  onMetricChange,
  onModeChange,
}: {
  viewModel: ProductBoardViewModel;
  trendMetric: ProductBoardMetricKey;
  trendMode: TrendMode;
  onMetricChange: (metric: ProductBoardMetricKey) => void;
  onModeChange: (mode: TrendMode) => void;
}) {
  const width = 960;
  const height = 280;
  const padding = { left: 52, right: 20, top: 20, bottom: 32 };
  const points = viewModel.trendPoints;
  const values = points.map((point) => (trendMode === "mtd" ? point.cumulative[trendMetric] : point[trendMetric]));
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));

  if (points.length === 0 || finite.length === 0) {
    return (
      <div className="flex h-52 flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-slate-900">当前范围暂无商品趋势数据</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          当前重点商品在当前日期范围内暂无趋势点。
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
            onChange={(event) => onMetricChange(event.target.value as ProductBoardMetricKey)}
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

export function V2ProductBoardDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const trackedProductId = searchParams.get("trackedProductId");
  const productId = searchParams.get("productId");
  const selectedPeriod = isPeriod(searchParams.get("period")) ? (searchParams.get("period") as ProductBoardPeriod) : "day";
  const selectedDate = searchParams.get("date");
  const customStart = searchParams.get("start");
  const customEnd = searchParams.get("end");
  const trendMetric = isTrendMetric(searchParams.get("metric")) ? (searchParams.get("metric") as ProductBoardMetricKey) : "gsv";
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

    void loadProductBoardContext({
      platformCode: requestedPlatform,
      storeId: requestedStoreId,
    }).then((result) => {
      if (!active) return;
      if (!result.context) {
        setState({ status: "ready", viewModel: buildEmptyProductBoardViewModel(result.message) });
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
          setState({ status: "ready", viewModel: buildEmptyProductBoardViewModel("当前没有可读取的重点商品数据。") });
          return;
        }
        setState({
          status: "ready",
          viewModel: buildV2ProductBoardViewModel({
            dataset: context.dataset,
            platformCode,
            storeId,
            trackedProductId,
            productId,
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
          viewModel: buildLegacyUntrackedProductBoardViewModel(context.message),
        });
        return;
      }

      setState({ status: "ready", viewModel: buildEmptyProductBoardViewModel(result.message) });
    }).catch(() => {
      if (active) setState({ status: "error", message: "读取重点商品数据失败，请刷新后重试。" });
    });

    return () => {
      active = false;
    };
  }, [customEnd, customStart, productId, requestedPlatform, requestedStoreId, selectedDate, selectedPeriod, trackedProductId]);

  const viewModel = state.status === "ready" ? state.viewModel : null;

  const metricRows = useMemo(() => (viewModel ? metricRowsFromViewModel(viewModel) : []), [viewModel]);

  const trackedRows = useMemo(() => (
    viewModel?.trackedOptions.map((item) => ([
      item.displayName,
      item.productId,
      item.dataLabel,
      <button
        key={`${item.trackedProductId}-open`}
        className="text-xs font-semibold text-blue-700 hover:text-blue-800"
        onClick={() => {
          const params = new URLSearchParams(item.href.split("?")[1] ?? "");
          replaceQuery({
            platform: params.get("platform"),
            storeId: params.get("storeId"),
            trackedProductId: params.get("trackedProductId"),
            productId: null,
          });
        }}
        type="button"
      >
        打开
      </button>,
    ]))
  ) ?? [], [replaceQuery, viewModel]);

  const targetRows = useMemo(() => (
    viewModel?.targetProgress.map((item) => ([
      item.metricLabel,
      formatProductTargetMetricValue(item.metricKey, item.targetValue),
      formatProductTargetMetricValue(item.metricKey, item.gapValue),
      item.progressRate !== null ? formatPercent(item.progressRate) : "--",
    ]))
  ) ?? [], [viewModel]);

  const seriesRows = useMemo(() => (
    viewModel?.seriesMemberships.map((item) => ([
      item.name,
      `${item.productCount} 个商品`,
      item.seriesId,
      actionNodeFromLegacyHref(`${item.seriesId}-series`, item.href, "查看系列"),
    ]))
  ) ?? [], [viewModel]);

  const mappedManageTrackedHref = mapHrefToAuthorizedV2Route(viewModel?.storeContext?.manageTrackedHref);
  const mappedStoreBoardHref = mapHrefToAuthorizedV2Route(viewModel?.storeContext?.storeBoardHref);
  const mappedQualityHref = mapHrefToAuthorizedV2Route(viewModel?.dataStatus.qualityHref);
  const mappedHistoryHref = mapHrefToAuthorizedV2Route(viewModel?.storeContext?.historyHref);
  const qualityActionLabel = mappedQualityHref?.sourceHref.startsWith("/upload/quality") ? "查看数据健康" : "前往上传";

  const issueRows = useMemo(() => [
    ["经营数据状态", viewModel?.selectedTrackedProduct.dataStatus === "business" ? "有经营数据" : viewModel?.selectedTrackedProduct.dataStatus === "ad_only" ? "仅推广数据" : "暂无当前范围数据", viewModel?.notices[1] ?? "—"],
    ["推广摘要", formatMoney(viewModel?.adSummary.adSpend ?? null), viewModel?.notices[2] ?? "—"],
    ["售后摘要", formatMoney(viewModel?.afterSalesSummary.refundAmount ?? null), viewModel?.notices[3] ?? "—"],
  ], [viewModel]);

  if (state.status === "loading") {
    return <div className="flex min-h-[62vh] items-center justify-center text-sm text-slate-500">正在读取重点商品数据…</div>;
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-rose-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-slate-900">重点商品数据暂时无法读取</p>
        <p className="mt-2 text-sm text-slate-500">{state.message}</p>
      </section>
    );
  }

  if (!viewModel || !viewModel.storeContext || viewModel.statusLabel === "暂无数据") {
    return <SafeEmptyState title="暂无重点商品数据" description="完成数据导入并维护重点商品后，再返回查看商品中心。" />;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="v2-product-board-dashboard">
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
              {viewModel.selectedTrackedProduct.displayName ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  {viewModel.selectedTrackedProduct.displayName}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-slate-950">筛选与范围</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              选择店铺、重点商品和时间范围后查看商品经营表现。
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="商品周期选择">
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
                  onChange={(event) => replaceQuery({ platform: event.target.value || null, storeId: null, trackedProductId: null, productId: null })}
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
                    replaceQuery({ platform: params.get("platform"), storeId: params.get("storeId"), trackedProductId: null, productId: null });
                  }}
                  value={viewModel.storeContext?.storeKey ?? ""}
                >
                  {(viewModel.storeContext?.availableStores ?? []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">重点商品</span>
                <select
                  className="form-input"
                  onChange={(event) => replaceQuery({ trackedProductId: event.target.value || null, productId: null })}
                  value={viewModel.selectedTrackedProduct.trackedProductId ?? ""}
                >
                  {(viewModel.trackedOptions ?? []).map((item) => (
                    <option key={item.trackedProductId} value={item.trackedProductId}>{item.displayName}（{item.dataLabel}）</option>
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
            {mappedManageTrackedHref?.status === "mapped" && mappedManageTrackedHref.href ? (
              <Link className="primary-button justify-center" href={mappedManageTrackedHref.href}>
                管理重点商品
              </Link>
            ) : mappedManageTrackedHref ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700" title={mappedManageTrackedHref.reason}>
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
          title="重点商品列表"
          description="只显示已维护的重点商品及其当前数据状态。"
          columns={["商品", "商品 ID", "状态", "操作"]}
          rows={trackedRows}
          action={
            mappedManageTrackedHref?.status === "mapped" && mappedManageTrackedHref.href
              ? <Link className="primary-button justify-center" href={mappedManageTrackedHref.href}>维护商品池</Link>
              : mappedManageTrackedHref
                ? <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" title={mappedManageTrackedHref.reason}>管理页暂未开放</span>
                : null
          }
        />
        <DataTableV2
          title="当前商品状态"
          description="强调当前商品的数据边界、推广摘要与售后摘要。"
          columns={["模块", "当前值", "说明"]}
          rows={issueRows}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">商品 KPI</h2>
        <p className="mt-1 text-sm text-slate-500">按当前重点商品口径展示经营与推广指标。</p>
        <div className="mt-4">
          <MetricGridV2 metrics={metricRows} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartPanelV2
          title="商品趋势"
          description="趋势跟随当前重点商品与时间范围。"
          recommendedPairs={["GSV vs 转化率", "推广花费 vs ROI"]}
          content={
            <ProductTrendChart
              onMetricChange={(metric) => replaceQuery({ metric })}
              onModeChange={(mode) => replaceQuery({ chart: mode })}
              trendMetric={trendMetric}
              trendMode={trendMode}
              viewModel={viewModel}
            />
          }
        />
        <DataTableV2
          title="商品目标进度"
          description="只读展示当前重点商品当前范围下可匹配目标。"
          columns={["指标", "目标", "差额", "完成度"]}
          rows={targetRows}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="所属系列"
          description="展示当前商品已维护的系列关联。"
          columns={["系列", "系列规模", "系列 ID", "操作"]}
          rows={seriesRows}
        />
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">推广与售后摘要</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">推广花费</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatMoney(viewModel.adSummary.adSpend)}</p>
              <p className="mt-1 text-xs text-slate-500">ROI {formatRoi(viewModel.adSummary.adRoi)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">退款金额</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{formatMoney(viewModel.afterSalesSummary.refundAmount)}</p>
              <p className="mt-1 text-xs text-slate-500">待处理 {viewModel.afterSalesSummary.pendingCount ?? 0}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">曝光 / 点击</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {(viewModel.adSummary.impressions ?? 0).toLocaleString("zh-CN")} / {(viewModel.adSummary.clicks ?? 0).toLocaleString("zh-CN")}
              </p>
              <p className="mt-1 text-xs text-slate-500">点击率 {formatPercent(viewModel.adSummary.clickRate)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">数据提示</p>
              <p className="mt-2 text-lg font-semibold text-slate-900">{viewModel.dataStatus.warningCount}</p>
              <p className="mt-1 text-xs text-slate-500">重点商品 {viewModel.dataStatus.trackedProductCount}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {mappedQualityHref?.status === "mapped" && mappedQualityHref.href ? (
              <Link className="secondary-button justify-center" href={mappedQualityHref.href}>
                {qualityActionLabel}
              </Link>
            ) : mappedQualityHref ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" title={mappedQualityHref.reason}>
                暂未开放
              </span>
            ) : null}
            {mappedHistoryHref?.status === "mapped" && mappedHistoryHref.href ? (
              <Link className="secondary-button justify-center" href={mappedHistoryHref.href}>
                查看导入历史
              </Link>
            ) : mappedHistoryHref ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700" title={mappedHistoryHref.reason}>
                暂未开放
              </span>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
