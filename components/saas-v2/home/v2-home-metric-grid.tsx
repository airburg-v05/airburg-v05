"use client";

import type { V2HomeMetricCard, V2HomeMetricKey } from "@/types/v2/home";

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
}: {
  metrics: V2HomeMetricCard[];
  visibleKeys: V2HomeMetricKey[];
  order: V2HomeMetricKey[];
  selectedMetricKey: V2HomeMetricKey;
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
      className="grid min-w-0 grid-cols-2 border-t border-slate-100 max-[340px]:grid-cols-1 min-[900px]:grid-cols-4 min-[1100px]:grid-cols-5 min-[1320px]:grid-cols-6"
      data-testid="v2-home-metric-grid"
    >
      {visible.map((metric) => {
        const selected = metric.metricKey === selectedMetricKey;
        const note = shortMetricNote(metric);
        const showTargetDetail = hasHomeTargetDetail(metric);
        return (
          <article
            key={metric.metricKey}
            aria-label={showTargetDetail
              ? `${metric.title}，当前值 ${metric.actual}，MTD目标 ${metric.target.mtdTarget}，总目标 ${metric.target.totalTarget}，差值 ${metric.target.difference}，完成率 ${metric.target.completionRate}`
              : `${metric.title}，当前值 ${metric.actual}，未设置目标`}
            className={`flex min-h-[136px] min-w-0 flex-col border-b border-r border-t-[3px] border-slate-100 px-3.5 pb-3 pt-2.5 transition-colors ${
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

            {showTargetDetail ? (
              <>
                <dl className="mt-3 grid grid-cols-3 gap-x-1 text-[10px]">
                  <div className="min-w-0" title={`MTD目标 ${metric.target.mtdTarget}`}>
                    <dt className="text-slate-400">MTD</dt>
                    <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700">
                      <span aria-hidden="true">{compactTargetValue(metric.target.mtdTarget)}</span>
                      <span className="sr-only">{metric.target.mtdTarget}</span>
                    </dd>
                  </div>
                  <div className="min-w-0" title={`总目标 ${metric.target.totalTarget}`}>
                    <dt className="text-slate-400">目标</dt>
                    <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700">
                      <span aria-hidden="true">{compactTargetValue(metric.target.totalTarget)}</span>
                      <span className="sr-only">{metric.target.totalTarget}</span>
                    </dd>
                  </div>
                  <div className="min-w-0" title={`差值 ${metric.target.difference}`}>
                    <dt className="text-slate-400">差值</dt>
                    <dd className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-700">
                      <span aria-hidden="true">{compactTargetValue(metric.target.difference)}</span>
                      <span className="sr-only">{metric.target.difference}</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-auto">
                  <div className="flex items-center justify-end text-[11px]">
                    <span className="sr-only">完成率</span>
                    <span className="font-semibold tabular-nums text-slate-600">{metric.target.completionRate}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    {metric.target.progress !== null ? (
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${metric.target.progress}%` }} />
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-auto rounded-md bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-500">
                未设置目标
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
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/30 sm:items-stretch sm:justify-end" role="presentation">
      <section
        aria-label="指标显示与排序"
        aria-modal="true"
        className="flex max-h-[88vh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-sm sm:rounded-none"
        data-testid="v2-home-metric-settings"
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">指标设置</h2>
            <p className="mt-0.5 text-xs text-slate-500">当前排序仅保存在本浏览器会话</p>
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
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
