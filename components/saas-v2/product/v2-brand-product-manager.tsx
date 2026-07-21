"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadActiveBrandRuntimeV2Dataset } from "@/lib/v2/runtime/runtime-v2-dataset";
import {
  createBrandProductId,
  loadBrandProducts,
  saveBrandProducts,
  type BrandProductRecord,
} from "@/lib/v2/workspace/brand-products";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";

interface CatalogProduct {
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  displayName: string;
}

interface ProductDraft {
  recordId: string | null;
  platformCode: string;
  storeId: string;
  productId: string;
  displayName: string;
  imageDataUrl: string | null;
}

interface V2BrandProductManagerProps {
  selectedRecordId: string | null;
  selectedPlatform: string | null;
  selectedStoreIds: string[];
  onRecordsChange: (records: BrandProductRecord[]) => void;
  onSelectProduct: (recordId: string) => void;
  children?: ReactNode;
}

const productKey = (product: Pick<BrandProductRecord, "platformCode" | "storeId" | "productId">): string =>
  `${product.platformCode}::${product.storeId}::${product.productId}`;

const squareImageDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    reject(new Error("请选择 8MB 以内的图片文件。"));
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      const size = 480;
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("图片处理不可用。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.84));
    } catch (error) {
      reject(error);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("图片无法读取，请更换文件。"));
  };
  image.src = objectUrl;
});

export function V2BrandProductManager({
  selectedRecordId,
  selectedPlatform,
  selectedStoreIds,
  onRecordsChange,
  onSelectProduct,
  children,
}: V2BrandProductManagerProps) {
  const { brand, hydrated } = useBrandWorkspace();
  const [records, setRecords] = useState<BrandProductRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogBrandId, setCatalogBrandId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const next = loadBrandProducts(brand.id);
      setRecords(next);
      onRecordsChange(next);
      setDraft(null);
      setMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated, onRecordsChange]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadActiveBrandRuntimeV2Dataset(brand.id).then((result) => {
      if (cancelled) return;
      if (result.status !== "ready") {
        setCatalog([]);
        setCatalogBrandId(brand.id);
        return;
      }
      const storeNames = new Map(result.dataset.stores.map((store) => [
        `${store.platformCode}::${store.storeId}`,
        store.storeName,
      ]));
      const platformNames = new Map(result.dataset.platforms.map((platform) => [
        platform.platformCode,
        platform.platformName,
      ]));
      setCatalog(result.dataset.trackedProducts
        .filter((product) => product.status === "active")
        .map((product) => ({
          platformCode: product.platformCode,
          platformName: platformNames.get(product.platformCode) || product.platformCode,
          storeId: product.storeId,
          storeName: storeNames.get(`${product.platformCode}::${product.storeId}`) || product.storeId,
          productId: product.productId,
          displayName: product.displayName?.trim() || product.productId,
        })));
      setCatalogBrandId(brand.id);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated]);

  const activeCatalog = useMemo(
    () => catalogBrandId === brand.id ? catalog : [],
    [brand.id, catalog, catalogBrandId],
  );
  const stores = useMemo(() => Array.from(new Map(activeCatalog.map((product) => [
    `${product.platformCode}::${product.storeId}`,
    {
      platformCode: product.platformCode,
      platformName: product.platformName,
      storeId: product.storeId,
      storeName: product.storeName,
    },
  ])).values()), [activeCatalog]);
  const visibleRecords = useMemo(() => records.filter((record) =>
    (!selectedPlatform || record.platformCode === selectedPlatform) &&
    (selectedStoreIds.length === 0 || selectedStoreIds.includes(record.storeId)),
  ), [records, selectedPlatform, selectedStoreIds]);
  const matchedCatalogProduct = draft
    ? activeCatalog.find((product) =>
      product.platformCode === draft.platformCode &&
      product.storeId === draft.storeId &&
      product.productId === draft.productId.trim(),
    ) ?? null
    : null;

  const persist = (next: BrandProductRecord[]) => {
    const saved = saveBrandProducts(brand.id, next);
    setRecords(saved);
    onRecordsChange(saved);
    return saved;
  };

  const openCreate = () => {
    const preferredStore = stores.find((store) =>
      (!selectedPlatform || store.platformCode === selectedPlatform) &&
      (selectedStoreIds.length === 0 || selectedStoreIds.includes(store.storeId)),
    ) ?? stores[0] ?? null;
    setDraft({
      recordId: null,
      platformCode: preferredStore?.platformCode ?? "",
      storeId: preferredStore?.storeId ?? "",
      productId: "",
      displayName: "",
      imageDataUrl: null,
    });
    setMessage(null);
  };

  const openEdit = (record: BrandProductRecord) => {
    setDraft({
      recordId: record.recordId,
      platformCode: record.platformCode,
      storeId: record.storeId,
      productId: record.productId,
      displayName: record.displayName,
      imageDataUrl: record.imageDataUrl,
    });
    setMessage(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.productId.trim()) {
      setMessage("请手动输入商品 ID。");
      return;
    }
    if (!matchedCatalogProduct) {
      setMessage("该商品 ID 未在所选店铺的已接入数据中找到。");
      return;
    }
    const key = `${draft.platformCode}::${draft.storeId}::${draft.productId.trim()}`;
    if (records.some((record) => record.recordId !== draft.recordId && productKey(record) === key)) {
      setMessage("该店铺商品已添加，请直接编辑现有卡片。");
      return;
    }
    const existing = records.find((record) => record.recordId === draft.recordId) ?? null;
    const now = new Date().toISOString();
    const record: BrandProductRecord = {
      recordId: existing?.recordId ?? createBrandProductId(),
      platformCode: draft.platformCode,
      storeId: draft.storeId,
      productId: draft.productId.trim(),
      displayName: draft.displayName.trim() || matchedCatalogProduct.displayName,
      imageDataUrl: draft.imageDataUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    persist(existing
      ? records.map((item) => item.recordId === record.recordId ? record : item)
      : [...records, record]);
    setDraft(null);
    setMessage(`已保存“${record.displayName}”。`);
    onSelectProduct(record.recordId);
  };

  const removeProduct = (record: BrandProductRecord) => {
    if (!window.confirm(`确认删除商品“${record.displayName}”？经营事实数据不会被删除。`)) return;
    const saved = persist(records.filter((item) => item.recordId !== record.recordId));
    setDraft((current) => current?.recordId === record.recordId ? null : current);
    setMessage("商品卡片已删除；经营事实数据未受影响。");
    if (selectedRecordId === record.recordId && saved[0]) onSelectProduct(saved[0].recordId);
  };

  const updateImage = async (file: File | null) => {
    if (!file) return;
    try {
      const imageDataUrl = await squareImageDataUrl(file);
      setDraft((current) => current ? { ...current, imageDataUrl } : current);
      setMessage("方图已裁切为 1:1，保存商品后生效。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片处理失败。");
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="v2-brand-product-manager">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-900">商品维护</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{records.length} 个商品</span>
            {visibleRecords.length > 0 ? (
              <label className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                当前
                <select
                  className="h-8 min-w-0 max-w-64 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  onChange={(event) => onSelectProduct(event.target.value)}
                  value={selectedRecordId ?? visibleRecords[0]?.recordId ?? ""}
                >
                  {visibleRecords.map((record) => <option key={record.recordId} value={record.recordId}>{record.displayName}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <button className="primary-button px-3 py-1.5 text-xs" disabled={stores.length === 0} onClick={openCreate} type="button">添加商品</button>
        </div>

        {draft ? (
          <div className="border-t border-slate-100 bg-slate-50/45 p-4" data-testid="v2-product-editor">
            <div className="grid gap-3 lg:grid-cols-[9rem_14rem_minmax(0,1fr)_auto] lg:items-start">
              <div>
                <p className="text-xs font-semibold text-slate-500">商品方图</p>
                <label className="mt-1.5 flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white text-center text-[11px] font-medium text-slate-500">
                  {draft.imageDataUrl ? (
                    <Image alt="商品方图预览" className="h-full w-full object-cover" height={144} src={draft.imageDataUrl} unoptimized width={144} />
                  ) : <span className="px-2">上传后自动裁成 1:1</span>}
                  <input accept="image/jpeg,image/png,image/webp" className="sr-only" data-testid="v2-product-image-input" onChange={(event) => void updateImage(event.target.files?.[0] ?? null)} type="file" />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-500">
                店铺
                <select
                  className="form-input mt-1.5"
                  onChange={(event) => {
                    const [platformCode, storeId] = event.target.value.split("::");
                    setDraft((current) => current ? { ...current, platformCode, storeId, productId: "" } : current);
                  }}
                  value={`${draft.platformCode}::${draft.storeId}`}
                >
                  {stores.map((store) => <option key={`${store.platformCode}::${store.storeId}`} value={`${store.platformCode}::${store.storeId}`}>{store.platformName} · {store.storeName}</option>)}
                </select>
                <span className="mt-3 block">商品 ID</span>
                <input className="form-input mt-1.5 font-mono" onChange={(event) => setDraft((current) => current ? { ...current, productId: event.target.value } : current)} placeholder="手动粘贴商品 ID" value={draft.productId} />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                展示名称
                <input className="form-input mt-1.5" data-testid="v2-product-name-input" maxLength={120} onChange={(event) => setDraft((current) => current ? { ...current, displayName: event.target.value } : current)} placeholder={matchedCatalogProduct?.displayName || "识别商品 ID 后可沿用数据名称"} value={draft.displayName} />
                <span className={`mt-2 block font-normal ${matchedCatalogProduct ? "text-emerald-700" : "text-slate-400"}`}>
                  {draft.productId.trim()
                    ? matchedCatalogProduct ? `已匹配：${matchedCatalogProduct.displayName}` : "当前店铺未匹配到该商品 ID"
                    : "商品只在手动添加后进入商品中心"}
                </span>
              </label>
              <div className="flex flex-col gap-2 lg:pt-6">
                <button className="primary-button justify-center" onClick={saveDraft} type="button">加载并保存</button>
                <button className="secondary-button justify-center" onClick={() => setDraft(null)} type="button">取消</button>
              </div>
            </div>
          </div>
        ) : null}

        {message ? <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-blue-700">{message}</p> : null}
      </section>

      {children}

      <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="v2-product-library">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">商品列表</h3>
            <p className="mt-0.5 text-xs text-slate-500">仅展示手动添加的商品；点击卡片查看，右上角可编辑或删除。</p>
          </div>
        </div>
        {visibleRecords.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">当前范围尚未手动添加商品</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleRecords.map((record) => (
              <article key={record.recordId} className={`overflow-hidden rounded-lg border transition ${record.recordId === selectedRecordId ? "border-blue-300 bg-blue-50/35" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="relative aspect-square bg-slate-100">
                  <button className="h-full w-full" onClick={() => onSelectProduct(record.recordId)} type="button">
                    {record.imageDataUrl ? (
                      <Image alt={record.displayName} className="h-full w-full object-cover" fill sizes="(min-width: 1280px) 20vw, (min-width: 640px) 40vw, 90vw" src={record.imageDataUrl} unoptimized />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#f8fafc,#e2e8f0)] text-3xl font-semibold text-slate-400">{record.displayName.slice(0, 1)}</span>
                    )}
                  </button>
                  <div className="absolute right-2 top-2 flex gap-1 rounded-md bg-white/90 p-1 text-[11px] font-semibold shadow-sm backdrop-blur">
                    <button className="px-1.5 py-1 text-blue-700" onClick={() => openEdit(record)} type="button">编辑</button>
                    <button className="px-1.5 py-1 text-rose-600" onClick={() => removeProduct(record)} type="button">删除</button>
                  </div>
                </div>
                <button className="block w-full p-3 text-left" onClick={() => onSelectProduct(record.recordId)} type="button">
                  <span className="block line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900">{record.displayName}</span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-slate-400">ID {record.productId}</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
