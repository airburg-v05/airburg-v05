"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { TargetEmptyState } from "@/components/targets/target-empty-state";
import { TargetForm } from "@/components/targets/target-form";
import { TargetList } from "@/components/targets/target-list";
import { TargetStorageCorruptedState } from "@/components/targets/target-storage-corrupted-state";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { TmallDataContextBar } from "@/components/tmall/tmall-data-context-bar";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  parseTmallSeriesGroupStorage,
  TMALL_SERIES_STORAGE_EVENT,
  TMALL_SERIES_STORAGE_KEY,
} from "@/lib/storage/tmall-series-storage";
import {
  clearTmallTargets,
  createTmallTargetId,
  parseTmallTargetStorage,
  saveTmallTargets,
  TMALL_TARGET_STORAGE_EVENT,
  TMALL_TARGET_STORAGE_KEY,
} from "@/lib/storage/tmall-target-storage";
import { useTmallAnalysisResult } from "@/lib/storage/use-tmall-analysis-result";
import {
  buildTargetDefinition,
  buildTmallTargetPageViewModel,
  deleteTargetById,
  getDefaultTargetPeriodValues,
  updateTargetStatus,
  upsertTarget,
  type TmallTargetFormValues,
} from "@/lib/tmall/view-models/target-page";
import type { TmallSourceStatus } from "@/types/tmall";

const isParsedSource = (status: TmallSourceStatus): boolean => status === "parsed";

const subscribeTargets = (callback: () => void): (() => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(TMALL_TARGET_STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TMALL_TARGET_STORAGE_EVENT, callback);
  };
};

const subscribeSeriesGroups = (callback: () => void): (() => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(TMALL_SERIES_STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(TMALL_SERIES_STORAGE_EVENT, callback);
  };
};

const getTargetSnapshot = (): string | null =>
  window.localStorage.getItem(TMALL_TARGET_STORAGE_KEY);

const getSeriesSnapshot = (): string | null =>
  window.localStorage.getItem(TMALL_SERIES_STORAGE_KEY);

const getServerSnapshot = (): undefined => undefined;

export default function TargetsPage() {
  const analysisState = useTmallAnalysisResult();
  const analysis = analysisState.status === "valid" ? analysisState.result : null;
  const rawTargetStorage = useSyncExternalStore(
    subscribeTargets,
    getTargetSnapshot,
    getServerSnapshot,
  );
  const rawSeriesStorage = useSyncExternalStore(
    subscribeSeriesGroups,
    getSeriesSnapshot,
    getServerSnapshot,
  );
  const targetStorageState = useMemo(
    () => parseTmallTargetStorage(rawTargetStorage),
    [rawTargetStorage],
  );
  const seriesStorageState = useMemo(
    () => parseTmallSeriesGroupStorage(rawSeriesStorage),
    [rawSeriesStorage],
  );
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const defaultPeriods = useMemo(
    () => getDefaultTargetPeriodValues(analysis),
    [analysis],
  );
  const targetViewModel = useMemo(
    () =>
      targetStorageState.status === "valid" || targetStorageState.status === "empty"
        ? buildTmallTargetPageViewModel({
          targets: targetStorageState.targets,
          analysis,
          selectedDate: defaultPeriods.daily,
          seriesGroups: seriesStorageState.status === "valid" ? seriesStorageState.groups : [],
        })
        : null,
    [analysis, defaultPeriods.daily, seriesStorageState, targetStorageState],
  );
  const editingTarget = useMemo(
    () =>
      targetViewModel
        ? [...targetViewModel.storeTargets, ...targetViewModel.productTargets, ...targetViewModel.seriesTargets]
          .find((target) => target.id === editingTargetId) ?? null
        : null,
    [editingTargetId, targetViewModel],
  );

  const handleClearCorruptedTargets = () => {
    const confirmed = window.confirm("确认清除损坏的本地目标数据吗？此操作不会删除四源分析结果。");
    if (!confirmed) return;
    clearTmallTargets();
    setEditingTargetId(null);
    setFormVersion((version) => version + 1);
  };

  const handleSaveTarget = (values: TmallTargetFormValues) => {
    if (targetStorageState.status === "corrupted") return;

    const now = new Date().toISOString();
    const target = buildTargetDefinition({
      values,
      id: editingTarget?.id ?? createTmallTargetId(),
      now,
      existingTarget: editingTarget,
    });

    saveTmallTargets(upsertTarget(targetStorageState.targets, target));
    setEditingTargetId(null);
    setFormVersion((version) => version + 1);
  };

  const handleToggleStatus = (targetId: string) => {
    if (targetStorageState.status === "corrupted") return;
    const target = targetStorageState.targets.find((item) => item.id === targetId);
    if (!target) return;

    saveTmallTargets(
      updateTargetStatus({
        targets: targetStorageState.targets,
        targetId,
        status: target.status === "paused" ? "active" : "paused",
        updatedAt: new Date().toISOString(),
      }),
    );
  };

  const handleDeleteTarget = (targetId: string) => {
    if (targetStorageState.status === "corrupted") return;
    const confirmed = window.confirm("确认删除这个目标吗？此操作不会删除四源分析结果或其他目标。");
    if (!confirmed) return;

    saveTmallTargets(deleteTargetById(targetStorageState.targets, targetId));
    if (editingTargetId === targetId) {
      setEditingTargetId(null);
      setFormVersion((version) => version + 1);
    }
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫目标管理"
        title="目标管理"
        description="设置店铺、宝贝和系列经营目标，并基于当前四源安全聚合结果查看目标完成情况。"
        action={<StatusPill tone="info">目标管理基础版</StatusPill>}
      />

      {analysisState.status === "loading" ? <LoadingState /> : null}

      {analysis ? (
        <TmallDataContextBar
          analysisTimestamp={analysis.analysisTimestamp}
          selectedDate={defaultPeriods.daily}
          sourceCount={Object.values(analysis.sourceHealth).filter((source) => isParsedSource(source.status)).length}
          dataQualityWarningCount={analysis.dataQualityWarnings.length}
          qualityLinkHref="/upload"
          extraItems={[
            { label: "店铺目标", value: targetViewModel?.storeTargets.length ?? 0 },
            { label: "宝贝目标", value: targetViewModel?.productTargets.length ?? 0 },
            { label: "系列目标", value: targetViewModel?.seriesTargets.length ?? 0 },
          ]}
        />
      ) : null}

      {analysisState.status === "empty" ? <MissingAnalysisNotice /> : null}

      {analysisState.status === "corrupted" ? <TmallCorruptedResultState /> : null}

      {targetStorageState.status === "corrupted" ? (
        <TargetStorageCorruptedState onClear={handleClearCorruptedTargets} />
      ) : null}

      {targetViewModel ? (
        <>
          <TargetScopeSummary />

          {seriesStorageState.status === "corrupted" ? <SeriesStorageNotice /> : null}

          <TargetForm
            key={`${editingTarget?.id ?? `new-${formVersion}`}-${defaultPeriods.daily}-${defaultPeriods.monthly}`}
            defaultPeriods={defaultPeriods}
            productOptions={targetViewModel.productOptions}
            seriesOptions={targetViewModel.seriesOptions}
            seriesStorageStatus={seriesStorageState.status}
            editingTarget={editingTarget}
            onSubmit={handleSaveTarget}
            onCancelEdit={() => {
              setEditingTargetId(null);
              setFormVersion((version) => version + 1);
            }}
          />

          <TargetList
            title="店铺目标列表"
            description="展示 scope 为 store 的目标，基于店铺经营、计划推广和售后聚合结果计算完成率。"
            emptyTitle="暂无店铺目标，请先创建一个店铺目标。"
            emptyDescription="店铺目标可用于跟踪 GMV、GSV、访客、转化率、客单价、退款率和推广指标。"
            progressItems={targetViewModel.storeProgressItems}
            onEdit={setEditingTargetId}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteTarget}
          />

          <TargetList
            title="宝贝目标列表"
            description="展示 scope 为 product 的目标，宝贝推广目标只使用商品推广数据。"
            emptyTitle="暂无宝贝目标，请先创建一个宝贝目标。"
            emptyDescription="宝贝目标只保存商品 ID；商品名称仅来自当前商品池展示，不写入目标存储。"
            progressItems={targetViewModel.productProgressItems}
            productOptions={targetViewModel.productOptions}
            onEdit={setEditingTargetId}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteTarget}
          />

          <TargetList
            title="系列目标列表"
            description="展示 scope 为 series 的目标，系列经营和推广目标按系列商品 ID 聚合计算。"
            emptyTitle="暂无系列目标，请先创建一个系列目标。"
            emptyDescription="系列目标只保存 seriesId；系列名称仅来自当前系列分组展示，不写入目标存储。"
            progressItems={targetViewModel.seriesProgressItems}
            seriesOptions={targetViewModel.seriesOptions}
            onEdit={setEditingTargetId}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteTarget}
          />
        </>
      ) : null}
    </div>
  );
}

function TargetScopeSummary() {
  return (
    <SectionCard title="目标范围说明">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
        <p className="font-semibold">当前支持</p>
        <p>店铺目标、宝贝目标、系列目标</p>
      </div>
    </SectionCard>
  );
}

function SeriesStorageNotice() {
  return (
    <SectionCard title="系列分组数据不可用">
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        <p>系列分组数据不可用，请先到系列看板检查系列分组。</p>
        <a href="/series-board" className="mt-2 inline-flex font-semibold text-amber-900 underline">
          前往系列看板
        </a>
      </div>
    </SectionCard>
  );
}

function LoadingState() {
  return (
    <SectionCard>
      <div className="flex min-h-[180px] items-center justify-center text-center">
        <div>
          <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          <p className="mt-4 text-sm font-semibold text-slate-900">
            正在读取本地目标和四源分析结果。
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function MissingAnalysisNotice() {
  return (
    <TargetEmptyState
      title="暂无实际值，请先上传天猫经营、推广和售后数据。"
      description="目标设置可以独立保存；上传四源数据后，系统会自动计算店铺、宝贝和系列目标完成情况。"
      actionHref="/upload"
      actionLabel="前往数据上传"
    />
  );
}
