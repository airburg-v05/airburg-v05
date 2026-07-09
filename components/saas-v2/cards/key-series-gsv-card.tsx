interface KeySeriesRow {
  name: string;
  current: string;
  mtd: string;
  total: string;
  delta: string;
  completion: string;
  progress: number;
}

export function KeySeriesGsvCard({ series }: { series: KeySeriesRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-950">重点系列 GSV</h2>
        <p className="mt-1 text-sm text-slate-500">首页只展示关键系列 GSV 状态，不切换成系列详情页。</p>
      </div>
      <div className="mt-5 grid gap-3">
        {series.map((item) => {
          const progress = Math.max(0, Math.min(100, item.progress));
          return (
            <article key={item.name} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">GSV 当前值 {item.current}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-400">MTD目标</dt>
                    <dd className="font-semibold text-slate-700">{item.mtd}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">系列总目标</dt>
                    <dd className="font-semibold text-slate-700">{item.total}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">完成率</dt>
                    <dd className="font-semibold text-slate-700">{item.completion}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">差值</dt>
                    <dd className="font-semibold text-slate-700">{item.delta}</dd>
                  </div>
                </dl>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
