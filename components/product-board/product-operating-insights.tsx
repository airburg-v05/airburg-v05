import { SectionCard } from "@/components/ui/section-card";
import type {
  TmallProductOperatingInsightStatus,
  TmallProductOperatingInsightsViewModel,
  TmallProductOperatingInsightModule,
} from "@/lib/tmall/view-models/product-operating-insights";

interface ProductOperatingInsightsProps {
  insights: TmallProductOperatingInsightsViewModel;
}

const statusClasses: Record<TmallProductOperatingInsightStatus, string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  risk: "border-amber-200 bg-amber-50 text-amber-700",
  watch: "border-blue-200 bg-blue-50 text-blue-700",
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  empty: "border-slate-200 bg-slate-50 text-slate-600",
};

const statusPillClasses: Record<TmallProductOperatingInsightStatus, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-600/15",
  risk: "bg-amber-50 text-amber-700 ring-amber-600/15",
  watch: "bg-blue-50 text-blue-700 ring-blue-600/15",
  normal: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  empty: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

function EmptyOperatingInsightsState() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">
        当前商品数据不足，暂无法生成经营结论。
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
        请先确认当前经营日期有可分析商品，并完成四源本地分析后再查看。
      </p>
    </div>
  );
}

function ModuleCard({ module }: { module: TmallProductOperatingInsightModule }) {
  return (
    <article className="min-w-0 rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-sm font-semibold text-slate-950">
          {module.label}
        </p>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusPillClasses[module.status]}`}
        >
          {module.statusLabel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{module.description}</p>
    </article>
  );
}

export function ProductOperatingInsights({
  insights,
}: ProductOperatingInsightsProps) {
  return (
    <SectionCard
      title="当前商品经营结论卡"
      description="基于当前商品经营、推广、售后、目标诊断和趋势状态生成规则化摘要，帮助快速判断当前优先关注点。"
    >
      {insights.isEmpty ? <EmptyOperatingInsightsState /> : null}

      {!insights.isEmpty ? (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-4 ${statusClasses[insights.status]}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">总体状态</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {insights.statusLabel}
                </p>
              </div>
              <span
                className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusPillClasses[insights.status]}`}
              >
                规则化结论
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{insights.conclusion}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            {insights.modules.map((module) => (
              <ModuleCard key={module.key} module={module} />
            ))}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">优先动作</p>
                <p className="mt-1 text-xs text-slate-500">
                  最多展示 3 条，全部来自固定规则判断。
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {insights.priorityActions.length} / 3
              </p>
            </div>

            <ol className="mt-4 grid gap-3">
              {insights.priorityActions.map((action, index) => (
                <li
                  key={action}
                  className="flex gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0 break-words">{action}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="space-y-2">
              {insights.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
