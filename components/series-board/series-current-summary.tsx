"use client";

import type { TmallSeriesBoardOverview } from "@/lib/tmall/view-models/series-board";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatInteger, formatMoney } from "./series-format";

interface SeriesCurrentSummaryProps {
  overview: TmallSeriesBoardOverview;
  onSeriesChange: (seriesId: string) => void;
}

export function SeriesCurrentSummary({
  overview,
  onSeriesChange,
}: SeriesCurrentSummaryProps) {
  const selectedSeries = overview.selectedSeries;

  return (
    <SectionCard
      title="当前系列选择和摘要"
      description="当前阶段按所选经营日期匹配系列商品 ID，未匹配商品不会被删除。"
      action={
        <StatusPill tone={selectedSeries?.unmatchedProductCount ? "warning" : "info"}>
          {selectedSeries ? `${selectedSeries.matchedProductCount} / ${selectedSeries.productCount} 已匹配` : "暂无系列"}
        </StatusPill>
      }
    >
      {overview.seriesOptions.length > 0 && selectedSeries ? (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            当前系列
            <select
              className="form-input mt-2"
              value={overview.selectedSeriesId ?? ""}
              onChange={(event) => onSeriesChange(event.target.value)}
            >
              {overview.seriesOptions.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.name} · {series.matchedProductCount}/{series.productCount} 已匹配
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryItem label="系列商品数量" value={formatInteger(selectedSeries.productCount)} />
            <SummaryItem label="匹配商品数量" value={formatInteger(selectedSeries.matchedProductCount)} />
            <SummaryItem label="未匹配商品数量" value={formatInteger(selectedSeries.unmatchedProductCount)} />
            <SummaryItem label="系列 GMV" value={formatMoney(selectedSeries.matchedGmv)} />
            <SummaryItem label="系列 GSV" value={formatMoney(selectedSeries.matchedGsv)} />
          </div>

          {overview.unmatchedProductIds.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              <p>以下商品 ID 在当前经营日期未匹配，将继续保留在系列配置中：</p>
              <p className="mt-1 break-words font-mono text-xs">{overview.unmatchedProductIds.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
          <p className="text-sm font-semibold text-slate-900">暂无系列，请先创建系列。</p>
          <p className="mt-2 text-sm text-slate-500">创建后即可查看系列经营、推广、获客和售后汇总。</p>
        </div>
      )}
    </SectionCard>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

