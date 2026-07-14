"use client";

import { useMemo, useState } from "react";
import type { V2HomeChartMode, V2HomeChartModel } from "@/types/v2/home";

type DisplayMode = "single" | "dual";

const WIDTH = 920;
const HEIGHT = 320;
const PADDING = { left: 54, right: 54, top: 28, bottom: 42 };

const compactAxisValue = (value: number, unit: string): string => {
  const absolute = Math.abs(value);
  if (unit === "%") return `${(value * 100).toFixed(0)}%`;
  if (absolute >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (absolute >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (absolute >= 10) return value.toFixed(0);
  return value.toFixed(1);
};

const scaleForValues = (values: Array<number | null>) => {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finite.length === 0) return null;
  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const spread = rawMax - rawMin;
  const padding = spread === 0 ? Math.max(Math.abs(rawMax) * 0.1, 1) : spread * 0.12;
  return { min: rawMin - padding, max: rawMax + padding };
};

const yForValue = (value: number, scale: { min: number; max: number }) => {
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + ((scale.max - value) / (scale.max - scale.min)) * plotHeight;
};

const pathSegments = (
  values: Array<number | null>,
  xPositions: number[],
  scale: { min: number; max: number } | null,
): string[] => {
  if (!scale) return [];
  const segments: string[] = [];
  let active = "";
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (active) segments.push(active);
      active = "";
      return;
    }
    const command = active ? "L" : "M";
    active += `${command}${xPositions[index].toFixed(2)},${yForValue(value, scale).toFixed(2)} `;
  });
  if (active) segments.push(active);
  return segments;
};

export function V2HomeChart({
  model,
  displayMode,
  comparisonMessage,
  onModeChange,
  onPairChange,
  onDisplayModeChange,
}: {
  model: V2HomeChartModel;
  displayMode: DisplayMode;
  comparisonMessage: string | null;
  onModeChange: (mode: V2HomeChartMode) => void;
  onPairChange: (pairId: string) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chart = useMemo(() => {
    const xStart = PADDING.left;
    const xEnd = WIDTH - PADDING.right;
    const xPositions = model.points.map((_, index) =>
      model.points.length <= 1 ? (xStart + xEnd) / 2 : xStart + (index / (model.points.length - 1)) * (xEnd - xStart),
    );
    const leftValues = model.points.map((point) => point.leftValue);
    const rightValues = model.points.map((point) => point.rightValue);
    const leftScale = model.pair.dualAxis && displayMode === "dual"
      ? scaleForValues(leftValues)
      : scaleForValues(displayMode === "dual" ? [...leftValues, ...rightValues] : leftValues);
    const rightScale = model.pair.dualAxis && displayMode === "dual" ? scaleForValues(rightValues) : leftScale;
    return {
      xPositions,
      leftScale,
      rightScale,
      leftPaths: pathSegments(leftValues, xPositions, leftScale),
      rightPaths: displayMode === "dual" ? pathSegments(rightValues, xPositions, rightScale) : [],
    };
  }, [displayMode, model]);
  const activePoint = activeIndex === null ? null : model.points[activeIndex] ?? null;

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="v2-home-chart">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">经营趋势</h2>
          <p className="mt-1 text-xs text-slate-500">图表与当前经营范围、时间范围同步。</p>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <div className="flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {(["mtd", "dly"] as const).map((mode) => (
              <button
                key={mode}
                className={`h-7 rounded px-2.5 text-xs font-semibold ${model.mode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => onModeChange(mode)}
                type="button"
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {(["single", "dual"] as const).map((mode) => (
              <button
                key={mode}
                className={`h-7 rounded px-2.5 text-xs font-semibold ${displayMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                onClick={() => onDisplayModeChange(mode)}
                type="button"
              >
                {mode === "single" ? "单指标" : "双指标"}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="v2-home-chart-pair">图表指标组合</label>
          <select
            id="v2-home-chart-pair"
            className="h-8 max-w-52 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
            onChange={(event) => onPairChange(event.target.value)}
            value={model.pair.id}
          >
            {model.availablePairs.map((pair) => (
              <option key={pair.id} value={pair.id}>{pair.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5" data-testid="v2-home-chart-left-legend"><span className="h-2 w-2 rounded-full bg-blue-600" />{model.pair.leftLabel}</span>
        {displayMode === "dual" ? (
          <span className="flex items-center gap-1.5" data-testid="v2-home-chart-right-legend"><span className="h-2 w-2 rounded-full bg-emerald-500" />{model.pair.rightLabel}</span>
        ) : null}
        {comparisonMessage ? <span className="text-amber-700">{comparisonMessage}</span> : null}
      </div>

      {model.empty || !chart.leftScale ? (
        <div className="mt-4 flex min-h-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-800">当前范围暂无可绘制数据</p>
            <p className="mt-1 text-xs text-slate-500">缺失值保持为空，不绘制虚假 0 线。</p>
          </div>
        </div>
      ) : (
        <div className="relative mt-3 min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60">
          <div className="overflow-x-auto">
            <svg
              aria-label={`${model.mode.toUpperCase()} ${model.pair.label}趋势图`}
              className="block h-auto w-full min-w-[640px]"
              onMouseLeave={() => setActiveIndex(null)}
              role="img"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            >
            {[0, 1, 2, 3, 4].map((tick) => {
              const y = PADDING.top + (tick / 4) * (HEIGHT - PADDING.top - PADDING.bottom);
              const leftValue = chart.leftScale!.max - (tick / 4) * (chart.leftScale!.max - chart.leftScale!.min);
              const rightValue = chart.rightScale
                ? chart.rightScale.max - (tick / 4) * (chart.rightScale.max - chart.rightScale.min)
                : null;
              return (
                <g key={tick}>
                  <line stroke="#e2e8f0" strokeWidth="1" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
                  <text fill="#94a3b8" fontSize="11" textAnchor="end" x={PADDING.left - 8} y={y + 4}>
                    {compactAxisValue(leftValue, model.pair.leftUnit)}
                  </text>
                  {model.pair.dualAxis && displayMode === "dual" && rightValue !== null ? (
                    <text fill="#94a3b8" fontSize="11" textAnchor="start" x={WIDTH - PADDING.right + 8} y={y + 4}>
                      {compactAxisValue(rightValue, model.pair.rightUnit)}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {chart.leftPaths.map((path, index) => (
              <path key={`left-${index}`} d={path} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            ))}
            {chart.rightPaths.map((path, index) => (
              <path key={`right-${index}`} d={path} fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            ))}

            {model.points.map((point, index) => {
              const x = chart.xPositions[index];
              const leftY = point.leftValue !== null ? yForValue(point.leftValue, chart.leftScale!) : null;
              const rightY = displayMode === "dual" && point.rightValue !== null && chart.rightScale
                ? yForValue(point.rightValue, chart.rightScale)
                : null;
              const hitWidth = (WIDTH - PADDING.left - PADDING.right) / Math.max(1, model.points.length);
              return (
                <g key={point.date}>
                  {leftY !== null ? <circle cx={x} cy={leftY} fill="#fff" r="4" stroke="#2563eb" strokeWidth="2.5" /> : null}
                  {rightY !== null ? <circle cx={x} cy={rightY} fill="#fff" r="4" stroke="#10b981" strokeWidth="2.5" /> : null}
                  <rect
                    fill="transparent"
                    height={HEIGHT - PADDING.top - PADDING.bottom}
                    onClick={() => setActiveIndex(index)}
                    onMouseEnter={() => setActiveIndex(index)}
                    width={hitWidth}
                    x={Math.max(PADDING.left, x - hitWidth / 2)}
                    y={PADDING.top}
                  />
                  <text fill="#64748b" fontSize="11" textAnchor="middle" x={x} y={HEIGHT - 16}>{point.dateLabel}</text>
                </g>
              );
            })}
            {activeIndex !== null && chart.xPositions[activeIndex] !== undefined ? (
              <line
                stroke="#94a3b8"
                strokeDasharray="4 4"
                x1={chart.xPositions[activeIndex]}
                x2={chart.xPositions[activeIndex]}
                y1={PADDING.top}
                y2={HEIGHT - PADDING.bottom}
              />
            ) : null}
            </svg>
          </div>
          {activePoint ? (
            <div className="pointer-events-none absolute left-3 top-3 min-w-40 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
              <p className="font-semibold text-slate-800">{activePoint.date}</p>
              <p className="mt-1 text-blue-700">{model.pair.leftLabel}：{activePoint.leftFormatted}</p>
              {displayMode === "dual" ? (
                <p className="mt-1 text-emerald-700">{model.pair.rightLabel}：{activePoint.rightFormatted}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
