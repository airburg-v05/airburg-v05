import { DataTableV2 } from "@/components/saas-v2/tables/data-table-v2";
import { derivedTargetRows, targetScopeRows, targetRuleRows } from "@/components/saas-v2/data";

export default function SaasV2TargetCenterPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">目标中心</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          统一管理品牌、平台、店铺、系列和商品目标。目标只影响 MTD目标、总目标、差值、完成率和进度条，不反写真实数据。
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {targetScopeRows.map((row) => (
            <div key={row[0]} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{row[0]}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{row[1]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <DataTableV2
          title="required target 输入"
          description="这些目标可以输入，后续接入现有 target drafts。"
          columns={["目标", "单位", "规则"]}
          rows={targetRuleRows}
        />
        <DataTableV2
          title="derived target 展示"
          description="推导目标只展示结果和公式，不作为普通输入。"
          columns={["目标", "公式", "保存规则"]}
          rows={derivedTargetRows}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">unsupported target 折叠说明</h2>
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">查看暂不支持输入的目标</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            MTD周转、同区履约率、发货退货率、已签收退货率、推广点击单价暂不作为普通输入。
            百分比输入可接受 92 / 92% / 0.92，统一显示为 92%，不会显示 9.200%。
          </p>
        </details>
      </section>
    </div>
  );
}
