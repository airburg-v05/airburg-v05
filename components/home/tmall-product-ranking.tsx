import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallHomeOverview } from "@/lib/tmall/view-models/home-overview";
import { formatInteger, formatMoney, formatPercent, formatRoi } from "./tmall-format";

interface TmallProductRankingProps {
  overview: TmallHomeOverview;
}

export function TmallProductRanking({ overview }: TmallProductRankingProps) {
  return (
    <SectionCard
      title="商品销售额排行"
      description="选中经营日期的 GMV 前五商品"
      action={<StatusPill tone={overview.productRanking.length > 0 ? "info" : "neutral"}>TOP {overview.productRanking.length}</StatusPill>}
    >
      {overview.productRanking.length > 0 ? (
        <div className="space-y-4">
          {overview.productRanking.map((item, index) => (
            <article key={item.productId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.productName}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">商品 ID：{item.productId}</p>
                    </div>
                  </div>
                </div>
                <p className="text-base font-semibold text-slate-950">{formatMoney(item.gmv)}</p>
              </div>

              <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <RankingMeta label="GSV" value={formatMoney(item.gsv)} />
                <RankingMeta label="商品访客数" value={formatInteger(item.visitors)} />
                <RankingMeta label="支付转化率" value={formatPercent(item.conversionRate)} />
                <RankingMeta
                  label="商品推广"
                  value={item.hasAdData ? `${formatMoney(item.adSpend)} · ROI ${formatRoi(item.adRoi)}` : "暂无推广数据"}
                />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-slate-900">暂无商品排行</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            缺少所选日期的生意参谋商品数据，暂时无法生成 GMV 排行。
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function RankingMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-700">{value}</p>
    </div>
  );
}
