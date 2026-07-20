export function DataHealthSummaryCard() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">数据覆盖健康</h2>
          <p className="mt-1 text-sm text-slate-500">覆盖日历、缺失、重复、跳过和不可计算原因。</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {["缺失数据", "重复上传", "跳过文件", "指标不可计算"].map((item) => (
          <div key={item} className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">{item}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">导入经营数据后显示摘要。</p>
          </div>
        ))}
      </div>
    </section>
  );
}
