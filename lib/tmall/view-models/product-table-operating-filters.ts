import type { TmallProductTableRow } from "./product-board";

export type TmallProductTableOperatingFilterKey =
  | "all"
  | "sales_top"
  | "has_ad"
  | "no_ad"
  | "after_sales"
  | "conversion_watch"
  | "ad_efficiency_watch";

export interface TmallProductTableOperatingFilterOption {
  key: TmallProductTableOperatingFilterKey;
  label: string;
  count: number;
  description: string;
}

export interface TmallProductTableOperatingRowTag {
  key: string;
  label: string;
  tone: "blue" | "amber" | "rose" | "emerald" | "slate";
}

export interface TmallProductTableOperatingFiltersViewModel {
  filters: TmallProductTableOperatingFilterOption[];
  rowTagsByProductId: Record<string, TmallProductTableOperatingRowTag[]>;
  salesTopProductIds: string[];
  isEmpty: boolean;
  notices: string[];
}

const SALES_TOP_LIMIT = 5;

const safeNumber = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null;

const isSalesTopRow = (
  row: TmallProductTableRow,
  salesTopProductIds: Set<string>,
): boolean => salesTopProductIds.has(row.productId);

const isAfterSalesRow = (row: TmallProductTableRow): boolean =>
  row.refundSuccessAmount > 0;

const isConversionWatchRow = (row: TmallProductTableRow): boolean => {
  const visitors = safeNumber(row.visitors) ?? 0;
  const paidBuyers = safeNumber(row.paidBuyers) ?? 0;
  const conversionRate = safeNumber(row.conversionRate);

  return (
    (visitors > 0 && paidBuyers === 0) ||
    (visitors >= 100 && conversionRate !== null && conversionRate < 0.01)
  );
};

const isAdEfficiencyWatchRow = (row: TmallProductTableRow): boolean => {
  const adSpend = safeNumber(row.adSpend);
  const adRoi = safeNumber(row.adRoi);

  return row.hasAdData && adSpend !== null && adSpend > 0 && (adRoi === null || adRoi < 1);
};

const sortRowsByGmv = (rows: TmallProductTableRow[]): TmallProductTableRow[] =>
  [...rows].sort((first, second) => {
    if (second.gmv !== first.gmv) return second.gmv - first.gmv;
    return second.visitors - first.visitors;
  });

const buildSalesTopProductIds = (rows: TmallProductTableRow[]): string[] =>
  sortRowsByGmv(rows)
    .slice(0, SALES_TOP_LIMIT)
    .map((row) => row.productId);

const buildRowTags = (
  row: TmallProductTableRow,
  selectedProductId: string | null,
  salesTopProductIds: Set<string>,
): TmallProductTableOperatingRowTag[] => {
  const tags: TmallProductTableOperatingRowTag[] = [];

  if (row.productId === selectedProductId) {
    tags.push({ key: "selected", label: "当前查看", tone: "blue" });
  }

  if (isSalesTopRow(row, salesTopProductIds)) {
    tags.push({ key: "sales_top", label: "销售TOP", tone: "emerald" });
  }

  tags.push(
    row.hasAdData
      ? { key: "has_ad", label: "推广中", tone: "blue" }
      : { key: "no_ad", label: "暂无推广", tone: "slate" },
  );

  if (isAfterSalesRow(row)) {
    tags.push({ key: "after_sales", label: "售后关注", tone: "amber" });
  }

  if (isConversionWatchRow(row)) {
    tags.push({ key: "conversion_watch", label: "转化观察", tone: "amber" });
  }

  if (isAdEfficiencyWatchRow(row)) {
    tags.push({ key: "ad_efficiency_watch", label: "推广效率观察", tone: "amber" });
  }

  return tags.slice(0, 4);
};

export const filterTmallProductTableRows = (
  rows: TmallProductTableRow[],
  filterKey: TmallProductTableOperatingFilterKey,
  salesTopProductIds: string[],
): TmallProductTableRow[] => {
  const salesTopSet = new Set(salesTopProductIds);

  if (filterKey === "sales_top") {
    return rows.filter((row) => isSalesTopRow(row, salesTopSet));
  }

  if (filterKey === "has_ad") {
    return rows.filter((row) => row.hasAdData);
  }

  if (filterKey === "no_ad") {
    return rows.filter((row) => !row.hasAdData);
  }

  if (filterKey === "after_sales") {
    return rows.filter(isAfterSalesRow);
  }

  if (filterKey === "conversion_watch") {
    return rows.filter(isConversionWatchRow);
  }

  if (filterKey === "ad_efficiency_watch") {
    return rows.filter(isAdEfficiencyWatchRow);
  }

  return rows;
};

const countForFilter = (
  rows: TmallProductTableRow[],
  filterKey: TmallProductTableOperatingFilterKey,
  salesTopProductIds: string[],
): number => filterTmallProductTableRows(rows, filterKey, salesTopProductIds).length;

export const buildTmallProductTableOperatingFilters = (
  rows: TmallProductTableRow[],
  selectedProductId: string | null,
): TmallProductTableOperatingFiltersViewModel => {
  const salesTopProductIds = buildSalesTopProductIds(rows);
  const salesTopSet = new Set(salesTopProductIds);
  const rowTagsByProductId = rows.reduce<Record<string, TmallProductTableOperatingRowTag[]>>(
    (result, row) => ({
      ...result,
      [row.productId]: buildRowTags(row, selectedProductId, salesTopSet),
    }),
    {},
  );
  const filterConfigs: Array<Omit<TmallProductTableOperatingFilterOption, "count">> = [
    {
      key: "all",
      label: "全部商品",
      description: "展示当前经营日期全部商品。",
    },
    {
      key: "sales_top",
      label: "销售 TOP",
      description: "按当前经营日期 GMV 取前 5 个商品。",
    },
    {
      key: "has_ad",
      label: "推广中",
      description: "只包含商品推广报表中存在数据的商品。",
    },
    {
      key: "no_ad",
      label: "暂无推广",
      description: "只包含暂无商品推广数据的商品，推广指标显示为 --。",
    },
    {
      key: "after_sales",
      label: "售后关注",
      description: "只包含成功退款金额大于 0 的商品级聚合记录。",
    },
    {
      key: "conversion_watch",
      label: "转化观察",
      description: "访客有量但支付买家或支付转化率偏低的商品。",
    },
    {
      key: "ad_efficiency_watch",
      label: "推广效率观察",
      description: "有商品推广花费且 ROI 暂缺或低于 1 的商品。",
    },
  ];

  return {
    filters: filterConfigs.map((filter) => ({
      ...filter,
      count:
        filter.key === "all"
          ? rows.length
          : countForFilter(rows, filter.key, salesTopProductIds),
    })),
    rowTagsByProductId,
    salesTopProductIds,
    isEmpty: rows.length === 0,
    notices: [
      "运营筛选只影响前台展示，不修改原始商品数据。",
      "推广筛选只使用商品推广报表中存在数据的商品，计划推广报表不参与单商品推广筛选。",
      "售后关注只展示商品级安全聚合指标，不展示售后原始明细。",
    ],
  };
};
