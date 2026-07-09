import { SafeIssueCodeBadge } from "@/components/saas-v2/badges/safe-issue-code-badge";
import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import { exclusionRuleRows, sourceCapabilityRows } from "@/components/saas-v2/data";

export default function SaasV2ExclusionRulesPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">商品 ID 排除</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            商品 ID 排除作用于商品级经营数据，并在支持的汇总范围内影响系列、店铺和品牌摘要。
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700" htmlFor="exclude-product-id">
              商品 ID
            </label>
            <input
              className="form-input mt-2"
              id="exclude-product-id"
              placeholder="输入需要排除的商品 ID"
              readOnly
            />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">多文本排除</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            多文本排除只在数据源具备对应文本字段时生效；无订单明细、售后明细或备注字段时不可用。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SafeIssueCodeBadge code="当前数据源不支持该过滤" />
            <SafeIssueCodeBadge code="SOURCE_FIELD_UNAVAILABLE" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DataTableV2
          title="数据源能力检测"
          description="不伪装生效；字段缺失时明确展示不可用。"
          columns={["过滤字段", "能力状态", "说明"]}
          rows={sourceCapabilityRows}
        />
        <DataTableV2
          title="规则列表"
          description="本地 preview 只展示结构，不改 persistence schema。"
          columns={["规则", "生效范围", "状态"]}
          rows={exclusionRuleRows}
        />
      </section>
    </div>
  );
}
