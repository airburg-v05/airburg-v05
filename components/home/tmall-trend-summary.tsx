import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import type {
  TmallHomeTrendSummaryCard,
  TmallHomeTrendSummaryViewModel,
} from "@/lib/tmall/view-models/home-trend-summary";

interface TmallTrendSummaryProps {
  summary: TmallHomeTrendSummaryViewModel;
}

const toneClasses: Record<TmallHomeTrendSummaryCard["tone"], string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

const displayValue = (value: TmallHomeTrendSummaryCard["value"]): string => {
  if (value === null) return "--";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "--";
  return value.trim() ? value : "--";
};

export function TmallTrendSummary({ summary }: TmallTrendSummaryProps) {
  return (
    <SectionCard
      title="趋势摘要"
      description="基于当前已上传数据判断趋势可观察性。详细趋势请进入店铺、宝贝或系列看板查看。"
      action={
        <Link href={summary.primaryActionHref} className="primary-button w-full justify-center sm:w-auto">
          {summary.primaryActionLabel}
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.summaryCards.map((card) => (
          <article
            key={card.key}
            className={`rounded-xl border p-4 ${toneClasses[card.tone]}`}
          >
            <p className="text-xs font-semibold text-slate-500">{card.title}</p>
            <p className="mt-2 break-words text-sm font-semibold text-slate-950">
              {displayValue(card.value)}
            </p>
            <p className="mt-2 text-xs leading-5">{card.helper || "--"}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          {summary.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 text-sm font-semibold text-blue-700">
          <Link href="/product-board" className="hover:text-blue-900">
            查看宝贝趋势
          </Link>
          <Link href="/series-board" className="hover:text-blue-900">
            查看系列趋势
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}
