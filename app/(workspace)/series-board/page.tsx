"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SeriesAfterSalesSummary } from "@/components/series-board/series-after-sales-summary";
import { SeriesAudienceSummary } from "@/components/series-board/series-audience-summary";
import { SeriesCurrentSummary } from "@/components/series-board/series-current-summary";
import { SeriesEmptyState } from "@/components/series-board/series-empty-state";
import { SeriesGroupForm } from "@/components/series-board/series-group-form";
import { SeriesGroupList } from "@/components/series-board/series-group-list";
import { SeriesMetricGrid } from "@/components/series-board/series-metric-grid";
import { SeriesProductPool } from "@/components/series-board/series-product-pool";
import { SeriesProductTable } from "@/components/series-board/series-product-table";
import { SeriesTargetSummary } from "@/components/series-board/series-target-summary";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { TmallDataContextBar } from "@/components/tmall/tmall-data-context-bar";
import { TmallGlobalDataStatusGuide } from "@/components/tmall/tmall-global-data-status-guide";
import { TrendCard } from "@/components/trends/trend-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  clearTmallSeriesGroups,
  createTmallSeriesGroupId,
  loadTmallSeriesGroups,
  saveTmallSeriesGroups,
  TMALL_SERIES_STORAGE_EVENT,
  type TmallSeriesGroup,
  type TmallSeriesGroupStorageParseResult,
  type TmallSeriesGroupStorageStatus,
} from "@/lib/storage/tmall-series-storage";
import {
  parseTmallTargetStorage,
  TMALL_TARGET_STORAGE_EVENT,
  TMALL_TARGET_STORAGE_KEY,
} from "@/lib/storage/tmall-target-storage";
import { useTmallAnalysisResult } from "@/lib/storage/use-tmall-analysis-result";
import { buildTmallGlobalDataStatusGuide } from "@/lib/tmall/view-models/global-data-status-guide";
import { buildTmallSeriesBoardOverview } from "@/lib/tmall/view-models/series-board";
import { buildTmallSeriesTargetSummary } from "@/lib/tmall/view-models/series-target-summary";
import { buildTmallSeriesTrendSection } from "@/lib/tmall/view-models/series-trend-section";
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

const getTargetSnapshot = (): string | null =>
  window.localStorage.getItem(TMALL_TARGET_STORAGE_KEY);

const getServerSnapshot = (): undefined => undefined;

export default function SeriesBoardPage() {
  const analysisState = useTmallAnalysisResult();
  const analysis = analysisState.status === "valid" ? analysisState.result : null;
  const rawTargetStorage = useSyncExternalStore(
    subscribeTargets,
    getTargetSnapshot,
    getServerSnapshot,
  );
  const targetStorageState = useMemo(
    () => parseTmallTargetStorage(rawTargetStorage),
    [rawTargetStorage],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [seriesGroups, setSeriesGroups] = useState<TmallSeriesGroup[]>([]);
  const [seriesStorageStatus, setSeriesStorageStatus] =
    useState<TmallSeriesGroupStorageStatus>("empty");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [formRevision, setFormRevision] = useState(0);

  useEffect(() => {
    const loadSeries = () => {
      const result = loadTmallSeriesGroups();
      setSeriesStorageStatus(result.status);
      setSeriesGroups(result.groups);
      if (result.status === "corrupted") {
        setEditingGroupId(null);
      }
    };

    loadSeries();
    window.addEventListener("storage", loadSeries);
    window.addEventListener(TMALL_SERIES_STORAGE_EVENT, loadSeries);

    return () => {
      window.removeEventListener("storage", loadSeries);
      window.removeEventListener(TMALL_SERIES_STORAGE_EVENT, loadSeries);
    };
  }, []);

  const overview = useMemo(
    () =>
      analysis
        ? buildTmallSeriesBoardOverview(analysis, selectedDate, seriesGroups, selectedSeriesId)
        : null,
    [analysis, selectedDate, selectedSeriesId, seriesGroups],
  );
  const trendSection = useMemo(
    () =>
      analysis && overview?.selectedSeries
        ? buildTmallSeriesTrendSection(
            analysis,
            overview.selectedSeries.group.productIds,
            overview.selectedSeries.group.name,
          )
        : null,
    [analysis, overview],
  );
  const targetSummary = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallSeriesTargetSummary({
          targets: targetStorageState.targets,
          analysis,
          seriesGroups,
          seriesId: overview?.selectedSeriesId ?? null,
        }),
    [analysis, overview?.selectedSeriesId, seriesGroups, targetStorageState],
  );
  const seriesStorageState = useMemo<TmallSeriesGroupStorageParseResult>(
    () => ({ status: seriesStorageStatus, groups: seriesGroups }),
    [seriesGroups, seriesStorageStatus],
  );
  const globalDataStatusGuide = useMemo(
    () =>
      buildTmallGlobalDataStatusGuide({
        analysisStatus: analysisState.status,
        analysis,
        targetStorageState,
        seriesStorageState,
        selectedDate: overview?.selectedDate ?? null,
      }),
    [analysis, analysisState.status, overview?.selectedDate, seriesStorageState, targetStorageState],
  );
  const editingGroup =
    editingGroupId ? seriesGroups.find((group) => group.id === editingGroupId) ?? null : null;

  const handleDateChange = (date: string) => {
    setSelectedDate(date || null);
  };

  const persistGroups = (groups: TmallSeriesGroup[]) => {
    saveTmallSeriesGroups(groups);
    setSeriesGroups(groups);
    setSeriesStorageStatus("valid");
  };

  const handleSaveGroup = (input: {
    id?: string;
    name: string;
    description: string;
    productIds: string[];
  }) => {
    if (seriesStorageStatus === "corrupted") return;

    const now = new Date().toISOString();
    const uniqueProductIds = [...new Set(input.productIds.map(String))];
    const existingGroup = input.id
      ? seriesGroups.find((group) => group.id === input.id)
      : null;
    const nextGroup: TmallSeriesGroup = {
      id: existingGroup?.id ?? createTmallSeriesGroupId(),
      name: input.name,
      description: input.description || undefined,
      productIds: uniqueProductIds,
      createdAt: existingGroup?.createdAt ?? now,
      updatedAt: now,
    };
    const nextGroups = existingGroup
      ? seriesGroups.map((group) => (group.id === existingGroup.id ? nextGroup : group))
      : [nextGroup, ...seriesGroups];

    persistGroups(nextGroups);
    setEditingGroupId(null);
    setSelectedSeriesId(nextGroup.id);
    setFormRevision((current) => current + 1);
  };

  const handleDeleteGroup = (groupId: string) => {
    const group = seriesGroups.find((item) => item.id === groupId);
    if (!group) return;

    const confirmed = window.confirm(`确认删除系列“${group.name}”？这只会删除系列配置，不会删除四源分析结果或商品数据。`);
    if (!confirmed) return;

    persistGroups(seriesGroups.filter((item) => item.id !== groupId));
    if (editingGroupId === groupId) {
      setEditingGroupId(null);
    }
    if (selectedSeriesId === groupId) {
      setSelectedSeriesId(null);
    }
  };

  const handleClearCorruptedGroups = () => {
    const confirmed = window.confirm("确认清除损坏的系列分组数据？这不会删除四源分析结果。");
    if (!confirmed) return;

    clearTmallSeriesGroups();
    setSeriesGroups([]);
    setSeriesStorageStatus("empty");
    setEditingGroupId(null);
    setSelectedSeriesId(null);
    setFormRevision((current) => current + 1);
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫系列管理"
        title="系列看板"
        description="基于天猫四源安全聚合结果，查看系列经营、推广、获客、售后和商品明细汇总。"
        action={<StatusPill tone="info">真实数据基础版</StatusPill>}
      />

      <TmallGlobalDataStatusGuide guide={globalDataStatusGuide} />

      {analysisState.status === "loading" ? (
        <SeriesEmptyState
          title="正在读取本地四源分析结果"
          description="读取完成后会显示系列分组和系列分析。"
          showAction={false}
        />
      ) : null}

      {analysisState.status === "empty" ? (
        <SeriesEmptyState
          title="还没有天猫四源分析结果，请先上传天猫经营、推广和售后数据。"
          description="上传完成后，系列看板会读取商品池并支持系列分组分析。"
        />
      ) : null}

      {analysisState.status === "corrupted" ? <TmallCorruptedResultState /> : null}

      {overview?.missingBusinessData ? (
        <SeriesEmptyState
          title="当前分析结果缺少生意参谋商品数据，无法建立系列分组。"
          description="请在数据上传页查看数据质量，并补充经营商品报表后重新分析。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {overview && !overview.missingBusinessData && !overview.hasSelectedDateProducts ? (
        <SeriesEmptyState
          title="当前经营日期没有可分组商品。"
          description="请切换经营日期，或在数据上传页复核当前结果的数据质量。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {analysis && overview && !overview.missingBusinessData && overview.hasSelectedDateProducts ? (
        <>
          <TmallDataContextBar
            analysisTimestamp={analysis.analysisTimestamp}
            selectedDate={overview.selectedDate}
            sourceCount={Object.values(analysis.sourceHealth).filter((source) => isParsedSource(source.status)).length}
            dataQualityWarningCount={analysis.dataQualityWarnings.length}
            availableDates={overview.availableDates}
            onDateChange={handleDateChange}
            extraItems={[
              { label: "系列数", value: seriesGroups.length },
              { label: "商品池", value: overview.products.length },
            ]}
          />

          {seriesStorageStatus === "corrupted" ? (
            <SectionCard title="系列分组数据损坏" description="本地系列分组数据不完整或已损坏，请清除后重新创建系列。">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
                <p>损坏的系列分组不会影响四源分析结果，也不会自动删除。清除后可以重新创建系列。</p>
                <button
                  type="button"
                  className="secondary-button mt-4 bg-white text-amber-800"
                  onClick={handleClearCorruptedGroups}
                >
                  清除损坏系列分组
                </button>
              </div>
            </SectionCard>
          ) : (
            <>
              <SeriesGroupList
                groups={overview.seriesGroups}
                editingGroupId={editingGroupId}
                onEdit={setEditingGroupId}
                onDelete={handleDeleteGroup}
              />

              <SeriesCurrentSummary overview={overview} onSeriesChange={setSelectedSeriesId} />

              {overview.selectedSeries ? (
                <>
                  <SeriesTargetSummary
                    summary={targetSummary}
                    targetStorageStatus={targetStorageState.status}
                  />

                  {trendSection ? (
                    <SectionCard
                      title="系列趋势分析"
                      description="基于当前系列商品 ID 的多日数据展示经营和推广趋势。若某类数据只有 1 个日期点，系统只展示当日值，不解释为趋势。"
                    >
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                        <p className="text-sm leading-6 text-blue-800">{trendSection.summaryText}</p>
                        <div className="mt-3 flex flex-col gap-2 text-xs leading-5 text-blue-700 sm:flex-row sm:flex-wrap">
                          <span>当前系列：{trendSection.seriesName}</span>
                          <span>商品 ID：{trendSection.productIds.length} 个</span>
                          <span>经营趋势：{trendSection.businessPointCount} 个日期点</span>
                          <span>商品推广趋势：{trendSection.adProductPointCount} 个日期点</span>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {trendSection.cards.map((card) => (
                          <TrendCard key={card.id} card={card} />
                        ))}
                      </div>
                    </SectionCard>
                  ) : null}

                  <SeriesMetricGrid
                    title="系列经营指标"
                    description="数据来源：生意参谋商品表。比率类指标按系列汇总后的分子和分母重新计算。"
                    metrics={overview.seriesBusinessMetrics}
                    notice="商品访客数和商品支付买家数是商品维度加总，不等于去重访客或去重买家。"
                  />

                  <SeriesMetricGrid
                    title="系列商品推广指标"
                    description="数据来源：商品推广报表。系列推广指标不使用计划推广报表。"
                    metrics={overview.seriesAdMetrics}
                    emptyMessage={overview.hasSelectedSeriesAdData ? undefined : "当前系列在所选日期暂无推广数据。"}
                  />

                  <SeriesAudienceSummary summary={overview.seriesAudienceSummary} />

                  <SeriesAfterSalesSummary summary={overview.seriesAfterSalesSummary} />

                  <SeriesProductTable rows={overview.seriesProductRows} />
                </>
              ) : null}

              <SeriesGroupForm
                key={`${editingGroup?.id ?? "new"}-${formRevision}`}
                products={overview.products}
                groups={seriesGroups}
                editingGroup={editingGroup}
                onSave={handleSaveGroup}
                onCancelEdit={() => {
                  setEditingGroupId(null);
                  setFormRevision((current) => current + 1);
                }}
              />

              <SeriesProductPool products={overview.products} />

              <SectionCard title="系列看板说明" description="系列配置以商品 ID 为准，当前看板已接入经营、推广、售后、趋势和目标摘要。">
                <div className="grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
                  <p className="rounded-xl bg-slate-50 p-4">
                    系列配置以商品 ID 为准，不使用商品名称作为关联主键。
                  </p>
                  <p className="rounded-xl bg-slate-50 p-4">
                    切换经营日期后，系统会用同一组商品 ID 匹配当天商品数据。
                  </p>
                  <p className="rounded-xl bg-slate-50 p-4">
                    当前阶段已支持系列经营、推广、售后、趋势和目标摘要；导出、多店铺同步、AI 分析和目标趋势联动将在后续阶段单独规划。
                  </p>
                </div>
              </SectionCard>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
