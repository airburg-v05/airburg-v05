import Link from "next/link";
import { StoreIcon, UploadIcon } from "@/components/icons";
import { SectionCard } from "@/components/ui/section-card";

interface StoreEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  href?: string;
  showAction?: boolean;
}

export function StoreEmptyState({
  title,
  description,
  actionLabel = "前往数据上传",
  href = "/upload",
  showAction = true,
}: StoreEmptyStateProps) {
  return (
    <SectionCard>
      <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {href === "/upload" ? <UploadIcon className="h-6 w-6" /> : <StoreIcon className="h-6 w-6" />}
        </span>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
        {showAction ? (
          <Link href={href} className="primary-button mt-5">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </SectionCard>
  );
}
