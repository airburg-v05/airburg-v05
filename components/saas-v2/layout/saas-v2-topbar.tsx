"use client";

import { usePathname } from "next/navigation";

export function SaasV2Topbar() {
  const pathname = usePathname();
  if (pathname === "/v2/home") return null;

  return (
    <header className="sticky top-0 z-10 max-w-full overflow-hidden border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">空气堡经营工作区</p>
          <p className="mt-1 text-xs text-slate-500">数据范围与状态以当前页面为准</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">品牌：空气堡</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">平台：天猫</span>
        </div>
      </div>
    </header>
  );
}
