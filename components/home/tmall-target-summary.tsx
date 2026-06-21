import Link from "next/link";
import {
  formatTargetProgressRate,
  formatTargetStatus,
  formatTargetValue,
  targetStatusClasses,
} from "@/components/targets/target-format";
import { SectionCard } from "@/components/ui/section-card";
import type { TmallTargetStorageStatus } from "@/lib/storage/tmall-target-storage";
import type {
  TmallHomeTargetAttentionItem,
  TmallHomeTargetSummaryCard,
  TmallHomeTargetSummaryViewModel,
} from "@/lib/tmall/view-models/home-target-summary";
import type { TmallTargetScope } from "@/types/tmall-targets";

interface TmallTargetSummaryProps {
  summary: TmallHomeTargetSummaryViewModel | null;
  targetStorageStatus: TmallTargetStorageStatus;
  seriesStorageCorrupted: boolean;
}

const toneClasses: Record<TmallHomeTargetSummaryCard["tone"], string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

const scopeLabels: Record<TmallTargetScope, string> = {
  store: "店铺",
  product: "宝贝",
  series: "系列",
};

const displayCardValue = (value: TmallHomeTargetSummaryCard["value"]): string => {
  if (value === null) return "--";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "--";
  return value.trim() ? value : "--";
};

const progressText = (item: TmallHomeTargetAttentionItem): string =>
  item.progressRate === null ? "--" : formatTargetProgressRate(item.progressRate);

function EmptyTargetSummary() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">
        暂无目标，请先到目标管理页面创建店铺、宝贝或系列目标。
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

function AttentionItem({ item }: { item: TmallHomeTargetAttentionItem }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {scopeLabels[item.scope]}
            </span>
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${targetStatusClasses(item.status)}`}
            >
              {formatTargetStatus(item.status)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-950">
            {item.targetName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {item.metricLabel} · 完成率 {progressText(item)}
          </p>
        </div>
        <div className="shrink-0 text-left text-xs leading-5 text-slate-500 sm:text-right">
          <p>实际 {formatTargetValue(item.actualValue, item.unit)}</p>
          <p>目标 {formatTargetValue(item.targetValue, item.unit)}</p>
        </div>
      </div>
      {item.warningText ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{item.warningText}</p>
      ) : null}
    </li>
  );
}

export function TmallTargetSummary({
  summary,
  targetStorageStatus,
  seriesStorageCorrupted,
}: TmallTargetSummaryProps) {
  return (
    <SectionCard
      title="目标完成率摘要"
      description="基于当前目标设置和四源安全聚合结果，快速查看目标完成情况。目标创建和编辑请进入目标管理页面。"
      action={
        <Link href="/targets" className="primary-button w-full justify-center sm:w-auto">
          目标管理
        </Link>
      }
    >
      {targetStorageStatus === "corrupted" ? <TargetStorageCorruptedNotice /> : null}

      {targetStorageStatus !== "corrupted" && summary?.totalTargetCount === 0 ? (
        <EmptyTargetSummary />
      ) : null}

      {targetStorageStatus !== "corrupted" && summary && summary.totalTargetCount > 0 ? (
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
            <span>店铺目标 {summary.storeTargetCount} 个</span>
            <span>宝贝目标 {summary.productTargetCount} 个</span>
            <span>系列目标 {summary.seriesTargetCount} 个</span>
            <span>已暂停 {summary.pausedTargetCount} 个</span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">重点关注目标</p>
                <p className="mt-1 text-xs text-slate-500">
                  首页最多展示 5 条，完整创建、编辑和删除请进入目标管理。
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {summary.topAttentionItems.length} / 5
              </p>
            </div>

            {summary.topAttentionItems.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {summary.topAttentionItems.map((item) => (
                  <AttentionItem key={item.targetId} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                当前没有需要关注的启用目标。
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="space-y-2">
              {summary.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
              {seriesStorageCorrupted ? (
                <p>
                  系列分组数据不可用，系列目标可能无法计算。
                  <Link href="/series-board" className="font-semibold text-blue-700 hover:text-blue-900">
                    请前往系列看板检查。
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
