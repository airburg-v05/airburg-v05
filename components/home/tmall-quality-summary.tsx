import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallHomeOverview } from "@/lib/tmall/view-models/home-overview";
import { formatPercent } from "./tmall-format";

interface TmallQualitySummaryProps {
  overview: TmallHomeOverview;
}

export function TmallQualitySummary({ overview }: TmallQualitySummaryProps) {
  const quality = overview.joinQuality;

  return (
    <SectionCard
      title="关联与数据质量摘要"
      description="首页只展示关键质量信号，详细明细请在上传页复核。"
      action={<StatusPill tone={overview.dataQualityWarnings.length > 0 ? "warning" : "success"}>{overview.dataQualityWarnings.length} 条质量提醒</StatusPill>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <QualityItem label="推广商品关联成功率" value={formatPercent(quality.advertisedProductJoinRate)} />
        <QualityItem label="店铺商品推广覆盖率" value={formatPercent(quality.storePromotionCoverage)} />
        <QualityItem label="计划关联成功率" value={formatPercent(quality.planJoinRate)} />
        <QualityItem label="售后商品关联成功率" value={formatPercent(quality.afterSalesProductJoinRate)} />
        <QualityItem label="数据质量提醒数量" value={`${overview.dataQualityWarnings.length} 条`} />
      </div>
      <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
        推广商品关联率和店铺商品推广覆盖率分母不同：前者看推广商品能否找到经营商品，后者看店铺经营商品中有多少商品存在推广记录。
      </p>
    </SectionCard>
  );
}

function QualityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
