import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallStoreBoardOverview } from "@/lib/tmall/view-models/store-board";
import { formatMetricValue } from "./store-format";

interface StoreAdSummaryProps {
  overview: TmallStoreBoardOverview;
}

export function StoreAdSummary({ overview }: StoreAdSummaryProps) {
  const reconciliation = overview.reconciliationOverview;
  const tone =
    reconciliation.status === "different"
      ? "warning"
      : reconciliation.status === "matched"
        ? "success"
        : "neutral";

  return (
    <SectionCard
      title="店铺推广指标"
      description="店铺推广总量使用计划推广报表；商品推广报表只用于商品覆盖和商品风险下钻。"
      action={<StatusPill tone={tone}>{reconciliation.status === "different" ? "存在差异" : reconciliation.status === "matched" ? "对账一致" : "无可比日期"}</StatusPill>}
    >
      <div
        className={`mb-4 flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm leading-6 sm:flex-row sm:items-center sm:justify-between ${
          reconciliation.status === "different"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-blue-100 bg-blue-50 text-blue-700"
        }`}
      >
        <p>{reconciliation.message}</p>
        <Link href="/upload" className="secondary-button bg-white px-3 py-2 text-xs">
          查看数据质量
        </Link>
      </div>

      {!overview.hasSelectedDatePlanAdData ? (
        <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          当前日期缺少计划推广数据，店铺推广总量暂不可用。
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.adMetrics.map((metric) => (
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
