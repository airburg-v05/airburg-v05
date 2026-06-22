"use client";

import { useEffect, useMemo, useState } from "react";
import { HomeCommandCenter } from "@/components/home/v05/home-command-center";
import { HomeSafeState } from "@/components/home/v05/home-safe-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  buildEmptyHomeCommandCenterViewModel,
  buildHomeCommandCenterViewModel,
  buildLegacyHomeCommandCenterViewModel,
  loadHomeCommandCenterContext,
  type HomeCommandCenterLoadResult,
  type HomeCommandCenterMetricKey,
  type HomeCommandCenterPeriod,
} from "@/lib/v05/home-command-center";
import type { PlatformCode } from "@/lib/v05/domain/models";

const initialLoadResult: HomeCommandCenterLoadResult = {
  status: "loading",
  context: null,
  message: "正在读取经营数据。",
};

export default function HomePage() {
  const [loadResult, setLoadResult] = useState<HomeCommandCenterLoadResult>(initialLoadResult);
  const [selectedPeriod, setSelectedPeriod] = useState<HomeCommandCenterPeriod>("day");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customDateRange, setCustomDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [platformFilter, setPlatformFilter] = useState<PlatformCode | "all">("all");
  const [storeFilter, setStoreFilter] = useState<string | "all">("all");
  const [selectedTrendMetric, setSelectedTrendMetric] =
    useState<HomeCommandCenterMetricKey>("gmv");

  useEffect(() => {
    let mounted = true;
    loadHomeCommandCenterContext()
      .then((result) => {
        if (mounted) setLoadResult(result);
      })
      .catch(() => {
        if (!mounted) return;
        setLoadResult({
          status: "error",
          context: null,
          message: "读取经营数据失败，请刷新后重试。",
        });
      });

    return () => {
      mounted = false;
    };
  }, []);

  const viewModel = useMemo(() => {
    const context = loadResult.context;
    if (loadResult.status === "empty" || !context || context.mode === "empty") {
      return buildEmptyHomeCommandCenterViewModel();
    }

    if (context.mode === "v2_valid" && context.dataset) {
      return buildHomeCommandCenterViewModel({
        dataset: context.dataset,
        selectedPeriod,
        selectedDate,
        customDateRange,
        platformFilter,
        storeFilter,
      });
    }

    if (
      (context.mode === "legacy_fallback" || context.mode === "v2_corrupted_with_legacy_fallback") &&
      context.legacyAnalysis
    ) {
      const legacyViewModel = buildLegacyHomeCommandCenterViewModel({
        analysis: context.legacyAnalysis,
        targets: context.legacyTargets,
        selectedPeriod,
        selectedDate,
        customDateRange,
      });
      if (context.mode === "v2_corrupted_with_legacy_fallback") {
        return {
          ...legacyViewModel,
          mode: context.mode,
          notices: [
            "本地多店铺数据暂不可用，当前先显示旧版单店数据。",
            ...legacyViewModel.notices,
          ],
        };
      }
      return legacyViewModel;
    }

    return buildEmptyHomeCommandCenterViewModel();
  }, [customDateRange, loadResult, platformFilter, selectedDate, selectedPeriod, storeFilter]);

  const handlePlatformChange = (platform: PlatformCode | "all") => {
    setPlatformFilter(platform);
    setStoreFilter("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="经营命令中心"
        title="经营首页"
        description="用一个页面查看经营范围、核心指标、主趋势和店铺优先入口。"
        action={<StatusPill tone={viewModel.statusTone === "amber" ? "warning" : "info"}>{viewModel.statusLabel}</StatusPill>}
      />

      {loadResult.status === "loading" ? (
        <HomeSafeState
          title="正在读取经营数据"
          description="系统正在检查本地多店铺数据和旧版单店数据，稍后会进入首页。"
        />
      ) : null}

      {loadResult.status === "corrupted" || loadResult.status === "error" ? (
        <HomeSafeState
          title={loadResult.status === "corrupted" ? "本地经营数据不可安全读取" : "读取经营数据失败"}
          description={
            loadResult.status === "corrupted"
              ? "请前往数据导入或数据质量页面重新处理，不会在首页展示损坏对象。"
              : "请刷新页面重试；如果仍然失败，请前往数据导入检查当前数据。"
          }
          actionHref="/upload/quality"
          actionLabel="查看数据质量"
        />
      ) : null}

      {loadResult.status === "valid" || loadResult.status === "empty" ? (
        <HomeCommandCenter
          viewModel={viewModel}
          selectedPeriod={selectedPeriod}
          selectedTrendMetric={selectedTrendMetric}
          customDateRange={customDateRange}
          onPeriodChange={setSelectedPeriod}
          onDateChange={setSelectedDate}
          onCustomDateRangeChange={setCustomDateRange}
          onPlatformChange={handlePlatformChange}
          onStoreChange={setStoreFilter}
          onTrendMetricChange={setSelectedTrendMetric}
        />
      ) : null}
    </div>
  );
}
