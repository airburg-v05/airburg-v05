import { StatusPill } from "@/components/ui/status-pill";
import { TrendEmptyState } from "./trend-empty-state";
import { formatTrendChange, formatTrendDate, formatTrendValue } from "./trend-format";
import { TrendMiniLine } from "./trend-mini-line";
import type { TrendCardViewModel } from "./trend-types";

interface TrendCardProps {
  card: TrendCardViewModel;
}

const statusTone = {
  empty: "neutral",
  insufficient: "warning",
  ready: "success",
} as const;

const changeClass = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "text-slate-400";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-500";
};

export function TrendCard({ card }: TrendCardProps) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{card.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{card.description}</p>
        </div>
        <StatusPill tone={statusTone[card.status]}>{card.pointCount} 点</StatusPill>
      </div>

      <div className="mt-4">
        <p className="text-xs text-slate-500">最新值 · {formatTrendDate(card.latestDate)}</p>
        <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
          {formatTrendValue(card.latestValue, card.series.unit)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-slate-400">上一日期</p>
          <p className="mt-1 font-medium text-slate-700">{formatTrendDate(card.previousDate)}</p>
          <p className="mt-1 text-slate-500">
            {formatTrendValue(card.previousValue, card.series.unit)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-slate-400">环比变化</p>
          <p className={`mt-1 font-semibold ${changeClass(card.changeRate)}`}>
            {formatTrendChange(card.changeRate)}
          </p>
          <p className="mt-1 text-slate-500">{card.pointCount === 1 ? "仅 1 个日期点" : "相邻日期对比"}</p>
        </div>
      </div>

      <div className="mt-4">
        {card.pointCount === 0 ? (
          <TrendEmptyState title="暂无趋势数据" description="当前来源没有可用日期点" />
        ) : (
          <TrendMiniLine points={card.series.points} />
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>数据源：{card.sourceLabel}</span>
        <span>{card.statusText}</span>
      </div>
    </article>
  );
}
