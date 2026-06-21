"use client";

import Link from "next/link";
import { AlertIcon, UploadIcon } from "@/components/icons";
import { SectionCard } from "@/components/ui/section-card";
import { clearTmallAnalysisResult } from "@/lib/storage/tmall-analysis-storage";

export function TmallCorruptedResultState() {
  const handleClear = () => {
    const confirmed = window.confirm("确认清除当前浏览器中损坏的天猫分析结果吗？清除后需要前往数据上传页生成新结果。");
    if (!confirmed) return;
    clearTmallAnalysisResult();
  };

  return (
    <SectionCard>
      <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertIcon className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          本地分析结果不完整或已损坏，请返回数据上传页重新分析。
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
          系统不会自动删除损坏数据。你可以前往数据上传页生成新结果，或手动清除当前浏览器中保存的损坏结果。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Link href="/upload" className="primary-button justify-center">
            <UploadIcon className="h-4 w-4" />
            前往数据上传
          </Link>
          <button type="button" className="secondary-button justify-center" onClick={handleClear}>
            清除损坏结果
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
