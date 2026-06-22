"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ProductBoardMetricKey,
  ProductBoardPeriod,
  ProductBoardViewModel,
} from "@/lib/v05/product-board";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  formatProductTargetMetricValue,
  formatRoi,
} from "@/lib/v05/product-board";
import { metricValueOfPoint } from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { ProductBoardSafeState } from "./product-board-safe-state";

const PERIOD_OPTIONS: Array<{ key: ProductBoardPeriod; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "custom", label: "自定义" },
];

type FocusTabKey = "ad_after_sales" | "series" | "data_status";

const FOCUS_TABS: Array<{ key: FocusTabKey; label: string }> = [
  { key: "ad_after_sales", label: "推广与售后" },
  { key: "series", label: "所属系列" },
  { key: "data_status", label: "数据状态" },
];

interface ProductBoardCommandCenterProps {
  viewModel: ProductBoardViewModel;
  selectedPeriod: ProductBoardPeriod;
  selectedTrendMetric: ProductBoardMetricKey;
  customDateRange: { start: string | null; end: string | null };
  onPeriodChange: (period: ProductBoardPeriod) => void;
  onDateChange: (date: string | null) => void;
  onCustomDateRangeChange: (range: { start: string | null; end: string | null }) => void;
  onTrendMetricChange: (metric: ProductBoardMetricKey) => void;
  onHrefChange: (href: string) => void;
}

const pillTone = (tone: ProductBoardViewModel["statusTone"]): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (tone === "emerald") return "success";
  if (tone === "amber") return "warning";
  if (tone === "rose") return "danger";
  if (tone === "blue") return "info";
  return "neutral";
};

const metricFormatter = (metricKey: ProductBoardMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") return formatInteger(value);
  return formatMoney(value);
};

function ProductContextBar({
  viewModel,
  selectedPeriod,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onHrefChange,
}: Omit<ProductBoardCommandCenterProps, "selectedTrendMetric" | "onTrendMetricChange">) {
  const context = viewModel.storeContext;
  const platformOptions = context
    ? Array.from(
        new Map(
          context.availableStores.map((store) => [
            store.platformCode,
            {
              platformCode: store.platformCode,
              label: store.label.split(" · ")[0] ?? store.platformCode,
              href: store.href,
            },
          ]),
        ).values(),
      )
    : [];

  return (
    <section className="panel p-4" aria-label="重点商品经营范围控制">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={pillTone(viewModel.statusTone)}>{viewModel.statusLabel}</StatusPill>
            {context ? (
              <span className="min-w-0 text-sm text-slate-500">
                {context.platformLabel} · <span className="break-words font-medium text-slate-700">{context.storeName}</span>
              </span>
            ) : null}
            {viewModel.selectedTrackedProduct.displayName ? (
              <span className="min-w-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {viewModel.selectedTrackedProduct.displayName}
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="周期选择">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={selectedPeriod === option.key}
                onClick={() => onPeriodChange(option.key)}
                className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition ${
                  selectedPeriod === option.key
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">平台</span>
              <select
                id="product-board-platform-select"
                className="form-input"
                value={context?.platformCode ?? ""}
                onChange={(event) => {
                  const selected = platformOptions.find((platform) => platform.platformCode === event.target.value);
                  if (selected) onHrefChange(selected.href);
                }}
              >
                {platformOptions.length === 0 ? <option value="">暂无平台</option> : null}
                {platformOptions.map((platform) => (
                  <option key={platform.platformCode} value={platform.platformCode}>
                    {platform.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">店铺</span>
              <select
                id="product-board-store-select"
                className="form-input"
                value={context?.storeKey ?? ""}
                onChange={(event) => {
                  const selected = context?.availableStores.find((store) => store.value === event.target.value);
                  if (selected) onHrefChange(selected.href);
                }}
              >
                {context?.availableStores.map((store) => (
                  <option key={store.value} value={store.value}>
                    {store.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">重点商品</span>
              <select
                id="product-board-tracked-select"
                className="form-input"
                value={viewModel.selectedTrackedProduct.trackedProductId ?? ""}
                onChange={(event) => {
                  const selected = viewModel.trackedOptions.find((item) => item.trackedProductId === event.target.value);
                  if (selected) onHrefChange(selected.href);
                }}
              >
                {viewModel.trackedOptions.length === 0 ? <option value="">暂无重点商品</option> : null}
                {viewModel.trackedOptions.map((item) => (
                  <option key={item.trackedProductId} value={item.trackedProductId}>
                    {item.displayName}（{item.dataLabel}）
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">经营日期</span>
              <select
                id="product-board-business-date-select"
                className="form-input"
                value={viewModel.dateRange.selectedDate ?? ""}
                onChange={(event) => onDateChange(event.target.value || null)}
              >
                {viewModel.availableDates.length === 0 ? <option value="">暂无日期</option> : null}
                {viewModel.availableDates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 md:col-span-2 xl:col-span-1">
              <p className="text-xs font-semibold text-slate-500">数据覆盖</p>
              <p className="mt-1 leading-5">{viewModel.dateRange.coverageText}</p>
            </div>
          </div>

          {selectedPeriod === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">起始日期</span>
                <input
                  className="form-input"
                  type="date"
                  value={customDateRange.start ?? ""}
                  onChange={(event) =>
                    onCustomDateRangeChange({ ...customDateRange, start: event.target.value || null })
                  }
                />
              </label>
              <label className="min-w-0 text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">结束日期</span>
                <input
                  className="form-input"
                  type="date"
                  value={customDateRange.end ?? ""}
                  onChange={(event) =>
                    onCustomDateRangeChange({ ...customDateRange, end: event.target.value || null })
                  }
                />
              </label>
            </div>
          ) : null}

          {viewModel.dateRange.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {viewModel.dateRange.error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
          {context ? (
            <Link href={context.manageTrackedHref} className="primary-button justify-center">
              管理重点商品
            </Link>
          ) : null}
          <Link href={context?.storeBoardHref ?? "/store-board"} className="secondary-button justify-center">
            返回店铺看板
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProductMetricGrid({ viewModel }: { viewModel: ProductBoardViewModel }) {
  return (
    <section aria-label="重点商品核心指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {viewModel.metrics.slice(0, 6).map((metric) => (
        <article key={metric.key} className="panel min-w-0 p-4">
          <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
          <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-950">
            {metric.formattedValue}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{metric.helper}</p>
        </article>
      ))}
    </section>
  );
}

function ProductIdentityAndTargets({ viewModel }: { viewModel: ProductBoardViewModel }) {
  const identity = viewModel.selectedTrackedProduct;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-900">{identity.displayName ?? "未选择重点商品"}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{identity.productId ?? "--"}</p>
          <p className="mt-2 text-xs text-slate-500">只展示当前重点商品可匹配当前周期的只读目标。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={identity.dataStatus === "business" ? "success" : identity.dataStatus === "ad_only" ? "info" : "neutral"}>
              {identity.dataStatus === "business"
                ? "有经营数据"
                : identity.dataStatus === "ad_only"
                  ? "仅推广数据"
                  : "暂无当前范围数据"}
            </StatusPill>
            <StatusPill tone="info">用户主动添加</StatusPill>
          </div>
        </div>
        {viewModel.targetProgress.length === 0 ? (
          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
            当前周期暂无商品目标
          </span>
        ) : (
          <Link href="/targets" className="secondary-button shrink-0 justify-center">
            目标设置
          </Link>
        )}
      </div>

      {viewModel.targetProgress.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {viewModel.targetProgress.map((target) => (
            <article key={target.targetId} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{target.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{target.metricLabel}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {target.statusLabel}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.min(100, Math.max(0, (target.progressRate ?? 0) * 100))}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <p>实际</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatProductTargetMetricValue(target.metricKey, target.actualValue)}
                  </p>
                </div>
                <div>
                  <p>目标</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatProductTargetMetricValue(target.metricKey, target.targetValue)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductMainTrend({
  viewModel,
  selectedMetric,
  onMetricChange,
}: {
  viewModel: ProductBoardViewModel;
  selectedMetric: ProductBoardMetricKey;
  onMetricChange: (metric: ProductBoardMetricKey) => void;
}) {
  const points = viewModel.trendPoints;
  const dailyValues = points.map((point) => metricValueOfPoint(point, selectedMetric));
  const cumulativeValues = points.map((point) => point.cumulative[selectedMetric]);
  const finiteValues = [...dailyValues, ...cumulativeValues].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const maxValue = Math.max(...finiteValues, 0);
  const hasData = points.length > 0 && maxValue > 0;
  const width = 720;
  const height = 248;
  const padding = { left: 42, right: 22, top: 22, bottom: 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slot = points.length > 0 ? chartWidth / points.length : chartWidth;
  const barWidth = Math.max(10, Math.min(32, slot * 0.48));
  const x = (index: number): number => padding.left + slot * index + slot / 2;
  const y = (value: number | null): number =>
    value === null || maxValue <= 0
      ? padding.top + chartHeight
      : padding.top + chartHeight - (value / maxValue) * chartHeight;
  const linePoints = points
    .map((point, index) => {
      const value = point.cumulative[selectedMetric];
      return value === null ? null : `${x(index)},${y(value)}`;
    })
    .filter((value): value is string => !!value)
    .join(" ");

  return (
    <SectionCard
      title="商品主趋势"
      description="单日期只展示当日值；缺失日期不会补 0。"
      action={
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="商品趋势指标">
          {viewModel.trendMetricOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={selectedMetric === option.key}
              onClick={() => onMetricChange(option.key)}
              className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition ${
                selectedMetric === option.key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="sr-only">
        当前图表展示重点商品每日实际值和范围累计实际值，当前指标为
        {viewModel.trendMetricOptions.find((item) => item.key === selectedMetric)?.label ?? selectedMetric}。
      </p>
      {!hasData ? (
        <div className="flex min-h-56 items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-900">当前范围暂无可展示趋势数据</p>
            <p className="mt-2 text-sm text-slate-500">请选择有重点商品数据的日期范围，缺失日期不会按 0 处理。</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-50 p-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="重点商品主趋势图"
            className="h-auto w-full max-w-full"
            preserveAspectRatio="none"
          >
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={padding.top + chartHeight}
              y2={padding.top + chartHeight}
              stroke="#cbd5e1"
            />
            {points.map((point, index) => {
              const value = metricValueOfPoint(point, selectedMetric);
              const barHeight = value === null || maxValue <= 0 ? 0 : (value / maxValue) * chartHeight;
              const centerX = x(index);
              return (
                <g key={point.date}>
                  {value !== null ? (
                    <rect
                      x={centerX - barWidth / 2}
                      y={padding.top + chartHeight - barHeight}
                      width={barWidth}
                      height={Math.max(2, barHeight)}
                      rx="4"
                      fill="#2563eb"
                      opacity="0.82"
                    />
                  ) : null}
                  <text x={centerX} y={height - 16} textAnchor="middle" fill="#64748b" fontSize="10">
                    {point.date.slice(5)}
                  </text>
                </g>
              );
            })}
            {linePoints ? (
              <polyline
                points={linePoints}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
        </div>
      )}

      <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700">日期点</p>
          <p className="mt-1">{points.length} 个</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700">最新值</p>
          <p className="mt-1">
            {metricFormatter(
              selectedMetric,
              points.length ? metricValueOfPoint(points[points.length - 1]!, selectedMetric) : null,
            )}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700">说明</p>
          <p className="mt-1">{points.length <= 1 ? "仅展示单日值。" : "可观察多日变化。"}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function ProductFocusSection({ viewModel }: { viewModel: ProductBoardViewModel }) {
  const [activeTab, setActiveTab] = useState<FocusTabKey>("ad_after_sales");
  const context = viewModel.storeContext;

  return (
    <SectionCard
      title="重点商品运营关注"
      description="只展示当前重点商品的推广、售后安全聚合、所属系列和数据状态。"
      action={
        context ? (
          <Link href={context.manageTrackedHref} className="secondary-button justify-center">
            管理重点商品
          </Link>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="重点商品运营关注">
          {FOCUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "ad_after_sales" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">商品推广花费</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatMoney(viewModel.adSummary.adSpend)}</p>
                <p className="mt-1 text-xs text-slate-500">ROI {formatRoi(viewModel.adSummary.adRoi)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">点击</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {viewModel.adSummary.hasAdData ? formatInteger(viewModel.adSummary.clicks) : "--"}
                </p>
                <p className="mt-1 text-xs text-slate-500">点击率 {viewModel.adSummary.hasAdData ? formatPercent(viewModel.adSummary.clickRate) : "--"}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">安全退款金额</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {formatMoney(viewModel.afterSalesSummary.refundAmount)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  退款单 {formatInteger(viewModel.afterSalesSummary.refundOrderCount)}
                </p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">售后快照</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {formatInteger(viewModel.afterSalesSummary.pendingCount)}
                </p>
                <p className="mt-1 text-xs text-slate-500">待处理安全计数</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              推广指标只使用商品推广数据；售后只展示安全聚合，不展示敏感明细。
            </p>
          </div>
        ) : null}

        {activeTab === "series" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">所属系列</p>
                <p className="mt-1 text-xs text-slate-500">只显示当前店铺 active 系列中包含该商品的记录。</p>
              </div>
              {context ? (
                <Link href={context.manageTrackedHref.replace("/product-board/tracked", "/series-board/manage")} className="secondary-button shrink-0 justify-center">
                  管理系列
                </Link>
              ) : null}
            </div>
            {viewModel.seriesMemberships.length === 0 ? (
              <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-100">
                当前重点商品暂未加入任何启用系列。
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {viewModel.seriesMemberships.map((series) => (
                  <article key={series.seriesId} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                    <p className="break-words text-sm font-semibold text-slate-900">{series.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{series.productCount} 个商品</p>
                    <Link href={series.href} className="mt-3 inline-flex text-xs font-semibold text-blue-700">
                      查看系列
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "data_status" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">重点商品数</p>
                <p className="mt-2 font-semibold text-slate-950">{viewModel.dataStatus.trackedProductCount}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">当前范围</p>
                <p className="mt-2 leading-5">{viewModel.dateRange.coverageText}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">数据提示</p>
                <p className="mt-2">
                  {viewModel.dataStatus.warningCount > 0 ? `${viewModel.dataStatus.warningCount} 条` : "暂无"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={viewModel.dataStatus.qualityHref} className="secondary-button justify-center">
                查看数据质量
              </Link>
              {context ? (
                <Link href={context.historyHref} className="secondary-button justify-center">
                  查看导入记录
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

export function ProductBoardCommandCenter({
  viewModel,
  selectedPeriod,
  selectedTrendMetric,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onTrendMetricChange,
  onHrefChange,
}: ProductBoardCommandCenterProps) {
  if (
    viewModel.mode === "empty" ||
    viewModel.mode === "invalid_store" ||
    viewModel.mode === "invalid_tracked_product" ||
    viewModel.mode === "not_tracked" ||
    viewModel.mode === "no_tracked_products" ||
    viewModel.mode === "tracked_product_no_data" ||
    viewModel.mode === "legacy_untracked" ||
    viewModel.mode === "corrupted" ||
    viewModel.mode === "error"
  ) {
    return (
      <ProductBoardSafeState
        title={viewModel.statusLabel}
        description={viewModel.notices[0] ?? "当前重点商品数据不可用。"}
        actionHref={viewModel.primaryActions[0]?.href}
        actionLabel={viewModel.primaryActions[0]?.label}
        secondaryAction={
          viewModel.primaryActions[1] ? (
            <Link href={viewModel.primaryActions[1].href} className="secondary-button justify-center">
              {viewModel.primaryActions[1].label}
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      {viewModel.selectedTrackedProduct.canonicalHref ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-blue-800">
          已将旧 productId 查询归一到当前重点商品入口。
        </div>
      ) : null}

      {viewModel.notices.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-blue-800">
          {viewModel.notices.slice(0, 2).map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}

      <ProductContextBar
        viewModel={viewModel}
        selectedPeriod={selectedPeriod}
        customDateRange={customDateRange}
        onPeriodChange={onPeriodChange}
        onDateChange={onDateChange}
        onCustomDateRangeChange={onCustomDateRangeChange}
        onHrefChange={onHrefChange}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <ProductMetricGrid viewModel={viewModel} />
        <ProductIdentityAndTargets viewModel={viewModel} />
      </div>

      <ProductMainTrend
        viewModel={viewModel}
        selectedMetric={selectedTrendMetric}
        onMetricChange={onTrendMetricChange}
      />

      <ProductFocusSection viewModel={viewModel} />
    </div>
  );
}
