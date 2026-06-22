import type { HomeCommandCenterViewModel } from "@/lib/v05/home-command-center";
import { HomeMetricCard } from "./home-metric-card";

export function HomeMetricGrid({ viewModel }: { viewModel: HomeCommandCenterViewModel }) {
  return (
    <section aria-label="核心指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {viewModel.metrics.slice(0, 6).map((metric) => (
        <HomeMetricCard key={metric.key} metric={metric} />
      ))}
    </section>
  );
}
