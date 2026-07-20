import type { ReactNode } from "react";

import { DualMetricCompareControl } from "@/components/saas-v2/charts/dual-metric-compare-control";

interface ChartPanelV2Props {
  title: string;
  description: string;
  recommendedPairs: string[];
  content?: ReactNode;
}

export function ChartPanelV2({ title, description, recommendedPairs, content }: ChartPanelV2Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600">
          <button className="rounded-md bg-white px-3 py-1 shadow-sm" type="button">MTD</button>
          <button className="rounded-md px-3 py-1" type="button">DLY</button>
        </div>
      </div>
      <div className="mt-5 min-h-64 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
        {content ?? (
          <div className="flex h-52 flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-slate-900">图表等待 active dataset</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              缺失值不会绘制为 0。hover tooltip、axis 和同比 / 环比提示将在数据接入后启用。
            </p>
          </div>
        )}
      </div>
      <DualMetricCompareControl recommendedPairs={recommendedPairs} />
    </section>
  );
}
