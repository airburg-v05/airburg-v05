export function DualMetricCompareControl({ recommendedPairs }: { recommendedPairs: string[] }) {
  return (
    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">双指标对比入口</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {recommendedPairs.map((pair) => (
          <span key={pair} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
            {pair}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">推荐组合只做选择提示，不重复 KPI 卡片数值。</p>
    </div>
  );
}
