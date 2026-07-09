import { DataHealthSummaryCard } from "@/components/saas-v2/cards/data-health-summary-card";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import {
  coverageCalendarRows,
  dataHealthRows,
  sourceCoverageRows,
} from "@/components/saas-v2/data";

export default function SaasV2DataHealthPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <DataHealthSummaryCard />
        <DataTableV2
          title="数据覆盖日历"
          description="表达每天各类报表状态；当前为 preview pending，不伪装真实数据。"
          columns={["日期", "商品经营", "计划", "搜索", "售后"]}
          rows={coverageCalendarRows}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="缺失 / 重复 / skipped / 不可计算"
          description="只读安全摘要，不提供删除、覆盖或回滚操作。"
          columns={["问题", "影响日期", "说明"]}
          rows={dataHealthRows}
        />
        <DataTableV2
          title="source coverage summary"
          description="展示来源覆盖，不包含原始文件内容。"
          columns={["来源", "状态", "影响指标"]}
          rows={sourceCoverageRows}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">只读安全摘要</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          数据健康中心只说明哪一天缺数据、哪一天重复上传、哪一天 skipped、哪一天指标不可计算。
          后续若需要覆盖或回滚，必须由独立任务授权。
        </p>
      </section>
    </div>
  );
}
