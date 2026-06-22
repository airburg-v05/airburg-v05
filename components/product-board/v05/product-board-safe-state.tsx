import Link from "next/link";
import type { ReactNode } from "react";

interface ProductBoardSafeStateProps {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryAction?: ReactNode;
}

export function ProductBoardSafeState({
  title,
  description,
  actionHref = "/upload",
  actionLabel = "数据导入",
  secondaryAction,
}: ProductBoardSafeStateProps) {
  return (
    <section className="panel p-6 text-center">
      <p className="text-base font-semibold text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href={actionHref} className="primary-button">
          {actionLabel}
        </Link>
        {secondaryAction}
      </div>
    </section>
  );
}
