import Link from "next/link";
import { ArrowUpRightIcon } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  HomeWorkbenchBoardEntry,
  HomeWorkbenchStatus,
} from "@/lib/tmall/view-models/home-workbench-overview";

interface HomeBoardEntryCardProps {
  entry: HomeWorkbenchBoardEntry;
}

const statusTone: Record<HomeWorkbenchStatus, "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const cardToneClasses: Record<HomeWorkbenchStatus, string> = {
  normal: "border-emerald-100 hover:border-emerald-200 hover:bg-emerald-50/40",
  watch: "border-amber-100 hover:border-amber-200 hover:bg-amber-50/40",
  risk: "border-rose-100 hover:border-rose-200 hover:bg-rose-50/40",
  empty: "border-slate-100 hover:border-blue-200 hover:bg-blue-50/40",
};

export function HomeBoardEntryCard({ entry }: HomeBoardEntryCardProps) {
  return (
    <Link
      href={entry.href}
      className={`group block rounded-xl border bg-white p-4 transition ${cardToneClasses[entry.status]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{entry.title}</h3>
            <StatusPill tone={statusTone[entry.status]}>{entry.statusLabel}</StatusPill>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{entry.description}</p>
        </div>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition group-hover:bg-blue-100">
          <ArrowUpRightIcon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {entry.metrics.map((metric) => (
          <div key={`${entry.key}-${metric.label}`} className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-400">{metric.label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-800">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </Link>
  );
}
