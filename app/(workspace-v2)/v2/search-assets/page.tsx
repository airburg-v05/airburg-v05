import { ChartPanelV2 } from "@/components/saas-v2/charts/chart-panel-v2";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import {
  aliasRows,
  keywordComparisonRows,
  searchAssetRows,
} from "@/components/saas-v2/data";

export default function SaasV2SearchAssetsPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DataTableV2
          title="品牌别名组"
          description="中文 / 英文品牌同归属，影响搜索资产归因，不改原始数据。"
          columns={["品牌", "别名", "说明"]}
          rows={aliasRows}
        />
        <DataTableV2
          title="品牌 → 系列 → 商品 → 搜索词结构"
          description="统一管理品牌词、中心词、别名词和类目词。"
          columns={["层级", "搜索资产", "用途"]}
          rows={searchAssetRows}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="品牌词支付占比"
          description="品牌词支付人数 / 总搜索词支付人数。"
          columns={["对象", "访客", "支付人数"]}
          rows={keywordComparisonRows}
        />
        <ChartPanelV2
          title="同品牌不同系列 / 同系列不同商品对比"
          description="对比品牌词访客与品牌词支付人数，后续接 active dataset。"
          recommendedPairs={["品牌词访客 vs 品牌词支付人数", "中心词访客 vs 支付人数"]}
        />
      </section>
    </div>
  );
}
