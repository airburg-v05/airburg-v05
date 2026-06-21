"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { HomeSectionNav } from "@/components/home/home-section-nav";
import { HomeWorkbenchOverview } from "@/components/home/home-workbench-overview";
import { TmallMetricGrid } from "@/components/home/tmall-metric-grid";
import { TmallProductRanking } from "@/components/home/tmall-product-ranking";
import { TmallQualitySummary } from "@/components/home/tmall-quality-summary";
import { TmallReconciliationNotice } from "@/components/home/tmall-reconciliation-notice";
import { TmallRiskList } from "@/components/home/tmall-risk-list";
import { TmallTargetDiagnostics } from "@/components/home/tmall-target-diagnostics";
import { TmallTargetSummary } from "@/components/home/tmall-target-summary";
import { TmallTrendSummary } from "@/components/home/tmall-trend-summary";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { TmallDataContextBar } from "@/components/tmall/tmall-data-context-bar";
import { TmallGlobalDataStatusGuide } from "@/components/tmall/tmall-global-data-status-guide";
import { PageHeader } from "@/components/ui/page-header";
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
import { buildTmallHomeTargetSummary } from "@/lib/tmall/view-models/home-target-summary";
import { buildTmallHomeSectionNav } from "@/lib/tmall/view-models/home-section-nav";
import { buildTmallHomeWorkbenchOverview } from "@/lib/tmall/view-models/home-workbench-overview";
import { buildTmallGlobalDataStatusGuide } from "@/lib/tmall/view-models/global-data-status-guide";
import { buildTmallTargetDiagnostics } from "@/lib/tmall/view-models/target-diagnostics";
import {
  buildTmallHomeOverview,
  getTmallBusinessDates,
} from "@/lib/tmall/view-models/home-overview";
import { buildTmallHomeTrendSummary } from "@/lib/tmall/view-models/home-trend-summary";
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

export default function HomePage() {
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
    () => (analysis ? getTmallBusinessDates(analysis) : []),
    [analysis],
  );
  const effectiveSelectedDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const overview = useMemo(
    () => (analysis ? buildTmallHomeOverview(analysis, effectiveSelectedDate) : null),
    [analysis, effectiveSelectedDate],
  );
  const trendSummary = useMemo(
    () => (analysis ? buildTmallHomeTrendSummary(analysis) : null),
    [analysis],
  );
  const targetSummary = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallHomeTargetSummary({
          targets: targetStorageState.targets,
          analysis,
          seriesGroups:
            seriesStorageState.status === "valid" ? seriesStorageState.groups : [],
        }),
    [analysis, seriesStorageState, targetStorageState],
  );
  const targetDiagnostics = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallTargetDiagnostics({
          targets: targetStorageState.targets,
          analysis,
          seriesGroups:
            seriesStorageState.status === "valid" ? seriesStorageState.groups : [],
          scope: "home",
          options: { maxItems: 5 },
        }),
    [analysis, seriesStorageState, targetStorageState],
  );
  const workbenchOverview = useMemo(
    () =>
      buildTmallHomeWorkbenchOverview({
        analysis,
        targetStorageState,
        seriesStorageState,
        selectedDate: effectiveSelectedDate,
      }),
    [analysis, effectiveSelectedDate, seriesStorageState, targetStorageState],
  );
  const globalDataStatusGuide = useMemo(
    () =>
      buildTmallGlobalDataStatusGuide({
        analysisStatus: analysisState.status,
        analysis,
        targetStorageState,
        seriesStorageState,
        selectedDate: effectiveSelectedDate,
      }),
    [analysis, analysisState.status, effectiveSelectedDate, seriesStorageState, targetStorageState],
  );
  const homeSectionNav = useMemo(
    () =>
      overview
        ? buildTmallHomeSectionNav({
          hasTrendSummary: !!trendSummary,
          hasTargetSummary: true,
          hasTargetDiagnostics: true,
          hasReconciliation: true,
          hasMetricGrid: true,
          hasProductRanking: true,
          hasRiskList: true,
          hasQualitySummary: true,
        })
        : null,
    [overview, trendSummary],
  );
  const targetSummaryElement = (
    <TmallTargetSummary
      summary={targetSummary}
      targetStorageStatus={targetStorageState.status}
      seriesStorageCorrupted={seriesStorageState.status === "corrupted"}
    />
  );
  const targetDiagnosticsElement = (
    <TmallTargetDiagnostics
      summary={targetDiagnostics}
      targetStorageStatus={targetStorageState.status}
      seriesStorageCorrupted={seriesStorageState.status === "corrupted"}
    />
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫经营工作台"
        title="经营工作台首页"
        description="基于天猫四源安全聚合结果汇总数据状态、看板入口和今日优先动作。"
        action={<StatusPill tone="info">经营分析</StatusPill>}
      />

      <TmallGlobalDataStatusGuide guide={globalDataStatusGuide} />

      {analysisState.status === "loading" ? <LoadingState /> : null}

      {analysisState.status === "corrupted" ? <TmallCorruptedResultState /> : null}

      {analysisState.status !== "loading" && analysisState.status !== "corrupted" ? (
        <HomeWorkbenchOverview overview={workbenchOverview} />
      ) : null}

      {overview ? (
        <>
          {homeSectionNav ? <HomeSectionNav nav={homeSectionNav} /> : null}
          <section id="home-data-context" className="scroll-mt-24">
            <TmallDataContextBar
              analysisTimestamp={overview.analysisTimestamp}
              selectedDate={overview.selectedDate}
              sourceCount={Object.values(overview.sourceAvailability).filter((source) => isParsedSource(source.status)).length}
              dataQualityWarningCount={overview.dataQualityWarnings.length}
              availableDates={overview.availableDates}
              onDateChange={setSelectedDate}
            />
          </section>
          {trendSummary ? (
            <section id="home-trend-summary" className="scroll-mt-24">
              <TmallTrendSummary summary={trendSummary} />
            </section>
          ) : null}
          <section id="home-target-summary" className="scroll-mt-24">
            {targetSummaryElement}
          </section>
          <section id="home-target-diagnostics" className="scroll-mt-24">
            {targetDiagnosticsElement}
          </section>
          <section id="home-reconciliation" className="scroll-mt-24">
            <TmallReconciliationNotice overview={overview} />
          </section>
          <section id="home-metric-grid" className="scroll-mt-24">
            <TmallMetricGrid overview={overview} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <section id="home-product-ranking" className="min-w-0 scroll-mt-24">
              <TmallProductRanking overview={overview} />
            </section>
            <section id="home-risk-list" className="min-w-0 scroll-mt-24">
              <TmallRiskList overview={overview} />
            </section>
          </div>

          <section id="home-quality-summary" className="scroll-mt-24">
            <TmallQualitySummary overview={overview} />
          </section>
        </>
      ) : null}

      {!overview &&
      analysisState.status !== "loading" &&
      analysisState.status !== "empty" ? (
        <>
          {targetSummaryElement}
          {targetDiagnosticsElement}
        </>
      ) : null}
    </div>
  );
}

function LoadingState() {
  return (
    <section className="panel p-8 text-center">
      <p className="text-sm font-semibold text-slate-900">正在读取本地四源分析结果</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">如果浏览器中没有保存结果，首页会显示上传入口。</p>
    </section>
  );
}
