export type TmallProductBoardSectionId =
  | "product-focus-entry"
  | "product-summary"
  | "product-operating-insights"
  | "product-target-summary"
  | "product-target-diagnostics"
  | "product-trends"
  | "product-business-metrics"
  | "product-ad-metrics"
  | "product-audience"
  | "product-after-sales"
  | "product-table";

export interface TmallProductBoardSectionNavItem {
  key: TmallProductBoardSectionId;
  label: string;
  sectionId: TmallProductBoardSectionId;
  available: boolean;
}

export interface TmallProductBoardSectionNavViewModel {
  items: TmallProductBoardSectionNavItem[];
  visibleItems: TmallProductBoardSectionNavItem[];
  helperText: string;
}

interface BuildTmallProductBoardSectionNavInput {
  hasTrendSection: boolean;
}

const PRODUCT_BOARD_SECTIONS: Array<{
  key: TmallProductBoardSectionId;
  label: string;
}> = [
  { key: "product-focus-entry", label: "重点商品" },
  { key: "product-summary", label: "商品摘要" },
  { key: "product-operating-insights", label: "经营结论" },
  { key: "product-target-summary", label: "目标完成" },
  { key: "product-target-diagnostics", label: "目标诊断" },
  { key: "product-trends", label: "趋势分析" },
  { key: "product-business-metrics", label: "经营指标" },
  { key: "product-ad-metrics", label: "推广指标" },
  { key: "product-audience", label: "人群获客" },
  { key: "product-after-sales", label: "售后表现" },
  { key: "product-table", label: "商品列表" },
];

export const PRODUCT_BOARD_SECTION_IDS: TmallProductBoardSectionId[] =
  PRODUCT_BOARD_SECTIONS.map((section) => section.key);

export const buildTmallProductBoardSectionNav = ({
  hasTrendSection,
}: BuildTmallProductBoardSectionNavInput): TmallProductBoardSectionNavViewModel => {
  const items = PRODUCT_BOARD_SECTIONS.map<TmallProductBoardSectionNavItem>((section) => ({
    key: section.key,
    label: section.label,
    sectionId: section.key,
    available: section.key !== "product-trends" || hasTrendSection,
  }));

  return {
    items,
    visibleItems: items.filter((item) => item.available),
    helperText:
      "建议先通过重点商品入口或商品列表筛选确定要看的商品，再查看经营结论、目标诊断和趋势变化。",
  };
};
