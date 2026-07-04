"use client";

import { useEffect, useMemo, useState } from "react";
import type { UIState } from "@/lib/bi/bi.types";
import {
  createEmptyHomeBIDataSource,
  loadHomeBIDataSource,
  type BIHomeDataSource,
} from "@/lib/bi/bi.data-source";
import { buildHomeBIViewModel, type HomeBIKpiCard } from "@/lib/bi/bi.home-view-model";
import { createDefaultBIState } from "@/lib/bi/bi.store";
import {
  deriveTargetMetricValue,
  formatTargetMetricValue,
  getDerivedTargetMetricDefinitionsForScope,
  getRequiredTargetMetricDefinitionsForScope,
  getUnsupportedTargetMetricDefinitionsForScope,
  targetMetricValuesFromDrafts,
  type TargetMetricDefinition,
} from "@/lib/bi/target-metric-definitions";
import {
  loadActiveTargetDrafts,
  saveTargetDrafts,
} from "@/lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftRecord,
} from "@/lib/persistence/target-drafts-persistence.types";
import { BIChartCard } from "@/components/visual-system/v1/bi-chart";
import {
  V1DimensionScopeBar,
  V1LogoAccountButton,
  V1Sidebar,
  V1TimeRangePopover,
  V1TopBar,
  v1MonthRangeForMonth,
  v1WeekRangeForWeek,
  type V1ChartMode,
} from "@/components/visual-system/v1/visual-system";
import { BrandModelFilterPopover } from "@/components/visual-system/v1/brand-model-filter-popover";
import type { BrandModelFilter } from "@/lib/bi/search-keyword.types";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";

interface PlatformTargetField {
  label: string;
  unit: string;
  kind?: "base" | "series";
  metricKey?: string;
  format?: TargetMetricDefinition["format"];
}

interface ProductExclusionState {
  excludedProductIds: string;
  excludedRemarkKeywords: string;
}

interface HomeBIStoreOption {
  key: string;
  platformCode: string;
  storeId: string;
  storeName: string;
  platformName: string;
}

type PlatformTargetDraftInputs = Record<string, string>;

type PlatformTargetMessageTone = "info" | "success" | "warning";

interface PlatformTargetMessage {
  tone: PlatformTargetMessageTone;
  text: string;
}

const PERIODS = ["日", "周", "月", "自定义"] as const;

const FULL_HOME_KPI_TITLES = [
  "GMV",
  "GSV",
  "投入产出比",
  "去退费比",
  "直接成交占比",
  "品牌词访客",
  "品牌词支付人数",
  "GEO搜索占比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "客单价",
  "转化率",
  "推广花费",
  "推广点击单价",
  "MTD周转",
  "同区履约率",
] as const;
const DISPLAY_HOME_KPI_TITLES = FULL_HOME_KPI_TITLES;
const DISPLAY_HOME_KPI_TITLE_SET = new Set<string>(DISPLAY_HOME_KPI_TITLES);

const BASE_PLATFORM_TARGET_FIELDS: PlatformTargetField[] = getRequiredTargetMetricDefinitionsForScope("platform").map((definition) => ({
  label: definition.title,
  unit: definition.unit,
  metricKey: definition.metricKey,
  format: definition.format,
}));
const BASE_PLATFORM_TARGET_FIELD_LABELS = new Set(BASE_PLATFORM_TARGET_FIELDS.map((field) => field.label));
const DERIVED_PLATFORM_TARGET_FIELDS = getDerivedTargetMetricDefinitionsForScope("platform");
const TARGET_UNSUPPORTED_INPUT_KEYS = new Set(["mtdTurnover", "regionalFulfillmentRate", "shippedRefundRate", "signedRefundRate", "cpc"]);
const UNSUPPORTED_PLATFORM_TARGET_FIELDS = getUnsupportedTargetMetricDefinitionsForScope("platform")
  .filter((definition) => TARGET_UNSUPPORTED_INPUT_KEYS.has(definition.metricKey));

const NO_STORE_SELECTED = "__airburg_no_store_selected__";

const createInitialState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "GMV",
  brandModelFilter: {
    brandWords: [],
    modelWords: [],
    centerWordGroups: [],
  },
  timeRange: {
    mode: "day",
    startDate: null,
    endDate: null,
  },
});

const uniqueTextList = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort();

const buildStoreOptions = (source: BIHomeDataSource): HomeBIStoreOption[] =>
  Array.from(
    source.points.reduce((options, point) => {
      if (!point.storeId) return options;
      const key = point.storeId;
      if (!options.has(key)) {
        options.set(key, {
          key,
          platformCode: point.platformCode,
          storeId: point.storeId,
          storeName: point.storeName?.trim() || point.storeId,
          platformName: point.platformName?.trim() || point.platformCode,
        });
      }
      return options;
    }, new Map<string, HomeBIStoreOption>()),
  )
    .map(([, option]) => option)
    .sort((left, right) => `${left.platformName}${left.storeName}`.localeCompare(`${right.platformName}${right.storeName}`));

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

const weekRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const day = parsed.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(parsed, offsetToMonday);
  const sunday = addDays(monday, 6);
  return { startDate: formatDate(monday), endDate: formatDate(sunday) };
};

const monthRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const monthValueFromDate = (date: string | null): string | null =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null;

const dayCount = (start: string | null, end: string | null): number | null => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return null;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
};

const rangeText = (state: UIState): string =>
  state.timeRange.startDate && state.timeRange.endDate
    ? `${state.timeRange.startDate} ~ ${state.timeRange.endDate}`
    : "--";

const parseTargetNumber = (value: string): number | null => {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatTargetInputValue = (value: number): string =>
  Number.isFinite(value) ? String(value) : "";

const createPlatformTargetId = ({
  platformCode,
  storeId,
  month,
  metricKey,
}: {
  platformCode: string;
  storeId: string;
  month: string;
  metricKey: string;
}): string => `home-platform:${platformCode}:${storeId}:${month}:${metricKey}`;

function Sidebar() {
  return <V1Sidebar activeLabel="经营首页" ariaLabel="BI首页导航" itemTestId="home-bi-nav-item" sidebarTestId="home-bi-sidebar" />;
}

function TopBar() {
  return <V1TopBar title="经营首页" testId="home-bi-topbar" />;
}

function DashboardControls({
  platformTargetOpen,
  state,
  storeOptions,
  storeMenuOpen,
  customRangeError,
  onToggleStoreMenu,
  onToggleStore,
  onSelectAllStores,
  onClearStores,
  onPeriodChange,
  onDayDateChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
  onPlatformTargetOpen,
  onProductExcludeOpen,
  onBrandModelFilterOpen,
  onSeriesPickerOpen,
}: {
  platformTargetOpen: boolean;
  state: UIState;
  storeOptions: HomeBIStoreOption[];
  storeMenuOpen: boolean;
  customRangeError: string | null;
  onToggleStoreMenu: () => void;
  onToggleStore: (storeId: string) => void;
  onSelectAllStores: () => void;
  onClearStores: () => void;
  onPeriodChange: (period: (typeof PERIODS)[number]) => void;
  onDayDateChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
  onPlatformTargetOpen: () => void;
  onProductExcludeOpen: () => void;
  onBrandModelFilterOpen: () => void;
  onSeriesPickerOpen: () => void;
}) {
  const selectedStoreIds = new Set(state.selectedStores);
  const selectedStoreCount = storeOptions.filter((option) => selectedStoreIds.has(option.storeId)).length;
  const selectedPlatforms = uniqueTextList(
    storeOptions.filter((option) => selectedStoreIds.has(option.storeId)).map((option) => option.platformName),
  );
  const storeCount = storeOptions.length;

  return (
    <section data-testid="home-bi-controls" className="border-b border-slate-200 bg-white px-4 py-3">
      <div
        data-testid="home-bi-control-shell-v2"
        className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] xl:grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.4fr)] xl:items-start"
      >
        <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <V1LogoAccountButton testId="home-bi-logo-button" />
          <div className="relative min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">账号与店铺</p>
            <button
              type="button"
              aria-expanded={storeMenuOpen}
              className="inline-flex min-h-9 min-w-52 items-center justify-between gap-8 rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 text-sm font-semibold text-slate-900"
              onClick={onToggleStoreMenu}
            >
              目标店铺
              <span aria-hidden="true">▾</span>
            </button>
            {storeMenuOpen ? (
              <div className="absolute left-0 top-11 z-30 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">目标店铺</p>
                  <div className="flex gap-2">
                    <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onSelectAllStores}>
                      全部选择
                    </button>
                    <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onClearStores}>
                      清空选择
                    </button>
                  </div>
                </div>
                {storeOptions.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-500">暂无可选店铺</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {storeOptions.map((option) => (
                      <label key={option.key} className="flex items-start gap-2 rounded-xl border border-slate-200/80 px-2 py-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                          checked={selectedStoreIds.has(option.storeId)}
                          onChange={() => onToggleStore(option.storeId)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-slate-950">{option.storeName}</span>
                          <span className="block truncate text-xs text-slate-500">{option.platformName} · {option.storeId}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
            <div className="grid gap-1 text-sm text-slate-700">
              <p>店铺数量 {storeCount}个 · 已选择 {selectedStoreCount} 个店铺</p>
              <p className="break-words">涉及平台：{selectedPlatforms.length > 0 ? selectedPlatforms.join("｜") : "天猫｜京东｜抖音｜拼多多｜有赞"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">操作与统计时间</p>
            <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 md:inline-flex">
              本浏览器安全聚合数据
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          <button
            type="button"
            data-testid="home-bi-series-picker-button"
            className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold"
            onClick={onSeriesPickerOpen}
          >
            系列自定义
          </button>
          <button
            type="button"
            data-testid="home-bi-product-exclude-button"
            className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold"
            onClick={onProductExcludeOpen}
          >
            商品排除
          </button>
          <button
            type="button"
            data-testid="home-bi-brand-model-filter-button"
            className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold"
            onClick={onBrandModelFilterOpen}
          >
            品牌词筛选
          </button>
          <button
            type="button"
            data-testid="home-bi-platform-target-button"
            aria-expanded={platformTargetOpen}
            className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold"
            onClick={onPlatformTargetOpen}
          >
            平台目标
          </button>
          <V1TimeRangePopover
            testId="home-bi-time-range-popover"
            mode={state.timeRange.mode}
            startDate={state.timeRange.startDate}
            endDate={state.timeRange.endDate}
            rangeLabel={rangeText(state)}
            onPeriodChange={onPeriodChange}
            onDayChange={onDayDateChange}
            onWeekChange={onWeekChange}
            onMonthChange={onMonthChange}
            onCustomDateChange={onCustomDateChange}
          />
          {customRangeError ? <p className="w-full text-right text-xs font-semibold text-rose-700">{customRangeError}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function KPICardTile({
  card,
  selected,
  onClick,
}: {
  card: HomeBIKpiCard;
  selected: boolean;
  onClick: () => void;
}) {
  const missing = card.rawValue === null || card.value === "--";
  const progressColor = missing ? "bg-slate-300" : card.statusTone === "green" ? "bg-emerald-500" : "bg-rose-500";
  const resultTone = missing ? "font-semibold text-slate-500" : card.statusTone === "green" ? "font-semibold text-emerald-700" : "font-semibold text-rose-700";
  const helperText = missing ? "暂无可计算数据" : card.description;

  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid="home-bi-kpi-card"
      data-kpi-title={card.title}
      title={`${card.title}: 当前 ${card.value}; MTD目标 ${card.mtdTarget}; 总目标 ${card.totalTarget}; 差值 ${card.difference}; 完成率 ${card.completionRate}`}
      className={`h-[170px] min-w-0 overflow-hidden rounded-xl border p-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition ${
        selected ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200" : "border-slate-200/80 bg-white hover:bg-slate-50/80"
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="break-words text-sm font-semibold text-slate-950">{card.title}</p>
        {card.coreSeriesId ? <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">系列</span> : null}
      </div>
      <p className="mt-1.5 break-words text-xl font-semibold leading-6 text-slate-950">{card.value}</p>
      {helperText ? <p className="mt-1 min-h-4 break-words text-[10px] font-semibold text-slate-500">{helperText}</p> : null}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(card.progress, 100)}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-4 text-slate-700">
        <div className="min-w-0">
          <dt>MTD目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.mtdTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>总目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.totalTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>差值</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.difference}</dd>
        </div>
        <div className="min-w-0">
          <dt>完成率</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.completionRate}</dd>
        </div>
      </dl>
    </button>
  );
}

function KpiGrid({
  cards,
  state,
  onSelect,
}: {
  cards: HomeBIKpiCard[];
  state: UIState;
  onSelect: (card: HomeBIKpiCard) => void;
}) {
  return (
    <section
      aria-label={`首页 KPI 指标卡片，共 ${cards.length} 项`}
      data-testid="home-bi-kpi-grid"
      className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
    >
      {cards.map((card) => (
        <KPICardTile
          key={card.id}
          card={card}
          selected={state.selectedMetric === card.metricKey}
          onClick={() => onSelect(card)}
        />
      ))}
    </section>
  );
}

function PlatformTargetPopover({
  values,
  fields,
  derivedFields,
  unsupportedFields,
  month,
  message,
  canSave,
  onChange,
  onMonthChange,
  onSave,
  onClose,
}: {
  values: PlatformTargetDraftInputs;
  fields: PlatformTargetField[];
  derivedFields: TargetMetricDefinition[];
  unsupportedFields: TargetMetricDefinition[];
  month: string;
  message: PlatformTargetMessage | null;
  canSave: boolean;
  onChange: (label: string, value: string) => void;
  onMonthChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const inputValues = Object.fromEntries(
    fields.map((field) => [field.label, parseTargetNumber(values[field.label] ?? "")]).filter(([, value]) => value !== null),
  ) as Record<string, number>;
  const metricValues = targetMetricValuesFromDrafts(fields.map((field) => ({
    title: field.label,
    metricKey: field.metricKey ?? field.label,
  })), inputValues);

  return (
    <aside
      data-testid="home-bi-platform-target-popover"
      className="absolute right-4 top-28 z-20 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">设置平台目标</h2>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
          关闭
        </button>
      </div>
      <label className="mb-3 block text-sm font-semibold text-slate-800">
        月份选择
        <input
          type="month"
          className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2"
          value={month}
          onChange={(event) => onMonthChange(event.target.value)}
        />
      </label>
      <p className="mb-3 text-xs font-semibold text-slate-500">
        目标草稿保存在本浏览器，仅影响目标、差值、完成率和进度条，不改变真实实际值。
      </p>
      {message ? (
        <p
          className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : message.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {message.text}
        </p>
      ) : null}
      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">需要填写的目标</p>
          <div className="space-y-2">
            {fields.map((field) => (
              <label key={field.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm font-semibold text-slate-800">
                <span>{field.label}</span>
                <span className="flex items-center gap-2">
                  <input
                    className="w-28 rounded-xl border border-slate-200/80 px-2 py-1.5 text-right"
                    value={values[field.label] ?? ""}
                    onChange={(event) => onChange(field.label, event.target.value)}
                  />
                  <span className="w-8 text-slate-600">{field.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">自动推导的目标</p>
          <div className="space-y-2">
            {derivedFields.map((field) => {
              const derived = deriveTargetMetricValue(field.metricKey, metricValues);
              return (
                <div key={field.metricKey} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-900">
                    <span>{field.title}</span>
                    <span>{formatTargetMetricValue(derived.value, field.format)}{derived.value !== null && field.unit !== "%" ? field.unit : ""}</span>
                  </div>
                  <p className="mt-1">{field.deriveFormula}</p>
                  <p className="mt-1 text-slate-500">
                    {derived.value === null && derived.missingDependencies.length === 0
                      ? "仅展示说明，不写入目标草稿。"
                      : derived.missingDependencies.length > 0
                        ? `缺少：${derived.missingDependencies.join("、")}`
                        : "依赖已满足，保存后目标展示会使用该推导值。"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">已隐藏的目标</p>
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
            title={unsupportedFields.map((field) => `${field.title}: ${field.unsupportedReason ?? "暂不开放输入"}`).join("；")}
          >
            {unsupportedFields.length} 项暂不开放普通输入，保留为信息说明，不写入目标草稿。
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSave}
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </aside>
  );
}

function ProductExcludeDialog({
  state,
  onChange,
  onSave,
  onClose,
}: {
  state: ProductExclusionState;
  onChange: (state: ProductExclusionState) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        data-testid="home-bi-product-exclude-dialog"
        className="w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">商品排除</h2>
          <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <p className="mb-4 text-sm font-semibold text-slate-600">商品ID排除已生效；商家备注过滤将在后续字段接入后启用。</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-800">
            商品ID
            <textarea
              className="mt-2 min-h-48 w-full rounded-xl border border-slate-200/80 p-3"
              placeholder="支持多行粘贴，每行一个商品ID"
              value={state.excludedProductIds}
              onChange={(event) => onChange({ ...state, excludedProductIds: event.target.value })}
            />
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            商家备注
            <textarea
              className="mt-2 min-h-48 w-full rounded-xl border border-slate-200/80 p-3"
              placeholder="支持多行粘贴，每行一个关键词"
              value={state.excludedRemarkKeywords}
              onChange={(event) => onChange({ ...state, excludedRemarkKeywords: event.target.value })}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>
            取消
          </button>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={onSave}>
            保存
          </button>
        </div>
      </section>
    </div>
  );
}

function SeriesPickerDialog({
  seriesCards,
  selectedSeriesIds,
  onToggle,
  onClose,
}: {
  seriesCards: HomeBIKpiCard[];
  selectedSeriesIds: string[];
  onToggle: (seriesId: string) => void;
  onClose: () => void;
}) {
  const selected = new Set(selectedSeriesIds);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        data-testid="home-bi-series-picker-dialog"
        className="w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">系列自定义</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">首页最多展示 3 个已配置系列卡片。</p>
          </div>
          <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        {seriesCards.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-4 text-sm font-semibold text-slate-600">
            当前还没有配置系列。请先在系列看板维护系列，首页会自动显示可选系列。
          </p>
        ) : (
          <div className="space-y-2">
            {seriesCards.map((card) => {
              const disabled = !selected.has(card.coreSeriesId ?? "") && selected.size >= 3;
              return (
                <label key={card.id} className="flex items-start gap-2 rounded-xl border border-slate-200/80 p-3 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-slate-900"
                    checked={selected.has(card.coreSeriesId ?? "")}
                    disabled={disabled}
                    onChange={() => card.coreSeriesId && onToggle(card.coreSeriesId)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-950">{card.title}</span>
                    <span className="block text-xs text-slate-500">{card.description ?? "已配置系列"}</span>
                  </span>
                  {disabled ? <span className="text-xs text-amber-700">最多 3 个</span> : null}
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function HomeBIDashboard() {
  const [biState, setBiState] = useState<UIState>(() => createInitialState());
  const [dataSource, setDataSource] = useState<BIHomeDataSource>(() => createEmptyHomeBIDataSource("loading", "读取中"));
  const [platformTargetOpen, setPlatformTargetOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [productExcludeOpen, setProductExcludeOpen] = useState(false);
  const [brandModelFilterOpen, setBrandModelFilterOpen] = useState(false);
  const [seriesPickerOpen, setSeriesPickerOpen] = useState(false);
  const [chartMode, setChartMode] = useState<V1ChartMode>("mtd");
  const [platformTargetMonth, setPlatformTargetMonth] = useState("2026-06");
  const [platformTargetMessage, setPlatformTargetMessage] = useState<PlatformTargetMessage | null>(null);
  const [displaySeriesIds, setDisplaySeriesIds] = useState<string[]>([]);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [platformTargetInputs, setPlatformTargetInputs] = useState<PlatformTargetDraftInputs>({});
  const [debugContextReady, setDebugContextReady] = useState(false);
  const [productExclusion, setProductExclusion] = useState<ProductExclusionState>({
    excludedProductIds: "",
    excludedRemarkKeywords: "",
  });

  const storeOptions = useMemo(() => buildStoreOptions(dataSource), [dataSource]);
  const allStoreIds = useMemo(() => storeOptions.map((option) => option.storeId), [storeOptions]);
  const selectedPlatformTargetStore = useMemo(() => {
    const selectedStoreIds = biState.selectedStores.filter((storeId) => storeId !== NO_STORE_SELECTED);
    if (selectedStoreIds.length !== 1) return null;
    return storeOptions.find((option) => option.storeId === selectedStoreIds[0]) ?? null;
  }, [biState.selectedStores, storeOptions]);

  useEffect(() => {
    let active = true;

    loadCrossPageDebugContext()
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") {
          setBiState((state) => mergeDebugContextIntoUIState(state, result.snapshot, "home"));
          setChartMode(result.snapshot.pages.home.chartMode);
        }
        setDebugContextReady(true);
      })
      .catch(() => {
        if (active) setDebugContextReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    loadHomeBIDataSource()
      .then((nextSource) => {
        if (!active) return;
        setDataSource(nextSource);
        const nextStoreIds = buildStoreOptions(nextSource).map((option) => option.storeId);
        const nextMonth = monthValueFromDate(nextSource.selectedDate);
        if (nextMonth) setPlatformTargetMonth((current) => current || nextMonth);
        setBiState((state) => ({
          ...state,
          selectedStores: state.selectedStores.length > 0 ? state.selectedStores : nextStoreIds,
          timeRange: {
            ...state.timeRange,
            startDate: state.timeRange.startDate ?? nextSource.selectedDate,
            endDate: state.timeRange.endDate ?? nextSource.selectedDate,
          },
        }));
      })
      .catch(() => {
        if (!active) return;
        setDataSource(createEmptyHomeBIDataSource("error", "读取失败"));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!debugContextReady) return;
    void saveCrossPageDebugContextPatch({
      selectedPlatform: biState.selectedPlatform,
      selectedStores: biState.selectedStores,
      timeRange: biState.timeRange,
      brandModelFilter: biState.brandModelFilter,
      centerWordGroups: biState.brandModelFilter?.centerWordGroups,
      selectedMetric: biState.selectedMetric,
      chartMode,
      pages: {
        home: {
          selectedMetric: biState.selectedMetric,
          chartMode,
        },
      },
    });
  }, [
    biState.brandModelFilter,
    biState.selectedMetric,
    biState.selectedPlatform,
    biState.selectedStores,
    biState.timeRange,
    chartMode,
    debugContextReady,
  ]);

  const viewModel = useMemo(() => buildHomeBIViewModel(dataSource, biState), [dataSource, biState]);
  const baseCards = useMemo(() => viewModel.kpiCards.filter((card) => !card.coreSeriesId), [viewModel.kpiCards]);
  const seriesCards = useMemo(() => viewModel.kpiCards.filter((card) => card.coreSeriesId), [viewModel.kpiCards]);
  const mtdChart = viewModel.mtdChartModel;
  const dlyChart = viewModel.dlyChartModel;
  const activeChart = chartMode === "mtd" ? mtdChart : dlyChart;

  const cards = useMemo(
    () => DISPLAY_HOME_KPI_TITLES
      .map((title) => baseCards.find((card) => card.title === title))
      .filter((card): card is HomeBIKpiCard => Boolean(card)),
    [baseCards],
  );
  const platformTargetFields = useMemo<PlatformTargetField[]>(
    () => BASE_PLATFORM_TARGET_FIELDS,
    [],
  );
  const platformTargetFieldLabels = useMemo(() => new Set(platformTargetFields.map((field) => field.label)), [platformTargetFields]);

  useEffect(() => {
    if (DISPLAY_HOME_KPI_TITLE_SET.has(String(biState.selectedMetric))) return;
    void Promise.resolve().then(() => {
      setBiState((state) => ({ ...state, selectedMetric: "GMV", selectedSeries: null }));
    });
  }, [biState.selectedMetric]);

  useEffect(() => {
    let active = true;

    const applyTargetDrafts = (records: TargetDraftRecord[]) => {
      const draftByTitle: Record<string, number> = {};
      const inputByTitle: PlatformTargetDraftInputs = {};
      records.forEach((record) => {
        const field = BASE_PLATFORM_TARGET_FIELDS.find((targetField) => targetField.metricKey === record.metricKey);
        if (!field || record.status !== "active") return;
        draftByTitle[field.label] = record.targetValue;
        inputByTitle[field.label] = formatTargetInputValue(record.targetValue);
      });

      setPlatformTargetInputs((current) => ({
        ...Object.fromEntries(Object.entries(current).filter(([label]) => !BASE_PLATFORM_TARGET_FIELD_LABELS.has(label))),
        ...inputByTitle,
      }));
      setBiState((state) => ({
        ...state,
        targetDrafts: draftByTitle,
      }));
    };

    if (!selectedPlatformTargetStore) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setBiState((state) => ({
          ...state,
          targetDrafts: {},
        }));
        setPlatformTargetMessage({
          tone: "warning",
          text: "请选择单个店铺后设置目标。",
        });
      });
      return () => {
        active = false;
      };
    }

    void loadActiveTargetDrafts({
      scope: "platform",
      platformCode: selectedPlatformTargetStore.platformCode,
      storeId: selectedPlatformTargetStore.storeId,
      month: platformTargetMonth,
    }).then((result) => {
      if (!active) return;
      if (result.status === "ok") {
        applyTargetDrafts(result.records);
        setPlatformTargetMessage({
          tone: "success",
          text: "已恢复上次保存的平台目标草稿。",
        });
        return;
      }
      if (result.status === "empty") {
        applyTargetDrafts([]);
        setPlatformTargetMessage({
          tone: "info",
          text: "当前店铺与月份暂无平台目标草稿。",
        });
        return;
      }
      if (result.status === "corrupted") {
        applyTargetDrafts([]);
        setPlatformTargetMessage({
          tone: "warning",
          text: "目标草稿版本不兼容，已安全忽略。",
        });
        return;
      }
      setPlatformTargetMessage({
        tone: "warning",
        text: "暂时无法读取目标草稿，请稍后重试。",
      });
    });

    return () => {
      active = false;
    };
  }, [platformTargetMonth, selectedPlatformTargetStore]);

  const applyCustomRange = (startDate: string | null, endDate: string | null): boolean => {
    if (startDate && endDate && startDate > endDate) {
      setCustomRangeError("自定义时间的开始日期不能晚于结束日期。");
      return false;
    }
    const span = dayCount(startDate, endDate);
    if (span !== null && span > 365) {
      setCustomRangeError("自定义时间跨度不能超过 365 天。");
      return false;
    }
    setCustomRangeError(null);
    return true;
  };

  const handlePeriodChange = (period: (typeof PERIODS)[number]) => {
    const selectedDate = dataSource.selectedDate;
    setCustomRangeError(null);
    if (period === "日") {
      setBiState((state) => ({
        ...state,
        timeRange: { mode: "day", startDate: selectedDate, endDate: selectedDate },
      }));
      return;
    }
    if (period === "周") {
      setBiState((state) => ({
        ...state,
        timeRange: { mode: "week", ...weekRangeForDate(selectedDate) },
      }));
      return;
    }
    if (period === "月") {
      setBiState((state) => ({
        ...state,
        timeRange: { mode: "month", ...monthRangeForDate(selectedDate) },
      }));
      return;
    }
    setBiState((state) => ({
      ...state,
      timeRange: { ...state.timeRange, mode: "custom" },
    }));
  };

  const handleDayDateChange = (value: string) => {
    const date = value.trim() || null;
    setCustomRangeError(null);
    setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: date, endDate: date } }));
  };

  const handleWeekChange = (value: string) => {
    const range = v1WeekRangeForWeek(value);
    setCustomRangeError(null);
    setBiState((state) => ({ ...state, timeRange: { mode: "week", ...range } }));
  };

  const handleMonthChange = (value: string) => {
    const range = v1MonthRangeForMonth(value);
    setCustomRangeError(null);
    setBiState((state) => ({ ...state, timeRange: { mode: "month", ...range } }));
  };

  const handleCustomDateChange = (field: "startDate" | "endDate", value: string) => {
    const nextValue = value.trim() || null;
    setBiState((state) => {
      const nextRange = {
        ...state.timeRange,
        mode: "custom" as const,
        [field]: nextValue,
      };
      if (!applyCustomRange(nextRange.startDate, nextRange.endDate)) return state;
      return {
        ...state,
        timeRange: nextRange,
      };
    });
  };

  const handleToggleStore = (storeId: string) => {
    setBiState((state) => {
      const currentStores = state.selectedStores.filter((id) => id !== NO_STORE_SELECTED);
      const selected = new Set(currentStores);
      if (selected.has(storeId)) selected.delete(storeId);
      else selected.add(storeId);
      const nextStores = Array.from(selected);
      return {
        ...state,
        selectedStores: nextStores.length > 0 ? nextStores : [NO_STORE_SELECTED],
      };
    });
  };

  const handleSavePlatformTargets = async () => {
    if (!selectedPlatformTargetStore) {
      setPlatformTargetMessage({
        tone: "warning",
        text: "请选择单个店铺后设置目标。",
      });
      return;
    }

    const targetDrafts = Object.fromEntries(
      Object.entries(platformTargetInputs)
        .filter(([label]) => platformTargetFieldLabels.has(label))
        .map(([label, value]) => [label, parseTargetNumber(value)] as const)
        .filter(([, value]) => value !== null),
    ) as Record<string, number>;

    const now = new Date().toISOString();
    const records: TargetDraftRecord[] = [];
    BASE_PLATFORM_TARGET_FIELDS.forEach((field) => {
      const value = parseTargetNumber(platformTargetInputs[field.label] ?? "");
      if (value === null || !field.metricKey) return;
      records.push({
        schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
        targetId: createPlatformTargetId({
          platformCode: selectedPlatformTargetStore.platformCode,
          storeId: selectedPlatformTargetStore.storeId,
          month: platformTargetMonth,
          metricKey: field.metricKey,
        }),
        scope: "platform",
        platformCode: selectedPlatformTargetStore.platformCode,
        storeId: selectedPlatformTargetStore.storeId,
        seriesId: null,
        productId: null,
        month: platformTargetMonth,
        metricKey: field.metricKey,
        targetValue: value,
        unit: field.unit,
        createdAt: now,
        updatedAt: now,
        status: "active",
      });
    });

    const result = await saveTargetDrafts(records);
    if (result.status !== "saved") {
      setPlatformTargetMessage({
        tone: "warning",
        text: "目标草稿保存失败，请检查目标值和单位。",
      });
      return;
    }

    setBiState((state) => ({
      ...state,
      targetDrafts,
    }));
    setPlatformTargetMessage({
      tone: "success",
      text: "已保存平台目标草稿，刷新页面后可继续查看。",
    });
    setPlatformTargetOpen(false);
  };

  const handleSaveProductExclusion = () => {
    setBiState((state) => ({
      ...state,
      excludedProductIds: uniqueTextList(productExclusion.excludedProductIds.split(/\s+/)),
      excludedRemarkKeywords: uniqueTextList(productExclusion.excludedRemarkKeywords.split(/\s+/)),
    }));
    setProductExcludeOpen(false);
  };

  const handleSaveBrandModelFilter = (filter: BrandModelFilter) => {
    setBiState((state) => ({
      ...state,
      brandModelFilter: filter,
    }));
    setBrandModelFilterOpen(false);
  };

  const handleSelectCard = (card: HomeBIKpiCard) => {
    setBiState((state) => ({
      ...state,
      selectedMetric: card.metricKey,
      selectedSeries: card.coreSeriesId,
    }));
  };

  const handleToggleDisplaySeries = (seriesId: string) => {
    setDisplaySeriesIds((current) => {
      if (current.includes(seriesId)) return current.filter((id) => id !== seriesId);
      return [...current, seriesId].slice(0, 3);
    });
  };

  const selectedHomeStoreIds = biState.selectedStores.filter((storeId) => storeId !== NO_STORE_SELECTED);
  const selectedHomeStores = storeOptions.filter((option) => selectedHomeStoreIds.includes(option.storeId));
  const selectedHomePlatforms = uniqueTextList(selectedHomeStores.map((option) => option.platformName));
  const homeStoreScopeText = selectedHomeStores.length > 0
    ? `${selectedHomeStores.length} 个店铺`
    : "未选择店铺";

  return (
    <div data-testid="home-bi-dashboard" className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px]">
          <DashboardControls
            platformTargetOpen={platformTargetOpen}
            state={biState}
            storeOptions={storeOptions}
            storeMenuOpen={storeMenuOpen}
            customRangeError={customRangeError}
            onToggleStoreMenu={() => setStoreMenuOpen((open) => !open)}
            onToggleStore={handleToggleStore}
            onSelectAllStores={() => setBiState((state) => ({ ...state, selectedStores: allStoreIds }))}
            onClearStores={() => setBiState((state) => ({ ...state, selectedStores: [NO_STORE_SELECTED] }))}
            onPeriodChange={handlePeriodChange}
            onDayDateChange={handleDayDateChange}
            onWeekChange={handleWeekChange}
            onMonthChange={handleMonthChange}
            onCustomDateChange={handleCustomDateChange}
            onPlatformTargetOpen={() => setPlatformTargetOpen((open) => !open)}
            onProductExcludeOpen={() => setProductExcludeOpen(true)}
            onBrandModelFilterOpen={() => setBrandModelFilterOpen(true)}
            onSeriesPickerOpen={() => setSeriesPickerOpen(true)}
          />
          {platformTargetOpen ? (
            <PlatformTargetPopover
              values={platformTargetInputs}
              fields={platformTargetFields}
              derivedFields={DERIVED_PLATFORM_TARGET_FIELDS}
              unsupportedFields={UNSUPPORTED_PLATFORM_TARGET_FIELDS}
              month={platformTargetMonth}
              message={platformTargetMessage}
              canSave={Boolean(selectedPlatformTargetStore)}
              onChange={(label, value) => setPlatformTargetInputs((inputs) => ({ ...inputs, [label]: value }))}
              onMonthChange={setPlatformTargetMonth}
              onSave={handleSavePlatformTargets}
              onClose={() => setPlatformTargetOpen(false)}
            />
          ) : null}
          <V1DimensionScopeBar
            testId="home-bi-dimension-scope"
            platform={selectedHomePlatforms.length > 0 ? selectedHomePlatforms.join(" / ") : "全部平台"}
            store={homeStoreScopeText}
            series="全局经营视图"
            product="全商品聚合"
          />
          <div className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="mr-3 text-slate-900">{viewModel.dataStatus.label}</span>
            {viewModel.notices.slice(0, 2).join(" ")}
          </div>
          <section data-testid="home-bi-kpi-section" className="px-4 py-3" data-problem-ids="PVM2-001 PVM2-002 PVM2-003">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">经营指标</h2>
              <div className="text-xs font-semibold text-slate-500">当前值、目标、差值、完成率和进度统一展示</div>
            </div>
            <KpiGrid cards={cards} state={biState} onSelect={handleSelectCard} />
          </section>
          <section data-testid="home-bi-chart-section" className="px-4 py-3" data-problem-ids="PVM2-004">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">经营趋势</h2>
              <div className="text-xs font-semibold text-slate-500">MTD / DLY 单图切换，缺失值不按 0 绘制</div>
            </div>
            <BIChartCard
              chart={activeChart}
              mode={chartMode}
              onModeChange={setChartMode}
              variant={chartMode === "mtd" ? "line" : "bar"}
              description="缺失平台不按 0 计算；退货率仅展示安全聚合。"
              emptyText="当前指标暂无可展示趋势"
              testId="home-bi-chart-panel"
              modeSwitchTestId="home-bi-chart-mode-switch"
            />
          </section>
          </div>
        </div>
      </main>
      {productExcludeOpen ? (
        <ProductExcludeDialog
          state={productExclusion}
          onChange={setProductExclusion}
          onSave={handleSaveProductExclusion}
          onClose={() => setProductExcludeOpen(false)}
        />
      ) : null}
      {brandModelFilterOpen ? (
        <BrandModelFilterPopover
          value={biState.brandModelFilter}
          testId="home-bi-brand-model-filter-popover"
          onSave={handleSaveBrandModelFilter}
          onClear={() =>
            setBiState((state) => ({
              ...state,
              brandModelFilter: { brandWords: [], modelWords: [], centerWordGroups: [] },
            }))
          }
          onClose={() => setBrandModelFilterOpen(false)}
        />
      ) : null}
      {seriesPickerOpen ? (
        <SeriesPickerDialog
          seriesCards={seriesCards}
          selectedSeriesIds={displaySeriesIds}
          onToggle={handleToggleDisplaySeries}
          onClose={() => setSeriesPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
