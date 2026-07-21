"use client";

import { useEffect, useState } from "react";
import { clearRuntimeBIDataSet } from "@/lib/etl/runtime";
import { loadActiveRuntimeDatasetSnapshot } from "@/lib/persistence/runtime-dataset-persistence";
import {
  createBrandWorkspace,
  loadBrandWorkspaceState,
  runtimeDatabaseNameForBrand,
  setActiveBrandWorkspace,
} from "@/lib/v2/workspace/brand-workspace";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";
import type { RuntimeDatasetSnapshotSummary } from "@/lib/persistence/runtime-dataset-persistence.types";

const formatTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未上传";

export function V2BrandSettingsWorkspace() {
  const { state, brand: active, hydrated } = useBrandWorkspace();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [dataset, setDataset] = useState<RuntimeDatasetSnapshotSummary | null>(null);
  const [datasetBrandId, setDatasetBrandId] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadActiveRuntimeDatasetSnapshot({
      brandId: active.id,
      databaseName: runtimeDatabaseNameForBrand(active.id),
    }).then((result) => {
      if (cancelled) return;
      setDataset(result.status === "ok" ? result.snapshot : null);
      setDatasetBrandId(active.id);
    });
    return () => {
      cancelled = true;
    };
  }, [active.id, hydrated]);

  const switchBrand = (brandId: string) => {
    const next = setActiveBrandWorkspace(brandId, loadBrandWorkspaceState());
    if (!next) return;
    clearRuntimeBIDataSet();
    setMessage("已切换品牌工作区。经营数据、目标、系列和搜索资产会按品牌隔离读取。");
  };

  const addBrand = () => {
    const result = createBrandWorkspace(name, loadBrandWorkspaceState());
    if (result.status === "invalid") {
      setMessage("请输入品牌名称。");
      return;
    }
    if (result.status === "duplicate") {
      setMessage("该品牌名称已存在。");
      return;
    }
    if (result.status !== "created") return;
    clearRuntimeBIDataSet();
    setName("");
    setMessage(`已创建并切换到“${result.brand.name}”。`);
  };

  return (
    <div className="space-y-4" data-testid="v2-brand-settings-workspace">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div>
            <h2 className="text-base font-semibold text-slate-950">品牌工作区</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              每个品牌拥有独立的经营数据、目标、系列和搜索配置。切换品牌不会把另一个品牌的数据带入当前驾驶舱。
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-amber-700">
              当前版本隔离范围是本浏览器工作区；账号、组织与云端租户模型尚未接入，不能据此认定多用户 SaaS 已完成。
            </p>
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p><span className="font-semibold text-slate-900">当前品牌：</span>{active.name}</p>
              <p className="mt-1"><span className="font-semibold text-slate-900">经营数据更新：</span>{formatTime(datasetBrandId === active.id ? dataset?.updatedAt ?? null : null)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="text-xs font-semibold text-slate-500" htmlFor="v2-new-brand-name">新增品牌</label>
            <input
              id="v2-new-brand-name"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="输入品牌名称"
              value={name}
            />
            <button className="primary-button mt-3 w-full justify-center" disabled={!hydrated} onClick={addBrand} type="button">创建品牌工作区</button>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm font-medium text-blue-700">{message}</p> : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">已配置品牌</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {state.brands.map((brand) => {
            const selected = brand.id === state.activeBrandId;
            return (
              <div key={brand.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{brand.name}</p>
                  <p className="mt-1 text-xs text-slate-500">创建时间 {formatTime(brand.createdAt)}</p>
                </div>
                <button
                  className={selected ? "rounded-md bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700" : "secondary-button"}
                  disabled={selected || !hydrated}
                  onClick={() => switchBrand(brand.id)}
                  type="button"
                >
                  {selected ? "当前品牌" : "切换到此品牌"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
