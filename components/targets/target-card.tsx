import type { TmallTargetProgress } from "@/lib/tmall/view-models/targets";
import type {
  TmallTargetProductOption,
  TmallTargetSeriesOption,
} from "@/lib/tmall/view-models/target-page";
import { getTmallTargetMetricDefinition } from "@/lib/tmall/view-models/targets";
import {
  formatTargetDirection,
  formatTargetPeriod,
  formatTargetProgressRate,
  formatTargetStatus,
  formatTargetValue,
  targetStatusClasses,
} from "./target-format";

interface TargetCardProps {
  progress: TmallTargetProgress;
  productOption?: TmallTargetProductOption;
  seriesOption?: TmallTargetSeriesOption;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

export function TargetCard({
  progress,
  productOption,
  seriesOption,
  onEdit,
  onToggleStatus,
  onDelete,
}: TargetCardProps) {
  const { target } = progress;
  const metric = getTmallTargetMetricDefinition(target.metricKey);
  const statusLabel = formatTargetStatus(progress.status);
  const toggleLabel = target.status === "paused" ? "启用" : "暂停";
  const scopeLabel =
    target.scope === "product" ? "宝贝目标" : target.scope === "series" ? "系列目标" : "店铺目标";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-slate-950">
              {target.name}
            </h3>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${targetStatusClasses(progress.status)}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {scopeLabel} · {metric.label} · {formatTargetPeriod(target.periodType, target.periodValue)} · {formatTargetDirection(target.direction)}
          </p>
          {target.scope === "product" ? (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              <p className="truncate font-medium text-slate-700">
                {productOption?.productName ?? "当前日期未匹配商品"}
              </p>
              <p className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                商品 ID：{target.productId ?? "--"}
              </p>
            </div>
          ) : null}
          {target.scope === "series" ? (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              <p className="truncate font-medium text-slate-700">
                {seriesOption?.seriesName ?? "当前未匹配系列"}
              </p>
              <p className="overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                系列 ID：{target.seriesId ?? "--"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="secondary-button min-h-9 px-3 py-1.5 text-xs" onClick={onEdit}>
            编辑
          </button>
          <button type="button" className="secondary-button min-h-9 px-3 py-1.5 text-xs" onClick={onToggleStatus}>
            {toggleLabel}
          </button>
          <button type="button" className="secondary-button min-h-9 px-3 py-1.5 text-xs text-rose-700" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TargetCardValue label="目标值" value={formatTargetValue(progress.targetValue, metric.unit)} />
        <TargetCardValue label="实际值" value={formatTargetValue(progress.actualValue, metric.unit)} />
        <TargetCardValue label="完成率" value={formatTargetProgressRate(progress.progressRate)} />
        <TargetCardValue label="差距" value={formatTargetValue(progress.gapValue, metric.unit)} />
      </div>

      {progress.warnings.length > 0 ? (
        <div className="mt-4 space-y-1 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          {progress.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TargetCardValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
