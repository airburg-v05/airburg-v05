import Link from "next/link";
import { ImportHistoryClient } from "@/components/upload/import-history/import-history-client";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadHistoryPage() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="导入追踪"
        title="导入记录"
        description="只读查看已持久化到 Storage V2 的导入批次、数据集激活历史和回滚历史。"
        action={
          <Link
            href="/upload"
            className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
          >
            返回数据导入
          </Link>
        }
      />

      <ImportHistoryClient />
    </div>
  );
}
