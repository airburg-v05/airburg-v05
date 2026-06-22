"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StoreBoardCommandCenter } from "@/components/store-board/v05/store-board-command-center";
import { StoreBoardSafeState } from "@/components/store-board/v05/store-board-safe-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  buildEmptyStoreBoardViewModel,
  buildInvalidStoreBoardViewModel,
  buildLegacyStoreBoardViewModel,
  buildV2StoreBoardViewModel,
  DEFAULT_TMALL_STORE_ID,
  isLegacyDefaultStoreRequest,
  loadStoreBoardContext,
  type StoreBoardLoadResult,
  type StoreBoardMetricKey,
  type StoreBoardPeriod,
} from "@/lib/v05/store-board";
import type { PlatformCode } from "@/lib/v05/domain/models";

const initialLoadResult: StoreBoardLoadResult = {
  status: "loading",
  context: null,
  message: "正在读取店铺数据。",
};

const isPlatformCode = (value: string | null): value is PlatformCode =>
  value === "tmall" || value === "jd" || value === "pdd" || value === "douyin" || value === "youzan";

function StoreBoardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlatform = searchParams.get("platform");
  const requestedStoreId = searchParams.get("storeId");
  const platformCode = isPlatformCode(requestedPlatform) ? requestedPlatform : "tmall";
  const storeId = requestedStoreId?.trim() || DEFAULT_TMALL_STORE_ID;
  const [loadResult, setLoadResult] = useState<StoreBoardLoadResult>(initialLoadResult);
  const [selectedPeriod, setSelectedPeriod] = useState<StoreBoardPeriod>("day");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customDateRange, setCustomDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<StoreBoardMetricKey>("gmv");

  useEffect(() => {
    let mounted = true;
    loadStoreBoardContext({ platformCode: requestedPlatform, storeId: requestedStoreId })
      .then((result) => {
        if (mounted) setLoadResult(result);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadResult({
          status: "error",
          context: null,
          message: "读取店铺数据失败，请刷新后重试。",
        });
      });

    return () => {
      mounted = false;
    };
  }, [requestedPlatform, requestedStoreId]);

  const viewModel = useMemo(() => {
    const context = loadResult.context;
    if (loadResult.status === "empty" || !context || context.mode === "empty") {
      if (!isLegacyDefaultStoreRequest({ platformCode: requestedPlatform, storeId: requestedStoreId })) {
        return buildInvalidStoreBoardViewModel({
          platformCode: requestedPlatform,
          storeId: requestedStoreId,
          message: "当前店铺尚未建立多店铺看板数据，不能使用默认店铺数据代替。",
        });
      }
      return buildEmptyStoreBoardViewModel("当前没有可用店铺数据，请先完成数据导入。");
    }

    if (context.mode === "v2_valid" && context.dataset) {
      return buildV2StoreBoardViewModel({
        dataset: context.dataset,
        platformCode,
        storeId,
        selectedPeriod,
        selectedDate,
        customDateRange,
      });
    }

    if (
      (context.mode === "legacy_fallback" || context.mode === "v2_corrupted_with_legacy_fallback") &&
      context.legacyAnalysis
    ) {
      return buildLegacyStoreBoardViewModel({
        analysis: context.legacyAnalysis,
        targets: context.legacyTargets,
        selectedPeriod,
        selectedDate,
        customDateRange,
        fallbackNotice:
          context.mode === "v2_corrupted_with_legacy_fallback"
            ? "本地多店铺数据暂不可用，当前先显示旧版默认店铺数据。"
            : undefined,
      });
    }

    if (context.mode === "corrupted" || loadResult.status === "corrupted") {
      return {
        ...buildEmptyStoreBoardViewModel("本地店铺数据不可安全读取，请前往数据质量页面重新处理。"),
        mode: "corrupted" as const,
        statusLabel: "数据不可用",
        statusTone: "rose" as const,
      };
    }

    return buildEmptyStoreBoardViewModel("读取店铺数据失败，请刷新后重试。");
  }, [
    customDateRange,
    loadResult.context,
    loadResult.status,
    platformCode,
    requestedPlatform,
    requestedStoreId,
    selectedDate,
    selectedPeriod,
    storeId,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="店铺经营看板"
        title="店铺看板"
        description="按平台和店铺查看经营指标、趋势、目标、系列、商品、推广和售后安全聚合。"
        action={<StatusPill tone={viewModel.statusTone === "amber" ? "warning" : viewModel.statusTone === "rose" ? "danger" : "info"}>{viewModel.statusLabel}</StatusPill>}
      />

      {loadResult.status === "loading" ? (
        <StoreBoardSafeState
          title="正在读取店铺数据"
          description="系统正在检查多店铺数据和旧版默认店铺数据。"
        />
      ) : null}

      {loadResult.status === "corrupted" || loadResult.status === "error" ? (
        <StoreBoardSafeState
          title={loadResult.status === "corrupted" ? "本地店铺数据不可安全读取" : "读取店铺数据失败"}
          description={
            loadResult.status === "corrupted"
              ? "请前往数据质量页面重新处理，不会在店铺看板展示损坏对象。"
              : "请刷新页面重试；如果仍然失败，请前往数据导入检查当前数据。"
          }
          actionHref="/upload/quality"
          actionLabel="查看数据质量"
        />
      ) : null}

      {loadResult.status === "valid" || loadResult.status === "empty" ? (
        <StoreBoardCommandCenter
          viewModel={viewModel}
          selectedPeriod={selectedPeriod}
          selectedTrendMetric={selectedTrendMetric}
          customDateRange={customDateRange}
          onPeriodChange={setSelectedPeriod}
          onDateChange={setSelectedDate}
          onCustomDateRangeChange={setCustomDateRange}
          onTrendMetricChange={setSelectedTrendMetric}
          onStoreHrefChange={(href) => router.push(href)}
        />
      ) : null}
    </div>
  );
}

export default function StoreBoardPage() {
  return (
    <Suspense
      fallback={
        <StoreBoardSafeState
          title="正在准备店铺看板"
          description="稍后会读取当前店铺上下文。"
        />
      }
    >
      <StoreBoardPageContent />
    </Suspense>
  );
}
