import Link from "next/link";
import type { HomeCommandCenterViewModel } from "@/lib/v05/home-command-center";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";

const statusTone = (warningCount: number) => (warningCount > 0 ? "warning" : "info");

export function HomeDataStatus({ viewModel }: { viewModel: HomeCommandCenterViewModel }) {
  return (
    <SectionCard>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone(viewModel.dataStatus.warningCount)}>
              {viewModel.dataStatus.activeDatasetStatus}
            </StatusPill>
            <span className="text-sm text-slate-500">
              {viewModel.dataStatus.platformCount} 个平台 · {viewModel.dataStatus.storeCount} 个店铺 ·{" "}
              {viewModel.dateRange.dataDayCount} 天经营数据
            </span>
          </div>
          {viewModel.dataStatus.warningCount > 0 ? (
            <p className="mt-2 text-sm text-amber-700">
              当前有 {viewModel.dataStatus.warningCount} 条数据质量提示，建议前往数据质量页面查看。
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">当前范围已可用于首页汇总展示。</p>
          )}
        </div>
        <Link href={viewModel.dataStatus.qualityHref} className="secondary-button shrink-0 justify-center">
          查看数据质量
        </Link>
      </div>
    </SectionCard>
  );
}
