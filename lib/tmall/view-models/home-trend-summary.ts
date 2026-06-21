import type { TmallAnalysisDisplayResult } from "../../../types/tmall";
import {
  buildStoreTrendSeries,
  buildTrendReadiness,
  getTrendDateCoverage,
} from "./trends";

export type TmallHomeTrendStatus = "missing" | "single_point" | "ready";
export type TmallHomeTrendSummaryTone = "neutral" | "warning" | "success" | "info";

export interface TmallHomeTrendSummaryCard {
  key: string;
  title: string;
  value: string | number | null;
  helper: string;
  tone: TmallHomeTrendSummaryTone;
}

export interface TmallHomeTrendSummaryViewModel {
  businessPointCount: number;
  adPlanPointCount: number;
  adProductPointCount: number;
  afterSalesApplyPointCount: number;
  businessTrendStatus: TmallHomeTrendStatus;
  adTrendStatus: TmallHomeTrendStatus;
  summaryCards: TmallHomeTrendSummaryCard[];
  notices: string[];
  primaryActionHref: string;
  primaryActionLabel: string;
}

const statusFromPointCount = (pointCount: number): TmallHomeTrendStatus => {
  if (pointCount <= 0) return "missing";
  if (pointCount === 1) return "single_point";
  return "ready";
};

const toneFromStatus = (
  status: TmallHomeTrendStatus,
  readyTone: TmallHomeTrendSummaryTone = "success",
): TmallHomeTrendSummaryTone => {
  if (status === "ready") return readyTone;
  if (status === "single_point") return "warning";
  return "neutral";
};

const pointCountLabel = (pointCount: number): string =>
  pointCount > 0 ? `${pointCount} 个日期点` : "暂无日期点";

const buildBusinessHelper = (status: TmallHomeTrendStatus): string => {
  if (status === "missing") return "暂无经营趋势数据";
  if (status === "single_point") return "经营数据只有 1 个日期点，只能查看当日值";
  return "经营数据可观察趋势";
};

const buildAdPlanHelper = (status: TmallHomeTrendStatus): string => {
  if (status === "missing") return "暂无计划推广趋势数据";
  if (status === "single_point") return "计划推广数据只有 1 个日期点";
  return "计划推广数据可观察趋势";
};

const buildAdProductHelper = (status: TmallHomeTrendStatus): string => {
  if (status === "missing") return "暂无商品推广趋势数据";
  if (status === "single_point") return "商品级趋势暂时为单点";
  return "商品级推广趋势可观察";
};

const buildAfterSalesHelper = (status: TmallHomeTrendStatus): string => {
  if (status === "missing") return "暂无售后申请趋势数据";
  if (status === "single_point") return "当前为单日售后观察";
  return "售后申请趋势可观察";
};

export const buildTmallHomeTrendSummary = (
  result: TmallAnalysisDisplayResult,
): TmallHomeTrendSummaryViewModel => {
  const coverage = getTrendDateCoverage(result);
  const readiness = buildTrendReadiness(result);
  const businessTrend = buildStoreTrendSeries(result, "gmv");
  const adSpendTrend = buildStoreTrendSeries(result, "adSpend");
  const adRoiTrend = buildStoreTrendSeries(result, "adRoi");

  const businessPointCount = businessTrend.pointCount;
  const adPlanPointCount = Math.max(adSpendTrend.pointCount, adRoiTrend.pointCount);
  const adProductPointCount = coverage.adProduct.dateCount;
  const afterSalesApplyPointCount = coverage.afterSalesApplyDate.dateCount;
  const businessTrendStatus = statusFromPointCount(businessPointCount);
  const adTrendStatus = statusFromPointCount(adPlanPointCount);
  const adProductTrendStatus = statusFromPointCount(adProductPointCount);
  const afterSalesTrendStatus = statusFromPointCount(afterSalesApplyPointCount);

  const notices = [
    "不同数据源日期范围可能不同。经营趋势只使用生意参谋商品数据，店铺推广趋势使用计划推广数据。系统不会用计划推广 7 日数据补齐经营趋势。",
  ];

  if (
    readiness.businessProductPointCount === 1 &&
    readiness.adPlanPointCount >= 2
  ) {
    notices.push("当前经营数据暂为单日，但计划推广数据已有多日，可先查看推广趋势。");
  }

  return {
    businessPointCount,
    adPlanPointCount,
    adProductPointCount,
    afterSalesApplyPointCount,
    businessTrendStatus,
    adTrendStatus,
    summaryCards: [
      {
        key: "business",
        title: "经营趋势状态",
        value: `经营数据 ${pointCountLabel(businessPointCount)}`,
        helper: buildBusinessHelper(businessTrendStatus),
        tone: toneFromStatus(businessTrendStatus),
      },
      {
        key: "ad_plan",
        title: "推广趋势状态",
        value: `计划推广数据 ${pointCountLabel(adPlanPointCount)}`,
        helper: buildAdPlanHelper(adTrendStatus),
        tone: toneFromStatus(adTrendStatus),
      },
      {
        key: "ad_product",
        title: "商品推广状态",
        value: `商品推广数据 ${pointCountLabel(adProductPointCount)}`,
        helper: buildAdProductHelper(adProductTrendStatus),
        tone: toneFromStatus(adProductTrendStatus, "info"),
      },
      {
        key: "after_sales",
        title: "售后趋势状态",
        value: `售后申请数据 ${pointCountLabel(afterSalesApplyPointCount)}`,
        helper: buildAfterSalesHelper(afterSalesTrendStatus),
        tone: toneFromStatus(afterSalesTrendStatus, "info"),
      },
    ],
    notices,
    primaryActionHref: "/store-board",
    primaryActionLabel: "查看店铺趋势",
  };
};
