"use client";

export type V2SeriesAnalysisLens = "brand" | "store";

const LENSES: Array<{
  id: V2SeriesAnalysisLens;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "brand",
    label: "品牌汇总",
    eyebrow: "跨平台 / 全店铺",
    description: "看该系列在整个品牌中的规模、增长与经营效率。",
  },
  {
    id: "store",
    label: "单店拆解",
    eyebrow: "单平台 / 单店铺",
    description: "定位具体店铺的执行表现，并读取该店铺的系列目标。",
  },
];

export function V2SeriesAnalysisLensSwitch({
  lens,
  onChange,
}: {
  lens: V2SeriesAnalysisLens;
  onChange: (lens: V2SeriesAnalysisLens) => void;
}) {
  const activeLens = LENSES.find((item) => item.id === lens) ?? LENSES[0];
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
      data-testid="v2-series-analysis-lens"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex shrink-0 rounded-lg bg-slate-100 p-1" role="group" aria-label="系列分析视角">
          {LENSES.map((item) => {
            const active = item.id === lens;
            return (
              <button
                key={item.id}
                aria-label={item.label}
                aria-pressed={active}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${active
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-500 hover:bg-white hover:text-slate-800"
                }`}
                onClick={() => onChange(item.id)}
                type="button"
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:border-l sm:border-slate-100 sm:pl-3">
          <p className="min-w-0 text-[11px] leading-5 text-slate-500">{activeLens.description}</p>
          <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
            {activeLens.eyebrow}
          </span>
        </div>
      </div>
    </section>
  );
}
