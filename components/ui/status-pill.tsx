import type { ReactNode } from "react";

interface StatusPillProps {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}

const toneClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/15",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/15",
  info: "bg-blue-50 text-blue-700 ring-blue-600/15",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

export function StatusPill({ children, tone = "neutral" }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
