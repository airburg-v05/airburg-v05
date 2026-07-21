"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveTargetMetricValue,
  formatTargetMetricValue,
  getDerivedTargetMetricDefinitionsForScope,
  getRequiredTargetMetricDefinitionsForScope,
  type TargetMetricDefinition,
  type TargetMetricScope,
} from "@/lib/bi/target-metric-definitions";
import {
  loadTargetDrafts,
  pauseTargetDraft,
  saveTargetDraft,
  saveTargetDrafts,
} from "@/lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftQuery,
  type TargetDraftRecord,
} from "@/lib/persistence/target-drafts-persistence.types";
import { loadActiveBrandRuntimeV2Dataset } from "@/lib/v2/runtime/runtime-v2-dataset";
import {
  BRAND_PRODUCTS_EVENT,
  loadBrandProducts,
  type BrandProductRecord,
} from "@/lib/v2/workspace/brand-products";
import {
  targetDatabaseNameForBrand,
} from "@/lib/v2/workspace/brand-workspace";
import { useBrandWorkspace } from "@/lib/v2/workspace/use-brand-workspace";
import type { V2Dataset } from "@/lib/v05/domain/models";

type EditableScope = TargetMetricScope;

const SCOPE_OPTIONS: Array<{ scope: EditableScope; label: string; description: string }> = [
  { scope: "brand", label: "品牌", description: "品牌整体月度目标，不依赖经营数据上传" },
  { scope: "platform", label: "店铺", description: "按平台与店铺设置细分目标" },
  { scope: "series", label: "系列", description: "按已维护系列设置细分目标" },
  { scope: "product", label: "商品", description: "按商品设置细分目标" },
];

const localMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const latestOperatingMonth = (dataset: V2Dataset): string | null => {
  const dates = [
    ...dataset.businessProductFacts.map((fact) => fact.businessDate),
    ...dataset.adProductFacts.map((fact) => fact.businessDate),
    ...dataset.adPlanFacts.map((fact) => fact.businessDate),
  ].filter(Boolean).sort();
  return dates.at(-1)?.slice(0, 7) ?? null;
};

const inputValue = (record: TargetDraftRecord): string =>
  record.unit === "%" ? String(record.targetValue * 100) : String(record.targetValue);

const storedValue = (definition: TargetMetricDefinition, raw: string): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return definition.format === "percent" ? parsed / 100 : parsed;
};

const scopeQuery = ({
  scope,
  month,
  platformCode,
  storeId,
  seriesId,
  productId,
}: {
  scope: EditableScope;
  month: string;
  platformCode: string;
  storeId: string;
  seriesId: string;
  productId: string;
}): TargetDraftQuery => ({
  scope,
  month,
  ...(scope === "brand" ? {} : { platformCode, storeId }),
  ...(scope === "series" ? { seriesId } : {}),
  ...(scope === "product" ? { productId } : {}),
});

const targetIdFor = (query: TargetDraftQuery, metricKey: string): string =>
  [
    "target",
    query.scope,
    query.platformCode || "brand",
    query.storeId || "all",
    query.seriesId || query.productId || "all",
    query.month,
    metricKey,
  ].join("|");

export function V2BrandTargetCenter() {
  const { brand, hydrated } = useBrandWorkspace();
  const databaseName = targetDatabaseNameForBrand(brand.id);
  const [dataset, setDataset] = useState<V2Dataset | null>(null);
  const [datasetBrandId, setDatasetBrandId] = useState<string | null>(null);
  const [manualProducts, setManualProducts] = useState<BrandProductRecord[]>([]);
  const [dataMonth, setDataMonth] = useState<string | null>(null);
  const [scope, setScope] = useState<EditableScope>("brand");
  const [month, setMonth] = useState(localMonth);
  const monthTouched = useRef(false);
  const [platformCode, setPlatformCode] = useState("");
  const [storeId, setStoreId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [productId, setProductId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<TargetDraftRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    monthTouched.current = false;
    let cancelled = false;
    void loadActiveBrandRuntimeV2Dataset(brand.id).then((result) => {
      if (cancelled) return;
      if (result.status !== "ready") {
        setDataset(null);
        setDatasetBrandId(brand.id);
        setDataMonth(null);
        return;
      }
      setDataset(result.dataset);
      setDatasetBrandId(brand.id);
      const latestMonth = latestOperatingMonth(result.dataset);
      setDataMonth(latestMonth);
      if (latestMonth && !monthTouched.current) setMonth(latestMonth);
      const firstStore = result.dataset.stores.find((store) => store.status === "active");
      if (firstStore) {
        setPlatformCode((current) => current || firstStore.platformCode);
        setStoreId((current) => current || firstStore.storeId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const refresh = () => setManualProducts(loadBrandProducts(brand.id));
    refresh();
    window.addEventListener(BRAND_PRODUCTS_EVENT, refresh);
    return () => window.removeEventListener(BRAND_PRODUCTS_EVENT, refresh);
  }, [brand.id, hydrated]);

  const currentDataset = datasetBrandId === brand.id ? dataset : null;
  const stores = useMemo(() => currentDataset?.stores.filter((store) => store.status === "active") ?? [], [currentDataset]);
  const selectedStore = stores.find((store) => store.platformCode === platformCode && store.storeId === storeId) ?? stores[0] ?? null;
  const seriesOptions = useMemo(() => currentDataset?.series.filter((item) =>
    item.status === "active" &&
    item.platformCode === selectedStore?.platformCode &&
    item.storeId === selectedStore?.storeId,
  ) ?? [], [currentDataset, selectedStore]);
  const productOptions = useMemo(() => manualProducts.filter((item) =>
    item.platformCode === selectedStore?.platformCode &&
    item.storeId === selectedStore?.storeId,
  ), [manualProducts, selectedStore]);
  const resolvedSeriesId = seriesOptions.some((item) => item.seriesId === seriesId)
    ? seriesId
    : seriesOptions[0]?.seriesId ?? "";
  const resolvedProductId = productOptions.some((item) => item.productId === productId)
    ? productId
    : productOptions[0]?.productId ?? "";

  const query = useMemo(() => scopeQuery({
    scope,
    month,
    platformCode: selectedStore?.platformCode ?? platformCode,
    storeId: selectedStore?.storeId ?? storeId,
    seriesId: resolvedSeriesId,
    productId: resolvedProductId,
  }), [month, platformCode, resolvedProductId, resolvedSeriesId, scope, selectedStore, storeId]);
  const requestKey = `${JSON.stringify(query)}:${revision}`;
  const loading = loadedRequestKey !== requestKey;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadTargetDrafts(query, { databaseName }).then((result) => {
      if (cancelled) return;
      const nextRecords = result.status === "ok" ? result.records : [];
      setRecords(nextRecords);
      setValues(Object.fromEntries(nextRecords.map((record) => [record.metricKey, inputValue(record)])));
      setLoadedRequestKey(requestKey);
    });
    return () => {
      cancelled = true;
    };
  }, [databaseName, hydrated, query, requestKey]);

  const requiredDefinitions = getRequiredTargetMetricDefinitionsForScope(scope);
  const derivedDefinitions = getDerivedTargetMetricDefinitionsForScope(scope);
  const storedMetricValues = Object.fromEntries(requiredDefinitions.map((definition) => [
    definition.metricKey,
    storedValue(definition, values[definition.metricKey] ?? ""),
  ]));
  const scopeReady = scope === "brand" || Boolean(
    selectedStore &&
    (scope !== "series" || resolvedSeriesId) &&
    (scope !== "product" || resolvedProductId),
  );

  const save = async () => {
    if (!scopeReady) {
      setMessage("当前范围缺少可用实体，请先上传经营数据或维护系列。");
      return;
    }
    const existingByMetric = new Map(records.map((record) => [record.metricKey, record]));
    const now = new Date().toISOString();
    const nextRecords = requiredDefinitions.flatMap((definition) => {
      const targetValue = storedValue(definition, values[definition.metricKey] ?? "");
      if (targetValue === null) return [];
      const existing = existingByMetric.get(definition.metricKey);
      return [{
        schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
        targetId: existing?.targetId ?? targetIdFor(query, definition.metricKey),
        scope,
        platformCode: query.platformCode ?? "",
        storeId: query.storeId ?? "",
        seriesId: scope === "series" ? resolvedSeriesId : null,
        productId: scope === "product" ? resolvedProductId : null,
        month,
        metricKey: definition.metricKey,
        targetValue,
        unit: definition.unit,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        status: existing?.status ?? "active",
      } satisfies TargetDraftRecord];
    });
    if (nextRecords.length === 0) {
      setMessage("请至少填写一个大于 0 的目标值。");
      return;
    }
    const result = await saveTargetDrafts(nextRecords, { databaseName });
    if (result.status === "saved") {
      setMessage(`已保存 ${result.records.length} 项${SCOPE_OPTIONS.find((item) => item.scope === scope)?.label}目标。`);
      setRevision((current) => current + 1);
      return;
    }
    setMessage("目标未保存，请检查输入后重试。");
  };

  const toggleStatus = async (record: TargetDraftRecord) => {
    const result = record.status === "active"
      ? await pauseTargetDraft(record.targetId, { databaseName })
      : await saveTargetDraft({ ...record, status: "active", updatedAt: new Date().toISOString() }, { databaseName });
    setMessage(result.status === "paused" || result.status === "saved" ? "目标状态已更新。" : "目标状态更新失败。");
    setRevision((current) => current + 1);
  };

  return (
    <div className="space-y-5" data-testid="v2-brand-target-center">
      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
        <h2 className="text-base font-semibold text-slate-950">目标设置独立于数据上传</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {brand.name} 的品牌月度目标可直接建立；经营数据只用于计算实际值和完成率。店铺、系列及手动添加商品需要先有对应实体，但不需要额外上传“目标底座”。
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">目标层级</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((item) => {
                const disabled = item.scope !== "brand" && !currentDataset;
                return (
                  <button
                    key={item.scope}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${scope === item.scope ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                    disabled={disabled}
                    onClick={() => setScope(item.scope)}
                    title={disabled ? "细分目标需要先有对应经营实体" : item.description}
                    type="button"
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {dataMonth ? (
              <div className={`rounded-lg px-3 py-2 text-xs ${month === dataMonth ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                经营数据最新月份 <strong>{dataMonth}</strong>
                {month !== dataMonth ? <span className="ml-1">· 当前目标月份不同</span> : null}
              </div>
            ) : null}
            <label className="text-xs font-semibold text-slate-500">
              目标月份
              <input
                className="form-input mt-2"
                onChange={(event) => {
                  monthTouched.current = true;
                  setMonth(event.target.value);
                }}
                type="month"
                value={month}
              />
            </label>
          </div>
        </div>

        {scope !== "brand" ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="text-xs font-semibold text-slate-500">
              店铺
              <select
                className="form-input mt-2"
                onChange={(event) => {
                  const [nextPlatform, nextStore] = event.target.value.split("::");
                  setPlatformCode(nextPlatform || "");
                  setStoreId(nextStore || "");
                  setSeriesId("");
                  setProductId("");
                }}
                value={selectedStore ? `${selectedStore.platformCode}::${selectedStore.storeId}` : ""}
              >
                {stores.map((store) => <option key={`${store.platformCode}::${store.storeId}`} value={`${store.platformCode}::${store.storeId}`}>{store.platformCode} · {store.storeName}</option>)}
              </select>
            </label>
            {scope === "series" ? (
              <label className="text-xs font-semibold text-slate-500">
                系列
                <select className="form-input mt-2" onChange={(event) => setSeriesId(event.target.value)} value={resolvedSeriesId}>
                  {seriesOptions.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            {scope === "product" ? (
              <label className="text-xs font-semibold text-slate-500">
                商品
                <select className="form-input mt-2" onChange={(event) => setProductId(event.target.value)} value={resolvedProductId}>
                  {productOptions.map((item) => <option key={item.recordId} value={item.productId}>{item.displayName || item.productId}</option>)}
                </select>
                {productOptions.length === 0 ? <a className="mt-2 block text-[11px] font-semibold text-blue-700" href="/v2/product-board">先去商品中心手动添加</a> : null}
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">{month} {SCOPE_OPTIONS.find((item) => item.scope === scope)?.label}目标</h2>
            <p className="mt-1 text-sm text-slate-500">百分比请输入 0-100 的数值；ROI 输入倍数。</p>
          </div>
          <button className="primary-button" disabled={!scopeReady || loading} onClick={() => void save()} type="button">保存目标</button>
        </div>
        <div className="mt-5 grid overflow-hidden rounded-xl border border-slate-200 md:grid-cols-2">
          {requiredDefinitions.map((definition) => {
            const record = records.find((item) => item.metricKey === definition.metricKey);
            const inputId = `v2-target-${scope}-${definition.metricKey}`;
            return (
              <div key={definition.metricKey} className="flex min-w-0 items-center gap-3 border-b border-r border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">
                <label className="min-w-0 flex-1 truncate text-slate-700" htmlFor={inputId}>{definition.title}</label>
                <div className="flex h-9 w-36 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2 focus-within:border-blue-400">
                  <input
                    id={inputId}
                    className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-slate-900 outline-none"
                    min="0"
                    onChange={(event) => setValues((current) => ({ ...current, [definition.metricKey]: event.target.value }))}
                    placeholder="未设置"
                    step={definition.format === "integer" ? "1" : "0.01"}
                    type="number"
                    value={values[definition.metricKey] ?? ""}
                  />
                  <span className="ml-1 shrink-0 text-[10px] text-slate-400">{definition.unit}</span>
                </div>
                {record ? (
                  <button className="w-14 shrink-0 text-[11px] font-semibold text-blue-700" onClick={() => void toggleStatus(record)} type="button">
                    {record.status === "active" ? "暂停此目标" : "重新启用"}
                  </button>
                ) : <span className="w-14 shrink-0 text-[11px] font-normal text-slate-300">未保存</span>}
              </div>
            );
          })}
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{message}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">自动推导目标</h2>
        <p className="mt-1 text-sm text-slate-500">只按已填写目标推导，不把公式结果伪装为人工设定值。</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {derivedDefinitions.map((definition) => {
            const derived = deriveTargetMetricValue(definition.metricKey, storedMetricValues);
            return (
              <article key={definition.metricKey} className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{definition.title}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{formatTargetMetricValue(derived.value, definition.format)}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {derived.value === null ? `待补：${derived.missingDependencies.join("、") || "当前不可推导"}` : definition.deriveFormula}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
