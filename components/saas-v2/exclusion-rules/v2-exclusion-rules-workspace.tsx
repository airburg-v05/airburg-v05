import { SafeIssueCodeBadge } from "@/components/saas-v2/badges/safe-issue-code-badge";

export function V2ExclusionRulesWorkspace() {
  return (
    <div className="flex flex-col gap-5" data-testid="v2-exclusion-rules-workspace">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <SafeIssueCodeBadge code="BLOCKED_BY_MISSING_CONTRACT" />
        </div>
        <h2 className="mt-3 text-base font-semibold text-slate-950">排除规则</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          当前只能确认“商品 ID 排除”和“备注文本排除”在现有统计逻辑里有对应含义，但还没有稳定的跨页保存与统一读取方案。
          为了避免把局部临时状态伪装成正式配置中心，本页在本轮只保留安全说明，不开放假配置控件。
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">已确认的真实语义</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 商品 ID 排除已经会影响商品级聚合过滤。</li>
            <li>• 备注文本排除在现有输入逻辑里存在，但还没有稳定的跨页配置与可追溯保存。</li>
            <li>• 当前页面不能仅凭本地临时输入就声称“规则中心已完成”。</li>
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">缺失的合同</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 缺少已批准的跨页保存方案，无法安全保存或复用排除规则。</li>
            <li>• 缺少统一的读取与回写路径，无法证明首页、商品看板等页面会一致生效。</li>
            <li>• 缺少对备注类文本字段可用范围的稳定说明，不能伪装成真实多文本排除。</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 className="text-sm font-semibold text-slate-950">当前安全结论</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          本轮已去掉静态规则列表、只读输入框和伪交互控件。后续只有在负责人批准新的跨页保存与统一读取方案后，
          才应把这里升级为真实可编辑的排除规则中心。
        </p>
      </section>
    </div>
  );
}
