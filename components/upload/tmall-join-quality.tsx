import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatRate } from "@/lib/utils/format";
import type { TmallJoinQuality } from "@/types/tmall";

interface TmallJoinQualityProps {
  joinQuality: TmallJoinQuality;
}

export function TmallJoinQualityPanel({ joinQuality }: TmallJoinQualityProps) {
  return (
    <SectionCard
      title="四表关联质量"
      description="区分“推广记录能否找到商品”和“店铺商品是否都有推广数据”。"
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <JoinMetric
          label="商品推广关联率"
          value={formatRate(joinQuality.advertisedProductJoinRate)}
          detail={`${joinQuality.advertisedProductJoinedCount}/${joinQuality.advertisedProductCount} 个推广商品可关联`}
        />
        <JoinMetric
          label="店铺推广覆盖率"
          value={formatRate(joinQuality.storePromotionCoverage)}
          detail={`${joinQuality.promotedProductCount}/${joinQuality.storeProductCount} 个经营商品有推广`}
        />
        <JoinMetric
          label="计划关联率"
          value={formatRate(joinQuality.planJoinRate)}
          detail={`${joinQuality.joinedPlanCount}/${joinQuality.adProductPlanCount} 个计划可关联`}
        />
        <JoinMetric
          label="售后商品关联率"
          value={formatRate(joinQuality.afterSalesProductJoinRate)}
          detail={`${joinQuality.joinedAfterSalesProductCount}/${joinQuality.afterSalesProductCount} 个售后商品可关联`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
        <div className="mb-2">
          <StatusPill tone="info">口径说明</StatusPill>
        </div>
        <p>
          商品推广关联率 100% 表示商品推广报表里的主体 ID 都能在生意参谋商品 ID 中找到；
          店铺推广覆盖率 47.37% 这类结果表示店铺全部商品里只有一部分有推广记录。两者不是矛盾，而是分母不同。
        </p>
      </div>
    </SectionCard>
  );
}

function JoinMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
