export function V2ExclusionRulesWorkspace() {
  return (
    <div className="flex flex-col gap-5" data-testid="v2-exclusion-rules-workspace">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">排除规则暂未开放</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          商品 ID 和备注文本排除会影响经营判断，需要统一保存、读取和生效范围确认后再开放。
          当前页面只保留规划状态，不提供临时输入框。
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">已明确的业务方向</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 支持按商品 ID 排除不参与经营分析的商品。</li>
            <li>• 支持按备注文本处理特殊经营样本。</li>
            <li>• 生效范围需要覆盖首页、商品看板和相关汇总。</li>
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">开放前还需要确认</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 规则保存后在哪些页面生效。</li>
            <li>• 备注文本来自哪些稳定字段。</li>
            <li>• 修改规则后如何提示对历史数据的影响。</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 className="text-sm font-semibold text-slate-950">当前可操作建议</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          如需临时排查异常商品，先在商品中心和数据健康页确认来源；正式排除规则将在保存与生效范围确认后开放。
        </p>
      </section>
    </div>
  );
}
