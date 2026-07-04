"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_IMPORT_HISTORY_FILTERS,
  loadV05ImportHistory,
  type ImportHistoryEntry,
  type ImportHistoryLoadResult,
  type ImportHistorySourceState,
} from "@/lib/v05/import-history";
import {
  listRuntimeDatasetSnapshots,
  loadActiveRuntimeDatasetSnapshot,
} from "@/lib/persistence/runtime-dataset-persistence";
import type {
  RuntimeDatasetSnapshotSummary,
  RuntimeDatasetSourceCoverageItem,
  RuntimeDatasetSourceType,
} from "@/lib/persistence/runtime-dataset-persistence.types";
import { V1Sidebar, V1TopBar } from "@/components/visual-system/v1/visual-system";

type PlatformFilter = "all" | "tmall" | "jd" | "pdd" | "douyin" | "youzan";
type SourceFilter = "all" | "business_product" | "ad_product" | "ad_plan" | "after_sales";
type StatusFilter = "all" | "success" | "partial_success" | "failed" | "missing" | "duplicate" | "pending";
type SourceCellStatus = "imported" | "missing" | "duplicate" | "failed" | "unavailable" | "not_applicable";

interface StoreOption {
  key: string;
  platformCode: string;
  storeId: string;
  storeName: string;
}

interface HistoryFilters {
  platform: PlatformFilter;
  storeKey: string;
  startDate: string;
  endDate: string;
  sourceType: SourceFilter;
  status: StatusFilter;
  searchTerm: string;
}

interface MatrixRow {
  key: string;
  date: string;
  platformLabel: string;
  platformCode: string;
  storeId: string;
  storeName: string;
  sourceCells: Record<Exclude<SourceFilter, "all">, SourceCellStatus>;
  dayStatus: "success" | "missing" | "duplicate" | "failed" | "pending";
  entry: ImportHistoryEntry;
}

interface SummaryMetric {
  label: string;
  value: string;
  tone: "green" | "yellow" | "red" | "slate";
}

interface PersistedHistoryState {
  loadStatus: "loading" | "empty" | "valid" | "corrupted" | "unavailable";
  activeSnapshot: RuntimeDatasetSnapshotSummary | null;
  snapshots: RuntimeDatasetSnapshotSummary[];
  issueCodes: string[];
  message: string;
}

const PLATFORM_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: "all", label: "全部平台" },
  { value: "tmall", label: "天猫" },
  { value: "jd", label: "京东" },
  { value: "pdd", label: "拼多多" },
  { value: "douyin", label: "抖音" },
  { value: "youzan", label: "有赞" },
];

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "business_product", label: "生意参谋商品经营表" },
  { value: "ad_product", label: "商品推广报表" },
  { value: "ad_plan", label: "计划推广报表" },
  { value: "after_sales", label: "售后退货表" },
];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "success", label: "成功" },
  { value: "partial_success", label: "部分成功" },
  { value: "failed", label: "失败" },
  { value: "missing", label: "缺失" },
  { value: "duplicate", label: "重复" },
  { value: "pending", label: "待检查" },
];

const SOURCE_LABELS: Record<Exclude<SourceFilter, "all">, string> = {
  business_product: "生意参谋商品经营表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales: "售后退货表",
};

const RUNTIME_SOURCE_LABELS: Record<RuntimeDatasetSourceType, string> = {
  product_dimension: "商品数据文件",
  product_metric: "商品经营报表",
  plan_metric: "计划报表",
  search_total: "总搜索词访客表",
  search_product: "商品搜索词访客表",
  after_sales: "售后退货表",
  unknown: "未知安全来源",
};

const RUNTIME_SOURCE_ORDER: Array<Exclude<RuntimeDatasetSourceType, "unknown">> = [
  "product_dimension",
  "product_metric",
  "plan_metric",
  "search_total",
  "search_product",
  "after_sales",
];

const EMPTY_RESULT: ImportHistoryLoadResult = {
  status: "empty",
  viewModel: null,
  issueCodes: [],
  message: "正在读取历史数据。",
};

const EMPTY_PERSISTED_HISTORY: PersistedHistoryState = {
  loadStatus: "loading",
  activeSnapshot: null,
  snapshots: [],
  issueCodes: [],
  message: "正在读取持久化安全聚合数据。",
};

const initialFilters: HistoryFilters = {
  platform: "all",
  storeKey: "all",
  startDate: "",
  endDate: "",
  sourceType: "all",
  status: "all",
  searchTerm: "",
};

const formatNumber = (value: number): string => (Number.isFinite(value) ? value.toLocaleString("zh-CN") : "--");

const formatDateTime = (value: string | null): string => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDateRange = (start: string | null, end: string | null): string => {
  if (!start && !end) return "--";
  if (start === end) return start ?? "--";
  return `${start ?? "--"} ~ ${end ?? "--"}`;
};

const shortCode = (value: string | null | undefined): string => {
  if (!value) return "--";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8).toUpperCase();
};

const platformDisplayLabel = (platformCode: string): string =>
  PLATFORM_OPTIONS.find((option) => option.value === platformCode)?.label ?? platformCode;

const runtimeImportBatchId = (snapshot: RuntimeDatasetSnapshotSummary): string =>
  `runtime-${shortCode(snapshot.activeDatasetId)}`;

const runtimeSnapshotStatus = (snapshot: RuntimeDatasetSnapshotSummary): "success" | "partial" => {
  const hasErrorIssue = snapshot.safeIssues.some((issue) => issue.level === "error");
  const hasMissingSource = RUNTIME_SOURCE_ORDER.some((sourceType) => !snapshot.sourceCoverage[sourceType]?.present);
  return hasErrorIssue || hasMissingSource || snapshot.safeIssues.length > 0 ? "partial" : "success";
};

const runtimeSnapshotStatusLabel = (snapshot: RuntimeDatasetSnapshotSummary, loadStatus: PersistedHistoryState["loadStatus"]): string => {
  if (loadStatus === "corrupted") return "corrupted";
  return runtimeSnapshotStatus(snapshot);
};

const runtimeSourceStatus = (item: RuntimeDatasetSourceCoverageItem | undefined): ImportHistorySourceState["status"] =>
  item?.present ? "parsed" : "missing";

const runtimeSourceStatusLabel = (item: RuntimeDatasetSourceCoverageItem | undefined): string =>
  item?.present ? "已覆盖" : "缺失";

const runtimeCoverageSourceState = (
  snapshot: RuntimeDatasetSnapshotSummary,
  sourceType: ImportHistorySourceState["sourceType"],
  label: string,
  coverage: RuntimeDatasetSourceCoverageItem | undefined,
): ImportHistorySourceState => ({
  sourceType,
  sourceLabel: label,
  statusLabel: runtimeSourceStatusLabel(coverage),
  status: runtimeSourceStatus(coverage),
  rowCount: coverage?.rowCount ?? 0,
  hasDateRange: Boolean(snapshot.dateRange.startDate || snapshot.dateRange.endDate),
  dateRange: {
    start: snapshot.dateRange.startDate,
    end: snapshot.dateRange.endDate,
  },
  safeWarningCodeCount: snapshot.safeIssues
    .filter((issue) => issue.sourceType === sourceType || (sourceType === "business_product" && issue.sourceType === "product_metric"))
    .reduce((total, issue) => total + issue.safeCount, 0),
});

const runtimeSnapshotToHistoryEntry = (snapshot: RuntimeDatasetSnapshotSummary): ImportHistoryEntry => {
  const importStatus = runtimeSnapshotStatus(snapshot) === "success" ? "success" : "partial_success";
  const coverage = snapshot.sourceCoverage;
  return {
    historyKey: `runtime:${snapshot.activeDatasetId}`,
    platformCode: snapshot.platformCode as ImportHistoryEntry["platformCode"],
    platformLabel: platformDisplayLabel(snapshot.platformCode),
    storeId: snapshot.storeId,
    storeName: snapshot.storeId === "mixed" ? "多店铺安全聚合" : snapshot.storeId,
    importBatchId: runtimeImportBatchId(snapshot),
    importStatus,
    importStatusLabel: importStatus === "success" ? "成功" : "部分成功",
    datasetStatus: "current_active",
    datasetStatusLabel: "当前有效数据",
    firstDatasetId: snapshot.activeDatasetId,
    latestDatasetId: snapshot.activeDatasetId,
    existsInActiveDataset: true,
    importedAt: snapshot.createdAt,
    completedAt: snapshot.updatedAt,
    dateRange: {
      start: snapshot.dateRange.startDate,
      end: snapshot.dateRange.endDate,
    },
    sourceCount: RUNTIME_SOURCE_ORDER.filter((sourceType) => coverage[sourceType]?.present).length,
    recordCounts: {
      businessProduct: snapshot.importSummary.productMetricsCount,
      adProduct: snapshot.importSummary.searchProductKeywordsCount,
      adPlan: snapshot.importSummary.planMetricsCount,
      afterSalesSafe: snapshot.importSummary.afterSalesMetricsCount,
    },
    safeWarningCodeCount: snapshot.safeIssues.reduce((total, issue) => total + issue.safeCount, 0),
    sourceStates: [
      runtimeCoverageSourceState(snapshot, "business_product", SOURCE_LABELS.business_product, coverage.product_metric),
      runtimeCoverageSourceState(snapshot, "ad_product", SOURCE_LABELS.ad_product, coverage.search_product),
      runtimeCoverageSourceState(snapshot, "ad_plan", SOURCE_LABELS.ad_plan, coverage.plan_metric),
      runtimeCoverageSourceState(snapshot, "after_sales", SOURCE_LABELS.after_sales, coverage.after_sales),
    ],
    activationEvents: [
      {
        action: "activated",
        datasetId: snapshot.activeDatasetId,
        previousDatasetId: null,
        createdAt: snapshot.updatedAt,
      },
    ],
    rollbackEvents: [],
  };
};

const sourceStatusToCell = (source: ImportHistorySourceState | undefined): SourceCellStatus => {
  if (!source) return "missing";
  if (source.status === "parsed") return "imported";
  if (source.status === "error") return "failed";
  if (source.status === "unknown") return "unavailable";
  return "missing";
};

const sourceStatusLabel = (status: SourceCellStatus): string => {
  switch (status) {
    case "imported":
      return "已导入";
    case "missing":
      return "缺失";
    case "duplicate":
      return "重复";
    case "failed":
      return "失败";
    case "unavailable":
      return "未开放";
    case "not_applicable":
      return "不适用";
  }
};

const sourceCellClass = (status: SourceCellStatus): string => {
  switch (status) {
    case "imported":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "missing":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "duplicate":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "unavailable":
    case "not_applicable":
      return "border-slate-200 bg-slate-50/80 text-slate-500";
  }
};

const batchStatusLabel = (entry: ImportHistoryEntry): string => {
  if (entry.importStatus === "success") return "成功";
  if (entry.importStatus === "partial_success") return "部分成功";
  return "失败";
};

const batchStatusClass = (entry: ImportHistoryEntry): string => {
  if (entry.importStatus === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (entry.importStatus === "partial_success") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const readonlyDatasetLabel = (entry: ImportHistoryEntry): string => {
  if (entry.existsInActiveDataset || entry.datasetStatus === "current_active") return "当前有效数据";
  if (entry.datasetStatus === "failed") return "失败";
  if (entry.datasetStatus === "staging" || entry.datasetStatus === "validated") return "待检查";
  return "历史有效数据";
};

const normalizedDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const expandDates = (start: string | null, end: string | null): string[] => {
  const safeStart = normalizedDate(start);
  const safeEnd = normalizedDate(end);
  if (!safeStart && !safeEnd) return ["--"];
  if (!safeStart || !safeEnd || safeStart === safeEnd) return [safeStart ?? safeEnd ?? "--"];
  const startDate = new Date(`${safeStart}T00:00:00.000Z`);
  const endDate = new Date(`${safeEnd}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) return [safeStart];
  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && dates.length < 45) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const buildStoreOptions = (entries: ImportHistoryEntry[]): StoreOption[] =>
  Array.from(
    entries.reduce((map, entry) => {
      const key = `${entry.platformCode}:${entry.storeId}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          platformCode: entry.platformCode,
          storeId: entry.storeId,
          storeName: entry.storeName,
        });
      }
      return map;
    }, new Map<string, StoreOption>()).values(),
  ).sort((left, right) => `${left.platformCode}${left.storeName}`.localeCompare(`${right.platformCode}${right.storeName}`, "zh-CN"));

const buildMatrixRows = (entries: ImportHistoryEntry[]): MatrixRow[] =>
  entries.flatMap((entry) => {
    const sourceCells = SOURCE_OPTIONS.filter((source): source is { value: Exclude<SourceFilter, "all">; label: string } => source.value !== "all")
      .reduce((record, source) => {
        record[source.value] = sourceStatusToCell(entry.sourceStates.find((item) => item.sourceType === source.value));
        return record;
      }, {} as Record<Exclude<SourceFilter, "all">, SourceCellStatus>);
    const statuses = Object.values(sourceCells);
    const dayStatus = statuses.some((status) => status === "failed")
      ? "failed"
      : statuses.some((status) => status === "duplicate")
        ? "duplicate"
        : statuses.some((status) => status === "missing")
          ? "missing"
          : statuses.some((status) => status === "unavailable" || status === "not_applicable")
            ? "pending"
            : "success";
    return expandDates(entry.dateRange.start, entry.dateRange.end).map((date) => ({
      key: `${entry.historyKey}:${date}`,
      date,
      platformLabel: entry.platformLabel,
      platformCode: entry.platformCode,
      storeId: entry.storeId,
      storeName: entry.storeName,
      sourceCells,
      dayStatus,
      entry,
    }));
  });

const statusMatches = (entry: ImportHistoryEntry, row: MatrixRow, status: StatusFilter): boolean => {
  if (status === "all") return true;
  if (status === "success" || status === "partial_success" || status === "failed") return entry.importStatus === status;
  if (status === "missing") return row.dayStatus === "missing";
  if (status === "duplicate") return row.dayStatus === "duplicate";
  return row.dayStatus === "pending";
};

const filterEntries = (entries: ImportHistoryEntry[], filters: HistoryFilters): ImportHistoryEntry[] => {
  const search = filters.searchTerm.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.platform !== "all" && entry.platformCode !== filters.platform) return false;
    if (filters.storeKey !== "all" && `${entry.platformCode}:${entry.storeId}` !== filters.storeKey) return false;
    if (filters.startDate) {
      const end = normalizedDate(entry.dateRange.end ?? entry.dateRange.start);
      if (end && end < filters.startDate) return false;
    }
    if (filters.endDate) {
      const start = normalizedDate(entry.dateRange.start ?? entry.dateRange.end);
      if (start && start > filters.endDate) return false;
    }
    if (filters.sourceType !== "all") {
      const source = entry.sourceStates.find((item) => item.sourceType === filters.sourceType);
      if (!source) return false;
    }
    if (filters.status !== "all" && (filters.status === "success" || filters.status === "partial_success" || filters.status === "failed") && entry.importStatus !== filters.status) return false;
    if (!search) return true;
    const safeTokens = [
      entry.importBatchId,
      entry.storeName,
      entry.storeId,
      shortCode(entry.importBatchId),
      shortCode(entry.latestDatasetId),
    ].map((item) => item.toLowerCase());
    return safeTokens.some((token) => token.includes(search));
  });
};

const filterRows = (rows: MatrixRow[], filters: HistoryFilters): MatrixRow[] =>
  rows.filter((row) => {
    if (!statusMatches(row.entry, row, filters.status)) return false;
    if (filters.sourceType !== "all" && row.sourceCells[filters.sourceType] === "not_applicable") return false;
    return true;
  });

const buildSummary = (rows: MatrixRow[], entries: ImportHistoryEntry[]): SummaryMetric[] => {
  const coveredDates = new Set(rows.map((row) => row.date).filter((date) => date !== "--")).size;
  const completeDates = rows.filter((row) => row.dayStatus === "success").length;
  const missingDates = rows.filter((row) => row.dayStatus === "missing").length;
  const riskCount = rows.filter((row) => row.dayStatus === "failed" || row.dayStatus === "duplicate").length +
    entries.reduce((total, entry) => total + entry.safeWarningCodeCount, 0);
  return [
    { label: "已覆盖日期", value: formatNumber(coveredDates), tone: coveredDates > 0 ? "green" : "slate" },
    { label: "完整日期", value: formatNumber(completeDates), tone: completeDates > 0 ? "green" : "slate" },
    { label: "缺失日期", value: formatNumber(missingDates), tone: missingDates > 0 ? "yellow" : "slate" },
    { label: "重复 / 冲突提示", value: formatNumber(riskCount), tone: riskCount > 0 ? "red" : "slate" },
  ];
};

function Sidebar() {
  return <V1Sidebar activeLabel="历史数据" ariaLabel="历史数据导航" />;
}

function TopBar() {
  return <V1TopBar title="历史数据" />;
}

function LogoBlock() {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-sm font-semibold text-slate-700">
      LOGO
    </div>
  );
}

function FilterPanel({
  filters,
  setFilters,
  stores,
  dateError,
}: {
  filters: HistoryFilters;
  setFilters: (filters: HistoryFilters) => void;
  stores: StoreOption[];
  dateError: boolean;
}) {
  const fieldClass = "mt-1 h-10 w-full rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200";
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="history-v1-filter-panel">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <LogoBlock />
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            平台筛选
            <select className={fieldClass} value={filters.platform} onChange={(event) => setFilters({ ...filters, platform: event.target.value as PlatformFilter })}>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            店铺筛选
            <select className={fieldClass} value={filters.storeKey} onChange={(event) => setFilters({ ...filters, storeKey: event.target.value })}>
              <option value="all">全部店铺</option>
              {stores.length === 0 ? <option value="empty" disabled>暂无店铺数据</option> : null}
              {stores.map((store) => (
                <option key={store.key} value={store.key}>
                  {store.storeName} · {store.platformCode}/{store.storeId}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            开始日期
            <input className={fieldClass} type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            结束日期
            <input className={fieldClass} type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            来源类型筛选
            <select className={fieldClass} value={filters.sourceType} onChange={(event) => setFilters({ ...filters, sourceType: event.target.value as SourceFilter })}>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            导入状态筛选
            <select className={fieldClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as StatusFilter })}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="block min-w-0 text-xs font-semibold text-slate-600">
          搜索框
          <input
            className={fieldClass}
            value={filters.searchTerm}
            placeholder="搜批次号、店铺名、安全短码"
            onChange={(event) => setFilters({ ...filters, searchTerm: event.target.value })}
          />
        </label>
        <Link href="/upload" className="flex h-10 items-center justify-center self-end rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 text-sm font-semibold text-slate-900">
          去数据上传
        </Link>
        <Link href="/upload/quality" className="flex h-10 items-center justify-center self-end rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 text-sm font-semibold text-slate-900">
          查看数据质量
        </Link>
      </div>
      {dateError ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
          日期范围有误：开始日期不能晚于结束日期。
        </div>
      ) : null}
    </section>
  );
}

function SummaryCards({ metrics }: { metrics: SummaryMetric[] }) {
  const toneClass: Record<SummaryMetric["tone"], string> = {
    green: "border-emerald-300 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-300 bg-amber-50 text-amber-700",
    red: "border-rose-300 bg-rose-50 text-rose-700",
    slate: "border-slate-200/80 bg-white text-slate-700",
  };
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="history-v1-summary">
      {metrics.map((metric) => (
        <div key={metric.label} className={`rounded-xl border p-4 ${toneClass[metric.tone]}`}>
          <p className="text-sm font-semibold">{metric.label}</p>
          <p className="mt-2 text-3xl font-semibold">{metric.value}</p>
        </div>
      ))}
    </section>
  );
}

function PersistedSnapshotPanel({ state }: { state: PersistedHistoryState }) {
  const active = state.activeSnapshot;
  const statusText = active ? runtimeSnapshotStatusLabel(active, state.loadStatus) : state.loadStatus;
  const statusClass =
    statusText === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : statusText === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : statusText === "corrupted"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-slate-200 bg-slate-50/80 text-slate-600";

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]" data-testid="history-v1-persisted-runtime-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">持久化安全聚合快照</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            历史页展示本浏览器保存的安全导入摘要，只读查看，不展示原始文件、来源私密信息或敏感明细。
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusClass}`}>
          status：{statusText}
        </span>
      </div>

      {active ? (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoBox label="activeDatasetId" value={active.activeDatasetId} />
            <InfoBox label="importBatchId" value={runtimeImportBatchId(active)} />
            <InfoBox label="createdAt" value={formatDateTime(active.createdAt)} />
            <InfoBox label="updatedAt" value={formatDateTime(active.updatedAt)} />
            <InfoBox label="platformCode / storeId" value={`${active.platformCode} / ${active.storeId}`} />
            <InfoBox label="dateRange" value={formatDateRange(active.dateRange.startDate, active.dateRange.endDate)} />
            <InfoBox label="productMetricsCount" value={formatNumber(active.importSummary.productMetricsCount)} />
            <InfoBox label="planMetricsCount" value={formatNumber(active.importSummary.planMetricsCount)} />
            <InfoBox label="searchTotalKeywordsCount" value={formatNumber(active.importSummary.searchTotalKeywordsCount)} />
            <InfoBox label="searchProductKeywordsCount" value={formatNumber(active.importSummary.searchProductKeywordsCount)} />
            <InfoBox label="afterSalesMetricsCount" value={formatNumber(active.importSummary.afterSalesMetricsCount)} />
            <InfoBox label="dedupedRecords" value={formatNumber(active.importSummary.dedupedRecords)} />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
              <p className="text-sm font-semibold text-slate-900">sourceCoverage</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {RUNTIME_SOURCE_ORDER.map((sourceType) => {
                  const item = active.sourceCoverage[sourceType];
                  return (
                    <div key={sourceType} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-slate-500">{RUNTIME_SOURCE_LABELS[sourceType]}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {item?.present ? "已覆盖" : "缺失"} · {formatNumber(item?.rowCount ?? 0)} 行
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
              <p className="text-sm font-semibold text-slate-900">issueCodes</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.issueCodes.length === 0 ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">暂无安全 issue</span>
                ) : state.issueCodes.map((code) => (
                  <span key={code} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-4">
          <p className="text-base font-semibold text-slate-900">{state.message}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            完成一次批量导入后，这里会显示安全聚合快照。页面不生成模拟批次，也不提供数据变更操作。
          </p>
        </div>
      )}
    </section>
  );
}

function DayStatusPill({ status }: { status: MatrixRow["dayStatus"] }) {
  const config: Record<MatrixRow["dayStatus"], { label: string; className: string }> = {
    success: { label: "成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    missing: { label: "缺失", className: "border-amber-200 bg-amber-50 text-amber-700" },
    duplicate: { label: "重复", className: "border-orange-200 bg-orange-50 text-orange-700" },
    failed: { label: "失败", className: "border-rose-200 bg-rose-50 text-rose-700" },
    pending: { label: "待检查", className: "border-slate-200 bg-slate-50/80 text-slate-600" },
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${config[status].className}`}>
      {config[status].label}
    </span>
  );
}

function Matrix({ rows }: { rows: MatrixRow[] }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="history-v1-matrix">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">数据完整性矩阵</h2>
          <p className="mt-1 text-sm text-slate-500">按平台、店铺和业务日期查看四类来源是否齐全。</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">日期</th>
              <th className="px-3 py-2">平台</th>
              <th className="px-3 py-2">店铺</th>
              {SOURCE_OPTIONS.filter((source) => source.value !== "all").map((source) => (
                <th key={source.value} className="px-3 py-2">{source.label}</th>
              ))}
              <th className="px-3 py-2">当日状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="rounded-l-md border-y-2 border-l-2 border-slate-200 bg-slate-50/80 px-3 py-4 font-semibold text-slate-500">--</td>
                <td className="border-y-2 border-slate-200 bg-slate-50/80 px-3 py-4 text-slate-500">暂无数据</td>
                <td className="border-y-2 border-slate-200 bg-slate-50/80 px-3 py-4 text-slate-500">暂无店铺数据</td>
                {SOURCE_OPTIONS.filter((source) => source.value !== "all").map((source) => (
                  <td key={source.value} className="border-y-2 border-slate-200 bg-slate-50/80 px-3 py-4">
                    <span className="inline-flex rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">暂无数据</span>
                  </td>
                ))}
                <td className="rounded-r-md border-y-2 border-r-2 border-slate-200 bg-slate-50/80 px-3 py-4">
                  <span className="inline-flex rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">待检查</span>
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.key}>
                <td className="rounded-l-md border-y-2 border-l-2 border-slate-200 bg-white px-3 py-3 font-semibold text-slate-900">{row.date}</td>
                <td className="border-y-2 border-slate-200 bg-white px-3 py-3">{row.platformLabel}</td>
                <td className="border-y-2 border-slate-200 bg-white px-3 py-3">
                  <p className="max-w-[180px] truncate font-semibold text-slate-900" title={row.storeName}>{row.storeName}</p>
                  <p className="mt-1 max-w-[180px] truncate font-mono text-xs text-slate-400">{row.platformCode}/{row.storeId}</p>
                </td>
                {SOURCE_OPTIONS.filter((source): source is { value: Exclude<SourceFilter, "all">; label: string } => source.value !== "all").map((source) => (
                  <td key={source.value} className="border-y-2 border-slate-200 bg-white px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceCellClass(row.sourceCells[source.value])}`}>
                      {sourceStatusLabel(row.sourceCells[source.value])}
                    </span>
                  </td>
                ))}
                <td className="rounded-r-md border-y-2 border-r-2 border-slate-200 bg-white px-3 py-3">
                  <DayStatusPill status={row.dayStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BatchList({
  entries,
  onOpen,
}: {
  entries: ImportHistoryEntry[];
  onOpen: (entry: ImportHistoryEntry | null, trigger: HTMLButtonElement) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="history-v1-batch-list">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-950">导入批次列表</h2>
        <p className="mt-1 text-sm text-slate-500">仅展示安全批次状态、计数和短码，不提供编辑操作。</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {entries.length === 0 ? (
          <article className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">暂无历史批次</p>
                <p className="mt-2 text-sm text-slate-500">当前筛选范围内没有可展示的批次。可返回数据上传页补充数据。</p>
              </div>
              <button
                type="button"
                onClick={(event) => onOpen(null, event.currentTarget)}
                className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                查看详情
              </button>
            </div>
          </article>
        ) : entries.map((entry) => (
          <article key={entry.historyKey} className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900" title={entry.importBatchId}>
                  批次 {shortCode(entry.importBatchId)}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {entry.platformLabel} · {entry.storeName}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-400">{entry.platformCode}/{entry.storeId}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${batchStatusClass(entry)}`}>
                {batchStatusLabel(entry)}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <p>业务日期：{formatDateRange(entry.dateRange.start, entry.dateRange.end)}</p>
              <p>导入时间：{formatDateTime(entry.importedAt)}</p>
              <p>来源数量：{formatNumber(entry.sourceCount)}</p>
              <p>重复剔除数量：0</p>
              <p>安全提示数量：{formatNumber(entry.safeWarningCodeCount)}</p>
              <p>数据状态：{readonlyDatasetLabel(entry)}</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={(event) => onOpen(entry, event.currentTarget)}
                className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50/80"
              >
                查看详情
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailDrawer({
  entry,
  open,
  onClose,
}: {
  entry: ImportHistoryEntry | null;
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const title = entry ? `批次 ${shortCode(entry.importBatchId)}` : "暂无批次详情";
  const qualityHref = entry
    ? `/upload/quality?platform=${encodeURIComponent(entry.platformCode)}&storeId=${encodeURIComponent(entry.storeId)}&batchId=${encodeURIComponent(entry.importBatchId)}`
    : "/upload/quality";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-labelledby="history-v1-drawer-title" data-testid="history-v1-detail-drawer">
      <button type="button" aria-label="关闭详情遮罩" className="absolute inset-0 cursor-default" onClick={onClose} />
      <aside className="relative flex h-full w-full flex-col bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:max-w-[600px]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600">只读批次详情</p>
            <h2 id="history-v1-drawer-title" className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">详情仅展示安全状态、计数和 code 数量。</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900">
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {entry ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoBox label="平台" value={entry.platformLabel} />
                <InfoBox label="店铺" value={entry.storeName} subValue={`${entry.platformCode}/${entry.storeId}`} />
                <InfoBox label="状态" value={batchStatusLabel(entry)} />
                <InfoBox label="导入时间" value={formatDateTime(entry.importedAt)} />
                <InfoBox label="业务日期范围" value={formatDateRange(entry.dateRange.start, entry.dateRange.end)} />
                <InfoBox label="是否进入当前有效数据" value={entry.existsInActiveDataset ? "是" : "否"} />
                <InfoBox label="是否被重复剔除" value="否" />
                <InfoBox label="是否失败" value={entry.importStatus === "failed" ? "是" : "否"} />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-950">来源文件安全摘要</h3>
                <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200/80">
                  {entry.sourceStates.map((source) => (
                    <div key={source.sourceType} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_0.7fr_0.7fr_0.7fr]">
                      <p className="font-semibold text-slate-900">{SOURCE_LABELS[source.sourceType]}</p>
                      <p className="text-slate-600">{sourceStatusLabel(sourceStatusToCell(source))}</p>
                      <p className="text-slate-600">{formatNumber(source.rowCount)} 行</p>
                      <p className="font-mono text-slate-500">{shortCode(`${entry.importBatchId}:${source.sourceType}`)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoBox label="安全提示 code 数量" value={formatNumber(entry.safeWarningCodeCount)} />
                <InfoBox label="来源数量" value={formatNumber(entry.sourceCount)} />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-5">
              <p className="text-base font-semibold text-slate-900">当前没有可展示的批次。</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">页面保持只读，不生成模拟成功记录。完成一次数据上传后，这里会显示安全批次摘要。</p>
            </div>
          )}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            安全提示只展示 code 数量，不展示原始表格、来源私密信息、技术细节或售后明细。
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Link href={qualityHref} className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-900">
            查看数据质量
          </Link>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200/80 bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            关闭
          </button>
        </div>
      </aside>
    </div>
  );
}

function InfoBox({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950" title={value}>{value}</p>
      {subValue ? <p className="mt-1 truncate font-mono text-xs text-slate-400" title={subValue}>{subValue}</p> : null}
    </div>
  );
}

function CheckNotice({
  rows,
  entries,
}: {
  rows: MatrixRow[];
  entries: ImportHistoryEntry[];
}) {
  const missingBySource = SOURCE_OPTIONS.filter((source): source is { value: Exclude<SourceFilter, "all">; label: string } => source.value !== "all")
    .map((source) => ({
      label: source.label,
      count: rows.filter((row) => row.sourceCells[source.value] === "missing").length,
    }))
    .filter((item) => item.count > 0);
  const failedCount = rows.filter((row) => row.dayStatus === "failed").length;
  const duplicateCount = rows.filter((row) => row.dayStatus === "duplicate").length;
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="history-v1-check-notice">
      <h2 className="text-lg font-semibold text-slate-950">数据检查提示</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          缺失来源：{missingBySource.length > 0 ? missingBySource.map((item) => `${item.label} ${item.count} 天`).join("；") : "当前筛选范围内暂无缺失提示"}
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
          重复提示：当前筛选范围内发现 {formatNumber(duplicateCount)} 个重复状态。
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          失败提示：当前筛选范围内发现 {formatNumber(failedCount)} 个失败状态。
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/upload" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 font-semibold text-slate-900">
          去数据上传页补充缺失文件
        </Link>
        <Link href="/upload/quality" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 font-semibold text-slate-900">
          查看数据质量页
        </Link>
        <span className="rounded-xl bg-slate-50/80 px-3 py-2 font-semibold text-slate-500">
          当前筛选批次 {formatNumber(entries.length)} 个
        </span>
      </div>
    </section>
  );
}

function SafeState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-5">
      <p className="text-lg font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/upload" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900">
          去数据上传
        </Link>
        <Link href="/upload/quality" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900">
          查看数据质量
        </Link>
      </div>
    </section>
  );
}

export function HistoryDataV1Dashboard() {
  const [filters, setFilters] = useState<HistoryFilters>(initialFilters);
  const [result, setResult] = useState<ImportHistoryLoadResult>(EMPTY_RESULT);
  const [persistedHistory, setPersistedHistory] = useState<PersistedHistoryState>(EMPTY_PERSISTED_HISTORY);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ImportHistoryEntry | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dateError = !!filters.startDate && !!filters.endDate && filters.startDate > filters.endDate;

  useEffect(() => {
    let cancelled = false;
    loadV05ImportHistory(DEFAULT_IMPORT_HISTORY_FILTERS)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            status: "error",
            viewModel: null,
            issueCodes: ["history_read_error"],
            message: "历史数据读取失败。",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPersistedHistory() {
      try {
        const [activeResult, listResult] = await Promise.all([
          loadActiveRuntimeDatasetSnapshot(),
          listRuntimeDatasetSnapshots(),
        ]);
        if (cancelled) return;
        const listSnapshots = listResult.status === "ok" ? listResult.snapshots : [];
        if (activeResult.status === "ok") {
          const listWithActive = listSnapshots.some((snapshot) => snapshot.activeDatasetId === activeResult.snapshot.activeDatasetId)
            ? listSnapshots
            : [activeResult.snapshot, ...listSnapshots];
          setPersistedHistory({
            loadStatus: "valid",
            activeSnapshot: activeResult.snapshot,
            snapshots: listWithActive,
            issueCodes: activeResult.snapshot.safeIssues.map((issue) => issue.code),
            message: "已读取持久化安全聚合数据。",
          });
          return;
        }
        if (activeResult.status === "corrupted") {
          setPersistedHistory({
            loadStatus: "corrupted",
            activeSnapshot: null,
            snapshots: listSnapshots,
            issueCodes: ["runtime_dataset_schema_corrupted"],
            message: "持久化快照不可安全读取。",
          });
          return;
        }
        if (activeResult.status === "unavailable" || listResult.status === "unavailable") {
          setPersistedHistory({
            loadStatus: "unavailable",
            activeSnapshot: null,
            snapshots: listSnapshots,
            issueCodes: ["runtime_dataset_indexeddb_unavailable"],
            message: "IndexedDB 持久化数据暂不可读取。",
          });
          return;
        }
        setPersistedHistory({
          loadStatus: listSnapshots.length > 0 ? "valid" : "empty",
          activeSnapshot: null,
          snapshots: listSnapshots,
          issueCodes: [],
          message: listSnapshots.length > 0 ? "存在历史安全快照，但没有 active dataset。" : "暂无持久化安全聚合数据。",
        });
      } catch {
        if (!cancelled) {
          setPersistedHistory({
            loadStatus: "unavailable",
            activeSnapshot: null,
            snapshots: [],
            issueCodes: ["runtime_dataset_read_error"],
            message: "持久化快照读取失败。",
          });
        }
      }
    }
    void loadPersistedHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistedEntries = useMemo(
    () => persistedHistory.snapshots.map(runtimeSnapshotToHistoryEntry),
    [persistedHistory.snapshots],
  );
  const allEntries = useMemo(() => [...persistedEntries, ...(result.viewModel?.entries ?? [])], [persistedEntries, result.viewModel]);
  const stores = useMemo(() => buildStoreOptions(allEntries), [allEntries]);
  const filteredEntries = useMemo(() => (dateError ? [] : filterEntries(allEntries, filters)), [allEntries, filters, dateError]);
  const rows = useMemo(() => filterRows(buildMatrixRows(filteredEntries), filters), [filteredEntries, filters]);
  const summary = useMemo(() => buildSummary(rows, filteredEntries), [rows, filteredEntries]);

  const openDrawer = (entry: ImportHistoryEntry | null, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setSelectedEntry(entry);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950" data-testid="history-data-v1-page">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-4">
            <FilterPanel filters={filters} setFilters={setFilters} stores={stores} dateError={dateError} />
            <SummaryCards metrics={summary} />
            <PersistedSnapshotPanel state={persistedHistory} />

            {loading ? (
              <SafeState title="正在读取历史数据" description="正在读取本地安全批次摘要。" />
            ) : result.status === "corrupted" ? (
              <SafeState title="历史数据不可安全读取" description="页面不会展示损坏对象，请前往数据质量页查看安全提示。" />
            ) : result.status === "error" ? (
              <SafeState title="历史数据读取失败" description="页面不会展示技术细节，请刷新后重试或前往数据质量页检查。" />
            ) : (
              <>
                {result.status === "empty" ? (
                  <SafeState title="暂无历史数据" description="当前还没有可展示的导入批次。页面保持只读，不生成模拟成功记录。" />
                ) : null}
                <Matrix rows={rows} />
                <BatchList entries={filteredEntries} onOpen={openDrawer} />
                <CheckNotice rows={rows} entries={filteredEntries} />
              </>
            )}
          </div>
        </div>
      </main>
      <DetailDrawer entry={selectedEntry} open={drawerOpen} onClose={closeDrawer} />
    </div>
  );
}
