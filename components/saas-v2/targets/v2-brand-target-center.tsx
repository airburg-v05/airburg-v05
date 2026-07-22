"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getRequiredTargetMetricDefinitionsForScope,
  type TargetMetricDefinition,
  type TargetMetricScope,
} from "@/lib/bi/target-metric-definitions";
import {
  deleteTargetDraft,
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

const formatMonthLabel = (value: string): string => {
  const [year, month] = value.split("-");
  return year && month ? `${year}年${month}月` : value;
};

type AutoSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

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
  const [dirtyQueryKey, setDirtyQueryKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<AutoSaveState>("idle");
  const editVersion = useRef(0);
  const loadedContextKey = useRef("");

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
  const queryKey = JSON.stringify(query);
  const contextKey = `${databaseName}:${queryKey}`;
  const requestKey = `${contextKey}:${revision}`;
  const loading = loadedRequestKey !== requestKey;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadTargetDrafts(query, { databaseName }).then((result) => {
      if (cancelled) return;
      const nextRecords = result.status === "ok" ? result.records : [];
      if (loadedContextKey.current !== contextKey) {
        loadedContextKey.current = contextKey;
        setDirtyQueryKey(null);
        setSaveState("idle");
        setMessage(null);
      }
      setRecords(nextRecords);
      setValues(Object.fromEntries(nextRecords.map((record) => [record.metricKey, inputValue(record)])));
      setLoadedRequestKey(requestKey);
    });
    return () => {
      cancelled = true;
    };
  }, [contextKey, databaseName, hydrated, query, requestKey]);

  const requiredDefinitions = useMemo(() => getRequiredTargetMetricDefinitionsForScope(scope), [scope]);
  const scopeReady = scope === "brand" || Boolean(
    selectedStore &&
    (scope !== "series" || resolvedSeriesId) &&
    (scope !== "product" || resolvedProductId),
  );

  const persistTargets = useCallback(async (expectedVersion = editVersion.current): Promise<boolean> => {
    if (!scopeReady) {
      setMessage("当前范围缺少可用实体，请先上传经营数据或维护系列。");
      setSaveState("error");
      return false;
    }
    if (loading) return false;

    const invalidDefinition = requiredDefinitions.find((definition) => {
      const raw = values[definition.metricKey] ?? "";
      return raw.trim() !== "" && storedValue(definition, raw) === null;
    });
    if (invalidDefinition) {
      setMessage(`${invalidDefinition.title}请输入大于 0 的有效数值。`);
      setSaveState("error");
      return false;
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
    const requiredMetricKeys = new Set(requiredDefinitions.map((definition) => definition.metricKey));
    const recordsToDelete = records.filter((record) =>
      requiredMetricKeys.has(record.metricKey) && (values[record.metricKey] ?? "").trim() === "",
    );

    if (nextRecords.length === 0 && recordsToDelete.length === 0) {
      setDirtyQueryKey(null);
      setSaveState("idle");
      return true;
    }

    setSaveState("saving");
    const persistedById = new Map(records.map((record) => [record.targetId, record]));
    if (nextRecords.length > 0) {
      const result = await saveTargetDrafts(nextRecords, { databaseName });
      if (result.status !== "saved") {
        if (editVersion.current !== expectedVersion) {
          setSaveState("dirty");
          return false;
        }
        setMessage("自动保存失败，请检查输入后重试。");
        setSaveState("error");
        return false;
      }
      result.records.forEach((record) => persistedById.set(record.targetId, record));
    }

    const deleteResults = await Promise.all(
      recordsToDelete.map((record) => deleteTargetDraft(record.targetId, { databaseName })),
    );
    deleteResults.forEach((result) => {
      if (result.status === "deleted") persistedById.delete(result.targetId);
    });
    setRecords([...persistedById.values()]);
    if (deleteResults.some((result) => result.status !== "deleted")) {
      if (editVersion.current !== expectedVersion) {
        setSaveState("dirty");
        return false;
      }
      setMessage("目标清空未能完整保存，请重试。");
      setSaveState("error");
      return false;
    }

    const scopeLabel = SCOPE_OPTIONS.find((item) => item.scope === scope)?.label ?? "当前范围";
    const removedLabel = recordsToDelete.length > 0 ? `，清除 ${recordsToDelete.length} 项` : "";
    if (editVersion.current === expectedVersion) {
      setMessage(`${formatMonthLabel(month)} · 已自动保存 ${nextRecords.length} 项${scopeLabel}目标${removedLabel}。`);
      setDirtyQueryKey(null);
      setSaveState("saved");
      setRevision((current) => current + 1);
    } else {
      setSaveState("dirty");
    }
    return true;
  }, [databaseName, loading, month, query, records, requiredDefinitions, resolvedProductId, resolvedSeriesId, scope, scopeReady, values]);

  useEffect(() => {
    if (dirtyQueryKey !== queryKey || loading || saveState !== "dirty") return;
    const expectedVersion = editVersion.current;
    const timer = window.setTimeout(() => {
      void persistTargets(expectedVersion);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [dirtyQueryKey, loading, persistTargets, queryKey, saveState]);

  const flushBeforeContextChange = useCallback(async (change: () => void) => {
    if (dirtyQueryKey === queryKey) {
      const saved = await persistTargets(editVersion.current);
      if (!saved) return;
    }
    change();
  }, [dirtyQueryKey, persistTargets, queryKey]);

  const toggleStatus = async (record: TargetDraftRecord) => {
    const result = record.status === "active"
      ? await pauseTargetDraft(record.targetId, { databaseName })
      : await saveTargetDraft({ ...record, status: "active", updatedAt: new Date().toISOString() }, { databaseName });
    setMessage(result.status === "paused" || result.status === "saved" ? "目标状态已更新。" : "目标状态更新失败。");
    setRevision((current) => current + 1);
  };

  const markTargetDirty = (metricKey: string, value: string) => {
    editVersion.current += 1;
    setValues((current) => ({ ...current, [metricKey]: value }));
    setDirtyQueryKey(queryKey);
    setSaveState("dirty");
    setMessage(null);
  };

  const saveStatus = loading
    ? { label: "正在读取", tone: "bg-slate-100 text-slate-500" }
    : saveState === "dirty"
      ? { label: "等待自动保存", tone: "bg-amber-50 text-amber-700" }
      : saveState === "saving"
        ? { label: "正在自动保存", tone: "bg-blue-50 text-blue-700" }
        : saveState === "saved"
          ? { label: "已自动保存", tone: "bg-emerald-50 text-emerald-700" }
          : saveState === "error"
            ? { label: "自动保存失败", tone: "bg-rose-50 text-rose-700" }
            : { label: records.length > 0 ? `已保存 ${records.length} 项` : "修改后自动保存", tone: "bg-slate-100 text-slate-500" };

  return (
    <div className="space-y-4" data-testid="v2-brand-target-center">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">目标层级</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((item) => {
                const requiresDataset = item.scope !== "brand" && !currentDataset;
                const disabled = requiresDataset || loading || saveState === "saving";
                return (
                  <button
                    key={item.scope}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${scope === item.scope ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                    disabled={disabled}
                    onClick={() => void flushBeforeContextChange(() => setScope(item.scope))}
                    title={requiresDataset ? "细分目标需要先有对应经营实体" : item.description}
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
                disabled={loading || saveState === "saving"}
                onChange={(event) => {
                  const nextMonth = event.target.value;
                  void flushBeforeContextChange(() => {
                    monthTouched.current = true;
                    setMonth(nextMonth);
                  });
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
                disabled={loading || saveState === "saving"}
                onChange={(event) => {
                  const [nextPlatform, nextStore] = event.target.value.split("::");
                  void flushBeforeContextChange(() => {
                    setPlatformCode(nextPlatform || "");
                    setStoreId(nextStore || "");
                    setSeriesId("");
                    setProductId("");
                  });
                }}
                value={selectedStore ? `${selectedStore.platformCode}::${selectedStore.storeId}` : ""}
              >
                {stores.map((store) => <option key={`${store.platformCode}::${store.storeId}`} value={`${store.platformCode}::${store.storeId}`}>{store.platformCode} · {store.storeName}</option>)}
              </select>
            </label>
            {scope === "series" ? (
              <label className="text-xs font-semibold text-slate-500">
                系列
                <select className="form-input mt-2" disabled={loading || saveState === "saving"} onChange={(event) => {
                  const nextSeriesId = event.target.value;
                  void flushBeforeContextChange(() => setSeriesId(nextSeriesId));
                }} value={resolvedSeriesId}>
                  {seriesOptions.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.name}</option>)}
                </select>
              </label>
            ) : null}
            {scope === "product" ? (
              <label className="text-xs font-semibold text-slate-500">
                商品
                <select className="form-input mt-2" disabled={loading || saveState === "saving"} onChange={(event) => {
                  const nextProductId = event.target.value;
                  void flushBeforeContextChange(() => setProductId(nextProductId));
                }} value={resolvedProductId}>
                  {productOptions.map((item) => <option key={item.recordId} value={item.productId}>{item.displayName || item.productId}</option>)}
                </select>
                {productOptions.length === 0 ? <a className="mt-2 block text-[11px] font-semibold text-blue-700" href="/v2/product-board">先去商品中心手动添加</a> : null}
              </label>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-950">{formatMonthLabel(month)}</h2>
              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">
                {SCOPE_OPTIONS.find((item) => item.scope === scope)?.label}目标
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">修改后自动保存；百分比输入 0-100，ROI 输入倍数。</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              aria-live="polite"
              className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${saveStatus.tone}`}
              data-save-state={loading ? "loading" : saveState}
              data-testid="v2-target-auto-save-status"
            >
              {saveStatus.label}
            </span>
            {saveState === "error" ? (
              <button className="text-xs font-semibold text-blue-700" onClick={() => void persistTargets(editVersion.current)} type="button">重试</button>
            ) : null}
          </div>
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
                    disabled={loading}
                    min="0"
                    onChange={(event) => markTargetDirty(definition.metricKey, event.target.value)}
                    placeholder="未设置"
                    step={definition.format === "integer" ? "1" : "0.01"}
                    type="number"
                    value={values[definition.metricKey] ?? ""}
                  />
                  <span className="ml-1 shrink-0 text-[10px] text-slate-400">{definition.unit}</span>
                </div>
                {record ? (
                  <button
                    className="w-14 shrink-0 text-[11px] font-semibold text-blue-700 disabled:text-slate-300"
                    disabled={loading || saveState === "dirty" || saveState === "saving"}
                    onClick={() => void toggleStatus(record)}
                    type="button"
                  >
                    {record.status === "active" ? "暂停此目标" : "重新启用"}
                  </button>
                ) : <span className="w-14 shrink-0 text-[11px] font-normal text-slate-300">未保存</span>}
              </div>
            );
          })}
        </div>
        {message ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{message}</p> : null}
      </section>

    </div>
  );
}
