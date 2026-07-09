import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { MetricGridV2 } from "@/components/saas-v2/cards/metric-grid-v2";
import { SafeEmptyState } from "@/components/saas-v2/empty/safe-empty-state";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import {
  boardMetrics,
  productAfterSalesRows,
  productSearchRows,
  trackedProductRows,
} from "@/components/saas-v2/data";

export default function SaasV2ProductBoardPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DataTableV2
          title="手动关注商品列表"
          description="只显示用户维护的关注商品，不展示运行时全部商品。"
          action={<button className="primary-button" type="button">添加商品</button>}
          columns={["商品", "店铺", "展示名"]}
          rows={trackedProductRows}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">当前商品详情区</h2>
          <p className="mt-1 text-sm text-slate-500">未选择商品时保持安全空态。</p>
          <div className="mt-4">
            <SafeEmptyState
              title="尚未选择商品"
              description="从左侧手动关注商品中选择后，显示商品 KPI、趋势、搜索和售后摘要。"
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">商品 KPI</h2>
        <p className="mt-1 text-sm text-slate-500">当前无选择或无数据时显示 --。</p>
        <div className="mt-4">
          <MetricGridV2 metrics={boardMetrics} />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ChartPanelV2
          title="商品趋势"
          description="趋势跟随当前手动关注商品，不会切回全部商品视图。"
          recommendedPairs={["GSV vs 转化率", "推广花费 vs ROI"]}
        />
        <DataTableV2
          title="商品搜索表现"
          description="按品牌词、中心词、别名词和类目词观察商品搜索资产。"
          columns={["搜索资产", "访客", "支付人数"]}
          rows={productSearchRows}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="商品售后"
          description="只展示安全聚合摘要。"
          columns={["售后类型", "当前状态", "说明"]}
          rows={productAfterSalesRows}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">商品排除关联提示</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            如果商品进入排除规则，相关页面会提示该商品是否参与当前经营汇总。排除规则不改写原始数据。
          </p>
        </div>
      </section>
    </div>
  );
}
