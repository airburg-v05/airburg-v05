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
    description: "看该系列在整个品牌中的规模、效率与各店铺贡献。",
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
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(115deg,#f8fbff_0%,#ffffff_58%,#f4faf8_100%)]"
      data-testid="v2-series-analysis-lens"
    >
      <div className="grid gap-2 p-2 sm:grid-cols-2">
        {LENSES.map((item) => {
          const active = item.id === lens;
          return (
            <button
              key={item.id}
              aria-label={item.label}
              aria-pressed={active}
              className={`group rounded-lg border px-3.5 py-3 text-left transition ${active
                ? "border-blue-300 bg-white shadow-[0_8px_24px_rgba(37,99,235,0.08)]"
                : "border-transparent bg-white/45 hover:border-slate-200 hover:bg-white/80"
              }`}
              onClick={() => onChange(item.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className={`text-sm font-semibold ${active ? "text-blue-800" : "text-slate-800"}`}>{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                  {item.eyebrow}
                </span>
              </span>
              <span className="mt-1.5 block text-[11px] leading-5 text-slate-500">{item.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
