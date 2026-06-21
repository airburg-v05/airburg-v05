import { SectionCard } from "@/components/ui/section-card";
import type {
  TmallProductAfterSalesSummary,
} from "@/lib/tmall/view-models/product-board";
import type { TmallDateRange } from "@/types/tmall";
import { formatHours, formatInteger, formatMoney } from "./product-format";

interface ProductAfterSalesSummaryProps {
  summary: TmallProductAfterSalesSummary | null;
  dateRange: TmallDateRange;
}

const formatDateRange = (range: TmallDateRange): string => {
  if (!range.start) return "--";
  if (!range.end || range.end === range.start) return range.start;
  return `${range.start} 至 ${range.end}`;
};

export function ProductAfterSalesSummary({ summary, dateRange }: ProductAfterSalesSummaryProps) {
  return (
    <SectionCard title="商品售后摘要" description={`售后汇总范围：${formatDateRange(dateRange)}`}>
      {summary ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AfterSalesItem label="退款申请数" value={formatInteger(summary.refundApplyCount)} />
            <AfterSalesItem label="退款成功数" value={formatInteger(summary.refundSuccessCount)} />
            <AfterSalesItem label="退款申请金额" value={formatMoney(summary.refundApplyAmount)} />
            <AfterSalesItem label="退款成功金额" value={formatMoney(summary.refundSuccessTotalAmount)} />
            <AfterSalesItem label="待处理数量" value={formatInteger(summary.pendingCount)} />
            <AfterSalesItem label="超时待处理数量" value={formatInteger(summary.overduePendingCount)} />
            <AfterSalesItem label="客服介入数量" value={formatInteger(summary.customerServiceInterventionCount)} />
            <AfterSalesItem label="平均售后处理时长" value={formatHours(summary.avgAfterSalesDurationHours)} />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">退款原因 TOP 3</p>
            {summary.topReasons.length > 0 ? (
              <div className="mt-3 space-y-2">
                {summary.topReasons.map((reason) => (
                  <div key={reason.label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-700">{reason.label}</span>
                    <span className="font-semibold text-slate-900">{reason.count}</span>
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
          当前售后文件中未发现该商品的售后记录。
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
