"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export const v1PageBackground = "bg-[#F5F7FB]";
export const v1SidebarTone = "bg-[#111827]";
export const v1TopbarTone = "bg-[#111827]";
export const v1CardClass = "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]";
export const v1MutedCardClass = "rounded-xl border border-slate-200/80 bg-slate-50/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
export const v1ButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100";
export const v1PrimaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300";
export const v1InputClass =
  "h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-800 outline-none shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-blue-300 focus:ring-2 focus:ring-blue-100";
export const v1PopoverClass =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]";
export const v1ChartFrameClass =
  "min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/80 shadow-inner";

export const V1_NAV_ITEMS = [
  { label: "经营首页", href: "/home" },
  { label: "系列看板", href: "/series-board" },
  { label: "店铺看板", href: "/store-board" },
  { label: "宝贝看板", href: "/product-board" },
  { label: "数据上传", href: "/upload" },
  { label: "库存看板", href: "#" },
  { label: "计划拆解", href: "#" },
  { label: "历史数据", href: "/upload/history" },
  { label: "AI顾问", href: "#" },
] as const;

export type V1ChartMode = "mtd" | "dly";
export type V1TimeMode = "day" | "week" | "month" | "custom";

export interface V1TimeRangeShape {
  mode: V1TimeMode;
  startDate: string | null;
  endDate: string | null;
}

export interface V1DatasetDateRange {
  startDate: string;
  endDate: string;
}

const isV1DateText = (value: string | null | undefined): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const v1DatasetDateRangeFromDates = (dates: Array<string | null | undefined>): V1DatasetDateRange | null => {
  const sortedDates = Array.from(new Set(dates.filter(isV1DateText))).sort();
  if (sortedDates.length === 0) return null;
  return {
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
  };
};

export const v1ResolveTimeRangeForDataset = <T extends V1TimeRangeShape>(
  current: T,
  datasetRange: V1DatasetDateRange | null,
): { timeRange: T; source: "dataset" | "user" | "empty" } => {
  if (!datasetRange) return { timeRange: current, source: "empty" };
  const currentStart = isV1DateText(current.startDate) ? current.startDate : null;
  const currentEnd = isV1DateText(current.endDate) ? current.endDate : null;
  const shouldUseDatasetRange =
    !currentStart ||
    !currentEnd ||
    currentEnd < datasetRange.startDate ||
    currentStart > datasetRange.endDate;

  if (!shouldUseDatasetRange) return { timeRange: current, source: "user" };

  return {
    timeRange: {
      ...current,
      mode: datasetRange.startDate === datasetRange.endDate ? "day" : "custom",
      startDate: datasetRange.startDate,
      endDate: datasetRange.endDate,
    },
    source: "dataset",
  };
};

export const v1TimeRangeSourceLabel = (
  current: V1TimeRangeShape,
  datasetRange: V1DatasetDateRange | null,
): string => {
  if (!datasetRange || !current.startDate || !current.endDate) return "当前范围待选择";
  if (current.startDate === datasetRange.startDate && current.endDate === datasetRange.endDate) {
    return "当前范围来自数据集";
  }
  return "当前范围来自用户选择";
};

const parseDate = (date: string | null): Date | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const v1WeekRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const day = parsed.getUTCDay();
  const monday = addDays(parsed, day === 0 ? -6 : 1 - day);
  return { startDate: formatDate(monday), endDate: formatDate(addDays(monday, 6)) };
};

export const v1MonthRangeForMonth = (month: string): { startDate: string | null; endDate: string | null } => {
  if (!/^\d{4}-\d{2}$/.test(month)) return { startDate: null, endDate: null };
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) return { startDate: null, endDate: null };
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

export const v1WeekValueForDate = (date: string | null): string => {
  const parsed = parseDate(date);
  if (!parsed) return "";
  const thursday = addDays(parsed, 4 - (parsed.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

export const v1WeekRangeForWeek = (weekValue: string): { startDate: string | null; endDate: string | null } => {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekValue);
  if (!match) return { startDate: null, endDate: null };
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return { startDate: null, endDate: null };
  }
  const janFourth = new Date(Date.UTC(year, 0, 4));
  const janFourthDay = janFourth.getUTCDay() || 7;
  const weekOneMonday = addDays(janFourth, 1 - janFourthDay);
  const monday = addDays(weekOneMonday, (week - 1) * 7);
  return { startDate: formatDate(monday), endDate: formatDate(addDays(monday, 6)) };
};

export function V1LogoAccountButton({
  testId,
  size = "default",
}: {
  testId?: string;
  size?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const buttonSizeClass = size === "compact" ? "h-11 w-11 text-[10px]" : "h-[72px] w-[72px] text-sm";
  const popoverOffsetClass = size === "compact" ? "top-[54px]" : "top-[82px]";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        data-logo-size={size}
        className={`flex ${buttonSizeClass} items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100`}
        onClick={() => setOpen((current) => !current)}
      >
        空
      </button>
      {open ? (
        <div className={`${v1PopoverClass} absolute left-0 ${popoverOffsetClass} z-40 w-[min(280px,calc(100vw-2rem))] p-3 text-sm text-slate-700`}>
          <p className="font-semibold text-slate-950">体现账号信息</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">空气堡经营数据工作台</p>
          <div className="mt-3 space-y-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs font-semibold">
            <p>账号：本地预览账号</p>
            <p>角色：经营分析</p>
            <p>状态：本浏览器内测访问</p>
          </div>
          <button
            type="button"
            className="mt-3 rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-700"
            onClick={() => setOpen(false)}
          >
            收起
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function V1ChartModeSwitch({
  mode,
  onChange,
  testId,
}: {
  mode: V1ChartMode;
  onChange: (mode: V1ChartMode) => void;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="inline-flex overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {(["mtd", "dly"] as const).map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          className={`min-w-20 px-3 py-2 text-xs font-semibold ${
            mode === item ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-50"
          }`}
          onClick={() => onChange(item)}
        >
          {item === "mtd" ? "MTD参考图" : "DLY参考图"}
        </button>
      ))}
    </div>
  );
}

export function V1TimeRangeDetailControls({
  mode,
  startDate,
  endDate,
  onDayChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
}: {
  mode: V1TimeMode;
  startDate: string | null;
  endDate: string | null;
  onDayChange: (date: string) => void;
  onWeekChange: (weekValue: string) => void;
  onMonthChange: (monthValue: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
}) {
  if (mode === "day") {
    return (
      <label className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        选择日期
        <input
          type="date"
          className="min-h-8 rounded-lg border border-slate-200/80 px-2 text-xs"
          value={startDate ?? ""}
          onChange={(event) => onDayChange(event.target.value)}
        />
      </label>
    );
  }

  if (mode === "week") {
    return (
      <label className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        选择周
        <input
          type="week"
          className="min-h-8 rounded-lg border border-slate-200/80 px-2 text-xs"
          value={v1WeekValueForDate(startDate)}
          onChange={(event) => onWeekChange(event.target.value)}
        />
      </label>
    );
  }

  if (mode === "month") {
    return (
      <label className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        选择月份
        <input
          type="month"
          className="min-h-8 rounded-lg border border-slate-200/80 px-2 text-xs"
          value={startDate?.slice(0, 7) ?? ""}
          onChange={(event) => onMonthChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <label>
        开始
        <input
          type="date"
          className="ml-1 min-h-8 rounded-lg border border-slate-200/80 px-2 text-xs"
          value={startDate ?? ""}
          onChange={(event) => onCustomDateChange("startDate", event.target.value)}
        />
      </label>
      <label>
        结束
        <input
          type="date"
          className="ml-1 min-h-8 rounded-lg border border-slate-200/80 px-2 text-xs"
          value={endDate ?? ""}
          onChange={(event) => onCustomDateChange("endDate", event.target.value)}
        />
      </label>
    </div>
  );
}

export function V1TimeRangePopover({
  mode,
  startDate,
  endDate,
  rangeLabel,
  onPeriodChange,
  onDayChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
  testId,
  variant = "button",
}: {
  mode: V1TimeMode;
  startDate: string | null;
  endDate: string | null;
  rangeLabel: string;
  onPeriodChange: (period: "日" | "周" | "月" | "自定义") => void;
  onDayChange: (date: string) => void;
  onWeekChange: (weekValue: string) => void;
  onMonthChange: (monthValue: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
  testId?: string;
  variant?: "button" | "split";
}) {
  const [open, setOpen] = useState(false);
  const [panelPeriod, setPanelPeriod] = useState<"日" | "周" | "月" | "自定义" | null>(null);
  const activePeriod = mode === "day" ? "日" : mode === "week" ? "周" : mode === "month" ? "月" : "自定义";
  const visiblePeriod = panelPeriod ?? activePeriod;

  if (variant === "split") {
    const today = formatDate(new Date());
    const panelWidthClass = visiblePeriod === "日"
      ? "w-[min(320px,calc(100vw-2rem))]"
      : visiblePeriod === "周"
        ? "w-[min(340px,calc(100vw-2rem))]"
        : visiblePeriod === "月"
          ? "w-[min(300px,calc(100vw-2rem))]"
          : "w-[min(380px,calc(100vw-2rem))]";

    const closePanel = () => {
      setOpen(false);
      setPanelPeriod(null);
    };

    return (
      <div data-testid={testId} data-time-range-variant="split" className="relative flex max-w-full flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">统计时间</span>
        {(["日", "周", "月", "自定义"] as const).map((period) => (
          <button
            key={period}
            type="button"
            data-testid={testId ? `${testId}-${period === "日" ? "day" : period === "周" ? "week" : period === "月" ? "month" : "custom"}-button` : undefined}
            aria-pressed={activePeriod === period}
            aria-expanded={open && visiblePeriod === period}
            className={`min-h-8 rounded-lg border px-3 text-xs font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${
              activePeriod === period
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950"
            }`}
            onMouseEnter={() => {
              setPanelPeriod(period);
              setOpen(true);
            }}
            onClick={() => {
              if (open && visiblePeriod === period) {
                setOpen(false);
                setPanelPeriod(null);
                return;
              }
              setPanelPeriod(period);
              setOpen(true);
              onPeriodChange(period);
            }}
          >
            {period}
          </button>
        ))}
        <span className="min-w-0 truncate text-xs font-semibold text-slate-600">{rangeLabel}</span>
        {open ? (
          <div
            data-testid={testId ? `${testId}-panel` : "v1-time-range-popover-panel"}
            data-time-range-panel={visiblePeriod}
            data-compact-popover="true"
            className={`${v1PopoverClass} ${panelWidthClass} absolute left-0 top-10 z-50 p-2.5 sm:left-auto sm:right-0`}
            onMouseLeave={() => setPanelPeriod(null)}
          >
            {visiblePeriod === "日" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-950">选择日期</p>
                <input
                  type="date"
                  className="min-h-9 w-full rounded-lg border border-slate-200/80 px-2 text-sm font-semibold"
                  value={startDate ?? ""}
                  onChange={(event) => onDayChange(event.target.value)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={() => onDayChange("")}>清除</button>
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={() => onDayChange(today)}>今天</button>
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={closePanel}>取消</button>
                  <button type="button" className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white" onClick={closePanel}>确定</button>
                </div>
              </div>
            ) : null}
            {visiblePeriod === "周" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-950">选择周</p>
                <input
                  type="week"
                  className="min-h-9 w-full rounded-lg border border-slate-200/80 px-2 text-sm font-semibold"
                  value={v1WeekValueForDate(startDate)}
                  onChange={(event) => onWeekChange(event.target.value)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={() => onWeekChange(v1WeekValueForDate(today))}>本周</button>
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={closePanel}>取消</button>
                  <button type="button" className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white" onClick={closePanel}>确定</button>
                </div>
              </div>
            ) : null}
            {visiblePeriod === "月" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-950">选择月份</p>
                <input
                  type="month"
                  className="min-h-9 w-full rounded-lg border border-slate-200/80 px-2 text-sm font-semibold"
                  value={startDate?.slice(0, 7) ?? ""}
                  onChange={(event) => onMonthChange(event.target.value)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={() => onMonthChange(today.slice(0, 7))}>本月</button>
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={closePanel}>取消</button>
                  <button type="button" className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white" onClick={closePanel}>确定</button>
                </div>
              </div>
            ) : null}
            {visiblePeriod === "自定义" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-950">自定义范围</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    开始日期
                    <input
                      type="date"
                      className="mt-1 min-h-9 w-full rounded-lg border border-slate-200/80 px-2 text-sm font-semibold text-slate-900"
                      value={startDate ?? ""}
                      onChange={(event) => onCustomDateChange("startDate", event.target.value)}
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    结束日期
                    <input
                      type="date"
                      className="mt-1 min-h-9 w-full rounded-lg border border-slate-200/80 px-2 text-sm font-semibold text-slate-900"
                      value={endDate ?? ""}
                      onChange={(event) => onCustomDateChange("endDate", event.target.value)}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="rounded-lg border border-slate-200/80 px-2.5 py-1 text-xs font-semibold" onClick={closePanel}>取消</button>
                  <button type="button" className="rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white" onClick={closePanel}>确定</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid={testId} className="relative max-w-full">
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex min-h-10 max-w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">统计时间 {rangeLabel}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{activePeriod}</span>
      </button>
      {open ? (
        <div
          data-testid={testId ? `${testId}-panel` : "v1-time-range-popover-panel"}
          className={`${v1PopoverClass} absolute left-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] p-3 sm:left-auto sm:right-0`}
        >
          <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
            <p className="text-sm font-semibold text-slate-950">选择统计时间</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              日 / 周 / 月用于快速切换，自定义用于核对连续日期；这里只调整展示范围，不改变数据源。
            </p>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(["日", "周", "月", "自定义"] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={activePeriod === period}
                className={`min-h-8 rounded-xl border px-3 text-xs font-semibold ${
                  activePeriod === period
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200/80 bg-white text-slate-800 hover:bg-slate-50"
                }`}
                onClick={() => onPeriodChange(period)}
              >
                {period === "日" ? "按日" : period === "周" ? "按周" : period === "月" ? "按月" : period}
              </button>
            ))}
          </div>
          <V1TimeRangeDetailControls
            mode={mode}
            startDate={startDate}
            endDate={endDate}
            onDayChange={onDayChange}
            onWeekChange={onWeekChange}
            onMonthChange={onMonthChange}
            onCustomDateChange={onCustomDateChange}
          />
        </div>
      ) : null}
    </div>
  );
}

export function V1Sidebar({
  activeLabel,
  ariaLabel,
  itemTestId,
  sidebarTestId,
}: {
  activeLabel: string;
  ariaLabel: string;
  itemTestId?: string;
  sidebarTestId?: string;
}) {
  return (
    <aside
      data-testid={sidebarTestId}
      className={`hidden w-[232px] shrink-0 border-r border-slate-800 ${v1SidebarTone} px-4 py-4 text-white shadow-[8px_0_28px_rgba(15,23,42,0.18)] lg:block`}
    >
      <button
        type="button"
        className="mb-5 w-full rounded-xl border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-left text-sm font-semibold text-slate-100 shadow-[0_1px_2px_rgba(0,0,0,0.16)] transition hover:border-blue-300 hover:bg-slate-800"
      >
        体现账号信息
      </button>
      <nav aria-label={ariaLabel} className="space-y-1.5">
        {V1_NAV_ITEMS.map((item) => {
          const active = item.label === activeLabel;
          const className = `block min-h-9 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
            active
              ? "bg-blue-500 text-white shadow-[0_6px_16px_rgba(37,99,235,0.22)]"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`;

          if (item.href === "#") {
            return (
              <button
                key={item.label}
                type="button"
                data-testid={itemTestId}
                aria-current={active ? "page" : void 0}
                className={className}
              >
                {item.label}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              data-testid={itemTestId}
              aria-current={active ? "page" : void 0}
              className={className}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function V1TopBar({ title, testId }: { title: string; testId?: string }) {
  return (
    <header
      data-testid={testId}
      className={`flex h-12 shrink-0 items-center justify-between ${v1TopbarTone} px-5 text-white shadow-[0_1px_0_rgba(255,255,255,0.04)]`}
    >
      <div className="text-base font-semibold tracking-normal">{title}</div>
      <button
        type="button"
        className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
      >
        退出
      </button>
    </header>
  );
}

export function V1SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      {description ? <div className="text-xs font-semibold text-slate-500">{description}</div> : null}
    </div>
  );
}

export function V1DimensionScopeBar({
  platform,
  store,
  series,
  product,
  testId = "v1-dimension-scope-bar",
  variant = "chips",
}: {
  platform: ReactNode;
  store: ReactNode;
  series: ReactNode;
  product: ReactNode;
  testId?: string;
  variant?: "chips" | "compact";
}) {
  const items = [
    { label: "platform", title: "平台", value: platform },
    { label: "store", title: "店铺", value: store },
    { label: "series", title: "系列", value: series },
    { label: "product", title: "商品", value: product },
  ];

  if (variant === "compact") {
    return (
      <section
        data-testid={testId}
        data-problem-ids="PVM2-001 PVM2-013"
        data-scope-variant="compact"
        className="min-w-0 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2"
        aria-label="当前范围"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-600">
          <span className="shrink-0 text-slate-900">当前范围</span>
          {items.map((item, index) => (
            <span key={item.label} data-dimension-scope={item.label} className="inline-flex min-w-0 items-center gap-1">
              {index > 0 ? <span className="text-slate-300">/</span> : null}
              <span className="shrink-0 text-slate-500">{item.title}：</span>
              <span className="min-w-0 max-w-[180px] truncate text-slate-950">{item.value}</span>
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid={testId}
      data-problem-ids="PVM2-007 PVM2-008 PVM2-009 PVM2-013"
      className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
      aria-label="统一维度范围"
    >
      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
        <span className="shrink-0 text-xs font-semibold text-slate-500">当前范围</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            data-dimension-scope={item.label}
            className="inline-flex min-h-8 min-w-0 max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700"
          >
            <span className="shrink-0 uppercase text-slate-400">{item.label}</span>
            <span className="min-w-0 truncate text-slate-900">{item.value}</span>
          </span>
        ))}
        </div>
      </div>
    </section>
  );
}

export function V1StatusBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "green" | "yellow" | "red" | "blue" | "slate";
}) {
  const toneClass = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${toneClass}`}>{children}</span>;
}
