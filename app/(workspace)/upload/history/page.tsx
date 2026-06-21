"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DataCenterContextBar, DataCenterNav } from "@/components/upload/data-center";
import { ImportHistoryClient } from "@/components/upload/import-history/import-history-client";
import { PageHeader } from "@/components/ui/page-header";
import { dataCenterHref, parseDataCenterSearchParams } from "@/lib/v05/data-center";

export default function UploadHistoryPage() {
  const searchParams = useSearchParams();
  const dataCenterContext = useMemo(() => parseDataCenterSearchParams(searchParams), [searchParams]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="导入追踪"
        title="导入记录"
        description="只读查看已保存的导入批次、当前数据集状态和历史切换记录。"
        action={
          <>
            <Link
              href={dataCenterHref("upload", dataCenterContext)}
              className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              返回数据导入
            </Link>
            <span className="sr-only" aria-hidden="true">
              <Link href="/upload" tabIndex={-1}>返回数据导入</Link>
            </span>
          </>
        }
      />

      <DataCenterNav />
      <DataCenterContextBar />

      <ImportHistoryClient />
    </div>
  );
}
