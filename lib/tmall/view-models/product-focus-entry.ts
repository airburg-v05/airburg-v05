import type { TmallProductBoardOverview, TmallProductTableRow } from "./product-board";

export interface TmallProductFocusEntryMetric {
  label: string;
  value: string;
}

export interface TmallProductFocusEntryItem {
  productId: string;
  productName: string;
  tags: string[];
  metrics: TmallProductFocusEntryMetric[];
  hasAdData: boolean;
  hasAfterSalesData: boolean;
  isSelected: boolean;
}

export interface TmallProductFocusEntryViewModel {
  selectedProductId: string | null;
  salesTopProducts: TmallProductFocusEntryItem[];
  adFocusProducts: TmallProductFocusEntryItem[];
  afterSalesFocusProducts: TmallProductFocusEntryItem[];
  selectedProduct: TmallProductFocusEntryItem | null;
  notices: string[];
  isEmpty: boolean;
}

const MAX_ITEMS = 5;

const safeNumber = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null;

const formatCurrency = (value: number | null | undefined): string => {
  const safeValue = safeNumber(value);
  if (safeValue === null) return "--";

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeValue);
};

const formatPositiveCurrency = (value: number | null | undefined): string => {
  const safeValue = safeNumber(value);
  return safeValue !== null && safeValue > 0 ? formatCurrency(safeValue) : "--";
};

const formatInteger = (value: number | null | undefined): string => {
  const safeValue = safeNumber(value);
  if (safeValue === null) return "--";

  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(safeValue);
};

const formatRate = (value: number | null | undefined): string => {
  const safeValue = safeNumber(value);
  return safeValue === null ? "--" : `${(safeValue * 100).toFixed(2)}%`;
};

const formatRoi = (value: number | null | undefined): string => {
  const safeValue = safeNumber(value);
  return safeValue !== null && safeValue > 0 ? `${safeValue.toFixed(2)} 倍` : "--";
};

const productLabel = (productId: string, productName: string | null | undefined): string =>
  productName?.trim() || `商品 ${productId}`;

const rowsByProductId = (
  rows: TmallProductTableRow[],
): Map<string, TmallProductTableRow> =>
  new Map(rows.map((row) => [row.productId, row]));

const buildItem = ({
  row,
  productName,
  selectedProductId,
  tags,
  metrics,
  hasAdData,
  hasAfterSalesData,
}: {
  row: TmallProductTableRow;
  productName: string;
  selectedProductId: string | null;
  tags: string[];
  metrics: TmallProductFocusEntryMetric[];
  hasAdData: boolean;
  hasAfterSalesData: boolean;
}): TmallProductFocusEntryItem => ({
  productId: row.productId,
  productName: productLabel(row.productId, productName),
  tags,
  metrics,
  hasAdData,
  hasAfterSalesData,
  isSelected: selectedProductId === row.productId,
});

const baseTags = (
  label: string,
  row: TmallProductTableRow,
  selectedProductId: string | null,
): string[] => {
  const tags = [label];
  if (row.productId === selectedProductId) tags.push("当前查看");
  if (row.hasAdData) tags.push("推广中");
  if (row.refundSuccessAmount > 0) tags.push("售后关注");
  return [...new Set(tags)];
};

const salesMetrics = (row: TmallProductTableRow): TmallProductFocusEntryMetric[] => [
  { label: "GMV", value: formatCurrency(row.gmv) },
  { label: "访客", value: formatInteger(row.visitors) },
  { label: "支付买家", value: formatInteger(row.paidBuyers) },
];

const adMetrics = (row: TmallProductTableRow): TmallProductFocusEntryMetric[] => [
  { label: "推广花费", value: formatPositiveCurrency(row.adSpend) },
  { label: "ROI", value: formatRoi(row.adRoi) },
  { label: "支付转化率", value: formatRate(row.conversionRate) },
];

const afterSalesMetrics = (row: TmallProductTableRow): TmallProductFocusEntryMetric[] => [
  { label: "退款金额", value: formatPositiveCurrency(row.refundSuccessAmount) },
  { label: "GMV", value: formatCurrency(row.gmv) },
  { label: "访客", value: formatInteger(row.visitors) },
];

const selectedMetrics = (row: TmallProductTableRow): TmallProductFocusEntryMetric[] => [
  { label: "GMV", value: formatCurrency(row.gmv) },
  { label: "访客", value: formatInteger(row.visitors) },
  { label: "推广花费", value: row.hasAdData ? formatPositiveCurrency(row.adSpend) : "--" },
  { label: "退款金额", value: formatPositiveCurrency(row.refundSuccessAmount) },
];

const sortedSalesRows = (rows: TmallProductTableRow[]): TmallProductTableRow[] =>
  [...rows].sort((first, second) => {
    if (second.gmv !== first.gmv) return second.gmv - first.gmv;
    return second.visitors - first.visitors;
  });

const sortedAdRows = (rows: TmallProductTableRow[]): TmallProductTableRow[] =>
  rows
    .filter((row) => row.hasAdData)
    .sort((first, second) => {
      const firstSpend = safeNumber(first.adSpend) ?? Number.NEGATIVE_INFINITY;
      const secondSpend = safeNumber(second.adSpend) ?? Number.NEGATIVE_INFINITY;
      if (secondSpend !== firstSpend) return secondSpend - firstSpend;

      const firstRoi = safeNumber(first.adRoi) ?? Number.POSITIVE_INFINITY;
      const secondRoi = safeNumber(second.adRoi) ?? Number.POSITIVE_INFINITY;
      if (firstRoi !== secondRoi) return firstRoi - secondRoi;

      return second.gmv - first.gmv;
    });

const sortedAfterSalesRows = (
  rows: TmallProductTableRow[],
  afterSalesProductIds: Set<string>,
): TmallProductTableRow[] =>
  rows
    .filter((row) => afterSalesProductIds.has(row.productId) || row.refundSuccessAmount > 0)
    .sort((first, second) => {
      if (second.refundSuccessAmount !== first.refundSuccessAmount) {
        return second.refundSuccessAmount - first.refundSuccessAmount;
      }
      return second.gmv - first.gmv;
    });

export const buildTmallProductFocusEntry = (
  overview: TmallProductBoardOverview | null,
): TmallProductFocusEntryViewModel => {
  if (!overview || overview.products.length === 0 || overview.productTableRows.length === 0) {
    return {
      selectedProductId: null,
      salesTopProducts: [],
      adFocusProducts: [],
      afterSalesFocusProducts: [],
      selectedProduct: null,
      notices: [
        "当前经营日期没有可用于快速切换的商品数据。",
        "重点商品入口只基于宝贝看板当前日期的安全聚合数据生成。",
      ],
      isEmpty: true,
    };
  }

  const selectedProductId = overview.selectedProductId;
  const productById = new Map(
    overview.products.map((product) => [product.productId, product]),
  );
  const tableRowsByProductId = rowsByProductId(overview.productTableRows);
  const afterSalesProductIds = new Set(
    overview.products
      .filter((product) => product.hasAfterSalesData)
      .map((product) => product.productId),
  );

  const toItem = (
    row: TmallProductTableRow,
    label: string,
    metrics: TmallProductFocusEntryMetric[],
  ): TmallProductFocusEntryItem => {
    const product = productById.get(row.productId);
    return buildItem({
      row,
      productName: product?.productName ?? row.productName,
      selectedProductId,
      tags: baseTags(label, row, selectedProductId),
      metrics,
      hasAdData: product?.hasAdData ?? row.hasAdData,
      hasAfterSalesData:
        product?.hasAfterSalesData ?? afterSalesProductIds.has(row.productId),
    });
  };

  const salesTopProducts = sortedSalesRows(overview.productTableRows)
    .slice(0, MAX_ITEMS)
    .map((row) => toItem(row, "销售TOP", salesMetrics(row)));

  const adFocusProducts = sortedAdRows(overview.productTableRows)
    .slice(0, MAX_ITEMS)
    .map((row) => toItem(row, "推广重点", adMetrics(row)));

  const afterSalesFocusProducts = sortedAfterSalesRows(
    overview.productTableRows,
    afterSalesProductIds,
  )
    .slice(0, MAX_ITEMS)
    .map((row) => toItem(row, "售后关注", afterSalesMetrics(row)));

  const selectedRow = selectedProductId
    ? tableRowsByProductId.get(selectedProductId) ?? null
    : null;
  const selectedProduct = selectedRow
    ? toItem(selectedRow, "当前查看", selectedMetrics(selectedRow))
    : null;

  return {
    selectedProductId,
    salesTopProducts,
    adFocusProducts,
    afterSalesFocusProducts,
    selectedProduct,
    notices: [
      "销售 TOP 按当前经营日期 GMV 从高到低排序。",
      "推广重点只使用商品推广报表中存在数据的商品，计划推广报表不参与单商品推广入口计算。",
      "售后关注只展示商品级安全聚合指标，不展示售后原始明细。",
    ],
    isEmpty: false,
  };
};
