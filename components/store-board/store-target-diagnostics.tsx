import Link from "next/link";
import {
  formatTargetProgressRate,
  formatTargetStatus,
  formatTargetValue,
} from "@/components/targets/target-format";
import { SectionCard } from "@/components/ui/section-card";
import type { TmallTargetStorageStatus } from "@/lib/storage/tmall-target-storage";
import type {
  TmallTargetDiagnosticItem,
  TmallTargetDiagnosticSeverity,
  TmallTargetDiagnosticSummary,
} from "@/lib/tmall/view-models/target-diagnostics";

interface StoreTargetDiagnosticsProps {
  summary: TmallTargetDiagnosticSummary | null;
  targetStorageStatus: TmallTargetStorageStatus;
}

const severityLabels: Record<TmallTargetDiagnosticSeverity, string> = {
  critical: "严重",
  warning: "风险",
  info: "提示",
  success: "达成",
};

const severityClasses: Record<TmallTargetDiagnosticSeverity, string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const severityPillClasses: Record<TmallTargetDiagnosticSeverity, string> = {
  critical: "bg-rose-50 text-rose-700 ring-rose-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/15",
  info: "bg-blue-50 text-blue-700 ring-blue-600/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
};

function TargetStorageCorruptedNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
      <p className="font-semibold">
        本地目标数据不可用，暂无法生成店铺目标诊断。请前往目标管理页面检查。
      </p>
      <Link href="/targets" className="mt-3 inline-flex font-semibold text-amber-900 underline">
        前往目标管理
      </Link>
    </div>
  );
}

function EmptyStoreDiagnosticsState() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">
        暂无需要展示的店铺目标诊断。请先到目标管理页面创建店铺目标，或等待更多经营数据后再查看。
      </p>
      <Link href="/targets" className="primary-button mt-5">
        前往目标管理
      </Link>
    </div>
  );
}

function SummaryCountCard({
  label,
  value,
  severity,
}: {
  label: string;
  value: number;
  severity: TmallTargetDiagnosticSeverity;
}) {
  return (
    <article className={`rounded-xl border p-4 ${severityClasses[severity]}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {Number.isFinite(value) ? value : "--"}
      </p>
    </article>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function StoreDiagnosticItem({ item }: { item: TmallTargetDiagnosticItem }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${severityPillClasses[item.severity]}`}
            >
              {severityLabels[item.severity]}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              店铺
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {item.metricLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {formatTargetStatus(item.status)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-950">
            {item.targetName}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{item.title}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{item.message}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.suggestion}</p>
        </div>

        <div className="grid shrink-0 gap-3 text-xs leading-5 text-slate-500 sm:grid-cols-3 lg:min-w-[440px]">
          <DiagnosticValue
            label="完成率"
            value={formatTargetProgressRate(item.progressRate)}
          />
          <DiagnosticValue
            label="实际值"
            value={formatTargetValue(item.actualValue, item.unit)}
          />
          <DiagnosticValue
            label="目标值"
            value={formatTargetValue(item.targetValue, item.unit)}
          />
        </div>
      </div>
    </li>
  );
}

export function StoreTargetDiagnostics({
  summary,
  targetStorageStatus,
}: StoreTargetDiagnosticsProps) {
  return (
    <SectionCard
      title="店铺目标诊断提示"
      description="基于当前店铺目标完成情况生成规则化提示，帮助快速识别店铺经营和推广目标的关注点。诊断只基于已上传数据，不做 AI 预测。"
      action={
        <Link href="/targets" className="primary-button w-full justify-center sm:w-auto">
          目标管理
        </Link>
      }
    >
      {targetStorageStatus === "corrupted" ? <TargetStorageCorruptedNotice /> : null}

      {targetStorageStatus !== "corrupted" && (!summary || summary.totalDiagnosticCount === 0) ? (
        <EmptyStoreDiagnosticsState />
      ) : null}

      {targetStorageStatus !== "corrupted" && summary && summary.totalDiagnosticCount > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCountCard label="严重问题" value={summary.criticalCount} severity="critical" />
            <SummaryCountCard label="风险提示" value={summary.warningCount} severity="warning" />
            <SummaryCountCard label="信息提示" value={summary.infoCount} severity="info" />
            <SummaryCountCard label="已达成" value={summary.successCount} severity="success" />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">店铺目标提示</p>
                <p className="mt-1 text-xs text-slate-500">
                  店铺看板最多展示 5 条，仅包含店铺目标；创建、编辑和暂停请进入目标管理。
                </p>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                {summary.items.length} / 5
              </p>
            </div>

            {summary.items.length > 0 ? (
              <ul className="mt-4 grid gap-3">
                {summary.items.map((item) => (
                  <StoreDiagnosticItem key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                当前没有需要展示的店铺目标诊断。
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
