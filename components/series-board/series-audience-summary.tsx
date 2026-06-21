import { SectionCard } from "@/components/ui/section-card";
import type { TmallSeriesAudienceSummary } from "@/lib/tmall/view-models/series-board";
import { formatInteger, formatPercent } from "./series-format";

interface SeriesAudienceSummaryProps {
  summary: TmallSeriesAudienceSummary | null;
}

export function SeriesAudienceSummary({ summary }: SeriesAudienceSummaryProps) {
  return (
    <SectionCard title="系列推广获客" description="数据来源：商品推广报表，按系列匹配商品汇总。">
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
          当前系列在所选日期暂无推广获客数据。
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

