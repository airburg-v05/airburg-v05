"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadV05DataQuality } from "@/lib/v05/data-quality/browser-runtime";
import {
  dataCenterHref,
  dataCenterReimportHref,
  dataCenterStoreKey,
  parseDataCenterSearchParams,
} from "@/lib/v05/data-center";
import type {
  DataQualityFilters,
  DataQualityLoadResult,
  DataQualityStatus,
  V2DataQualityIssue,
  V2DataQualitySummary,
} from "@/lib/v05/data-quality/contracts";
import { DEFAULT_DATA_QUALITY_FILTERS } from "@/lib/v05/data-quality/filters";

type LoadState = "loading" | DataQualityLoadResult["status"];

const statusTone: Record<DataQualityStatus | "all", string> = {
  all: "border-slate-200 bg-white text-slate-600",
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  watch: "border-blue-200 bg-blue-50 text-blue-700",
  risk: "border-amber-200 bg-amber-50 text-amber-700",
  empty: "border-slate-200 bg-slate-50 text-slate-500",
  corrupted: "border-rose-200 bg-rose-50 text-rose-700",
};

const issueTone: Record<V2DataQualityIssue["severity"], string> = {
  watch: "border-blue-200 bg-blue-50 text-blue-700",
  risk: "border-amber-200 bg-amber-50 text-amber-700",
};

const shortId = (value: string): string =>
  value.length <= 18 ? value : `${value.slice(0, 10)}...${value.slice(-6)}`;

const formatCount = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString("zh-CN") : "--";

const formatDateRange = (range: V2DataQualitySummary["dateRange"]): string => {
  if (!range.start && !range.end) return "--";
  if (range.start === range.end) return range.start ?? "--";
  return `${range.start ?? "--"} 至 ${range.end ?? "--"}`;
};

const setFilter = <TKey extends keyof DataQualityFilters>(
  filters: DataQualityFilters,
  key: TKey,
  value: DataQualityFilters[TKey],
): DataQualityFilters => ({
  ...filters,
  [key]: value,
});

const buildInitialFilters = (params: URLSearchParams): DataQualityFilters => {
  const context = parseDataCenterSearchParams(params);
  return {
    ...DEFAULT_DATA_QUALITY_FILTERS,
    platformCode: context.platformCode ?? DEFAULT_DATA_QUALITY_FILTERS.platformCode,
    storeKey: dataCenterStoreKey(context),
    importBatchId: context.batchId ?? DEFAULT_DATA_QUALITY_FILTERS.importBatchId,
    searchTerm: "",
  };
};

const EmptyState = ({
  title,
  description,
  actionHref = "/upload",
}: {
  title: string;
  description: string;
  actionHref?: string;
}) => (
  <section className="panel p-6">
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <Link
        href={actionHref}
        className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        返回数据导入
      </Link>
    </div>
  </section>
);

const FilterBar = ({
  filters,
  result,
  onChange,
}: {
  filters: DataQualityFilters;
  result: NonNullable<DataQualityLoadResult["viewModel"]>;
  onChange: (filters: DataQualityFilters) => void;
}) => (
  <section className="panel p-5">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-950">筛选数据质量问题</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          平台、店铺、批次、问题类型和搜索会同时生效。
        </p>
      </div>
      <button
        type="button"
        onClick={() => onChange(DEFAULT_DATA_QUALITY_FILTERS)}
        className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-200"
      >
        重置筛选
      </button>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <label className="min-w-0 text-xs font-semibold text-slate-500">
        平台
        <select
          value={filters.platformCode}
          onChange={(event) => onChange(setFilter(filters, "platformCode", event.target.value as DataQualityFilters["platformCode"]))}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">全部平台</option>
          {result.filterOptions.platforms.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 text-xs font-semibold text-slate-500">
        店铺
        <select
          value={filters.storeKey}
          onChange={(event) => onChange(setFilter(filters, "storeKey", event.target.value))}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">全部店铺</option>
          {result.filterOptions.stores.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 text-xs font-semibold text-slate-500">
        批次
        <select
          value={filters.importBatchId}
          onChange={(event) => onChange(setFilter(filters, "importBatchId", event.target.value))}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">全部批次</option>
          {result.filterOptions.batches.map((option) => (
            <option key={option.value} value={option.value}>
              {shortId(option.label)} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 text-xs font-semibold text-slate-500">
        问题类型
        <select
          value={filters.issueType}
          onChange={(event) => onChange(setFilter(filters, "issueType", event.target.value as DataQualityFilters["issueType"]))}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">全部类型</option>
          {result.filterOptions.issueTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 text-xs font-semibold text-slate-500">
        状态
        <select
          value={filters.status}
          onChange={(event) => onChange(setFilter(filters, "status", event.target.value as DataQualityFilters["status"]))}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">全部状态</option>
          {result.filterOptions.statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </label>
    </div>

    <label className="mt-4 block text-xs font-semibold text-slate-500">
      搜索 importBatchId
      <input
        value={filters.searchTerm}
        onChange={(event) => onChange(setFilter(filters, "searchTerm", event.target.value))}
        placeholder="输入批次 ID、店铺名或 datasetId"
        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  </section>
);

const SourcePills = ({ summary }: { summary: V2DataQualitySummary }) => (
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {summary.sourceStates.map((source) => (
      <div key={source.sourceType} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-slate-700">{source.sourceLabel}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${source.status === "parsed" ? statusTone.normal : statusTone.risk}`}>
            {source.statusLabel}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {formatCount(source.rowCount)} 行 · {source.safeWarningCodeCount} 个安全提示
        </p>
      </div>
    ))}
  </div>
);

const IssueRow = ({ issue }: { issue: V2DataQualityIssue }) => (
  <div className="grid gap-3 border-t border-slate-100 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_9rem]">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-1 text-xs ${issueTone[issue.severity]}`}>
          {issue.severity === "risk" ? "风险" : "观察"}
        </span>
        <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
          {issue.sourceType ?? "dataset"}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
          {formatCount(issue.count)}
        </span>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-slate-600">{issue.safeDescription}</p>
      <p className="mt-1 break-words text-xs leading-5 text-slate-400">{issue.suggestion}</p>
    </div>
    <div className="flex items-start justify-start lg:justify-end">
      <Link
        href={dataCenterReimportHref({
          platformCode: issue.platformCode,
          storeId: issue.storeId,
          batchId: issue.importBatchId,
        })}
        className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        重新导入
      </Link>
    </div>
  </div>
);

const SummaryCard = ({ summary }: { summary: V2DataQualitySummary }) => (
  <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="grid gap-4 bg-slate-50 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs ${statusTone[summary.status]}`}>
            {summary.statusLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
            {summary.datasetStatusLabel}
          </span>
          <p className="truncate text-sm font-semibold text-slate-950">
            {summary.platformLabel} · {summary.storeName}
          </p>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
          <p className="min-w-0">
            批次：<span className="font-mono" title={summary.importBatchId}>{shortId(summary.importBatchId)}</span>
          </p>
          <p>日期：{formatDateRange(summary.dateRange)}</p>
          <p>四源：{summary.parsedSourceCount}/{summary.sourceCount}</p>
          <p>问题：{summary.issues.length}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={dataCenterHref("history", {
            platformCode: summary.platformCode,
            storeId: summary.storeId,
            batchId: summary.importBatchId,
          })}
          className="inline-flex w-fit rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
        >
          查看导入记录
        </Link>
        <Link
          href={dataCenterReimportHref({
            platformCode: summary.platformCode,
            storeId: summary.storeId,
            batchId: summary.importBatchId,
          })}
          className="inline-flex w-fit rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          重新导入
        </Link>
      </div>
    </div>
    <div className="p-4">
      <SourcePills summary={summary} />
    </div>
    {summary.issues.length > 0 ? (
      <div>
        {summary.issues.map((issue) => (
          <IssueRow key={issue.issueKey} issue={issue} />
        ))}
      </div>
    ) : (
      <div className="border-t border-slate-100 px-4 py-4 text-sm text-slate-500">
        当前批次四源完整，未发现 blocking issue。
      </div>
    )}
  </article>
);

const QualityList = ({ result }: { result: NonNullable<DataQualityLoadResult["viewModel"]> }) => (
  <section className="panel p-5">
    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-950">质量问题列表</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          当前仅展示安全分类、数量和修复建议；原批次只读保留。
        </p>
      </div>
      <div className="text-sm text-slate-500">
        {result.filteredSummaries.length} / {result.summaries.length} 个批次
      </div>
    </div>

    {result.filteredSummaries.length === 0 ? (
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
        当前筛选条件下暂无数据质量问题。
      </div>
    ) : (
      <div className="mt-5 space-y-4">
        {result.filteredSummaries.map((summary) => (
          <SummaryCard key={summary.summaryKey} summary={summary} />
        ))}
      </div>
    )}
  </section>
);

function DataQualityClientInner({
  initialFilters,
  dataCenterContext,
}: {
  initialFilters: DataQualityFilters;
  dataCenterContext: ReturnType<typeof parseDataCenterSearchParams>;
}) {
  const [filters, setFilters] = useState<DataQualityFilters>(initialFilters);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [result, setResult] = useState<DataQualityLoadResult["viewModel"]>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadV05DataQuality(filters)
      .then((nextResult) => {
        if (cancelled) return;
        setLoadState(nextResult.status);
        setResult(nextResult.viewModel);
        setMessage(nextResult.message);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
        setResult(null);
        setMessage("读取数据质量状态失败，请刷新页面后重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const headline = useMemo(() => {
    if (!result) return null;
    const riskCount = result.summaries.filter((summary) => summary.status === "risk").length;
    const watchCount = result.summaries.filter((summary) => summary.status === "watch").length;
    return { riskCount, watchCount };
  }, [result]);

  if (loadState === "loading") {
    return <EmptyState title="正在读取数据质量状态" description="系统正在读取本地安全状态。" actionHref={dataCenterHref("upload", dataCenterContext)} />;
  }

  if (loadState === "empty") {
    return <EmptyState title="暂无导入批次" description={message || "请先返回数据导入页完成一次批量导入。"} actionHref={dataCenterHref("upload", dataCenterContext)} />;
  }

  if (loadState === "corrupted") {
    return <EmptyState title="本地数据状态不可安全读取" description={message || "请保留当前数据，并返回上传页重新导入四源文件。"} actionHref={dataCenterHref("upload", dataCenterContext)} />;
  }

  if (loadState === "error" || !result) {
    return <EmptyState title="读取失败" description={message || "请刷新页面后重试。"} actionHref={dataCenterHref("upload", dataCenterContext)} />;
  }

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">当前质量概览</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              优先查看风险批次；重新导入会创建新批次，不会修改原批次。
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full border px-3 py-1 ${statusTone.risk}`}>
                风险批次 {headline?.riskCount ?? 0}
              </span>
              <span className={`rounded-full border px-3 py-1 ${statusTone.watch}`}>
                观察批次 {headline?.watchCount ?? 0}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                可修复问题 {result.repairableIssueCount}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">
                数据集 {result.datasetCount}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={dataCenterHref("upload", dataCenterContext)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              返回数据导入
            </Link>
            <Link
              href={dataCenterHref("history", dataCenterContext)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
            >
              查看导入记录
            </Link>
          </div>
        </div>
      </section>

      <FilterBar filters={filters} result={result} onChange={setFilters} />
      <QualityList result={result} />
    </div>
  );
}

export function DataQualityClient() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const dataCenterContext = useMemo(
    () => parseDataCenterSearchParams(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const initialFilters = useMemo(
    () => buildInitialFilters(new URLSearchParams(searchKey)),
    [searchKey],
  );

  return (
    <DataQualityClientInner
      key={searchKey}
      initialFilters={initialFilters}
      dataCenterContext={dataCenterContext}
    />
  );
}
