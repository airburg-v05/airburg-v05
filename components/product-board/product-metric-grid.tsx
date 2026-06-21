import { SectionCard } from "@/components/ui/section-card";
import type { TmallProductMetric } from "@/lib/tmall/view-models/product-board";
import { formatMetricValue } from "./product-format";

interface ProductMetricGridProps {
  title: string;
  description: string;
  metrics: TmallProductMetric[];
  emptyMessage?: string;
  notice?: string;
}

export function ProductMetricGrid({
  title,
  description,
  metrics,
  emptyMessage,
  notice,
}: ProductMetricGridProps) {
  return (
    <SectionCard title={title} description={description}>
      {notice ? (
        <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
          {notice}
        </p>
      ) : null}
      {emptyMessage ? (
        <p className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{emptyMessage}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-6">
        {metrics.map((metric) => (
          <article key={metric.key} className="flex min-h-36 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-medium leading-5 text-slate-500">{metric.label}</p>
              <p className="mt-3 break-words text-xl font-semibold tracking-tight text-slate-950">
                {formatMetricValue(metric.value, metric.format)}
              </p>
            </div>
            <div className="mt-3 space-y-1 text-[11px] leading-4 text-slate-400">
              <p>{metric.formula}</p>
              <p>来源：{metric.source}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
