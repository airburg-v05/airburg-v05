"use client";

import { usePathname } from "next/navigation";

export function SaasV2PageHeader() {
  const pathname = usePathname();
  if (pathname === "/v2/home") return null;

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Airburg SaaS UI V2</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">多平台电商经营分析工作区</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            本地 preview 工作区基于确认模板方案创建。当前页面不替换旧路由，不写入真实数据，不改变 ETL / BI / Target / Persistence。
          </p>
        </div>
        <a className="secondary-button" href="/home">返回 V1 内测版</a>
      </div>
    </section>
  );
}
