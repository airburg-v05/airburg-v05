import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallProductBoardOverview,
  type TmallProductTableRow,
} from "../../lib/tmall/view-models/product-board";
import {
  buildTmallProductTableOperatingFilters,
  filterTmallProductTableRows,
} from "../../lib/tmall/view-models/product-table-operating-filters";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const PRODUCT_ID = "937706023658";

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

const searchRows = (rows: TmallProductTableRow[], searchTerm: string): TmallProductTableRow[] => {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  return normalizedSearch
    ? rows.filter((row) =>
        `${row.productName} ${row.productId}`.toLowerCase().includes(normalizedSearch),
      )
    : rows;
};

const ensureRuleCoverageRows = (rows: TmallProductTableRow[]): TmallProductTableRow[] => {
  const clonedRows = rows.map((row) => ({ ...row }));
  const conversionIndex = clonedRows.findIndex((row) => row.visitors > 0);
  if (conversionIndex >= 0) {
    clonedRows[conversionIndex] = {
      ...clonedRows[conversionIndex],
      visitors: Math.max(clonedRows[conversionIndex].visitors, 200),
      paidBuyers: 1,
      conversionRate: 0.005,
    };
  }

  const adIndex = clonedRows.findIndex((row) => row.hasAdData && row.adSpend !== null && row.adSpend > 0);
  if (adIndex >= 0) {
    clonedRows[adIndex] = {
      ...clonedRows[adIndex],
      adSpend: Math.max(clonedRows[adIndex].adSpend ?? 0, 100),
      adRoi: 0.5,
    };
  }

  return clonedRows;
};

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
  const overview = buildTmallProductBoardOverview(result, TEST_DATE, PRODUCT_ID);
  const beforeOverviewPayload = JSON.stringify(overview);
  const beforeRowsPayload = JSON.stringify(overview.productTableRows);
  const viewModel = buildTmallProductTableOperatingFilters(
    overview.productTableRows,
    overview.selectedProductId,
  );
  const coverageRows = ensureRuleCoverageRows(overview.productTableRows);
  const coverageViewModel = buildTmallProductTableOperatingFilters(
    coverageRows,
    overview.selectedProductId,
  );
  const salesTopRows = filterTmallProductTableRows(
    overview.productTableRows,
    "sales_top",
    viewModel.salesTopProductIds,
  );
  const hasAdRows = filterTmallProductTableRows(
    overview.productTableRows,
    "has_ad",
    viewModel.salesTopProductIds,
  );
  const noAdRows = filterTmallProductTableRows(
    overview.productTableRows,
    "no_ad",
    viewModel.salesTopProductIds,
  );
  const afterSalesRows = filterTmallProductTableRows(
    overview.productTableRows,
    "after_sales",
    viewModel.salesTopProductIds,
  );
  const coverageConversionRows = filterTmallProductTableRows(
    coverageRows,
    "conversion_watch",
    coverageViewModel.salesTopProductIds,
  );
  const coverageAdEfficiencyRows = filterTmallProductTableRows(
    coverageRows,
    "ad_efficiency_watch",
    coverageViewModel.salesTopProductIds,
  );
  const selectedTags = viewModel.rowTagsByProductId[overview.selectedProductId ?? ""] ?? [];
  const hasAdSearchResult = searchRows(hasAdRows, hasAdRows[0]?.productId ?? "");
  const impossibleSearchResult = searchRows(hasAdRows, "not-existing-product-keyword");
  const safePayload = { viewModel, coverageViewModel };
  const safePayloadString = JSON.stringify(safePayload);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    safePayloadString.includes(fieldName),
  );
  const output = {
    allCountMatchesRows:
      viewModel.filters.find((filter) => filter.key === "all")?.count ===
      overview.productTableRows.length,
    salesTopWithinLimit: salesTopRows.length <= 5,
    hasAdOnlyHasAdData: hasAdRows.length > 0 && hasAdRows.every((row) => row.hasAdData),
    noAdOnlyNoAdData: noAdRows.length > 0 && noAdRows.every((row) => !row.hasAdData),
    noAdAdValuesAreMissing:
      noAdRows.length > 0 &&
      noAdRows.every((row) => row.adSpend === null && row.adRoi === null),
    afterSalesUsesAggregatedRefund:
      afterSalesRows.length > 0 &&
      afterSalesRows.every((row) => row.refundSuccessAmount > 0),
    conversionWatchRuleWorks:
      coverageConversionRows.length > 0 &&
      coverageConversionRows.every(
        (row) =>
          (row.visitors > 0 && row.paidBuyers === 0) ||
          (row.visitors >= 100 && row.conversionRate !== null && row.conversionRate < 0.01),
      ),
    adEfficiencyWatchRuleWorks:
      coverageAdEfficiencyRows.length > 0 &&
      coverageAdEfficiencyRows.every(
        (row) =>
          row.hasAdData &&
          row.adSpend !== null &&
          row.adSpend > 0 &&
          (row.adRoi === null || row.adRoi < 1),
      ),
    selectedRowHighlighted: selectedTags.some((tag) => tag.key === "selected"),
    selectedRowHasCurrentTag: selectedTags.some((tag) => tag.label === "当前查看"),
    searchAndFilterIntersectionWorks:
      hasAdSearchResult.length === 1 &&
      hasAdSearchResult.every((row) => row.hasAdData) &&
      impossibleSearchResult.length === 0,
    emptyFilterStateSafe:
      searchRows(hasAdRows, "not-existing-product-keyword").length === 0,
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
  };

  const checksPassed =
    output.allCountMatchesRows &&
    output.salesTopWithinLimit &&
    output.hasAdOnlyHasAdData &&
    output.noAdOnlyNoAdData &&
    output.noAdAdValuesAreMissing &&
    output.afterSalesUsesAggregatedRefund &&
    output.conversionWatchRuleWorks &&
    output.adEfficiencyWatchRuleWorks &&
    output.selectedRowHighlighted &&
    output.selectedRowHasCurrentTag &&
    output.searchAndFilterIntersectionWorks &&
    output.emptyFilterStateSafe &&
    output.noPlanBackfillSuggestion &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.overviewObjectMutated &&
    !output.productTableRowsMutated;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_product_table_operating_filters_validation_failed");
  process.exitCode = 1;
});
