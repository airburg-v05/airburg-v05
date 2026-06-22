"use client";

import Link from "next/link";
import type {
  SeriesBoardMetricKey,
  SeriesBoardPeriod,
  SeriesBoardViewModel,
} from "@/lib/v05/series-board";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  formatRoi,
  formatSeriesTargetMetricValue,
} from "@/lib/v05/series-board";
import { metricValueOfPoint } from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { CompactTargetSummary } from "@/components/target-context/compact-target-summary";
import { targetSettingsHref } from "@/lib/v05/target-context";
import { SeriesBoardSafeState } from "./series-board-safe-state";

const PERIOD_OPTIONS: Array<{ key: SeriesBoardPeriod; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "custom", label: "自定义" },
];

interface SeriesBoardCommandCenterProps {
  viewModel: SeriesBoardViewModel;
  selectedPeriod: SeriesBoardPeriod;
  selectedTrendMetric: SeriesBoardMetricKey;
  customDateRange: { start: string | null; end: string | null };
  onPeriodChange: (period: SeriesBoardPeriod) => void;
  onDateChange: (date: string | null) => void;
  onCustomDateRangeChange: (range: { start: string | null; end: string | null }) => void;
  onTrendMetricChange: (metric: SeriesBoardMetricKey) => void;
  onHrefChange: (href: string) => void;
}

const pillTone = (tone: SeriesBoardViewModel["statusTone"]): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (tone === "emerald") return "success";
  if (tone === "amber") return "warning";
  if (tone === "rose") return "danger";
  if (tone === "blue") return "info";
  return "neutral";
};

const metricFormatter = (metricKey: SeriesBoardMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") return formatInteger(value);
  return formatMoney(value);
};

function SeriesContextBar({
  viewModel,
  selectedPeriod,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onHrefChange,
}: Omit<SeriesBoardCommandCenterProps, "selectedTrendMetric" | "onTrendMetricChange">) {
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
    <section className="panel p-4" aria-label="系列经营范围控制">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={pillTone(viewModel.statusTone)}>{viewModel.statusLabel}</StatusPill>
            {context ? (
              <span className="min-w-0 text-sm text-slate-500">
                {context.platformLabel} · <span className="break-words font-medium text-slate-700">{context.storeName}</span>
              </span>
            ) : null}
            {viewModel.selectedSeriesName ? (
              <span className="min-w-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {viewModel.selectedSeriesName}
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
                id="series-board-platform-select"
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
                id="series-board-store-select"
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
              <span className="mb-1 block text-xs font-semibold text-slate-500">系列</span>
              <select
                id="series-board-series-select"
                className="form-input"
                value={viewModel.selectedSeriesId ?? ""}
                onChange={(event) => {
                  const selected = viewModel.seriesOptions.find((series) => series.seriesId === event.target.value);
                  if (selected) onHrefChange(selected.href);
                }}
              >
                {viewModel.seriesOptions.length === 0 ? <option value="">暂无系列</option> : null}
                {viewModel.seriesOptions.map((series) => (
                  <option key={series.seriesId} value={series.seriesId}>
                    {series.name}（{series.productCount}）
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">经营日期</span>
              <select
                id="series-board-business-date-select"
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
            <Link href={context.manageSeriesHref} className="primary-button justify-center">
              管理系列
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

function SeriesMetricGrid({ viewModel }: { viewModel: SeriesBoardViewModel }) {
  return (
    <section aria-label="系列核心指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
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

function SeriesTargetSummary({ viewModel }: { viewModel: SeriesBoardViewModel }) {
  const context = viewModel.storeContext;
  const settingsHref = context
    ? targetSettingsHref({
      scope: "series",
      platformCode: context.platformCode,
      storeId: context.storeId,
      seriesId: viewModel.selectedSeriesId,
    })
    : "/targets?scope=series";

  return (
    <CompactTargetSummary
      title="系列目标进度"
      description="只展示当前 storeId + seriesId 可匹配当前周期的 series 目标。"
      emptyLabel="当前周期暂无系列目标"
      settingsHref={settingsHref}
      targets={viewModel.targetProgress}
      formatValue={formatSeriesTargetMetricValue}
    />
  );
}

function SeriesMainTrend({
  viewModel,
  selectedMetric,
  onMetricChange,
}: {
  viewModel: SeriesBoardViewModel;
  selectedMetric: SeriesBoardMetricKey;
  onMetricChange: (metric: SeriesBoardMetricKey) => void;
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
      title="系列主趋势"
      description="单日期只展示当日值；缺失日期不会补 0。"
      action={
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="系列趋势指标">
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
        当前图表展示系列每日实际值和范围累计实际值，当前指标为
        {viewModel.trendMetricOptions.find((item) => item.key === selectedMetric)?.label ?? selectedMetric}。
      </p>
      {!hasData ? (
        <div className="flex min-h-56 items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-900">当前范围暂无可展示趋势数据</p>
            <p className="mt-2 text-sm text-slate-500">请选择有系列商品数据的日期范围，缺失日期不会按 0 处理。</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-50 p-3">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="系列主趋势图"
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

function SeriesProductList({ viewModel }: { viewModel: SeriesBoardViewModel }) {
  const rows = viewModel.productRows.slice(0, 20);
  return (
    <SectionCard
      title="系列商品组成"
      description="只展示当前系列 productIds，默认最多显示 20 条。"
      action={
        viewModel.storeContext ? (
          <Link href={viewModel.storeContext.manageSeriesHref} className="secondary-button justify-center">
            管理系列
          </Link>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          当前系列尚未添加商品，或当前范围没有系列商品数据。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>商品</th>
                <th>数据状态</th>
                <th>GMV</th>
                <th>访客</th>
                <th>买家</th>
                <th>转化率</th>
                <th>推广花费</th>
                <th>ROI</th>
                <th>安全退款</th>
                <th>下钻</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td>
                    <p className="max-w-sm break-words font-semibold text-slate-900">{row.productName}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">{row.productId}</p>
                  </td>
                  <td>
                    <StatusPill tone={row.dataStatus === "business" ? "success" : row.dataStatus === "ad_only" ? "info" : "neutral"}>
                      {row.dataStatus === "business"
                        ? "有经营数据"
                        : row.dataStatus === "ad_only"
                          ? "仅推广数据"
                          : "暂无当前范围数据"}
                    </StatusPill>
                  </td>
                  <td>{formatMoney(row.gmv)}</td>
                  <td>{formatInteger(row.visitors)}</td>
                  <td>{formatInteger(row.paidBuyers)}</td>
                  <td>{formatPercent(row.conversionRate)}</td>
                  <td>{row.hasAdData ? formatMoney(row.adSpend) : "--"}</td>
                  <td>{row.hasAdData ? formatRoi(row.adRoi) : "--"}</td>
                  <td>{formatMoney(row.refundAmount)}</td>
                  <td>
                    {row.productBoardHref ? (
                      <Link href={row.productBoardHref} className="secondary-button whitespace-nowrap">
                        查看重点商品
                      </Link>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled
                          className="secondary-button cursor-not-allowed whitespace-nowrap opacity-60"
                        >
                          未设为重点商品
                          <span className="sr-only">，商品看板待升级为重点商品入口</span>
                        </button>
                        <Link href={row.fallbackHref} className="text-xs font-semibold text-blue-700">
                          添加到重点商品
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2">系列数：{viewModel.dataStatus.seriesCount}</div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">商品数：{viewModel.selectedSeriesProductCount}</div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          数据提示：{viewModel.dataStatus.warningCount} 条 ·
          <Link href={viewModel.dataStatus.qualityHref} className="ml-1 font-semibold text-blue-700">
            查看质量
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

export function SeriesBoardCommandCenter({
  viewModel,
  selectedPeriod,
  selectedTrendMetric,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onTrendMetricChange,
  onHrefChange,
}: SeriesBoardCommandCenterProps) {
  if (
    viewModel.mode === "empty" ||
    viewModel.mode === "invalid_store" ||
    viewModel.mode === "invalid_series" ||
    viewModel.mode === "no_series" ||
    viewModel.mode === "corrupted" ||
    viewModel.mode === "error"
  ) {
    return (
      <SeriesBoardSafeState
        title={viewModel.statusLabel}
        description={viewModel.notices[0] ?? "当前系列数据不可用。"}
        actionHref={viewModel.primaryActions[0]?.href}
        actionLabel={viewModel.primaryActions[0]?.label}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SeriesContextBar
        viewModel={viewModel}
        selectedPeriod={selectedPeriod}
        customDateRange={customDateRange}
        onPeriodChange={onPeriodChange}
        onDateChange={onDateChange}
        onCustomDateRangeChange={onCustomDateRangeChange}
        onHrefChange={onHrefChange}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <SeriesMetricGrid viewModel={viewModel} />
        <SeriesTargetSummary viewModel={viewModel} />
      </div>

      <SeriesMainTrend
        viewModel={viewModel}
        selectedMetric={selectedTrendMetric}
        onMetricChange={onTrendMetricChange}
      />

      <SeriesProductList viewModel={viewModel} />

      {viewModel.notices.length > 0 ? (
        <div className="panel grid gap-3 p-4 text-sm leading-6 text-slate-600 md:grid-cols-3">
          {viewModel.notices.slice(0, 3).map((notice) => (
            <p key={notice} className="rounded-xl bg-slate-50 p-3">{notice}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
