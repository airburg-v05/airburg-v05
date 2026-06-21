import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency } from "@/lib/utils/format";
import type { TmallReconciliation } from "@/types/tmall";

interface TmallReconciliationCardProps {
  reconciliation?: TmallReconciliation;
}

const statusView: Record<
  TmallReconciliation["reconciliationStatus"],
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  matched: { label: "金额一致", tone: "success" },
  different: { label: "存在差异", tone: "warning" },
  missing_comparable_dates: { label: "无可比日期", tone: "neutral" },
};

export function TmallReconciliationCard({ reconciliation }: TmallReconciliationCardProps) {
  if (!reconciliation) {
    return (
      <SectionCard title="推广金额核对" description="历史结果缺少核对字段时会显示为空。">
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          当前本地保存结果没有推广金额核对数据，重新上传并分析后会补齐。
        </p>
      </SectionCard>
    );
  }

  const view = statusView[reconciliation.reconciliationStatus];

  return (
    <SectionCard
      title="推广金额核对"
      description="对比计划报表与商品推广报表在共同日期内的花费和成交金额。"
      action={<StatusPill tone={view.tone}>{view.label}</StatusPill>}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <AmountItem label="计划花费" value={formatCurrency(reconciliation.planAdSpend)} />
        <AmountItem label="商品花费" value={formatCurrency(reconciliation.productAdSpend)} />
        <AmountItem label="花费差异" value={formatCurrency(reconciliation.adSpendDifference)} tone="warning" />
        <AmountItem label="计划成交金额" value={formatCurrency(reconciliation.planTransactionAmount)} />
        <AmountItem label="商品成交金额" value={formatCurrency(reconciliation.productTransactionAmount)} />
        <AmountItem
          label="成交金额差异"
          value={formatCurrency(reconciliation.transactionAmountDifference)}
          tone="warning"
        />
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
        计划报表和商品推广报表是不同粒度导出，金额不一致会作为黄色口径提醒，不作为解析错误，也不会阻止保存分析结果。
      </div>
    </SectionCard>
  );
}

function AmountItem({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
