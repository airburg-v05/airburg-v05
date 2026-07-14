"use client";

import type { V2HomeMetricCard, V2HomeMetricKey } from "@/types/v2/home";

export function V2HomeMetricGrid({
  metrics,
  visibleKeys,
  order,
}: {
  metrics: V2HomeMetricCard[];
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
}) {
  const cardsByKey = new Map(metrics.map((metric) => [metric.metricKey, metric]));
  const visible = order
    .filter((metricKey) => visibleKeys.includes(metricKey))
    .map((metricKey) => cardsByKey.get(metricKey))
    .filter((metric): metric is V2HomeMetricCard => Boolean(metric));

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        请在指标设置中至少选择一个指标。
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="v2-home-metric-grid">
      {visible.map((metric) => (
        <article
          key={metric.metricKey}
          className="flex min-h-36 min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          data-metric-key={metric.metricKey}
        >
          <div className="flex min-w-0 items-start justify-between gap-2">
            <h3 className="min-w-0 break-words text-sm font-semibold text-slate-800">{metric.title}</h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-400">{metric.unit}</span>
              {metric.note ? (
                <span
                  aria-label={metric.note}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 text-[10px] font-bold text-slate-400"
                  role="img"
                  title={metric.note}
                >
                  i
                </span>
              ) : null}
            </div>
          </div>
          <p className="mt-2 truncate text-2xl font-semibold text-slate-950" title={metric.actual}>
            {metric.actual}
          </p>
          <dl className="mt-3 grid grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)] gap-x-1.5 gap-y-2 text-[11px]">
            <div className="min-w-0">
              <dt className="text-slate-400">MTD目标</dt>
              <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700" title={metric.target.mtdTarget}>{metric.target.mtdTarget}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-slate-400">总目标</dt>
              <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700" title={metric.target.totalTarget}>{metric.target.totalTarget}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-slate-400">差值</dt>
              <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700" title={metric.target.difference}>{metric.target.difference}</dd>
            </div>
          </dl>
          <div className="mt-auto pt-3">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400">完成率</span>
              <span className="font-semibold text-slate-700">{metric.target.completionRate}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              {metric.target.progress !== null ? (
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${metric.target.progress}%` }}
                />
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function V2HomeMetricSettings({
  metrics,
  visibleKeys,
  order,
  onVisibleKeysChange,
  onOrderChange,
  onReset,
  onClose,
}: {
  metrics: V2HomeMetricCard[];
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
  onVisibleKeysChange: (keys: V2HomeMetricKey[]) => void;
  onOrderChange: (order: V2HomeMetricKey[]) => void;
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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-4" role="presentation">
      <section
        aria-label="指标显示与排序"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl"
        data-testid="v2-home-metric-settings"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">指标设置</h2>
            <p className="mt-0.5 text-xs text-slate-500">默认展示全部 17 项；当前排序仅保存在本浏览器会话。</p>
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
        <div className="max-h-[65vh] overflow-y-auto p-3">
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
