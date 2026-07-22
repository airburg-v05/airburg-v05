"use client";

import { MAX_HOME_SERIES } from "@/lib/v2/workspace/brand-series";
import type {
  V2HomeMetricCard,
  V2HomeMetricKey,
  V2HomeSeriesOption,
} from "@/types/v2/home";

const shortMetricNote = (metric: V2HomeMetricCard): string | null => {
  if (!metric.note) return null;
  if (metric.sourceStatus === "pending") return "数据待接入";
  if (metric.sourceStatus === "unavailable") return "暂无数据源";
  return "暂无可用数据";
};

const compactTargetValue = (value: string): string => {
  const numeric = Number(value.replaceAll(",", "").replace(/[^0-9.+-]/g, ""));
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 10_000) return value;
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(numeric);
};

const hasHomeTargetDetail = (metric: V2HomeMetricCard): boolean =>
  [metric.target.mtdTarget, metric.target.totalTarget, metric.target.difference, metric.target.completionRate].some((value) => {
    const trimmed = value.trim();
    return trimmed !== "" && trimmed !== "--";
  }) || metric.target.progress !== null;

export function V2HomeMetricGrid({
  metrics,
  visibleKeys,
  order,
  selectedMetricKey,
  targetPeriodLabel = "当前范围",
  emptyTargetLabel: emptyTargetLabelOverride,
}: {
  metrics: V2HomeMetricCard[];
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
  selectedMetricKey: V2HomeMetricKey;
  targetPeriodLabel?: string;
  emptyTargetLabel?: string;
}) {
  const cardsByKey = new Map(metrics.map((metric) => [metric.metricKey, metric]));
  const visible = order
    .filter((metricKey) => visibleKeys.includes(metricKey))
    .map((metricKey) => cardsByKey.get(metricKey))
    .filter((metric): metric is V2HomeMetricCard => Boolean(metric));

  if (visible.length === 0) {
    return (
      <div className="border-t border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
        请至少保留一个指标
      </div>
    );
  }

  return (
    <div
      className="grid min-w-0 grid-cols-2 border-t border-slate-100 max-[340px]:grid-cols-1 min-[920px]:grid-cols-4"
      data-testid="v2-home-metric-grid"
    >
      {visible.map((metric) => {
        const selected = metric.metricKey === selectedMetricKey;
        const note = shortMetricNote(metric);
        const showTargetDetail = hasHomeTargetDetail(metric);
        const primaryTarget = metric.target.mtdTarget !== "--"
          ? metric.target.mtdTarget
          : metric.target.totalTarget;
        const showSeparateMonthlyTarget = metric.target.totalTarget !== "--" &&
          metric.target.totalTarget !== metric.target.mtdTarget;
        const emptyTargetLabel = emptyTargetLabelOverride ?? (metric.target.rule === "unsupported"
          ? "分析指标 · 暂不设置目标"
          : metric.target.rule === "derived"
            ? `${targetPeriodLabel} · 待补基础目标`
            : `${targetPeriodLabel} · 未设置目标`);
        return (
          <article
            key={metric.metricKey}
            aria-label={showTargetDetail
              ? `${metric.title}，当前值 ${metric.actual}，MTD目标 ${metric.target.mtdTarget}，总目标 ${metric.target.totalTarget}，差值 ${metric.target.difference}，完成率 ${metric.target.completionRate}`
              : `${metric.title}，当前值 ${metric.actual}，未设置目标`}
            className={`flex min-h-[148px] min-w-0 flex-col border-b border-r border-t-[3px] border-slate-100 px-4 pb-3 pt-3 transition-colors ${
              selected ? "border-t-blue-600 bg-[#f4f7ff]" : "border-t-transparent bg-white hover:bg-slate-50/70"
            }`}
            data-kpi-cell="true"
            data-metric-key={metric.metricKey}
            data-target-state={showTargetDetail ? "ready" : "empty"}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <h3 className="min-w-0 truncate text-[13px] font-semibold text-slate-700" title={metric.title}>{metric.title}</h3>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[10px] font-medium text-slate-400">{metric.unit}</span>
                {note ? (
                  <span
                    aria-label={note}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 text-[9px] font-bold text-slate-400"
                    role="img"
                    title={note}
                  >
                    i
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-1.5 truncate text-[26px] font-bold leading-none tracking-[0] text-slate-950" title={metric.actual}>
              {metric.actual}
            </p>

            {metric.comparison ? (
              <p
                className={`mt-1 text-[10px] font-semibold ${metric.comparison.available ? (metric.comparison.changeRate! >= 0 ? "text-emerald-700" : "text-rose-700") : "text-slate-400"}`}
                title={`参考期 ${metric.comparison.referenceRange.startDate} 至 ${metric.comparison.referenceRange.endDate}`}
              >
                {metric.comparison.formatted}
              </p>
            ) : null}

            {showTargetDetail ? (
              <>
                <div className="mt-auto border-t border-slate-100 pt-2.5">
                  <div className="flex min-w-0 items-center justify-between gap-2 text-[10px]">
                    <span className="min-w-0 truncate text-slate-500" title={`阶段目标 ${primaryTarget}`}>
                      目标 <strong className="ml-1 font-semibold tabular-nums text-slate-700">{compactTargetValue(primaryTarget)}</strong>
                    </span>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 font-semibold tabular-nums text-blue-700">
                      {metric.target.completionRate}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                    {metric.target.progress !== null ? (
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${metric.target.progress}%` }} />
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 text-[9px] text-slate-400">
                    <span className="truncate" title={`差值 ${metric.target.difference}`}>差额 {compactTargetValue(metric.target.difference)}</span>
                    {showSeparateMonthlyTarget ? (
                      <span className="truncate" title={`月目标 ${metric.target.totalTarget}`}>月目标 {compactTargetValue(metric.target.totalTarget)}</span>
                    ) : <span>{targetPeriodLabel}</span>}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-auto border-t border-slate-100 pt-2.5 text-[10px] font-medium text-slate-400">
                {emptyTargetLabel}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function V2HomeMetricSettings({
  metrics,
  visibleKeys,
  order,
  onVisibleKeysChange,
  onOrderChange,
  seriesOptions,
  selectedSeriesIds,
  onSelectedSeriesIdsChange,
  onReset,
  onClose,
}: {
  metrics: V2HomeMetricCard[];
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
  onVisibleKeysChange: (keys: V2HomeMetricKey[]) => void;
  onOrderChange: (order: V2HomeMetricKey[]) => void;
  seriesOptions?: V2HomeSeriesOption[];
  selectedSeriesIds?: string[];
  onSelectedSeriesIdsChange?: (seriesIds: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const metricsByKey = new Map(metrics.map((metric) => [metric.metricKey, metric]));
  const move = (metricKey: V2HomeMetricKey, direction: -1 | 1) => {
    const index = order.indexOf(metricKey);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onOrderChange(next);
  };

  const toggle = (metricKey: V2HomeMetricKey) => {
    if (visibleKeys.includes(metricKey)) {
      if (visibleKeys.length === 1) return;
      onVisibleKeysChange(visibleKeys.filter((key) => key !== metricKey));
      return;
    }
    onVisibleKeysChange([...visibleKeys, metricKey]);
  };

  const toggleSeries = (seriesId: string) => {
    if (!onSelectedSeriesIdsChange) return;
    const current = selectedSeriesIds ?? [];
    if (current.includes(seriesId)) {
      onSelectedSeriesIdsChange(current.filter((id) => id !== seriesId));
      return;
    }
    if (current.length >= MAX_HOME_SERIES) return;
    onSelectedSeriesIdsChange([...current, seriesId]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 sm:items-stretch sm:justify-end" role="presentation">
      <section
        aria-label="指标显示与排序"
        aria-modal="true"
        className="flex max-h-[88vh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none"
        data-testid="v2-home-metric-settings"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">指标设置</h2>
            <p className="mt-0.5 text-xs text-slate-500">指标与首页系列仅保存在当前品牌浏览器</p>
          </div>
          <button
            aria-label="关闭指标设置"
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            title="关闭"
            type="button"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-3">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <h3 className="text-xs font-semibold text-slate-800">经营指标</h3>
              <span className="text-[11px] text-slate-400">{visibleKeys.length}/{order.length}</span>
            </div>
            {order.map((metricKey, index) => {
            const metric = metricsByKey.get(metricKey);
            if (!metric) return null;
            return (
              <div key={metricKey} className="flex items-center gap-3 border-b border-slate-100 px-2 py-2.5 last:border-0">
                <input
                  aria-label={`显示${metric.title}`}
                  checked={visibleKeys.includes(metricKey)}
                  onChange={() => toggle(metricKey)}
                  type="checkbox"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{metric.title}</span>
                <button
                  aria-label={`上移${metric.title}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => move(metricKey, -1)}
                  title="上移"
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`下移${metric.title}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  disabled={index === order.length - 1}
                  onClick={() => move(metricKey, 1)}
                  title="下移"
                  type="button"
                >
                  ↓
                </button>
              </div>
            );
            })}
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3 px-2 pb-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-800">首页系列</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">勾选后在经营指标下方同时展示，最多 5 个。</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                {(selectedSeriesIds ?? []).length}/{MAX_HOME_SERIES}
              </span>
            </div>
            {(seriesOptions ?? []).length === 0 ? (
              <a className="mx-2 mt-2 block rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-medium text-blue-700" href="/v2/series-board">
                暂无系列，前往系列中心创建
              </a>
            ) : (seriesOptions ?? []).map((series) => {
              const checked = (selectedSeriesIds ?? []).includes(series.id);
              const disabled = !checked && (selectedSeriesIds ?? []).length >= MAX_HOME_SERIES;
              return (
                <label key={series.id} className={`flex items-center gap-3 border-b border-slate-100 px-2 py-2.5 last:border-0 ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}>
                  <input aria-label={`首页展示${series.label}`} checked={checked} disabled={disabled} onChange={() => toggleSeries(series.id)} type="checkbox" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{series.label}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{series.productCount} 个商品</span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={onReset} type="button">
            恢复默认
          </button>
          <button className="primary-button" onClick={onClose} type="button">完成</button>
        </div>
      </section>
    </div>
  );
}
