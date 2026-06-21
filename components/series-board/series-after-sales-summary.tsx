import { SectionCard } from "@/components/ui/section-card";
import type { TmallSeriesAfterSalesSummary } from "@/lib/tmall/view-models/series-board";
import { formatDateRange, formatInteger, formatMoney } from "./series-format";

interface SeriesAfterSalesSummaryProps {
  summary: TmallSeriesAfterSalesSummary | null;
}

export function SeriesAfterSalesSummary({ summary }: SeriesAfterSalesSummaryProps) {
  return (
    <SectionCard
      title="系列售后摘要"
      description={`售后汇总范围：${summary ? formatDateRange(summary.dateRange) : "--"}。售后数据是售后文件范围内汇总，不一定严格等于当前经营日期。`}
    >
      {summary ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            <AfterSalesItem label="退款申请数" value={formatInteger(summary.refundApplyCount)} />
            <AfterSalesItem label="退款成功数" value={formatInteger(summary.refundSuccessCount)} />
            <AfterSalesItem label="退款申请金额" value={formatMoney(summary.refundApplyAmount)} />
            <AfterSalesItem label="退款成功金额" value={formatMoney(summary.refundSuccessTotalAmount)} />
            <AfterSalesItem label="待处理数量" value={formatInteger(summary.pendingCount)} />
            <AfterSalesItem label="超时待处理数量" value={formatInteger(summary.overduePendingCount)} />
            <AfterSalesItem label="客服介入数量" value={formatInteger(summary.customerServiceInterventionCount)} />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">退款原因 TOP 5</p>
            {summary.topReasons.length > 0 ? (
              <div className="mt-3 space-y-2">
                {summary.topReasons.map((reason) => (
                  <div key={reason.label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-700">{reason.label}</span>
                    <span className="font-semibold text-slate-900">{formatInteger(reason.count)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">暂无退款原因分布。</p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
          当前售后文件中未发现该系列匹配商品的售后记录。
        </p>
      )}
    </SectionCard>
  );
}

function AfterSalesItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

