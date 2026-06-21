import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  tone?: "blue" | "emerald" | "amber" | "violet" | "slate";
}

const toneClasses = {
  blue: "bg-blue-50 text-blue-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-700",
};

export function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "blue",
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        </div>
        {icon ? (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
            {icon}
          </div>
        ) : null}
      </div>
      {helper ? <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </article>
  );
}
