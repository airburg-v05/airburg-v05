import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import { boardMetrics, storeContributionRows, storeRows } from "@/components/saas-v2/data";

export default function SaasV2StoreBoardPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <DataTableV2
          title="店铺列表 / 店铺选择"
          description="店铺范围由平台、品牌和店铺共同确定。"
          columns={["店铺", "平台", "当前状态"]}
          rows={storeRows}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">品牌弱筛选入口</h2>
              <p className="mt-1 text-sm text-slate-500">当前默认空气堡，未来支持多品牌店铺绑定。</p>
            </div>
            <button className="secondary-button" type="button">店铺目标入口</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">店铺对比</p>
              <p className="mt-2 text-sm text-slate-700">等待多店铺数据后展示 GSV、ROI 和目标完成差异。</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">店铺趋势</p>
              <p className="mt-2 text-sm text-slate-700">跟随当前店铺、时间范围和目标草稿。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">店铺 KPI</h2>
        <p className="mt-1 text-sm text-slate-500">只统计当前平台、品牌和店铺范围。</p>
        <div className="mt-4">
          <MetricGridV2 metrics={boardMetrics} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartPanelV2
          title="店铺趋势"
          description="店铺页不会替代首页，趋势只服务当前店铺经营拆解。"
          recommendedPairs={["GMV vs GSV", "GSV vs 退款金额"]}
        />
        <DataTableV2
          title="店铺下系列 / 商品贡献"
          description="贡献结构等待 active dataset 后读取。"
          columns={["对象", "贡献类型", "当前值"]}
          rows={storeContributionRows}
        />
      </section>
    </div>
  );
}
