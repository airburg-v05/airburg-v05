import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallHomeOverview } from "@/lib/tmall/view-models/home-overview";
import { formatInteger, formatMoney } from "./tmall-format";

interface TmallRiskListProps {
  overview: TmallHomeOverview;
}

export function TmallRiskList({ overview }: TmallRiskListProps) {
  const risks = overview.risks;
  const totalRiskCount =
    risks.noPaymentProducts.length +
    risks.adSpendNoTransactionProducts.length +
    risks.refundProducts.length +
    risks.dataQualityWarningCount;
  const totalRiskLabel = totalRiskCount > 0 ? `${totalRiskCount} 条提示` : "暂无提示";

  return (
    <SectionCard
      title="经营风险提示"
      description="规则提示仅用于辅助排查，不替代运营人员最终判断。"
      action={<StatusPill tone={totalRiskCount > 0 ? "warning" : "success"}>{totalRiskLabel}</StatusPill>}
    >
      <div className="space-y-4">
        <RiskGroup title="有访客无支付" count={risks.noPaymentProducts.length}>
          {risks.noPaymentProducts.map((item) => (
            <RiskRow
              key={item.productId}
              title={item.productName}
              detail={`商品 ID：${item.productId}`}
              value={`访客 ${formatInteger(item.visitors)}`}
            />
          ))}
        </RiskGroup>

        <RiskGroup title="有推广花费无推广成交" count={risks.adSpendNoTransactionProducts.length}>
          {risks.adSpendNoTransactionProducts.map((item) => (
            <RiskRow
              key={item.productId}
              title={`商品 ${item.productId}`}
              detail="商品推广报表"
              value={`花费 ${formatMoney(item.adSpend)}`}
            />
          ))}
        </RiskGroup>

        <RiskGroup title="存在成功退款" count={risks.refundProducts.length}>
          {risks.refundProducts.map((item) => (
            <RiskRow
              key={item.productId}
              title={item.productName}
              detail={`商品 ID：${item.productId}`}
              value={`退款 ${formatMoney(item.refundSuccessAmount)}`}
            />
          ))}
        </RiskGroup>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">数据质量提示</p>
            <StatusPill tone={risks.dataQualityWarningCount > 0 ? "warning" : "success"}>
              {risks.dataQualityWarningCount} 条
            </StatusPill>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            详细质量信息请前往数据上传页查看；首页只展示提示数量。
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function RiskGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <StatusPill tone={count > 0 ? "warning" : "success"}>{count} 条</StatusPill>
      </div>
      {count > 0 ? <div className="mt-3 space-y-2">{children}</div> : <p className="mt-2 text-xs text-slate-500">暂无该类提示。</p>}
    </div>
  );
}

function RiskRow({
  title,
  detail,
  value,
}: {
  title: string;
  detail: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{title}</p>
        <p className="mt-1 break-all text-xs text-slate-500">{detail}</p>
      </div>
      <p className="shrink-0 text-xs font-semibold text-slate-700">{value}</p>
    </div>
  );
}
