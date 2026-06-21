import type { TmallTrendPoint } from "@/lib/tmall/view-models/trends";
import { TrendEmptyState } from "./trend-empty-state";

interface TrendMiniLineProps {
  points: TmallTrendPoint[];
}

interface ChartPoint {
  x: number;
  y: number;
  value: number | null;
}

const WIDTH = 240;
const HEIGHT = 92;
const PADDING_X = 12;
const PADDING_Y = 12;

const toFiniteValue = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) ? value : null;

const toPath = (points: ChartPoint[]): string =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

const buildSegments = (points: ChartPoint[]): ChartPoint[][] => {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  points.forEach((point) => {
    if (point.value === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }

    current.push(point);
  });

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
};

export function TrendMiniLine({ points }: TrendMiniLineProps) {
  const normalizedPoints = points.map((point) => ({
    ...point,
    value: toFiniteValue(point.value),
  }));
  const finiteValues = normalizedPoints
    .map((point) => point.value)
    .filter((value): value is number => value !== null);

  if (finiteValues.length === 0) {
    return <TrendEmptyState title="暂无趋势图" description="当前指标没有可绘制的数据点" />;
  }

  const minValue = Math.min(...finiteValues);
  const maxValue = Math.max(...finiteValues);
  const span = maxValue - minValue;
  const drawableWidth = WIDTH - PADDING_X * 2;
  const drawableHeight = HEIGHT - PADDING_Y * 2;
  const chartPoints: ChartPoint[] = normalizedPoints.map((point, index) => {
    const x =
      normalizedPoints.length === 1
        ? WIDTH / 2
        : PADDING_X + (index / (normalizedPoints.length - 1)) * drawableWidth;
    const y =
      point.value === null
        ? HEIGHT / 2
        : span === 0
          ? HEIGHT / 2
          : PADDING_Y + ((maxValue - point.value) / span) * drawableHeight;

    return {
      x,
      y,
      value: point.value,
    };
  });
  const segments = buildSegments(chartPoints);

  return (
    <div className="h-24 rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <svg
        aria-hidden="true"
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <line
          x1={PADDING_X}
          x2={WIDTH - PADDING_X}
          y1={HEIGHT - PADDING_Y}
          y2={HEIGHT - PADDING_Y}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
        {segments.map((segment, index) =>
          segment.length > 1 ? (
            <path
              key={`segment-${index}`}
              d={toPath(segment)}
              fill="none"
              stroke="#2563eb"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null,
        )}
        {segments.flatMap((segment, segmentIndex) =>
          segment.map((point, pointIndex) => (
            <circle
              key={`point-${segmentIndex}-${pointIndex}`}
              cx={point.x}
              cy={point.y}
              fill="#ffffff"
              r="4"
              stroke="#2563eb"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          )),
        )}
      </svg>
    </div>
  );
}
