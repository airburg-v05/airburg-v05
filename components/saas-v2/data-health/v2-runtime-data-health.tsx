"use client";

import { useEffect, useState } from "react";
import {
  clearAllRuntimeDatasetSnapshots,
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
} from "@/lib/persistence/runtime-dataset-persistence";
import type {
  RuntimeDatasetSnapshot,
  RuntimeDatasetSnapshotSummary,
} from "@/lib/persistence/runtime-dataset-persistence.types";
import { clearRuntimeBIDataSet } from "@/lib/etl/runtime";
import {
  runtimeDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";

const SOURCE_LABELS: Record<string, string> = {
  product_dimension: "商品基础信息",
  product_metric: "商品经营",
  plan_metric: "推广计划",
  search_total: "总搜索词",
  search_product: "商品搜索词",
  after_sales: "售后退货",
};

const formatTime = (value: string): string =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });

const shortId = (value: string): string =>
  value.length > 26 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value;

const strategyLabel = (mergeMode: RuntimeDatasetSnapshot["mergeMode"]): string => {
  if (mergeMode === "replace") return "替换导入：活动快照不继承此前经营事实";
  if (mergeMode === "append") return "追加导入：活动快照包含此前数据与本次数据，已执行去重";
  return "导入策略 unknown：旧快照未记录替换或追加证据";
};

export function V2RuntimeDataHealth() {
  const { brand, hydrated } = useBrandWorkspace();
  const databaseName = runtimeDatabaseNameForBrand(brand.id);
  const [active, setActive] = useState<RuntimeDatasetSnapshot | null>(null);
  const [history, setHistory] = useState<RuntimeDatasetSnapshotSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [loadedBrandId, setLoadedBrandId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.all([
      loadActiveRuntimeDatasetSnapshot({ brandId: brand.id, databaseName }),
      listRuntimeDatasetSnapshots({ brandId: brand.id, databaseName }),
    ]).then(([activeResult, historyResult]) => {
      if (cancelled) return;
      setHistory(historyResult.status === "ok" ? historyResult.snapshots : []);
      if (activeResult.status === "ok") {
        setActive(activeResult.snapshot);
        setStatus("ready");
      } else if (activeResult.status === "empty") {
        setActive(null);
        setStatus("empty");
      } else {
        setActive(null);
        setStatus("error");
      }
      setLoadedBrandId(brand.id);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, databaseName, hydrated, revision]);

  const clearBrandData = async () => {
    if (!window.confirm(`确认清空“${brand.name}”在当前浏览器中的全部安全聚合快照？此操作不会删除原始报表文件。`)) return;
    const result = await clearAllRuntimeDatasetSnapshots({ brandId: brand.id, databaseName });
    if (result.status === "cleared") {
      clearRuntimeBIDataSet();
      setMessage("当前品牌的活动快照与历史安全聚合快照已清空。");
      setLoadedBrandId(null);
      setRevision((current) => current + 1);
    } else {
      setMessage("清空失败，请刷新后重试。");
    }
  };

  if (!hydrated || loadedBrandId !== brand.id || status === "loading") {
    return <div className="flex min-h-[52vh] items-center justify-center text-sm text-slate-500">正在读取当前品牌数据健康状态…</div>;
  }
  if (status === "error") {
    return (
      <section className="rounded-xl border border-rose-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-950">当前品牌数据状态不可安全读取</h2>
        <p className="mt-2 text-sm text-slate-600">没有证据时不推断数据可用，请返回数据接入重新检查。</p>
      </section>
    );
  }
  if (status === "empty" || !active) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-950">{brand.name} 暂无活动经营快照</h2>
        <p className="mt-2 text-sm text-slate-500">数据健康与经营驾驶舱读取同一品牌活动快照，因此不会再出现首页有数据而此页无批次的分叉。</p>
        <a className="primary-button mt-5" href="/v2/upload">前往数据接入</a>
        {message ? <p className="mt-3 text-sm font-medium text-blue-700">{message}</p> : null}
      </section>
    );
  }

  const coverage = Object.entries(active.sourceCoverage);
  const issueCount = active.safeIssues.reduce((sum, issue) => sum + issue.safeCount, 0);

  return (
    <div className="space-y-5" data-testid="v2-runtime-data-health">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950">{brand.name} 活动数据快照</h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">与全部 V2 看板同源</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{strategyLabel(active.mergeMode)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="secondary-button" href="/v2/upload">继续导入</a>
            <button className="secondary-button text-rose-700" onClick={() => void clearBrandData()} type="button">清空当前品牌数据</button>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">数据范围</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{active.dateRange.startDate ?? "unknown"} 至 {active.dateRange.endDate ?? "unknown"}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">更新时间</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{formatTime(active.updatedAt)}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">文件处理</dt><dd className="mt-1 text-sm font-semibold text-slate-900">成功 {active.importSummary.filesParsed} · 失败 {active.importSummary.filesFailed}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">安全去重</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{active.importSummary.dedupedRecords}</dd></div>
          <div className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">安全提示</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{issueCount}</dd></div>
        </dl>
        {message ? <p className="mt-4 text-sm font-medium text-blue-700">{message}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">来源覆盖</h2>
        <p className="mt-1 text-sm text-slate-500">缺失来源不等于导入失败，只表示相应指标可能无法计算。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {coverage.map(([sourceType, item]) => (
            <article key={sourceType} className={`rounded-xl border p-4 ${item.present ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{SOURCE_LABELS[sourceType] ?? sourceType}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.present ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{item.present ? "已接入" : "缺失"}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">安全聚合记录 {item.rowCount}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">安全问题代码</h2>
        {active.safeIssues.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">当前活动快照没有安全问题代码。</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
            {active.safeIssues.map((issue) => (
              <div key={`${issue.code}:${issue.sourceType}:${issue.level}`} className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-0 sm:grid-cols-[minmax(0,1fr)_9rem_6rem]">
                <span className="break-all font-mono text-xs text-slate-700">{issue.code}</span>
                <span className="text-slate-500">{SOURCE_LABELS[issue.sourceType] ?? issue.sourceType}</span>
                <span className={issue.level === "error" ? "font-semibold text-rose-700" : "font-semibold text-amber-700"}>{issue.safeCount} 条</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">快照审计</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">只有标记为“当前活动”的快照参与看板计算；其它快照仅用于本浏览器审计，不会混入当前结果。</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {history.map((snapshot) => (
            <div key={snapshot.activeDatasetId} className="grid gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-0 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_8rem]">
              <span className="font-mono text-xs text-slate-700" title={snapshot.activeDatasetId}>{shortId(snapshot.activeDatasetId)}</span>
              <span className="text-slate-500">{formatTime(snapshot.updatedAt)}</span>
              <span className="text-slate-500">{snapshot.mergeMode ?? "unknown"}</span>
              <span className={snapshot.activeDatasetId === active.activeDatasetId ? "font-semibold text-emerald-700" : "text-slate-400"}>{snapshot.activeDatasetId === active.activeDatasetId ? "当前活动" : "仅审计"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
