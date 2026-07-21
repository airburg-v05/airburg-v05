"use client";

import { useEffect, useMemo, useState } from "react";
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
  platformLabel: string;
  storeName: string;
}

const refKey = (ref: BrandSeriesProductRef): string =>
  `${ref.platformCode}::${ref.storeId}::${ref.productId}`;

export function V2BrandSeriesManager({ onChange }: { onChange: () => void }) {
  const { brand, hydrated } = useBrandWorkspace();
  const [series, setSeries] = useState<BrandSeriesRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsBrandId, setProductsBrandId] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(series[0]?.seriesId ?? null);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const nextSeries = loadBrandSeries(brand.id);
      setSeries(nextSeries);
      setSelectedSeriesId(nextSeries[0]?.seriesId ?? null);
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
      setProducts(result.dataset.trackedProducts.map((product) => ({
        key: `${product.platformCode}::${product.storeId}::${product.productId}`,
        platformCode: product.platformCode,
        storeId: product.storeId,
        productId: product.productId,
        name: product.displayName?.trim() || product.productId,
        platformLabel: platformNames.get(product.platformCode) || product.platformCode,
        storeName: storeNames.get(`${product.platformCode}::${product.storeId}`) || product.storeId,
      })).sort((left, right) =>
        `${left.platformLabel}${left.storeName}${left.name}`.localeCompare(`${right.platformLabel}${right.storeName}${right.name}`, "zh-CN"),
      ));
      setProductsBrandId(brand.id);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated]);

  const selected = series.find((item) => item.seriesId === selectedSeriesId) ?? null;
  const selectedKeys = new Set(selected?.productRefs.map(refKey) ?? []);
  const visibleProducts = useMemo(() => {
    if (productsBrandId !== brand.id) return [];
    const keyword = search.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return products;
    return products.filter((product) =>
      `${product.name} ${product.productId} ${product.platformLabel} ${product.storeName}`
        .toLocaleLowerCase("zh-CN")
        .includes(keyword),
    );
  }, [brand.id, products, productsBrandId, search]);
  const homeCount = series.filter((item) => item.showOnHome).length;

  const persist = (next: BrandSeriesRecord[], nextSelectedId = selectedSeriesId) => {
    const saved = saveBrandSeries(brand.id, next);
    setSeries(saved);
    setSelectedSeriesId(saved.some((item) => item.seriesId === nextSelectedId) ? nextSelectedId : saved[0]?.seriesId ?? null);
    onChange();
  };

  const createSeries = () => {
    const name = newName.trim();
    if (!name) {
      setMessage("请输入系列名称。");
      return;
    }
    if (series.some((item) => item.name.toLocaleLowerCase("zh-CN") === name.toLocaleLowerCase("zh-CN"))) {
      setMessage("该系列名称已存在。");
      return;
    }
    const now = new Date().toISOString();
    const record: BrandSeriesRecord = {
      seriesId: createBrandSeriesId(),
      name,
      productRefs: [],
      showOnHome: homeCount < MAX_HOME_SERIES,
      createdAt: now,
      updatedAt: now,
    };
    persist([...series, record], record.seriesId);
    setNewName("");
    setMessage(`已创建“${name}”；请为系列勾选商品。`);
  };

  const updateSelected = (patch: Partial<Pick<BrandSeriesRecord, "productRefs" | "showOnHome">>) => {
    if (!selected) return;
    persist(series.map((item) => item.seriesId === selected.seriesId
      ? { ...item, ...patch, updatedAt: new Date().toISOString() }
      : item));
  };

  const toggleHome = () => {
    if (!selected) return;
    if (!selected.showOnHome && homeCount >= MAX_HOME_SERIES) {
      setMessage(`驾驶舱最多展示 ${MAX_HOME_SERIES} 个系列，请先取消一个已展示系列。`);
      return;
    }
    updateSelected({ showOnHome: !selected.showOnHome });
    setMessage(selected.showOnHome ? "已从驾驶舱取消展示。" : "已加入驾驶舱重点系列。 ");
  };

  const toggleProduct = (product: ProductOption) => {
    if (!selected) return;
    const key = product.key;
    const next = selectedKeys.has(key)
      ? selected.productRefs.filter((ref) => refKey(ref) !== key)
      : [...selected.productRefs, {
          platformCode: product.platformCode,
          storeId: product.storeId,
          productId: product.productId,
        }];
    updateSelected({ productRefs: next });
    setMessage("系列商品范围已保存。");
  };

  const removeSelected = () => {
    if (!selected || !window.confirm(`确认删除系列“${selected.name}”？经营事实数据不会被删除。`)) return;
    persist(series.filter((item) => item.seriesId !== selected.seriesId), null);
    setMessage("系列已删除；经营事实数据未受影响。");
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-brand-series-manager">
      <div className="grid gap-4 border-b border-slate-100 p-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-950">系列维护</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              共 {series.length} 个 · 驾驶舱 {homeCount}/{MAX_HOME_SERIES}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            系列数量不限；经营驾驶舱最多展示 5 个，由你在这里手动勾选。系列按商品 ID 绑定，可跨平台和店铺汇总。
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="form-input min-w-0 flex-1"
            maxLength={40}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createSeries();
            }}
            placeholder="新系列名称"
            value={newName}
          />
          <button className="primary-button shrink-0" onClick={createSeries} type="button">创建系列</button>
        </div>
        {message ? <p className="text-sm font-medium text-blue-700 xl:col-span-2">{message}</p> : null}
      </div>

      <div className="grid min-h-80 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="border-b border-slate-100 p-3 lg:border-b-0 lg:border-r">
          {series.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">尚未创建系列</div>
          ) : series.map((item) => (
            <button
              key={item.seriesId}
              className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left ${item.seriesId === selectedSeriesId ? "bg-blue-50 text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}
              onClick={() => setSelectedSeriesId(item.seriesId)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{item.productRefs.length} 个商品</span>
              </span>
              {item.showOnHome ? <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">驾驶舱</span> : null}
            </button>
          ))}
        </div>

        {selected ? (
          <div className="min-w-0 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{selected.name}</h3>
                <p className="mt-1 text-xs text-slate-500">已选 {selected.productRefs.length} 个商品</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  aria-pressed={selected.showOnHome}
                  className={selected.showOnHome ? "primary-button" : "secondary-button"}
                  onClick={toggleHome}
                  type="button"
                >
                  {selected.showOnHome ? "已在驾驶舱展示" : "加入驾驶舱"}
                </button>
                <button className="secondary-button text-rose-700" onClick={removeSelected} type="button">删除系列</button>
              </div>
            </div>
            <input
              className="form-input mt-4"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索商品名称或 ID"
              value={search}
            />
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {visibleProducts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">当前品牌暂无可选商品</p>
              ) : visibleProducts.map((product) => (
                <label key={product.key} className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0 hover:bg-slate-50">
                  <input
                    checked={selectedKeys.has(product.key)}
                    className="mt-1"
                    onChange={() => toggleProduct(product)}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{product.name}</span>
                    <span className="mt-0.5 block break-all text-xs text-slate-500">
                      {product.platformLabel} · {product.storeName} · {product.productId}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center p-8 text-sm text-slate-500">创建或选择一个系列后维护商品范围</div>
        )}
      </div>
    </section>
  );
}
