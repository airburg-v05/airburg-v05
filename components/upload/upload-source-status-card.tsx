import { StatusPill } from "@/components/ui/status-pill";
import type {
  UploadDataQualityCenterStatus,
  UploadSourceStatusCardViewModel,
} from "@/lib/tmall/view-models/upload-data-quality-center";

interface UploadSourceStatusCardProps {
  source: UploadSourceStatusCardViewModel;
}

const toneToPillTone: Record<UploadDataQualityCenterStatus, "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const cardToneClasses: Record<UploadDataQualityCenterStatus, string> = {
  normal: "border-emerald-100 bg-emerald-50/40",
  watch: "border-amber-100 bg-amber-50/40",
  risk: "border-rose-100 bg-rose-50/40",
  empty: "border-slate-100 bg-slate-50",
};

export function UploadSourceStatusCard({ source }: UploadSourceStatusCardProps) {
  return (
    <article className={`min-w-0 rounded-xl border p-4 ${cardToneClasses[source.tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-950">{source.label}</p>
          <p className="mt-1 text-xs text-slate-500">数据来源状态</p>
        </div>
        <StatusPill tone={toneToPillTone[source.tone]}>{source.statusLabel}</StatusPill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs leading-5 text-slate-500">
        <div className="min-w-0 rounded-lg bg-white/70 px-3 py-2">
          <p>数据行数</p>
          <p className="mt-1 font-semibold text-slate-900">
            {Number.isFinite(source.rowCount) ? source.rowCount : "--"}
          </p>
        </div>
        <div className="min-w-0 rounded-lg bg-white/70 px-3 py-2">
          <p>当前日期</p>
          <p className="mt-1 font-semibold text-slate-900">
            {source.hasSelectedDateData ? "有数据" : "--"}
          </p>
        </div>
      </div>

      <p className="mt-4 break-words text-xs leading-5 text-slate-600">
        {source.suggestion}
      </p>
    </article>
  );
}
