import Link from "next/link";
import { UploadIcon } from "@/components/icons";
import { SectionCard } from "@/components/ui/section-card";

interface TargetEmptyStateProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}

export function TargetEmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: TargetEmptyStateProps) {
  return (
    <SectionCard>
      <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <UploadIcon className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="primary-button mt-5">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
