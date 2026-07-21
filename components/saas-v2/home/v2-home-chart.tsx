"use client";

import { useMemo, useState } from "react";
import type {
  V2HomeChartMode,
  V2HomeChartModel,
} from "@/types/v2/home";

type DisplayMode = "single" | "dual";

const WIDTH = 1280;
const HEIGHT = 280;
const PADDING = { left: 58, right: 58, top: 20, bottom: 38 };

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

const areaSegments = (
  values: Array<number | null>,
  xPositions: number[],
  scale: { min: number; max: number } | null,
): string[] => {
  if (!scale) return [];
  const areas: string[] = [];
  let points: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (points.length === 0) return;
    const baseline = HEIGHT - PADDING.bottom;
    const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    areas.push(`${line} L${points[points.length - 1].x.toFixed(2)},${baseline} L${points[0].x.toFixed(2)},${baseline} Z`);
    points = [];
  };
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      flush();
      return;
    }
    points.push({ x: xPositions[index], y: yForValue(value, scale) });
  });
  flush();
  return areas;
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
      leftAreas: areaSegments(leftValues, xPositions, leftScale),
      rightPaths: displayMode === "dual" ? pathSegments(rightValues, xPositions, rightScale) : [],
    };
  }, [displayMode, model]);
  const activePoint = activeIndex === null ? null : model.points[activeIndex] ?? null;
  const primaryPairs = Array.from(new Map(model.availablePairs.map((pair) => [pair.leftMetricKey, pair])).values());
  const comparisonPairs = model.availablePairs.filter((pair) => pair.leftMetricKey === model.pair.leftMetricKey);

  return (
    <section
      className="min-w-0 rounded-xl border border-slate-200 bg-white"
      data-home-region="trend"
      data-testid="v2-home-chart"
    >
      <div className="flex flex-col gap-3 px-4 pb-2 pt-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-base font-semibold text-slate-900">经营趋势</h2>
        <div className="flex max-w-full flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[10px] text-slate-400" htmlFor="v2-home-chart-primary">
            主指标
            <select
              id="v2-home-chart-primary"
              className="h-8 max-w-36 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
              onChange={(event) => {
                const next = primaryPairs.find((pair) => pair.leftMetricKey === event.target.value);
                if (next) onPairChange(next.id);
              }}
              value={model.pair.leftMetricKey}
            >
              {primaryPairs.map((pair) => (
                <option key={pair.leftMetricKey} value={pair.leftMetricKey}>{pair.leftLabel}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] text-slate-400" htmlFor="v2-home-chart-pair">
            对比指标
            <select
              id="v2-home-chart-pair"
              className="h-8 max-w-40 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
              onChange={(event) => {
                if (event.target.value === "none") {
                  onDisplayModeChange("single");
                  return;
                }
                onPairChange(event.target.value);
                onDisplayModeChange("dual");
              }}
              value={displayMode === "single" ? "none" : model.pair.id}
            >
              <option value="none">不对比</option>
              {comparisonPairs.map((pair) => (
                <option key={pair.id} value={pair.id}>{pair.rightLabel}</option>
              ))}
            </select>
          </label>

          <div className="flex h-8 items-center rounded-md bg-slate-100 p-0.5">
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
        </div>
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-2 text-xs text-slate-600 sm:px-5">
        <span className="flex items-center gap-1.5" data-testid="v2-home-chart-left-legend"><span className="h-2 w-2 rounded-full bg-blue-600" />{model.pair.leftLabel}</span>
        {displayMode === "dual" ? (
          <span className="flex items-center gap-1.5" data-testid="v2-home-chart-right-legend"><span className="h-2 w-2 rounded-full bg-[#7c9ddf]" />{model.pair.rightLabel}</span>
        ) : null}
        {comparisonMessage ? <span className="text-amber-700">{comparisonMessage}</span> : null}
      </div>

      {model.empty || !chart.leftScale ? (
        <div className="flex min-h-80 items-center justify-center border-y border-dashed border-slate-200 px-4 text-sm font-medium text-slate-500">
          当前范围暂无趋势数据
        </div>
      ) : (
        <div className="relative min-w-0 overflow-hidden border-y border-slate-100 bg-slate-50/40">
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
                    <line stroke="#edf0f4" strokeWidth="1" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
                    <text fill="#94a3b8" fontSize="11" textAnchor="end" x={PADDING.left - 9} y={y + 4}>
                      {compactAxisValue(leftValue, model.pair.leftUnit)}
                    </text>
                    {model.pair.dualAxis && displayMode === "dual" && rightValue !== null ? (
                      <text fill="#94a3b8" fontSize="11" textAnchor="start" x={WIDTH - PADDING.right + 9} y={y + 4}>
                        {compactAxisValue(rightValue, model.pair.rightUnit)}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {chart.leftAreas.map((area, index) => (
                <path key={`area-${index}`} d={area} fill="#2563eb" fillOpacity="0.07" stroke="none" />
              ))}
              {chart.leftPaths.map((path, index) => (
                <path key={`left-${index}`} d={path} fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
              ))}
              {chart.rightPaths.map((path, index) => (
                <path key={`right-${index}`} d={path} fill="none" stroke="#7c9ddf" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
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
                    {leftY !== null ? <circle cx={x} cy={leftY} fill="#fff" r="3.5" stroke="#2563eb" strokeWidth="2" /> : null}
                    {rightY !== null ? <circle cx={x} cy={rightY} fill="#fff" r="3.5" stroke="#7c9ddf" strokeWidth="2" /> : null}
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
            <div className="pointer-events-none absolute left-3 top-3 min-w-40 rounded-md bg-slate-950 p-3 text-xs text-white shadow-xl">
              <p className="font-medium text-slate-300">{activePoint.date}</p>
              <p className="mt-1.5 flex items-center justify-between gap-4"><span>{model.pair.leftLabel}</span><strong>{activePoint.leftFormatted}</strong></p>
              {displayMode === "dual" ? (
                <p className="mt-1 flex items-center justify-between gap-4"><span>{model.pair.rightLabel}</span><strong>{activePoint.rightFormatted}</strong></p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

    </section>
  );
}
