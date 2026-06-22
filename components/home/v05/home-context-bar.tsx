"use client";

import Link from "next/link";
import type {
  HomeCommandCenterPeriod,
  HomeCommandCenterViewModel,
} from "@/lib/v05/home-command-center";

const PERIOD_OPTIONS: Array<{ key: HomeCommandCenterPeriod; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "custom", label: "自定义" },
];

interface HomeContextBarProps {
  viewModel: HomeCommandCenterViewModel;
  selectedPeriod: HomeCommandCenterPeriod;
  customDateRange: { start: string | null; end: string | null };
  onPeriodChange: (period: HomeCommandCenterPeriod) => void;
  onDateChange: (date: string | null) => void;
  onCustomDateRangeChange: (range: { start: string | null; end: string | null }) => void;
  onPlatformChange: (platform: HomeCommandCenterViewModel["selectedPlatform"]) => void;
  onStoreChange: (store: string | "all") => void;
}

export function HomeContextBar({
  viewModel,
  selectedPeriod,
  customDateRange,
  onPeriodChange,
  onDateChange,
  onCustomDateRangeChange,
  onPlatformChange,
  onStoreChange,
}: HomeContextBarProps) {
  return (
    <section className="panel p-4" aria-label="经营范围控制">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="周期选择">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={selectedPeriod === option.key}
                onClick={() => onPeriodChange(option.key)}
                className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition ${
                  selectedPeriod === option.key
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">经营日期</span>
              <select
                id="home-business-date-select"
                className="form-input"
                value={viewModel.dateRange.selectedDate ?? ""}
                onChange={(event) => onDateChange(event.target.value || null)}
              >
                {viewModel.availableDates.length === 0 ? <option value="">暂无日期</option> : null}
                {viewModel.availableDates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">平台</span>
              <select
                id="home-platform-select"
                className="form-input"
                value={viewModel.selectedPlatform}
                onChange={(event) =>
                  onPlatformChange(event.target.value as HomeCommandCenterViewModel["selectedPlatform"])
                }
              >
                {viewModel.platformOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-500">店铺</span>
              <select
                id="home-store-select"
                className="form-input"
                value={viewModel.selectedStore}
                onChange={(event) => onStoreChange(event.target.value || "all")}
              >
                {viewModel.storeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <p className="text-xs font-semibold text-slate-500">数据覆盖</p>
              <p className="mt-1 leading-5">{viewModel.dateRange.coverageText}</p>
            </div>
          </div>

          {selectedPeriod === "custom" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">起始日期</span>
                <input
                  className="form-input"
                  type="date"
                  value={customDateRange.start ?? ""}
                  onChange={(event) =>
                    onCustomDateRangeChange({ ...customDateRange, start: event.target.value || null })
                  }
                />
              </label>
              <label className="min-w-0 text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-500">结束日期</span>
                <input
                  className="form-input"
                  type="date"
                  value={customDateRange.end ?? ""}
                  onChange={(event) =>
                    onCustomDateRangeChange({ ...customDateRange, end: event.target.value || null })
                  }
                />
              </label>
            </div>
          ) : null}

          {viewModel.dateRange.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {viewModel.dateRange.error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
          <Link href="/targets?scope=company" className="primary-button justify-center">
            目标设置
          </Link>
          <Link href="/upload" className="secondary-button justify-center">
            数据导入
          </Link>
        </div>
      </div>
    </section>
  );
}
