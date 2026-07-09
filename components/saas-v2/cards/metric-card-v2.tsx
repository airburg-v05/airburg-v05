import type { MetricV2 } from "@/components/saas-v2/data";

export function MetricCardV2({ metric }: { metric: MetricV2 }) {
  const progress = Math.max(0, Math.min(100, metric.progress));

  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-slate-900">{metric.label}</h3>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{metric.value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{metric.note}</p>
        </div>
        {metric.unit ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
            {metric.unit}
          </span>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-slate-400">MTD目标</dt>
          <dd className="mt-1 font-semibold text-slate-700">{metric.mtdTarget}</dd>
        </div>
        <div>
          <dt className="text-slate-400">总目标</dt>
          <dd className="mt-1 font-semibold text-slate-700">{metric.totalTarget}</dd>
        </div>
        <div>
          <dt className="text-slate-400">差值</dt>
          <dd className="mt-1 font-semibold text-slate-700">{metric.delta}</dd>
        </div>
        <div>
          <dt className="text-slate-400">完成率</dt>
          <dd className="mt-1 font-semibold text-slate-700">{metric.completion}</dd>
        </div>
      </dl>
      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
      </div>
    </article>
  );
}
