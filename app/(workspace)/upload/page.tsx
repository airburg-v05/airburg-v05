"use client";

import { TmallBatchImportWorkbench } from "@/components/upload/batch-import/tmall-batch-import-workbench";
import { PageHeader } from "@/components/ui/page-header";

export default function UploadPage() {
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="多平台数据导入"
        title="数据导入"
        description="选择平台和店铺后，一次批量选择报表文件并导入。当前仅开放天猫四源本地导入。"
      />

      <TmallBatchImportWorkbench />
    </div>
  );
}
