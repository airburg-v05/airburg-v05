import Link from "next/link";
import type { ReactNode } from "react";
import { SectionCard } from "@/components/ui/section-card";

interface HomeSafeStateProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryAction?: ReactNode;
}

export function HomeSafeState({
  title,
  description,
  actionHref,
  actionLabel,
  secondaryAction,
}: HomeSafeStateProps) {
  return (
    <SectionCard>
      <div className="flex flex-col gap-5 rounded-xl bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-950">{title}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          {actionHref && actionLabel ? (
            <Link href={actionHref} className="primary-button justify-center">
              {actionLabel}
            </Link>
          ) : null}
          {secondaryAction}
        </div>
      </div>
    </SectionCard>
  );
}
