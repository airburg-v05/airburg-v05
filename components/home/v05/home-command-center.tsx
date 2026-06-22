"use client";

import type {
  HomeCommandCenterMetricKey,
  HomeCommandCenterPeriod,
  HomeCommandCenterViewModel,
} from "@/lib/v05/home-command-center";
import { HomeContextBar } from "./home-context-bar";
import { HomeDataStatus } from "./home-data-status";
import { HomeMainTrend } from "./home-main-trend";
import { HomeMetricGrid } from "./home-metric-grid";
import { HomeSafeState } from "./home-safe-state";
import { HomeStorePerformance } from "./home-store-performance";

interface HomeCommandCenterProps {
  viewModel: HomeCommandCenterViewModel;
  selectedPeriod: HomeCommandCenterPeriod;
  selectedTrendMetric: HomeCommandCenterMetricKey;
  customDateRange: { start: string | null; end: string | null };
  onPeriodChange: (period: HomeCommandCenterPeriod) => void;
  onDateChange: (date: string | null) => void;
  onCustomDateRangeChange: (range: { start: string | null; end: string | null }) => void;
  onPlatformChange: (platform: HomeCommandCenterViewModel["selectedPlatform"]) => void;
  onStoreChange: (store: string | "all") => void;
  onTrendMetricChange: (metric: HomeCommandCenterMetricKey) => void;
}

export function HomeCommandCenter({
  viewModel,
  selectedPeriod,
  selectedTrendMetric,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onPlatformChange,
  onStoreChange,
  onTrendMetricChange,
}: HomeCommandCenterProps) {
  if (viewModel.mode === "empty") {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-5">
        <HomeContextBar
          viewModel={viewModel}
          selectedPeriod={selectedPeriod}
          customDateRange={customDateRange}
          onPeriodChange={onPeriodChange}
          onDateChange={onDateChange}
          onCustomDateRangeChange={onCustomDateRangeChange}
          onPlatformChange={onPlatformChange}
          onStoreChange={onStoreChange}
        />
        <HomeSafeState
          title="当前没有经营数据"
          description="请先完成数据导入。导入成功后，首页会自动汇总平台、店铺、日期范围和目标进度。"
          actionHref="/upload"
          actionLabel="前往数据导入"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      {viewModel.notices.length > 0 ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-6 text-blue-800">
          {viewModel.notices.slice(0, 2).map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}
      <HomeContextBar
        viewModel={viewModel}
        selectedPeriod={selectedPeriod}
        customDateRange={customDateRange}
        onPeriodChange={onPeriodChange}
        onDateChange={onDateChange}
        onCustomDateRangeChange={onCustomDateRangeChange}
        onPlatformChange={onPlatformChange}
        onStoreChange={onStoreChange}
      />
      <HomeMetricGrid viewModel={viewModel} />
      <HomeMainTrend
        viewModel={viewModel}
        selectedMetric={selectedTrendMetric}
        onMetricChange={onTrendMetricChange}
      />
      <HomeStorePerformance viewModel={viewModel} />
      <HomeDataStatus viewModel={viewModel} />
    </div>
  );
}
