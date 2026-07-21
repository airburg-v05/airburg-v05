"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandModelFilterPopover } from "@/components/visual-system/v1/brand-model-filter-popover";
import type { BrandModelFilter } from "@/lib/bi/search-keyword.types";
import {
  loadCrossPageDebugContext,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";
import {
  debugDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";

const EMPTY_FILTER: BrandModelFilter = {
  brandWords: [],
  modelWords: [],
  centerWordGroups: [],
};

const hasSearchAssetConfig = (filter: BrandModelFilter): boolean =>
  filter.brandWords.length > 0 || (filter.centerWordGroups?.length ?? 0) > 0 || filter.modelWords.length > 0;

const summaryTimestamp = (updatedAt: string | null): string =>
  updatedAt ? new Date(updatedAt).toLocaleString("zh-CN", { hour12: false }) : "--";

export function V2SearchAssetsWorkspace() {
  const { brand, hydrated } = useBrandWorkspace();
  const databaseName = debugDatabaseNameForBrand(brand.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<BrandModelFilter>(EMPTY_FILTER);
  const [loadedDatabaseName, setLoadedDatabaseName] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadCrossPageDebugContext({ databaseName }).then((result) => {
      if (cancelled) return;
      setLoadedDatabaseName(databaseName);
      if (result.status === "ok") {
        setFilter(result.snapshot.brandModelFilter);
        setUpdatedAt(result.snapshot.updatedAt);
        setError(null);
        setLoading(false);
        return;
      }
      if (result.status === "empty") {
        setFilter(EMPTY_FILTER);
        setUpdatedAt(null);
        setError(null);
        setLoading(false);
        return;
      }
      setError("当前浏览器暂时无法读取搜索资产配置。");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [databaseName, hydrated]);

  const saveFilter = useCallback(async (nextFilter: BrandModelFilter) => {
    setSaving(true);
    setError(null);
    const result = await saveCrossPageDebugContextPatch({
      brandModelFilter: nextFilter,
      centerWordGroups: nextFilter.centerWordGroups,
    }, { databaseName });
    if (result.status !== "saved") {
      setSaving(false);
        setError("搜索资产保存失败：请刷新后重试。");
      return;
    }
    setFilter(result.snapshot.brandModelFilter);
    setUpdatedAt(result.snapshot.updatedAt);
    setSaving(false);
    setEditorOpen(false);
  }, [databaseName]);

  const clearFilter = useCallback(async () => {
    await saveFilter(EMPTY_FILTER);
  }, [saveFilter]);

  const configuredCenterGroups = useMemo(
    () => (filter.centerWordGroups ?? []).filter((group) => group.aliases.length > 0),
    [filter.centerWordGroups],
  );

  if (!hydrated || loadedDatabaseName !== databaseName || loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">正在读取当前浏览器中的搜索资产上下文…</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="v2-search-assets-workspace">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="mt-3 text-base font-semibold text-slate-950">品牌词 / 中心词搜索资产</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              维护品牌词、中心词分组及其别名；保存后会被首页、系列看板和商品看板里的搜索相关指标共同复用。
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              最近更新时间：{summaryTimestamp(updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="secondary-button" onClick={() => setEditorOpen(true)} type="button">
              {hasSearchAssetConfig(filter) ? "编辑搜索资产" : "开始配置"}
            </button>
            <button
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || !hasSearchAssetConfig(filter)}
              onClick={() => {
                void clearFilter();
              }}
              type="button"
            >
              清空
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">当前生效的品牌词</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {filter.brandWords.length} 个
            </span>
          </div>
          {filter.brandWords.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没有配置品牌词。配置后，搜索相关指标会按当前词表归因。
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {filter.brandWords.map((word) => (
                <span key={word} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                  {word}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">影响范围</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 首页的品牌词访客、品牌词支付人数等搜索相关指标使用当前配置。</li>
            <li>• 系列看板与商品看板的品牌 / 中心词对比口径沿用同一配置。</li>
            <li>• 只保存词表配置，不写原始搜索明细，也不改已有统计口径。</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">中心词 / 型号词分组</h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {configuredCenterGroups.length} 组
            </span>
          </div>
          {configuredCenterGroups.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没有保存任何中心词分组。可通过“编辑搜索资产”维护 P1、P2、P300、ZEN 等分组。
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {configuredCenterGroups.map((group) => (
                <article key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{group.centerWord}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    别名：{group.aliases.join("、")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-950">暂未开放的效果看板</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 当前已开放词表维护与保存。</li>
            <li>• 分组效果排行、品牌词支付占比明细等结果看板暂未开放。</li>
            <li>• 效果结果表将在数据支撑完整后开放。</li>
          </ul>
        </div>
      </section>

      {editorOpen ? (
        <BrandModelFilterPopover
          onClear={() => {
            void clearFilter();
          }}
          onClose={() => {
            if (!saving) setEditorOpen(false);
          }}
          onSave={(nextFilter) => {
            void saveFilter(nextFilter);
          }}
          testId="v2-search-assets-filter-popover"
          value={filter}
        />
      ) : null}
    </div>
  );
}
