import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallProductBoardOverview,
  type TmallProductTableRow,
} from "../../lib/tmall/view-models/product-board";
import {
  buildTmallProductBoardSectionNav,
  PRODUCT_BOARD_SECTION_IDS,
} from "../../lib/tmall/view-models/product-board-section-nav";
import { buildTmallProductFocusEntry } from "../../lib/tmall/view-models/product-focus-entry";
import { buildTmallProductOperatingInsights } from "../../lib/tmall/view-models/product-operating-insights";
import {
  buildTmallProductTableOperatingFilters,
  filterTmallProductTableRows,
} from "../../lib/tmall/view-models/product-table-operating-filters";
import {
  buildTmallProductTargetDiagnostics,
  type TmallTargetDiagnosticSummary,
} from "../../lib/tmall/view-models/target-diagnostics";
import { buildTmallProductTargetSummary } from "../../lib/tmall/view-models/product-target-summary";
import { buildTmallProductTrendSection } from "../../lib/tmall/view-models/product-trend-section";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";

const SENSITIVE_FIELD_NAMES = [
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

const SENSITIVE_VALUE_HEADERS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
];

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const isCheckableSensitiveValue = (value: string): boolean => {
  const placeholders = new Set(["-", "--", "无", "暂无", "空", "null", "NULL", "0"]);
  return value.length >= 4 && !placeholders.has(value);
};

const collectLeafValues = (value: unknown, values = new Set<string>()): Set<string> => {
  const normalized = normalizeLeafValue(value);
  if (normalized !== null) {
    values.add(normalized);
    return values;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectLeafValues(item, values));
    return values;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectLeafValues(item, values));
  }

  return values;
};

const collectSensitiveSourceValues = async (afterSalesFile: File): Promise<Set<string>> => {
  const table = await parseTmallTableFile(afterSalesFile);
  const values = new Set<string>();

  table.rows.forEach((row) => {
    SENSITIVE_VALUE_HEADERS.forEach((header) => {
      const normalized = normalizeLeafValue(row[header]);
      if (normalized && isCheckableSensitiveValue(normalized)) {
        values.add(normalized);
      }
    });
  });

  return values;
};

const hasInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(hasInvalidNumber);
  return false;
};

const hasUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
  return false;
};

const target = (
  values: Omit<TmallTargetDefinition, "periodType" | "periodValue" | "createdAt" | "updatedAt">,
): TmallTargetDefinition => ({
  periodType: "daily",
  periodValue: TEST_DATE,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...values,
});

const buildTargets = (): TmallTargetDefinition[] => [
  target({
    id: "product_final_qa_gmv_target",
    name: "当前商品 GMV 目标验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "product_final_qa_ad_roi_target",
    name: "当前商品 ROI 目标验证",
    scope: "product",
    metricKey: "adRoi",
    targetValue: 100,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "product_final_qa_no_ad_target",
    name: "无推广商品花费目标验证",
    scope: "product",
    metricKey: "adSpend",
    targetValue: 1000,
    direction: "lower_is_better",
    status: "active",
    productId: NO_AD_PRODUCT_ID,
  }),
];

const searchRows = (rows: TmallProductTableRow[], searchTerm: string): TmallProductTableRow[] => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return normalizedSearch
    ? rows.filter((row) =>
        `${row.productName} ${row.productId}`.toLowerCase().includes(normalizedSearch),
      )
    : rows;
};

const pageSource = (): string =>
  fs.readFileSync(path.join(ROOT, "app/(workspace)/product-board/page.tsx"), "utf8");

const componentSource = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const hasDuplicateValues = (values: string[]): boolean =>
  new Set(values).size !== values.length;

const buildProductDiagnostics = (
  targets: TmallTargetDefinition[],
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productId: string | null,
): TmallTargetDiagnosticSummary =>
  buildTmallProductTargetDiagnostics({
    targets,
    analysis: result,
    productId,
    options: { maxItems: 5 },
  });

const main = async () => {
  const afterSalesFile = createFile("private-samples/tmall/after-sales/当日售后退货表.xlsx");
  const result = await runTmallFourSourceAnalysis({
    businessProductFile: createFile(
      "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
    ),
    adProductFile: createFile("private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
    adPlanFile: createFile("private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });

  const beforeResultPayload = JSON.stringify(result);
  const targets = buildTargets();
  const overview = buildTmallProductBoardOverview(result, TEST_DATE, PRODUCT_ID);
  const beforeOverviewPayload = JSON.stringify(overview);
  const beforeRowsPayload = JSON.stringify(overview.productTableRows);
  const focusEntry = buildTmallProductFocusEntry(overview);
  const targetSummary = buildTmallProductTargetSummary({
    targets,
    analysis: result,
    productId: overview.selectedProductId,
  });
  const targetDiagnostics = buildProductDiagnostics(
    targets,
    result,
    overview.selectedProductId,
  );
  const beforeTargetDiagnosticsPayload = JSON.stringify(targetDiagnostics);
  const trendSection = overview.selectedProductId
    ? buildTmallProductTrendSection(result, overview.selectedProductId)
    : null;
  const operatingInsights = buildTmallProductOperatingInsights({
    overview,
    targetDiagnostics,
    trendSection,
  });
  const tableFilters = buildTmallProductTableOperatingFilters(
    overview.productTableRows,
    overview.selectedProductId,
  );
  const noSelectedTargetSummary = buildTmallProductTargetSummary({
    targets,
    analysis: result,
    productId: null,
  });
  const noSelectedTargetDiagnostics = buildProductDiagnostics(targets, result, null);
  const noSelectedInsights = buildTmallProductOperatingInsights({
    overview: null,
    targetDiagnostics: noSelectedTargetDiagnostics,
    trendSection: null,
  });
  const emptyFocusEntry = buildTmallProductFocusEntry(null);
  const nav = buildTmallProductBoardSectionNav({ hasTrendSection: Boolean(trendSection) });
  const navWithoutTrend = buildTmallProductBoardSectionNav({ hasTrendSection: false });
  const source = pageSource();
  const focusEntrySource = componentSource("components/product-board/product-focus-entry.tsx");
  const productTableSource = componentSource("components/product-board/product-data-table.tsx");
  const hasAdRows = filterTmallProductTableRows(
    overview.productTableRows,
    "has_ad",
    tableFilters.salesTopProductIds,
  );
  const noAdRows = filterTmallProductTableRows(
    overview.productTableRows,
    "no_ad",
    tableFilters.salesTopProductIds,
  );
  const noAdProductSearchInHasAdRows = searchRows(hasAdRows, NO_AD_PRODUCT_ID);
  const safePayload = {
    focusEntry,
    operatingInsights,
    targetSummary,
    targetDiagnostics,
    trendSection,
    tableFilters,
    nav,
    navWithoutTrend,
    noSelectedTargetSummary,
    noSelectedTargetDiagnostics,
    noSelectedInsights,
    emptyFocusEntry,
  };
  const safePayloadString = JSON.stringify(safePayload);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    safePayloadString.includes(fieldName),
  );
  const sectionIdsFromNav = nav.items.map((item) => item.sectionId);
  const sectionIdsExistInPage = PRODUCT_BOARD_SECTION_IDS.every((sectionId) =>
    source.includes(`id="${sectionId}"`),
  );
  const allNavIdsMatchPage =
    sectionIdsFromNav.every((sectionId) => source.includes(`id="${sectionId}"`)) &&
    PRODUCT_BOARD_SECTION_IDS.every((sectionId) => sectionIdsFromNav.includes(sectionId));

  const output = {
    focusEntryGenerated:
      !focusEntry.isEmpty &&
      focusEntry.salesTopProducts.length > 0 &&
      focusEntry.selectedProduct?.productId === PRODUCT_ID,
    operatingInsightsGenerated:
      !operatingInsights.isEmpty &&
      operatingInsights.productId === PRODUCT_ID &&
      operatingInsights.modules.length === 5,
    targetSummaryGenerated:
      targetSummary.productId === PRODUCT_ID && targetSummary.totalProductTargetCount > 0,
    targetDiagnosticsGenerated:
      targetDiagnostics.totalDiagnosticCount > 0 &&
      targetDiagnostics.items.every((item) => item.scope === "product"),
    tableFiltersGenerated:
      tableFilters.filters.find((filter) => filter.key === "all")?.count ===
      overview.productTableRows.length,
    trendSectionSafe:
      trendSection !== null &&
      trendSection.cards.length === 6 &&
      !hasInvalidNumber(trendSection),
    navKeysUnique: !hasDuplicateValues(nav.items.map((item) => item.key)),
    navIdsUnique: !hasDuplicateValues(sectionIdsFromNav),
    navIdsMatchPage: allNavIdsMatchPage && sectionIdsExistInPage,
    noSelectedProductSafe:
      noSelectedTargetSummary.totalProductTargetCount === 0 &&
      noSelectedTargetDiagnostics.totalDiagnosticCount === 0 &&
      noSelectedInsights.isEmpty &&
      emptyFocusEntry.isEmpty,
    dateChangeClearsSelectedProduct:
      source.includes("const handleDateChange = (date: string)") &&
      source.includes("setSelectedProductId(null);"),
    focusEntryClickStillSelectsProduct:
      source.includes("onSelectProduct={setSelectedProductId}") &&
      focusEntrySource.includes("onClick={() => onSelectProduct(item.productId)}"),
    searchAndFilterIntersectionWorks:
      hasAdRows.length > 0 &&
      noAdRows.length > 0 &&
      noAdProductSearchInHasAdRows.length === 0,
    noAdRowsDisplayMissing:
      noAdRows.length > 0 &&
      noAdRows.every((row) => row.adSpend === null && row.adRoi === null) &&
      productTableSource.includes("formatTableRoi") &&
      productTableSource.includes('return "--";'),
    noMisleadingZeroText:
      !safePayloadString.includes("0.00 倍") &&
      !productTableSource.includes("formatRoi(row.adRoi)") &&
      !productTableSource.includes("按 0 计算") &&
      !productTableSource.includes("显示为 0"),
    noPlanBackfillSuggestion:
      !safePayloadString.includes("用计划推广补齐") &&
      !safePayloadString.includes("使用计划推广补齐"),
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    overviewObjectMutated: beforeOverviewPayload !== JSON.stringify(overview),
    productTableRowsMutated: beforeRowsPayload !== JSON.stringify(overview.productTableRows),
    targetDiagnosticsObjectMutated:
      beforeTargetDiagnosticsPayload !== JSON.stringify(targetDiagnostics),
  };

  const checksPassed =
    output.focusEntryGenerated &&
    output.operatingInsightsGenerated &&
    output.targetSummaryGenerated &&
    output.targetDiagnosticsGenerated &&
    output.tableFiltersGenerated &&
    output.trendSectionSafe &&
    output.navKeysUnique &&
    output.navIdsUnique &&
    output.navIdsMatchPage &&
    output.noSelectedProductSafe &&
    output.dateChangeClearsSelectedProduct &&
    output.focusEntryClickStillSelectsProduct &&
    output.searchAndFilterIntersectionWorks &&
    output.noAdRowsDisplayMissing &&
    output.noMisleadingZeroText &&
    output.noPlanBackfillSuggestion &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.overviewObjectMutated &&
    !output.productTableRowsMutated &&
    !output.targetDiagnosticsObjectMutated;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_product_board_final_usability_validation_failed");
  process.exitCode = 1;
});
