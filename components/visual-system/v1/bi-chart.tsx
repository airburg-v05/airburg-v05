"use client";

import type { ChartModel, ChartSeries } from "@/lib/bi/bi.types";
import { V1ChartModeSwitch, type V1ChartMode } from "./visual-system";
import {
  BI_CHART_COLORS,
  chartMaxValue,
  compactDateLabel,
  finiteChartValue,
  finiteChartValues,
  formatAxisValue,
} from "./chart-utils";

type ChartVariant = "line" | "bar";

export interface BIChartLike {
  id?: string;
  title: string;
  xAxis: string[];
  lines: ChartSeries[];
  series?: ChartSeries[];
  empty: boolean;
}

interface PlotPoint {
  x: number;
  y: number;
  value: number;
  date: string;
}

const asLines = (chart: BIChartLike | ChartModel): ChartSeries[] => {
  const lines = chart.lines.length > 0 ? chart.lines : (chart.series ?? []);
  return lines;
};

const buildSegments = (points: Array<PlotPoint | null>): PlotPoint[][] => {
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  points.forEach((point) => {
    if (!point) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length > 0) segments.push(current);
  return segments;
};

const pathFor = (points: PlotPoint[]) =>
  points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

const areaFor = (points: PlotPoint[], baseline: number) => {
  if (points.length === 0) return "";
  return `${pathFor(points)} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`;
};

export function BIChartLegend({ lines, maxItems = 5 }: { lines: ChartSeries[]; maxItems?: number }) {
  const visible = lines.slice(0, maxItems);
  const hiddenCount = Math.max(lines.length - visible.length, 0);
  return (
    <div data-testid="bi-chart-legend" className="flex max-w-full flex-wrap justify-end gap-2 text-[11px] font-semibold text-slate-700">
      {visible.map((line, index) => (
        <span key={line.id} className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-slate-50 px-2 py-1">
          <span className="h-2 w-5 shrink-0 rounded-full" style={{ backgroundColor: BI_CHART_COLORS[index % BI_CHART_COLORS.length] }} />
          <span className="truncate">{line.name}</span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-slate-500">+{hiddenCount}</span>
      ) : null}
    </div>
  );
}

export function BIChartEmptyState({ text }: { text: string }) {
  return (
    <div
      data-testid="bi-chart-empty-state"
      className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-6 text-center text-sm font-semibold text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
    >
      <span className="block text-slate-700">暂无可展示趋势</span>
      <span className="mt-1 block text-xs text-slate-500">{text}</span>
    </div>
  );
}

export function BITrendChart({
  chart,
  variant = "line",
  height = 340,
  maxLegendItems = 5,
  emptyText = "当前指标暂无可展示趋势",
}: {
  chart: BIChartLike | ChartModel;
  variant?: ChartVariant;
  height?: number;
  maxLegendItems?: number;
  emptyText?: string;
}) {
  const lines = asLines(chart);
  const values = finiteChartValues(lines);
  const hasValues = values.length > 0;
  const maxValue = chartMaxValue(lines);
  const xAxis = chart.xAxis.length > 0 ? chart.xAxis : ["--"];
  const width = 900;
  const svgHeight = 300;
  const left = 76;
  const right = 28;
  const top = 28;
  const bottom = 48;
  const graphWidth = width - left - right;
  const graphHeight = svgHeight - top - bottom;
  const baseline = top + graphHeight;
  const gridCount = 5;
  const singlePoint = values.length === 1;
  const empty = chart.empty || !hasValues;

  const yTicks = Array.from({ length: gridCount }, (_, index) => {
    const ratio = index / (gridCount - 1);
    const value = maxValue * (1 - ratio);
    const y = top + ratio * graphHeight;
    return { y, value };
  });

  const xFor = (index: number) =>
    xAxis.length <= 1 ? left + graphWidth / 2 : left + (index / Math.max(xAxis.length - 1, 1)) * graphWidth;

  const yFor = (value: number) => baseline - (value / maxValue) * graphHeight;
  const xHitWidth = graphWidth / Math.max(xAxis.length, 1);
  const tooltipXFor = (index: number) => {
    if (xAxis.length <= 1) return left;
    const proposed = xFor(index) - xHitWidth / 2;
    return Math.max(left, Math.min(proposed, left + graphWidth - xHitWidth));
  };
  const mergedTooltipFor = (index: number) => {
    const date = xAxis[index] ?? "--";
    const entries = lines.map((line) => {
      const value = finiteChartValue(line.points[index]?.value);
      return `${line.name}: ${value === null ? "--" : formatAxisValue(value)}`;
    });
    return `${compactDateLabel(date)}｜${entries.join("；")}`;
  };
  const hasMissingPoints = lines.some((line) => line.points.some((point) => finiteChartValue(point.value) === null));

  if (empty) {
    return (
      <div
        data-testid="bi-trend-chart"
        className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3"
        style={{ minHeight: height }}
      >
        <div
          data-testid="bi-chart-clean-empty-canvas"
          className="flex min-h-[260px] items-center justify-center rounded-2xl border border-slate-100 bg-[radial-gradient(circle_at_top,_rgba(226,232,240,0.62),_rgba(248,250,252,0.24)_42%,_rgba(255,255,255,0.92)_72%)] px-4"
        >
          <BIChartEmptyState text={emptyText} />
        </div>
        <div data-testid="bi-chart-tooltip" className="sr-only">
          空态不绘制 0 线，图表提示在有数据时按日期合并展示。
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
          <span>{emptyText}</span>
          <span>缺失值不按 0 绘制</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="bi-trend-chart"
      className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3"
      style={{ minHeight: height }}
    >
      <svg viewBox={`0 0 ${width} ${svgHeight}`} className="h-full min-h-[300px] w-full" role="img" aria-label={`${chart.title} BI趋势图`}>
        <defs>
          {lines.map((line, index) => (
            <linearGradient key={line.id} id={`bi-area-${line.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BI_CHART_COLORS[index % BI_CHART_COLORS.length]} stopOpacity="0.16" />
              <stop offset="100%" stopColor={BI_CHART_COLORS[index % BI_CHART_COLORS.length]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        <rect x={left} y={top} width={graphWidth} height={graphHeight} rx="12" fill="#f8fafc" />
        {yTicks.map((tick, index) => (
          <g key={index}>
            <line x1={left} x2={left + graphWidth} y1={tick.y} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={left - 12} y={tick.y + 4} textAnchor="end" fill="#64748b" fontSize="12" fontWeight="600">
              {formatAxisValue(tick.value)}
            </text>
          </g>
        ))}
        {xAxis.map((date, index) => {
          if (xAxis.length > 8 && index % Math.ceil(xAxis.length / 8) !== 0 && index !== xAxis.length - 1) return null;
          return (
            <text key={`${date}-${index}`} x={xFor(index)} y={svgHeight - 18} textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
              {compactDateLabel(date)}
            </text>
          );
        })}
        <line x1={left} x2={left + graphWidth} y1={baseline} y2={baseline} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={left} x2={left} y1={top} y2={baseline} stroke="#cbd5e1" strokeWidth="1.5" />
        {!empty && variant === "bar"
          ? lines.map((line, lineIndex) => {
              const visibleLineCount = Math.max(lines.slice(0, maxLegendItems).length, 1);
              const groupWidth = xAxis.length <= 1 ? 88 : Math.max(28, Math.min(88, graphWidth / Math.max(xAxis.length, 1) - 14));
              const barWidth = Math.max(8, Math.min(24, groupWidth / visibleLineCount - 3));
              return line.points.map((point, index) => {
                const value = finiteChartValue(point.value);
                if (value === null) return null;
                const x = xFor(index) - groupWidth / 2 + lineIndex * (barWidth + 3) + 4;
                const y = yFor(value);
                return (
                  <rect
                    key={`${line.id}-${point.date}-${index}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(baseline - y, 2)}
                    fill={BI_CHART_COLORS[lineIndex % BI_CHART_COLORS.length]}
                    opacity="0.82"
                    rx="5"
                  >
                  </rect>
                );
              });
            })
          : null}
        {!empty && variant === "line"
          ? lines.map((line, lineIndex) => {
              const plotted = line.points.map((point, index) => {
                const value = finiteChartValue(point.value);
                if (value === null) return null;
                return { x: xFor(index), y: yFor(value), value, date: point.date };
              });
              const segments = buildSegments(plotted);
              const color = BI_CHART_COLORS[lineIndex % BI_CHART_COLORS.length];
              const gradientId = `bi-area-${line.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${lineIndex}`;
              return (
                <g key={line.id}>
                  {segments.map((segment, segmentIndex) => (
                    <g key={`${line.id}-${segmentIndex}`}>
                      {segment.length > 1 ? <path d={areaFor(segment, baseline)} fill={`url(#${gradientId})`} /> : null}
                      {segment.length > 1 ? (
                        <path d={pathFor(segment)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
                      ) : null}
                      {segment.map((point) => (
                        <circle key={`${line.id}-${point.date}-${point.x}`} cx={point.x} cy={point.y} r={singlePoint ? 5 : 3.8} fill="#fff" stroke={color} strokeWidth="2.5" />
                      ))}
                    </g>
                  ))}
                </g>
              );
            })
          : null}
        <g data-testid="bi-chart-tooltip-hit-area">
          {xAxis.map((date, index) => (
            <rect
              key={`tooltip-${date}-${index}`}
              x={tooltipXFor(index)}
              y={top}
              width={xHitWidth}
              height={graphHeight}
              fill="transparent"
              pointerEvents="all"
            >
              <title>{mergedTooltipFor(index)}</title>
            </rect>
          ))}
        </g>
      </svg>
      <div data-testid="bi-chart-tooltip" className="sr-only">
        图表提示按日期合并展示，同一日期内的系列数值只出现一次。
      </div>
      <div data-testid="bi-chart-status" className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <span>缺失值不按 0 绘制</span>
        <span>{hasMissingPoints ? "含缺失点" : "数据点完整"}</span>
      </div>
    </div>
  );
}

export function BIChartCard({
  title,
  description,
  chart,
  mode,
  onModeChange,
  showModeSwitch = true,
  variant = "line",
  maxLegendItems = 5,
  emptyText,
  testId = "bi-chart-card",
  modeSwitchTestId,
}: {
  title?: string;
  description?: string;
  chart: BIChartLike | ChartModel;
  mode: V1ChartMode;
  onModeChange: (mode: V1ChartMode) => void;
  showModeSwitch?: boolean;
  variant?: ChartVariant;
  maxLegendItems?: number;
  emptyText?: string;
  testId?: string;
  modeSwitchTestId?: string;
}) {
  const lines = asLines(chart);
  return (
    <section data-testid={testId} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-slate-950">{title ?? chart.title}</h2>
          {description ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          {showModeSwitch ? <V1ChartModeSwitch mode={mode} onChange={onModeChange} testId={modeSwitchTestId ?? `${testId}-mode-switch`} /> : null}
          <BIChartLegend lines={lines} maxItems={maxLegendItems} />
        </div>
      </div>
      <BITrendChart chart={chart} variant={variant} maxLegendItems={maxLegendItems} emptyText={emptyText} />
    </section>
  );
}
