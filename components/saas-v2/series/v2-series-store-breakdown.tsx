import type { V2HomeStoreBreakdownItem } from "@/types/v2/home";

const shareWidth = (value: number | null): string =>
  `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%`;

export function V2SeriesStoreBreakdown({
  items,
  seriesName,
}: {
  items: V2HomeStoreBreakdownItem[];
  seriesName: string;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="v2-series-store-breakdown">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-blue-700">品牌系列拆解</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">渠道与店铺贡献</h2>
          <p className="mt-1 text-xs text-slate-500">{seriesName}在当前时间范围内的跨平台拆解。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {items.length} 个有数据店铺
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          当前系列在所选时间范围内没有可拆解的店铺数据
        </div>
      ) : (
        <div className={`mt-4 grid gap-3 ${items.length === 1 ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          {items.map((item, index) => (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-lg border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_100%)] p-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 min-w-5 items-center justify-center rounded bg-slate-900 px-1 text-[10px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-blue-700">{item.platformName}</span>
                  </div>
                  <h3 className="mt-1.5 truncate text-sm font-semibold text-slate-900" title={item.storeName}>{item.storeName}</h3>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-slate-400">GMV 贡献</p>
                  <strong className="text-lg leading-6 text-slate-950">{item.gmvShare}</strong>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb,#0f766e)]" style={{ width: shareWidth(item.gmvShareRaw) }} />
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
                <span className="text-[11px] text-slate-500">系列 GMV</span>
                <strong className="text-base tabular-nums text-slate-900">{item.gmv}</strong>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-[10px] text-slate-400">访客</dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-700">{item.visitors}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">支付买家</dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-700">{item.paidBuyers}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-slate-400">转化率</dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-700">{item.conversionRate}</dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-white/80 px-2.5 py-2 text-[10px] text-slate-500">
                <span>客单 {item.averageOrderValue}</span>
                <span>ROI {item.adRoi}</span>
                <span>退货率 {item.refundRate}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
