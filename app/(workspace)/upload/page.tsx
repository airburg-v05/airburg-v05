"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { TmallBatchImportWorkbench } from "@/components/upload/batch-import/tmall-batch-import-workbench";
import { PageHeader } from "@/components/ui/page-header";
import { parseReimportContext } from "@/lib/v05/data-quality";
import { useSearchParams } from "next/navigation";

function UploadPageContent() {
  const searchParams = useSearchParams();
  const reimportContext = useMemo(() => parseReimportContext(searchParams), [searchParams]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="多平台数据导入"
        title="数据导入"
        description="选择平台和店铺后，一次批量选择报表文件并导入。当前仅开放天猫四源本地导入。"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/upload/quality"
              className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              数据质量
            </Link>
            <Link
              href="/upload/history"
              className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              导入记录
            </Link>
          </div>
        }
      />

      <TmallBatchImportWorkbench reimportContext={reimportContext} />
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="panel p-6 text-sm text-slate-500">正在读取导入上下文...</div>}>
      <UploadPageContent />
    </Suspense>
  );
}
