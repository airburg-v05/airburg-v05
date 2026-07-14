"use client";

import type {
  V2HomeComparisonMode,
  V2HomeScope,
  V2HomeTimeRange,
  V2HomeTimeRangeMode,
} from "@/types/v2/home";

interface V2HomeToolbarProps {
  scope: V2HomeScope;
  dataStatusLabel: string;
  datasetRange: { startDate: string; endDate: string };
  timeRange: V2HomeTimeRange;
  comparisonMode: V2HomeComparisonMode;
  busy: boolean;
  onPlatformChange: (platformCode: string | null) => void;
  onStoresChange: (storeIds: string[]) => void;
  onTimeModeChange: (mode: V2HomeTimeRangeMode) => void;
  onCustomRangeChange: (range: V2HomeTimeRange) => void;
  onComparisonModeChange: (mode: V2HomeComparisonMode) => void;
  onOpenMetricSettings: () => void;
}

const ACTIONS = [
  { label: "系列自定义", href: "/v2/series-board" },
  { label: "商品排除", href: "/v2/exclusion-rules" },
  { label: "品牌搜索资产", href: "/v2/search-assets" },
  { label: "目标中心", href: "/v2/target-center" },
  { label: "数据健康", href: "/v2/data-health" },
];

const TIME_MODES: Array<{ mode: Exclude<V2HomeTimeRangeMode, "custom">; label: string }> = [
  { mode: "day", label: "日" },
  { mode: "week", label: "周" },
  { mode: "month", label: "月" },
];

export function V2HomeToolbar({
  scope,
  dataStatusLabel,
  datasetRange,
  timeRange,
  comparisonMode,
  busy,
  onPlatformChange,
  onStoresChange,
  onTimeModeChange,
  onCustomRangeChange,
  onComparisonModeChange,
  onOpenMetricSettings,
}: V2HomeToolbarProps) {
  const selectedStoreLabels = scope.storeOptions
    .filter((item) => scope.selectedStoreIds.includes(item.id))
    .map((item) => item.label);
  const allStoresSelected = scope.selectedStoreIds.length === scope.storeOptions.length;

  const toggleStore = (storeId: string) => {
    const next = scope.selectedStoreIds.includes(storeId)
      ? scope.selectedStoreIds.filter((id) => id !== storeId)
      : [...scope.selectedStoreIds, storeId];
    onStoresChange(next.length > 0 ? next : scope.storeOptions.map((item) => item.id));
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4" data-testid="v2-home-toolbar">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-lg font-semibold text-slate-950">品牌经营驾驶舱</h1>
            <span className="text-xs text-slate-500">品牌：{scope.brandName}</span>
            <span className="text-xs text-slate-500">
              经营日期：{datasetRange.startDate} ~ {datasetRange.endDate}
            </span>
            <span className="text-xs font-medium text-emerald-700">{dataStatusLabel}</span>
          </div>
        </div>
        <nav className="flex max-w-full gap-1 overflow-x-auto pb-1 xl:pb-0" aria-label="经营工具">
          {ACTIONS.map((action) => (
            <a
              key={action.href}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              href={action.href}
            >
              {action.label}
            </a>
          ))}
        </nav>
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button
          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-600"
          disabled
          title="当前工作区仅有一个品牌"
          type="button"
        >
          空气堡
        </button>

        <label className="sr-only" htmlFor="v2-home-platform">平台</label>
        <select
          id="v2-home-platform"
          className="h-8 max-w-36 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
          disabled={busy || scope.platformOptions.length <= 1}
          onChange={(event) => onPlatformChange(event.target.value || null)}
          value={scope.selectedPlatform ?? ""}
        >
          {scope.platformOptions.length > 1 ? <option value="">全部平台</option> : null}
          {scope.platformOptions.map((item) => (
            <option key={item.id} value={item.platformCode}>{item.label}</option>
          ))}
        </select>

        <details className="relative">
          <summary className="flex h-8 max-w-52 cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            <span className="truncate">
              {allStoresSelected ? `全部店铺 (${scope.storeOptions.length})` : selectedStoreLabels.join("、")}
            </span>
            <span aria-hidden="true" className="text-slate-400">⌄</span>
          </summary>
          <div className="absolute left-0 top-10 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
            {scope.storeOptions.map((item) => (
              <label key={`${item.platformCode}:${item.id}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs text-slate-700 hover:bg-slate-50">
                <input
                  checked={scope.selectedStoreIds.includes(item.id)}
                  disabled={busy}
                  onChange={() => toggleStore(item.id)}
                  type="checkbox"
                />
                <span className="truncate">{item.label}</span>
              </label>
            ))}
          </div>
        </details>

        <div className="flex h-8 items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {TIME_MODES.map((item) => (
            <button
              key={item.mode}
              className={`h-7 min-w-8 rounded px-2 text-xs font-semibold transition ${
                timeRange.mode === item.mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              }`}
              disabled={busy}
              onClick={() => onTimeModeChange(item.mode)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <details className="relative">
            <summary
              className={`flex h-7 cursor-pointer list-none items-center rounded px-2 text-xs font-semibold [&::-webkit-details-marker]:hidden ${
                timeRange.mode === "custom" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              }`}
            >
              自定义
            </summary>
            <div className="absolute right-0 top-9 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl sm:left-0 sm:right-auto">
              <p className="text-xs font-semibold text-slate-700">自定义时间范围</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  开始日期
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    max={timeRange.endDate}
                    onChange={(event) => onCustomRangeChange({
                      mode: "custom",
                      startDate: event.target.value,
                      endDate: timeRange.endDate,
                    })}
                    type="date"
                    value={timeRange.startDate}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  结束日期
                  <input
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    min={timeRange.startDate}
                    onChange={(event) => onCustomRangeChange({
                      mode: "custom",
                      startDate: timeRange.startDate,
                      endDate: event.target.value,
                    })}
                    type="date"
                    value={timeRange.endDate}
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">最长 1 年；超出范围时请调整日期。</p>
            </div>
          </details>
        </div>

        <span className="max-w-full truncate text-xs text-slate-500">
          {timeRange.startDate} ~ {timeRange.endDate}
        </span>

        <label className="sr-only" htmlFor="v2-home-comparison">比较方式</label>
        <select
          id="v2-home-comparison"
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
          disabled={busy}
          onChange={(event) => onComparisonModeChange(event.target.value as V2HomeComparisonMode)}
          value={comparisonMode}
        >
          <option value="none">无对比</option>
          <option value="yoy">同比</option>
          <option value="previous_period">上一周期</option>
        </select>

        <button
          className="ml-auto h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onOpenMetricSettings}
          type="button"
        >
          指标设置
        </button>
      </div>
    </section>
  );
}
