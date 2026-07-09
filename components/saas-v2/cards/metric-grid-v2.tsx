import type { MetricV2 } from "@/components/saas-v2/data";
import { MetricCardV2 } from "@/components/saas-v2/cards/metric-card-v2";

export function MetricGridV2({ metrics }: { metrics: MetricV2[] }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {metrics.map((metric) => (
        <MetricCardV2 key={metric.label} metric={metric} />
      ))}
    </div>
  );
}
