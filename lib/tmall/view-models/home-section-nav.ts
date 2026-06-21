export type TmallHomeSectionId =
  | "home-workbench-overview"
  | "home-data-context"
  | "home-trend-summary"
  | "home-target-summary"
  | "home-target-diagnostics"
  | "home-reconciliation"
  | "home-metric-grid"
  | "home-product-ranking"
  | "home-risk-list"
  | "home-quality-summary";

export interface TmallHomeSectionNavItem {
  key: TmallHomeSectionId;
  label: string;
  sectionId: TmallHomeSectionId;
  href: `#${TmallHomeSectionId}`;
  available: boolean;
}

export interface TmallHomeSectionNavViewModel {
  items: TmallHomeSectionNavItem[];
  visibleItems: TmallHomeSectionNavItem[];
  helperText: string;
}

interface BuildTmallHomeSectionNavInput {
  hasTrendSummary: boolean;
  hasTargetSummary: boolean;
  hasTargetDiagnostics: boolean;
  hasReconciliation: boolean;
  hasMetricGrid: boolean;
  hasProductRanking: boolean;
  hasRiskList: boolean;
  hasQualitySummary: boolean;
}

const HOME_SECTIONS: Array<{
  key: TmallHomeSectionId;
  label: string;
}> = [
  { key: "home-workbench-overview", label: "工作台总览" },
  { key: "home-data-context", label: "数据上下文" },
  { key: "home-trend-summary", label: "趋势概览" },
  { key: "home-target-summary", label: "目标完成" },
  { key: "home-target-diagnostics", label: "目标诊断" },
  { key: "home-reconciliation", label: "对账说明" },
  { key: "home-metric-grid", label: "核心指标" },
  { key: "home-product-ranking", label: "商品排行" },
  { key: "home-risk-list", label: "风险提示" },
  { key: "home-quality-summary", label: "数据质量" },
];

export const HOME_SECTION_IDS: TmallHomeSectionId[] = HOME_SECTIONS.map(
  (section) => section.key,
);

export const buildTmallHomeSectionNav = ({
  hasTrendSummary,
  hasTargetSummary,
  hasTargetDiagnostics,
  hasReconciliation,
  hasMetricGrid,
  hasProductRanking,
  hasRiskList,
  hasQualitySummary,
}: BuildTmallHomeSectionNavInput): TmallHomeSectionNavViewModel => {
  const availability: Record<TmallHomeSectionId, boolean> = {
    "home-workbench-overview": true,
    "home-data-context": true,
    "home-trend-summary": hasTrendSummary,
    "home-target-summary": hasTargetSummary,
    "home-target-diagnostics": hasTargetDiagnostics,
    "home-reconciliation": hasReconciliation,
    "home-metric-grid": hasMetricGrid,
    "home-product-ranking": hasProductRanking,
    "home-risk-list": hasRiskList,
    "home-quality-summary": hasQualitySummary,
  };

  const items = HOME_SECTIONS.map<TmallHomeSectionNavItem>((section) => ({
    key: section.key,
    label: section.label,
    sectionId: section.key,
    href: `#${section.key}`,
    available: availability[section.key],
  }));

  return {
    items,
    visibleItems: items.filter((item) => item.available),
    helperText: "切换经营日期后，首页总览和下方模块会按同一日期口径刷新。",
  };
};
