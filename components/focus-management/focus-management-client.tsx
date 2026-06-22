"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  createSeriesMutation,
  createTrackedProductMutation,
  filterProductCandidates,
  loadFocusManagementContext,
  saveFocusManagementChange,
  setSeriesStatusMutation,
  setTrackedProductStatusMutation,
  updateSeriesMutation,
  updateTrackedProductMutation,
  type FocusManagementLoadResult,
  type FocusManagementViewModel,
  type FocusProductCandidate,
  type SeriesDraft,
  type TrackedProductDraft,
} from "@/lib/v05/focus-management";
import type { SeriesRecord, TrackedProductRecord } from "@/lib/v05/domain/models";

type ManagementType = "series" | "tracked";
type DrawerState =
  | { type: "series"; mode: "create"; record: null }
  | { type: "series"; mode: "edit"; record: SeriesRecord }
  | { type: "tracked"; mode: "create"; record: null }
  | { type: "tracked"; mode: "edit"; record: TrackedProductRecord }
  | null;

const emptyViewModel: FocusManagementViewModel = {
  mode: "loading",
  datasetId: null,
  expectedCurrentDatasetId: null,
  storeContext: null,
  series: [],
  trackedProducts: [],
  productCandidates: [],
  notices: ["正在读取当前店铺数据。"],
  primaryActions: [],
  isEmpty: true,
};

const initialLoadResult: FocusManagementLoadResult = {
  status: "empty",
  viewModel: emptyViewModel,
  message: "正在读取当前店铺数据。",
};

const titleOf = (type: ManagementType): string => (type === "series" ? "系列管理" : "重点商品管理");
const eyebrowOf = (type: ManagementType): string => (type === "series" ? "STORE SERIES" : "TRACKED PRODUCTS");
const descriptionOf = (type: ManagementType): string =>
  type === "series"
    ? "按当前平台和店铺维护用户主动创建的系列，系列不会跨店铺共享。"
    : "按当前平台和店铺维护重点商品，不会自动把全部商品加入重点列表。";

const statusTone = (status: string): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (status === "active") return "success";
  if (status === "inactive") return "neutral";
  return "info";
};

const formatTime = (value: string): string => value.replace("T", " ").slice(0, 16);

function SafeState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: Array<{ label: string; href: string }>;
}) {
  return (
    <SectionCard>
      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl bg-slate-50 p-6 text-center">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {actions.map((action) => (
              <Link key={action.href} href={action.href} className="secondary-button">
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function ContextBar({
  type,
  viewModel,
  onStoreHrefChange,
}: {
  type: ManagementType;
  viewModel: FocusManagementViewModel;
  onStoreHrefChange: (href: string) => void;
}) {
  const context = viewModel.storeContext;
  if (!context) return null;
  return (
    <section className="panel p-4" aria-label="当前店铺上下文">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="info">{context.platformLabel}</StatusPill>
            <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{context.storeName}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">店铺</span>
              <select
                className="form-input"
                value={context.storeKey}
                onChange={(event) => {
                  const selected = context.availableStores.find((store) => store.value === event.target.value);
                  if (selected) onStoreHrefChange(selected.href);
                }}
              >
                {context.availableStores.map((store) => (
                  <option key={store.value} value={store.value}>
                    {store.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <p className="text-xs font-semibold text-slate-500">当前范围</p>
              <p className="mt-1 leading-5">
                只管理当前店铺的{type === "series" ? "系列" : "重点商品"}，不会显示其他店铺数据。
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link href={context.storeBoardHref} className="secondary-button">
            返回店铺看板
          </Link>
          <Link href={context.historyHref} className="secondary-button">
            查看导入记录
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProductCandidatePicker({
  candidates,
  selectedIds,
  single,
  lockedProductId,
  onChange,
}: {
  candidates: FocusProductCandidate[];
  selectedIds: string[];
  single?: boolean;
  lockedProductId?: string;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleCandidates = useMemo(
    () => filterProductCandidates({ candidates, query, limit: 50 }),
    [candidates, query],
  );
  const selectedSet = new Set(selectedIds);
  const selectedCandidates = candidates.filter((candidate) => selectedSet.has(candidate.productId));

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-slate-500">搜索商品名称或商品 ID</span>
        <input
          className="form-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入商品名称或 ID"
          disabled={!!lockedProductId}
        />
      </label>

      {selectedCandidates.length > 0 ? (
        <div className="rounded-xl bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700">已选商品</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedCandidates.map((candidate) => (
              <span key={candidate.productId} className="max-w-full rounded-full bg-white px-2.5 py-1 text-xs text-blue-700 ring-1 ring-blue-100">
                <span className="break-words">{candidate.productName}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
        {visibleCandidates.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">当前搜索下没有可选商品。</p>
        ) : (
          visibleCandidates.map((candidate) => {
            const selected = selectedSet.has(candidate.productId);
            const locked = lockedProductId && lockedProductId !== candidate.productId;
            return (
              <button
                key={candidate.productId}
                type="button"
                disabled={!!locked}
                onClick={() => {
                  if (lockedProductId) return;
                  if (single) {
                    onChange([candidate.productId]);
                    return;
                  }
                  onChange(
                    selected
                      ? selectedIds.filter((productId) => productId !== candidate.productId)
                      : [...selectedIds, candidate.productId],
                  );
                }}
                className={`flex w-full min-w-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${
                  selected ? "bg-blue-50" : "bg-white hover:bg-slate-50"
                } ${locked ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-slate-900">{candidate.productName}</span>
                  <span className="mt-1 block truncate text-xs text-slate-400">{candidate.productId}</span>
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {selected ? "已选" : candidate.dataLabel}
                </span>
              </button>
            );
          })
        )}
      </div>
      <p className="text-xs text-slate-500">最多显示 50 条候选；候选来自当前店铺经营商品与商品推广商品的并集。</p>
    </div>
  );
}

function FocusDrawer({
  drawer,
  viewModel,
  saving,
  onClose,
  onSave,
}: {
  drawer: DrawerState;
  viewModel: FocusManagementViewModel;
  saving: boolean;
  onClose: () => void;
  onSave: (mutation: ReturnType<typeof createSeriesMutation>) => void;
}) {
  const [seriesName, setSeriesName] = useState(() => drawer?.type === "series" ? drawer.record?.name ?? "" : "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() =>
    drawer?.type === "series" ? drawer.record?.productIds ?? [] : drawer?.record?.productId ? [drawer.record.productId] : [],
  );
  const [trackedDisplayName, setTrackedDisplayName] = useState(() =>
    drawer?.type === "tracked" ? drawer.record?.displayName ?? "" : "",
  );
  const [dirty, setDirty] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!drawer) return;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!dirty || window.confirm("当前有未保存修改，确认关闭吗？")) onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [dirty, drawer, onClose]);

  if (!drawer) return null;

  const title =
    drawer.type === "series"
      ? drawer.mode === "create"
        ? "新建系列"
        : "编辑系列"
      : drawer.mode === "create"
        ? "添加重点商品"
        : "编辑重点商品";

  const attemptClose = () => {
    if (!dirty || window.confirm("当前有未保存修改，确认关闭吗？")) onClose();
  };

  const submit = () => {
    if (drawer.type === "series") {
      const draft: SeriesDraft = { name: seriesName, productIds: selectedProductIds };
      onSave(
        drawer.mode === "edit" && drawer.record
          ? updateSeriesMutation({ ...draft, seriesId: drawer.record.seriesId })
          : createSeriesMutation(draft),
      );
      return;
    }

    const draft: TrackedProductDraft = {
      productId: selectedProductIds[0] ?? "",
      displayName: trackedDisplayName,
    };
    onSave(
      drawer.mode === "edit" && drawer.record
        ? updateTrackedProductMutation({ ...draft, trackedProductId: drawer.record.trackedProductId })
        : createTrackedProductMutation(draft),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭抽屉遮罩"
        onClick={attemptClose}
      />
      <aside className="relative flex h-full w-full max-w-full flex-col bg-white shadow-xl sm:max-w-[640px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">保存前不会写入本地数据。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="secondary-button shrink-0" onClick={attemptClose}>
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {drawer.type === "series" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">系列名称</span>
              <input
                className="form-input"
                value={seriesName}
                onChange={(event) => {
                  setSeriesName(event.target.value);
                  setDirty(true);
                }}
                placeholder="例如：核心系列"
              />
            </label>
          ) : drawer.mode === "edit" ? (
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">当前商品</p>
              <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                {viewModel.productCandidates.find((candidate) => candidate.productId === drawer.record.productId)?.productName ??
                  drawer.record.productId}
              </p>
              <p className="mt-1 truncate text-xs text-slate-400">{drawer.record.productId}</p>
            </div>
          ) : null}

          <ProductCandidatePicker
            candidates={viewModel.productCandidates}
            selectedIds={selectedProductIds}
            single={drawer.type === "tracked"}
            lockedProductId={drawer.type === "tracked" && drawer.mode === "edit" ? drawer.record.productId : undefined}
            onChange={(ids) => {
              setSelectedProductIds(ids);
              setDirty(true);
            }}
          />

          {drawer.type === "tracked" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">展示名称（可选）</span>
              <input
                className="form-input"
                value={trackedDisplayName}
                onChange={(event) => {
                  setTrackedDisplayName(event.target.value);
                  setDirty(true);
                }}
                placeholder="为空时使用商品原名称"
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button type="button" className="secondary-button" onClick={attemptClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={submit} disabled={saving}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function SeriesList({
  viewModel,
  statusFilter,
  onEdit,
  onStatusChange,
}: {
  viewModel: FocusManagementViewModel;
  statusFilter: "active" | "inactive";
  onEdit: (record: SeriesRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onStatusChange: (record: SeriesRecord, status: SeriesRecord["status"]) => void;
}) {
  const rows = viewModel.series.filter((series) => series.status === statusFilter);
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[760px]">
        <thead>
          <tr>
            <th>系列名称</th>
            <th>状态</th>
            <th>商品数</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center text-slate-500">
                {statusFilter === "active" ? "当前店铺还没有启用中的系列。" : "当前店铺还没有停用系列。"}
              </td>
            </tr>
          ) : (
            rows.map((series) => (
              <tr key={series.seriesId}>
                <td>
                  <p className="break-words font-semibold text-slate-900">{series.name}</p>
                  {series.productIds.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-500">尚未添加商品</p>
                  ) : null}
                </td>
                <td>
                  <StatusPill tone={statusTone(series.status)}>{series.status === "active" ? "启用" : "停用"}</StatusPill>
                </td>
                <td>{series.productIds.length}</td>
                <td>{formatTime(series.updatedAt)}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="secondary-button" onClick={(event) => onEdit(series, event)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onStatusChange(series, series.status === "active" ? "inactive" : "active")}
                    >
                      {series.status === "active" ? "停用" : "重新启用"}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TrackedProductList({
  viewModel,
  statusFilter,
  onEdit,
  onStatusChange,
}: {
  viewModel: FocusManagementViewModel;
  statusFilter: "active" | "inactive";
  onEdit: (record: TrackedProductRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onStatusChange: (record: TrackedProductRecord, status: TrackedProductRecord["status"]) => void;
}) {
  const candidateById = new Map(viewModel.productCandidates.map((candidate) => [candidate.productId, candidate]));
  const rows = viewModel.trackedProducts.filter((product) => product.status === statusFilter);
  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-[820px]">
        <thead>
          <tr>
            <th>展示名称</th>
            <th>商品 ID</th>
            <th>数据状态</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center text-slate-500">
                {statusFilter === "active" ? "当前店铺还没有启用中的重点商品。" : "当前店铺还没有停用重点商品。"}
              </td>
            </tr>
          ) : (
            rows.map((product) => {
              const candidate = candidateById.get(product.productId);
              const displayName = product.displayName ?? candidate?.productName ?? product.productId;
              return (
              <tr key={product.trackedProductId}>
                  <td>
                    <p className="break-words font-semibold text-slate-900">{displayName}</p>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{product.productId}</td>
                  <td>
                    <StatusPill tone={candidate?.hasBusinessData ? "info" : "neutral"}>
                      {candidate?.dataLabel ?? "当前日期未匹配"}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={statusTone(product.status)}>
                      {product.status === "active" ? "启用" : "停用"}
                    </StatusPill>
                  </td>
                  <td>{formatTime(product.updatedAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {product.status === "active" && viewModel.storeContext ? (
                        <Link
                          href={`/product-board?${new URLSearchParams({
                            platform: viewModel.storeContext.platformCode,
                            storeId: viewModel.storeContext.storeId,
                            trackedProductId: product.trackedProductId,
                          }).toString()}`}
                          className="secondary-button"
                        >
                          查看看板
                        </Link>
                      ) : null}
                      <button type="button" className="secondary-button" onClick={(event) => onEdit(product, event)}>
                        编辑
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onStatusChange(product, product.status === "active" ? "inactive" : "active")}
                      >
                        {product.status === "active" ? "停用" : "重新启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function FocusManagementContent({ type }: { type: ManagementType }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platform = searchParams.get("platform");
  const storeId = searchParams.get("storeId");
  const basePath = type === "series" ? "/series-board/manage" : "/product-board/tracked";
  const [loadResult, setLoadResult] = useState<FocusManagementLoadResult>(initialLoadResult);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive">("active");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "danger" | "info"; text: string } | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(async () => {
    const result = await loadFocusManagementContext({ platformCode: platform, storeId, basePath });
    setLoadResult(result);
  }, [basePath, platform, storeId]);

  useEffect(() => {
    let mounted = true;
    loadFocusManagementContext({ platformCode: platform, storeId, basePath })
      .then((result) => {
        if (mounted) setLoadResult(result);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadResult({
          status: "error",
          viewModel: {
            ...emptyViewModel,
            mode: "error",
            notices: ["读取本地多店铺数据失败，请刷新后重试。"],
            primaryActions: [{ label: "数据导入", href: "/upload" }],
          },
          message: "读取本地多店铺数据失败。",
        });
      });
    return () => {
      mounted = false;
    };
  }, [basePath, platform, storeId]);

  const viewModel = loadResult.viewModel;
  const context = viewModel.storeContext;

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  const runSave = async (mutation: ReturnType<typeof createSeriesMutation>) => {
    if (!context) return;
    setSaving(true);
    setFeedback(null);
    const result = await saveFocusManagementChange({
      expectedCurrentDatasetId: viewModel.expectedCurrentDatasetId,
      platformCode: context.platformCode,
      storeId: context.storeId,
      mutation,
    });
    setSaving(false);
    if (result.status === "success") {
      setFeedback({ tone: "success", text: result.message });
      closeDrawer();
      await reload();
      return;
    }
    setFeedback({
      tone: result.status === "conflict" || result.status === "validation_error" ? "warning" : "danger",
      text: result.message,
    });
  };

  const openDrawer = (nextDrawer: DrawerState, event: MouseEvent<HTMLElement>) => {
    lastTriggerRef.current = event.currentTarget;
    setFeedback(null);
    setDrawer(nextDrawer);
  };

  const changeSeriesStatus = async (record: SeriesRecord, status: SeriesRecord["status"]) => {
    const confirmed = window.confirm(status === "inactive" ? "确认停用该系列吗？记录会保留。" : "确认重新启用该系列吗？");
    if (!confirmed) return;
    await runSave(setSeriesStatusMutation({ seriesId: record.seriesId, status }));
  };

  const changeTrackedStatus = async (record: TrackedProductRecord, status: TrackedProductRecord["status"]) => {
    const confirmed = window.confirm(status === "inactive" ? "确认停用该重点商品吗？记录会保留。" : "确认重新启用该重点商品吗？");
    if (!confirmed) return;
    await runSave(setTrackedProductStatusMutation({ trackedProductId: record.trackedProductId, status }));
  };

  const activeCount = type === "series"
    ? viewModel.series.filter((item) => item.status === "active").length
    : viewModel.trackedProducts.filter((item) => item.status === "active").length;
  const inactiveCount = type === "series"
    ? viewModel.series.filter((item) => item.status === "inactive").length
    : viewModel.trackedProducts.filter((item) => item.status === "inactive").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={eyebrowOf(type)}
        title={titleOf(type)}
        description={descriptionOf(type)}
        action={
          <div className="flex flex-wrap gap-2">
            {context ? (
              <button
                type="button"
                className="primary-button"
                onClick={(event) =>
                  openDrawer(
                    type === "series"
                      ? { type: "series", mode: "create", record: null }
                      : { type: "tracked", mode: "create", record: null },
                    event,
                  )
                }
              >
                {type === "series" ? "新建系列" : "添加重点商品"}
              </button>
            ) : null}
            <Link href="/upload" className="secondary-button">
              数据导入
            </Link>
          </div>
        }
      />

      {viewModel.mode === "loading" ? (
        <SafeState title="正在读取当前店铺" description="系统正在检查 active 多店铺数据。" actions={[]} />
      ) : null}

      {viewModel.mode !== "loading" && (loadResult.status === "empty" || loadResult.status === "invalid_store" || loadResult.status === "corrupted" || loadResult.status === "error") ? (
        <SafeState
          title={
            loadResult.status === "invalid_store"
              ? "当前店铺不可用"
              : loadResult.status === "corrupted"
                ? "本地数据不可安全读取"
                : "暂无可管理数据"
          }
          description={viewModel.notices[0] ?? loadResult.message}
          actions={viewModel.primaryActions}
        />
      ) : null}

      {viewModel.mode !== "loading" && loadResult.status === "valid" ? (
        <>
          <ContextBar type={type} viewModel={viewModel} onStoreHrefChange={(href) => router.push(href)} />

          {feedback ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                feedback.tone === "success"
                  ? "border border-emerald-100 bg-emerald-50 text-emerald-700"
                  : feedback.tone === "warning"
                    ? "border border-amber-100 bg-amber-50 text-amber-700"
                    : "border border-rose-100 bg-rose-50 text-rose-700"
              }`}
            >
              {feedback.text}
            </div>
          ) : null}

          <SectionCard
            title={type === "series" ? "系列列表" : "重点商品列表"}
            description={
              type === "series"
                ? "系列允许暂时为空；同店铺同名系列会被阻止。"
                : "重点商品由用户主动添加；同店铺同 productId 只能保留一条记录。"
            }
            action={
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="状态筛选">
                <button
                  type="button"
                  aria-pressed={statusFilter === "active"}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${
                    statusFilter === "active" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                  }`}
                  onClick={() => setStatusFilter("active")}
                >
                  启用中 {activeCount}
                </button>
                <button
                  type="button"
                  aria-pressed={statusFilter === "inactive"}
                  className={`min-h-9 shrink-0 rounded-full px-3 text-sm font-semibold ${
                    statusFilter === "inactive" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                  }`}
                  onClick={() => setStatusFilter("inactive")}
                >
                  已停用 {inactiveCount}
                </button>
              </div>
            }
          >
            {type === "series" ? (
              <SeriesList
                viewModel={viewModel}
                statusFilter={statusFilter}
                onEdit={(record, event) => openDrawer({ type: "series", mode: "edit", record }, event)}
                onStatusChange={changeSeriesStatus}
              />
            ) : (
              <TrackedProductList
                viewModel={viewModel}
                statusFilter={statusFilter}
                onEdit={(record, event) => openDrawer({ type: "tracked", mode: "edit", record }, event)}
                onStatusChange={changeTrackedStatus}
              />
            )}
          </SectionCard>

          <SectionCard title="保存边界" description="本页只保存当前店铺的自定义焦点对象。">
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">不会自动创建系列或重点商品。</div>
              <div className="rounded-xl bg-slate-50 p-3">不会改写 legacy key 或其他店铺数据。</div>
              <div className="rounded-xl bg-slate-50 p-3">售后只使用安全聚合，不展示敏感明细。</div>
            </div>
          </SectionCard>
        </>
      ) : null}

      <FocusDrawer
        key={
          drawer
            ? `${drawer.type}:${drawer.mode}:${
                drawer.type === "series"
                  ? drawer.record?.seriesId ?? "new"
                  : drawer.record?.trackedProductId ?? "new"
              }`
            : "closed"
        }
        drawer={drawer}
        viewModel={viewModel}
        saving={saving}
        onClose={closeDrawer}
        onSave={runSave}
      />
    </div>
  );
}

export function FocusManagementClient({ type }: { type: ManagementType }) {
  return (
    <Suspense fallback={<SafeState title="正在准备页面" description="稍后会读取当前店铺上下文。" actions={[]} />}>
      <FocusManagementContent type={type} />
    </Suspense>
  );
}
