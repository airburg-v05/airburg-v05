import { SectionCard } from "@/components/ui/section-card";
import type { TmallStoreMetric } from "@/lib/tmall/view-models/store-board";
import { formatMetricValue } from "./store-format";

interface StoreMetricGridProps {
  title: string;
  description: string;
  metrics: TmallStoreMetric[];
  notice?: string;
  emptyMessage?: string;
}

export function StoreMetricGrid({
  title,
  description,
  metrics,
  notice,
  emptyMessage,
}: StoreMetricGridProps) {
  return (
    <SectionCard title={title} description={description}>
      {notice ? (
        <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
          {notice}
        </p>
      ) : null}
      {emptyMessage ? (
        <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {emptyMessage}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium leading-5 text-slate-500">{metric.label}</p>
            <p className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
              {formatMetricValue(metric.value, metric.format)}
            </p>
            <p className="mt-3 text-[11px] leading-4 text-slate-400">{metric.helper}</p>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
