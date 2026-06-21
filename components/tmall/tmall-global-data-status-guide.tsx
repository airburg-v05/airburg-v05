import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import type {
  TmallGlobalDataStatusGuideViewModel,
  TmallGlobalDataStatusTone,
} from "@/lib/tmall/view-models/global-data-status-guide";

interface TmallGlobalDataStatusGuideProps {
  guide: TmallGlobalDataStatusGuideViewModel;
}

const statusTone: Record<TmallGlobalDataStatusTone, "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const statusLabel: Record<TmallGlobalDataStatusTone, string> = {
  normal: "正常",
  watch: "观察",
  risk: "风险",
  empty: "暂无数据",
};

const panelToneClasses: Record<TmallGlobalDataStatusTone, string> = {
  normal: "border-emerald-100 bg-emerald-50/40",
  watch: "border-amber-100 bg-amber-50/45",
  risk: "border-rose-100 bg-rose-50/45",
  empty: "border-slate-200 bg-white",
};

const itemToneClasses: Record<TmallGlobalDataStatusTone, string> = {
  normal: "border-emerald-100 bg-white text-emerald-800",
  watch: "border-amber-100 bg-white text-amber-800",
  risk: "border-rose-100 bg-white text-rose-800",
  empty: "border-slate-100 bg-white text-slate-600",
};

export function TmallGlobalDataStatusGuide({
  guide,
}: TmallGlobalDataStatusGuideProps) {
  if (!guide.shouldDisplay) return null;

  return (
    <section
      className={`panel overflow-hidden border ${panelToneClasses[guide.tone]}`}
      aria-label="全局数据状态提醒"
    >
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone[guide.tone]}>{statusLabel[guide.tone]}</StatusPill>
            <h2 className="break-words text-base font-semibold text-slate-950">
              {guide.title}
            </h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{guide.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {guide.items.slice(0, 8).map((item) => (
              <span
                key={item.key}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${itemToneClasses[item.tone]}`}
              >
                <span className="shrink-0 text-slate-400">{item.label}</span>
                <span className="min-w-0 break-words">{item.value}</span>
              </span>
            ))}
          </div>

          {guide.notices.length > 0 ? (
            <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
              {guide.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          ) : null}
        </div>

        {guide.actions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            {guide.actions.map((action, index) => (
              <Link
                key={action.key}
                href={action.href}
                className={index === 0 ? "primary-button px-3 py-2 text-sm" : "secondary-button px-3 py-2 text-sm"}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
