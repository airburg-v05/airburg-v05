import { SectionCard } from "@/components/ui/section-card";
import type { TmallStoreAfterSalesOverview } from "@/lib/tmall/view-models/store-board";
import { formatDateRange, formatInteger, formatMoney } from "./store-format";

interface StoreAfterSalesSummaryProps {
  afterSales: TmallStoreAfterSalesOverview;
}

export function StoreAfterSalesSummary({ afterSales }: StoreAfterSalesSummaryProps) {
  if (!afterSales.hasAfterSalesData) {
    return (
      <SectionCard title="店铺售后摘要" description="售后只展示安全聚合数据，不展示个人、交易、配送或沟通类敏感明细。">
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
          当前分析结果未包含售后退款数据。
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="店铺售后摘要"
      description={`售后汇总范围：${formatDateRange(afterSales.dateRange)}。售后文件整体范围不一定严格等于当前经营日期。`}
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">当前经营日期售后</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AfterSalesMetric label="退款申请数" value={formatInteger(afterSales.selectedDateMetrics.refundApplyCount)} />
            <AfterSalesMetric label="退款申请金额" value={formatMoney(afterSales.selectedDateMetrics.refundApplyAmount)} />
            <AfterSalesMetric label="退款成功数" value={formatInteger(afterSales.selectedDateMetrics.refundSuccessCount)} />
            <AfterSalesMetric label="退款成功金额" value={formatMoney(afterSales.selectedDateMetrics.refundSuccessTotalAmount)} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-900">售后文件范围汇总</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <AfterSalesMetric label="仅退款数量" value={formatInteger(afterSales.rangeSummary.refundOnlyCount)} />
            <AfterSalesMetric label="退货退款数量" value={formatInteger(afterSales.rangeSummary.returnRefundCount)} />
            <AfterSalesMetric label="待处理数量" value={formatInteger(afterSales.rangeSummary.pendingCount)} />
            <AfterSalesMetric label="超时待处理数量" value={formatInteger(afterSales.rangeSummary.overduePendingCount)} />
            <AfterSalesMetric label="客服介入数量" value={formatInteger(afterSales.rangeSummary.customerServiceInterventionCount)} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DistributionList title="退款原因 TOP 5" items={afterSales.rangeSummary.topReasons} />
          <DistributionList title="售后状态分布" items={afterSales.rangeSummary.statusDistribution} />
        </div>
      </div>
    </SectionCard>
  );
}

function AfterSalesMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DistributionList({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-700">{item.label}</span>
              <span className="font-semibold text-slate-900">{formatInteger(item.count)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">暂无分布数据。</p>
      )}
    </div>
  );
}
