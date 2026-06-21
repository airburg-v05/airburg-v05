import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallStoreBoardOverview } from "@/lib/tmall/view-models/store-board";
import { formatInteger, formatPercent } from "./store-format";

interface StoreQualitySummaryProps {
  overview: TmallStoreBoardOverview;
}

export function StoreQualitySummary({ overview }: StoreQualitySummaryProps) {
  const quality = overview.joinQuality;

  return (
    <SectionCard
      title="关联与数据质量摘要"
      description="这里只展示关键质量信号，详细明细请在上传页复核。"
      action={<StatusPill tone={overview.dataQualityWarnings.length > 0 ? "warning" : "success"}>{overview.dataQualityWarnings.length} 条质量提醒</StatusPill>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <QualityItem label="推广商品关联成功率" value={formatPercent(quality.advertisedProductJoinRate)} />
        <QualityItem label="店铺商品推广覆盖率" value={formatPercent(quality.storePromotionCoverage)} />
        <QualityItem label="计划关联成功率" value={formatPercent(quality.planJoinRate)} />
        <QualityItem label="售后商品关联成功率" value={formatPercent(quality.afterSalesProductJoinRate)} />
        <QualityItem label="数据质量提醒数量" value={`${formatInteger(overview.dataQualityWarnings.length)} 条`} />
      </div>
      <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
        推广商品关联成功率和店铺商品推广覆盖率分母不同。前者表示推广商品能否匹配经营商品，后者表示店铺商品中有多少商品存在推广记录。
      </div>
      <Link href="/upload" className="secondary-button mt-4 inline-flex">
        查看数据质量
      </Link>
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
