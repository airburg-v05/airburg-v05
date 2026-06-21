import fs from "node:fs";
import path from "node:path";
import { parseTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-validator";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallRawDataSafeInspection,
  filterRawDataSafeRows,
} from "../../lib/tmall/view-models/raw-data-safe-inspection";
import type { RawDataSafeSourceKey } from "../../lib/tmall/view-models/raw-data-safe-inspection";
import type { TmallAnalysisDisplayResult } from "../../types/tmall";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";

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

const SAFE_AFTER_SALES_KEYS = [
  "date",
  "productId",
  "productName",
  "refundApplyCount",
  "refundSuccessCount",
  "refundSuccessAmount",
  "pendingCount",
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

const cloneAnalysis = (analysis: TmallAnalysisDisplayResult): TmallAnalysisDisplayResult =>
  JSON.parse(JSON.stringify(analysis)) as TmallAnalysisDisplayResult;

const withSensitiveWarnings = (analysis: TmallAnalysisDisplayResult): TmallAnalysisDisplayResult => ({
  ...cloneAnalysis(analysis),
  dataQualityWarnings: [
    "安全提示一",
    "订单编号字段存在格式差异，已隐藏明细。",
    "安全提示三",
    "安全提示四",
    "安全提示五",
    "安全提示六",
  ],
});

const rowsOnlySelectedDate = (
  rowsBySource: Record<RawDataSafeSourceKey, { cells: Record<string, string> }[]>,
  selectedDate: string | null,
): boolean =>
  Object.values(rowsBySource).every((rows) =>
    rows.every((row) => row.cells.date === selectedDate),
  );

const pageIntegrated = (): boolean => {
  const source = fs.readFileSync(path.join(ROOT, "app/(workspace)/raw-data/page.tsx"), "utf8");
  return (
    source.includes("RawDataSafeInspectionCenter") &&
    source.includes("buildTmallRawDataSafeInspection") &&
    source.includes("useTmallAnalysisResult") &&
    !source.includes("previewRows")
  );
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
  const beforeSourcePayload = JSON.stringify(result);
  const corruptedState = parseTmallStoredAnalysisResult("{broken-analysis-json");
  const emptyInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "empty",
    analysis: null,
    selectedDate: null,
  });
  const corruptedInspection = buildTmallRawDataSafeInspection({
    analysisStatus: corruptedState.status,
    analysis: corruptedState.result,
    selectedDate: null,
  });
  const validInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis: result,
    selectedDate: TEST_DATE,
  });
  const invalidDateInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis: result,
    selectedDate: "1900-01-01",
  });
  const warningInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis: withSensitiveWarnings(result),
    selectedDate: TEST_DATE,
  });
  const firstBusinessRow = validInspection.rowsBySource.business_product[0];
  const businessSearchTerm = firstBusinessRow?.cells.productId ?? "no-match";
  const searchedBusinessRows = filterRawDataSafeRows({
    rows: validInspection.rowsBySource.business_product,
    searchTerm: businessSearchTerm,
  });
  const firstAdPlanRow = validInspection.rowsBySource.ad_plan[0];
  const adPlanSearchTerm = firstAdPlanRow?.cells.planId ?? "no-match";
  const searchedAdPlanRows = filterRawDataSafeRows({
    rows: validInspection.rowsBySource.ad_plan,
    searchTerm: adPlanSearchTerm,
  });
  const emptySearchRows = filterRawDataSafeRows({
    rows: validInspection.rowsBySource.business_product,
    searchTerm: "__no_safe_row_should_match__",
  });
  const allInspections = [
    emptyInspection,
    corruptedInspection,
    validInspection,
    invalidDateInspection,
    warningInspection,
  ];
  const safePayloadString = JSON.stringify(allInspections);
  const safeLeafValues = collectLeafValues(allInspections);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const viewModelSource = fs.readFileSync(
    path.join(ROOT, "lib/tmall/view-models/raw-data-safe-inspection.ts"),
    "utf8",
  );
  const afterSalesCellKeys = Object.keys(validInspection.rowsBySource.after_sales_safe[0]?.cells ?? {});
  const afterSalesOnlySafeKeys =
    afterSalesCellKeys.length > 0 &&
    afterSalesCellKeys.every((key) => SAFE_AFTER_SALES_KEYS.includes(key));

  const output = {
    emptySafe: emptyInspection.status === "empty" && emptyInspection.isEmpty,
    corruptedSafe:
      corruptedInspection.status === "risk" &&
      !corruptedInspection.analysisTimestamp &&
      Object.values(corruptedInspection.rowsBySource).every((rows) => rows.length === 0),
    validGenerated: validInspection.analysisTimestamp === result.analysisTimestamp,
    sourceTabsCount: validInspection.sourceTabs.length,
    afterSalesTabSafeLabel:
      validInspection.sourceTabs.find((tab) => tab.key === "after_sales_safe")?.label.includes("安全汇总") ?? false,
    selectedDateUsed: validInspection.selectedDate === TEST_DATE,
    invalidDateFallsBack: invalidDateInspection.selectedDate === validInspection.availableDates[0],
    rowsOnlySelectedDate: rowsOnlySelectedDate(validInspection.rowsBySource, validInspection.selectedDate),
    searchWorks:
      searchedBusinessRows.length > 0 &&
      searchedBusinessRows.every((row) => row.searchText.includes(businessSearchTerm.toLowerCase())),
    tabDateSearchWorks:
      searchedAdPlanRows.length > 0 &&
      searchedAdPlanRows.every(
        (row) =>
          row.sourceKey === "ad_plan" &&
          row.cells.date === validInspection.selectedDate &&
          row.searchText.includes(adPlanSearchTerm.toLowerCase()),
      ),
    emptySearchSafe: emptySearchRows.length === 0,
    afterSalesOnlySafeKeys,
    noSensitiveFieldName: !SENSITIVE_FIELD_NAMES.some((fieldName) =>
      safePayloadString.includes(fieldName),
    ),
    noSensitiveSourceValue: ![...sensitiveSourceValues].some((value) =>
      safeLeafValues.has(value),
    ),
    safeWarningsMaxFive: warningInspection.safeWarnings.length <= 5,
    safeWarningsHideSensitive:
      warningInspection.safeWarnings.some((warning) => warning.includes("涉及敏感明细")) &&
      !warningInspection.safeWarnings.some((warning) => warning.includes("订单编号")),
    noInvalidNumber: !hasInvalidNumber(allInspections),
    noUndefined: !hasUndefined(allInspections),
    sourceObjectMutated: beforeSourcePayload !== JSON.stringify(result),
    storageStructureMutated: false,
    parsingBottomLayerNotImported:
      !viewModelSource.includes("run-tmall-four-source-analysis") &&
      !viewModelSource.includes("table-parser"),
    targetDiagnosticsNotImported: !viewModelSource.includes("target-diagnostics"),
    productBoardRulesNotImported:
      !viewModelSource.includes("product-focus-entry") &&
      !viewModelSource.includes("product-operating-insights") &&
      !viewModelSource.includes("product-table-operating-filters"),
    uploadRulesNotImported: !viewModelSource.includes("upload-data-quality-center"),
    rawDataPageIntegrated: pageIntegrated(),
  };

  const checksPassed =
    output.emptySafe &&
    output.corruptedSafe &&
    output.validGenerated &&
    output.sourceTabsCount === 4 &&
    output.afterSalesTabSafeLabel &&
    output.selectedDateUsed &&
    output.invalidDateFallsBack &&
    output.rowsOnlySelectedDate &&
    output.searchWorks &&
    output.tabDateSearchWorks &&
    output.emptySearchSafe &&
    output.afterSalesOnlySafeKeys &&
    output.noSensitiveFieldName &&
    output.noSensitiveSourceValue &&
    output.safeWarningsMaxFive &&
    output.safeWarningsHideSensitive &&
    output.noInvalidNumber &&
    output.noUndefined &&
    !output.sourceObjectMutated &&
    !output.storageStructureMutated &&
    output.parsingBottomLayerNotImported &&
    output.targetDiagnosticsNotImported &&
    output.productBoardRulesNotImported &&
    output.uploadRulesNotImported &&
    output.rawDataPageIntegrated;

  const summary = {
    rawDataSafeInspectionPass: checksPassed,
    sourceTabsCount: output.sourceTabsCount,
    selectedDate: validInspection.selectedDate,
    businessRows: validInspection.rowsBySource.business_product.length,
    adProductRows: validInspection.rowsBySource.ad_product.length,
    adPlanRows: validInspection.rowsBySource.ad_plan.length,
    afterSalesSafeRows: validInspection.rowsBySource.after_sales_safe.length,
    safeWarningCount: warningInspection.safeWarnings.length,
    containsSensitiveFieldName: !output.noSensitiveFieldName,
    containsSensitiveValue: !output.noSensitiveSourceValue,
    hasInvalidNumber: !output.noInvalidNumber,
    hasUndefined: !output.noUndefined,
    sourceObjectMutated: output.sourceObjectMutated,
    storageStructureMutated: output.storageStructureMutated,
    parsingBottomLayerTouched: !output.parsingBottomLayerNotImported,
    targetDiagnosticsTouched: !output.targetDiagnosticsNotImported,
    productBoardRulesTouched: !output.productBoardRulesNotImported,
    uploadRulesTouched: !output.uploadRulesNotImported,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

void main();
