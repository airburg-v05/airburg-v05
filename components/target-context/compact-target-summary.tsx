import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import type { TargetContextTone } from "@/lib/v05/target-context";

type CompactTargetTone = TargetContextTone;

interface CompactTargetSummaryItem {
  targetId: string;
  label: string;
  metricKey: string;
  metricLabel: string;
  actualValue: number | null;
  targetValue: number | null;
  progressRate: number | null;
  gapValue: number | null;
  statusLabel: string;
  tone: CompactTargetTone;
  allocationStatusLabel: string;
  allocationTone: CompactTargetTone;
}

interface CompactTargetSummaryProps {
  title: string;
  description: string;
  emptyLabel: string;
  settingsHref: string;
  targets: CompactTargetSummaryItem[];
  formatValue: (metricKey: string, value: number | null) => string;
}

const pillTone = (tone: CompactTargetTone): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (tone === "emerald") return "success";
  if (tone === "amber") return "warning";
  if (tone === "rose") return "danger";
  if (tone === "blue") return "info";
  return "neutral";
};

const progressWidth = (progressRate: number | null): string =>
  `${Math.min(100, Math.max(0, (progressRate ?? 0) * 100))}%`;

export function CompactTargetSummary({
  title,
  description,
  emptyLabel,
  settingsHref,
  targets,
  formatValue,
}: CompactTargetSummaryProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {targets.length === 0 ? (
            <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
              {emptyLabel}
            </span>
          ) : null}
          <Link href={settingsHref} className="secondary-button justify-center">
            目标设置
          </Link>
        </div>
      </div>

      {targets.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {targets.slice(0, 4).map((target) => (
            <article key={target.targetId} className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{target.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{target.metricLabel}</p>
                </div>
                <StatusPill tone={pillTone(target.tone)}>{target.statusLabel}</StatusPill>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-label="目标完成进度">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: progressWidth(target.progressRate) }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4">
                <div>
                  <p>实际</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatValue(target.metricKey, target.actualValue)}
                  </p>
                </div>
                <div>
                  <p>目标</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatValue(target.metricKey, target.targetValue)}
                  </p>
                </div>
                <div>
                  <p>差额</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatValue(target.metricKey, target.gapValue)}
                  </p>
                </div>
                <div>
                  <p>完成率</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {target.progressRate === null || !Number.isFinite(target.progressRate)
                      ? "--"
                      : `${Math.round(target.progressRate * 100)}%`}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <StatusPill tone={pillTone(target.allocationTone)}>
                  分配状态：{target.allocationStatusLabel}
                </StatusPill>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
