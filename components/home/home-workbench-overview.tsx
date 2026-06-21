import Link from "next/link";
import { UploadIcon } from "@/components/icons";
import { HomeBoardEntryCard } from "@/components/home/home-board-entry-card";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  HomeWorkbenchOverviewViewModel,
  HomeWorkbenchPriorityAction,
  HomeWorkbenchStatus,
  HomeWorkbenchSourceStatus,
} from "@/lib/tmall/view-models/home-workbench-overview";

interface HomeWorkbenchOverviewProps {
  overview: HomeWorkbenchOverviewViewModel;
}

const statusTone: Record<HomeWorkbenchStatus, "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const actionToneClasses: Record<HomeWorkbenchPriorityAction["tone"], string> = {
  blue: "border-blue-100 bg-blue-50 text-blue-800",
  amber: "border-amber-100 bg-amber-50 text-amber-800",
  rose: "border-rose-100 bg-rose-50 text-rose-800",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
  slate: "border-slate-100 bg-slate-50 text-slate-700",
};

function SourceStatusCard({ source }: { source: HomeWorkbenchSourceStatus }) {
  return (
    <article className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{source.label}</p>
        <StatusPill tone={statusTone[source.tone]}>{source.statusLabel}</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs leading-5 text-slate-500">
        <div>
          <p>数据行数</p>
          <p className="mt-0.5 font-semibold text-slate-800">{source.rowCount}</p>
        </div>
        <div>
          <p>当前日期</p>
          <p className="mt-0.5 font-semibold text-slate-800">
            {source.hasSelectedDateData ? "有数据" : "--"}
          </p>
        </div>
      </div>
    </article>
  );
}

function PriorityAction({ action, index }: { action: HomeWorkbenchPriorityAction; index: number }) {
  return (
    <Link
      href={action.href}
      className={`block rounded-xl border px-4 py-3 transition hover:shadow-sm ${actionToneClasses[action.tone]}`}
    >
      <div className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{action.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{action.description}</p>
        </div>
      </div>
    </Link>
  );
}

function EmptyWorkbenchState() {
  return (
    <SectionCard title="经营工作台总览" description="当前浏览器还没有可用的天猫四源分析结果。">
      <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <UploadIcon className="h-5 w-5" />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-900">
          请先上传天猫四源数据，生成本地分析结果。
        </p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          工作台会在分析完成后汇总数据状态、看板入口和今日优先动作。
        </p>
        <Link href="/upload" className="primary-button mt-5">
          <UploadIcon className="h-4 w-4" />
          前往数据上传
        </Link>
      </div>
    </SectionCard>
  );
}

export function HomeWorkbenchOverview({ overview }: HomeWorkbenchOverviewProps) {
  if (overview.isEmpty) return <EmptyWorkbenchState />;

  return (
    <div id="home-workbench-overview" className="scroll-mt-24 space-y-6">
      <SectionCard
        title="经营工作台总览"
        description="进入系统后的第一层判断：先确认数据是否可用，再选择要进入的看板。"
        action={<StatusPill tone={statusTone[overview.status]}>{overview.statusLabel}</StatusPill>}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-700">当前工作台经营日期</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {overview.selectedDate ?? "--"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs leading-5 text-blue-800">
              <div>
                <p>最近分析时间</p>
                <p className="mt-0.5 break-words font-semibold text-slate-800">
                  {overview.analysisTimestamp ?? "--"}
                </p>
              </div>
              <div>
                <p>可用经营日期</p>
                <p className="mt-0.5 font-semibold text-slate-800">
                  {overview.availableDateCount}
                </p>
              </div>
              <div>
                <p>四源解析</p>
                <p className="mt-0.5 font-semibold text-slate-800">
                  {overview.parsedSourceCount} / {overview.sourceCount}
                </p>
              </div>
              <div>
                <p>数据质量提示</p>
                <p className="mt-0.5 font-semibold text-slate-800">
                  {overview.dataQualityWarningCount}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overview.sourceStatuses.map((source) => (
              <SourceStatusCard key={source.key} source={source} />
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="看板入口"
        description="根据当前数据状态选择下一步查看店铺、系列或宝贝看板。"
      >
        <div className="grid gap-4 xl:grid-cols-3">
          {overview.boardEntries.map((entry) => (
            <HomeBoardEntryCard key={entry.key} entry={entry} />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="今日优先动作"
          description="最多展示 5 条固定规则动作，不生成自动诊断文案。"
        >
          <div className="grid gap-3">
            {overview.priorityActions.map((action, index) => (
              <PriorityAction key={action.key} action={action} index={index} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="宝贝重点摘要"
          description="基于当前工作台经营日期的商品安全聚合数据，仅展示摘要数字。"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryValue label="商品数" value={overview.productFocusSummary.productCount} />
            <SummaryValue label="销售 TOP 商品数" value={overview.productFocusSummary.salesTopCount} />
            <SummaryValue label="推广中商品数" value={overview.productFocusSummary.hasAdCount} />
            <SummaryValue label="暂无推广商品数" value={overview.productFocusSummary.noAdCount} />
            <SummaryValue label="售后关注商品数" value={overview.productFocusSummary.afterSalesFocusCount} />
          </div>
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="space-y-2">
              {overview.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {Number.isFinite(value) ? value : "--"}
      </p>
    </div>
  );
}
