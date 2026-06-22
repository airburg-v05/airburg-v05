"use client";

import type {
  HomeCommandCenterMetricKey,
  HomeCommandCenterTargetProgress,
  HomeCommandCenterViewModel,
} from "@/lib/v05/home-command-center";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  metricValueOfPoint,
  formatTargetMetricValue,
} from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";

interface HomeMainTrendProps {
  viewModel: HomeCommandCenterViewModel;
  selectedMetric: HomeCommandCenterMetricKey;
  onMetricChange: (metric: HomeCommandCenterMetricKey) => void;
}

const metricFormatter = (metricKey: HomeCommandCenterMetricKey, value: number | null): string => {
  if (metricKey === "conversionRate") return formatPercent(value);
  if (metricKey === "visitors" || metricKey === "paidBuyers") return formatInteger(value);
  return formatMoney(value);
};

const chartTargetValue = (
  metricKey: HomeCommandCenterMetricKey,
  targets: HomeCommandCenterTargetProgress[],
): number | null => {
  const target = targets.find((item) => item.metricKey === metricKey);
  return target?.targetValue ?? null;
};

export function HomeMainTrend({
  viewModel,
  selectedMetric,
  onMetricChange,
}: HomeMainTrendProps) {
  const points = viewModel.trendPoints;
  const targetValue = chartTargetValue(selectedMetric, viewModel.targetProgress);
  const dailyValues = points.map((point) => metricValueOfPoint(point, selectedMetric));
  const cumulativeValues = points.map((point) => point.cumulative[selectedMetric]);
  const finiteValues = [...dailyValues, ...cumulativeValues, targetValue].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const maxValue = Math.max(...finiteValues, 0);
  const hasData = points.length > 0 && maxValue > 0;
  const width = 720;
  const height = 260;
  const padding = { left: 42, right: 22, top: 22, bottom: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barSlot = points.length > 0 ? chartWidth / points.length : chartWidth;
  const barWidth = Math.max(10, Math.min(32, barSlot * 0.48));
  const y = (value: number | null): number =>
    value === null || maxValue <= 0
      ? padding.top + chartHeight
      : padding.top + chartHeight - (value / maxValue) * chartHeight;
  const x = (index: number): number =>
    padding.left + barSlot * index + barSlot / 2;
  const linePoints = points
    .map((point, index) => {
      const value = point.cumulative[selectedMetric];
      if (value === null) return null;
      return `${x(index)},${y(value)}`;
    })
    .filter((value): value is string => !!value)
    .join(" ");
  const targetY = targetValue !== null && maxValue > 0 ? y(targetValue) : null;

  return (
    <SectionCard
      title="主趋势"
      description="单日期只展示当日值；日期缺口不会补 0。"
      action={
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="趋势指标">
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
      <div className="space-y-4">
        <p className="sr-only">
          当前图表展示每日实际值和范围累计实际值，当前指标为
          {viewModel.trendMetricOptions.find((item) => item.key === selectedMetric)?.label ?? selectedMetric}。
        </p>
        {!hasData ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
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
              aria-label="首页主趋势图"
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
              {targetY !== null ? (
                <g>
                  <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={targetY}
                    y2={targetY}
                    stroke="#f59e0b"
                    strokeDasharray="6 5"
                  />
                  <text x={padding.left} y={Math.max(14, targetY - 6)} fill="#b45309" fontSize="11">
                    目标参考线
                  </text>
                </g>
              ) : null}
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
                    <text
                      x={centerX}
                      y={height - 18}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="10"
                    >
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

        <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
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

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">目标进度</p>
              <p className="mt-1 text-xs text-slate-500">
                仅展示与当前周期安全匹配的公司或店铺目标。
              </p>
            </div>
            {viewModel.targetProgress.length === 0 ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                当前周期暂无目标
              </span>
            ) : null}
          </div>
          {viewModel.targetProgress.length > 0 ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {viewModel.targetProgress.map((target) => (
                <article key={target.targetId} className="min-w-0 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{target.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{target.scopeLabel}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      {target.statusLabel}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, Math.max(0, (target.progressRate ?? 0) * 100))}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div>
                      <p>实际</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatTargetMetricValue(target.metricKey, target.actualValue)}
                      </p>
                    </div>
                    <div>
                      <p>目标</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {formatTargetMetricValue(target.metricKey, target.targetValue)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
