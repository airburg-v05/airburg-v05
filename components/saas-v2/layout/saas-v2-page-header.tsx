"use client";

import { usePathname } from "next/navigation";

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/v2/series-board": {
    title: "系列中心",
    description: "按已维护的系列范围查看经营表现。",
  },
  "/v2/store-board": {
    title: "店铺中心",
    description: "聚焦当前平台和店铺的经营表现。",
  },
  "/v2/product-board": {
    title: "商品中心",
    description: "查看当前品牌已接入商品的经营表现。",
  },
  "/v2/upload": {
    title: "数据接入",
    description: "为当前品牌替换或追加经营数据，默认替换以避免历史混入。",
  },
  "/v2/upload/history": {
    title: "导入历史",
    description: "查看当前浏览器中的导入记录和批次状态。",
  },
  "/v2/data-health": {
    title: "数据健康",
    description: "查看与经营看板同源的活动快照、来源覆盖和历史审计。",
  },
  "/v2/target-center": {
    title: "目标中心",
    description: "独立设置品牌目标，并按现有店铺、系列、商品细分。",
  },
  "/v2/brand-settings": {
    title: "品牌设置",
    description: "新增、切换并隔离不同品牌的经营工作区。",
  },
  "/v2/search-assets": {
    title: "搜索资产",
    description: "维护品牌词、中心词和别名分组。",
  },
  "/v2/exclusion-rules": {
    title: "排除规则",
    description: "该能力暂未开放，当前只说明规划状态。",
  },
};

export function SaasV2PageHeader() {
  const pathname = usePathname();
  if (pathname === "/v2/home") return null;
  const meta = PAGE_META[pathname] ?? {
    title: "经营工作区",
    description: "当前页面按已接入的数据与业务口径展示。",
  };

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm" data-testid="saas-v2-compact-page-header">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{meta.title}</h1>
          <p className="mt-1 text-sm leading-5 text-slate-500">{meta.description}</p>
        </div>
        <a className="secondary-button shrink-0 justify-center px-3 py-2 text-xs" href="/v2/home">返回首页</a>
      </div>
    </section>
  );
}
