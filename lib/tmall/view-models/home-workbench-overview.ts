import type { TmallSeriesGroupStorageParseResult } from "../../storage/tmall-series-storage";
import type { TmallTargetStorageParseResult } from "../../storage/tmall-target-storage";
import type {
  TmallAnalysisDisplayResult,
  TmallSourceStatus,
  TmallSourceType,
} from "../../../types/tmall";
import {
  buildTmallHomeOverview,
  getTmallBusinessDates,
} from "./home-overview";
import { buildTmallProductBoardOverview } from "./product-board";
import { buildTmallProductFocusEntry } from "./product-focus-entry";
import { buildTmallTargetDiagnostics } from "./target-diagnostics";
import type { TmallTargetDiagnosticItem } from "./target-diagnostics";

export type HomeWorkbenchStatus = "normal" | "watch" | "risk" | "empty";

export interface HomeWorkbenchMetric {
  label: string;
  value: string;
}

export interface HomeWorkbenchSourceStatus {
  key: TmallSourceType;
  label: string;
  status: TmallSourceStatus;
  statusLabel: string;
  rowCount: number;
  hasSelectedDateData: boolean;
  tone: HomeWorkbenchStatus;
}

export interface HomeWorkbenchBoardEntry {
  key: "store" | "series" | "product";
  title: string;
  description: string;
  href: string;
  status: HomeWorkbenchStatus;
  statusLabel: string;
  metrics: HomeWorkbenchMetric[];
}

export interface HomeWorkbenchPriorityAction {
  key: string;
  title: string;
  description: string;
  href: string;
  tone: "blue" | "amber" | "rose" | "emerald" | "slate";
}

export interface HomeWorkbenchOverviewViewModel {
  status: HomeWorkbenchStatus;
  statusLabel: string;
  analysisTimestamp: string | null;
  selectedDate: string | null;
  availableDateCount: number;
  parsedSourceCount: number;
  sourceCount: number;
  dataQualityWarningCount: number;
  sourceStatuses: HomeWorkbenchSourceStatus[];
  boardEntries: HomeWorkbenchBoardEntry[];
  priorityActions: HomeWorkbenchPriorityAction[];
  productFocusSummary: {
    productCount: number;
    salesTopCount: number;
    hasAdCount: number;
    noAdCount: number;
    afterSalesFocusCount: number;
  };
  notices: string[];
  isEmpty: boolean;
}

interface BuildTmallHomeWorkbenchOverviewInput {
  analysis: TmallAnalysisDisplayResult | null;
  targetStorageState: TmallTargetStorageParseResult;
  seriesStorageState: TmallSeriesGroupStorageParseResult;
  selectedDate: string | null;
}

const SOURCE_LABELS: Record<TmallSourceType, string> = {
  business_product: "生意参谋商品",
  ad_product: "商品推广",
  ad_plan: "计划推广",
  after_sales: "售后",
};

const SOURCE_TYPES: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const STATUS_LABELS: Record<HomeWorkbenchStatus, string> = {
  normal: "正常",
  watch: "观察",
  risk: "风险",
  empty: "暂无数据",
};

const SOURCE_STATUS_LABELS: Record<TmallSourceStatus, string> = {
  parsed: "已解析",
  missing: "缺失",
  unknown: "未识别",
  error: "解析失败",
};

const formatMoney = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

const formatInteger = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "--"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);

const formatPercent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${(value * 100).toFixed(2)}%`;

const emptySourceStatuses = (): HomeWorkbenchSourceStatus[] =>
  SOURCE_TYPES.map((sourceType) => ({
    key: sourceType,
    label: SOURCE_LABELS[sourceType],
    status: "missing",
    statusLabel: SOURCE_STATUS_LABELS.missing,
    rowCount: 0,
    hasSelectedDateData: false,
    tone: "empty",
  }));

const emptyBoardEntries = (): HomeWorkbenchBoardEntry[] => [
  {
    key: "store",
    title: "店铺看板",
    description: "查看店铺整体经营、推广和售后状态。",
    href: "/store-board",
    status: "empty",
    statusLabel: STATUS_LABELS.empty,
    metrics: [
      { label: "GMV", value: "--" },
      { label: "商品访客数", value: "--" },
      { label: "支付买家数", value: "--" },
    ],
  },
  {
    key: "series",
    title: "系列看板",
    description: "查看已分组系列的经营和目标状态。",
    href: "/series-board",
    status: "empty",
    statusLabel: STATUS_LABELS.empty,
    metrics: [
      { label: "系列数量", value: "--" },
      { label: "系列目标风险", value: "--" },
      { label: "分组状态", value: "--" },
    ],
  },
  {
    key: "product",
    title: "宝贝看板",
    description: "查看重点商品、目标诊断和商品表运营筛选。",
    href: "/product-board",
    status: "empty",
    statusLabel: STATUS_LABELS.empty,
    metrics: [
      { label: "商品数", value: "--" },
      { label: "推广中商品", value: "--" },
      { label: "售后关注", value: "--" },
    ],
  },
];

const emptyWorkbench = (): HomeWorkbenchOverviewViewModel => ({
  status: "empty",
  statusLabel: STATUS_LABELS.empty,
  analysisTimestamp: null,
  selectedDate: null,
  availableDateCount: 0,
  parsedSourceCount: 0,
  sourceCount: SOURCE_TYPES.length,
  dataQualityWarningCount: 0,
  sourceStatuses: emptySourceStatuses(),
  boardEntries: emptyBoardEntries(),
  priorityActions: [
    {
      key: "upload-first",
      title: "先上传四源数据",
      description: "当前浏览器没有可用的天猫四源分析结果，请先进入数据上传页完成本地分析。",
      href: "/upload",
      tone: "blue",
    },
  ],
  productFocusSummary: {
    productCount: 0,
    salesTopCount: 0,
    hasAdCount: 0,
    noAdCount: 0,
    afterSalesFocusCount: 0,
  },
  notices: [
    "首页工作台只展示汇总入口和固定规则动作，不生成自动诊断报告。",
    "售后只使用安全聚合结果，不展示售后原始明细。",
  ],
  isEmpty: true,
});

const riskCountForScope = (
  items: TmallTargetDiagnosticItem[],
  scope: HomeWorkbenchBoardEntry["key"],
): number =>
  items.filter(
    (item) =>
      item.scope === scope &&
      (item.severity === "critical" || item.severity === "warning"),
  ).length;

const attentionCountForScope = (
  items: TmallTargetDiagnosticItem[],
  scope: HomeWorkbenchBoardEntry["key"],
): number =>
  items.filter((item) => item.scope === scope && item.severity !== "success").length;

const statusFromSource = (status: TmallSourceStatus): HomeWorkbenchStatus => {
  if (status === "parsed") return "normal";
  if (status === "missing") return "empty";
  return "risk";
};

const buildPriorityActions = ({
  parsedSourceCount,
  sourceCount,
  dataQualityWarningCount,
  storeRiskCount,
  seriesRiskCount,
  productRiskCount,
  productAfterSalesFocusCount,
  targetStorageState,
  totalTargetCount,
}: {
  parsedSourceCount: number;
  sourceCount: number;
  dataQualityWarningCount: number;
  storeRiskCount: number;
  seriesRiskCount: number;
  productRiskCount: number;
  productAfterSalesFocusCount: number;
  targetStorageState: TmallTargetStorageParseResult;
  totalTargetCount: number;
}): HomeWorkbenchPriorityAction[] => {
  const actions: HomeWorkbenchPriorityAction[] = [];

  if (parsedSourceCount < sourceCount) {
    actions.push({
      key: "complete-sources",
      title: "先补齐四源数据",
      description: "当前四源解析不完整，建议先到数据上传页补齐后再判断经营状态。",
      href: "/upload",
      tone: "rose",
    });
  }

  if (dataQualityWarningCount > 0) {
    actions.push({
      key: "check-data-quality",
      title: "查看数据质量提示",
      description: "当前分析结果存在数据质量提示，建议先确认字段、日期和关联质量。",
      href: "/upload",
      tone: "amber",
    });
  }

  if (targetStorageState.status === "corrupted") {
    actions.push({
      key: "target-storage-corrupted",
      title: "检查本地目标数据",
      description: "本地目标数据不可用，建议进入目标管理页检查后再查看目标完成情况。",
      href: "/targets",
      tone: "amber",
    });
  }

  if (storeRiskCount > 0) {
    actions.push({
      key: "store-target-risk",
      title: "优先查看店铺看板",
      description: "店铺目标存在风险或异常提示，建议先从店铺整体经营状态开始复核。",
      href: "/store-board",
      tone: "rose",
    });
  }

  if (seriesRiskCount > 0) {
    actions.push({
      key: "series-target-risk",
      title: "查看系列看板",
      description: "系列目标存在风险或需要关注，建议检查系列分组和系列指标。",
      href: "/series-board",
      tone: "amber",
    });
  }

  if (productRiskCount > 0 || productAfterSalesFocusCount > 0) {
    actions.push({
      key: "product-focus",
      title: "查看宝贝看板",
      description: "当前宝贝目标或售后聚合指标需要关注，建议进入宝贝看板定位重点商品。",
      href: "/product-board",
      tone: productRiskCount > 0 ? "amber" : "blue",
    });
  }

  if (targetStorageState.status === "empty" || totalTargetCount === 0) {
    actions.push({
      key: "create-targets",
      title: "补充经营目标",
      description: "当前暂无可用目标，可进入目标管理创建店铺、宝贝或系列目标。",
      href: "/targets",
      tone: "slate",
    });
  }

  if (actions.length === 0) {
    actions.push({
      key: "start-store-board",
      title: "先看店铺整体状态",
      description: "当前四源结果可用，建议先从店铺看板查看整体经营和推广状态。",
      href: "/store-board",
      tone: "emerald",
    });
  }

  return actions.slice(0, 5);
};

export const buildTmallHomeWorkbenchOverview = ({
  analysis,
  targetStorageState,
  seriesStorageState,
  selectedDate,
}: BuildTmallHomeWorkbenchOverviewInput): HomeWorkbenchOverviewViewModel => {
  if (!analysis) return emptyWorkbench();

  const availableDates = getTmallBusinessDates(analysis);
  const effectiveSelectedDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const homeOverview = buildTmallHomeOverview(analysis, effectiveSelectedDate);
  const productOverview = buildTmallProductBoardOverview(analysis, effectiveSelectedDate, null);
  const productFocus = buildTmallProductFocusEntry(productOverview);
  const sourceStatuses = SOURCE_TYPES.map<HomeWorkbenchSourceStatus>((sourceType) => {
    const source = homeOverview.sourceAvailability[sourceType];

    return {
      key: sourceType,
      label: SOURCE_LABELS[sourceType],
      status: source.status,
      statusLabel: SOURCE_STATUS_LABELS[source.status],
      rowCount: source.rowCount,
      hasSelectedDateData: source.hasSelectedDateData,
      tone: statusFromSource(source.status),
    };
  });
  const parsedSourceCount = sourceStatuses.filter((source) => source.status === "parsed").length;
  const sourceCount = sourceStatuses.length;
  const targetDiagnostics =
    targetStorageState.status === "corrupted"
      ? null
      : buildTmallTargetDiagnostics({
          targets: targetStorageState.targets,
          analysis,
          seriesGroups: seriesStorageState.status === "valid" ? seriesStorageState.groups : [],
          scope: "home",
          options: { maxItems: 50 },
        });
  const diagnosticItems = targetDiagnostics?.items ?? [];
  const storeRiskCount = riskCountForScope(diagnosticItems, "store");
  const seriesRiskCount = riskCountForScope(diagnosticItems, "series");
  const productRiskCount = riskCountForScope(diagnosticItems, "product");
  const seriesAttentionCount = attentionCountForScope(diagnosticItems, "series");
  const productAttentionCount = attentionCountForScope(diagnosticItems, "product");
  const seriesCount =
    seriesStorageState.status === "valid" ? seriesStorageState.groups.length : 0;
  const productRows = productOverview.productTableRows;
  const productFocusSummary = {
    productCount: productRows.length,
    salesTopCount: productFocus.salesTopProducts.length,
    hasAdCount: productRows.filter((row) => row.hasAdData).length,
    noAdCount: productRows.filter((row) => !row.hasAdData).length,
    afterSalesFocusCount: productRows.filter((row) => row.refundSuccessAmount > 0).length,
  };
  const storeStatus: HomeWorkbenchStatus =
    productRows.length === 0
      ? "empty"
      : storeRiskCount > 0 || targetStorageState.status === "corrupted"
        ? "risk"
        : parsedSourceCount < sourceCount || homeOverview.dataQualityWarnings.length > 0
          ? "watch"
          : "normal";
  const seriesStatus: HomeWorkbenchStatus =
    seriesStorageState.status === "corrupted"
      ? "risk"
      : seriesCount === 0
        ? "empty"
        : seriesRiskCount > 0
          ? "risk"
          : seriesAttentionCount > 0
            ? "watch"
            : "normal";
  const productStatus: HomeWorkbenchStatus =
    productFocusSummary.productCount === 0
      ? "empty"
      : productRiskCount > 0
        ? "risk"
        : productAttentionCount > 0 || productFocusSummary.afterSalesFocusCount > 0
          ? "watch"
          : "normal";
  const priorityActions = buildPriorityActions({
    parsedSourceCount,
    sourceCount,
    dataQualityWarningCount: homeOverview.dataQualityWarnings.length,
    storeRiskCount,
    seriesRiskCount,
    productRiskCount,
    productAfterSalesFocusCount: productFocusSummary.afterSalesFocusCount,
    targetStorageState,
    totalTargetCount: targetStorageState.targets.length,
  });
  const overallStatus: HomeWorkbenchStatus =
    parsedSourceCount < sourceCount ||
    targetStorageState.status === "corrupted" ||
    storeStatus === "risk" ||
    seriesStatus === "risk" ||
    productStatus === "risk"
      ? "risk"
      : homeOverview.dataQualityWarnings.length > 0 ||
          storeStatus === "watch" ||
          seriesStatus === "watch" ||
          productStatus === "watch"
        ? "watch"
        : "normal";

  return {
    status: overallStatus,
    statusLabel: STATUS_LABELS[overallStatus],
    analysisTimestamp: analysis.analysisTimestamp,
    selectedDate: homeOverview.selectedDate,
    availableDateCount: homeOverview.availableDates.length,
    parsedSourceCount,
    sourceCount,
    dataQualityWarningCount: homeOverview.dataQualityWarnings.length,
    sourceStatuses,
    boardEntries: [
      {
        key: "store",
        title: "店铺看板",
        description: "查看店铺整体经营、推广、售后和目标状态。",
        href: "/store-board",
        status: storeStatus,
        statusLabel: STATUS_LABELS[storeStatus],
        metrics: [
          { label: "GMV", value: formatMoney(homeOverview.metrics.gmv) },
          { label: "商品访客数", value: formatInteger(homeOverview.metrics.visitors) },
          { label: "支付买家数", value: formatInteger(homeOverview.metrics.paidBuyers) },
          { label: "支付转化率", value: formatPercent(homeOverview.metrics.conversionRate) },
          { label: "目标风险", value: formatInteger(storeRiskCount) },
        ],
      },
      {
        key: "series",
        title: "系列看板",
        description: "查看系列分组、系列目标和系列经营表现。",
        href: "/series-board",
        status: seriesStatus,
        statusLabel: STATUS_LABELS[seriesStatus],
        metrics: [
          { label: "系列数量", value: formatInteger(seriesCount) },
          { label: "系列目标风险", value: formatInteger(seriesRiskCount) },
          {
            label: "分组状态",
            value:
              seriesStorageState.status === "corrupted"
                ? "不可用"
                : seriesCount > 0
                  ? "已创建"
                  : "未创建",
          },
        ],
      },
      {
        key: "product",
        title: "宝贝看板",
        description: "查看重点商品、经营结论、目标诊断和商品表筛选。",
        href: "/product-board",
        status: productStatus,
        statusLabel: STATUS_LABELS[productStatus],
        metrics: [
          { label: "商品数", value: formatInteger(productFocusSummary.productCount) },
          { label: "销售 TOP", value: formatInteger(productFocusSummary.salesTopCount) },
          { label: "推广中商品", value: formatInteger(productFocusSummary.hasAdCount) },
          { label: "售后关注", value: formatInteger(productFocusSummary.afterSalesFocusCount) },
        ],
      },
    ],
    priorityActions,
    productFocusSummary,
    notices: [
      "首页工作台只展示汇总入口和固定规则动作，不生成自动诊断报告。",
      "宝贝推广摘要只使用商品推广报表，计划推广报表不参与单商品推广摘要。",
      "售后只使用安全聚合结果，不展示售后原始明细。",
    ],
    isEmpty: false,
  };
};
