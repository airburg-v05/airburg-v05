export function CompareModeControl() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-500">比较方式</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["同比", "环比"].map((label) => (
          <button key={label} className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700" type="button">
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">比较口径跟随当前时间范围。</p>
    </div>
  );
}
