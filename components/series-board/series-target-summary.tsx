import Link from "next/link";
import {
  formatTargetDirection,
  formatTargetProgressRate,
  formatTargetStatus,
  formatTargetValue,
  targetStatusClasses,
} from "@/components/targets/target-format";
import { SectionCard } from "@/components/ui/section-card";
import type { TmallTargetStorageStatus } from "@/lib/storage/tmall-target-storage";
import type {
  TmallSeriesTargetItem,
  TmallSeriesTargetSummaryCard,
  TmallSeriesTargetSummaryViewModel,
} from "@/lib/tmall/view-models/series-target-summary";

interface SeriesTargetSummaryProps {
  summary: TmallSeriesTargetSummaryViewModel | null;
  targetStorageStatus: TmallTargetStorageStatus;
}

const toneClasses: Record<TmallSeriesTargetSummaryCard["tone"], string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

const displayCardValue = (value: TmallSeriesTargetSummaryCard["value"]): string => {
  if (value === null) return "--";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "--";
  return value.trim() ? value : "--";
};

const displayGap = (item: TmallSeriesTargetItem): string => {
  if (item.gapValue === null) return "--";
  const prefix =
    item.status === "achieved"
      ? "已达成"
      : item.direction === "lower_is_better"
        ? "需降低"
        : "差距";

  return `${prefix} ${formatTargetValue(item.gapValue, item.unit)}`;
};

function EmptySeriesTargetState() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">
        当前系列暂无目标，请先到目标管理页面创建系列目标。
      </p>
      <Link href="/targets" className="primary-button mt-5">
        前往目标管理
      </Link>
    </div>
  );
}

function TargetStorageCorruptedNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
      <p className="font-semibold">本地目标数据不可用，请前往目标管理页面检查。</p>
      <Link href="/targets" className="mt-3 inline-flex font-semibold text-amber-900 underline">
        前往目标管理
      </Link>
    </div>
  );
}

function SeriesTargetItemRow({ item }: { item: TmallSeriesTargetItem }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${targetStatusClasses(item.status)}`}
            >
              {formatTargetStatus(item.status)}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {item.metricLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {formatTargetDirection(item.direction)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-950">
            {item.targetName}
          </p>
        </div>

        <div className="grid shrink-0 gap-3 text-xs leading-5 text-slate-500 sm:grid-cols-2 lg:min-w-[420px]">
          <TargetValue label="目标值" value={formatTargetValue(item.targetValue, item.unit)} />
          <TargetValue label="实际值" value={formatTargetValue(item.actualValue, item.unit)} />
          <TargetValue label="完成率" value={formatTargetProgressRate(item.progressRate)} />
          <TargetValue label="差距" value={displayGap(item)} />
        </div>
      </div>

      {item.warnings.length > 0 ? (
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
          {item.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function TargetValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export function SeriesTargetSummary({
  summary,
  targetStorageStatus,
}: SeriesTargetSummaryProps) {
  return (
    <SectionCard
      title="当前系列目标完成情况"
      description="基于当前系列目标和四源安全聚合结果，查看该系列经营与推广目标完成情况。目标创建和编辑请进入目标管理页面。"
      action={
        <Link href="/targets" className="primary-button w-full justify-center sm:w-auto">
          目标管理
        </Link>
      }
    >
      {targetStorageStatus === "corrupted" ? <TargetStorageCorruptedNotice /> : null}

      {targetStorageStatus !== "corrupted" && summary?.totalSeriesTargetCount === 0 ? (
        <EmptySeriesTargetState />
      ) : null}

      {targetStorageStatus !== "corrupted" && summary && summary.totalSeriesTargetCount > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.summaryCards.map((card) => (
              <article
                key={card.key}
                className={`rounded-xl border p-4 ${toneClasses[card.tone]}`}
              >
                <p className="text-xs font-semibold text-slate-500">{card.title}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {displayCardValue(card.value)}
                </p>
                <p className="mt-2 text-xs leading-5">{card.helper || "--"}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
            <span>启用 {summary.activeSeriesTargetCount} 个</span>
            <span>暂停 {summary.pausedSeriesTargetCount} 个</span>
            <span>接近目标 {summary.inProgressCount} 个</span>
            <span>目标值异常 {summary.invalidTargetCount} 个</span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">当前系列目标列表</p>
                <p className="mt-1 text-xs text-slate-500">
                  仅展示当前系列目标，最多 6 条；目标创建、编辑、暂停和删除请进入目标管理。
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {summary.targetItems.length} / 6
              </p>
            </div>

            {summary.targetItems.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {summary.targetItems.map((item) => (
                  <SeriesTargetItemRow key={item.targetId} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                暂无可展示的当前系列目标。
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="space-y-2">
              {summary.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
