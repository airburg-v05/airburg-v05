import type {
  TmallProductBoardOverview,
  TmallProductMetric,
} from "./product-board";
import type { TmallProductTrendSectionViewModel } from "./product-trend-section";
import type {
  TmallTargetDiagnosticCategory,
  TmallTargetDiagnosticSummary,
} from "./target-diagnostics";

export type TmallProductOperatingInsightStatus =
  | "critical"
  | "risk"
  | "watch"
  | "normal"
  | "empty";

export type TmallProductOperatingInsightModuleKey =
  | "sales"
  | "traffic_conversion"
  | "ad_efficiency"
  | "after_sales"
  | "target_completion";

export interface TmallProductOperatingInsightModule {
  key: TmallProductOperatingInsightModuleKey;
  label: string;
  status: TmallProductOperatingInsightStatus;
  statusLabel: string;
  description: string;
}

export interface TmallProductOperatingInsightsViewModel {
  productId: string | null;
  status: TmallProductOperatingInsightStatus;
  statusLabel: string;
  conclusion: string;
  modules: TmallProductOperatingInsightModule[];
  priorityActions: string[];
  notices: string[];
  isEmpty: boolean;
}

interface BuildTmallProductOperatingInsightsInput {
  overview: TmallProductBoardOverview | null;
  targetDiagnostics: TmallTargetDiagnosticSummary | null;
  trendSection: TmallProductTrendSectionViewModel | null;
}

const EMPTY_INSIGHTS: TmallProductOperatingInsightsViewModel = {
  productId: null,
  status: "empty",
  statusLabel: "暂无数据",
  conclusion: "当前商品数据不足，暂无法生成经营结论。",
  modules: [],
  priorityActions: [],
  notices: [
    "经营结论卡只基于当前商品已上传并安全聚合的数据生成。",
    "规则化结论仅使用固定规则，不生成预测。",
  ],
  isEmpty: true,
};

const STATUS_LABELS: Record<TmallProductOperatingInsightStatus, string> = {
  critical: "严重",
  risk: "风险",
  watch: "观察",
  normal: "正常",
  empty: "暂无数据",
};

const safeMetricValue = (
  metrics: TmallProductMetric[],
  key: string,
): number | null => {
  const value = metrics.find((metric) => metric.key === key)?.value ?? null;
  return value !== null && Number.isFinite(value) ? value : null;
};

const hasDiagnosticCategory = (
  targetDiagnostics: TmallTargetDiagnosticSummary | null,
  categories: TmallTargetDiagnosticCategory[],
): boolean =>
  !!targetDiagnostics?.items.some((item) =>
    categories.includes(item.category),
  );

const hasAdDiagnosticRisk = (
  targetDiagnostics: TmallTargetDiagnosticSummary | null,
): boolean =>
  hasDiagnosticCategory(targetDiagnostics, [
    "ad_spend",
    "ad_roi",
    "ad_spend_rate",
  ]);

const hasSalesDiagnosticRisk = (
  targetDiagnostics: TmallTargetDiagnosticSummary | null,
): boolean =>
  hasDiagnosticCategory(targetDiagnostics, [
    "sales",
    "traffic",
    "conversion",
  ]);

const hasSinglePointTrend = (
  trendSection: TmallProductTrendSectionViewModel | null,
): boolean =>
  !!trendSection?.cards.some((card) => card.pointCount === 1);

const hasAfterSalesActivity = (
  overview: TmallProductBoardOverview,
): boolean => {
  const summary = overview.afterSalesSummary;
  if (!summary) return false;

  return [
    summary.refundApplyCount,
    summary.refundSuccessCount,
    summary.refundApplyAmount,
    summary.refundSuccessTotalAmount,
    summary.pendingCount,
    summary.overduePendingCount,
    summary.customerServiceInterventionCount,
  ].some((value) => Number.isFinite(value) && value > 0);
};

const overallStatusFromInputs = ({
  targetDiagnostics,
  afterSalesNeedsAttention,
}: {
  targetDiagnostics: TmallTargetDiagnosticSummary | null;
  afterSalesNeedsAttention: boolean;
}): TmallProductOperatingInsightStatus => {
  if ((targetDiagnostics?.criticalCount ?? 0) > 0) return "critical";
  if ((targetDiagnostics?.warningCount ?? 0) > 0) return "risk";
  if ((targetDiagnostics?.infoCount ?? 0) > 0) return "watch";
  if (afterSalesNeedsAttention) return "watch";
  if ((targetDiagnostics?.successCount ?? 0) > 0) return "normal";
  return "watch";
};

const buildConclusion = ({
  status,
  hasAdData,
  afterSalesNeedsAttention,
  singlePointTrend,
  targetDiagnostics,
}: {
  status: TmallProductOperatingInsightStatus;
  hasAdData: boolean;
  afterSalesNeedsAttention: boolean;
  singlePointTrend: boolean;
  targetDiagnostics: TmallTargetDiagnosticSummary | null;
}): string => {
  if (status === "critical") {
    return "当前商品存在目标值异常或严重目标问题，建议先处理目标数据和关键目标风险，再判断经营表现。";
  }

  if (status === "risk" && hasAdDiagnosticRisk(targetDiagnostics)) {
    return "当前商品目标存在风险，建议优先核对推广花费和 ROI，判断投放效率是否需要调整。";
  }

  if (status === "risk") {
    return "当前商品目标存在风险，建议先核对销售、流量和转化承接，再判断是否需要调整运营动作。";
  }

  if (!hasAdData) {
    return "当前商品暂无商品推广数据，推广相关指标不按 0 计算；请先基于经营和售后数据判断。";
  }

  if (afterSalesNeedsAttention) {
    return "当前商品已有售后申请或退款完成记录，建议关注售后结构对当期 GSV 的影响。";
  }

  if (singlePointTrend) {
    return "当前商品已有单日数据，可先查看当日经营、推广和目标完成情况；趋势部分仅展示日期点，不做趋势判断。";
  }

  if (status === "normal") {
    return "当前商品暂无明显目标风险，可继续观察经营、推广和售后指标。";
  }

  return "当前商品处于观察状态，建议结合经营、推广、售后和目标完成情况继续复核。";
};

const buildModules = ({
  overview,
  targetDiagnostics,
  hasAdData,
  afterSalesNeedsAttention,
}: {
  overview: TmallProductBoardOverview;
  targetDiagnostics: TmallTargetDiagnosticSummary | null;
  hasAdData: boolean;
  afterSalesNeedsAttention: boolean;
}): TmallProductOperatingInsightModule[] => {
  const gmv = safeMetricValue(overview.businessMetrics, "gmv");
  const visitors = safeMetricValue(overview.businessMetrics, "visitors");
  const conversionRate = safeMetricValue(overview.businessMetrics, "conversionRate");
  const adSpend = safeMetricValue(overview.adMetrics, "adSpend");
  const adRoi = safeMetricValue(overview.adMetrics, "roi");
  const salesRisk = hasDiagnosticCategory(targetDiagnostics, ["sales"]);
  const trafficRisk = hasDiagnosticCategory(targetDiagnostics, [
    "traffic",
    "conversion",
  ]);
  const adRisk = hasAdDiagnosticRisk(targetDiagnostics);

  return [
    {
      key: "sales",
      label: "销售表现",
      status: salesRisk ? "risk" : gmv === null ? "empty" : "normal",
      statusLabel: salesRisk ? "需关注" : gmv === null ? "暂无数据" : "可观察",
      description: salesRisk
        ? "销售相关目标存在风险，建议查看 GMV、GSV 和退款影响。"
        : gmv === null
          ? "当前商品暂无可用销售数据。"
          : "当前商品已有销售数据，可结合目标完成情况继续观察。",
    },
    {
      key: "traffic_conversion",
      label: "流量转化",
      status: trafficRisk ? "risk" : visitors === null ? "empty" : "normal",
      statusLabel: trafficRisk ? "需关注" : visitors === null ? "暂无数据" : "可观察",
      description: trafficRisk
        ? "流量或转化相关目标存在风险，建议拆看访客、支付买家和支付转化率。"
        : visitors === null
          ? "当前商品暂无访客数据。"
          : conversionRate === null
            ? "当前商品已有访客数据，支付转化率暂不可计算。"
            : "当前商品已有访客和转化数据，可继续结合销售目标复核。",
    },
    {
      key: "ad_efficiency",
      label: "推广效率",
      status: !hasAdData ? "empty" : adRisk ? "risk" : "normal",
      statusLabel: !hasAdData ? "暂无推广数据" : adRisk ? "需关注" : "可观察",
      description: !hasAdData
        ? "当前商品暂无商品推广数据，推广花费和 ROI 不按 0 计算。"
        : adRisk
          ? "推广相关目标存在风险，建议查看推广花费、成交金额和 ROI。"
          : adSpend === null || adRoi === null
            ? "当前商品有推广记录，部分推广效率指标暂不可计算。"
            : "当前商品已有推广花费和 ROI 数据，可继续观察投放效率。",
    },
    {
      key: "after_sales",
      label: "售后风险",
      status: afterSalesNeedsAttention ? "watch" : "normal",
      statusLabel: afterSalesNeedsAttention ? "需关注" : "可观察",
      description: afterSalesNeedsAttention
        ? "当前商品存在售后申请或退款完成记录，建议查看售后结构，但不直接判定为异常。"
        : "当前商品暂无需要特别提示的售后汇总记录。",
    },
    {
      key: "target_completion",
      label: "目标完成",
      status: overallStatusFromInputs({
        targetDiagnostics,
        afterSalesNeedsAttention: false,
      }),
      statusLabel:
        targetDiagnostics && targetDiagnostics.totalDiagnosticCount > 0
          ? STATUS_LABELS[
              overallStatusFromInputs({
                targetDiagnostics,
                afterSalesNeedsAttention: false,
              })
            ]
          : "暂无目标",
      description:
        targetDiagnostics && targetDiagnostics.totalDiagnosticCount > 0
          ? "当前商品目标诊断已生成，可查看目标完成情况和诊断提示。"
          : "当前商品暂无可用于诊断的宝贝目标。",
    },
  ];
};

const uniqueFirstThree = (actions: string[]): string[] => {
  const unique = [...new Set(actions.map((item) => item.trim()).filter(Boolean))];
  return unique.slice(0, 3);
};

const buildPriorityActions = ({
  targetDiagnostics,
  hasAdData,
  afterSalesNeedsAttention,
  singlePointTrend,
}: {
  targetDiagnostics: TmallTargetDiagnosticSummary | null;
  hasAdData: boolean;
  afterSalesNeedsAttention: boolean;
  singlePointTrend: boolean;
}): string[] => {
  const actions: string[] = [];

  if ((targetDiagnostics?.criticalCount ?? 0) > 0) {
    actions.push("先到目标管理检查目标值异常或关键目标风险，再回到宝贝看板复核。");
  }

  if (hasAdDiagnosticRisk(targetDiagnostics)) {
    actions.push("优先查看推广花费和 ROI，判断是否存在高花费低产出。");
  }

  if (hasSalesDiagnosticRisk(targetDiagnostics)) {
    actions.push("检查访客、支付买家和转化承接，区分流量不足还是转化不足。");
  }

  if (!hasAdData) {
    actions.push("当前商品暂无商品推广数据，推广花费和 ROI 保持 --，不要按 0 解读。");
  }

  if (afterSalesNeedsAttention) {
    actions.push("查看退款金额和退款订单，判断是否影响当期 GSV。");
  }

  if (singlePointTrend) {
    actions.push("当前趋势只有单日数据，先按当日指标观察，不解读为变化趋势。");
  }

  if (actions.length === 0) {
    actions.push("继续观察当前商品目标完成、推广效率和售后记录。");
  }

  return uniqueFirstThree(actions);
};

const buildNotices = ({
  hasAdData,
  singlePointTrend,
}: {
  hasAdData: boolean;
  singlePointTrend: boolean;
}): string[] => {
  const notices = [
    "经营结论卡为规则化摘要，仅使用固定规则，不生成预测。",
    "结论只基于当前商品 selectedProductId 对应的安全聚合数据。",
  ];

  if (!hasAdData) {
    notices.push("无商品推广数据时，推广花费和 ROI 显示为 --，不按 0 计算。");
  }

  if (singlePointTrend) {
    notices.push("当前商品趋势只有 1 个日期点时，只展示当日值，不解释为趋势。");
  }

  return notices;
};

export const buildTmallProductOperatingInsights = ({
  overview,
  targetDiagnostics,
  trendSection,
}: BuildTmallProductOperatingInsightsInput): TmallProductOperatingInsightsViewModel => {
  if (!overview?.selectedProductId || !overview.selectedProduct) {
    return EMPTY_INSIGHTS;
  }

  const hasAdData = overview.selectedProduct.hasAdData;
  const afterSalesNeedsAttention = hasAfterSalesActivity(overview);
  const singlePointTrend = hasSinglePointTrend(trendSection);
  const status = overallStatusFromInputs({
    targetDiagnostics,
    afterSalesNeedsAttention,
  });

  return {
    productId: overview.selectedProductId,
    status,
    statusLabel: STATUS_LABELS[status],
    conclusion: buildConclusion({
      status,
      hasAdData,
      afterSalesNeedsAttention,
      singlePointTrend,
      targetDiagnostics,
    }),
    modules: buildModules({
      overview,
      targetDiagnostics,
      hasAdData,
      afterSalesNeedsAttention,
    }),
    priorityActions: buildPriorityActions({
      targetDiagnostics,
      hasAdData,
      afterSalesNeedsAttention,
      singlePointTrend,
    }),
    notices: buildNotices({ hasAdData, singlePointTrend }),
    isEmpty: false,
  };
};
