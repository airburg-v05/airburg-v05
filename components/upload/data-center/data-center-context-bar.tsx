"use client";

import { useSearchParams } from "next/navigation";
import {
  parseDataCenterSearchParams,
  shortDataCenterId,
  type DataCenterContextQuery,
} from "@/lib/v05/data-center";

const PLATFORM_LABELS: Record<string, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

const hasContext = (context: DataCenterContextQuery): boolean =>
  Boolean(context.platformCode || context.storeId || context.batchId);

export function DataCenterContextBar() {
  const searchParams = useSearchParams();
  const context = parseDataCenterSearchParams(searchParams);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">当前数据中心上下文</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            页面之间只传递平台、店铺和批次 ID，不传递文件名、原始字段或敏感明细。
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-xs">
          {hasContext(context) ? (
            <>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                平台：{context.platformCode ? PLATFORM_LABELS[context.platformCode] ?? context.platformCode : "--"}
              </span>
              <span className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-slate-600">
                店铺：{shortDataCenterId(context.storeId)}
              </span>
              <span className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-slate-600">
                批次：{shortDataCenterId(context.batchId)}
              </span>
            </>
          ) : (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-500">
              未锁定具体店铺或批次
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
