"use client";

import { useEffect, useMemo, useState } from "react";
import type { BIDataPoint, BIMetricValue, ChartSeries, UIState } from "@/lib/bi/bi.types";
import {
  createEmptyHomeBIDataSource,
  loadHomeBIDataSource,
  type BIHomeDataSource,
} from "@/lib/bi/bi.data-source";
import { createDefaultBIState } from "@/lib/bi/bi.store";
import { BIChartCard } from "@/components/visual-system/v1/bi-chart";
import { dateAxisWithTimeRangeFallback } from "@/components/visual-system/v1/chart-utils";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";
import {
  V1Sidebar,
  V1TimeRangePopover,
  V1TopBar,
  v1DatasetDateRangeFromDates,
  v1MonthRangeForMonth,
  v1ResolveTimeRangeForDataset,
  v1TimeRangeSourceLabel,
  v1WeekRangeForWeek,
  type V1ChartMode,
} from "@/components/visual-system/v1/visual-system";

type PeriodLabel = "日" | "周" | "月" | "自定义";
type PopupKind = "store" | null;
type Tone = "green" | "red" | "neutral";

interface StoreOption {
  key: string;
  storeId: string;
  storeName: string;
  platformCode: string;
  platformName: string;
  status: "active" | "inactive";
  source: "data" | "temp";
}

interface TempStoreItem {
  id: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  status: "active" | "inactive";
}

interface StoreKpiDefinition {
  key: string;
  title: string;
  unit: string;
  direction: "higher" | "lower" | "budget";
}

interface StoreKpiCard {
  key: string;
  title: string;
  value: string;
  rawValue: BIMetricValue;
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number;
  tone: Tone;
}

interface ProductContribution {
  key: string;
  rank: number;
  productName: string;
  productId: string;
  platformName: string;
  storeName: string;
  gmv: number | null;
  share: number | null;
  adSpend: number | null;
  roi: number | null;
  conversionRate: number | null;
}

const PLATFORM_OPTIONS = [
  { code: "tmall", name: "天猫" },
  { code: "jd", name: "京东" },
  { code: "pdd", name: "拼多多" },
  { code: "douyin", name: "抖音" },
  { code: "youzan", name: "有赞" },
];

const STORE_KPIS: StoreKpiDefinition[] = [
  { key: "storeGmv", title: "店铺GMV", unit: "元", direction: "higher" },
  { key: "storeGsv", title: "店铺GSV", unit: "元", direction: "higher" },
  { key: "refundFeeRatio", title: "去退费比", unit: "%", direction: "lower" },
  { key: "brandVisitors", title: "品牌词访客", unit: "人", direction: "higher" },
  { key: "brandPaidBuyers", title: "品牌词支付人数", unit: "人", direction: "higher" },
  { key: "geoSearchShare", title: "GEO搜索占比", unit: "%", direction: "higher" },
  { key: "adRoi", title: "投入产出比", unit: "倍", direction: "higher" },
  { key: "returnRateTotal", title: "退货率（总）", unit: "%", direction: "lower" },
  { key: "returnRateShipped", title: "发货退货率", unit: "%", direction: "lower" },
  { key: "returnRateSigned", title: "已签收退货率", unit: "%", direction: "lower" },
  { key: "cpc", title: "推广点击单价", unit: "元", direction: "lower" },
  { key: "averageOrderValue", title: "客单价", unit: "元", direction: "higher" },
  { key: "conversionRate", title: "转化率", unit: "%", direction: "higher" },
  { key: "adSpend", title: "推广花费", unit: "元", direction: "budget" },
  { key: "directSalesShare", title: "直接成交占比", unit: "%", direction: "higher" },
];

const NO_STORE_SELECTED = "__airburg_store_no_store_selected__";
const FULL_STORE_KPI_KEYS = [
  "storeGmv",
  "storeGsv",
  "adRoi",
  "refundFeeRatio",
  "directSalesShare",
  "brandVisitors",
  "brandPaidBuyers",
  "geoSearchShare",
  "returnRateTotal",
  "returnRateShipped",
  "returnRateSigned",
  "averageOrderValue",
  "conversionRate",
  "adSpend",
  "cpc",
] as const;
const DISPLAY_STORE_KPI_KEYS = FULL_STORE_KPI_KEYS;
const DISPLAY_STORE_KPI_KEY_SET = new Set<string>(DISPLAY_STORE_KPI_KEYS);

const storeKey = (platformCode: string, storeId: string) => `${platformCode}::${storeId}`;
const debugStoreIdFromStoreKey = (key: string): string => (key.includes("::") ? key.split("::")[1] ?? key : key);

const storeKeysFromDebugStoreIds = (source: BIHomeDataSource, storeIds: string[]): string[] => {
  const selected = new Set(storeIds.map(debugStoreIdFromStoreKey).filter(Boolean));
  if (selected.size === 0) return [];
  return buildStoreOptions(source, [])
    .filter((store) => selected.has(store.storeId))
    .map((store) => store.key);
};

const createInitialState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "storeGmv",
  timeRange: {
    mode: "day",
    startDate: null,
    endDate: null,
  },
});

const safeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sumMetric = (points: BIDataPoint[], metricKey: string): number | null => {
  let hasValue = false;
  const total = points.reduce((sum, point) => {
    const value = safeNumber(point.metrics[metricKey]);
    if (value === null) return sum;
    hasValue = true;
    return sum + value;
  }, 0);
  return hasValue ? total : null;
};

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;

const formatNumber = (value: number | null, options?: { percent?: boolean; digits?: number }): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const digits = options?.digits ?? (Math.abs(value) >= 100 ? 0 : 2);
  const normalized = options?.percent ? value * 100 : value;
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : Math.min(digits, 2),
  }).format(normalized);
  return options?.percent ? `${formatted}%` : formatted;
};

const formatKpiValue = (definition: StoreKpiDefinition, value: number | null): string => {
  if (value === null) return "--";
  if (definition.unit === "%") return formatNumber(value, { percent: true, digits: 2 });
  return formatNumber(value, { digits: definition.unit === "倍" ? 2 : 0 });
};

const uniqueTextList = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

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
  return { startDate: formatDate(monday), endDate: formatDate(addDays(monday, 6)) };
};

const monthRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const inDateRange = (point: BIDataPoint, state: UIState): boolean => {
  const { startDate, endDate } = state.timeRange;
  if (startDate && point.businessDate < startDate) return false;
  if (endDate && point.businessDate > endDate) return false;
  return true;
};

const rangeText = (state: UIState): string =>
  state.timeRange.startDate && state.timeRange.endDate
    ? `${state.timeRange.startDate} ~ ${state.timeRange.endDate}`
    : "--";

const DATASET_RANGE_METRIC_KEYS = [
  "gmv",
  "gsv",
  "visitors",
  "paidBuyers",
  "adSpend",
  "adRevenue",
  "adClicks",
  "directTransactionAmount",
  "indirectTransactionAmount",
  "totalTransactionAmount",
] as const;

const hasDatasetRangeMetric = (point: BIDataPoint): boolean =>
  DATASET_RANGE_METRIC_KEYS.some((key) => typeof point.metrics[key] === "number" && Number.isFinite(point.metrics[key]));

const datasetDateRangeForSource = (source: BIHomeDataSource) => {
  const primaryRange = v1DatasetDateRangeFromDates([
    ...source.points.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.seriesPoints.filter(hasDatasetRangeMetric).map((point) => point.businessDate),
    ...source.searchTotalKeywords.map((keyword) => keyword.date),
    ...source.searchProductKeywords.map((keyword) => keyword.date),
  ]);
  return primaryRange ?? v1DatasetDateRangeFromDates(source.points.map((point) => point.businessDate));
};

const buildStoreOptions = (source: BIHomeDataSource, tempStores: TempStoreItem[]): StoreOption[] => {
  const options = new Map<string, StoreOption>();
  source.points.forEach((point) => {
    if (!point.storeId) return;
    const key = storeKey(point.platformCode, point.storeId);
    options.set(key, {
      key,
      storeId: point.storeId,
      storeName: point.storeName?.trim() || point.storeId,
      platformCode: point.platformCode,
      platformName: point.platformName?.trim() || point.platformCode,
      status: "active",
      source: "data",
    });
  });
  tempStores.forEach((store) => {
    const key = storeKey(store.platformCode, store.storeId);
    if (options.has(key)) return;
    options.set(key, { ...store, key, source: "temp" });
  });
  return Array.from(options.values()).sort((left, right) =>
    `${left.platformName}${left.storeName}${left.storeId}`.localeCompare(
      `${right.platformName}${right.storeName}${right.storeId}`,
    ),
  );
};

const metricValue = (points: BIDataPoint[], key: string): number | null => {
  const gmv = sumMetric(points, "gmv");
  const gsv = sumMetric(points, "gsv");
  const visitors = sumMetric(points, "visitors");
  const paidBuyers = sumMetric(points, "paidBuyers");
  const adSpend = sumMetric(points, "adSpend");
  const adRevenue = sumMetric(points, "adRevenue");
  const adClicks = sumMetric(points, "adClicks");
  const refundAmount = sumMetric(points, "refundAmount");
  const directTransactionAmount = sumMetric(points, "directTransactionAmount");

  switch (key) {
    case "storeGmv":
      return gmv;
    case "storeGsv":
      return gsv;
    case "adRoi":
      return ratio(adRevenue, adSpend);
    case "returnRateTotal":
      return ratio(refundAmount, gsv);
    case "cpc":
      return ratio(adSpend, adClicks);
    case "averageOrderValue":
      return ratio(gmv, paidBuyers);
    case "conversionRate":
      return ratio(paidBuyers, visitors);
    case "adSpend":
      return adSpend;
    case "directSalesShare":
      return ratio(directTransactionAmount, gmv);
    default:
      return null;
  }
};

const scopedStorePoints = (source: BIHomeDataSource, state: UIState): BIDataPoint[] => {
  const selected = new Set(state.selectedStores.filter((key) => key !== NO_STORE_SELECTED));
  if (selected.size === 0) return [];
  return source.points.filter((point) => {
    if (!point.storeId) return false;
    if (!selected.has(storeKey(point.platformCode, point.storeId))) return false;
    return inDateRange(point, state);
  });
};

const buildKpiCards = (points: BIDataPoint[]): StoreKpiCard[] =>
  STORE_KPIS.map((definition) => {
    const rawValue = metricValue(points, definition.key);
    return {
      key: definition.key,
      title: definition.title,
      value: formatKpiValue(definition, rawValue),
      rawValue,
      mtdTarget: "--",
      totalTarget: "--",
      difference: "--",
      completionRate: "--",
      progress: 0,
      tone: "neutral",
    };
  });

const buildChartLines = (
  points: BIDataPoint[],
  storeOptions: StoreOption[],
  selectedStores: string[],
  state: UIState,
  selectedMetric: string,
): { xAxis: string[]; lines: ChartSeries[]; title: string; empty: boolean } => {
  const dates = Array.from(new Set(points.map((point) => point.businessDate))).sort();
  const xAxis = dateAxisWithTimeRangeFallback(dates, state.timeRange.startDate, state.timeRange.endDate);
  const selectedDefinition = STORE_KPIS.find((kpi) => kpi.key === selectedMetric) ?? STORE_KPIS[0];
  const selectedSet = new Set(selectedStores.filter((key) => key !== NO_STORE_SELECTED));

  if (selectedMetric === "returnRateTotal" || selectedMetric === "returnRateShipped" || selectedMetric === "returnRateSigned") {
    const names = [
      ["return-total", "总退货率", "returnRateTotal"],
      ["return-shipped", "发货退货率", "returnRateShipped"],
      ["return-signed", "已签收退货率", "returnRateSigned"],
    ] as const;
    return {
      xAxis,
      title: `${selectedDefinition.title} · 退货率趋势对比`,
      empty: points.length === 0,
      lines: names.map(([id, name, key]) => ({
        id,
        name,
        entityLevel: "store",
        entityId: "selected-stores",
        points: xAxis.map((date) => ({
          date,
          value: metricValue(points.filter((point) => point.businessDate === date), key),
        })),
      })),
    };
  }

  const activeStores = storeOptions.filter((store) => selectedSet.has(store.key));
  return {
    xAxis,
    empty: points.length === 0,
    title: `${selectedDefinition.title} · 平台 × 店铺趋势`,
    lines: activeStores.map((store) => ({
      id: `${store.key}-${selectedMetric}`,
      name: `${store.platformName}-${store.storeName}`,
      entityLevel: "store" as const,
      entityId: store.key,
      points: xAxis.map((date) => ({
        date,
        value: metricValue(
          points.filter(
            (point) =>
              point.platformCode === store.platformCode &&
              point.storeId === store.storeId &&
              point.businessDate === date,
          ),
          selectedMetric,
        ),
      })),
    })),
  };
};

const buildContributions = (points: BIDataPoint[]): ProductContribution[] => {
  const grouped = new Map<string, BIDataPoint[]>();
  points.forEach((point) => {
    if (!point.productId || !point.storeId) return;
    const key = `${point.platformCode}:${point.storeId}:${point.productId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  });
  const totalGmv = sumMetric(points, "gmv");
  return Array.from(grouped.entries())
    .map(([key, productPoints]) => {
      const first = productPoints[0];
      const gmv = sumMetric(productPoints, "gmv");
      const adSpend = sumMetric(productPoints, "adSpend");
      return {
        key,
        rank: 0,
        productName: first?.productName || first?.productId || "--",
        productId: first?.productId || "--",
        platformName: first?.platformName || first?.platformCode || "--",
        storeName: first?.storeName || first?.storeId || "--",
        gmv,
        share: ratio(gmv, totalGmv),
        adSpend,
        roi: ratio(sumMetric(productPoints, "adRevenue"), adSpend),
        conversionRate: ratio(sumMetric(productPoints, "paidBuyers"), sumMetric(productPoints, "visitors")),
      };
    })
    .sort((left, right) => (right.gmv ?? -1) - (left.gmv ?? -1) || left.productName.localeCompare(right.productName))
    .slice(0, 8)
    .map((item, index) => ({ ...item, rank: index + 1 }));
};

function Sidebar() {
  return (
    <V1Sidebar
      activeLabel="店铺看板"
      ariaLabel="店铺看板导航"
      itemTestId="store-board-v1-nav-item"
      sidebarTestId="store-board-v1-sidebar"
    />
  );
}

function TopBar() {
  return <V1TopBar title="店铺看板" />;
}

function KpiCard({ card, selected, onClick }: { card: StoreKpiCard; selected: boolean; onClick: () => void }) {
  const missing = card.rawValue === null || card.value === "--";
  const progressColor = missing ? "bg-slate-300" : card.tone === "green" ? "bg-emerald-500" : card.tone === "red" ? "bg-rose-500" : "bg-slate-400";
  const resultTone = missing ? "font-semibold text-slate-500" : card.tone === "green" ? "font-semibold text-emerald-700" : card.tone === "red" ? "font-semibold text-rose-700" : "font-semibold text-slate-500";
  const helperText = missing ? "暂无可计算数据" : "当前店铺口径";
  return (
    <button
      type="button"
      data-testid="store-board-v1-kpi-card"
      data-kpi-title={card.title}
      aria-pressed={selected}
      title={`${card.title}: 当前 ${card.value}; MTD目标 ${card.mtdTarget}; 总目标 ${card.totalTarget}; 差值 ${card.difference}; 完成率 ${card.completionRate}`}
      className={`h-[170px] min-w-0 overflow-hidden rounded-xl border p-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition ${
        selected ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200" : "border-slate-200/80 bg-white hover:bg-slate-50/80"
      }`}
      onClick={onClick}
    >
      <p className="break-words text-sm font-semibold text-slate-950">{card.title}</p>
      <p className="mt-1.5 break-words text-xl font-semibold leading-6 text-slate-950">{card.value}</p>
      <p className="mt-1 min-h-4 break-words text-[10px] font-semibold text-slate-500">{helperText}</p>
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
          <dd className={`truncate text-right ${resultTone}`}>
            {card.difference}
          </dd>
        </div>
        <div className="min-w-0">
          <dt>完成率</dt>
          <dd className={`truncate text-right ${resultTone}`}>
            {card.completionRate}
          </dd>
        </div>
      </dl>
    </button>
  );
}

function ProductContributionTop({ items }: { items: ProductContribution[] }) {
  const maxGmv = Math.max(...items.map((item) => item.gmv ?? 0), 1);
  return (
    <section
      data-testid="store-board-v1-product-top"
      className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4"
      aria-label="店铺内商品贡献 TOP"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-950">店铺内商品贡献 TOP</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">只统计当前选中店铺和时间范围，缺失值显示 --。</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-5 text-sm font-semibold text-slate-500">
          当前店铺暂无商品贡献数据。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const width = item.gmv === null ? 0 : Math.max((item.gmv / maxGmv) * 100, 4);
            return (
              <div key={item.key} className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                  <span className="rounded-full bg-slate-900 px-2 py-1 text-white">#{item.rank}</span>
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-950">
                    {item.productName} <span className="font-semibold text-slate-500">({item.productId})</span>
                  </span>
                  <span>{item.platformName} · {item.storeName}</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 md:grid-cols-4">
                  <div>
                    <dt>GMV</dt>
                    <dd className="text-slate-950">{formatNumber(item.gmv, { digits: 0 })}</dd>
                  </div>
                  <div>
                    <dt>占店铺GMV</dt>
                    <dd className="text-slate-950">{formatNumber(item.share, { percent: true, digits: 2 })}</dd>
                  </div>
                  <div>
                    <dt>推广花费</dt>
                    <dd className="text-slate-950">{formatNumber(item.adSpend, { digits: 0 })}</dd>
                  </div>
                  <div>
                    <dt>ROI / 转化率</dt>
                    <dd className="text-slate-950">
                      {item.roi !== null ? formatNumber(item.roi, { digits: 2 }) : formatNumber(item.conversionRate, { percent: true, digits: 2 })}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ControlBar({
  state,
  storeOptions,
  storeMenuOpen,
  onToggleStoreMenu,
  onToggleStore,
  onSelectAllStores,
  onClearStores,
  onOpenPopup,
  onPeriodChange,
  onDayDateChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
}: {
  state: UIState;
  storeOptions: StoreOption[];
  storeMenuOpen: boolean;
  onToggleStoreMenu: () => void;
  onToggleStore: (storeKeyValue: string) => void;
  onSelectAllStores: () => void;
  onClearStores: () => void;
  onOpenPopup: (kind: PopupKind) => void;
  onPeriodChange: (period: PeriodLabel) => void;
  onDayDateChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
}) {
  const selectedSet = new Set(state.selectedStores.filter((key) => key !== NO_STORE_SELECTED));
  const selectedStores = storeOptions.filter((option) => selectedSet.has(option.key));
  const platformText = uniqueTextList(selectedStores.map((store) => store.platformName)).join(" / ") || "天猫";
  const selectedStoreText =
    selectedStores.length === 1 ? selectedStores[0].storeName : selectedStores.length > 1 ? `${selectedStores.length} 个店铺` : "未选择店铺";
  const scopeBreadcrumb = `${platformText} / ${selectedStoreText} / 不按系列筛选 / 店铺内商品聚合`;
  return (
    <section
      className="border-b border-slate-200 bg-white px-4 py-2"
      data-testid="store-board-v1-control"
      data-problem-ids="PVM2-001 PVM2-002 PVM2-004 PVM2-006 PVM2-008 PVM2-013"
    >
      <div className="space-y-1.5">
        <div data-testid="store-board-v1-business-toolbar" className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">店铺：</span>
              <button
                type="button"
                data-testid="store-board-v1-target-store"
                aria-expanded={storeMenuOpen}
                className="inline-flex min-h-8 w-[min(220px,70vw)] items-center justify-between gap-4 rounded-lg border border-slate-200/80 bg-white px-3 text-left text-sm font-semibold text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                onClick={onToggleStoreMenu}
              >
                <span className="truncate">目标店铺</span>
                <span aria-hidden="true">▾</span>
              </button>
      {storeMenuOpen ? (
        <div
          data-testid="store-board-v1-store-menu"
                  className="absolute left-0 top-10 z-30 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
        >
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded-xl border border-slate-200/80 px-3 py-1 text-xs font-semibold" onClick={onSelectAllStores}>
              全选
            </button>
            <button type="button" className="rounded-xl border border-slate-200/80 px-3 py-1 text-xs font-semibold" onClick={onClearStores}>
              清空
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto">
            {storeOptions.length === 0 ? (
              <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm font-semibold text-slate-500">暂无可选店铺。</p>
            ) : (
              storeOptions.map((store) => (
                <label key={store.key} className="flex items-start gap-2 rounded-xl border border-slate-200/80 p-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(store.key)}
                    onChange={() => onToggleStore(store.key)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-slate-950">{store.storeName}</span>
                    <span className="text-xs text-slate-500">{store.platformName} · {store.storeId}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
            </div>
            <span className="text-xs font-semibold text-slate-600">平台：{platformText}</span>
            <span className="text-xs font-semibold text-slate-600">店铺 {storeOptions.length} / 已选 {selectedStores.length}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
            <button
              type="button"
              data-testid="store-board-v1-store-settings-button"
              className="min-h-8 rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              onClick={() => onOpenPopup("store")}
            >
              店铺设置
            </button>
          </div>
        </div>
        <div data-testid="store-board-v1-time-scope-toolbar" className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-slate-200/80 pt-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <V1TimeRangePopover
              testId="store-board-v1-time-range-popover"
              variant="split"
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
            <span className="text-xs font-semibold text-slate-600">{rangeText(state)}</span>
          </div>
          <p
            data-testid="store-board-v1-dimension-scope"
            data-scope-variant="breadcrumb"
            className="min-w-0 truncate text-xs font-semibold text-slate-600"
            title={`范围：${scopeBreadcrumb}`}
          >
            <span className="text-slate-900">范围：</span>{scopeBreadcrumb}
          </p>
        </div>
      </div>
    </section>
  );
}

function StoreSettingsPopover({
  stores,
  onAdd,
  onRemove,
  onToggleStatus,
  onClose,
}: {
  stores: StoreOption[];
  onAdd: (store: TempStoreItem) => void;
  onRemove: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onClose: () => void;
}) {
  const [platformCode, setPlatformCode] = useState("tmall");
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const platform = PLATFORM_OPTIONS.find((item) => item.code === platformCode) ?? PLATFORM_OPTIONS[0];
  const addStore = () => {
    const normalizedId = storeId.trim();
    const normalizedName = storeName.trim();
    if (!normalizedId || !normalizedName) return;
    onAdd({
      id: `temp-store-${platformCode}-${normalizedId}-${Date.now()}`,
      platformCode,
      platformName: platform.name,
      storeId: normalizedId,
      storeName: normalizedName,
      status: "active",
    });
    setStoreName("");
    setStoreId("");
  };
  return (
    <aside
      data-testid="store-board-v1-store-settings-popover"
      className="absolute right-4 top-32 z-40 w-[min(520px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">店铺设置</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">V1 仅做页面内店铺维护，不写入运行时数据集。</p>
        </div>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          平台
          <select
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={platformCode}
            onChange={(event) => setPlatformCode(event.target.value)}
          >
            {PLATFORM_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          店铺状态
          <select className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2" value="active" disabled>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          店铺名称
          <input
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            placeholder="例如：华东旗舰店"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          店铺ID
          <input
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
            placeholder="平台内唯一"
          />
        </label>
      </div>
      <button
        type="button"
        className="mt-3 rounded-xl border border-slate-200/80 bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        onClick={addStore}
      >
        添加店铺
      </button>
      <div className="mt-4 max-h-72 space-y-2 overflow-auto">
        {stores.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm font-semibold text-slate-500">当前暂无店铺，请添加或完成数据上传。</p>
        ) : (
          stores.map((store) => (
            <div key={store.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 p-2 text-xs font-semibold">
              <span className="min-w-0 break-words">
                <span className="font-semibold text-slate-950">{store.platformName} · {store.storeName}</span>
                <span className="ml-2 text-slate-500">{store.storeId}</span>
                <span className="ml-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-0.5">{store.status}</span>
              </span>
              {store.source === "temp" ? (
                <span className="flex gap-2">
                  <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1" onClick={() => onToggleStatus(store.key)}>
                    {store.status === "active" ? "停用" : "启用"}
                  </button>
                  <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1" onClick={() => onRemove(store.key)}>
                    移除
                  </button>
                </span>
              ) : (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">已导入数据</span>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

export function StoreBoardV1Dashboard() {
  const [biState, setBiState] = useState<UIState>(() => createInitialState());
  const [dataSource, setDataSource] = useState<BIHomeDataSource>(() => createEmptyHomeBIDataSource("loading", "读取中"));
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [popup, setPopup] = useState<PopupKind>(null);
  const [chartMode, setChartMode] = useState<V1ChartMode>("mtd");
  const [tempStores, setTempStores] = useState<TempStoreItem[]>([]);
  const [debugContextReady, setDebugContextReady] = useState(false);

  const storeOptions = useMemo(() => buildStoreOptions(dataSource, tempStores), [dataSource, tempStores]);
  const datasetDateRange = useMemo(() => datasetDateRangeForSource(dataSource), [dataSource]);
  const timeRangeSourceLabel = useMemo(
    () => v1TimeRangeSourceLabel(biState.timeRange, datasetDateRange),
    [biState.timeRange, datasetDateRange],
  );
  const activeStoreKeys = useMemo(
    () => storeOptions.filter((store) => store.status === "active").map((store) => store.key),
    [storeOptions],
  );

  useEffect(() => {
    let active = true;
    Promise.all([loadHomeBIDataSource(), loadCrossPageDebugContext()])
      .then(([nextSource, contextResult]) => {
        if (!active) return;
        setDataSource(nextSource);
        const nextStoreKeys = buildStoreOptions(nextSource, []).map((option) => option.key);
        const restoredStoreKeys = contextResult.status === "ok"
          ? storeKeysFromDebugStoreIds(nextSource, contextResult.snapshot.selectedStores)
          : [];
        setBiState((state) => {
          const merged = contextResult.status === "ok" ? mergeDebugContextIntoUIState(state, contextResult.snapshot, "home") : state;
          const selectedStores = restoredStoreKeys.length > 0
            ? restoredStoreKeys
            : state.selectedStores.length > 0
              ? state.selectedStores
              : nextStoreKeys;
          return {
            ...merged,
            selectedStores,
            timeRange: v1ResolveTimeRangeForDataset(merged.timeRange, datasetDateRangeForSource(nextSource)).timeRange,
          };
        });
        if (contextResult.status === "ok") setChartMode(contextResult.snapshot.chartMode);
        setDebugContextReady(true);
      })
      .catch(() => {
        if (!active) return;
        setDataSource(createEmptyHomeBIDataSource("error", "读取失败"));
        setDebugContextReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!debugContextReady || !datasetDateRange) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setBiState((state) => {
        const resolved = v1ResolveTimeRangeForDataset(state.timeRange, datasetDateRange);
        if (resolved.source !== "dataset") return state;
        return { ...state, timeRange: resolved.timeRange };
      });
    });
    return () => {
      active = false;
    };
  }, [datasetDateRange, debugContextReady]);

  const selectedPoints = useMemo(() => scopedStorePoints(dataSource, biState), [biState, dataSource]);
  const allCards = useMemo(() => buildKpiCards(selectedPoints), [selectedPoints]);
  const cards = useMemo(
    () => DISPLAY_STORE_KPI_KEYS
      .map((key) => allCards.find((card) => card.key === key))
      .filter((card): card is StoreKpiCard => Boolean(card)),
    [allCards],
  );
  const selectedCard = cards.find((card) => card.key === biState.selectedMetric) ?? cards[0];
  const chart = useMemo(
    () => buildChartLines(selectedPoints, storeOptions, biState.selectedStores, biState, selectedCard?.key ?? "storeGmv"),
    [biState, selectedCard?.key, selectedPoints, storeOptions],
  );
  const contributions = useMemo(() => buildContributions(selectedPoints), [selectedPoints]);
  const hasActiveStore = activeStoreKeys.length > 0 && biState.selectedStores.some((key) => activeStoreKeys.includes(key));

  useEffect(() => {
    if (DISPLAY_STORE_KPI_KEY_SET.has(String(biState.selectedMetric))) return;
    void Promise.resolve().then(() => {
      setBiState((state) => ({ ...state, selectedMetric: "storeGmv" }));
    });
  }, [biState.selectedMetric]);

  useEffect(() => {
    if (!debugContextReady) return;
    void saveCrossPageDebugContextPatch({
      selectedPlatform: biState.selectedPlatform,
      selectedStores: biState.selectedStores.map(debugStoreIdFromStoreKey),
      timeRange: biState.timeRange,
      brandModelFilter: biState.brandModelFilter,
      centerWordGroups: biState.brandModelFilter?.centerWordGroups,
      selectedMetric: biState.selectedMetric,
      chartMode,
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

  const handlePeriodChange = (period: PeriodLabel) => {
    const selectedDate = datasetDateRange?.endDate ?? dataSource.selectedDate;
    if (period === "日") {
      setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: selectedDate, endDate: selectedDate } }));
      return;
    }
    if (period === "周") {
      setBiState((state) => ({ ...state, timeRange: { mode: "week", ...weekRangeForDate(selectedDate) } }));
      return;
    }
    if (period === "月") {
      setBiState((state) => ({ ...state, timeRange: { mode: "month", ...monthRangeForDate(selectedDate) } }));
      return;
    }
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom" } }));
  };

  const handleCustomDateChange = (field: "startDate" | "endDate", value: string) => {
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom", [field]: value || null } }));
  };

  const handleDayDateChange = (value: string) => {
    const date = value.trim() || null;
    setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: date, endDate: date } }));
  };

  const handleWeekChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "week", ...v1WeekRangeForWeek(value) } }));
  };

  const handleMonthChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "month", ...v1MonthRangeForMonth(value) } }));
  };

  const handleToggleStore = (key: string) => {
    setBiState((state) => {
      const selected = new Set(state.selectedStores.filter((id) => id !== NO_STORE_SELECTED));
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { ...state, selectedStores: selected.size > 0 ? Array.from(selected) : [NO_STORE_SELECTED] };
    });
  };

  const handleAddStore = (store: TempStoreItem) => {
    setTempStores((current) => [...current.filter((item) => storeKey(item.platformCode, item.storeId) !== storeKey(store.platformCode, store.storeId)), store]);
    setBiState((state) => {
      const key = storeKey(store.platformCode, store.storeId);
      const selected = new Set(state.selectedStores.filter((id) => id !== NO_STORE_SELECTED));
      selected.add(key);
      return { ...state, selectedStores: Array.from(selected) };
    });
  };

  const handleToggleStoreStatus = (key: string) => {
    setTempStores((current) =>
      current.map((store) =>
        storeKey(store.platformCode, store.storeId) === key
          ? { ...store, status: store.status === "active" ? "inactive" : "active" }
          : store,
      ),
    );
  };

  return (
    <div data-testid="store-board-v1-dashboard" className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px]">
          <ControlBar
            state={biState}
            storeOptions={storeOptions}
            storeMenuOpen={storeMenuOpen}
            onToggleStoreMenu={() => setStoreMenuOpen((open) => !open)}
            onToggleStore={handleToggleStore}
            onSelectAllStores={() => setBiState((state) => ({ ...state, selectedStores: activeStoreKeys }))}
            onClearStores={() => setBiState((state) => ({ ...state, selectedStores: [NO_STORE_SELECTED] }))}
            onOpenPopup={setPopup}
            onPeriodChange={handlePeriodChange}
            onDayDateChange={handleDayDateChange}
            onWeekChange={handleWeekChange}
            onMonthChange={handleMonthChange}
            onCustomDateChange={handleCustomDateChange}
          />
          {popup === "store" ? (
            <StoreSettingsPopover
              stores={storeOptions}
              onAdd={handleAddStore}
              onRemove={(key) => {
                setTempStores((current) => current.filter((store) => storeKey(store.platformCode, store.storeId) !== key));
                setBiState((state) => ({ ...state, selectedStores: state.selectedStores.filter((id) => id !== key) }));
              }}
              onToggleStatus={handleToggleStoreStatus}
              onClose={() => setPopup(null)}
            />
          ) : null}

          <div className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="mr-3 text-slate-900">{dataSource.dataStatus.label}</span>
            <span data-testid="store-board-time-range-source-label" className="mr-3 text-blue-700">{timeRangeSourceLabel}</span>
            {hasActiveStore ? `当前选择 ${biState.selectedStores.filter((key) => key !== NO_STORE_SELECTED).length} 个店铺` : "请先在店铺设置中添加店铺，或完成数据上传。"}
          </div>

          <section data-testid="store-board-v1-kpi-section" className="px-4 py-3" data-problem-ids="PVM2-002 PVM2-008">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">店铺指标</h2>
              <div className="text-xs font-semibold text-slate-500">当前店铺范围展示当前值、目标、差值、完成率和进度</div>
            </div>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label="店铺 KPI 指标卡片">
              {cards.map((card) => (
                <KpiCard
                  key={card.key}
                  card={hasActiveStore ? card : { ...card, value: "--", rawValue: null, difference: "--", completionRate: "--", progress: 0 }}
                  selected={selectedCard?.key === card.key}
                  onClick={() => setBiState((state) => ({ ...state, selectedMetric: card.key }))}
                />
              ))}
            </section>
          </section>

          <section data-testid="store-board-v1-chart-section" className="px-4 py-3" data-problem-ids="PVM2-004 PVM2-008">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">店铺趋势与商品贡献</h2>
              <div className="text-xs font-semibold text-slate-500">MTD / DLY 单图切换，只统计当前店铺</div>
            </div>
          <section className="grid grid-cols-1 gap-4 pb-4">
            <BIChartCard
              title={chartMode === "mtd" ? chart.title : "DLY参考图 · 店铺日度对比"}
              chart={{ ...chart, title: chartMode === "mtd" ? chart.title : "DLY参考图 · 店铺日度对比", empty: !hasActiveStore || chart.empty }}
              mode={chartMode}
              onModeChange={setChartMode}
              variant={chartMode === "mtd" ? "line" : "bar"}
              description={hasActiveStore && selectedCard ? `${selectedCard.title} · 当前值 ${selectedCard.value}` : "请选择 KPI 查看趋势"}
              emptyText="当前店铺暂无可展示趋势"
              testId="store-board-v1-chart-panel"
              modeSwitchTestId="store-board-v1-chart-mode-switch"
            />
          </section>

          <div className="pb-5">
            <ProductContributionTop items={hasActiveStore ? contributions : []} />
          </div>
          </section>
          </div>
        </div>
      </main>
    </div>
  );
}
