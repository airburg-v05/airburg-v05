import { getTmallBusinessDates } from "./home-overview";
import type {
  AfterSalesProductSummary,
  TmallAnalysisDisplayResult,
  TmallSourceStatus,
} from "../../../types/tmall";

export type RawDataSafeSourceKey =
  | "business_product"
  | "ad_product"
  | "ad_plan"
  | "after_sales_safe";

export interface RawDataSafeColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface RawDataSafeRow {
  id: string;
  sourceKey: RawDataSafeSourceKey;
  searchText: string;
  cells: Record<string, string>;
}

export interface RawDataSafeSourceTab {
  key: RawDataSafeSourceKey;
  label: string;
  statusLabel: string;
  count: number;
  available: boolean;
}

export interface RawDataSafeInspectionViewModel {
  status: "normal" | "watch" | "risk" | "empty";
  statusLabel: string;
  analysisTimestamp: string | null;
  selectedDate: string | null;
  availableDates: string[];
  sourceTabs: RawDataSafeSourceTab[];
  columnsBySource: Record<RawDataSafeSourceKey, RawDataSafeColumn[]>;
  rowsBySource: Record<RawDataSafeSourceKey, RawDataSafeRow[]>;
  dataQualityWarningCount: number;
  safeWarnings: string[];
  notices: string[];
  isEmpty: boolean;
}

export type RawDataSafeAnalysisStatus = "loading" | "empty" | "corrupted" | "valid";

interface BuildTmallRawDataSafeInspectionInput {
  analysisStatus: RawDataSafeAnalysisStatus;
  analysis: TmallAnalysisDisplayResult | null;
  selectedDate: string | null;
}

interface FilterRawDataSafeRowsInput {
  rows: RawDataSafeRow[];
  searchTerm: string;
}

const SOURCE_KEYS: RawDataSafeSourceKey[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales_safe",
];

const SOURCE_LABELS: Record<RawDataSafeSourceKey, string> = {
  business_product: "生意参谋商品",
  ad_product: "商品推广",
  ad_plan: "计划推广",
  after_sales_safe: "售后安全汇总",
};

const SENSITIVE_WARNING_KEYWORDS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
];

const columnsBySource: Record<RawDataSafeSourceKey, RawDataSafeColumn[]> = {
  business_product: [
    { key: "date", label: "日期" },
    { key: "productId", label: "商品 ID" },
    { key: "productName", label: "商品名称" },
    { key: "gmv", label: "GMV", align: "right" },
    { key: "gsv", label: "GSV", align: "right" },
    { key: "visitors", label: "访客", align: "right" },
    { key: "paidBuyers", label: "支付买家", align: "right" },
    { key: "conversionRate", label: "支付转化率", align: "right" },
    { key: "refundSuccessAmount", label: "成功退款金额", align: "right" },
  ],
  ad_product: [
    { key: "date", label: "日期" },
    { key: "productId", label: "商品 ID" },
    { key: "productName", label: "商品名称" },
    { key: "adSpend", label: "推广花费", align: "right" },
    { key: "transactionAmount", label: "成交金额", align: "right" },
    { key: "roi", label: "ROI", align: "right" },
    { key: "clicks", label: "点击量", align: "right" },
    { key: "impressions", label: "展现量", align: "right" },
  ],
  ad_plan: [
    { key: "date", label: "日期" },
    { key: "planId", label: "计划 ID" },
    { key: "planName", label: "计划名称" },
    { key: "adSpend", label: "推广花费", align: "right" },
    { key: "transactionAmount", label: "成交金额", align: "right" },
    { key: "roi", label: "ROI", align: "right" },
    { key: "clicks", label: "点击量", align: "right" },
    { key: "impressions", label: "展现量", align: "right" },
  ],
  after_sales_safe: [
    { key: "date", label: "日期" },
    { key: "productId", label: "商品 ID" },
    { key: "productName", label: "商品名称" },
    { key: "refundApplyCount", label: "售后申请数", align: "right" },
    { key: "refundSuccessCount", label: "退款成功数", align: "right" },
    { key: "refundSuccessAmount", label: "退款成功金额", align: "right" },
    { key: "pendingCount", label: "待处理数", align: "right" },
  ],
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

const formatRoi = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(2)} 倍`;

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const productLabel = (productId: string, productName: string | null | undefined): string =>
  productName?.trim() || `商品 ${productId}`;

const planLabel = (planId: string, planName: string | null | undefined): string =>
  planName?.trim() || `计划 ${planId}`;

const rowSearchText = (cells: Record<string, string>): string =>
  Object.values(cells).join(" ").toLowerCase();

const sanitizeWarning = (warning: string): string => {
  const trimmed = warning.trim();
  if (!trimmed) return "";

  if (SENSITIVE_WARNING_KEYWORDS.some((keyword) => trimmed.includes(keyword))) {
    return "检测到一条数据质量提示，涉及敏感明细，已隐藏具体内容。";
  }

  return trimmed;
};

const safeWarnings = (warnings: string[]): string[] =>
  warnings
    .map(sanitizeWarning)
    .filter(Boolean)
    .slice(0, 5);

const emptyRowsBySource = (): Record<RawDataSafeSourceKey, RawDataSafeRow[]> => ({
  business_product: [],
  ad_product: [],
  ad_plan: [],
  after_sales_safe: [],
});

const emptySourceTabs = (): RawDataSafeSourceTab[] =>
  SOURCE_KEYS.map((key) => ({
    key,
    label: SOURCE_LABELS[key],
    statusLabel: "暂无",
    count: 0,
    available: false,
  }));

const productNameMap = (analysis: TmallAnalysisDisplayResult): Map<string, string> => {
  const map = new Map<string, string>();
  analysis.productDailyFacts.forEach((fact) => {
    if (!map.has(fact.productId)) {
      map.set(fact.productId, productLabel(fact.productId, fact.productName));
    }
  });
  return map;
};

const hasAfterSalesDateData = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): boolean => {
  if (!selectedDate) return false;
  return (
    analysis.afterSalesAggregates.byApplyDate.some((item) => item.date === selectedDate) ||
    analysis.afterSalesAggregates.bySuccessDate.some((item) => item.date === selectedDate) ||
    analysis.afterSalesAggregates.byPaymentDate.some((item) => item.date === selectedDate)
  );
};

const sourceStatusLabel = ({
  status,
  count,
}: {
  status: TmallSourceStatus;
  count: number;
}): string => {
  if (status === "parsed" && count > 0) return "已解析";
  if (status === "parsed") return "无数据";
  if (status === "missing") return "缺失";
  if (status === "unknown") return "未识别";
  return "解析失败";
};

const buildBusinessRows = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): RawDataSafeRow[] => {
  if (!selectedDate) return [];

  return analysis.productDailyFacts
    .filter((fact) => fact.date === selectedDate)
    .slice()
    .sort((first, second) => second.gmv - first.gmv)
    .map((fact) => {
      const cells = {
        date: fact.date,
        productId: fact.productId,
        productName: productLabel(fact.productId, fact.productName),
        gmv: formatMoney(fact.gmv),
        gsv: formatMoney(fact.gsv),
        visitors: formatInteger(fact.visitors),
        paidBuyers: formatInteger(fact.paidBuyers),
        conversionRate: formatPercent(fact.conversionRate),
        refundSuccessAmount: formatMoney(fact.refundSuccessAmount),
      };

      return {
        id: `business_product-${fact.date}-${fact.productId}`,
        sourceKey: "business_product",
        searchText: rowSearchText(cells),
        cells,
      };
    });
};

const buildAdProductRows = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): RawDataSafeRow[] => {
  if (!selectedDate) return [];

  const names = productNameMap(analysis);

  return analysis.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate)
    .slice()
    .sort((first, second) => second.adSpend - first.adSpend)
    .map((fact, index) => {
      const roi = fact.roi ?? safeDivide(fact.adTransactionAmount, fact.adSpend);
      const cells = {
        date: fact.date,
        productId: fact.productId,
        productName: names.get(fact.productId) ?? productLabel(fact.productId, null),
        adSpend: formatMoney(fact.adSpend),
        transactionAmount: formatMoney(fact.adTransactionAmount),
        roi: formatRoi(roi),
        clicks: formatInteger(fact.clicks),
        impressions: formatInteger(fact.impressions),
      };

      return {
        id: `ad_product-${fact.date}-${fact.productId}-${index}`,
        sourceKey: "ad_product",
        searchText: rowSearchText(cells),
        cells,
      };
    });
};

const buildAdPlanRows = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): RawDataSafeRow[] => {
  if (!selectedDate) return [];

  return analysis.adPlanDailyFacts
    .filter((fact) => fact.date === selectedDate)
    .slice()
    .sort((first, second) => second.adSpend - first.adSpend)
    .map((fact, index) => {
      const cells = {
        date: fact.date,
        planId: fact.planId,
        planName: planLabel(fact.planId, fact.planName),
        adSpend: formatMoney(fact.adSpend),
        transactionAmount: formatMoney(fact.transactionAmount),
        roi: formatRoi(fact.roi ?? safeDivide(fact.transactionAmount, fact.adSpend)),
        clicks: formatInteger(fact.clicks),
        impressions: formatInteger(fact.impressions),
      };

      return {
        id: `ad_plan-${fact.date}-${fact.planId}-${index}`,
        sourceKey: "ad_plan",
        searchText: rowSearchText(cells),
        cells,
      };
    });
};

const buildAfterSalesRows = (
  analysis: TmallAnalysisDisplayResult,
  selectedDate: string | null,
): RawDataSafeRow[] => {
  if (!selectedDate || !hasAfterSalesDateData(analysis, selectedDate)) return [];

  const names = productNameMap(analysis);
  const summaries = analysis.afterSalesAggregates.productSummary;

  return summaries
    .slice()
    .sort(
      (first: AfterSalesProductSummary, second: AfterSalesProductSummary) =>
        second.refundSuccessTotalAmount - first.refundSuccessTotalAmount,
    )
    .map((summary) => {
      const cells = {
        date: selectedDate,
        productId: summary.productId,
        productName: names.get(summary.productId) ?? productLabel(summary.productId, null),
        refundApplyCount: formatInteger(summary.refundApplyCount),
        refundSuccessCount: formatInteger(summary.refundSuccessCount),
        refundSuccessAmount: formatMoney(summary.refundSuccessTotalAmount),
        pendingCount: formatInteger(summary.pendingCount),
      };

      return {
        id: `after_sales_safe-${selectedDate}-${summary.productId}`,
        sourceKey: "after_sales_safe",
        searchText: rowSearchText(cells),
        cells,
      };
    });
};

const sourceStatus = (
  analysis: TmallAnalysisDisplayResult,
  sourceKey: RawDataSafeSourceKey,
): TmallSourceStatus => {
  if (sourceKey === "after_sales_safe") return analysis.sourceHealth.after_sales.status;
  return analysis.sourceHealth[sourceKey].status;
};

const buildSourceTabs = (
  analysis: TmallAnalysisDisplayResult,
  rowsBySource: Record<RawDataSafeSourceKey, RawDataSafeRow[]>,
): RawDataSafeSourceTab[] =>
  SOURCE_KEYS.map((key) => {
    const status = sourceStatus(analysis, key);
    const count = rowsBySource[key].length;

    return {
      key,
      label: SOURCE_LABELS[key],
      statusLabel: sourceStatusLabel({ status, count }),
      count,
      available: status === "parsed" && count > 0,
    };
  });

export const buildTmallRawDataSafeInspection = ({
  analysisStatus,
  analysis,
  selectedDate,
}: BuildTmallRawDataSafeInspectionInput): RawDataSafeInspectionViewModel => {
  if (analysisStatus === "loading") {
    return {
      status: "empty",
      statusLabel: "正在读取",
      analysisTimestamp: null,
      selectedDate: null,
      availableDates: [],
      sourceTabs: emptySourceTabs(),
      columnsBySource,
      rowsBySource: emptyRowsBySource(),
      dataQualityWarningCount: 0,
      safeWarnings: [],
      notices: ["正在读取当前浏览器保存的四源聚合结果。"],
      isEmpty: true,
    };
  }

  if (analysisStatus === "empty") {
    return {
      status: "empty",
      statusLabel: "暂无结果",
      analysisTimestamp: null,
      selectedDate: null,
      availableDates: [],
      sourceTabs: emptySourceTabs(),
      columnsBySource,
      rowsBySource: emptyRowsBySource(),
      dataQualityWarningCount: 0,
      safeWarnings: [],
      notices: ["请先在上传页完成天猫四源本地分析。"],
      isEmpty: true,
    };
  }

  if (analysisStatus === "corrupted" || !analysis) {
    return {
      status: "risk",
      statusLabel: "结果损坏",
      analysisTimestamp: null,
      selectedDate: null,
      availableDates: [],
      sourceTabs: emptySourceTabs(),
      columnsBySource,
      rowsBySource: emptyRowsBySource(),
      dataQualityWarningCount: 0,
      safeWarnings: [],
      notices: ["本地分析结果已损坏，页面不会渲染任何原始数据。请回到上传页重新分析。"],
      isEmpty: false,
    };
  }

  const availableDates = getTmallBusinessDates(analysis);
  const effectiveDate =
    selectedDate && availableDates.includes(selectedDate)
      ? selectedDate
      : availableDates[0] ?? null;
  const rowsBySource = {
    business_product: buildBusinessRows(analysis, effectiveDate),
    ad_product: buildAdProductRows(analysis, effectiveDate),
    ad_plan: buildAdPlanRows(analysis, effectiveDate),
    after_sales_safe: buildAfterSalesRows(analysis, effectiveDate),
  };
  const sourceTabs = buildSourceTabs(analysis, rowsBySource);
  const parsedSourceCount = sourceTabs.filter((tab) =>
    tab.statusLabel === "已解析" || tab.statusLabel === "无数据",
  ).length;
  const hasSourceGap = parsedSourceCount < SOURCE_KEYS.length;
  const hasWarnings = analysis.dataQualityWarnings.length > 0;

  return {
    status: hasSourceGap ? "risk" : hasWarnings ? "watch" : "normal",
    statusLabel: hasSourceGap ? "四源不完整" : hasWarnings ? "存在提示" : "结果可用",
    analysisTimestamp: analysis.analysisTimestamp,
    selectedDate: effectiveDate,
    availableDates,
    sourceTabs,
    columnsBySource,
    rowsBySource,
    dataQualityWarningCount: analysis.dataQualityWarnings.length,
    safeWarnings: safeWarnings(analysis.dataQualityWarnings),
    notices: [
      "本页只展示安全事实表和售后聚合汇总，不展示售后原始明细。",
      "日期、来源和搜索筛选只影响当前页面展示，不会修改本地存储结果。",
    ],
    isEmpty: false,
  };
};

export const filterRawDataSafeRows = ({
  rows,
  searchTerm,
}: FilterRawDataSafeRowsInput): RawDataSafeRow[] => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) return rows;

  return rows.filter((row) => row.searchText.includes(normalizedSearch));
};
