"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SeriesBoardCommandCenter } from "@/components/series-board/v05/series-board-command-center";
import { SeriesBoardSafeState } from "@/components/series-board/v05/series-board-safe-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  buildEmptySeriesBoardViewModel,
  buildInvalidSeriesBoardViewModel,
  buildLegacySeriesBoardViewModel,
  buildV2SeriesBoardViewModel,
  isLegacyDefaultSeriesRequest,
  loadSeriesBoardContext,
  type SeriesBoardLoadResult,
  type SeriesBoardMetricKey,
  type SeriesBoardPeriod,
} from "@/lib/v05/series-board";
import { DEFAULT_TMALL_STORE_ID } from "@/lib/v05/store-board";
import type { PlatformCode } from "@/lib/v05/domain/models";

const initialLoadResult: SeriesBoardLoadResult = {
  status: "loading",
  context: null,
  message: "正在读取系列数据。",
};

const isPlatformCode = (value: string | null): value is PlatformCode =>
  value === "tmall" || value === "jd" || value === "pdd" || value === "douyin" || value === "youzan";

function SeriesBoardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const requestedSeriesId = searchParams.get("seriesId");
  const platformCode = isPlatformCode(requestedPlatform) ? requestedPlatform : "tmall";
  const storeId = requestedStoreId?.trim() || DEFAULT_TMALL_STORE_ID;
  const [loadResult, setLoadResult] = useState<SeriesBoardLoadResult>(initialLoadResult);
  const [selectedPeriod, setSelectedPeriod] = useState<SeriesBoardPeriod>("day");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customDateRange, setCustomDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<SeriesBoardMetricKey>("gmv");

  useEffect(() => {
    let mounted = true;
    loadSeriesBoardContext({ platformCode: requestedPlatform, storeId: requestedStoreId })
      .then((result) => {
        if (mounted) setLoadResult(result);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadResult({
          status: "error",
          context: null,
          message: "读取系列数据失败，请刷新后重试。",
        });
      });

    return () => {
      mounted = false;
    };
  }, [requestedPlatform, requestedStoreId]);

  const viewModel = useMemo(() => {
    const context = loadResult.context;
    if (loadResult.status === "empty" || !context || context.mode === "empty") {
      if (!isLegacyDefaultSeriesRequest({ platformCode: requestedPlatform, storeId: requestedStoreId })) {
        return buildInvalidSeriesBoardViewModel({
          mode: "invalid_store",
          platformCode: requestedPlatform,
          storeId: requestedStoreId,
          message: "当前店铺尚未建立多店铺系列数据，不能使用默认店铺系列代替。",
        });
      }
      return buildEmptySeriesBoardViewModel("当前没有可用系列数据，请先完成数据导入或创建系列。");
    }

    if (context.mode === "v2_valid" && context.dataset) {
      return buildV2SeriesBoardViewModel({
        dataset: context.dataset,
        platformCode,
        storeId,
        seriesId: requestedSeriesId,
        selectedPeriod,
        selectedDate,
        customDateRange,
      });
    }

    if (
      (context.mode === "legacy_fallback" || context.mode === "v2_corrupted_with_legacy_fallback") &&
      context.legacyAnalysis
    ) {
      return buildLegacySeriesBoardViewModel({
        analysis: context.legacyAnalysis,
        legacySeriesGroups: context.legacySeriesGroups,
        targets: context.legacyTargets,
        seriesId: requestedSeriesId,
        selectedPeriod,
        selectedDate,
        customDateRange,
        fallbackNotice:
          context.mode === "v2_corrupted_with_legacy_fallback"
            ? "本地多店铺数据暂不可用，当前先显示旧版默认店铺系列数据。"
            : undefined,
      });
    }

    if (context.mode === "corrupted" || loadResult.status === "corrupted") {
      return {
        ...buildEmptySeriesBoardViewModel("本地系列数据不可安全读取，请前往数据质量页面重新处理。"),
        mode: "corrupted" as const,
        statusLabel: "数据不可用",
        statusTone: "rose" as const,
      };
    }

    return buildEmptySeriesBoardViewModel("读取系列数据失败，请刷新后重试。");
  }, [
    customDateRange,
    loadResult.context,
    loadResult.status,
    platformCode,
    requestedPlatform,
    requestedSeriesId,
    requestedStoreId,
    selectedDate,
    selectedPeriod,
    storeId,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="系列经营看板"
        title="系列看板"
        description="按平台、店铺和用户创建的系列查看经营指标、趋势、目标和商品组成。"
        action={<StatusPill tone={viewModel.statusTone === "amber" ? "warning" : viewModel.statusTone === "rose" ? "danger" : "info"}>{viewModel.statusLabel}</StatusPill>}
      />

      {loadResult.status === "loading" ? (
        <SeriesBoardSafeState
          title="正在读取系列数据"
          description="系统正在检查多店铺数据和旧版默认店铺系列数据。"
          actionHref="/upload"
          actionLabel="数据导入"
        />
      ) : null}

      {loadResult.status === "corrupted" || loadResult.status === "error" ? (
        <SeriesBoardSafeState
          title={loadResult.status === "corrupted" ? "本地系列数据不可安全读取" : "读取系列数据失败"}
          description={
            loadResult.status === "corrupted"
              ? "请前往数据质量页面重新处理，不会在系列看板展示损坏对象。"
              : "请刷新页面重试；如果仍然失败，请前往数据导入检查当前数据。"
          }
          actionHref="/upload/quality"
          actionLabel="查看数据质量"
        />
      ) : null}

      {loadResult.status === "valid" || loadResult.status === "empty" ? (
        <SeriesBoardCommandCenter
          viewModel={viewModel}
          selectedPeriod={selectedPeriod}
          selectedTrendMetric={selectedTrendMetric}
          customDateRange={customDateRange}
          onPeriodChange={setSelectedPeriod}
          onDateChange={setSelectedDate}
          onCustomDateRangeChange={setCustomDateRange}
          onTrendMetricChange={setSelectedTrendMetric}
          onHrefChange={(href) => router.push(href)}
        />
      ) : null}
    </div>
  );
}

export default function SeriesBoardPage() {
  return (
    <Suspense
      fallback={
        <SeriesBoardSafeState
          title="正在准备系列看板"
          description="稍后会读取当前店铺和系列上下文。"
        />
      }
    >
      <SeriesBoardPageContent />
    </Suspense>
  );
}
