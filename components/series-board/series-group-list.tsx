"use client";

import type { TmallSeriesGroupPreview } from "@/lib/tmall/view-models/series-board";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/utils/format";
import { formatInteger, formatMoney } from "./series-format";

interface SeriesGroupListProps {
  groups: TmallSeriesGroupPreview[];
  editingGroupId: string | null;
  onEdit: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}

export function SeriesGroupList({
  groups,
  editingGroupId,
  onEdit,
  onDelete,
}: SeriesGroupListProps) {
  return (
    <SectionCard
      title="已创建系列"
      description="系列配置只保存商品 ID；商品名称和经营数据会从当前四源分析结果中实时匹配。"
      action={<StatusPill tone={groups.length > 0 ? "info" : "neutral"}>{groups.length} 个系列</StatusPill>}
    >
      {groups.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((preview) => (
            <article
              key={preview.group.id}
              className={`rounded-2xl border p-4 ${
                editingGroupId === preview.group.id ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-950">
                    {preview.group.name}
                  </h3>
                  {preview.group.description ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">
                      {preview.group.description}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">暂无系列描述。</p>
                  )}
                </div>
                <StatusPill tone={preview.unmatchedProductCount > 0 ? "warning" : "success"}>
                  {preview.matchedProductCount} / {preview.productCount} 已匹配
                </StatusPill>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <GroupMetric label="匹配商品数 / 系列商品数" value={`${formatInteger(preview.matchedProductCount)} / ${formatInteger(preview.productCount)}`} />
                <GroupMetric label="系列 GMV" value={formatMoney(preview.matchedGmv)} />
                <GroupMetric label="系列 GSV" value={formatMoney(preview.matchedGsv)} />
                <GroupMetric label="商品访客数合计" value={formatInteger(preview.matchedVisitors)} />
                <GroupMetric label="推广花费" value={preview.matchedAdProductCount > 0 ? formatMoney(preview.matchedAdSpend) : "--"} />
                <GroupMetric label="成功退款金额" value={formatMoney(preview.matchedRefundSuccessAmount)} />
              </div>

              <div className="mt-4 grid gap-1 text-xs leading-5 text-slate-500 sm:grid-cols-2">
                <span>创建：{formatDateTime(preview.group.createdAt)}</span>
                <span>更新：{formatDateTime(preview.group.updatedAt)}</span>
              </div>

              {preview.unmatchedProductCount > 0 ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  有商品 ID 在当前经营日期未匹配到商品，系统会继续保留这些 ID。
                </p>
              ) : null}
              {preview.matchedProductCount === 0 ? (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                  当前日期未匹配商品。
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onEdit(preview.group.id)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="secondary-button text-rose-700 hover:border-rose-200 hover:bg-rose-50"
                  onClick={() => onDelete(preview.group.id)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
          <p className="text-sm font-semibold text-slate-900">暂无系列，请先创建一个系列。</p>
          <p className="mt-2 text-sm text-slate-500">一个系列至少包含 1 个商品，后续会用于系列经营汇总。</p>
        </div>
      )}
    </SectionCard>
  );
}

function GroupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
