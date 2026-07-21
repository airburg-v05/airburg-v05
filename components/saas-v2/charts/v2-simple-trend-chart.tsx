"use client";

export interface V2SimpleTrendMetricOption {
  key: string;
  label: string;
  format: "money" | "integer" | "percent";
}

export interface V2SimpleTrendPoint {
  date: string;
  values: Record<string, number | null>;
  cumulative: Record<string, number | null>;
}

interface V2SimpleTrendChartProps {
  points: V2SimpleTrendPoint[];
  metricOptions: V2SimpleTrendMetricOption[];
  metricKey: string;
  mode: "mtd" | "dly";
  emptyTitle: string;
  onMetricChange: (metricKey: string) => void;
  onModeChange: (mode: "mtd" | "dly") => void;
}

const axisLabel = (value: number, format: V2SimpleTrendMetricOption["format"]): string => {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "integer") return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : `${Math.round(value)}`;
};

const buildSegments = ({
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
    segments.push({
      linePath,
      areaPath: `${linePath} L${last.x.toFixed(2)},${baselineY.toFixed(2)} L${first.x.toFixed(2)},${baselineY.toFixed(2)} Z`,
    });
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

export function V2SimpleTrendChart({
  points,
  metricOptions,
  metricKey,
  mode,
  emptyTitle,
  onMetricChange,
  onModeChange,
}: V2SimpleTrendChartProps) {
  const width = 960;
  const height = 280;
  const padding = { left: 52, right: 20, top: 20, bottom: 32 };
  const option = metricOptions.find((item) => item.key === metricKey) ?? metricOptions[0];
  const values = points.map((point) => mode === "mtd" ? point.cumulative[metricKey] ?? null : point.values[metricKey] ?? null);
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
          onChange={(event) => onMetricChange(event.target.value)}
          value={metricKey}
        >
          {metricOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <div className="flex h-8 items-center rounded-md bg-slate-100 p-0.5">
          {(["mtd", "dly"] as const).map((item) => (
            <button
              key={item}
              className={`h-7 rounded px-3 text-xs font-semibold ${mode === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
              onClick={() => onModeChange(item)}
              type="button"
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 || finite.length === 0 || !option ? (
        <div className="flex h-52 items-center justify-center text-sm font-semibold text-slate-700">{emptyTitle}</div>
      ) : (() => {
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
        const segments = buildSegments({ values, xPositions, yFor, baselineY: height - padding.bottom });
        return (
          <div className="overflow-x-auto">
            <svg className="block h-auto w-full min-w-[720px]" role="img" viewBox={`0 0 ${width} ${height}`}>
              {[0, 1, 2, 3, 4].map((tick) => {
                const y = padding.top + (tick / 4) * plotHeight;
                const value = scale.max - (tick / 4) * (scale.max - scale.min);
                return (
                  <g key={tick}>
                    <line stroke="#e2e8f0" strokeWidth="1" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                    <text fill="#94a3b8" fontSize="11" textAnchor="end" x={padding.left - 8} y={y + 4}>
                      {axisLabel(value, option.format)}
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
                    <text fill="#64748b" fontSize="11" textAnchor="middle" x={xPositions[index]} y={height - 10}>{point.date.slice(5)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })()}
    </div>
  );
}
