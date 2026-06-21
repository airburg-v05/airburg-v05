"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ProductAudienceSummary } from "@/components/product-board/product-audience-summary";
import { ProductAfterSalesSummary } from "@/components/product-board/product-after-sales-summary";
import { ProductBoardSectionNav } from "@/components/product-board/product-board-section-nav";
import { ProductDataTable } from "@/components/product-board/product-data-table";
import { ProductEmptyState } from "@/components/product-board/product-empty-state";
import { ProductFocusEntry } from "@/components/product-board/product-focus-entry";
import { ProductMetricGrid } from "@/components/product-board/product-metric-grid";
import { ProductOperatingInsights } from "@/components/product-board/product-operating-insights";
import { ProductSummary } from "@/components/product-board/product-summary";
import { ProductTargetDiagnostics } from "@/components/product-board/product-target-diagnostics";
import { ProductTargetSummary } from "@/components/product-board/product-target-summary";
import { ProductToolbar } from "@/components/product-board/product-toolbar";
import { TmallCorruptedResultState } from "@/components/tmall/tmall-corrupted-result-state";
import { TmallDataContextBar } from "@/components/tmall/tmall-data-context-bar";
import { TmallGlobalDataStatusGuide } from "@/components/tmall/tmall-global-data-status-guide";
import { TrendCard } from "@/components/trends/trend-card";
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
import {
  buildTmallProductBoardSectionNav,
} from "@/lib/tmall/view-models/product-board-section-nav";
import {
  buildTmallProductBoardOverview,
  getTmallProductBoardDates,
} from "@/lib/tmall/view-models/product-board";
import { buildTmallProductFocusEntry } from "@/lib/tmall/view-models/product-focus-entry";
import { buildTmallProductOperatingInsights } from "@/lib/tmall/view-models/product-operating-insights";
import { buildTmallProductTargetSummary } from "@/lib/tmall/view-models/product-target-summary";
import { buildTmallProductTargetDiagnostics } from "@/lib/tmall/view-models/target-diagnostics";
import { buildTmallProductTrendSection } from "@/lib/tmall/view-models/product-trend-section";
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

export default function ProductBoardPage() {
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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const availableDates = useMemo(
    () => (analysis ? getTmallProductBoardDates(analysis) : []),
    [analysis],
  );
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const overview = useMemo(
    () => (analysis ? buildTmallProductBoardOverview(analysis, effectiveDate, selectedProductId) : null),
    [analysis, effectiveDate, selectedProductId],
  );
  const focusEntry = useMemo(
    () => buildTmallProductFocusEntry(overview),
    [overview],
  );
  const trendSection = useMemo(
    () =>
      analysis && overview?.selectedProductId
        ? buildTmallProductTrendSection(analysis, overview.selectedProductId)
        : null,
    [analysis, overview],
  );
  const targetSummary = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallProductTargetSummary({
          targets: targetStorageState.targets,
          analysis,
          productId: overview?.selectedProductId ?? null,
        }),
    [analysis, overview?.selectedProductId, targetStorageState],
  );
  const targetDiagnostics = useMemo(
    () =>
      targetStorageState.status === "corrupted"
        ? null
        : buildTmallProductTargetDiagnostics({
          targets: targetStorageState.targets,
          analysis,
          productId: overview?.selectedProductId ?? null,
          options: { maxItems: 5 },
        }),
    [analysis, overview?.selectedProductId, targetStorageState],
  );
  const operatingInsights = useMemo(
    () =>
      buildTmallProductOperatingInsights({
        overview,
        targetDiagnostics,
        trendSection,
      }),
    [overview, targetDiagnostics, trendSection],
  );
  const sectionNav = useMemo(
    () => buildTmallProductBoardSectionNav({ hasTrendSection: Boolean(trendSection) }),
    [trendSection],
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

  const handleDateChange = (date: string) => {
    setSelectedDate(date || null);
    setSelectedProductId(null);
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        eyebrow="天猫宝贝看板"
        title="宝贝看板"
        description="基于天猫四源安全聚合结果，按单日经营日期查看单个商品的经营、推广、获客和售后表现。"
        action={<StatusPill tone="info">真实数据基础版</StatusPill>}
      />

      <TmallGlobalDataStatusGuide guide={globalDataStatusGuide} />

      {analysisState.status === "loading" ? (
        <ProductEmptyState
          title="正在读取本地四源分析结果"
          description="读取完成后会显示当前商品分析。"
          showAction={false}
        />
      ) : null}

      {analysisState.status === "empty" ? (
        <ProductEmptyState
          title="还没有天猫四源分析结果，请先上传天猫经营、推广和售后数据。"
          description="上传完成后，宝贝看板会展示单个商品的经营、推广、获客和售后表现。"
        />
      ) : null}

      {analysisState.status === "corrupted" ? <TmallCorruptedResultState /> : null}

      {overview?.missingBusinessData ? (
        <ProductEmptyState
          title="当前分析结果缺少生意参谋商品数据，无法建立宝贝看板。"
          description="请在数据上传页查看数据质量，并补充经营商品报表后重新分析。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {overview && !overview.missingBusinessData && overview.products.length === 0 ? (
        <ProductEmptyState
          title="当前经营日期没有可分析商品。"
          description="请切换经营日期，或在数据上传页复核当前结果的数据质量。"
          actionLabel="查看数据质量"
        />
      ) : null}

      {analysis && overview && !overview.missingBusinessData && overview.products.length > 0 ? (
        <>
          <TmallDataContextBar
            analysisTimestamp={analysis.analysisTimestamp}
            selectedDate={overview.selectedDate}
            sourceCount={Object.values(analysis.sourceHealth).filter((source) => isParsedSource(source.status)).length}
            dataQualityWarningCount={analysis.dataQualityWarnings.length}
            extraItems={[{ label: "商品数", value: overview.products.length }]}
          />

          <ProductBoardSectionNav nav={sectionNav} />

          <ProductToolbar
            availableDates={overview.availableDates}
            selectedDate={overview.selectedDate}
            products={overview.products}
            selectedProductId={overview.selectedProductId}
            searchTerm={searchTerm}
            onDateChange={handleDateChange}
            onProductChange={setSelectedProductId}
            onSearchChange={setSearchTerm}
          />

          <div id="product-focus-entry" className="scroll-mt-24">
            <ProductFocusEntry
              focusEntry={focusEntry}
              onSelectProduct={setSelectedProductId}
            />
          </div>

          <div id="product-summary" className="scroll-mt-24">
            <ProductSummary overview={overview} />
          </div>

          <div id="product-operating-insights" className="scroll-mt-24">
            <ProductOperatingInsights insights={operatingInsights} />
          </div>

          <div id="product-target-summary" className="scroll-mt-24">
            <ProductTargetSummary
              summary={targetSummary}
              targetStorageStatus={targetStorageState.status}
            />
          </div>

          <div id="product-target-diagnostics" className="scroll-mt-24">
            <ProductTargetDiagnostics
              summary={targetDiagnostics}
              targetStorageStatus={targetStorageState.status}
            />
          </div>

          {trendSection ? (
            <div id="product-trends" className="scroll-mt-24">
              <SectionCard
                title="商品趋势分析"
                description="基于当前商品的多日数据展示经营和推广趋势。若某类数据只有 1 个日期点，系统只展示当日值，不解释为趋势。"
              >
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm leading-6 text-blue-800">{trendSection.summaryText}</p>
                  <div className="mt-3 flex flex-col gap-2 text-xs leading-5 text-blue-700 sm:flex-row sm:flex-wrap">
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
            </div>
          ) : null}

          <div id="product-business-metrics" className="scroll-mt-24">
            <ProductMetricGrid
              title="商品经营指标"
              description="数据来源：生意参谋商品表。比率类指标按汇总分子和分母重新计算。"
              metrics={overview.businessMetrics}
              notice="成功退款金额按报表统计周期内的退款完成口径计算，可能包含历史支付订单。当前 GSV 表示“当期支付金额 - 当期成功退款金额”，不等同于同日订单最终净销售额。"
            />
          </div>

          <div id="product-ad-metrics" className="scroll-mt-24">
            <ProductMetricGrid
              title="商品推广指标"
              description="数据来源：商品推广报表。单个商品推广指标不使用计划推广报表。"
              metrics={overview.adMetrics}
              emptyMessage={overview.selectedProduct?.hasAdData ? undefined : "当前商品在所选日期暂无推广数据。"}
            />
          </div>

          <div id="product-audience" className="scroll-mt-24">
            <ProductAudienceSummary summary={overview.audienceSummary} />
          </div>

          <div id="product-after-sales" className="scroll-mt-24">
            <ProductAfterSalesSummary
              summary={overview.afterSalesSummary}
              dateRange={overview.afterSalesDateRange}
            />
          </div>

          <div id="product-table" className="scroll-mt-24">
            <ProductDataTable
              rows={overview.productTableRows}
              searchTerm={searchTerm}
              selectedProductId={overview.selectedProductId}
              onSelectProduct={setSelectedProductId}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
