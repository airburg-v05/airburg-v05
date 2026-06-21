"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { StoreAdSummary } from "@/components/store-board/store-ad-summary";
import { StoreAfterSalesSummary } from "@/components/store-board/store-after-sales-summary";
import { StoreEmptyState } from "@/components/store-board/store-empty-state";
import { StoreMetricGrid } from "@/components/store-board/store-metric-grid";
import { StoreProductRankings } from "@/components/store-board/store-product-rankings";
import { StoreTargetDiagnostics } from "@/components/store-board/store-target-diagnostics";
import { StoreQualitySummary } from "@/components/store-board/store-quality-summary";
import { StoreTargetSummary } from "@/components/store-board/store-target-summary";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { TmallDataContextBar } from "@/components/tmall/tmall-data-context-bar";
import { TmallGlobalDataStatusGuide } from "@/components/tmall/tmall-global-data-status-guide";
import { TrendCard } from "@/components/trends/trend-card";
import { TrendSummary } from "@/components/trends/trend-summary";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  parseTmallSeriesGroupStorage,
  TMALL_SERIES_STORAGE_EVENT,
  TMALL_SERIES_STORAGE_KEY,
} from "@/lib/storage/tmall-series-storage";
import {
  parseTmallTargetStorage,
  TMALL_TARGET_STORAGE_EVENT,
  TMALL_TARGET_STORAGE_KEY,
} from "@/lib/storage/tmall-target-storage";
import { useTmallAnalysisResult } from "@/lib/storage/use-tmall-analysis-result";
import { buildTmallGlobalDataStatusGuide } from "@/lib/tmall/view-models/global-data-status-guide";
import { buildTmallStoreTargetSummary } from "@/lib/tmall/view-models/store-target-summary";
import { buildTmallStoreTargetDiagnostics } from "@/lib/tmall/view-models/target-diagnostics";
import { buildTmallStoreTrendSection } from "@/lib/tmall/view-models/store-trend-section";
import {
  buildTmallStoreBoardOverview,
  getTmallStoreBoardDates,
} from "@/lib/tmall/view-models/store-board";
import type { TmallSourceStatus } from "@/types/tmall";

const isParsedSource = (status: TmallSourceStatus): boolean => status === "parsed";

const refundNotice =
  "成功退款金额按报表统计周期内的退款完成口径计算，可能包含历史支付订单。当前 GSV 表示“当期支付金额 - 当期成功退款金额”，不等同于同日订单最终净销售额。";

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

export default function StoreBoardPage() {
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const availableDates = useMemo(
    () => (analysis ? getTmallStoreBoardDates(analysis) : []),
    [analysis],
  );
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const overview = useMemo(
    () => (analysis ? buildTmallStoreBoardOverview(analysis, effectiveDate) : null),
    [analysis, effectiveDate],
  );
  const trendSection = useMemo(
    () => (analysis ? buildTmallStoreTrendSection(analysis) : null),
    [analysis],
  );
  const targetSummary = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallStoreTargetSummary({
          targets: targetStorageState.targets,
          analysis,
        }),
    [analysis, targetStorageState],
  );
  const targetDiagnostics = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallStoreTargetDiagnostics({
          targets: targetStorageState.targets,
          analysis,
          options: { maxItems: 5 },
        }),
    [analysis, targetStorageState],
  );
  const globalDataStatusGuide = useMemo(
    () =>
      buildTmallGlobalDataStatusGuide({
        analysisStatus: analysisState.status,
        analysis,
        targetStorageState,
        seriesStorageState,
        selectedDate: effectiveDate,
      }),
    [analysis, analysisState.status, effectiveDate, seriesStorageState, targetStorageState],
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫店铺看板"
        title="店铺看板"
        description="基于天猫四源安全聚合结果，按单日经营日期查看店铺经营、推广、售后和商品风险。"
        action={<StatusPill tone="info">真实数据基础版</StatusPill>}
      />

      <TmallGlobalDataStatusGuide guide={globalDataStatusGuide} />

      {analysisState.status === "loading" ? (
        <StoreEmptyState
          title="正在读取本地四源分析结果"
          description="读取完成后会显示店铺级经营分析。"
          showAction={false}
        />
      ) : null}

      {analysisState.status === "empty" ? (
        <StoreEmptyState
          title="还没有天猫四源分析结果，请先上传天猫经营、推广和售后数据。"
          description="上传完成后，店铺看板会展示店铺经营、推广、售后和商品风险。"
        />
      ) : null}

      {analysisState.status === "corrupted" ? <TmallCorruptedResultState /> : null}

      {overview?.missingBusinessData ? (
        <StoreEmptyState
          title="当前分析结果缺少生意参谋商品数据，无法建立店铺经营看板。"
          description="请在数据上传页查看数据质量，并补充经营商品报表后重新分析。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {overview && !overview.missingBusinessData && !overview.hasSelectedDateProducts ? (
        <StoreEmptyState
          title="当前经营日期没有可分析商品。"
          description="请切换经营日期，或在数据上传页复核当前结果的数据质量。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {overview && !overview.missingBusinessData && overview.hasSelectedDateProducts ? (
        <>
          <TmallDataContextBar
            analysisTimestamp={overview.analysisTimestamp}
            selectedDate={overview.selectedDate}
            sourceCount={Object.values(overview.sourceAvailability).filter((source) => isParsedSource(source.status)).length}
            dataQualityWarningCount={overview.dataQualityWarnings.length}
            availableDates={overview.availableDates}
            onDateChange={setSelectedDate}
            extraItems={[{ label: "商品数", value: overview.productRankings.productCount }]}
          />

          <StoreMetricGrid
            title="店铺经营核心指标"
            description="数据来源：生意参谋商品表。比率类指标按汇总分子和分母重新计算。"
            metrics={overview.businessMetrics}
            notice={refundNotice}
          />

          <StoreTargetSummary
            summary={targetSummary}
            targetStorageStatus={targetStorageState.status}
          />

          <StoreTargetDiagnostics
            summary={targetDiagnostics}
            targetStorageStatus={targetStorageState.status}
          />

          {trendSection ? (
            <SectionCard
              title="店铺趋势分析"
              description="基于当前已上传的多日数据展示经营和推广趋势。若某类数据只有 1 个日期点，系统只展示当日值，不解释为趋势。"
            >
              <TrendSummary section={trendSection} />
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {trendSection.cards.map((card) => (
                  <TrendCard key={card.id} card={card} />
                ))}
              </div>
            </SectionCard>
          ) : null}

          <StoreAdSummary overview={overview} />

          <StoreAfterSalesSummary afterSales={overview.afterSalesMetrics} />

          <StoreProductRankings rankings={overview.productRankings} />

          <StoreQualitySummary overview={overview} />
        </>
      ) : null}
    </div>
  );
}
