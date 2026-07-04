"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadV05DataQuality } from "@/lib/v05/data-quality/browser-runtime";
import { DEFAULT_DATA_QUALITY_FILTERS } from "@/lib/v05/data-quality/filters";
import { loadActiveRuntimeDatasetSnapshot } from "@/lib/persistence/runtime-dataset-persistence";
import type {
  DataQualityLoadResult,
  DataQualitySourceState,
  V2DataQualityIssue,
  V2DataQualitySummary,
} from "@/lib/v05/data-quality/contracts";
import type {
  RuntimeDatasetSafeIssue,
  RuntimeDatasetSnapshot,
  RuntimeDatasetSourceCoverageItem,
  RuntimeDatasetSourceType,
} from "@/lib/persistence/runtime-dataset-persistence.types";
import { V1Sidebar, V1TopBar } from "@/components/visual-system/v1/visual-system";

type PlatformFilter = "all" | "tmall" | "jd" | "pdd" | "douyin" | "youzan";
type SourceFilter = "all" | "business_product" | "ad_product" | "ad_plan" | "after_sales";
type IssueTypeFilter =
  | "all"
  | "missing_file"
  | "duplicate_file"
  | "missing_field"
  | "date_abnormal"
  | "empty_data"
  | "metric_unavailable"
  | "after_sales_safe"
  | "platform_unavailable";
type SeverityFilter = "all" | "high" | "medium" | "low" | "info";
type BoardImpact = "影响首页" | "影响系列看板" | "影响店铺看板" | "影响宝贝看板" | "仅提示";
type MatrixStatus = "正常" | "部分缺失" | "不可计算" | "暂未开放" | "待接入";

interface StoreOption {
  key: string;
  platformCode: string;
  storeId: string;
  storeName: string;
  label: string;
}

interface QualityFilters {
  platform: PlatformFilter;
  storeKey: string;
  startDate: string;
  endDate: string;
  sourceType: SourceFilter;
  issueType: IssueTypeFilter;
  severity: SeverityFilter;
  searchTerm: string;
}

interface QualityIssue {
  id: string;
  severity: Exclude<SeverityFilter, "all">;
  severityLabel: string;
  issueType: Exclude<IssueTypeFilter, "all">;
  issueTypeLabel: string;
  platformCode: string;
  platformLabel: string;
  storeId: string;
  storeName: string;
  dateRange: string;
  sourceType: SourceFilter;
  sourceLabel: string;
  batchSafeCode: string;
  safeCode: string;
  impact: BoardImpact[];
  suggestion: string;
  blocksCalculation: boolean;
  needsSupplement: boolean;
  safeSummary: string;
}

interface LegacySafeSummary {
  warningCount: number;
  hasLegacyAnalysis: boolean;
  selectedDate: string | null;
}

interface QualityModel {
  loadStatus: DataQualityLoadResult["status"] | "loading";
  message: string;
  issues: QualityIssue[];
  stores: StoreOption[];
  legacySafeSummary: LegacySafeSummary | null;
  hasV2Data: boolean;
  hasPersistedRuntimeData: boolean;
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

const ISSUE_TYPE_OPTIONS: Array<{ value: IssueTypeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "missing_file", label: "缺失文件" },
  { value: "duplicate_file", label: "重复文件" },
  { value: "missing_field", label: "字段缺失" },
  { value: "date_abnormal", label: "日期异常" },
  { value: "empty_data", label: "数据为空" },
  { value: "metric_unavailable", label: "指标不可计算" },
  { value: "after_sales_safe", label: "售后安全提示" },
  { value: "platform_unavailable", label: "平台暂未开放" },
];

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "high", label: "高风险" },
  { value: "medium", label: "中风险" },
  { value: "low", label: "低风险" },
  { value: "info", label: "提示" },
];

const SOURCE_LABELS: Record<Exclude<SourceFilter, "all">, string> = {
  business_product: "生意参谋商品经营表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales: "售后退货表",
};

const SOURCE_TO_IMPACTS: Record<Exclude<SourceFilter, "all">, BoardImpact[]> = {
  business_product: ["影响首页", "影响系列看板", "影响店铺看板", "影响宝贝看板"],
  ad_product: ["影响首页", "影响系列看板", "影响店铺看板", "影响宝贝看板"],
  ad_plan: ["影响店铺看板", "仅提示"],
  after_sales: ["影响首页", "影响系列看板", "影响店铺看板", "影响宝贝看板"],
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

const initialFilters: QualityFilters = {
  platform: "all",
  storeKey: "all",
  startDate: "",
  endDate: "",
  sourceType: "all",
  issueType: "all",
  severity: "all",
  searchTerm: "",
};

const emptyModel: QualityModel = {
  loadStatus: "loading",
  message: "正在读取数据质量状态。",
  issues: [],
  stores: [],
  legacySafeSummary: null,
  hasV2Data: false,
  hasPersistedRuntimeData: false,
};

const sourceLabel = (sourceType: SourceFilter): string =>
  sourceType === "all" ? "全部来源" : SOURCE_LABELS[sourceType];

const platformLabel = (platformCode: string): string =>
  PLATFORM_OPTIONS.find((option) => option.value === platformCode)?.label ?? platformCode;

const formatCount = (value: number): string => (Number.isFinite(value) ? value.toLocaleString("zh-CN") : "--");

const formatDateRange = (start: string | null | undefined, end: string | null | undefined): string => {
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

const normalizeSafeCode = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 80)
    .toUpperCase();

const severityLabel = (severity: QualityIssue["severity"]): string => {
  if (severity === "high") return "高风险";
  if (severity === "medium") return "中风险";
  if (severity === "low") return "低风险";
  return "提示";
};

const severityClass = (severity: QualityIssue["severity"]): string => {
  if (severity === "high") return "border-rose-300 bg-rose-50 text-rose-700";
  if (severity === "medium") return "border-amber-300 bg-amber-50 text-amber-700";
  if (severity === "low") return "border-blue-300 bg-blue-50 text-blue-700";
  return "border-slate-200/80 bg-slate-50/80 text-slate-600";
};

const mapIssueType = (issue: V2DataQualityIssue): Exclude<IssueTypeFilter, "all"> => {
  switch (issue.issueType) {
    case "source_missing":
      return "missing_file";
    case "source_parse_failed":
    case "missing_required_fields":
    case "source_state_mismatch":
      return "missing_field";
    case "invalid_date_count":
      return "date_abnormal";
    case "invalid_id_count":
    case "activation_failed":
    case "conflict":
      return "metric_unavailable";
    case "unknown_status_count":
      return "after_sales_safe";
    case "summary_row_count":
    case "safe_warning":
      return "empty_data";
  }
};

const issueTypeLabel = (issueType: Exclude<IssueTypeFilter, "all">): string =>
  ISSUE_TYPE_OPTIONS.find((option) => option.value === issueType)?.label ?? issueType;

const mapIssueSeverity = (issue: V2DataQualityIssue): QualityIssue["severity"] => {
  if (issue.severity === "risk") {
    if (["source_state_mismatch", "missing_required_fields", "activation_failed", "conflict"].includes(issue.issueType)) {
      return "high";
    }
    return "medium";
  }
  if (issue.issueType === "safe_warning" || issue.issueType === "summary_row_count") return "low";
  return "info";
};

const issueImpacts = (sourceType: SourceFilter, issueType: Exclude<IssueTypeFilter, "all">): BoardImpact[] => {
  if (issueType === "platform_unavailable") return ["仅提示"];
  if (sourceType !== "all") return SOURCE_TO_IMPACTS[sourceType];
  return ["影响首页", "影响店铺看板"];
};

const issueSuggestion = (issueType: Exclude<IssueTypeFilter, "all">): string => {
  if (issueType === "missing_file") return "去数据上传页补充对应来源。";
  if (issueType === "duplicate_file") return "去历史数据页查看批次安全短码。";
  if (issueType === "platform_unavailable") return "等待该平台数据接入，当前不计入缺失。";
  if (issueType === "after_sales_safe") return "售后仅保留安全聚合提示，不影响原始明细展示边界。";
  if (issueType === "metric_unavailable") return "该指标可能暂不可计算，请查看来源状态后补充数据。";
  return "请复核上传文件日期和字段，再回到看板查看。";
};

const sourceStateToIssueType = (source: DataQualitySourceState): Exclude<IssueTypeFilter, "all"> => {
  if (source.status === "missing") return "missing_file";
  if (source.status === "error") return "missing_field";
  if (source.status === "unknown") return "missing_field";
  return source.rowCount === 0 ? "empty_data" : "metric_unavailable";
};

const sourceStateSeverity = (source: DataQualitySourceState): QualityIssue["severity"] => {
  if (source.status === "error") return "high";
  if (source.status === "missing" || source.status === "unknown") return "medium";
  return "low";
};

const v2IssueToQualityIssue = (summary: V2DataQualitySummary, issue: V2DataQualityIssue): QualityIssue => {
  const issueType = mapIssueType(issue);
  const sourceType = (issue.sourceType ?? "all") as SourceFilter;
  const severity = mapIssueSeverity(issue);
  return {
    id: `issue:${issue.issueKey}`,
    severity,
    severityLabel: severityLabel(severity),
    issueType,
    issueTypeLabel: issueTypeLabel(issueType),
    platformCode: issue.platformCode,
    platformLabel: summary.platformLabel || platformLabel(issue.platformCode),
    storeId: issue.storeId,
    storeName: summary.storeName || issue.storeId,
    dateRange: formatDateRange(summary.dateRange.start, summary.dateRange.end),
    sourceType,
    sourceLabel: sourceLabel(sourceType),
    batchSafeCode: shortCode(issue.importBatchId),
    safeCode: normalizeSafeCode(issue.code || issue.issueType),
    impact: issueImpacts(sourceType, issueType),
    suggestion: issueSuggestion(issueType),
    blocksCalculation: severity === "high",
    needsSupplement: issueType === "missing_file" || issueType === "missing_field",
    safeSummary: `${issueTypeLabel(issueType)}已转换为安全提示，原始内容不会在本页展示。`,
  };
};

const sourceStateToQualityIssue = (summary: V2DataQualitySummary, source: DataQualitySourceState): QualityIssue | null => {
  if (source.status === "parsed" && source.safeWarningCodeCount === 0) return null;
  const issueType = source.status === "parsed" && source.sourceType === "after_sales"
    ? "after_sales_safe"
    : sourceStateToIssueType(source);
  const severity = source.status === "parsed" ? "low" : sourceStateSeverity(source);
  const sourceType = source.sourceType as SourceFilter;
  return {
    id: `source:${summary.summaryKey}:${source.sourceType}:${source.status}`,
    severity,
    severityLabel: severityLabel(severity),
    issueType,
    issueTypeLabel: issueTypeLabel(issueType),
    platformCode: summary.platformCode,
    platformLabel: summary.platformLabel,
    storeId: summary.storeId,
    storeName: summary.storeName,
    dateRange: formatDateRange(source.dateRange.start ?? summary.dateRange.start, source.dateRange.end ?? summary.dateRange.end),
    sourceType,
    sourceLabel: source.sourceLabel,
    batchSafeCode: shortCode(summary.importBatchId),
    safeCode: normalizeSafeCode(`${source.sourceType}_${source.status}_${source.safeWarningCodeCount}`),
    impact: issueImpacts(sourceType, issueType),
    suggestion: issueSuggestion(issueType),
    blocksCalculation: severity === "high",
    needsSupplement: issueType === "missing_file" || issueType === "missing_field",
    safeSummary: source.status === "parsed"
      ? `${source.sourceLabel}存在 ${formatCount(source.safeWarningCodeCount)} 个安全提示，具体内容已隐藏。`
      : `${source.sourceLabel}当前状态为${source.statusLabel}，相关看板可能只展示可计算部分。`,
  };
};

const buildIssuesFromResult = (result: DataQualityLoadResult): QualityIssue[] => {
  if (!result.viewModel) return [];
  const issueMap = new Map<string, QualityIssue>();
  result.viewModel.summaries.forEach((summary) => {
    summary.issues.forEach((issue) => {
      const qualityIssue = v2IssueToQualityIssue(summary, issue);
      issueMap.set(qualityIssue.id, qualityIssue);
    });
    summary.sourceStates.forEach((source) => {
      const qualityIssue = sourceStateToQualityIssue(summary, source);
      if (qualityIssue) issueMap.set(qualityIssue.id, qualityIssue);
    });
  });
  return Array.from(issueMap.values()).sort((left, right) => {
    const severityOrder: Record<QualityIssue["severity"], number> = { high: 0, medium: 1, low: 2, info: 3 };
    return severityOrder[left.severity] - severityOrder[right.severity] ||
      left.platformLabel.localeCompare(right.platformLabel, "zh-CN") ||
      left.storeName.localeCompare(right.storeName, "zh-CN") ||
      left.safeCode.localeCompare(right.safeCode);
  });
};

const buildStoresFromResult = (result: DataQualityLoadResult, legacy: LegacySafeSummary | null): StoreOption[] => {
  const stores = new Map<string, StoreOption>();
  result.viewModel?.summaries.forEach((summary) => {
    const key = `${summary.platformCode}:${summary.storeId}`;
    stores.set(key, {
      key,
      platformCode: summary.platformCode,
      storeId: summary.storeId,
      storeName: summary.storeName || summary.storeId,
      label: `${summary.platformLabel || platformLabel(summary.platformCode)} · ${summary.storeName || summary.storeId} · ${summary.platformCode}/${summary.storeId}`,
    });
  });
  if (stores.size === 0 && legacy?.hasLegacyAnalysis) {
    stores.set("tmall:tmall-default-store", {
      key: "tmall:tmall-default-store",
      platformCode: "tmall",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      label: "天猫 · 天猫默认店铺 · tmall/tmall-default-store",
    });
  }
  return Array.from(stores.values()).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
};

const loadLegacySafeSummary = (): LegacySafeSummary | null => {
  try {
    const raw = window.localStorage.getItem("airburg_tmall_analysis_v2");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      dataQualityWarnings?: unknown;
      analysisTimestamp?: unknown;
      overview?: { selectedDate?: unknown; risks?: { dataQualityWarningCount?: unknown } };
    };
    const warningCount = Array.isArray(parsed.dataQualityWarnings)
      ? parsed.dataQualityWarnings.length
      : typeof parsed.overview?.risks?.dataQualityWarningCount === "number"
        ? parsed.overview.risks.dataQualityWarningCount
        : 0;
    const selectedDate = typeof parsed.overview?.selectedDate === "string"
      ? parsed.overview.selectedDate
      : typeof parsed.analysisTimestamp === "string"
        ? parsed.analysisTimestamp.slice(0, 10)
        : null;
    return {
      warningCount: Number.isFinite(warningCount) ? warningCount : 0,
      hasLegacyAnalysis: true,
      selectedDate,
    };
  } catch {
    return {
      warningCount: 0,
      hasLegacyAnalysis: false,
      selectedDate: null,
    };
  }
};

const buildLegacyIssue = (legacy: LegacySafeSummary | null): QualityIssue[] => {
  if (!legacy?.hasLegacyAnalysis || legacy.warningCount <= 0) return [];
  return [
    {
      id: "legacy:safe-warning-count",
      severity: "low",
      severityLabel: "低风险",
      issueType: "metric_unavailable",
      issueTypeLabel: "指标不可计算",
      platformCode: "tmall",
      platformLabel: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      dateRange: legacy.selectedDate ?? "--",
      sourceType: "all",
      sourceLabel: "旧版天猫安全摘要",
      batchSafeCode: "LEGACY",
      safeCode: "LEGACY_SAFE_WARNING_COUNT",
      impact: ["仅提示"],
      suggestion: "可前往数据上传页补充最新四源数据，或在历史数据页查看批次状态。",
      blocksCalculation: false,
      needsSupplement: false,
      safeSummary: `旧版数据存在 ${formatCount(legacy.warningCount)} 个安全提示，本页只展示计数。`,
    },
  ];
};

const runtimeStoreOption = (snapshot: RuntimeDatasetSnapshot): StoreOption => ({
  key: `${snapshot.platformCode}:${snapshot.storeId}`,
  platformCode: snapshot.platformCode,
  storeId: snapshot.storeId,
  storeName: snapshot.storeId === "mixed" ? "多店铺安全聚合" : snapshot.storeId,
  label: `${platformLabel(snapshot.platformCode)} · ${snapshot.storeId === "mixed" ? "多店铺安全聚合" : snapshot.storeId} · ${snapshot.platformCode}/${snapshot.storeId}`,
});

const runtimeIssueSourceType = (sourceType: RuntimeDatasetSourceType): SourceFilter => {
  if (sourceType === "plan_metric") return "ad_plan";
  if (sourceType === "after_sales") return "after_sales";
  if (sourceType === "product_metric" || sourceType === "product_dimension") return "business_product";
  return "all";
};

const runtimeIssueImpacts = (sourceType: RuntimeDatasetSourceType): BoardImpact[] => {
  if (sourceType === "unknown") return ["仅提示"];
  if (sourceType === "plan_metric") return SOURCE_TO_IMPACTS.ad_plan;
  if (sourceType === "after_sales") return SOURCE_TO_IMPACTS.after_sales;
  return ["影响首页", "影响系列看板", "影响店铺看板", "影响宝贝看板"];
};

const runtimeDateRange = (snapshot: RuntimeDatasetSnapshot): string =>
  formatDateRange(snapshot.dateRange.startDate, snapshot.dateRange.endDate);

const runtimeBaseIssue = (
  snapshot: RuntimeDatasetSnapshot,
  id: string,
  issueType: Exclude<IssueTypeFilter, "all">,
  severity: QualityIssue["severity"],
  sourceType: SourceFilter,
  sourceLabelValue: string,
  safeCode: string,
  safeSummary: string,
  impact: BoardImpact[],
  suggestion: string,
  options: { blocksCalculation?: boolean; needsSupplement?: boolean } = {},
): QualityIssue => ({
  id,
  severity,
  severityLabel: severityLabel(severity),
  issueType,
  issueTypeLabel: issueTypeLabel(issueType),
  platformCode: snapshot.platformCode,
  platformLabel: platformLabel(snapshot.platformCode),
  storeId: snapshot.storeId,
  storeName: snapshot.storeId === "mixed" ? "多店铺安全聚合" : snapshot.storeId,
  dateRange: runtimeDateRange(snapshot),
  sourceType,
  sourceLabel: sourceLabelValue,
  batchSafeCode: shortCode(snapshot.activeDatasetId),
  safeCode: normalizeSafeCode(safeCode),
  impact,
  suggestion,
  blocksCalculation: Boolean(options.blocksCalculation),
  needsSupplement: Boolean(options.needsSupplement),
  safeSummary,
});

const runtimeMissingCoverageIssue = (
  snapshot: RuntimeDatasetSnapshot,
  sourceType: Exclude<RuntimeDatasetSourceType, "unknown">,
  coverage: RuntimeDatasetSourceCoverageItem | undefined,
): QualityIssue | null => {
  if (coverage?.present) return null;
  const label = RUNTIME_SOURCE_LABELS[sourceType];
  return runtimeBaseIssue(
    snapshot,
    `runtime:missing:${sourceType}`,
    "missing_file",
    "medium",
    runtimeIssueSourceType(sourceType),
    label,
    `missing_${sourceType}`,
    `${label}未接入当前 active dataset，相关看板会只展示可计算部分。`,
    runtimeIssueImpacts(sourceType),
    "去数据上传页补充对应来源。",
    { needsSupplement: true },
  );
};

const runtimeSafeIssueToQualityIssue = (snapshot: RuntimeDatasetSnapshot, issue: RuntimeDatasetSafeIssue): QualityIssue => {
  const lowerCode = issue.code.toLowerCase();
  const issueType: Exclude<IssueTypeFilter, "all"> =
    lowerCode.includes("plan_summary_without_product_id") || lowerCode.includes("unsupported_plan_summary")
      ? "metric_unavailable"
      : lowerCode.includes("unsupported")
        ? "platform_unavailable"
        : issue.sourceType === "after_sales"
          ? "after_sales_safe"
          : "metric_unavailable";
  const severity: QualityIssue["severity"] = issue.level === "error" ? "high" : issueType === "platform_unavailable" ? "info" : "low";
  const label = RUNTIME_SOURCE_LABELS[issue.sourceType];
  return runtimeBaseIssue(
    snapshot,
    `runtime:issue:${issue.sourceType}:${issue.code}`,
    issueType,
    severity,
    runtimeIssueSourceType(issue.sourceType),
    label,
    issue.code,
    `${label}安全 issue code：${normalizeSafeCode(issue.code)}，数量 ${formatCount(issue.safeCount)}。原始内容和文件信息不会在本页展示。`,
    runtimeIssueImpacts(issue.sourceType),
    issueType === "platform_unavailable" ? "等待该文件类型接入，当前不阻断其它数据。" : issueSuggestion(issueType),
    { blocksCalculation: severity === "high", needsSupplement: false },
  );
};

const buildRuntimeSnapshotIssues = (snapshot: RuntimeDatasetSnapshot): QualityIssue[] => {
  const coverageIssues = RUNTIME_SOURCE_ORDER
    .map((sourceType) => runtimeMissingCoverageIssue(snapshot, sourceType, snapshot.sourceCoverage[sourceType]))
    .filter((issue): issue is QualityIssue => Boolean(issue));
  const safeIssues = snapshot.safeIssues.map((issue) => runtimeSafeIssueToQualityIssue(snapshot, issue));
  const duplicateIssue = snapshot.importSummary.dedupedRecords > 0
    ? runtimeBaseIssue(
      snapshot,
      "runtime:deduped-records",
      "duplicate_file",
      "low",
      "all",
      "重复隔离摘要",
      "runtime_deduped_records",
      `已隔离 ${formatCount(snapshot.importSummary.dedupedRecords)} 条重复聚合记录，未重复累加 GMV、访客或搜索词。`,
      ["仅提示"],
      "去历史数据页查看 active dataset 安全摘要。",
    )
    : null;
  const afterSalesStatusIssue = snapshot.sourceCoverage.after_sales.present
    ? runtimeBaseIssue(
      snapshot,
      "runtime:after-sales-safe-status",
      "after_sales_safe",
      "info",
      "after_sales",
      RUNTIME_SOURCE_LABELS.after_sales,
      "after_sales_safe_aggregate",
      `售后数据已转为安全聚合指标，当前 afterSalesMetricsCount 为 ${formatCount(snapshot.importSummary.afterSalesMetricsCount)}。`,
      SOURCE_TO_IMPACTS.after_sales,
      "暂不影响看板；本页不会展示售后订单、退款或交易明细。",
    )
    : null;
  return [...coverageIssues, ...safeIssues, duplicateIssue, afterSalesStatusIssue].filter((issue): issue is QualityIssue => Boolean(issue));
};

const buildRuntimeCorruptedIssue = (reason: string): QualityIssue => ({
  id: "runtime:schema-corrupted",
  severity: "high",
  severityLabel: "高风险",
  issueType: "metric_unavailable",
  issueTypeLabel: "指标不可计算",
  platformCode: "tmall",
  platformLabel: "天猫",
  storeId: "unknown",
  storeName: "当前 active dataset",
  dateRange: "--",
  sourceType: "all",
  sourceLabel: "持久化数据 schema",
  batchSafeCode: "RUNTIME",
  safeCode: normalizeSafeCode(`runtime_schema_corrupted_${reason}`),
  impact: ["影响首页", "影响系列看板", "影响宝贝看板"],
  suggestion: "请重新完成一次安全批量导入。",
  blocksCalculation: true,
  needsSupplement: true,
  safeSummary: "持久化 schema 不兼容，页面不会展示损坏对象或技术堆栈。",
});

const filterIssues = (issues: QualityIssue[], filters: QualityFilters): QualityIssue[] => {
  const search = filters.searchTerm.trim().toLowerCase();
  return issues.filter((issue) => {
    if (filters.platform !== "all" && issue.platformCode !== filters.platform) return false;
    if (filters.storeKey !== "all" && `${issue.platformCode}:${issue.storeId}` !== filters.storeKey) return false;
    if (filters.sourceType !== "all" && issue.sourceType !== filters.sourceType) return false;
    if (filters.issueType !== "all" && issue.issueType !== filters.issueType) return false;
    if (filters.severity !== "all" && issue.severity !== filters.severity) return false;
    if (filters.startDate && issue.dateRange !== "--" && issue.dateRange.slice(-10) < filters.startDate) return false;
    if (filters.endDate && issue.dateRange !== "--" && issue.dateRange.slice(0, 10) > filters.endDate) return false;
    if (!search) return true;
    return [
      issue.batchSafeCode,
      issue.safeCode,
      issue.storeName,
      issue.storeId,
      issue.platformCode,
      issue.issueTypeLabel,
    ].some((token) => token.toLowerCase().includes(search));
  });
};

const buildSummaryCards = (issues: QualityIssue[]) => {
  const high = issues.filter((issue) => issue.severity === "high").length;
  const medium = issues.filter((issue) => issue.severity === "medium").length;
  const low = issues.filter((issue) => issue.severity === "low" || issue.severity === "info").length;
  const status = issues.length === 0
    ? "可分析"
    : high > 0
      ? "需补充数据"
      : medium > 0
        ? "部分可分析"
        : "可分析";
  return [
    { label: "高风险问题", value: formatCount(high), tone: "red" },
    { label: "中风险问题", value: formatCount(medium), tone: "yellow" },
    { label: "低风险提示", value: formatCount(low), tone: "blue" },
    { label: "可进入看板状态", value: status, tone: status === "可分析" ? "green" : status === "部分可分析" ? "yellow" : "red" },
  ] as const;
};

const matrixRows = ["首页", "系列看板", "店铺看板", "宝贝看板", "数据上传", "历史数据"] as const;
const matrixColumns = ["经营数据", "推广数据", "售后数据", "目标数据", "系列/宝贝配置"] as const;

const buildMatrix = (issues: QualityIssue[]): Record<(typeof matrixRows)[number], Record<(typeof matrixColumns)[number], MatrixStatus>> => {
  const matrix = matrixRows.reduce((rowRecord, row) => {
    rowRecord[row] = matrixColumns.reduce((columnRecord, column) => {
      columnRecord[column] = column === "目标数据" || column === "系列/宝贝配置" ? "待接入" : "正常";
      return columnRecord;
    }, {} as Record<(typeof matrixColumns)[number], MatrixStatus>);
    return rowRecord;
  }, {} as Record<(typeof matrixRows)[number], Record<(typeof matrixColumns)[number], MatrixStatus>>);

  issues.forEach((issue) => {
    const affectedRows = matrixRows.filter((row) => issue.impact.some((impact) => impact.includes(row)) || issue.impact.includes("仅提示"));
    const sourceColumns: Array<(typeof matrixColumns)[number]> =
      issue.sourceType === "business_product"
        ? ["经营数据"]
        : issue.sourceType === "ad_product" || issue.sourceType === "ad_plan"
          ? ["推广数据"]
          : issue.sourceType === "after_sales"
            ? ["售后数据"]
            : ["经营数据", "推广数据"];
    affectedRows.forEach((row) => {
      sourceColumns.forEach((column) => {
        if (issue.issueType === "platform_unavailable") matrix[row][column] = "暂未开放";
        else if (issue.blocksCalculation) matrix[row][column] = "不可计算";
        else if (issue.needsSupplement) matrix[row][column] = "部分缺失";
      });
    });
  });

  return matrix;
};

function Sidebar() {
  return <V1Sidebar activeLabel="数据上传" ariaLabel="数据质量导航" />;
}

function TopBar() {
  return <V1TopBar title="数据质量" />;
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
  stores,
  contextText,
  onChange,
}: {
  filters: QualityFilters;
  stores: StoreOption[];
  contextText: string | null;
  onChange: (filters: QualityFilters) => void;
}) {
  const fieldClass = "mt-1 h-10 w-full rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200";
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="upload-quality-v1-filters">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <LogoBlock />
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            平台筛选
            <select className={fieldClass} value={filters.platform} onChange={(event) => onChange({ ...filters, platform: event.target.value as PlatformFilter })}>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            店铺筛选
            <select className={fieldClass} value={filters.storeKey} onChange={(event) => onChange({ ...filters, storeKey: event.target.value })}>
              <option value="all">全部店铺</option>
              {stores.length === 0 ? <option value="empty" disabled>暂无店铺数据</option> : null}
              {stores.map((store) => (
                <option key={store.key} value={store.key}>{store.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            开始日期
            <input className={fieldClass} type="date" value={filters.startDate} onChange={(event) => onChange({ ...filters, startDate: event.target.value })} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            结束日期
            <input className={fieldClass} type="date" value={filters.endDate} onChange={(event) => onChange({ ...filters, endDate: event.target.value })} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            来源类型筛选
            <select className={fieldClass} value={filters.sourceType} onChange={(event) => onChange({ ...filters, sourceType: event.target.value as SourceFilter })}>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            问题类型筛选
            <select className={fieldClass} value={filters.issueType} onChange={(event) => onChange({ ...filters, issueType: event.target.value as IssueTypeFilter })}>
              {ISSUE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            严重程度筛选
            <select className={fieldClass} value={filters.severity} onChange={(event) => onChange({ ...filters, severity: event.target.value as SeverityFilter })}>
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block min-w-0 text-xs font-semibold text-slate-600">
            搜索框
            <input
              className={fieldClass}
              value={filters.searchTerm}
              placeholder="搜安全码 / 店铺 / code"
              onChange={(event) => onChange({ ...filters, searchTerm: event.target.value })}
            />
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold">
        <Link href="/upload" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-slate-900">
          去数据上传
        </Link>
        <Link href="/upload/history" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-slate-900">
          去历史数据
        </Link>
        {contextText ? (
          <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
            当前查看上下文：{contextText}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function SummaryCards({ issues, hasData }: { issues: QualityIssue[]; hasData: boolean }) {
  const cards = buildSummaryCards(hasData ? issues : []);
  const toneClass: Record<string, string> = {
    red: "border-rose-300 bg-rose-50 text-rose-700",
    yellow: "border-amber-300 bg-amber-50 text-amber-700",
    blue: "border-blue-300 bg-blue-50 text-blue-700",
    green: "border-emerald-300 bg-emerald-50 text-emerald-700",
  };
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="upload-quality-v1-summary">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-xl border p-4 ${toneClass[card.tone]}`}>
          <p className="text-sm font-semibold">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold">{hasData || card.label !== "可进入看板状态" ? card.value : "暂无数据"}</p>
        </div>
      ))}
    </section>
  );
}

function IssueList({
  issues,
  loadStatus,
  onSelect,
}: {
  issues: QualityIssue[];
  loadStatus: QualityModel["loadStatus"];
  onSelect: (issue: QualityIssue) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="upload-quality-v1-issue-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">质量问题列表</h2>
          <p className="mt-1 text-sm text-slate-500">
            数据质量页展示安全 issue code 和聚合摘要，只读查看，不展示原始行、来源私密信息或敏感明细。
          </p>
        </div>
        <span className="rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1 text-sm font-semibold text-slate-600">
          {formatCount(issues.length)} 条
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {issues.length === 0 ? (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-5">
            <p className="text-base font-semibold text-slate-900">
              {loadStatus === "loading" ? "正在读取数据质量状态" : "暂无质量问题"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              当前数据质量问题将在导入后展示；如果已有数据，本页会优先展示安全问题 code 和影响范围。
            </p>
          </div>
        ) : (
          issues.map((issue) => (
            <article key={issue.id} className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClass(issue.severity)}`}>{issue.severityLabel}</span>
                    <span className="rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-xs font-semibold text-slate-700">{issue.issueTypeLabel}</span>
                    <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{issue.safeCode}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-slate-950">{issue.sourceLabel} · {issue.storeName}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{issue.safeSummary}</p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                  onClick={() => onSelect(issue)}
                >
                  查看详情
                </button>
              </div>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                <Meta label="平台" value={issue.platformLabel} />
                <Meta label="店铺" value={`${issue.storeName} · ${issue.platformCode}/${issue.storeId}`} />
                <Meta label="业务日期 / 日期范围" value={issue.dateRange} />
                <Meta label="来源类型" value={issue.sourceLabel} />
                <Meta label="批次安全短码" value={issue.batchSafeCode} />
                <Meta label="safe warning code" value={issue.safeCode} />
                <Meta label="影响范围" value={issue.impact.join(" / ")} />
                <Meta label="建议动作" value={issue.suggestion} />
              </dl>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "--"}</dd>
    </div>
  );
}

function ImpactMatrix({ issues }: { issues: QualityIssue[] }) {
  const matrix = buildMatrix(issues);
  const statusClass: Record<MatrixStatus, string> = {
    正常: "border-emerald-200 bg-emerald-50 text-emerald-700",
    部分缺失: "border-amber-200 bg-amber-50 text-amber-700",
    不可计算: "border-rose-200 bg-rose-50 text-rose-700",
    暂未开放: "border-slate-200 bg-slate-50/80 text-slate-500",
    待接入: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="upload-quality-v1-impact-matrix">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">质量影响矩阵</h2>
        <p className="mt-1 text-sm text-slate-500">缺失数据不按 0 计算；暂未开放的平台不计为缺失。</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-y-2 text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold text-slate-500">
              <th className="px-3 py-2">页面</th>
              {matrixColumns.map((column) => (
                <th key={column} className="px-3 py-2">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row}>
                <td className="rounded-l-md border-y-2 border-l-2 border-slate-200 bg-white px-3 py-3 font-semibold text-slate-900">{row}</td>
                {matrixColumns.map((column, index) => {
                  const status = matrix[row][column];
                  return (
                    <td
                      key={column}
                      className={`${index === matrixColumns.length - 1 ? "rounded-r-md border-r-2" : ""} border-y-2 border-slate-200 bg-white px-3 py-3`}
                    >
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[status]}`}>
                        {status}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailDrawer({ issue, onClose }: { issue: QualityIssue | null; onClose: () => void }) {
  if (!issue) {
    return (
      <aside className="hidden" data-testid="upload-quality-v1-detail-drawer" aria-hidden="true">
        详情抽屉
      </aside>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" data-testid="upload-quality-v1-detail-drawer">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="关闭详情抽屉遮罩" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="质量问题详情"
        className="relative h-full w-full max-w-[560px] overflow-y-auto bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">问题基础信息</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">{issue.issueTypeLabel}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-3 py-2 text-sm font-semibold text-slate-900">
            关闭
          </button>
        </div>
        <div className="mt-5 grid gap-3">
          <Meta label="问题 code" value={issue.safeCode} />
          <Meta label="严重程度" value={issue.severityLabel} />
          <Meta label="问题类型" value={issue.issueTypeLabel} />
          <Meta label="平台" value={`${issue.platformLabel} · ${issue.platformCode}`} />
          <Meta label="店铺" value={`${issue.storeName} · ${issue.storeId}`} />
          <Meta label="日期范围" value={issue.dateRange} />
          <Meta label="来源类型" value={issue.sourceLabel} />
        </div>
        <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-slate-900">安全摘要</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{issue.safeSummary}</p>
          <div className="mt-3 grid gap-2 text-sm">
            <Meta label="safe warning code" value={issue.safeCode} />
            <Meta label="影响看板" value={issue.impact.join(" / ")} />
            <Meta label="是否阻断计算" value={issue.blocksCalculation ? "是" : "否"} />
            <Meta label="是否需要补充数据" value={issue.needsSupplement ? "是" : "否"} />
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200/80 bg-white p-4">
          <p className="text-sm font-semibold text-slate-900">建议动作</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{issue.suggestion}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/upload" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              去数据上传
            </Link>
            <Link href="/upload/history" className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              去历史数据
            </Link>
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              返回关闭
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function UploadQualityV1Dashboard() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<QualityFilters>(initialFilters);
  const [model, setModel] = useState<QualityModel>(emptyModel);
  const [selectedIssue, setSelectedIssue] = useState<QualityIssue | null>(null);

  useEffect(() => {
    let active = true;
    async function loadQuality() {
      const legacySafeSummary = loadLegacySafeSummary();
      try {
        const [result, persistedResult] = await Promise.all([
          loadV05DataQuality(DEFAULT_DATA_QUALITY_FILTERS),
          loadActiveRuntimeDatasetSnapshot(),
        ]);
        if (!active) return;
        const v2Issues = buildIssuesFromResult(result);
        const persistedIssues = persistedResult.status === "ok"
          ? buildRuntimeSnapshotIssues(persistedResult.snapshot)
          : persistedResult.status === "corrupted"
            ? [buildRuntimeCorruptedIssue(persistedResult.reason)]
            : [];
        const legacyIssues = result.status === "empty" && persistedIssues.length === 0 ? buildLegacyIssue(legacySafeSummary) : [];
        const stores = buildStoresFromResult(result, legacySafeSummary);
        if (persistedResult.status === "ok") {
          const persistedStore = runtimeStoreOption(persistedResult.snapshot);
          if (!stores.some((store) => store.key === persistedStore.key)) stores.push(persistedStore);
        }
        setModel({
          loadStatus: persistedResult.status === "corrupted" ? "corrupted" : result.status,
          message: persistedResult.status === "ok"
            ? "已读取 active dataset 安全聚合质量摘要。"
            : persistedResult.status === "corrupted"
              ? "active dataset schema 不可安全读取。"
              : result.status === "valid"
                ? "数据质量已加载。"
                : result.status === "empty"
                  ? "当前数据质量问题将在导入后展示。"
                  : "本地质量状态不可安全读取，请前往数据上传页补充数据。",
          issues: [...persistedIssues, ...v2Issues, ...legacyIssues],
          stores,
          legacySafeSummary,
          hasV2Data: Boolean(result.viewModel && result.viewModel.summaries.length > 0),
          hasPersistedRuntimeData: persistedResult.status === "ok",
        });
      } catch {
        if (!active) return;
        setModel({
          loadStatus: "error",
          message: "读取数据质量状态失败，请刷新页面后重试。",
          issues: buildLegacyIssue(legacySafeSummary),
          stores: buildStoresFromResult({ status: "empty", viewModel: null, issueCodes: [], message: "" }, legacySafeSummary),
          legacySafeSummary,
          hasV2Data: false,
          hasPersistedRuntimeData: false,
        });
      }
    }
    void loadQuality();
    return () => {
      active = false;
    };
  }, []);

  const contextText = useMemo(() => {
    const platform = searchParams.get("platform");
    const storeId = searchParams.get("storeId");
    const batchId = searchParams.get("batchId");
    const tokens = [
      platform ? `平台 ${platform}` : null,
      storeId ? `店铺 ${storeId}` : null,
      batchId ? `批次 ${shortCode(batchId)}` : null,
    ].filter(Boolean);
    return tokens.length > 0 ? tokens.join(" · ") : null;
  }, [searchParams]);

  const filteredIssues = useMemo(() => filterIssues(model.issues, filters), [model.issues, filters]);
  const hasData = model.hasV2Data || model.hasPersistedRuntimeData || Boolean(model.legacySafeSummary?.hasLegacyAnalysis);

  return (
    <div className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950" data-testid="upload-quality-v1-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
            <div className="mx-auto max-w-[1440px] space-y-4">
              <FilterPanel filters={filters} stores={model.stores} contextText={contextText} onChange={setFilters} />
              <SummaryCards issues={filteredIssues} hasData={hasData} />
              <section className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold text-slate-950">数据质量 V1 安全问题中心</h1>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      本页只读展示质量提示、影响范围和安全入口，不改变导入数据。
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200/80 bg-slate-50/80 px-3 py-1 text-sm font-semibold text-slate-600">
                    {model.message}
                  </span>
                </div>
              </section>
              <IssueList issues={filteredIssues} loadStatus={model.loadStatus} onSelect={setSelectedIssue} />
              <ImpactMatrix issues={filteredIssues} />
            </div>
          </main>
      </div>
      <DetailDrawer issue={selectedIssue} onClose={() => setSelectedIssue(null)} />
    </div>
  );
}
