"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  allocateChildTargetMutation,
  buildTargetParentOptions,
  loadTargetManagementContext,
  parentTargetCanAllocate,
  saveTargetManagementChange,
  setTargetStatusMutation,
  targetDirectionLabel,
  upsertTargetMutation,
  type TargetAllocationChildOption,
  type TargetDatasetMutation,
  type TargetDraft,
  type TargetManagementLoadResult,
  type TargetManagementViewModel,
  type TargetParentOption,
} from "@/lib/v05/target-management";
import type { PlatformCode, TargetDirection, TargetPeriodType, TargetRecord, TargetScope } from "@/lib/v05/domain/models";

type DrawerState =
  | { mode: "create"; target: null; trigger: HTMLElement | null }
  | { mode: "edit"; target: TargetRecord; trigger: HTMLElement | null }
  | null;

type AllocationDrawerState = { target: TargetRecord; trigger: HTMLElement | null } | null;

type ParentChoice = "__unset__" | "";

type TargetDraftFormState = Omit<TargetDraft, "targetValue" | "parentTargetId"> & {
  parentTargetId: string | null;
  targetValueText: string;
};

const emptyViewModel: TargetManagementViewModel = {
  mode: "loading",
  datasetId: null,
  expectedCurrentDatasetId: null,
  stores: [],
  seriesOptions: [],
  productOptions: [],
  dailyPeriodOptions: [],
  monthlyPeriodOptions: [],
  targets: [],
  rawTargets: [],
  rawSeries: [],
  metricOptions: [],
  notices: ["正在读取多店铺目标数据。"],
  primaryActions: [],
  isEmpty: true,
};

const initialLoadResult: TargetManagementLoadResult = {
  status: "empty",
  viewModel: emptyViewModel,
  message: "正在读取多店铺目标数据。",
};

const scopeOptions: Array<{ value: TargetScope; label: string }> = [
  { value: "company", label: "公司目标" },
  { value: "store", label: "店铺目标" },
  { value: "series", label: "系列目标" },
  { value: "product", label: "商品目标" },
];

const directionOptions: Array<{ value: TargetDirection; label: string }> = [
  { value: "higher_is_better", label: "越高越好" },
  { value: "lower_is_better", label: "越低越好" },
];

const storeKey = (platformCode: PlatformCode, storeId: string): string => `${platformCode}:${storeId}`;

const parseStoreKey = (value: string): { platformCode: PlatformCode; storeId: string } | null => {
  const [platformCode, storeId] = value.split(":");
  if (!platformCode || !storeId) return null;
  return { platformCode: platformCode as PlatformCode, storeId };
};

const formatNumber = (value: number): string =>
  Number.isFinite(value) ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value) : "--";

const formatTime = (value: string): string => value.replace("T", " ").slice(0, 16);

const toneForStatus = (status: TargetRecord["status"]): "success" | "warning" | "neutral" =>
  status === "active" ? "success" : status === "paused" ? "warning" : "neutral";

const toneForAllocation = (status: string): "success" | "warning" | "danger" | "neutral" => {
  if (status === "fully_allocated") return "success";
  if (status === "over_allocated") return "danger";
  if (status === "under_allocated") return "warning";
  return "neutral";
};

const allocationLabel = (status: string): string => {
  if (status === "fully_allocated") return "已分配完成";
  if (status === "over_allocated") return "超额分配";
  if (status === "under_allocated") return "未分配完";
  return "暂无子目标";
};

const defaultPeriod = (viewModel: TargetManagementViewModel, periodType: TargetPeriodType): string =>
  periodType === "monthly" ? viewModel.monthlyPeriodOptions[0] ?? "" : viewModel.dailyPeriodOptions[0] ?? "";

const createDraft = (viewModel: TargetManagementViewModel, target?: TargetRecord): TargetDraftFormState => {
  const firstStore = viewModel.stores[0];
  if (target) {
    return {
      targetId: target.targetId,
      scope: target.scope,
      parentTargetId: target.parentTargetId ?? null,
      platformCode: target.platformCode,
      storeId: target.storeId,
      seriesId: target.seriesId,
      productId: target.productId,
      periodType: target.periodType,
      periodValue: target.periodValue,
      metricKey: target.metricKey,
      targetValueText: String(target.targetValue),
      direction: target.direction,
    };
  }

  return {
    scope: "company",
    parentTargetId: null,
    platformCode: firstStore?.platformCode,
    storeId: firstStore?.storeId,
    periodType: "daily",
    periodValue: defaultPeriod(viewModel, "daily"),
    metricKey: viewModel.metricOptions[0]?.key ?? "gmv",
    targetValueText: "",
    direction: viewModel.metricOptions[0]?.direction ?? "higher_is_better",
  };
};

const toTargetDraft = (draft: TargetDraftFormState, parentChoice: string): TargetDraft => ({
  targetId: draft.targetId,
  scope: draft.scope,
  parentTargetId: parentChoice === "" ? null : parentChoice,
  platformCode: draft.scope === "company" ? undefined : draft.platformCode,
  storeId: draft.scope === "company" ? undefined : draft.storeId,
  seriesId: draft.scope === "series" ? draft.seriesId : undefined,
  productId: draft.scope === "product" ? draft.productId : undefined,
  periodType: draft.periodType,
  periodValue: draft.periodValue,
  metricKey: draft.metricKey,
  targetValue: Number(draft.targetValueText),
  direction: draft.direction,
});

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

function SummaryStrip({
  viewModel,
  onCreate,
}: {
  viewModel: TargetManagementViewModel;
  onCreate: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const activeCount = viewModel.rawTargets.filter((target) => target.status === "active").length;
  const pausedCount = viewModel.rawTargets.filter((target) => target.status === "paused").length;
  const scopeCounts = scopeOptions.map((scope) => ({
    ...scope,
    count: viewModel.rawTargets.filter((target) => target.scope === scope.value).length,
  }));

  return (
    <section className="panel p-4" aria-label="目标管理概览">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {scopeCounts.map((item) => (
            <div key={item.value} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">{item.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{item.count}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusPill tone="success">启用 {activeCount}</StatusPill>
          <StatusPill tone="warning">暂停 {pausedCount}</StatusPill>
          <button type="button" className="primary-button" onClick={onCreate}>
            新建目标
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        新目标必须明确选择独立目标或合法直接父目标；本页不会自动生成父子关系或自动分配目标值。
      </p>
    </section>
  );
}

function TargetRows({
  viewModel,
  onEdit,
  onAllocate,
  onToggleStatus,
}: {
  viewModel: TargetManagementViewModel;
  onEdit: (target: TargetRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onAllocate: (target: TargetRecord, event: MouseEvent<HTMLButtonElement>) => void;
  onToggleStatus: (target: TargetRecord) => void;
}) {
  return (
    <SectionCard title="目标列表" description="按 scope、归属和周期展示当前 active V2 dataset 中的目标。">
      <div className="overflow-x-auto">
        <table className="data-table min-w-[1100px]">
          <thead>
            <tr>
              <th>目标层级</th>
              <th>归属</th>
              <th>父目标</th>
              <th>指标</th>
              <th>周期</th>
              <th>目标值</th>
              <th>分配状态</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {viewModel.targets.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-slate-500">
                  当前还没有目标，请新建 company、store、series 或 product 目标。
                </td>
              </tr>
            ) : (
              viewModel.targets.map((row) => (
                <tr key={row.target.targetId}>
                  <td>
                    <StatusPill tone="info">{row.scopeLabel}</StatusPill>
                  </td>
                  <td>
                    <p className="max-w-[220px] break-words font-semibold text-slate-900">{row.ownerLabel}</p>
                    {row.target.scope !== "company" ? (
                      <p className="mt-1 truncate text-xs text-slate-400">{row.target.storeId}</p>
                    ) : null}
                  </td>
                  <td>
                    <p className="max-w-[220px] break-words text-sm text-slate-600">{row.parentLabel}</p>
                  </td>
                  <td>
                    <p className="font-semibold text-slate-900">{row.metricLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">{targetDirectionLabel(row.target.direction)}</p>
                  </td>
                  <td>{row.periodLabel}</td>
                  <td>{row.valueLabel}</td>
                  <td>
                    {row.allocationSummary ? (
                      <div className="space-y-1">
                        <StatusPill tone={toneForAllocation(row.allocationSummary.allocationStatus)}>
                          {allocationLabel(row.allocationSummary.allocationStatus)}
                        </StatusPill>
                        <p className="text-xs text-slate-500">
                          父目标 {formatNumber(row.allocationSummary.parentTargetValue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          启用已分配 {formatNumber(row.allocationSummary.activeAllocatedValue)}，暂停已分配{" "}
                          {formatNumber(row.allocationSummary.pausedAllocatedValue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          剩余 {formatNumber(row.allocationSummary.remainingValue)}，超额{" "}
                          {formatNumber(row.allocationSummary.overAllocatedValue)}
                        </p>
                        <p className="text-xs text-slate-500">
                          启用子目标 {row.allocationSummary.activeChildCount}，暂停子目标{" "}
                          {row.allocationSummary.pausedChildCount}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td>
                    <StatusPill tone={toneForStatus(row.target.status)}>{row.statusLabel}</StatusPill>
                  </td>
                  <td>{formatTime(row.target.updatedAt)}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="secondary-button" onClick={(event) => onEdit(row.target, event)}>
                        编辑
                      </button>
                      {parentTargetCanAllocate(row.target) ? (
                        <button type="button" className="secondary-button" onClick={(event) => onAllocate(row.target, event)}>
                          分配子目标
                        </button>
                      ) : null}
                      {row.target.status === "deleted" ? null : (
                        <button type="button" className="secondary-button" onClick={() => onToggleStatus(row.target)}>
                          {row.target.status === "paused" ? "重新启用" : "暂停"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TargetDrawer({
  drawer,
  viewModel,
  saving,
  onClose,
  onSave,
}: {
  drawer: DrawerState;
  viewModel: TargetManagementViewModel;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: TargetDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TargetDraftFormState>(() => createDraft(viewModel, drawer?.target ?? undefined));
  const [parentChoice, setParentChoice] = useState<string | ParentChoice>(() =>
    drawer?.mode === "edit" ? drawer.target.parentTargetId ?? "" : "__unset__",
  );
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedStoreKey = draft.platformCode && draft.storeId ? storeKey(draft.platformCode, draft.storeId) : "";
  const scopedSeries = viewModel.seriesOptions.filter(
    (series) => series.platformCode === draft.platformCode && series.storeId === draft.storeId,
  );
  const scopedProducts = viewModel.productOptions.filter(
    (product) => product.platformCode === draft.platformCode && product.storeId === draft.storeId,
  );
  const parentOptions: TargetParentOption[] = useMemo(
    () =>
      buildTargetParentOptions({
        targets: viewModel.rawTargets,
        series: viewModel.rawSeries,
        draft: {
          ...toTargetDraft(draft, parentChoice === "__unset__" ? "" : parentChoice),
          parentTargetId: parentChoice === "__unset__" || parentChoice === "" ? null : parentChoice,
        },
      }),
    [draft, parentChoice, viewModel.rawSeries, viewModel.rawTargets],
  );

  const setPatch = (patch: Partial<TargetDraftFormState>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setFormError(null);
  };

  const selectFirstStore = () => {
    const firstStore = viewModel.stores[0];
    return firstStore ? { platformCode: firstStore.platformCode, storeId: firstStore.storeId } : {};
  };

  const setScope = (scope: TargetScope) => {
    const owner = scope === "company" ? { platformCode: undefined, storeId: undefined } : selectFirstStore();
    setDraft({
      ...draft,
      scope,
      ...owner,
      seriesId: undefined,
      productId: undefined,
      periodValue: draft.periodValue || defaultPeriod(viewModel, draft.periodType),
    });
    setParentChoice(drawer?.mode === "edit" ? "" : "__unset__");
    setDirty(true);
    setFormError(null);
  };

  const setStore = (value: string) => {
    const parsed = parseStoreKey(value);
    if (!parsed) return;
    setPatch({
      platformCode: parsed.platformCode,
      storeId: parsed.storeId,
      seriesId: undefined,
      productId: undefined,
    });
    setParentChoice(drawer?.mode === "edit" ? "" : "__unset__");
  };

  const setMetric = (metricKey: string) => {
    const metric = viewModel.metricOptions.find((option) => option.key === metricKey);
    setPatch({ metricKey, direction: metric?.direction ?? draft.direction });
    setParentChoice(drawer?.mode === "edit" ? "" : "__unset__");
  };

  const setPeriodType = (periodType: TargetPeriodType) => {
    setPatch({ periodType, periodValue: defaultPeriod(viewModel, periodType) });
    setParentChoice(drawer?.mode === "edit" ? "" : "__unset__");
  };

  const attemptClose = useCallback(() => {
    if (!dirty || window.confirm("当前有未保存修改，确认关闭吗？")) onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!drawer) return;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        attemptClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [attemptClose, drawer]);

  if (!drawer) return null;

  const submit = async () => {
    if (drawer.mode === "create" && parentChoice === "__unset__") {
      setFormError("请明确选择独立目标或合法父目标。");
      return;
    }
    await onSave(toTargetDraft(draft, parentChoice === "__unset__" ? "" : parentChoice));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label={drawer.mode === "create" ? "新建目标" : "编辑目标"}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭抽屉遮罩" onClick={attemptClose} />
      <aside className="relative flex h-full w-full max-w-full flex-col bg-white shadow-xl sm:max-w-[640px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{drawer.mode === "create" ? "新建目标" : "编辑目标"}</h2>
            <p className="mt-1 text-sm text-slate-500">保存前不会写入本地数据。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="secondary-button shrink-0" onClick={attemptClose}>
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {formError ? <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{formError}</div> : null}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">目标层级</span>
            <select className="form-input" value={draft.scope} disabled={drawer.mode === "edit"} onChange={(event) => setScope(event.target.value as TargetScope)}>
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {draft.scope !== "company" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">平台和店铺</span>
              <select className="form-input" value={selectedStoreKey} onChange={(event) => setStore(event.target.value)}>
                {viewModel.stores.map((store) => (
                  <option key={store.value} value={store.value}>
                    {store.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {draft.scope === "series" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">系列</span>
              <select
                className="form-input"
                value={draft.seriesId ?? ""}
                onChange={(event) => {
                  setPatch({ seriesId: event.target.value || undefined });
                  setParentChoice(drawer.mode === "edit" ? "" : "__unset__");
                }}
              >
                <option value="">请选择系列</option>
                {scopedSeries.map((series) => (
                  <option key={series.value} value={series.seriesId}>
                    {series.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {draft.scope === "product" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">商品</span>
              <select
                className="form-input"
                value={draft.productId ?? ""}
                onChange={(event) => {
                  setPatch({ productId: event.target.value || undefined });
                  setParentChoice(drawer.mode === "edit" ? "" : "__unset__");
                }}
              >
                <option value="">请选择商品</option>
                {scopedProducts.slice(0, 200).map((product) => (
                  <option key={product.value} value={product.productId}>
                    {product.label} / {product.productId} / {product.dataLabel}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">候选来自当前店铺经营商品与商品推广商品的并集，最多显示 200 条。</span>
            </label>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">指标</span>
              <select className="form-input" value={draft.metricKey} onChange={(event) => setMetric(event.target.value)}>
                {viewModel.metricOptions.map((metric) => (
                  <option key={metric.key} value={metric.key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">指标方向</span>
              <select
                className="form-input"
                value={draft.direction}
                onChange={(event) => {
                  setPatch({ direction: event.target.value as TargetDirection });
                  setParentChoice(drawer.mode === "edit" ? "" : "__unset__");
                }}
              >
                {directionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">目标周期</span>
              <select className="form-input" value={draft.periodType} onChange={(event) => setPeriodType(event.target.value as TargetPeriodType)}>
                <option value="daily">日目标</option>
                <option value="monthly">月目标</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">周期值</span>
              <input
                className="form-input"
                value={draft.periodValue}
                onChange={(event) => {
                  setPatch({ periodValue: event.target.value });
                  setParentChoice(drawer.mode === "edit" ? "" : "__unset__");
                }}
                placeholder={draft.periodType === "daily" ? "YYYY-MM-DD" : "YYYY-MM"}
                list={draft.periodType === "daily" ? "target-daily-periods" : "target-monthly-periods"}
              />
              <datalist id="target-daily-periods">
                {viewModel.dailyPeriodOptions.map((date) => (
                  <option key={date} value={date} />
                ))}
              </datalist>
              <datalist id="target-monthly-periods">
                {viewModel.monthlyPeriodOptions.map((month) => (
                  <option key={month} value={month} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">目标值</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={draft.targetValueText}
              onChange={(event) => setPatch({ targetValueText: event.target.value })}
              placeholder="请输入大于 0 的目标值"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">父目标关系</span>
            <select
              className="form-input"
              value={parentChoice}
              onChange={(event) => {
                setParentChoice(event.target.value);
                setDirty(true);
                setFormError(null);
              }}
            >
              {drawer.mode === "create" ? <option value="__unset__">请选择父目标关系</option> : null}
              {parentOptions.map((option) => (
                <option key={option.value || "standalone"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              只展示与当前层级、归属、指标、周期和方向匹配的直接父目标；比例类指标仅支持独立目标。
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button type="button" className="secondary-button" onClick={attemptClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={submit} disabled={saving}>
            {saving ? "保存中" : "保存目标"}
          </button>
        </div>
      </aside>
    </div>
  );
}

const childScopeLabel = (option: TargetAllocationChildOption): string => {
  if (option.childScope === "store") return "店铺目标";
  if (option.childScope === "series") return "系列目标";
  return "商品目标";
};

function AllocationDrawer({
  drawer,
  viewModel,
  saving,
  onClose,
  onSave,
}: {
  drawer: AllocationDrawerState;
  viewModel: TargetManagementViewModel;
  saving: boolean;
  onClose: () => void;
  onSave: (parentTargetId: string, childOptionValue: string, targetValue: number) => Promise<void>;
}) {
  const row = drawer ? viewModel.targets.find((item) => item.target.targetId === drawer.target.targetId) : null;
  const options = row?.allocationChildOptions ?? [];
  const [childOptionValue, setChildOptionValue] = useState("");
  const [targetValueText, setTargetValueText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedOption = options.find((option) => option.value === childOptionValue);
  const targetValue = Number(targetValueText);
  const projectedActiveAllocated =
    row?.allocationSummary && Number.isFinite(targetValue)
      ? row.allocationSummary.activeAllocatedValue + targetValue
      : null;
  const projectedOverAllocated =
    row?.allocationSummary && projectedActiveAllocated !== null
      ? Math.max(projectedActiveAllocated - row.allocationSummary.parentTargetValue, 0)
      : 0;

  const attemptClose = useCallback(() => {
    if (!dirty || window.confirm("当前有未保存修改，确认关闭吗？")) onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!drawer) return;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        attemptClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [attemptClose, drawer]);

  if (!drawer || !row) return null;

  const submit = async () => {
    if (!selectedOption) {
      setFormError("请选择合法的直接子目标归属。");
      return;
    }
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      setFormError("子目标值必须大于 0。");
      return;
    }
    await onSave(drawer.target.targetId, selectedOption.value, targetValue);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="分配子目标">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭分配抽屉遮罩" onClick={attemptClose} />
      <aside className="relative flex h-full w-full max-w-full flex-col bg-white shadow-xl sm:max-w-[640px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">分配子目标</h2>
            <p className="mt-1 text-sm text-slate-500">只创建当前父目标的合法直接子目标，不自动分配数值。</p>
          </div>
          <button ref={closeButtonRef} type="button" className="secondary-button shrink-0" onClick={attemptClose}>
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {formError ? <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{formError}</div> : null}

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">父目标</p>
            <p className="mt-1 break-words text-sm font-semibold text-slate-950">{row.ownerLabel}</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">父目标值</p>
                <p className="font-semibold text-slate-900">{formatNumber(row.allocationSummary?.parentTargetValue ?? drawer.target.targetValue)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">allocationStatus</p>
                <StatusPill tone={toneForAllocation(row.allocationSummary?.allocationStatus ?? "none")}>
                  {allocationLabel(row.allocationSummary?.allocationStatus ?? "none")}
                </StatusPill>
              </div>
              <div>
                <p className="text-xs text-slate-500">启用已分配</p>
                <p className="font-semibold text-slate-900">{formatNumber(row.allocationSummary?.activeAllocatedValue ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">暂停已分配</p>
                <p className="font-semibold text-slate-900">{formatNumber(row.allocationSummary?.pausedAllocatedValue ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">剩余值</p>
                <p className="font-semibold text-slate-900">{formatNumber(row.allocationSummary?.remainingValue ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">超额值</p>
                <p className="font-semibold text-slate-900">{formatNumber(row.allocationSummary?.overAllocatedValue ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">子目标数量</p>
                <p className="font-semibold text-slate-900">
                  启用 {row.allocationSummary?.activeChildCount ?? 0} / 暂停 {row.allocationSummary?.pausedChildCount ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500">锁定口径</p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="block text-xs text-slate-500">指标</span>
                <span className="font-semibold text-slate-900">{row.metricLabel}</span>
              </p>
              <p>
                <span className="block text-xs text-slate-500">周期</span>
                <span className="font-semibold text-slate-900">{row.periodLabel}</span>
              </p>
              <p>
                <span className="block text-xs text-slate-500">方向</span>
                <span className="font-semibold text-slate-900">{targetDirectionLabel(drawer.target.direction)}</span>
              </p>
              <p>
                <span className="block text-xs text-slate-500">父子层级</span>
                <span className="font-semibold text-slate-900">
                  {selectedOption ? childScopeLabel(selectedOption) : "选择后确认"}
                </span>
              </p>
            </div>
          </div>

          {options.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              当前父目标没有可继续分配的直接子对象，或该子对象已经存在同口径目标。
            </div>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">直接子目标归属</span>
              <select
                className="form-input"
                value={childOptionValue}
                onChange={(event) => {
                  setChildOptionValue(event.target.value);
                  setDirty(true);
                  setFormError(null);
                }}
              >
                <option value="">请选择直接子目标</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} / {option.description}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                company 只能分配到 store，store 只能分配到同店系列，series 只能分配到该系列商品。
              </span>
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-500">子目标值</span>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={targetValueText}
              onChange={(event) => {
                setTargetValueText(event.target.value);
                setDirty(true);
                setFormError(null);
              }}
              placeholder="手动填写子目标值"
            />
          </label>

          {selectedOption && Number.isFinite(targetValue) && targetValue > 0 ? (
            projectedOverAllocated > 0 ? (
              <div className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-700">
                保存后启用子目标将超出父目标 {formatNumber(projectedOverAllocated)}。系统允许保存，但请确认这是有意的超额分配。
              </div>
            ) : (
              <div className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-700">
                保存后启用已分配将为 {formatNumber(projectedActiveAllocated ?? 0)}，剩余{" "}
                {formatNumber(Math.max((row.allocationSummary?.parentTargetValue ?? drawer.target.targetValue) - (projectedActiveAllocated ?? 0), 0))}。
              </div>
            )
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button type="button" className="secondary-button" onClick={attemptClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={submit} disabled={saving || options.length === 0}>
            {saving ? "保存中" : "保存子目标"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function TargetManagementPageInner() {
  const [loadResult, setLoadResult] = useState<TargetManagementLoadResult>(initialLoadResult);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [allocationDrawer, setAllocationDrawer] = useState<AllocationDrawerState>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "danger"; message: string } | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await loadTargetManagementContext();
    setLoadResult(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTargetManagementContext().then((result) => {
      if (cancelled) return;
      setLoadResult(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeDrawer = useCallback(() => {
    const trigger = drawer?.trigger ?? lastTriggerRef.current;
    setDrawer(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }, [drawer]);

  const closeAllocationDrawer = useCallback(() => {
    const trigger = allocationDrawer?.trigger ?? lastTriggerRef.current;
    setAllocationDrawer(null);
    window.setTimeout(() => trigger?.focus(), 0);
  }, [allocationDrawer]);

  const runSave = async (mutation: TargetDatasetMutation, onSuccess?: () => void) => {
    const expectedCurrentDatasetId = loadResult.viewModel.expectedCurrentDatasetId;
    if (!expectedCurrentDatasetId) {
      setFeedback({ tone: "danger", message: "当前没有可写入的 active 数据。" });
      return;
    }
    setSaving(true);
    const result = await saveTargetManagementChange({ expectedCurrentDatasetId, mutation });
    setSaving(false);
    setFeedback({
      tone: result.status === "success" ? "success" : result.status === "conflict" ? "warning" : "danger",
      message: result.message,
    });
    if (result.status === "success") {
      onSuccess?.();
      await reload();
    }
  };

  const openCreate = (event: MouseEvent<HTMLButtonElement>) => {
    lastTriggerRef.current = event.currentTarget;
    setDrawer({ mode: "create", target: null, trigger: event.currentTarget });
  };

  const openEdit = (target: TargetRecord, event: MouseEvent<HTMLButtonElement>) => {
    lastTriggerRef.current = event.currentTarget;
    setDrawer({ mode: "edit", target, trigger: event.currentTarget });
  };

  const openAllocate = (target: TargetRecord, event: MouseEvent<HTMLButtonElement>) => {
    lastTriggerRef.current = event.currentTarget;
    setAllocationDrawer({ target, trigger: event.currentTarget });
  };

  const toggleStatus = async (target: TargetRecord) => {
    await runSave(setTargetStatusMutation({
      targetId: target.targetId,
      status: target.status === "paused" ? "active" : "paused",
    }));
  };

  const saveDraft = async (draft: TargetDraft) => {
    await runSave(upsertTargetMutation(draft), closeDrawer);
  };

  const saveAllocation = async (parentTargetId: string, childOptionValue: string, targetValue: number) => {
    await runSave(allocateChildTargetMutation({ parentTargetId, childOptionValue, targetValue }), closeAllocationDrawer);
  };

  const viewModel = loadResult.viewModel;
  const safeState =
    !loading && loadResult.status !== "valid"
      ? {
          title:
            loadResult.status === "corrupted"
              ? "本地目标数据暂不可安全读取"
              : loadResult.status === "error"
                ? "目标管理暂时无法打开"
                : "当前还没有多店铺数据",
          description: loadResult.message,
          actions: viewModel.primaryActions,
        }
      : null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="TARGET CENTER"
        title="目标管理"
        description="按公司、店铺、系列和商品四级维护目标。父子关系必须显式选择，本页不自动生成或分配目标。"
        action={<StatusPill tone={loadResult.status === "valid" ? "info" : "neutral"}>{loading ? "读取中" : loadResult.status === "valid" ? "V2 数据" : "待处理"}</StatusPill>}
      />

      {feedback ? (
        <div
          className={`rounded-xl p-3 text-sm ${
            feedback.tone === "success"
              ? "bg-emerald-50 text-emerald-700"
              : feedback.tone === "warning"
                ? "bg-amber-50 text-amber-700"
                : "bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {loading ? <SafeState title="正在读取目标数据" description="正在从 active V2 dataset 加载目标管理上下文。" actions={[]} /> : null}

      {safeState ? <SafeState title={safeState.title} description={safeState.description} actions={safeState.actions} /> : null}

      {!loading && loadResult.status === "valid" ? (
        <>
          <SummaryStrip viewModel={viewModel} onCreate={openCreate} />
          {viewModel.notices.length > 0 ? (
            <SectionCard>
              <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                {viewModel.notices.map((notice) => (
                  <p key={notice}>{notice}</p>
                ))}
              </div>
            </SectionCard>
          ) : null}
          <TargetRows viewModel={viewModel} onEdit={openEdit} onAllocate={openAllocate} onToggleStatus={toggleStatus} />
        </>
      ) : null}

      <TargetDrawer drawer={drawer} viewModel={viewModel} saving={saving} onClose={closeDrawer} onSave={saveDraft} />
      {allocationDrawer ? (
        <AllocationDrawer
          key={allocationDrawer.target.targetId}
          drawer={allocationDrawer}
          viewModel={viewModel}
          saving={saving}
          onClose={closeAllocationDrawer}
          onSave={saveAllocation}
        />
      ) : null}
    </div>
  );
}

export function TargetManagementClient() {
  return (
    <Suspense fallback={<SafeState title="正在读取目标数据" description="正在加载目标管理页面。" actions={[]} />}>
      <TargetManagementPageInner />
    </Suspense>
  );
}
