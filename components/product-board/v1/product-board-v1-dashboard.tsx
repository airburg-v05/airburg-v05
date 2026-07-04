"use client";

import { useEffect, useMemo, useState } from "react";
import type { BIDataPoint, BIMetricValue, ChartSeries, UIState } from "@/lib/bi/bi.types";
import {
  aggregateSearchProductKeywords,
  aggregateSearchProductMetricByDate,
  effectiveKeywordDate,
  hasBrandModelTokens,
} from "@/lib/bi/brand-model-semantic";
import {
  createEmptyHomeBIDataSource,
  loadHomeBIDataSource,
  type BIHomeDataSource,
} from "@/lib/bi/bi.data-source";
import { createDefaultBIState } from "@/lib/bi/bi.store";
import {
  createBoardTargetKpiDefinitions,
  deriveTargetMetricValue,
  formatTargetMetricValue,
  getAllUnsupportedTargetMetricDefinitions,
  targetMetricValuesFromDrafts,
  type BoardTargetKpiDefinition,
  type TargetMetricDefinition,
} from "@/lib/bi/target-metric-definitions";
import {
  loadActiveTargetDrafts,
  saveTargetDrafts,
} from "@/lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftRecord,
} from "@/lib/persistence/target-drafts-persistence.types";
import type { BISearchProductKeyword, BrandModelFilter } from "@/lib/bi/search-keyword.types";
import { BIChartCard } from "@/components/visual-system/v1/bi-chart";
import { BrandModelFilterPopover } from "@/components/visual-system/v1/brand-model-filter-popover";
import {
  loadCrossPageDebugContext,
  mergeDebugContextIntoUIState,
  normalizeDebugSelectedStores,
  saveCrossPageDebugContextPatch,
} from "@/lib/persistence/debug-context-persistence";
import {
  V1DimensionScopeBar,
  V1LogoAccountButton,
  V1Sidebar,
  V1TimeRangePopover,
  V1TopBar,
  v1MonthRangeForMonth,
  v1WeekRangeForWeek,
  type V1ChartMode,
} from "@/components/visual-system/v1/visual-system";

type PeriodLabel = "日" | "周" | "月" | "自定义";
type PopupKind = "product" | "target" | "brandModel" | null;
type Tone = "green" | "red" | "neutral";
type TargetMessage = { tone: "info" | "success" | "warning"; text: string } | null;

interface StoreOption {
  key: string;
  storeId: string;
  storeName: string;
  platformCode: string;
  platformName: string;
  status: "active" | "inactive";
  source: "data" | "temp";
}

interface ProductOption {
  key: string;
  id: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  source: "data" | "temp";
}

interface TempProductItem {
  id: string;
  platformCode: string;
  platformName: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
}

type ProductKpiDefinition = BoardTargetKpiDefinition;

interface ProductKpiCard {
  key: string;
  title: string;
  value: string;
  rawValue: BIMetricValue;
  mtdTarget: string;
  totalTarget: string;
  difference: string;
  completionRate: string;
  progress: number;
  tone: Tone;
}

interface ProductContribution {
  key: string;
  rank: number;
  productName: string;
  productId: string;
  platformName: string;
  storeName: string;
  visitors: number | null;
  adClicks: number | null;
  paidBuyers: number | null;
  gmv: number | null;
  share: number | null;
  adSpend: number | null;
  roi: number | null;
  cpc: number | null;
  conversionRate: number | null;
}

const PLATFORM_OPTIONS = [
  { code: "tmall", name: "天猫" },
  { code: "jd", name: "京东" },
  { code: "pdd", name: "拼多多" },
  { code: "douyin", name: "抖音" },
  { code: "youzan", name: "有赞" },
];

const PRODUCT_METRIC_KEY_OVERRIDES: Record<string, string> = {
  gmv: "productGmv",
  gsv: "productGsv",
  refundRate: "returnRateTotal",
  shippedRefundRate: "returnRateShipped",
  signedRefundRate: "returnRateSigned",
  directTransactionShare: "directSalesShare",
};

const PRODUCT_TITLE_OVERRIDES: Record<string, string> = {
  gmv: "宝贝GMV",
  gsv: "宝贝GSV",
};

const PRODUCT_KPIS: ProductKpiDefinition[] = createBoardTargetKpiDefinitions(
  "product",
  PRODUCT_METRIC_KEY_OVERRIDES,
  PRODUCT_TITLE_OVERRIDES,
);
const PRODUCT_TARGET_FIELDS = PRODUCT_KPIS.filter((definition) => definition.showInTargetInput);
const PRODUCT_DERIVED_TARGET_FIELDS = PRODUCT_KPIS.filter((definition) => definition.targetRule === "derived");
const TARGET_UNSUPPORTED_INPUT_KEYS = new Set(["mtdTurnover", "regionalFulfillmentRate", "shippedRefundRate", "signedRefundRate", "cpc"]);
const PRODUCT_UNSUPPORTED_TARGET_FIELDS = getAllUnsupportedTargetMetricDefinitions()
  .filter((definition) => TARGET_UNSUPPORTED_INPUT_KEYS.has(definition.metricKey));

const NO_STORE_SELECTED = "__airburg_store_no_store_selected__";
const BRAND_PRODUCT_KPI_KEYS = new Set(["brandVisitors", "brandPaidBuyers", "geoSearchShare"]);
const BRAND_MODEL_PROMPT = "请先设置品牌词 / 中心词";
const PRODUCT_SELECTION_PROMPT = "请选择宝贝后查看数据";
const BRAND_MODEL_DESCRIPTION = "品牌词 / 中心词 union 口径，先按当前商品ID过滤";
const DEFAULT_TARGET_MONTH = "2026-06";
const FULL_PRODUCT_KPI_KEYS = [
  "productGmv",
  "productGsv",
  "adRoi",
  "adSpendRateAfterRefund",
  "directSalesShare",
  "brandVisitors",
  "brandPaidBuyers",
  "geoSearchShare",
  "returnRateTotal",
  "returnRateShipped",
  "returnRateSigned",
  "averageOrderValue",
  "conversionRate",
  "adSpend",
  "cpc",
] as const;
const DISPLAY_PRODUCT_KPI_KEYS = FULL_PRODUCT_KPI_KEYS;
const DISPLAY_PRODUCT_KPI_KEY_SET = new Set<string>(DISPLAY_PRODUCT_KPI_KEYS);

const storeKey = (platformCode: string, storeId: string) => `${platformCode}::${storeId}`;
const productKey = (platformCode: string, storeId: string, productId: string) => `${platformCode}::${storeId}::${productId}`;
const debugStoreIdFromProductStoreKey = (value: string): string => {
  if (value === NO_STORE_SELECTED) return value;
  return value.includes("::") ? value.split("::")[1] ?? value : value;
};
const productStoreKeysFromDebugStoreIds = (values: string[], platformCode: string | null): string[] =>
  normalizeDebugSelectedStores(values).map((value) =>
    value === NO_STORE_SELECTED || value.includes("::") ? value : storeKey(platformCode ?? "tmall", value),
  );

const createInitialState = (): UIState => ({
  ...createDefaultBIState(),
  selectedMetric: "productGmv",
  brandModelFilter: {
    brandWords: [],
    modelWords: [],
    centerWordGroups: [],
  },
  timeRange: {
    mode: "day",
    startDate: null,
    endDate: null,
  },
});

const safeNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sumMetric = (points: BIDataPoint[], metricKey: string): number | null => {
  let hasValue = false;
  const total = points.reduce((sum, point) => {
    const value = safeNumber(point.metrics[metricKey]);
    if (value === null) return sum;
    hasValue = true;
    return sum + value;
  }, 0);
  return hasValue ? total : null;
};

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator !== 0 ? numerator / denominator : null;

const ratioWithPositiveDenominator = (numerator: number | null, denominator: number | null): number | null =>
  numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;

const formatNumber = (value: number | null, options?: { percent?: boolean; digits?: number }): string => {
  if (value === null || !Number.isFinite(value)) return "--";
  const digits = options?.digits ?? (Math.abs(value) >= 100 ? 0 : 2);
  const normalized = options?.percent ? value * 100 : value;
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(normalized) ? 0 : Math.min(digits, 2),
  }).format(normalized);
  return options?.percent ? `${formatted}%` : formatted;
};

const formatKpiValue = (definition: ProductKpiDefinition, value: number | null): string => {
  if (value === null) return "--";
  if (definition.unit === "%") return formatNumber(value, { percent: true, digits: 2 });
  return formatNumber(value, { digits: definition.unit === "倍" ? 2 : 0 });
};

const parseTarget = (value: string): number | null => {
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const monthValueFromDate = (date: string | null): string =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : DEFAULT_TARGET_MONTH;

const formatTargetInputValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

const createProductTargetId = ({
  platformCode,
  storeId,
  productId,
  month,
  metricKey,
}: {
  platformCode: string;
  storeId: string;
  productId: string;
  month: string;
  metricKey: string;
}) => `product:${platformCode}:${storeId}:${productId}:${month}:${metricKey}`;

const uniqueTextList = (items: string[]): string[] =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const parseDate = (date: string | null): Date | null => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const weekRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const day = parsed.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(parsed, offsetToMonday);
  return { startDate: formatDate(monday), endDate: formatDate(addDays(monday, 6)) };
};

const monthRangeForDate = (date: string | null): { startDate: string | null; endDate: string | null } => {
  const parsed = parseDate(date);
  if (!parsed) return { startDate: null, endDate: null };
  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0));
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

const inDateRange = (point: BIDataPoint, state: UIState): boolean => {
  const { startDate, endDate } = state.timeRange;
  if (startDate && point.businessDate < startDate) return false;
  if (endDate && point.businessDate > endDate) return false;
  return true;
};

const rangeText = (state: UIState): string =>
  state.timeRange.startDate && state.timeRange.endDate
    ? `${state.timeRange.startDate} ~ ${state.timeRange.endDate}`
    : "--";

const buildStoreOptions = (source: BIHomeDataSource, tempProducts: TempProductItem[]): StoreOption[] => {
  const options = new Map<string, StoreOption>();
  source.points.forEach((point) => {
    if (!point.storeId) return;
    const key = storeKey(point.platformCode, point.storeId);
    options.set(key, {
      key,
      storeId: point.storeId,
      storeName: point.storeName?.trim() || point.storeId,
      platformCode: point.platformCode,
      platformName: point.platformName?.trim() || point.platformCode,
      status: "active",
      source: "data",
    });
  });
  tempProducts.forEach((product) => {
    const key = storeKey(product.platformCode, product.storeId);
    if (options.has(key)) return;
    options.set(key, {
      key,
      storeId: product.storeId,
      storeName: product.storeName,
      platformCode: product.platformCode,
      platformName: product.platformName,
      status: "active",
      source: "temp",
    });
  });
  return Array.from(options.values()).sort((left, right) =>
    `${left.platformName}${left.storeName}${left.storeId}`.localeCompare(
      `${right.platformName}${right.storeName}${right.storeId}`,
    ),
  );
};

const buildProductOptions = (source: BIHomeDataSource, tempProducts: TempProductItem[]): ProductOption[] => {
  const options = new Map<string, ProductOption>();
  const importedProducts = new Map<string, ProductOption>();
  source.points.forEach((point) => {
    if (!point.storeId || !point.productId) return;
    const key = productKey(point.platformCode, point.storeId, point.productId);
    if (importedProducts.has(key)) return;
    importedProducts.set(key, {
      key,
      id: key,
      platformCode: point.platformCode,
      platformName: point.platformName?.trim() || point.platformCode,
      storeId: point.storeId,
      storeName: point.storeName?.trim() || point.storeId,
      productId: point.productId,
      productName: point.productName?.trim() || point.productId,
      source: "data",
    });
  });
  tempProducts.forEach((product) => {
    const key = productKey(product.platformCode, product.storeId, product.productId);
    const imported = importedProducts.get(key);
    options.set(key, {
      ...(imported ?? product),
      ...product,
      key,
      id: product.id,
      platformName: product.platformName || imported?.platformName || product.platformCode,
      storeName: product.storeName || imported?.storeName || product.storeId,
      productName: product.productName || imported?.productName || product.productId,
      source: "temp",
    });
  });
  return Array.from(options.values()).sort((left, right) =>
    `${left.platformName}${left.storeName}${left.productName}${left.productId}`.localeCompare(
      `${right.platformName}${right.storeName}${right.productName}${right.productId}`,
    ),
  );
};

const metricValue = (points: BIDataPoint[], key: string): number | null => {
  const gmv = sumMetric(points, "gmv");
  const gsv = sumMetric(points, "gsv");
  const visitors = sumMetric(points, "visitors");
  const paidBuyers = sumMetric(points, "paidBuyers");
  const adSpend = sumMetric(points, "adSpend");
  const adRevenue = sumMetric(points, "adRevenue");
  const adClicks = sumMetric(points, "adClicks");
  const refundAmount = sumMetric(points, "refundAmount");
  const directTransactionAmount = sumMetric(points, "directTransactionAmount");
  const indirectTransactionAmount = sumMetric(points, "indirectTransactionAmount");
  const totalTransactionAmount = sumMetric(points, "totalTransactionAmount");
  const afterRefundGsv = gsv !== null && refundAmount !== null ? gsv - refundAmount : null;
  const directTransactionFallbackDenominator =
    directTransactionAmount !== null && indirectTransactionAmount !== null
      ? directTransactionAmount + indirectTransactionAmount
      : null;

  switch (key) {
    case "productGmv":
      return gmv;
    case "productGsv":
      return gsv;
    case "adRoi":
      return ratio(adRevenue, adSpend);
    case "returnRateTotal":
      return ratio(refundAmount, gsv);
    case "adSpendRateAfterRefund":
      return ratioWithPositiveDenominator(adSpend, afterRefundGsv);
    case "cpc":
      return ratio(adSpend, adClicks);
    case "averageOrderValue":
      return ratio(gmv, paidBuyers);
    case "conversionRate":
      return ratio(paidBuyers, visitors);
    case "adSpend":
      return adSpend;
    case "directSalesShare":
      return ratioWithPositiveDenominator(
        directTransactionAmount,
        totalTransactionAmount ?? directTransactionFallbackDenominator,
      );
    default:
      return null;
  }
};

const scopedProductPoints = (source: BIHomeDataSource, state: UIState, selectedProductKey: string | null): BIDataPoint[] => {
  const selectedStores = new Set(state.selectedStores.filter((key) => key !== NO_STORE_SELECTED));
  if (selectedStores.size === 0 || !selectedProductKey) return [];
  return source.points.filter((point) => {
    if (!point.storeId || !point.productId) return false;
    if (!selectedStores.has(storeKey(point.platformCode, point.storeId))) return false;
    if (productKey(point.platformCode, point.storeId, point.productId) !== selectedProductKey) return false;
    return inDateRange(point, state);
  });
};

const searchKeywordInDateRange = (
  row: BISearchProductKeyword,
  source: BIHomeDataSource,
  state: UIState,
): boolean => {
  const date = effectiveKeywordDate(row.date, source.selectedDate);
  if (date === "未标日期") return true;
  if (state.timeRange.startDate && date < state.timeRange.startDate) return false;
  if (state.timeRange.endDate && date > state.timeRange.endDate) return false;
  return true;
};

const scopedProductSearchKeywords = (
  source: BIHomeDataSource,
  selectedProduct: ProductOption | null,
  state: UIState,
): BISearchProductKeyword[] => {
  if (!selectedProduct) return [];
  return source.searchProductKeywords.filter((row) => {
    if (row.platformCode !== selectedProduct.platformCode) return false;
    if (row.storeId !== selectedProduct.storeId) return false;
    if (row.productId !== selectedProduct.productId) return false;
    return searchKeywordInDateRange(row, source, state);
  });
};

interface ProductBrandMetrics {
  visitors: number | null;
  buyers: number | null;
  geoSearchShare: number | null;
  description: string | null;
}

const buildProductBrandMetrics = (
  source: BIHomeDataSource,
  selectedProduct: ProductOption | null,
  points: BIDataPoint[],
  state: UIState,
): ProductBrandMetrics => {
  if (!selectedProduct) {
    return { visitors: null, buyers: null, geoSearchShare: null, description: PRODUCT_SELECTION_PROMPT };
  }
  if (!hasBrandModelTokens(state.brandModelFilter)) {
    return { visitors: null, buyers: null, geoSearchShare: null, description: BRAND_MODEL_PROMPT };
  }
  const aggregate = aggregateSearchProductKeywords(
    scopedProductSearchKeywords(source, selectedProduct, state),
    state.brandModelFilter,
    [selectedProduct.productId],
  );
  const totalPaidBuyers = sumMetric(points, "paidBuyers");
  return {
    visitors: aggregate.visitors,
    buyers: aggregate.buyers,
    geoSearchShare: ratio(aggregate.buyers, totalPaidBuyers),
    description: aggregate.matchedRowCount > 0 ? BRAND_MODEL_DESCRIPTION : "当前宝贝暂无品牌词搜索数据",
  };
};

const buildKpiCards = (
  points: BIDataPoint[],
  brandMetrics: ProductBrandMetrics,
  targetDrafts: Record<string, number>,
): ProductKpiCard[] => {
  const targetMetricValues = targetMetricValuesFromDrafts(PRODUCT_KPIS, targetDrafts);
  return PRODUCT_KPIS.map((definition) => {
    const rawValue =
      definition.key === "brandVisitors"
        ? brandMetrics.visitors
        : definition.key === "brandPaidBuyers"
          ? brandMetrics.buyers
          : definition.key === "geoSearchShare"
          ? brandMetrics.geoSearchShare
            : metricValue(points, definition.key);
    const target = definition.targetRule === "derived"
      ? deriveTargetMetricValue(definition.metricKey, targetMetricValues).value
      : definition.targetRule === "required"
        ? targetDrafts[definition.title] ?? null
        : null;
    const progress = rawValue !== null && target ? Math.min(Math.abs((rawValue / target) * 100), 999) : 0;
    const difference = rawValue !== null && target ? rawValue - target : null;
    const reached =
      rawValue !== null && target
        ? definition.direction === "lower"
          ? rawValue <= target
          : definition.direction === "higher"
            ? rawValue >= target
            : rawValue <= target
        : false;
    return {
      key: definition.key,
      title: definition.title,
      value: formatKpiValue(definition, rawValue),
      rawValue,
      mtdTarget: target ? formatKpiValue(definition, target) : "--",
      totalTarget: target ? formatKpiValue(definition, target) : "--",
      difference: difference === null ? "--" : formatKpiValue(definition, difference),
      completionRate: target && rawValue !== null ? `${formatNumber(rawValue / target, { percent: true, digits: 2 })}` : "--",
      progress,
      tone: target && rawValue !== null ? (reached ? "green" : "red") : "neutral",
    };
  });
};

const buildChartLines = (
  source: BIHomeDataSource,
  points: BIDataPoint[],
  productOptions: ProductOption[],
  selectedProductKey: string | null,
  state: UIState,
  selectedMetric: string,
): { xAxis: string[]; lines: ChartSeries[]; title: string; empty: boolean } => {
  const dates = Array.from(new Set(points.map((point) => point.businessDate))).sort();
  const xAxis = dates.length > 0 ? dates : [source.selectedDate ?? "--"];
  const selectedDefinition = PRODUCT_KPIS.find((kpi) => kpi.key === selectedMetric) ?? PRODUCT_KPIS[0];
  const selectedProduct = productOptions.find((product) => product.key === selectedProductKey);
  const productLabel = selectedProduct?.productName ?? "当前宝贝";

  if (BRAND_PRODUCT_KPI_KEYS.has(selectedMetric)) {
    return buildBrandProductChart({
      source,
      points,
      selectedProduct: selectedProduct ?? null,
      state,
      selectedMetric,
    });
  }

  if (selectedMetric === "returnRateTotal" || selectedMetric === "returnRateShipped" || selectedMetric === "returnRateSigned") {
    const names = [
      ["return-total", "总退货率", "returnRateTotal"],
      ["return-shipped", "发货退货率", "returnRateShipped"],
      ["return-signed", "已签收退货率", "returnRateSigned"],
    ] as const;
    return {
      xAxis,
      title: `${selectedDefinition.title} · 单宝贝退货率趋势`,
      empty: points.length === 0,
      lines: names.map(([id, name, key]) => ({
        id,
        name,
        entityLevel: "product",
        entityId: "selected-products",
        points: xAxis.map((date) => ({
          date,
          value: metricValue(points.filter((point) => point.businessDate === date), key),
        })),
      })),
    };
  }

  return {
    xAxis,
    empty: points.length === 0,
    title: `${selectedDefinition.title} · 单宝贝趋势`,
    lines: selectedProduct
      ? [{
      id: `${selectedProduct.key}-${selectedMetric}`,
      name: selectedMetric === "productGmv" ? "实际" : productLabel,
      entityLevel: "product" as const,
      entityId: selectedProduct.key,
      points: xAxis.map((date) => ({
        date,
        value: metricValue(
          points.filter(
            (point) =>
              point.platformCode === selectedProduct.platformCode &&
              point.storeId === selectedProduct.storeId &&
              point.productId === selectedProduct.productId &&
              point.businessDate === date,
          ),
          selectedMetric,
        ),
      })),
    }]
      : [],
  };
};

const productKeyFromQuery = (options: ProductOption[]): string | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const queryProductId = params.get("productId") ?? params.get("trackedProductId");
  if (!queryProductId) return null;
  const queryPlatform = params.get("platform") ?? params.get("platformCode");
  const queryStoreId = params.get("storeId");
  return (
    options.find((option) => {
      if (option.productId !== queryProductId) return false;
      if (queryPlatform && option.platformCode !== queryPlatform) return false;
      if (queryStoreId && option.storeId !== queryStoreId) return false;
      return true;
    })?.key ?? null
  );
};

const chartLineFromDateValues = (
  id: string,
  name: string,
  entityId: string,
  xAxis: string[],
  valuesByDate: Map<string, number | null>,
): ChartSeries => ({
  id,
  name,
  entityLevel: "product",
  entityId,
  points: xAxis.map((date) => ({
    date,
    value: valuesByDate.get(date) ?? null,
  })),
});

const buildBrandProductChart = ({
  source,
  points,
  selectedProduct,
  state,
  selectedMetric,
}: {
  source: BIHomeDataSource;
  points: BIDataPoint[];
  selectedProduct: ProductOption | null;
  state: UIState;
  selectedMetric: string;
}): { xAxis: string[]; lines: ChartSeries[]; title: string; empty: boolean } => {
  const selectedDefinition = PRODUCT_KPIS.find((kpi) => kpi.key === selectedMetric) ?? PRODUCT_KPIS[0];
  const rows = scopedProductSearchKeywords(source, selectedProduct, state);
  const dateCandidates = [
    ...points.map((point) => point.businessDate),
    ...rows.map((row) => effectiveKeywordDate(row.date, source.selectedDate)),
  ];
  const xAxis = Array.from(new Set(dateCandidates.filter(Boolean))).sort();
  const fallbackAxis = xAxis.length > 0 ? xAxis : [source.selectedDate ?? "--"];
  const entityId = selectedProduct?.key ?? "unselected-product";

  if (!selectedProduct || !hasBrandModelTokens(state.brandModelFilter)) {
    return {
      xAxis: fallbackAxis,
      title: selectedProduct ? "当前宝贝暂无品牌词趋势" : PRODUCT_SELECTION_PROMPT,
      empty: true,
      lines: [
        chartLineFromDateValues(
          `product-brand-${selectedMetric}`,
          selectedDefinition.title,
          entityId,
          fallbackAxis,
          new Map(),
        ),
      ],
    };
  }

  if (selectedMetric === "geoSearchShare") {
    const buyersByDate = aggregateSearchProductMetricByDate(
      rows,
      state.brandModelFilter,
      [selectedProduct.productId],
      source.selectedDate,
      "buyers",
    );
    const geoByDate = new Map(
      fallbackAxis.map((date) => [
        date,
        ratio(
          buyersByDate.get(date) ?? null,
          sumMetric(points.filter((point) => point.businessDate === date), "paidBuyers"),
        ),
      ]),
    );
    return {
      xAxis: fallbackAxis,
      title: `${selectedDefinition.title} · 当前宝贝品牌词趋势`,
      empty: Array.from(geoByDate.values()).every((value) => value === null),
      lines: [
        chartLineFromDateValues("product-brand-geo", "当前宝贝GEO搜索占比", entityId, fallbackAxis, geoByDate),
      ],
    };
  }

  const metric = selectedMetric === "brandVisitors" ? "visitors" : "buyers";
  const valuesByDate = aggregateSearchProductMetricByDate(
    rows,
    state.brandModelFilter,
    [selectedProduct.productId],
    source.selectedDate,
    metric,
  );
  return {
    xAxis: fallbackAxis,
    title: `${selectedDefinition.title} · 当前宝贝品牌词趋势`,
    empty: Array.from(valuesByDate.values()).every((value) => value === null),
    lines: [
      chartLineFromDateValues(
        `product-brand-${metric}`,
        selectedDefinition.title,
        entityId,
        fallbackAxis,
        valuesByDate,
      ),
    ],
  };
};

const buildContributions = (points: BIDataPoint[]): ProductContribution[] => {
  const grouped = new Map<string, BIDataPoint[]>();
  points.forEach((point) => {
    if (!point.productId || !point.storeId) return;
    const key = `${point.platformCode}:${point.storeId}:${point.productId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  });
  const totalGmv = sumMetric(points, "gmv");
  return Array.from(grouped.entries())
    .map(([key, productPoints]) => {
      const first = productPoints[0];
      const gmv = sumMetric(productPoints, "gmv");
      const adSpend = sumMetric(productPoints, "adSpend");
      const adClicks = sumMetric(productPoints, "adClicks");
      const visitors = sumMetric(productPoints, "visitors");
      const paidBuyers = sumMetric(productPoints, "paidBuyers");
      return {
        key,
        rank: 0,
        productName: first?.productName || first?.productId || "--",
        productId: first?.productId || "--",
        platformName: first?.platformName || first?.platformCode || "--",
        storeName: first?.storeName || first?.storeId || "--",
        visitors,
        adClicks,
        paidBuyers,
        gmv,
        share: ratio(gmv, totalGmv),
        adSpend,
        roi: ratio(sumMetric(productPoints, "adRevenue"), adSpend),
        cpc: ratio(adSpend, adClicks),
        conversionRate: ratio(paidBuyers, visitors),
      };
    })
    .sort((left, right) => (right.gmv ?? -1) - (left.gmv ?? -1) || left.productName.localeCompare(right.productName))
    .slice(0, 8)
    .map((item, index) => ({ ...item, rank: index + 1 }));
};

function Sidebar() {
  return (
    <V1Sidebar
      activeLabel="宝贝看板"
      ariaLabel="宝贝看板导航"
      itemTestId="product-board-v1-nav-item"
      sidebarTestId="product-board-v1-sidebar"
    />
  );
}

function TopBar() {
  return <V1TopBar title="宝贝看板" />;
}

function KpiCard({ card, selected, onClick }: { card: ProductKpiCard; selected: boolean; onClick: () => void }) {
  const missing = card.rawValue === null || card.value === "--";
  const progressColor = missing ? "bg-slate-300" : card.tone === "green" ? "bg-emerald-500" : card.tone === "red" ? "bg-rose-500" : "bg-slate-400";
  const resultTone = missing ? "font-semibold text-slate-500" : card.tone === "green" ? "font-semibold text-emerald-700" : card.tone === "red" ? "font-semibold text-rose-700" : "font-semibold text-slate-500";
  return (
    <button
      type="button"
      data-testid="product-board-v1-kpi-card"
      data-kpi-title={card.title}
      aria-pressed={selected}
      title={`${card.title}: 当前 ${card.value}; MTD目标 ${card.mtdTarget}; 总目标 ${card.totalTarget}; 差值 ${card.difference}; 完成率 ${card.completionRate}`}
      className={`h-[170px] min-w-0 overflow-hidden rounded-xl border p-3 text-left shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition ${
        selected ? "border-blue-300 bg-blue-50/40 ring-1 ring-blue-200" : "border-slate-200/80 bg-white hover:bg-slate-50/80"
      }`}
      onClick={onClick}
    >
      <p className="break-words text-sm font-semibold text-slate-950">{card.title}</p>
      <p className="mt-1.5 break-words text-xl font-semibold leading-6 text-slate-950">{card.value}</p>
      <p className="mt-1 min-h-4 break-words text-[10px] font-semibold text-slate-500">
        {missing ? "暂无可计算数据" : "当前宝贝口径"}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(card.progress, 100)}%` }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] leading-4 text-slate-700">
        <div className="min-w-0">
          <dt>MTD目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.mtdTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>总目标</dt>
          <dd className="truncate text-right font-semibold text-slate-950">{card.totalTarget}</dd>
        </div>
        <div className="min-w-0">
          <dt>差值</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.difference}</dd>
        </div>
        <div className="min-w-0">
          <dt>完成率</dt>
          <dd className={`truncate text-right ${resultTone}`}>{card.completionRate}</dd>
        </div>
      </dl>
    </button>
  );
}

function SingleProductFunnel({ item }: { item: ProductContribution | null }) {
  const maxVisitors = Math.max(item?.visitors ?? 0, 1);
  const maxClicks = Math.max(item?.adClicks ?? 0, 1);
  const maxBuyers = Math.max(item?.paidBuyers ?? 0, 1);
  const maxGmv = Math.max(item?.gmv ?? 0, 1);
  const barWidth = (value: number | null, maxValue: number) => (value === null ? 0 : Math.max((value / maxValue) * 100, 4));
  const funnel = item
    ? [
        { label: "访客", value: item.visitors, max: maxVisitors, color: "bg-blue-500", text: formatNumber(item.visitors, { digits: 0 }) },
        { label: "推广点击", value: item.adClicks, max: maxClicks, color: "bg-cyan-500", text: formatNumber(item.adClicks, { digits: 0 }) },
        { label: "支付买家", value: item.paidBuyers, max: maxBuyers, color: "bg-emerald-500", text: formatNumber(item.paidBuyers, { digits: 0 }) },
        { label: "成交GMV", value: item.gmv, max: maxGmv, color: "bg-violet-500", text: formatNumber(item.gmv, { digits: 0 }) },
      ]
    : [];
  return (
    <section
      data-testid="product-board-v1-product-top"
      className="rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4"
      aria-label="单品流量漏斗"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-950">单品流量漏斗</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">只展示当前选中宝贝；其它宝贝仅在选择控件中出现。</p>
        </div>
      </div>
      {!item ? (
        <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/80 p-5 text-sm font-semibold text-slate-500">
          请选择宝贝后查看单品流量漏斗；未选择时不展示假图表。
        </div>
      ) : (
        <div data-testid="product-board-v1-single-product-funnel" className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
            <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-950">
              {item.productName} <span className="font-semibold text-slate-500">({item.productId})</span>
            </span>
            <span>{item.platformName} · {item.storeName}</span>
          </div>
          <div className="mt-3 space-y-2">
            {funnel.map((step) => (
              <div key={step.label} className="grid grid-cols-[80px_1fr_92px] items-center gap-3 rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
                <span>{step.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${step.color}`} style={{ width: `${barWidth(step.value, step.max)}%` }} />
                </div>
                <span className="text-right text-slate-950">{step.text}</span>
              </div>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600 md:grid-cols-5">
            <div>
              <dt>GMV</dt>
              <dd className="text-slate-950">{formatNumber(item.gmv, { digits: 0 })}</dd>
            </div>
            <div>
              <dt>转化率</dt>
              <dd className="text-slate-950">{formatNumber(item.conversionRate, { percent: true, digits: 2 })}</dd>
            </div>
            <div>
              <dt>推广点击</dt>
              <dd className="text-slate-950">{formatNumber(item.adClicks, { digits: 0 })}</dd>
            </div>
            <div>
              <dt>推广花费</dt>
              <dd className="text-slate-950">{formatNumber(item.adSpend, { digits: 0 })}</dd>
            </div>
            <div>
              <dt>ROI / 点击单价</dt>
              <dd className="text-slate-950">
                {item.roi !== null ? formatNumber(item.roi, { digits: 2 }) : formatNumber(item.cpc, { digits: 2 })}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

function ControlBar({
  state,
  storeOptions,
  productOptions,
  selectedProductKey,
  productSearch,
  storeMenuOpen,
  onToggleStoreMenu,
  onToggleStore,
  onSelectAllStores,
  onClearStores,
  onSelectProduct,
  onProductSearchChange,
  onOpenPopup,
  onPeriodChange,
  onDayDateChange,
  onWeekChange,
  onMonthChange,
  onCustomDateChange,
}: {
  state: UIState;
  storeOptions: StoreOption[];
  productOptions: ProductOption[];
  selectedProductKey: string | null;
  productSearch: string;
  storeMenuOpen: boolean;
  onToggleStoreMenu: () => void;
  onToggleStore: (storeKeyValue: string) => void;
  onSelectAllStores: () => void;
  onClearStores: () => void;
  onSelectProduct: (productKeyValue: string) => void;
  onProductSearchChange: (value: string) => void;
  onOpenPopup: (kind: PopupKind) => void;
  onPeriodChange: (period: PeriodLabel) => void;
  onDayDateChange: (value: string) => void;
  onWeekChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onCustomDateChange: (field: "startDate" | "endDate", value: string) => void;
}) {
  const selectedSet = new Set(state.selectedStores.filter((key) => key !== NO_STORE_SELECTED));
  const selectedStores = storeOptions.filter((option) => selectedSet.has(option.key));
  const platformText = uniqueTextList(selectedStores.map((store) => store.platformName)).join("｜") || "暂无数据";
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const selectedProduct = productOptions.find((product) => product.key === selectedProductKey);
  const filteredProductsBase = productOptions
    .filter((product) => {
      if (!normalizedProductSearch) return true;
      return `${product.productName} ${product.productId} ${product.platformName} ${product.storeName}`.toLowerCase().includes(normalizedProductSearch);
    })
    .slice(0, 50);
  const filteredProducts = selectedProduct && !filteredProductsBase.some((product) => product.key === selectedProduct.key)
    ? [selectedProduct, ...filteredProductsBase]
    : filteredProductsBase;
  return (
    <section className="relative m-4 rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4" data-testid="product-board-v1-control">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <V1LogoAccountButton testId="product-board-v1-logo-button" />
          <div className="min-w-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="product-board-v1-target-store"
                className="min-w-[180px] rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-left text-sm font-semibold text-slate-950"
                onClick={onToggleStoreMenu}
              >
                目标店铺
              </button>
              <button
                type="button"
                data-testid="product-board-v1-product-settings-button"
                className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={() => onOpenPopup("product")}
              >
                宝贝设置
              </button>
              <button
                type="button"
                data-testid="product-board-v1-brand-model-filter-button"
                className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={() => onOpenPopup("brandModel")}
              >
                品牌词筛选
              </button>
              <button
                type="button"
                data-testid="product-board-v1-product-target-button"
                className="rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.06)] bg-white px-4 py-2 text-sm font-semibold text-slate-950"
                onClick={() => onOpenPopup("target")}
              >
                宝贝目标
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
              <label className="text-xs font-semibold text-slate-600">
                当前宝贝
                <select
                  data-testid="product-board-v1-product-selector"
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  value={selectedProductKey ?? ""}
                  onChange={(event) => onSelectProduct(event.target.value)}
                >
                  <option value="">
                    {productOptions.length === 0 ? "暂无宝贝，请先添加商品ID" : "请选择宝贝后查看数据"}
                  </option>
                  {filteredProducts.map((product) => (
                    <option key={product.key} value={product.key}>
                      {product.productName} · {product.productId} · {product.platformName}/{product.storeName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                搜索宝贝
                <input
                  data-testid="product-board-v1-product-search"
                  className="mt-1 w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  value={productSearch}
                  onChange={(event) => onProductSearchChange(event.target.value)}
                  placeholder="宝贝名称 / 商品ID"
                />
              </label>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-600">
              店铺数量 {storeOptions.length}个 · 已选择 {selectedStores.length}个
            </p>
            <p className="mt-1 break-words text-xs font-semibold text-slate-600">涉及平台 {platformText}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
          <V1TimeRangePopover
            testId="product-board-v1-time-range-popover"
            mode={state.timeRange.mode}
            startDate={state.timeRange.startDate}
            endDate={state.timeRange.endDate}
            rangeLabel={rangeText(state)}
            onPeriodChange={onPeriodChange}
            onDayChange={onDayDateChange}
            onWeekChange={onWeekChange}
            onMonthChange={onMonthChange}
            onCustomDateChange={onCustomDateChange}
          />
        </div>
      </div>
      {storeMenuOpen ? (
        <div
          data-testid="product-board-v1-store-menu"
          className="absolute left-28 top-24 z-30 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
        >
          <div className="mb-2 flex gap-2">
            <button type="button" className="rounded-xl border border-slate-200/80 px-3 py-1 text-xs font-semibold" onClick={onSelectAllStores}>
              全选
            </button>
            <button type="button" className="rounded-xl border border-slate-200/80 px-3 py-1 text-xs font-semibold" onClick={onClearStores}>
              清空
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto">
            {storeOptions.length === 0 ? (
              <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm font-semibold text-slate-500">暂无可选店铺。</p>
            ) : (
              storeOptions.map((store) => (
                <label key={store.key} className="flex items-start gap-2 rounded-xl border border-slate-200/80 p-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(store.key)}
                    onChange={() => onToggleStore(store.key)}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-slate-950">{store.storeName}</span>
                    <span className="text-xs text-slate-500">{store.platformName} · {store.storeId}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProductSettingsPopover({
  items,
  storeOptions,
  onAdd,
  onRemove,
  onClose,
}: {
  items: TempProductItem[];
  storeOptions: StoreOption[];
  onAdd: (products: TempProductItem[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [platformCode, setPlatformCode] = useState("tmall");
  const filteredStores = storeOptions.filter((store) => store.platformCode === platformCode);
  const [storeKeyValue, setStoreKeyValue] = useState("");
  const [productAlias, setProductAlias] = useState("");
  const [productIds, setProductIds] = useState("");
  const platform = PLATFORM_OPTIONS.find((item) => item.code === platformCode) ?? PLATFORM_OPTIONS[0];
  const selectedStore = filteredStores.find((store) => store.key === storeKeyValue) ?? filteredStores[0];
  const addProducts = () => {
    if (!selectedStore) return;
    const ids = uniqueTextList(productIds.split(/\s+/));
    if (ids.length === 0) return;
    onAdd(
      ids.map((productId, index) => ({
        id: `temp-product-${platformCode}-${selectedStore.storeId}-${productId}-${Date.now()}-${index}`,
        platformCode,
        platformName: platform.name,
        storeId: selectedStore.storeId,
        storeName: selectedStore.storeName,
        productId,
        productName: productAlias.trim() || productId,
      })),
    );
    setProductIds("");
  };
  return (
    <aside
      data-testid="product-board-v1-product-settings-popover"
      className="absolute right-4 top-32 z-40 w-[min(620px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">宝贝设置</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            选择平台和店铺后输入商品 ID；宝贝清单保存在本浏览器的跨页面调试上下文。
          </p>
        </div>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          平台
          <select
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={platformCode}
            onChange={(event) => setPlatformCode(event.target.value)}
          >
            {PLATFORM_OPTIONS.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          店铺
          <select
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={selectedStore?.key ?? ""}
            onChange={(event) => setStoreKeyValue(event.target.value)}
          >
            {filteredStores.length === 0 ? <option value="">暂无店铺</option> : null}
            {filteredStores.map((store) => (
              <option key={store.key} value={store.key}>{store.storeName}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          宝贝别名（可选）
          <input
            className="mt-1 w-full rounded-xl border border-slate-200/80 px-2 py-2"
            value={productAlias}
            onChange={(event) => setProductAlias(event.target.value)}
            placeholder="可为空，空时使用商品ID"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-600">
        商品ID / 宝贝ID
        <textarea
          className="mt-1 min-h-24 w-full rounded-xl border border-slate-200/80 px-2 py-2"
          value={productIds}
          onChange={(event) => setProductIds(event.target.value)}
          placeholder="支持多行粘贴，每行一个商品ID"
        />
      </label>
      <button
        type="button"
        className="mt-3 rounded-xl border border-slate-200/80 bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
        onClick={addProducts}
      >
        添加宝贝
      </button>
      <div className="mt-4 max-h-72 space-y-2 overflow-auto">
        {items.length === 0 ? (
          <p className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-sm font-semibold text-slate-500">当前尚未在页面内添加宝贝。已导入商品可直接在“当前宝贝”中选择。</p>
        ) : (
          items.map((product) => (
            <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 p-2 text-xs font-semibold">
              <span className="min-w-0 break-words">
                <span className="font-semibold text-slate-950">{product.platformName} · {product.storeName} · {product.productName}</span>
                <span className="ml-2 text-slate-500">{product.productId}</span>
              </span>
              <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1" onClick={() => onRemove(product.id)}>
                移除
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function ProductTargetPopover({
  values,
  derivedFields,
  unsupportedFields,
  month,
  message,
  canSave,
  onChange,
  onMonthChange,
  onSave,
  onClose,
}: {
  values: Record<string, string>;
  derivedFields: BoardTargetKpiDefinition[];
  unsupportedFields: TargetMetricDefinition[];
  month: string;
  message: TargetMessage;
  canSave: boolean;
  onChange: (label: string, value: string) => void;
  onMonthChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const messageClass =
    message?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : message?.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const inputValues = Object.fromEntries(
    PRODUCT_TARGET_FIELDS.map((field) => [field.title, parseTarget(values[field.title] ?? "")]).filter(([, value]) => value !== null),
  ) as Record<string, number>;
  const metricValues = targetMetricValuesFromDrafts(PRODUCT_TARGET_FIELDS, inputValues);
  return (
    <aside
      data-testid="product-board-v1-product-target"
      className="absolute right-4 top-32 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">宝贝目标</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            目标草稿保存在本浏览器，仅影响目标、差值、完成率和进度条，不改变真实实际值。
          </p>
        </div>
        <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-xs font-semibold" onClick={onClose}>
          关闭
        </button>
      </div>
      <label className="mb-3 block text-xs font-semibold text-slate-600">
        目标月份
        <input
          type="month"
          className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm font-semibold text-slate-950"
          value={month}
          onChange={(event) => onMonthChange(event.target.value || DEFAULT_TARGET_MONTH)}
        />
      </label>
      {message ? (
        <p className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${messageClass}`}>{message.text}</p>
      ) : null}
      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
        <div className="rounded-xl border border-slate-200/80 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">需要填写的目标</p>
          <div className="space-y-2">
            {PRODUCT_TARGET_FIELDS.map((field) => (
              <label key={field.title} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm font-semibold text-slate-800">
                <span>{field.title}</span>
                <span className="flex items-center gap-2">
                  <input
                    className="w-28 rounded-xl border border-slate-200/80 px-2 py-1.5 text-right"
                    value={values[field.title] ?? ""}
                    onChange={(event) => onChange(field.title, event.target.value)}
                  />
                  <span className="w-8 text-slate-600">{field.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">自动推导的目标</p>
          <div className="space-y-2">
            {derivedFields.map((field) => {
              const derived = deriveTargetMetricValue(field.metricKey, metricValues);
              return (
                <div key={field.metricKey} className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="flex items-center justify-between gap-3 text-sm text-slate-900">
                    <span>{field.title}</span>
                    <span>{formatTargetMetricValue(derived.value, field.format)}{derived.value !== null && field.unit !== "%" ? field.unit : ""}</span>
                  </div>
                  <p className="mt-1">{field.deriveFormula}</p>
                  <p className="mt-1 text-slate-500">
                    {derived.value === null && derived.missingDependencies.length === 0
                      ? "仅展示说明，不写入目标草稿。"
                      : derived.missingDependencies.length > 0
                        ? `缺少：${derived.missingDependencies.join("、")}`
                        : "依赖已满足，保存后目标展示会使用该推导值。"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">已隐藏的目标</p>
          <p
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
            title={unsupportedFields.map((field) => `${field.title}: ${field.unsupportedReason ?? "暂不开放输入"}`).join("；")}
          >
            {unsupportedFields.length} 项暂不开放普通输入，保留为信息说明，不写入目标草稿。
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>取消</button>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSave}
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </aside>
  );
}

export function ProductBoardV1Dashboard() {
  const [biState, setBiState] = useState<UIState>(() => createInitialState());
  const [dataSource, setDataSource] = useState<BIHomeDataSource>(() => createEmptyHomeBIDataSource("loading", "读取中"));
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [popup, setPopup] = useState<PopupKind>(null);
  const [chartMode, setChartMode] = useState<V1ChartMode>("mtd");
  const [tempProducts, setTempProducts] = useState<TempProductItem[]>([]);
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [debugContextReady, setDebugContextReady] = useState(false);
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string, number>>({});
  const [targetMonth, setTargetMonth] = useState(DEFAULT_TARGET_MONTH);
  const [targetMessage, setTargetMessage] = useState<TargetMessage>(null);

  const storeOptions = useMemo(() => buildStoreOptions(dataSource, tempProducts), [dataSource, tempProducts]);
  const productOptions = useMemo(() => buildProductOptions(dataSource, tempProducts), [dataSource, tempProducts]);
  const activeStoreKeys = useMemo(
    () => storeOptions.filter((store) => store.status === "active").map((store) => store.key),
    [storeOptions],
  );

  useEffect(() => {
    let active = true;

    loadCrossPageDebugContext()
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") {
          const page = result.snapshot.pages.product;
          setBiState((state) => {
            const merged = mergeDebugContextIntoUIState(state, result.snapshot, "product");
            return {
              ...merged,
              selectedStores: productStoreKeysFromDebugStoreIds(merged.selectedStores, merged.selectedPlatform),
            };
          });
          setChartMode(page.chartMode);
          setTempProducts(page.temporaryTrackedProducts);
          setSelectedProductKey(page.currentProductKey);
        }
        setDebugContextReady(true);
      })
      .catch(() => {
        if (active) setDebugContextReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadHomeBIDataSource()
      .then((nextSource) => {
        if (!active) return;
        setDataSource(nextSource);
        const nextStoreKeys = buildStoreOptions(nextSource, []).map((option) => option.key);
        const nextProductOptions = buildProductOptions(nextSource, []);
        const nextMonth = monthValueFromDate(nextSource.selectedDate);
        setTargetMonth((current) => (current === DEFAULT_TARGET_MONTH ? nextMonth : current));
        setSelectedProductKey((current) => current ?? productKeyFromQuery(nextProductOptions) ?? null);
        setBiState((state) => ({
          ...state,
          selectedStores: state.selectedStores.length > 0 ? state.selectedStores : nextStoreKeys,
          timeRange: {
            ...state.timeRange,
            startDate: state.timeRange.startDate ?? nextSource.selectedDate,
            endDate: state.timeRange.endDate ?? nextSource.selectedDate,
          },
        }));
      })
      .catch(() => {
        if (!active) return;
        setDataSource(createEmptyHomeBIDataSource("error", "读取失败"));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!debugContextReady) return;
    void saveCrossPageDebugContextPatch({
      selectedPlatform: biState.selectedPlatform,
      selectedStores: biState.selectedStores.map(debugStoreIdFromProductStoreKey),
      timeRange: biState.timeRange,
      brandModelFilter: biState.brandModelFilter,
      centerWordGroups: biState.brandModelFilter?.centerWordGroups,
      selectedMetric: biState.selectedMetric,
      chartMode,
      pages: {
        product: {
          selectedMetric: biState.selectedMetric,
          chartMode,
          currentProductKey: selectedProductKey,
          temporaryTrackedProducts: tempProducts,
        },
      },
    });
  }, [
    biState.brandModelFilter,
    biState.selectedMetric,
    biState.selectedPlatform,
    biState.selectedStores,
    biState.timeRange,
    chartMode,
    debugContextReady,
    selectedProductKey,
    tempProducts,
  ]);

  const selectedPoints = useMemo(
    () => scopedProductPoints(dataSource, biState, selectedProductKey),
    [biState, dataSource, selectedProductKey],
  );
  const selectedProduct = productOptions.find((product) => product.key === selectedProductKey) ?? null;
  const brandMetrics = useMemo(
    () => buildProductBrandMetrics(dataSource, selectedProduct, selectedPoints, biState),
    [biState, dataSource, selectedPoints, selectedProduct],
  );
  const allCards = useMemo(() => buildKpiCards(selectedPoints, brandMetrics, targetDrafts), [brandMetrics, selectedPoints, targetDrafts]);
  const cards = useMemo(
    () => DISPLAY_PRODUCT_KPI_KEYS
      .map((key) => allCards.find((card) => card.key === key))
      .filter((card): card is ProductKpiCard => Boolean(card)),
    [allCards],
  );
  const selectedCard = cards.find((card) => card.key === biState.selectedMetric) ?? cards[0];

  useEffect(() => {
    if (DISPLAY_PRODUCT_KPI_KEY_SET.has(String(biState.selectedMetric))) return;
    void Promise.resolve().then(() => {
      setBiState((state) => ({ ...state, selectedMetric: "productGmv" }));
    });
  }, [biState.selectedMetric]);

  const chart = useMemo(
    () => buildChartLines(dataSource, selectedPoints, productOptions, selectedProductKey, biState, selectedCard?.key ?? "productGmv"),
    [biState, dataSource, productOptions, selectedCard?.key, selectedPoints, selectedProductKey],
  );
  const contributions = useMemo(() => buildContributions(selectedPoints), [selectedPoints]);
  const hasSelectedProduct = Boolean(selectedProduct);
  const singleProductContribution = contributions[0] ?? null;

  useEffect(() => {
    let active = true;
    if (!selectedProduct) {
      Promise.resolve().then(() => {
        if (!active) return;
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({ tone: "warning", text: "请选择宝贝后设置目标。" });
      });
      return () => {
        active = false;
      };
    }

    loadActiveTargetDrafts({
      scope: "product",
      platformCode: selectedProduct.platformCode,
      storeId: selectedProduct.storeId,
      productId: selectedProduct.productId,
      month: targetMonth,
    })
      .then((result) => {
        if (!active) return;
        if (result.status === "ok") {
          const nextDrafts: Record<string, number> = {};
          const nextInputs: Record<string, string> = {};
          result.records.forEach((record) => {
            const field = PRODUCT_TARGET_FIELDS.find((definition) => definition.metricKey === record.metricKey);
            if (!field) return;
            nextDrafts[field.title] = record.targetValue;
            nextInputs[field.title] = formatTargetInputValue(record.targetValue);
          });
          setTargetDrafts(nextDrafts);
          setTargetInputs(nextInputs);
          setTargetMessage({ tone: "success", text: "已恢复当前宝贝的目标草稿。" });
          return;
        }
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({
          tone: result.status === "corrupted" ? "warning" : "info",
          text: result.status === "corrupted" ? "目标草稿版本不兼容，已安全忽略。" : "当前宝贝和月份暂无目标草稿。",
        });
      })
      .catch(() => {
        if (!active) return;
        setTargetDrafts({});
        setTargetInputs({});
        setTargetMessage({ tone: "warning", text: "目标草稿读取失败，当前仅显示实际值。" });
      });

    return () => {
      active = false;
    };
  }, [selectedProduct, targetMonth]);

  const handlePeriodChange = (period: PeriodLabel) => {
    const selectedDate = dataSource.selectedDate;
    if (period === "日") {
      setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: selectedDate, endDate: selectedDate } }));
      return;
    }
    if (period === "周") {
      setBiState((state) => ({ ...state, timeRange: { mode: "week", ...weekRangeForDate(selectedDate) } }));
      return;
    }
    if (period === "月") {
      setBiState((state) => ({ ...state, timeRange: { mode: "month", ...monthRangeForDate(selectedDate) } }));
      return;
    }
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom" } }));
  };

  const handleCustomDateChange = (field: "startDate" | "endDate", value: string) => {
    setBiState((state) => ({ ...state, timeRange: { ...state.timeRange, mode: "custom", [field]: value || null } }));
  };

  const handleDayDateChange = (value: string) => {
    const date = value.trim() || null;
    setBiState((state) => ({ ...state, timeRange: { mode: "day", startDate: date, endDate: date } }));
  };

  const handleWeekChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "week", ...v1WeekRangeForWeek(value) } }));
  };

  const handleMonthChange = (value: string) => {
    setBiState((state) => ({ ...state, timeRange: { mode: "month", ...v1MonthRangeForMonth(value) } }));
  };

  const handleToggleStore = (key: string) => {
    setBiState((state) => {
      const selected = new Set(state.selectedStores.filter((id) => id !== NO_STORE_SELECTED));
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      return { ...state, selectedStores: selected.size > 0 ? Array.from(selected) : [NO_STORE_SELECTED] };
    });
  };

  const handleAddProducts = (products: TempProductItem[]) => {
    setTempProducts((current) => [
      ...current.filter(
        (item) =>
          !products.some(
            (product) =>
              productKey(product.platformCode, product.storeId, product.productId) ===
              productKey(item.platformCode, item.storeId, item.productId),
          ),
      ),
      ...products,
    ]);
    setBiState((state) => {
      const selected = new Set(state.selectedStores.filter((id) => id !== NO_STORE_SELECTED));
      products.forEach((product) => selected.add(storeKey(product.platformCode, product.storeId)));
      return { ...state, selectedStores: Array.from(selected) };
    });
    const firstProduct = products[0];
    if (firstProduct) setSelectedProductKey(productKey(firstProduct.platformCode, firstProduct.storeId, firstProduct.productId));
  };

  const handleSaveTargets = async () => {
    if (!selectedProduct) {
      setTargetMessage({ tone: "warning", text: "请选择宝贝后设置目标。" });
      return;
    }

    const nextDrafts = Object.fromEntries(
      Object.entries(targetInputs)
        .filter(([label]) => PRODUCT_TARGET_FIELDS.some((field) => field.title === label))
        .map(([label, value]) => [label, parseTarget(value)] as const)
        .filter(([, value]) => value !== null),
    ) as Record<string, number>;

    const now = new Date().toISOString();
    const records: TargetDraftRecord[] = [];
    PRODUCT_TARGET_FIELDS.forEach((field) => {
      const value = parseTarget(targetInputs[field.title] ?? "");
      if (value === null) return;
      records.push({
        schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
        targetId: createProductTargetId({
          platformCode: selectedProduct.platformCode,
          storeId: selectedProduct.storeId,
          productId: selectedProduct.productId,
          month: targetMonth,
          metricKey: field.metricKey,
        }),
        scope: "product",
        platformCode: selectedProduct.platformCode,
        storeId: selectedProduct.storeId,
        seriesId: null,
        productId: selectedProduct.productId,
        month: targetMonth,
        metricKey: field.metricKey,
        targetValue: value,
        unit: field.unit,
        createdAt: now,
        updatedAt: now,
        status: "active",
      });
    });

    if (records.length > 0) {
      const result = await saveTargetDrafts(records);
      if (result.status !== "saved") {
        setTargetMessage({
          tone: "warning",
          text: "宝贝目标草稿保存失败，请检查目标值和单位。",
        });
        return;
      }
    }

    setTargetDrafts(nextDrafts);
    setTargetMessage({ tone: "success", text: "已保存当前宝贝目标草稿，刷新后可继续查看。" });
    setPopup(null);
  };

  return (
    <div data-testid="product-board-v1-dashboard" className="fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px]">
          <ControlBar
            state={biState}
            storeOptions={storeOptions}
            productOptions={productOptions}
            selectedProductKey={selectedProductKey}
            productSearch={productSearch}
            storeMenuOpen={storeMenuOpen}
            onToggleStoreMenu={() => setStoreMenuOpen((open) => !open)}
            onToggleStore={handleToggleStore}
            onSelectAllStores={() => setBiState((state) => ({ ...state, selectedStores: activeStoreKeys }))}
            onClearStores={() => setBiState((state) => ({ ...state, selectedStores: [NO_STORE_SELECTED] }))}
            onSelectProduct={(key) => setSelectedProductKey(key || null)}
            onProductSearchChange={setProductSearch}
            onOpenPopup={setPopup}
            onPeriodChange={handlePeriodChange}
            onDayDateChange={handleDayDateChange}
            onWeekChange={handleWeekChange}
            onMonthChange={handleMonthChange}
            onCustomDateChange={handleCustomDateChange}
          />
          {popup === "product" ? (
            <ProductSettingsPopover
              items={tempProducts}
              storeOptions={storeOptions}
              onAdd={handleAddProducts}
              onRemove={(id) => {
                const removed = tempProducts.find((product) => product.id === id);
                const removedKey = removed ? productKey(removed.platformCode, removed.storeId, removed.productId) : null;
                setTempProducts((current) => current.filter((product) => product.id !== id));
                setSelectedProductKey((current) => {
                  if (current !== removedKey) return current;
                  return null;
                });
              }}
              onClose={() => setPopup(null)}
            />
          ) : null}
          {popup === "target" ? (
            <ProductTargetPopover
              values={targetInputs}
              derivedFields={PRODUCT_DERIVED_TARGET_FIELDS}
              unsupportedFields={PRODUCT_UNSUPPORTED_TARGET_FIELDS}
              month={targetMonth}
              message={targetMessage}
              canSave={Boolean(selectedProduct)}
              onChange={(label, value) => setTargetInputs((inputs) => ({ ...inputs, [label]: value }))}
              onMonthChange={setTargetMonth}
              onSave={handleSaveTargets}
              onClose={() => setPopup(null)}
            />
          ) : null}
          {popup === "brandModel" ? (
            <BrandModelFilterPopover
              value={biState.brandModelFilter}
              testId="product-board-v1-brand-model-filter-popover"
              onSave={(filter: BrandModelFilter) => {
                setBiState((state) => ({ ...state, brandModelFilter: filter }));
                setPopup(null);
              }}
              onClear={() =>
                setBiState((state) => ({
                  ...state,
                  brandModelFilter: { brandWords: [], modelWords: [], centerWordGroups: [] },
                }))
              }
              onClose={() => setPopup(null)}
            />
          ) : null}

          <div className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
            <span className="mr-3 text-slate-900">{dataSource.dataStatus.label}</span>
            {hasSelectedProduct ? "当前为单宝贝视图" : PRODUCT_SELECTION_PROMPT}
          </div>
          <V1DimensionScopeBar
            testId="product-board-v1-dimension-scope"
            platform={selectedProduct?.platformName ?? "全部平台"}
            store={selectedProduct?.storeName ?? "未选择店铺"}
            series="不按系列聚合"
            product={selectedProduct ? `${selectedProduct.productName} · ${selectedProduct.productId}` : "请选择当前宝贝"}
          />

          <section data-testid="product-board-v1-current-product-info" className="mx-4 mt-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-slate-950">{selectedProduct?.productName ?? "暂无选中宝贝"}</h2>
                <p className="mt-1 break-words text-xs font-semibold text-slate-500">
                  商品ID {selectedProduct?.productId ?? "--"} · {selectedProduct?.platformName ?? "--"} · {selectedProduct?.storeName ?? "--"}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs font-semibold text-slate-600 md:grid-cols-3">
                <div>
                  <dt>当前日期</dt>
                  <dd className="text-slate-950">{dataSource.selectedDate ?? "--"}</dd>
                </div>
                <div>
                  <dt>数据状态</dt>
                  <dd className="text-slate-950">{selectedPoints.length > 0 ? "有当前范围数据" : "暂无当前范围数据"}</dd>
                </div>
                <div>
                  <dt>视图范围</dt>
                  <dd className="text-slate-950">单宝贝</dd>
                </div>
              </dl>
            </div>
          </section>

          <section data-testid="product-board-v1-kpi-section" className="px-4 py-3" data-problem-ids="PVM2-002 PVM2-009">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">宝贝指标</h2>
              <div className="text-xs font-semibold text-slate-500">当前宝贝口径展示当前值、目标、差值、完成率和进度</div>
            </div>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" aria-label="宝贝 KPI 指标卡片">
              {cards.map((card) => (
                <KpiCard
                  key={card.key}
                  card={hasSelectedProduct ? card : { ...card, value: "--", rawValue: null, difference: "--", completionRate: "--", progress: 0 }}
                  selected={selectedCard?.key === card.key}
                  onClick={() => setBiState((state) => ({ ...state, selectedMetric: card.key }))}
                />
              ))}
            </section>
          </section>
          <section data-testid="product-board-v1-chart-section" className="px-4 py-3" data-problem-ids="PVM2-004 PVM2-009">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words text-base font-semibold text-slate-950">宝贝趋势与流量漏斗</h2>
              <div className="text-xs font-semibold text-slate-500">MTD / DLY 单图切换，只展示当前选中宝贝</div>
            </div>
          <section className="grid grid-cols-1 gap-4 pb-4">
            <BIChartCard
              chart={{ ...chart, empty: !hasSelectedProduct || chart.empty }}
              mode={chartMode}
              onModeChange={setChartMode}
              variant={chartMode === "mtd" ? "line" : "bar"}
              maxLegendItems={3}
              description={hasSelectedProduct && selectedCard ? `${selectedCard.title} · 当前值 ${selectedCard.value}` : "请选择宝贝和 KPI 查看趋势"}
              emptyText="当前宝贝暂无可展示趋势"
              testId="product-board-v1-chart-panel"
              modeSwitchTestId="product-board-v1-chart-mode-switch"
            />
          </section>

          <div className="pb-5">
            <SingleProductFunnel item={hasSelectedProduct ? singleProductContribution : null} />
          </div>
          </section>
          </div>
        </div>
      </main>
    </div>
  );
}
