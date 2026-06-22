"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  StoreBoardMetricKey,
  StoreBoardPeriod,
  StoreBoardViewModel,
} from "@/lib/v05/store-board";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  formatTargetMetricValue,
} from "@/lib/v05/store-board";
import { metricValueOfPoint } from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { CompactTargetSummary } from "@/components/target-context/compact-target-summary";
import { targetSettingsHref } from "@/lib/v05/target-context";
import { StoreBoardSafeState } from "./store-board-safe-state";

const PERIOD_OPTIONS: Array<{ key: StoreBoardPeriod; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "custom", label: "自定义" },
];

type FocusTabKey = "products" | "series" | "ad_after_sales";

const FOCUS_TABS: Array<{ key: FocusTabKey; label: string }> = [
  { key: "products", label: "商品表现" },
  { key: "series", label: "系列进度" },
  { key: "ad_after_sales", label: "推广与售后" },
];

interface StoreBoardCommandCenterProps {
  viewModel: StoreBoardViewModel;
  selectedPeriod: StoreBoardPeriod;
  selectedTrendMetric: StoreBoardMetricKey;
  customDateRange: { start: string | null; end: string | null };
  onPeriodChange: (period: StoreBoardPeriod) => void;
  onDateChange: (date: string | null) => void;
  onCustomDateRangeChange: (range: { start: string | null; end: string | null }) => void;
  onTrendMetricChange: (metric: StoreBoardMetricKey) => void;
  onStoreHrefChange: (href: string) => void;
}

const pillTone = (tone: StoreBoardViewModel["statusTone"]): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (tone === "emerald") return "success";
  if (tone === "amber") return "warning";
  if (tone === "rose") return "danger";
  if (tone === "blue") return "info";
  return "neutral";
};

const metricFormatter = (metricKey: StoreBoardMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") return formatInteger(value);
  return formatMoney(value);
};

function StoreContextBar({
  viewModel,
  selectedPeriod,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onStoreHrefChange,
}: Omit<StoreBoardCommandCenterProps, "selectedTrendMetric" | "onTrendMetricChange">) {
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
    <section className="panel p-4" aria-label="店铺经营范围控制">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={pillTone(viewModel.statusTone)}>{viewModel.statusLabel}</StatusPill>
            {context ? (
              <span className="min-w-0 text-sm text-slate-500">
                {context.platformLabel} · <span className="break-words font-medium text-slate-700">{context.storeName}</span>
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

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">平台</span>
              <select
                id="store-board-platform-select"
                className="form-input"
                value={context?.platformCode ?? ""}
                onChange={(event) => {
                  const selected = platformOptions.find((platform) => platform.platformCode === event.target.value);
                  if (selected) onStoreHrefChange(selected.href);
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
              <span className="mb-1 block text-xs font-semibold text-slate-500">经营日期</span>
              <select
                id="store-board-business-date-select"
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

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">店铺</span>
              <select
                id="store-board-store-select"
                className="form-input"
                value={context?.storeKey ?? ""}
                onChange={(event) => {
                  const selected = context?.availableStores.find((store) => store.value === event.target.value);
                  if (selected) onStoreHrefChange(selected.href);
                }}
              >
                {context?.availableStores.map((store) => (
                  <option key={store.value} value={store.value}>
                    {store.label}
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
          <Link
            href={
              context
                ? targetSettingsHref({
                  scope: "store",
                  platformCode: context.platformCode,
                  storeId: context.storeId,
                })
                : "/targets?scope=store"
            }
            className="primary-button justify-center"
          >
            目标设置
          </Link>
          <Link href="/upload" className="secondary-button justify-center">
            数据导入
          </Link>
        </div>
      </div>
    </section>
  );
}

function StoreMetricGrid({ viewModel }: { viewModel: StoreBoardViewModel }) {
  return (
    <section aria-label="店铺核心指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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

function StoreMainTrend({
  viewModel,
  selectedMetric,
  onMetricChange,
}: {
  viewModel: StoreBoardViewModel;
  selectedMetric: StoreBoardMetricKey;
  onMetricChange: (metric: StoreBoardMetricKey) => void;
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
      title="店铺主趋势"
      description="单日期只展示当日值；缺失日期不会补 0。"
      action={
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="店铺趋势指标">
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
        当前图表展示店铺每日实际值和范围累计实际值，当前指标为
        {viewModel.trendMetricOptions.find((item) => item.key === selectedMetric)?.label ?? selectedMetric}。
      </p>
      {!hasData ? (
        <div className="flex min-h-56 items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-900">当前范围暂无可展示趋势数据</p>
            <p className="mt-2 text-sm text-slate-500">请选择有经营数据的日期范围，缺失日期不会按 0 处理。</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-50 p-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="店铺主趋势图"
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

function LegacyDrilldownActions({
  viewModel,
  kind,
}: {
  viewModel: StoreBoardViewModel;
  kind: "product" | "series";
}) {
  const context = viewModel.storeContext;
  if (!context) return null;
  const isProduct = kind === "product";
  const legacyHref = isProduct
    ? `/product-board?${new URLSearchParams({ platform: context.platformCode, storeId: context.storeId }).toString()}`
    : `/series-board?${new URLSearchParams({ platform: context.platformCode, storeId: context.storeId }).toString()}`;
  const disabledDescriptionId = `store-board-${kind}-disabled-note`;

  if (context.isDefaultLegacyStore || !isProduct) {
    return (
      <Link href={legacyHref} className="secondary-button shrink-0 justify-center">
        {isProduct ? "查看商品看板" : "查看系列看板"}
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button
        type="button"
        disabled
        aria-describedby={disabledDescriptionId}
        className="secondary-button cursor-not-allowed justify-center opacity-60"
      >
        {isProduct ? "商品看板待升级" : "系列看板待升级"}
      </button>
      <Link href={context.historyHref} className="secondary-button justify-center">
        查看该店铺导入记录
      </Link>
      <p id={disabledDescriptionId} className="sr-only">
        非默认店铺的{isProduct ? "商品" : "系列"}下钻将在后续阶段升级，当前不会进入旧单店页面。
      </p>
    </div>
  );
}

function StoreTargetSummary({ viewModel }: { viewModel: StoreBoardViewModel }) {
  const context = viewModel.storeContext;
  const settingsHref = context
    ? targetSettingsHref({
      scope: "store",
      platformCode: context.platformCode,
      storeId: context.storeId,
    })
    : "/targets?scope=store";

  return (
    <CompactTargetSummary
      title="店铺目标进度"
      description="只展示当前 platformCode + storeId 可匹配当前周期的 store 目标。"
      emptyLabel="当前周期暂无店铺目标"
      settingsHref={settingsHref}
      targets={viewModel.targetProgress}
      formatValue={formatTargetMetricValue}
    />
  );
}

function StoreFocusSection({ viewModel }: { viewModel: StoreBoardViewModel }) {
  const [activeTab, setActiveTab] = useState<FocusTabKey>("products");
  const context = viewModel.storeContext;
  const managerParams = context
    ? new URLSearchParams({ platform: context.platformCode, storeId: context.storeId }).toString()
    : "";
  return (
    <SectionCard
      title="店铺表现与优先入口"
      description="通过运营关注 Tabs 查看当前店铺的商品、系列、推广和售后安全聚合。"
      action={
        viewModel.storeContext ? (
          <Link href={viewModel.storeContext.historyHref} className="secondary-button justify-center">
            查看导入记录
          </Link>
        ) : null
      }
    >
      <div className="space-y-4">
        <StoreTargetSummary viewModel={viewModel} />

        {context ? (
          <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">自定义关注对象</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                系列和重点商品由用户主动维护，按当前店铺隔离保存。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:justify-end">
              <Link href={`/series-board/manage?${managerParams}`} className="secondary-button justify-center">
                管理系列
              </Link>
              <Link href={`/product-board/tracked?${managerParams}`} className="secondary-button justify-center">
                管理重点商品
              </Link>
            </div>
          </div>
        ) : null}

        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="店铺运营关注">
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

        {activeTab === "products" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">商品 TOP5</p>
                <p className="mt-1 text-xs text-slate-500">当前店铺 GMV TOP5；只有已添加为重点商品的记录可进入宝贝看板。</p>
              </div>
              {context ? (
                <Link href={`/product-board/tracked?${managerParams}`} className="secondary-button shrink-0 justify-center">
                  管理重点商品
                </Link>
              ) : null}
            </div>
            {viewModel.productTop.length === 0 ? (
              <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-100">
                当前范围暂无商品排行。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {viewModel.productTop.map((product, index) => (
                  <article key={product.productId} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-900">
                          {index + 1}. {product.productName}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">{product.productId}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        TOP
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                      <span>GMV {formatMoney(product.gmv)}</span>
                      <span>访客 {formatInteger(product.visitors)}</span>
                      <span>转化 {formatPercent(product.conversionRate)}</span>
                      <span>推广 {product.hasAdData ? formatMoney(product.adSpend) : "--"}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.productBoardHref ? (
                        <Link href={product.productBoardHref} className="secondary-button">
                          查看重点商品
                        </Link>
                      ) : (
                        <>
                          <button type="button" disabled className="secondary-button cursor-not-allowed opacity-60">
                            未设为重点商品
                          </button>
                          <Link href={product.manageTrackedHref || `/product-board/tracked?${managerParams}`} className="text-xs font-semibold text-blue-700">
                            添加到重点商品
                          </Link>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "series" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">系列进度</p>
                <p className="mt-1 text-xs text-slate-500">只展示当前店铺已创建的系列，最多 5 个。</p>
              </div>
              <LegacyDrilldownActions viewModel={viewModel} kind="series" />
            </div>
            {viewModel.seriesProgress.length === 0 ? (
              <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500 ring-1 ring-slate-100">
                当前店铺暂无系列，或当前范围没有系列经营数据。
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {viewModel.seriesProgress.map((series) => (
                  <article key={series.seriesId} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-slate-900">{series.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{series.productCount} 个商品</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        {formatPercent(series.targetProgressRate)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <span>GMV {formatMoney(series.gmv)}</span>
                      <span>访客 {formatInteger(series.visitors)}</span>
                      <span>转化 {formatPercent(series.conversionRate)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "ad_after_sales" ? (
          <div role="tabpanel" className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">推广与售后</p>
                <p className="mt-1 text-xs text-slate-500">推广使用计划推广口径；售后只展示安全聚合。</p>
              </div>
              <Link href={viewModel.dataStatus.qualityHref} className="secondary-button shrink-0 justify-center">
                查看数据质量
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">推广花费</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatMoney(viewModel.adSummary.adSpend)}</p>
                <p className="mt-1 text-xs text-slate-500">ROI {formatRoi(viewModel.adSummary.adRoi)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">推广计划数</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {viewModel.adSummary.hasAdData ? formatInteger(viewModel.adSummary.planCount) : "--"}
                </p>
                <p className="mt-1 text-xs text-slate-500">缺失推广不按 0 计算</p>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <p className="text-xs font-semibold text-slate-500">成功退款金额</p>
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
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={viewModel.dataStatus.warningCount > 0 ? "warning" : "info"}>
                {viewModel.dataStatus.activeDatasetStatus}
              </StatusPill>
              <span className="text-sm text-slate-500">
                {viewModel.dataStatus.storeCount} 个店铺 · {viewModel.dateRange.dataDayCount} 天经营数据
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {viewModel.dataStatus.warningCount > 0
                ? `当前有 ${viewModel.dataStatus.warningCount} 条数据质量提示。`
                : "当前店铺范围已可用于看板展示。"}
            </p>
          </div>
          <Link href={viewModel.dataStatus.qualityHref} className="secondary-button shrink-0 justify-center">
            查看数据质量
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

export function StoreBoardCommandCenter({
  viewModel,
  selectedPeriod,
  selectedTrendMetric,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onTrendMetricChange,
  onStoreHrefChange,
}: StoreBoardCommandCenterProps) {
  if (viewModel.mode === "empty" || viewModel.mode === "invalid_store") {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-5">
        <StoreBoardSafeState
          title={viewModel.mode === "invalid_store" ? "当前店铺不可用" : "当前没有店铺数据"}
          description={viewModel.notices[0] ?? "请先完成数据导入。"}
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
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      {viewModel.notices.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-blue-800">
          {viewModel.notices.slice(0, 2).map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}

      <StoreContextBar
        viewModel={viewModel}
        selectedPeriod={selectedPeriod}
        customDateRange={customDateRange}
        onPeriodChange={onPeriodChange}
        onDateChange={onDateChange}
        onCustomDateRangeChange={onCustomDateRangeChange}
        onStoreHrefChange={onStoreHrefChange}
      />

      <StoreMetricGrid viewModel={viewModel} />

      <StoreMainTrend
        viewModel={viewModel}
        selectedMetric={selectedTrendMetric}
        onMetricChange={onTrendMetricChange}
      />

      <StoreFocusSection viewModel={viewModel} />
    </div>
  );
}
