"use client";

import { useState } from "react";
import { validateV2HomeTimeRange } from "@/lib/v2/home/v2-home-adapter";
import type {
  V2HomeComparisonMode,
  V2HomeScope,
  V2HomeTimeRange,
  V2HomeTimeRangeMode,
} from "@/types/v2/home";

interface V2HomeToolbarProps {
  scope: V2HomeScope;
  timeRange: V2HomeTimeRange;
  comparisonMode: V2HomeComparisonMode;
  busy: boolean;
  interactionError: string | null;
  onPlatformChange: (platformCode: string | null) => void;
  onStoresChange: (storeIds: string[]) => void;
  onTimeModeChange: (mode: V2HomeTimeRangeMode) => void;
  onCustomRangeChange: (range: V2HomeTimeRange) => void;
  onComparisonModeChange: (mode: V2HomeComparisonMode) => void;
}

const OPERATING_ACTIONS = [
  { label: "重点系列", href: "/v2/series-board" },
  { label: "搜索资产", href: "/v2/search-assets" },
  { label: "目标中心", href: "/v2/target-center" },
];

const TIME_MODES: Array<{ mode: Exclude<V2HomeTimeRangeMode, "custom">; label: string }> = [
  { mode: "day", label: "日" },
  { mode: "week", label: "周" },
  { mode: "month", label: "月" },
];

const COMPARISON_MODES: Array<{ mode: V2HomeComparisonMode; label: string; title: string }> = [
  { mode: "none", label: "关闭", title: "不显示区间变化率" },
  { mode: "yoy", label: "同比", title: "与上一年度相同日期区间比较" },
  { mode: "previous_period", label: "环比", title: "与紧邻的上一等长日期区间比较" },
];

export function V2HomeToolbar({
  scope,
  timeRange,
  comparisonMode,
  busy,
  interactionError,
  onPlatformChange,
  onStoresChange,
  onTimeModeChange,
  onCustomRangeChange,
  onComparisonModeChange,
}: V2HomeToolbarProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<V2HomeTimeRange>({ ...timeRange, mode: "custom" });
  const customError = validateV2HomeTimeRange(customDraft);

  const selectedStoreLabels = scope.storeOptions
    .filter((item) => scope.selectedStoreIds.includes(item.id))
    .map((item) => item.label);
  const allStoresSelected = scope.selectedStoreIds.length === scope.storeOptions.length;
  const platformLabel = scope.platformOptions.find((item) => item.platformCode === scope.selectedPlatform)?.label
    ?? "全部平台";
  const storeLabel = allStoresSelected
    ? `全部店铺 (${scope.storeOptions.length})`
    : selectedStoreLabels.join("、");

  const toggleStore = (storeId: string) => {
    const next = scope.selectedStoreIds.includes(storeId)
      ? scope.selectedStoreIds.filter((id) => id !== storeId)
      : [...scope.selectedStoreIds, storeId];
    onStoresChange(next.length > 0 ? next : scope.storeOptions.map((item) => item.id));
  };

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4"
      data-home-region="toolbar"
      data-testid="v2-home-toolbar"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <h1 className="shrink-0 text-xl font-semibold text-slate-900">品牌经营驾驶舱</h1>
          <details className="relative mt-0.5 min-w-0 sm:mt-0">
            <summary className="flex max-w-full cursor-pointer list-none items-center gap-1 truncate text-xs text-slate-500 sm:max-w-[42vw] [&::-webkit-details-marker]:hidden">
              <span className="truncate">{scope.brandName} · {platformLabel} · {storeLabel}</span>
              <span aria-hidden="true" className="text-slate-400">⌄</span>
            </summary>
            <div className="absolute left-0 top-7 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <p className="text-xs font-semibold text-slate-800">当前经营范围</p>
              <div className="mt-3 grid gap-3">
                <div className="text-xs text-slate-500">
                  品牌
                  <div className="mt-1 flex h-8 items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2">
                    <span className="truncate font-medium text-slate-700">{scope.brandName}</span>
                    <a className="shrink-0 font-semibold text-blue-700" href="/v2/brand-settings">切换/管理</a>
                  </div>
                </div>
                <label className="text-xs text-slate-500" htmlFor="v2-home-platform">
                  平台
                  <select
                    id="v2-home-platform"
                    className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                    disabled={busy || scope.platformOptions.length <= 1}
                    onChange={(event) => onPlatformChange(event.target.value || null)}
                    value={scope.selectedPlatform ?? ""}
                  >
                    {scope.platformOptions.length > 1 ? <option value="">全部平台</option> : null}
                    {scope.platformOptions.map((item) => (
                      <option key={item.id} value={item.platformCode}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <div>
                  <p className="text-xs text-slate-500">店铺</p>
                  <div className="mt-1 rounded-md border border-slate-200 p-1">
                    {scope.storeOptions.map((item) => (
                      <label key={`${item.platformCode}:${item.id}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
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
                </div>
              </div>
            </div>
          </details>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <details className="relative" data-testid="v2-home-operating-settings">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              经营设置 <span aria-hidden="true" className="text-slate-400">⌄</span>
            </summary>
            <nav className="absolute right-0 top-10 z-40 w-40 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" aria-label="经营设置">
              {OPERATING_ACTIONS.map((action) => (
                <a
                  key={action.href}
                  className="block rounded-md px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-700"
                  href={action.href}
                >
                  {action.label}
                </a>
              ))}
            </nav>
          </details>
          <a className="flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" href="/v2/data-health">
            数据健康
          </a>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        <div className="flex h-8 items-center rounded-md bg-slate-100 p-0.5">
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
          <div className="relative">
            <button
              className={`flex h-7 cursor-pointer list-none items-center rounded px-2 text-xs font-semibold [&::-webkit-details-marker]:hidden ${
                timeRange.mode === "custom" || customOpen ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
              }`}
              disabled={busy}
              onClick={() => {
                setCustomDraft({ ...timeRange, mode: "custom" });
                setCustomOpen((open) => !open);
              }}
              type="button"
            >
              自定义
            </button>
            {customOpen ? <div className="absolute left-0 top-9 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-800">自定义时间范围</p>
                  <p className="mt-1 text-[11px] text-slate-400">修改后点击“应用”，最长 1 年。</p>
                </div>
                <button className="text-slate-400 hover:text-slate-700" onClick={() => setCustomOpen(false)} type="button" aria-label="关闭自定义日期">×</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">
                  开始日期
                  <input
                    id="v2-home-custom-start"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    max={customDraft.endDate || undefined}
                    onChange={(event) => setCustomDraft((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                    value={customDraft.startDate}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  结束日期
                  <input
                    id="v2-home-custom-end"
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                    min={customDraft.startDate || undefined}
                    onChange={(event) => setCustomDraft((current) => ({ ...current, endDate: event.target.value }))}
                    type="date"
                    value={customDraft.endDate}
                  />
                </label>
              </div>
              {customError || interactionError ? <p className="mt-2 text-xs font-medium text-amber-700">{customError || interactionError}</p> : null}
              <div className="mt-3 flex justify-end gap-2">
                <button className="secondary-button" onClick={() => setCustomOpen(false)} type="button">取消</button>
                <button
                  className="primary-button"
                  disabled={Boolean(customError)}
                  onClick={() => {
                    onCustomRangeChange(customDraft);
                    setCustomOpen(false);
                  }}
                  type="button"
                >
                  应用
                </button>
              </div>
            </div> : null}
          </div>
        </div>

        <span className="truncate text-xs tabular-nums text-slate-500">
          {timeRange.startDate} ~ {timeRange.endDate}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-slate-400 sm:inline" title="同比比较去年同期；环比比较紧邻上一等长区间">指标变化</span>
          <div className="flex h-8 items-center rounded-md bg-slate-100 p-0.5" role="group" aria-label="指标区间对比">
            {COMPARISON_MODES.map((item) => (
              <button
                key={item.mode}
                aria-pressed={comparisonMode === item.mode}
                className={`h-7 rounded px-2.5 text-xs font-semibold ${comparisonMode === item.mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                disabled={busy}
                onClick={() => onComparisonModeChange(item.mode)}
                title={item.title}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
