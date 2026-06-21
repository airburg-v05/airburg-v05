import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { UploadSourceStatusCard } from "@/components/upload/upload-source-status-card";
import type {
  UploadDataQualityAction,
  UploadDataQualityCenterStatus,
  UploadDataQualityCenterViewModel,
} from "@/lib/tmall/view-models/upload-data-quality-center";

interface UploadDataQualityCenterProps {
  center: UploadDataQualityCenterViewModel;
}

const statusTone: Record<UploadDataQualityCenterStatus, "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const actionToneClasses: Record<UploadDataQualityAction["tone"], string> = {
  blue: "border-blue-100 bg-blue-50 text-blue-800",
  amber: "border-amber-100 bg-amber-50 text-amber-800",
  rose: "border-rose-100 bg-rose-50 text-rose-800",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
  slate: "border-slate-100 bg-slate-50 text-slate-700",
};

const quickLinks = [
  { href: "/home", label: "查看首页" },
  { href: "/store-board", label: "查看店铺看板" },
  { href: "/product-board", label: "查看宝贝看板" },
  { href: "/raw-data", label: "查看原始数据" },
];

function SummaryValue({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value ?? "--"}
      </p>
    </div>
  );
}

function QualityAction({ action, index }: { action: UploadDataQualityAction; index: number }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${actionToneClasses[action.tone]}`}>
      <div className="flex gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{action.title}</p>
          <p className="mt-1 break-words text-xs leading-5 opacity-80">{action.description}</p>
        </div>
      </div>
    </div>
  );
}

export function UploadDataQualityCenter({ center }: UploadDataQualityCenterProps) {
  return (
    <SectionCard
      title="数据质量中心"
      description="先确认四源状态、可用日期和补齐动作，再开始上传或重新分析。"
      action={<StatusPill tone={statusTone[center.status]}>{center.statusLabel}</StatusPill>}
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="break-words text-base font-semibold text-slate-950">{center.title}</p>
              <p className="mt-2 break-words text-sm leading-6 text-blue-800">{center.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {quickLinks.map((link) => (
                <Link key={link.href} href={link.href} className="secondary-button bg-white/80">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryValue label="最近分析时间" value={center.analysisTimestamp} />
          <SummaryValue label="当前经营日期" value={center.selectedDate} />
          <SummaryValue label="可用日期数量" value={center.availableDateCount} />
          <SummaryValue label="四源解析" value={`${center.parsedSourceCount} / ${center.sourceCount}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          {center.sourceCards.map((source) => (
            <UploadSourceStatusCard key={source.key} source={source} />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-950">可用经营日期</p>
              <StatusPill tone={center.availableDateCount > 0 ? "info" : "neutral"}>
                {center.availableDateCount > 0 ? `${center.availableDateCount} 天` : "--"}
              </StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {center.recentDates.length > 0 ? (
                center.recentDates.map((date) => (
                  <span
                    key={date}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {date}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">--</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-950">数据质量提示</p>
              <StatusPill tone={center.dataQualityWarningCount > 0 ? "warning" : "success"}>
                {center.dataQualityWarningCount} 条
              </StatusPill>
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {center.safeWarnings.length > 0 ? (
                center.safeWarnings.map((warning, index) => (
                  <p key={`${warning}-${index}`} className="break-words rounded-lg bg-slate-50 px-3 py-2">
                    {warning}
                  </p>
                ))
              ) : (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                  当前没有需要展示的数据质量提示。
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">四源补齐清单</p>
            <div className="mt-3 grid gap-3">
              {center.actions.map((action, index) => (
                <QualityAction key={action.key} action={action} index={index} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">说明</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {center.notices.map((notice) => (
                <p key={notice} className="break-words">
                  {notice}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
