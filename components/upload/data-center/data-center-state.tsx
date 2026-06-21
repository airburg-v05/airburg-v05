import Link from "next/link";
import { dataCenterHref, type DataCenterPageKey } from "@/lib/v05/data-center";

interface DataCenterStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionPage?: DataCenterPageKey;
}

export function DataCenterState({
  title,
  description,
  actionLabel = "返回数据导入",
  actionPage = "upload",
}: DataCenterStateProps) {
  return (
    <section className="panel p-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        <Link
          href={dataCenterHref(actionPage)}
          className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}
