import { BrandScopeControl } from "@/components/saas-v2/controls/brand-scope-control";
import { CompareModeControl } from "@/components/saas-v2/controls/compare-mode-control";
import { PlatformStoreScopeControl } from "@/components/saas-v2/controls/platform-store-scope-control";
import { TimeRangeControl } from "@/components/saas-v2/controls/time-range-control";
import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { DataHealthSummaryCard } from "@/components/saas-v2/cards/data-health-summary-card";
import { KeySeriesGsvCard } from "@/components/saas-v2/cards/key-series-gsv-card";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import {
  anomalyRows,
  homeMetrics,
  keySeriesRows,
  recommendedMetricPairs,
  toolEntries,
} from "@/components/saas-v2/data";

export default function SaasV2HomePage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <BrandScopeControl />
          <PlatformStoreScopeControl />
          <TimeRangeControl />
          <CompareModeControl />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {toolEntries.map((entry) => (
          <a
            key={entry.href}
            className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            href={entry.href}
          >
            <p className="font-semibold text-slate-900">{entry.title}</p>
            <p className="mt-1 leading-5 text-slate-500">{entry.description}</p>
          </a>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">17 指标经营网格</h2>
            <p className="mt-1 text-sm text-slate-500">
              指标值来自已验证 BI view model；当前无 active dataset 时保持安全空态。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="secondary-button" type="button">勾选显示</button>
            <button className="secondary-button" type="button">自主排序</button>
          </div>
        </div>
        <div className="pt-4">
          <MetricGridV2 metrics={homeMetrics} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <KeySeriesGsvCard series={keySeriesRows} />
        <ChartPanelV2
          title="MTD / DLY 经营趋势"
          description="支持日位置 hover、双指标对比和同比 / 环比提示；缺数据时不画 0 线。"
          recommendedPairs={recommendedMetricPairs}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DataHealthSummaryCard />
        <DataTableV2
          title="数据异常提醒"
          description="只展示安全摘要，不展示原始内容。"
          columns={["类型", "当前状态", "下一步"]}
          rows={anomalyRows}
        />
      </section>
    </div>
  );
}
