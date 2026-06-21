"use client";

import Link from "next/link";
import { TmallBatchImportWorkbench } from "@/components/upload/batch-import/tmall-batch-import-workbench";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadPage() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="多平台数据导入"
        title="数据导入"
        description="选择平台和店铺后，一次批量选择报表文件并导入。当前仅开放天猫四源本地导入。"
        action={
          <Link
            href="/upload/history"
            className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
          >
            导入记录
          </Link>
        }
      />

      <TmallBatchImportWorkbench />
    </div>
  );
}
