"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeIssueCodeBadge } from "@/components/saas-v2/badges/safe-issue-code-badge";
import { BrandModelFilterPopover } from "@/components/visual-system/v1/brand-model-filter-popover";
import type { BrandModelFilter } from "@/lib/bi/search-keyword.types";
import {
  loadCrossPageDebugContext,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<BrandModelFilter>(EMPTY_FILTER);

  useEffect(() => {
    let cancelled = false;
    void loadCrossPageDebugContext().then((result) => {
      if (cancelled) return;
      if (result.status === "ok") {
        setFilter(result.snapshot.brandModelFilter);
        setUpdatedAt(result.snapshot.updatedAt);
        setLoading(false);
        return;
      }
      if (result.status === "empty") {
        setFilter(EMPTY_FILTER);
        setUpdatedAt(null);
        setLoading(false);
        return;
      }
      setError("当前浏览器无法读取跨页搜索资产上下文。");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveFilter = useCallback(async (nextFilter: BrandModelFilter) => {
    setSaving(true);
    setError(null);
    const result = await saveCrossPageDebugContextPatch({
      brandModelFilter: nextFilter,
      centerWordGroups: nextFilter.centerWordGroups,
    });
    if (result.status !== "saved") {
      setSaving(false);
      setError("搜索资产保存失败：当前浏览器上下文不可用。");
      return;
    }
    setFilter(result.snapshot.brandModelFilter);
    setUpdatedAt(result.snapshot.updatedAt);
    setSaving(false);
    setEditorOpen(false);
  }, []);

  const clearFilter = useCallback(async () => {
    await saveFilter(EMPTY_FILTER);
  }, [saveFilter]);

  const configuredCenterGroups = useMemo(
    () => (filter.centerWordGroups ?? []).filter((group) => group.aliases.length > 0),
    [filter.centerWordGroups],
  );

  if (loading) {
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
              当前页面已经接通真实可用的搜索资产配置：品牌词、中心词分组及其别名会保存在当前浏览器，并被
              首页、系列看板和商品看板里的搜索相关指标共同复用。
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
              当前还没有配置品牌词。此时品牌搜索相关指标会保持“暂无可用数据”或提示先配置搜索资产。
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
              当前还没有保存任何中心词分组。可通过“编辑搜索资产”复用现有品牌词 / 中心词弹层配置。
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
          <div className="flex flex-wrap gap-2">
            <SafeIssueCodeBadge code="BLOCKED_BY_MISSING_CONTRACT" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-slate-950">本轮明确不伪装完成的部分</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>• 跨品牌 / 系列 / 商品的搜索资产效果对比表，目前还没有稳定的数据支撑。</li>
            <li>• 别名组效果排行、品牌词支付占比表等结果页，目前也没有统一的保存与读取方案。</li>
            <li>• 因此本页只交付已经真实接通的“搜索资产配置面”，不再展示静态 mock 行数据。</li>
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
