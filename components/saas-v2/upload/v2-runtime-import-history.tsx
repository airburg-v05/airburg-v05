"use client";

import { useEffect, useState } from "react";
import {
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
} from "@/lib/persistence/runtime-dataset-persistence";
import type { RuntimeDatasetSnapshotSummary } from "@/lib/persistence/runtime-dataset-persistence.types";
import {
  runtimeDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";

const formatTime = (value: string): string =>
  new Date(value).toLocaleString("zh-CN", { hour12: false });

export function V2RuntimeImportHistory() {
  const { brand, hydrated } = useBrandWorkspace();
  const databaseName = runtimeDatabaseNameForBrand(brand.id);
  const [snapshots, setSnapshots] = useState<RuntimeDatasetSnapshotSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadedBrandId, setLoadedBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.all([
      listRuntimeDatasetSnapshots({ brandId: brand.id, databaseName }),
      loadActiveRuntimeDatasetSnapshot({ brandId: brand.id, databaseName }),
    ]).then(([history, active]) => {
      if (cancelled) return;
      setSnapshots(history.status === "ok" ? history.snapshots : []);
      setActiveId(active.status === "ok" ? active.snapshot.activeDatasetId : null);
      setLoadedBrandId(brand.id);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, databaseName, hydrated]);

  if (!hydrated || loadedBrandId !== brand.id || snapshots === null) {
    return <div className="flex min-h-[52vh] items-center justify-center text-sm text-slate-500">正在读取导入历史…</div>;
  }
  if (snapshots.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-slate-950">{brand.name} 暂无导入快照</h2>
        <p className="mt-2 text-sm text-slate-500">完成一次批量上传后，这里会保留安全聚合快照的审计信息。</p>
        <a className="primary-button mt-5" href="/v2/upload">前往数据接入</a>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-runtime-import-history">
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-base font-semibold text-slate-950">{brand.name} 安全聚合快照</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">仅当前活动快照进入经营看板；历史快照不参与计算，也不保存原始文件名或明细行。</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">更新时间</th>
              <th className="px-4 py-3">日期范围</th>
              <th className="px-4 py-3">导入策略</th>
              <th className="px-4 py-3">文件</th>
              <th className="px-4 py-3">去重</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr key={snapshot.activeDatasetId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{formatTime(snapshot.updatedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{snapshot.dateRange.startDate ?? "unknown"} 至 {snapshot.dateRange.endDate ?? "unknown"}</td>
                <td className="px-4 py-3 text-slate-600">{snapshot.mergeMode ?? "unknown"}</td>
                <td className="px-4 py-3 text-slate-600">成功 {snapshot.importSummary.filesParsed} / 失败 {snapshot.importSummary.filesFailed}</td>
                <td className="px-4 py-3 text-slate-600">{snapshot.importSummary.dedupedRecords}</td>
                <td className="px-4 py-3">
                  <span className={snapshot.activeDatasetId === activeId ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700" : "text-xs text-slate-400"}>
                    {snapshot.activeDatasetId === activeId ? "当前活动" : "仅审计"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
