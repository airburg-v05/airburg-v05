"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { loadActiveBrandRuntimeV2Dataset } from "@/lib/v2/runtime/runtime-v2-dataset";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";
import {
  MAX_HOME_SERIES,
  createBrandSeriesId,
  loadBrandSeries,
  saveBrandSeries,
  type BrandSeriesProductRef,
  type BrandSeriesRecord,
} from "@/lib/v2/workspace/brand-series";

interface ProductOption extends BrandSeriesProductRef {
  key: string;
  name: string;
  scopeLabel: string;
}

interface V2BrandSeriesManagerProps {
  selectedSeriesId: string | null;
  selectedPlatform: string | null;
  selectedStoreIds: string[];
  onChange: () => void;
  onSelectSeries: (seriesId: string) => void;
  children?: ReactNode;
}

interface EditorDraft {
  seriesId: string | null;
  name: string;
  productIds: string;
  showOnHome: boolean;
}

const refKey = (ref: BrandSeriesProductRef): string =>
  `${ref.platformCode}::${ref.storeId}::${ref.productId}`;

const parseProductIds = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\s,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const emptyDraft = (showOnHome: boolean): EditorDraft => ({
  seriesId: null,
  name: "",
  productIds: "",
  showOnHome,
});

export function V2BrandSeriesManager({
  selectedSeriesId,
  selectedPlatform,
  selectedStoreIds,
  onChange,
  onSelectSeries,
  children,
}: V2BrandSeriesManagerProps) {
  const { brand, hydrated } = useBrandWorkspace();
  const [series, setSeries] = useState<BrandSeriesRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsBrandId, setProductsBrandId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const nextSeries = loadBrandSeries(brand.id);
      setSeries(nextSeries);
      setDraft(null);
      setMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadActiveBrandRuntimeV2Dataset(brand.id).then((result) => {
      if (cancelled) return;
      if (result.status !== "ready") {
        setProducts([]);
        setProductsBrandId(brand.id);
        return;
      }
      const storeNames = new Map(
        result.dataset.stores.map((store) => [`${store.platformCode}::${store.storeId}`, store.storeName]),
      );
      const platformNames = new Map(
        result.dataset.platforms.map((platform) => [platform.platformCode, platform.platformName]),
      );
      setProducts(
        result.dataset.trackedProducts
          .filter((product) => product.status === "active")
          .map((product) => ({
            key: `${product.platformCode}::${product.storeId}::${product.productId}`,
            platformCode: product.platformCode,
            storeId: product.storeId,
            productId: product.productId,
            name: product.displayName?.trim() || product.productId,
            scopeLabel: `${platformNames.get(product.platformCode) || product.platformCode} · ${storeNames.get(`${product.platformCode}::${product.storeId}`) || product.storeId}`,
          })),
      );
      setProductsBrandId(brand.id);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated]);

  const activeProducts = useMemo(
    () => productsBrandId === brand.id ? products : [],
    [brand.id, products, productsBrandId],
  );
  const homeCount = series.filter((item) => item.showOnHome).length;
  const visibleSeries = useMemo(() => series.filter((item) => {
    if (!selectedPlatform) return true;
    if (item.productRefs.length === 0) return true;
    return item.productRefs.some((ref) =>
      ref.platformCode === selectedPlatform &&
      (selectedStoreIds.length === 0 || selectedStoreIds.includes(ref.storeId)),
    );
  }), [selectedPlatform, selectedStoreIds, series]);

  const resolution = useMemo(() => {
    const ids = parseProductIds(draft?.productIds ?? "");
    const refs: BrandSeriesProductRef[] = [];
    const missing: string[] = [];
    const multiScope: string[] = [];
    ids.forEach((productId) => {
      const matches = activeProducts.filter((product) => product.productId === productId);
      if (matches.length === 0) {
        missing.push(productId);
        return;
      }
      if (matches.length > 1) multiScope.push(productId);
      matches.forEach((product) => {
        const ref = {
          platformCode: product.platformCode,
          storeId: product.storeId,
          productId: product.productId,
        };
        if (!refs.some((item) => refKey(item) === refKey(ref))) refs.push(ref);
      });
    });
    return { ids, refs, missing, multiScope };
  }, [activeProducts, draft?.productIds]);

  const persist = (next: BrandSeriesRecord[]) => {
    const saved = saveBrandSeries(brand.id, next);
    setSeries(saved);
    onChange();
    return saved;
  };

  const openCreate = () => {
    setDraft(emptyDraft(homeCount < MAX_HOME_SERIES));
    setMessage(null);
  };

  const openEdit = (record: BrandSeriesRecord) => {
    setDraft({
      seriesId: record.seriesId,
      name: record.name,
      productIds: Array.from(new Set(record.productRefs.map((ref) => ref.productId))).join("\n"),
      showOnHome: record.showOnHome,
    });
    setMessage(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setMessage("请输入系列名称。");
      return;
    }
    if (series.some((item) => item.seriesId !== draft.seriesId && item.name.toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"))) {
      setMessage("该系列名称已存在。");
      return;
    }
    if (resolution.ids.length === 0) {
      setMessage("请粘贴至少一个商品 ID。");
      return;
    }
    if (resolution.missing.length > 0) {
      setMessage(`以下商品 ID 未在当前品牌数据中找到：${resolution.missing.join("、")}`);
      return;
    }
    if (resolution.refs.length === 0) {
      setMessage("没有可绑定的商品，请检查商品 ID。");
      return;
    }
    const existing = series.find((item) => item.seriesId === draft.seriesId) ?? null;
    const otherHomeCount = series.filter((item) => item.showOnHome && item.seriesId !== draft.seriesId).length;
    if (draft.showOnHome && otherHomeCount >= MAX_HOME_SERIES) {
      setMessage(`驾驶舱最多展示 ${MAX_HOME_SERIES} 个系列，请先取消一个已展示系列。`);
      return;
    }
    const now = new Date().toISOString();
    const record: BrandSeriesRecord = {
      seriesId: existing?.seriesId ?? createBrandSeriesId(),
      name,
      productRefs: resolution.refs,
      showOnHome: draft.showOnHome,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    persist(existing
      ? series.map((item) => item.seriesId === record.seriesId ? record : item)
      : [...series, record]);
    setDraft(null);
    setMessage(
      resolution.multiScope.length > 0
        ? `已保存“${name}”；${resolution.multiScope.join("、")} 在多个店铺命中，已全部绑定。`
        : `已保存“${name}”，共绑定 ${resolution.refs.length} 个商品。`,
    );
    onSelectSeries(record.seriesId);
  };

  const removeSeries = (record: BrandSeriesRecord) => {
    if (!window.confirm(`确认删除系列“${record.name}”？经营事实数据不会被删除。`)) return;
    const saved = persist(series.filter((item) => item.seriesId !== record.seriesId));
    setDraft((current) => current?.seriesId === record.seriesId ? null : current);
    setMessage("系列已删除；经营事实数据未受影响。");
    if (selectedSeriesId === record.seriesId && saved[0]) onSelectSeries(saved[0].seriesId);
  };

  return (
    <>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-brand-series-manager">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">系列维护</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
            {series.length} 个 · 驾驶舱 {homeCount}/{MAX_HOME_SERIES}
          </span>
        </div>
        <button className="primary-button px-3 py-1.5 text-xs" onClick={openCreate} type="button">新建系列</button>
      </div>

      {draft ? (
        <div className="border-t border-slate-100 bg-slate-50/45 p-4" data-testid="v2-series-editor">
          <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_auto] lg:items-start">
            <label className="text-xs font-semibold text-slate-500">
              系列名称
              <input
                className="form-input mt-1.5"
                maxLength={40}
                onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)}
                placeholder="例如：P1 经典系列"
                value={draft.name}
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              商品 ID
              <textarea
                className="form-input mt-1.5 min-h-24 resize-y font-mono text-xs leading-5"
                onChange={(event) => setDraft((current) => current ? { ...current, productIds: event.target.value } : current)}
                placeholder="每行一个商品 ID，也支持逗号或空格分隔"
                value={draft.productIds}
              />
              <span className="mt-1 block font-normal text-slate-400">
                已识别 {resolution.ids.length} 个 ID · 可绑定 {resolution.refs.length} 个商品
              </span>
            </label>
            <div className="flex flex-col gap-2 lg:pt-6">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  checked={draft.showOnHome}
                  onChange={(event) => setDraft((current) => current ? { ...current, showOnHome: event.target.checked } : current)}
                  type="checkbox"
                />
                驾驶舱可筛选
              </label>
              <button className="primary-button justify-center" onClick={saveDraft} type="button">加载并绑定</button>
              <button className="secondary-button justify-center" onClick={() => setDraft(null)} type="button">取消</button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-blue-700">{message}</p> : null}

    </section>

    {children}

    <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="v2-series-library">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">系列列表</h3>
            <p className="mt-0.5 text-xs text-slate-500">当前平台范围内按系列整齐展示；右上角可编辑或删除。</p>
          </div>
        </div>
        {visibleSeries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-7 text-center text-sm text-slate-500">
            当前范围尚未创建系列
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSeries.map((record) => (
              <article
                key={record.seriesId}
                className={`rounded-lg border p-3 transition ${record.seriesId === selectedSeriesId ? "border-blue-300 bg-blue-50/45" : "border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => onSelectSeries(record.seriesId)} type="button">
                    <span className="block truncate text-sm font-semibold text-slate-900">{record.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{record.productRefs.length} 个商品</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
                    <button className="text-blue-700 hover:text-blue-900" onClick={() => openEdit(record)} type="button">编辑</button>
                    <button className="text-rose-600 hover:text-rose-800" onClick={() => removeSeries(record)} type="button">删除</button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>{record.showOnHome ? "驾驶舱可筛选" : "仅系列中心"}</span>
                  <span>{record.productRefs.length > 0 ? `${new Set(record.productRefs.map((ref) => ref.storeId)).size} 个店铺` : "待绑定"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
    </section>
    </>
  );
}
