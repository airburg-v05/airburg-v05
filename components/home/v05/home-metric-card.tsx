import type { HomeCommandCenterMetric } from "@/lib/v05/home-command-center";

const toneClasses: Record<HomeCommandCenterMetric["tone"], string> = {
  blue: "border-blue-100 bg-blue-50/40 text-blue-700",
  amber: "border-amber-100 bg-amber-50/50 text-amber-700",
  emerald: "border-emerald-100 bg-emerald-50/45 text-emerald-700",
  rose: "border-rose-100 bg-rose-50/45 text-rose-700",
  slate: "border-slate-100 bg-slate-50 text-slate-600",
};

export function HomeMetricCard({ metric }: { metric: HomeCommandCenterMetric }) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-500">{metric.label}</p>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses[metric.tone]}`}>
          核心
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-950">
        {metric.formattedValue}
      </p>
      <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{metric.helper}</p>
    </article>
  );
}
