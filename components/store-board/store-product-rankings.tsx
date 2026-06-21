import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  TmallStoreAdRiskItem,
  TmallStoreProductItem,
  TmallStoreProductRankings,
} from "@/lib/tmall/view-models/store-board";
import { formatInteger, formatMoney, formatPercent } from "./store-format";

interface StoreProductRankingsProps {
  rankings: TmallStoreProductRankings;
}

export function StoreProductRankings({ rankings }: StoreProductRankingsProps) {
  return (
    <SectionCard
      title="商品排行与风险"
      description="风险提示仅用于辅助排查，无推广数据只作为覆盖情况，不视为异常。"
      action={<StatusPill tone="info">{rankings.productCount} 个商品</StatusPill>}
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <CoverageItem label="有推广数据商品数" value={`${formatInteger(rankings.promotedProductCount)} / ${formatInteger(rankings.productCount)}`} />
        <CoverageItem label="无推广数据商品数" value={formatInteger(rankings.noAdProductCount)} />
        <CoverageItem label="商品总数" value={formatInteger(rankings.productCount)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProductList title="GMV TOP 5 商品" items={rankings.gmvTopProducts} mode="gmv" />
        <ProductList title="退款金额 TOP 5 商品" items={rankings.refundTopProducts} mode="refund" />
        <ProductList title="有访客无支付商品" items={rankings.noPaymentProducts} mode="no-payment" />
        <AdRiskList title="有推广花费无推广成交商品" items={rankings.adSpendNoTransactionProducts} />
      </div>
    </SectionCard>
  );
}

function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ProductList({
  title,
  items,
  mode,
}: {
  title: string;
  items: TmallStoreProductItem[];
  mode: "gmv" | "refund" | "no-payment";
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.productId} className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{item.productName}</p>
                  <p className="mt-1 whitespace-nowrap text-xs text-slate-500">商品 ID：{item.productId}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-900">
                  {mode === "refund" ? formatMoney(item.refundSuccessAmount) : mode === "no-payment" ? `${formatInteger(item.visitors)} 访客` : formatMoney(item.gmv)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {mode === "gmv" ? (
                  <>
                    <span>GSV：{formatMoney(item.gsv)}</span>
                    <span>访客：{formatInteger(item.visitors)}</span>
                    <span>转化率：{formatPercent(item.conversionRate)}</span>
                  </>
                ) : mode === "refund" ? (
                  <span>退款率：{formatPercent(item.refundRate)}</span>
                ) : (
                  <span>支付买家数：{formatInteger(item.paidBuyers)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">暂无该类商品。</p>
      )}
    </div>
  );
}

function AdRiskList({
  title,
  items,
}: {
  title: string;
  items: TmallStoreAdRiskItem[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.productId} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
              <div>
                <p className="whitespace-nowrap text-sm font-medium text-slate-800">商品 ID：{item.productId}</p>
                <p className="mt-1 text-xs text-slate-500">推广成交金额：{formatMoney(item.adTransactionAmount)}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(item.adSpend)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">暂无该类提示。</p>
      )}
    </div>
  );
}
