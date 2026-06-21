import { SectionCard } from "@/components/ui/section-card";
import type { TmallProductAudienceSummary } from "@/lib/tmall/view-models/product-board";
import { formatInteger, formatPercent } from "./product-format";

interface ProductAudienceSummaryProps {
  summary: TmallProductAudienceSummary | null;
}

export function ProductAudienceSummary({ summary }: ProductAudienceSummaryProps) {
  return (
    <SectionCard title="商品推广获客" description="数据来源：商品推广报表。">
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AudienceItem label="引导访问人数" value={formatInteger(summary.guidedVisitors)} />
          <AudienceItem label="引导访问潜客数" value={formatInteger(summary.guidedProspects)} />
          <AudienceItem label="潜客占比" value={formatPercent(summary.prospectRate)} />
          <AudienceItem label="成交新客数" value={formatInteger(summary.newBuyers)} />
          <AudienceItem label="入会量" value={formatInteger(summary.memberJoinCount)} />
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
          当前商品在所选日期暂无潜客、新客和会员数据。
        </p>
      )}
    </SectionCard>
  );
}

function AudienceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
