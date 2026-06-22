"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  dataCenterHref,
  dataCenterStoreKey,
  parseDataCenterSearchParams,
} from "@/lib/v05/data-center";
import {
  DEFAULT_IMPORT_HISTORY_FILTERS,
  loadV05ImportHistory,
  type ImportHistoryDatasetStatus,
  type ImportHistoryEntry,
  type ImportHistoryFilters,
  type ImportHistoryLoadResult,
} from "@/lib/v05/import-history";

const DATASET_STATUS_TONE: Record<ImportHistoryDatasetStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  current_active: "info",
  inactive_valid: "neutral",
  rolled_back: "warning",
  failed: "danger",
  staging: "warning",
  validated: "success",
};

const IMPORT_STATUS_TONE: Record<ImportHistoryEntry["importStatus"], "success" | "warning" | "danger"> = {
  success: "success",
  partial_success: "warning",
  failed: "danger",
};

const formatDateTime = (value: string | null): string => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatDateRange = (range: ImportHistoryEntry["dateRange"]): string => {
  if (!range.start && !range.end) return "--";
  if (range.start === range.end) return range.start ?? "--";
  return `${range.start ?? "--"} 至 ${range.end ?? "--"}`;
};

const formatNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString("zh-CN") : "--";

const shortId = (value: string | null): string => {
  if (!value) return "--";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const buildInitialFilters = (params: URLSearchParams): ImportHistoryFilters => {
  const context = parseDataCenterSearchParams(params);
  return {
    ...DEFAULT_IMPORT_HISTORY_FILTERS,
    platformCode: context.platformCode ?? DEFAULT_IMPORT_HISTORY_FILTERS.platformCode,
    storeKey: dataCenterStoreKey(context),
    searchTerm: context.batchId ?? DEFAULT_IMPORT_HISTORY_FILTERS.searchTerm,
  };
};

function SafeStateCard({
  title,
  description,
  actionLabel = "返回数据导入",
}: {
  title: string;
  description: string;
  actionLabel?: string;
}) {
  return (
    <SectionCard title={title} description={description}>
      <Link
        href="/upload"
        className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {actionLabel}
      </Link>
    </SectionCard>
  );
}

function ImportHistoryFiltersBar({
  result,
  filters,
  onFiltersChange,
  onReload,
}: {
  result: ImportHistoryLoadResult;
  filters: ImportHistoryFilters;
  onFiltersChange: (filters: ImportHistoryFilters) => void;
  onReload: () => void;
}) {
  const options = result.viewModel?.filterOptions;

  return (
    <SectionCard
      title="筛选导入记录"
      description="可按平台、店铺、导入日期、数据状态和批次 ID 搜索，筛选条件会同时生效。"
      action={
        <button
          type="button"
          onClick={onReload}
          className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200"
        >
          刷新
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="block min-w-0 text-sm">
          <span className="text-xs font-semibold text-slate-500">平台</span>
          <select
            value={filters.platformCode}
            onChange={(event) =>
              onFiltersChange({ ...filters, platformCode: event.target.value as ImportHistoryFilters["platformCode"] })
            }
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">全部平台</option>
            {options?.platforms.map((platform) => (
              <option key={platform.platformCode} value={platform.platformCode}>
                {platform.label}（{platform.count}）
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="text-xs font-semibold text-slate-500">店铺</span>
          <select
            value={filters.storeKey}
            onChange={(event) => onFiltersChange({ ...filters, storeKey: event.target.value })}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">全部店铺</option>
            {options?.stores.map((store) => (
              <option key={`${store.platformCode}:${store.storeId}`} value={`${store.platformCode}:${store.storeId}`}>
                {store.storeName}（{store.count}）
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="text-xs font-semibold text-slate-500">数据状态</span>
          <select
            value={filters.datasetStatus}
            onChange={(event) =>
              onFiltersChange({ ...filters, datasetStatus: event.target.value as ImportHistoryFilters["datasetStatus"] })
            }
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">全部状态</option>
            {options?.datasetStatuses.map((status) => (
              <option key={status.status} value={status.status}>
                {status.label}（{status.count}）
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="text-xs font-semibold text-slate-500">导入日期</span>
          <select
            value={filters.datePreset}
            onChange={(event) =>
              onFiltersChange({ ...filters, datePreset: event.target.value as ImportHistoryFilters["datePreset"] })
            }
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          >
            <option value="all">全部</option>
            <option value="last_7_days">最近 7 天</option>
            <option value="last_30_days">最近 30 天</option>
            <option value="custom">自定义</option>
          </select>
        </label>

        <label className="block min-w-0 text-sm">
          <span className="text-xs font-semibold text-slate-500">搜索</span>
          <input
            value={filters.searchTerm}
            onChange={(event) => onFiltersChange({ ...filters, searchTerm: event.target.value })}
            placeholder="批次 ID 或店铺名"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      {filters.datePreset === "custom" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block min-w-0 text-sm">
            <span className="text-xs font-semibold text-slate-500">开始日期</span>
            <input
              type="date"
              value={filters.customStartDate}
              onChange={(event) => onFiltersChange({ ...filters, customStartDate: event.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block min-w-0 text-sm">
            <span className="text-xs font-semibold text-slate-500">结束日期</span>
            <input
              type="date"
              value={filters.customEndDate}
              onChange={(event) => onFiltersChange({ ...filters, customEndDate: event.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      ) : null}
    </SectionCard>
  );
}

function ImportHistoryTable({
  entries,
  onSelectEntry,
}: {
  entries: ImportHistoryEntry[];
  onSelectEntry: (entry: ImportHistoryEntry, trigger: HTMLButtonElement) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">当前筛选条件下暂无导入记录。</p>
        <p className="mt-2 text-sm text-slate-500">可以调整平台、店铺、日期或搜索条件。</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold text-slate-500">
            <th className="border-b border-slate-100 px-3 py-3">平台</th>
            <th className="border-b border-slate-100 px-3 py-3">店铺</th>
            <th className="border-b border-slate-100 px-3 py-3">导入时间</th>
            <th className="border-b border-slate-100 px-3 py-3">导入状态</th>
            <th className="border-b border-slate-100 px-3 py-3">数据状态</th>
            <th className="border-b border-slate-100 px-3 py-3">四源数量</th>
            <th className="border-b border-slate-100 px-3 py-3">经营日期范围</th>
            <th className="border-b border-slate-100 px-3 py-3">商品经营</th>
            <th className="border-b border-slate-100 px-3 py-3">商品推广</th>
            <th className="border-b border-slate-100 px-3 py-3">计划推广</th>
            <th className="border-b border-slate-100 px-3 py-3">售后安全聚合</th>
            <th className="border-b border-slate-100 px-3 py-3">操作</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.historyKey} className="border-b border-slate-100 text-slate-700">
              <td className="border-b border-slate-100 px-3 py-4 font-medium">{entry.platformLabel}</td>
              <td className="max-w-[14rem] border-b border-slate-100 px-3 py-4">
                <p className="truncate font-medium text-slate-900" title={entry.storeName}>{entry.storeName}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-400" title={entry.storeId}>{shortId(entry.storeId)}</p>
              </td>
              <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4">{formatDateTime(entry.importedAt)}</td>
              <td className="border-b border-slate-100 px-3 py-4">
                <StatusPill tone={IMPORT_STATUS_TONE[entry.importStatus]}>{entry.importStatusLabel}</StatusPill>
              </td>
              <td className="border-b border-slate-100 px-3 py-4">
                <StatusPill tone={DATASET_STATUS_TONE[entry.datasetStatus]}>{entry.datasetStatusLabel}</StatusPill>
              </td>
              <td className="border-b border-slate-100 px-3 py-4">{formatNumber(entry.sourceCount)}</td>
              <td className="whitespace-nowrap border-b border-slate-100 px-3 py-4">{formatDateRange(entry.dateRange)}</td>
              <td className="border-b border-slate-100 px-3 py-4">{formatNumber(entry.recordCounts.businessProduct)}</td>
              <td className="border-b border-slate-100 px-3 py-4">{formatNumber(entry.recordCounts.adProduct)}</td>
              <td className="border-b border-slate-100 px-3 py-4">{formatNumber(entry.recordCounts.adPlan)}</td>
              <td className="border-b border-slate-100 px-3 py-4">{formatNumber(entry.recordCounts.afterSalesSafe)}</td>
              <td className="border-b border-slate-100 px-3 py-4">
                <button
                  type="button"
                  onClick={(event) => onSelectEntry(entry, event.currentTarget)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                >
                  查看详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportHistoryDrawer({
  entry,
  onClose,
}: {
  entry: ImportHistoryEntry | null;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entry) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-labelledby="import-history-drawer-title">
      <button
        type="button"
        aria-label="关闭导入详情"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full flex-col bg-white shadow-xl sm:max-w-[560px]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">导入详情</p>
            <h2 id="import-history-drawer-title" className="mt-1 text-lg font-semibold text-slate-950">{entry.storeName}</h2>
            <p className="mt-1 truncate font-mono text-xs text-slate-400" title={entry.importBatchId}>
              {shortId(entry.importBatchId)}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">平台 / 店铺</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{entry.platformLabel} · {entry.storeName}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">是否在当前数据集</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{entry.existsInActiveDataset ? "是" : "否"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">首次出现 datasetId</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-900" title={entry.firstDatasetId}>{shortId(entry.firstDatasetId)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">最新出现 datasetId</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-900" title={entry.latestDatasetId}>{shortId(entry.latestDatasetId)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">导入开始</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatDateTime(entry.importedAt)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">导入完成</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatDateTime(entry.completedAt)}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">四源安全状态</h3>
            <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {entry.sourceStates.map((source) => (
                <div key={source.sourceType} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1.2fr_0.8fr_0.8fr]">
                  <p className="font-medium text-slate-900">{source.sourceLabel}</p>
                  <p className="text-slate-600">{source.statusLabel}</p>
                  <p className="text-slate-500">{formatNumber(source.rowCount)} 行</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">安全记录数量</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">商品经营：{formatNumber(entry.recordCounts.businessProduct)}</div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">商品推广：{formatNumber(entry.recordCounts.adProduct)}</div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">计划推广：{formatNumber(entry.recordCounts.adPlan)}</div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">售后安全聚合：{formatNumber(entry.recordCounts.afterSalesSafe)}</div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">时间线</h3>
            <div className="mt-3 space-y-2">
              {entry.activationEvents.length > 0 ? entry.activationEvents.map((event) => (
                <div key={`${event.action}:${event.datasetId}:${event.createdAt}`} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-900">{event.action === "activated" ? "激活" : "回滚"} · {formatDateTime(event.createdAt)}</p>
                  <p className="mt-1 truncate font-mono text-xs text-slate-400" title={event.datasetId}>{shortId(event.datasetId)}</p>
                </div>
              )) : (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">暂无激活或回滚记录。</p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
            详情仅展示安全聚合、状态和计数；不展示原始文件、原始表头或明细内容。
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Link
              href={dataCenterHref("quality", {
                platformCode: entry.platformCode,
                storeId: entry.storeId,
                batchId: entry.importBatchId,
              })}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              查看当前批次质量
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ImportHistoryClientInner({
  initialFilters,
}: {
  initialFilters: ImportHistoryFilters;
}) {
  const [filters, setFilters] = useState<ImportHistoryFilters>(initialFilters);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<ImportHistoryEntry | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [result, setResult] = useState<ImportHistoryLoadResult>({
    status: "empty",
    viewModel: null,
    issueCodes: [],
    message: "正在读取导入记录...",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadV05ImportHistory(filters)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  const entries = result.viewModel?.filteredEntries ?? [];
  const activeDatasetId = result.viewModel?.activeDatasetId ?? null;
  const handleFiltersChange = (nextFilters: ImportHistoryFilters) => {
    setLoading(true);
    setFilters(nextFilters);
  };
  const handleReload = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };
  const handleSelectEntry = (entry: ImportHistoryEntry, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setSelectedEntry(entry);
  };
  const handleCloseDrawer = () => {
    setSelectedEntry(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  };
  const summaryText = useMemo(() => {
    if (!result.viewModel) return result.message;
    return `共 ${result.viewModel.totalEntryCount} 个批次，当前筛选 ${result.viewModel.filteredEntries.length} 个。`;
  }, [result]);

  if (loading) {
    return <SafeStateCard title="正在读取导入记录" description="正在加载本地导入历史。" actionLabel="返回数据导入" />;
  }

  if (result.status === "empty") {
    return <SafeStateCard title="暂无导入记录" description="当前还没有导入记录。请先返回数据导入页完成一次批量导入。" />;
  }

  if (result.status === "corrupted") {
    return <SafeStateCard title="历史数据不可安全读取" description="本地导入历史可能损坏。页面不会自动删除数据，请重新上传并导入修复。" />;
  }

  if (result.status === "error") {
    return <SafeStateCard title="读取失败" description="读取导入记录失败，请刷新页面后重试。页面不会展示技术错误堆栈。" />;
  }

  return (
    <div className="space-y-5">
      <ImportHistoryFiltersBar
        result={result}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReload={handleReload}
      />

      <SectionCard
        title="导入记录列表"
        description={summaryText}
        action={
          <div className="text-xs text-slate-400">
            当前数据集：<span className="font-mono" title={activeDatasetId ?? ""}>{shortId(activeDatasetId)}</span>
          </div>
        }
      >
        <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          重复或冲突结果只在导入当次反馈，不生成新的历史批次。历史列表只显示已经安全持久化的批次。
        </div>
        <ImportHistoryTable entries={entries} onSelectEntry={handleSelectEntry} />
      </SectionCard>

      <ImportHistoryDrawer entry={selectedEntry} onClose={handleCloseDrawer} />
    </div>
  );
}

export function ImportHistoryClient() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const initialFilters = useMemo(
    () => buildInitialFilters(new URLSearchParams(searchKey)),
    [searchKey],
  );

  return <ImportHistoryClientInner key={searchKey} initialFilters={initialFilters} />;
}
