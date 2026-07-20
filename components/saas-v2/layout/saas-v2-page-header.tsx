"use client";

import { usePathname } from "next/navigation";

export function SaasV2PageHeader() {
  const pathname = usePathname();
  if (pathname === "/v2/home") return null;

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Airburg Business Workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">品牌经营分析工作区</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            当前页面按已接入的数据与业务口径展示，未接入能力会明确标记。
          </p>
        </div>
        <a className="secondary-button" href="/v2/home">返回 V2 首页</a>
      </div>
    </section>
  );
}
