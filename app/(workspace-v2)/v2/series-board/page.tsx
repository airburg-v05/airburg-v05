import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import {
  boardMetrics,
  seriesContributionRows,
  seriesRows,
  seriesSearchRows,
} from "@/components/saas-v2/data";

export default function SaasV2SeriesBoardPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DataTableV2
          title="系列列表"
          description="系列属于平台、品牌和店铺；商品 ID 清单由用户维护。"
          action={<button className="primary-button" type="button">新建系列</button>}
          columns={["系列", "归属", "商品 ID 维护", "操作"]}
          rows={seriesRows}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">当前店铺下系列</h2>
              <p className="mt-1 text-sm text-slate-500">与首页重点系列 GSV 模块保持同一系列定义。</p>
            </div>
            <button className="secondary-button" type="button">编辑系列</button>
          </div>
          <div className="mt-4">
            <SafeEmptyState
              title="等待选择系列"
              description="选择或新建系列后，这里显示系列经营摘要、商品贡献和搜索表现。"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">系列 KPI</h2>
        <p className="mt-1 text-sm text-slate-500">当前无 active dataset 或未选系列时保持 --。</p>
        <div className="mt-4">
          <MetricGridV2 metrics={boardMetrics} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="系列商品贡献"
          description="只展示该系列维护的商品清单贡献。"
          columns={["商品", "GSV", "贡献说明"]}
          rows={seriesContributionRows}
        />
        <DataTableV2
          title="系列搜索表现"
          description="品牌词、中心词和类目词按搜索资产管理口径展示。"
          columns={["搜索资产", "访客", "支付人数"]}
          rows={seriesSearchRows}
        />
      </section>

      <ChartPanelV2
        title="系列趋势"
        description="趋势跟随当前系列、平台、店铺和时间范围。"
        recommendedPairs={["GSV vs 推广花费", "品牌词访客 vs 品牌词支付人数"]}
      />
    </div>
  );
}
