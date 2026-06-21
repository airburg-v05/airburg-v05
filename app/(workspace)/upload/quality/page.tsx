"use client";

import Link from "next/link";
import { DataQualityClient } from "@/components/upload/data-quality/data-quality-client";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadQualityPage() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="数据接入"
        title="数据质量"
        description="按平台、店铺和导入批次查看数据缺口、来源异常和安全提示。"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/upload"
              className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              返回数据导入
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

      <DataQualityClient />
    </div>
  );
}
