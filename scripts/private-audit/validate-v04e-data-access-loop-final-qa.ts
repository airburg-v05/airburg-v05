import fs from "node:fs";
import path from "node:path";
import { parseTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-validator";
import { parseTmallSeriesGroupStorage } from "../../lib/storage/tmall-series-storage";
import { parseTmallTargetStorage } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallGlobalDataStatusGuide } from "../../lib/tmall/view-models/global-data-status-guide";
import {
  buildTmallHomeSectionNav,
  HOME_SECTION_IDS,
} from "../../lib/tmall/view-models/home-section-nav";
import { buildTmallHomeWorkbenchOverview } from "../../lib/tmall/view-models/home-workbench-overview";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
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
import { buildTmallProductTargetDiagnostics } from "../../lib/tmall/view-models/target-diagnostics";
import { buildTmallProductTrendSection } from "../../lib/tmall/view-models/product-trend-section";
import { buildTmallRawDataSafeInspection } from "../../lib/tmall/view-models/raw-data-safe-inspection";
import { buildTmallSeriesBoardOverview } from "../../lib/tmall/view-models/series-board";
import { buildTmallStoreBoardOverview } from "../../lib/tmall/view-models/store-board";
import { buildTmallUploadDataQualityCenter } from "../../lib/tmall/view-models/upload-data-quality-center";
import type { TmallAnalysisDisplayResult, TmallSourceType } from "../../types/tmall";

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

const PAGE_SOURCES = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/raw-data/page.tsx",
  "app/(workspace)/targets/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/login/page.tsx",
];

const V04E_CORE_SOURCES = [
  "lib/tmall/view-models/home-workbench-overview.ts",
  "lib/tmall/view-models/home-section-nav.ts",
  "lib/tmall/view-models/global-data-status-guide.ts",
  "lib/tmall/view-models/upload-data-quality-center.ts",
  "lib/tmall/view-models/raw-data-safe-inspection.ts",
];

const PRODUCT_V04D_SOURCES = [
  "lib/tmall/view-models/product-focus-entry.ts",
  "lib/tmall/view-models/product-operating-insights.ts",
  "lib/tmall/view-models/product-table-operating-filters.ts",
  "lib/tmall/view-models/product-board-section-nav.ts",
];

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

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

const withoutWarnings = (analysis: TmallAnalysisDisplayResult): TmallAnalysisDisplayResult => ({
  ...cloneAnalysis(analysis),
  dataQualityWarnings: [],
});

const withMissingSource = (
  analysis: TmallAnalysisDisplayResult,
  sourceType: TmallSourceType,
): TmallAnalysisDisplayResult => {
  const cloned = withoutWarnings(analysis);
  cloned.sourceHealth[sourceType] = {
    ...cloned.sourceHealth[sourceType],
    status: "missing",
    rowCount: 0,
  };
  return cloned;
};

const withSensitiveWarnings = (
  analysis: TmallAnalysisDisplayResult,
): TmallAnalysisDisplayResult => ({
  ...cloneAnalysis(analysis),
  dataQualityWarnings: [
    "检测到文件日期或字段需要复核。",
    "订单编号字段存在格式差异，已隐藏明细。",
    "第三条安全提示。",
    "第四条安全提示。",
    "第五条安全提示。",
    "第六条安全提示。",
  ],
});

const actionHrefs = (actions: Array<{ href: string }>): string[] =>
  actions.map((action) => action.href);

const sourceIncludesAll = (source: string, fragments: string[]): boolean =>
  fragments.every((fragment) => source.includes(fragment));

const pageSectionIdsMatch = (
  pageSource: string,
  sectionIds: readonly string[],
): boolean => sectionIds.every((sectionId) => pageSource.includes(`id="${sectionId}"`));

const sourceHasVisibleSensitiveTerms = (): boolean => {
  const visibleSources = [
    ...PAGE_SOURCES,
    ...fs
      .readdirSync(path.join(ROOT, "components"), { recursive: true })
      .filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".tsx"))
      .map((entry) => `components/${entry}`),
  ];

  return visibleSources.some((relativePath) => {
    const source = readSource(relativePath);
    return SENSITIVE_FIELD_NAMES.some((fieldName) => source.includes(fieldName));
  });
};

const main = async () => {
  const afterSalesFile = createFile("private-samples/tmall/after-sales/当日售后退货表.xlsx");
  const analysis = await runTmallFourSourceAnalysis({
    businessProductFile: createFile(
      "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
    ),
    adProductFile: createFile("private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
    adPlanFile: createFile("private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });

  const sourcePayloadBefore = JSON.stringify(analysis);
  const targetEmptyState = parseTmallTargetStorage(null);
  const seriesEmptyState = parseTmallSeriesGroupStorage(null);
  const targetPayloadBefore = JSON.stringify(targetEmptyState);
  const seriesPayloadBefore = JSON.stringify(seriesEmptyState);
  const targetCorruptedState = parseTmallTargetStorage("{broken-target-json");
  const seriesCorruptedState = parseTmallSeriesGroupStorage("{broken-series-json");
  const corruptedAnalysisState = parseTmallStoredAnalysisResult("{broken-analysis-json");
  const warningAnalysis = withSensitiveWarnings(analysis);
  const sourceGapAnalysis = withMissingSource(analysis, "after_sales");
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);

  const emptyHomeWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: null,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: null,
  });
  const emptyGlobalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "empty",
    analysis: null,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: null,
  });
  const emptyUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "empty",
    analysis: null,
    selectedDate: null,
  });
  const emptyRawInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "empty",
    analysis: null,
    selectedDate: null,
  });
  const corruptedGlobalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: corruptedAnalysisState.status,
    analysis: corruptedAnalysisState.result,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: null,
  });
  const corruptedUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: corruptedAnalysisState.status,
    analysis: corruptedAnalysisState.result,
    selectedDate: null,
  });
  const corruptedRawInspection = buildTmallRawDataSafeInspection({
    analysisStatus: corruptedAnalysisState.status,
    analysis: corruptedAnalysisState.result,
    selectedDate: null,
  });
  const validHomeWorkbench = buildTmallHomeWorkbenchOverview({
    analysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const invalidDateHomeWorkbench = buildTmallHomeWorkbenchOverview({
    analysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: "2099-01-01",
  });
  const validHomeNav = buildTmallHomeSectionNav({
    hasTrendSummary: true,
    hasTargetSummary: true,
    hasTargetDiagnostics: true,
    hasReconciliation: true,
    hasMetricGrid: true,
    hasProductRanking: true,
    hasRiskList: true,
    hasQualitySummary: true,
  });
  const validGlobalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const sourceGapGlobalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: sourceGapAnalysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const warningGlobalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: warningAnalysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const targetCorruptedGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis,
    targetStorageState: targetCorruptedState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const seriesCorruptedGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesCorruptedState,
    selectedDate: TEST_DATE,
  });
  const validUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis,
    selectedDate: TEST_DATE,
  });
  const invalidDateUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis,
    selectedDate: "2099-01-01",
  });
  const sourceGapUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: sourceGapAnalysis,
    selectedDate: TEST_DATE,
  });
  const warningUploadCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: warningAnalysis,
    selectedDate: TEST_DATE,
  });
  const validRawInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis,
    selectedDate: TEST_DATE,
  });
  const invalidDateRawInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis,
    selectedDate: "2099-01-01",
  });
  const warningRawInspection = buildTmallRawDataSafeInspection({
    analysisStatus: "valid",
    analysis: warningAnalysis,
    selectedDate: TEST_DATE,
  });
  const productOverview = buildTmallProductBoardOverview(analysis, TEST_DATE, null);
  const selectedProductId = productOverview.selectedProductId;
  const productFocusEntry = buildTmallProductFocusEntry(productOverview);
  const productTrendSection = selectedProductId
    ? buildTmallProductTrendSection(analysis, selectedProductId)
    : null;
  const productTargetDiagnostics = buildTmallProductTargetDiagnostics({
    targets: targetEmptyState.targets,
    analysis,
    productId: selectedProductId,
    options: { maxItems: 5 },
  });
  const productOperatingInsights = buildTmallProductOperatingInsights({
    overview: productOverview,
    targetDiagnostics: productTargetDiagnostics,
    trendSection: productTrendSection,
  });
  const productTableFilters = buildTmallProductTableOperatingFilters(
    productOverview.productTableRows,
    selectedProductId,
  );
  const productSectionNav = buildTmallProductBoardSectionNav({
    hasTrendSection: Boolean(productTrendSection),
  });
  const noAdRows = filterTmallProductTableRows(
    productOverview.productTableRows,
    "no_ad",
    productTableFilters.salesTopProductIds,
  );
  const storeOverview = buildTmallStoreBoardOverview(analysis, TEST_DATE);
  const productIdsForSeries = productOverview.products.slice(0, 2).map((product) => product.productId);
  const seriesOverview = buildTmallSeriesBoardOverview(
    analysis,
    TEST_DATE,
    [
      {
        id: "qa-series",
        name: "QA 系列",
        productIds: productIdsForSeries,
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
      },
    ],
    "qa-series",
  );

  const homePageSource = readSource("app/(workspace)/home/page.tsx");
  const homeWorkbenchComponentSource = readSource("components/home/home-workbench-overview.tsx");
  const uploadPageSource = readSource("app/(workspace)/upload/page.tsx");
  const rawDataPageSource = readSource("app/(workspace)/raw-data/page.tsx");
  const storePageSource = readSource("app/(workspace)/store-board/page.tsx");
  const seriesPageSource = readSource("app/(workspace)/series-board/page.tsx");
  const productPageSource = readSource("app/(workspace)/product-board/page.tsx");
  const productDataTableSource = readSource("components/product-board/product-data-table.tsx");
  const rawDataCenterSource = readSource("components/raw-data/raw-data-safe-inspection-center.tsx");
  const uploadCenterSource = readSource("components/upload/upload-data-quality-center.tsx");
  const storeOverviewProbe = {
    selectedDate: storeOverview.selectedDate,
    businessMetrics: storeOverview.businessMetrics,
    adMetrics: storeOverview.adMetrics,
    riskSummary: storeOverview.riskSummary,
    hasSelectedDateProducts: storeOverview.hasSelectedDateProducts,
    hasSelectedDatePlanAdData: storeOverview.hasSelectedDatePlanAdData,
  };
  const combinedSafePayload = {
    emptyHomeWorkbench,
    emptyGlobalGuide,
    emptyUploadCenter,
    emptyRawInspection,
    corruptedGlobalGuide,
    corruptedUploadCenter,
    corruptedRawInspection,
    validHomeWorkbench,
    invalidDateHomeWorkbench,
    validHomeNav,
    validGlobalGuide,
    sourceGapGlobalGuide,
    warningGlobalGuide,
    targetCorruptedGuide,
    seriesCorruptedGuide,
    validUploadCenter,
    invalidDateUploadCenter,
    sourceGapUploadCenter,
    warningUploadCenter,
    validRawInspection,
    invalidDateRawInspection,
    warningRawInspection,
    productFocusEntry,
    productOperatingInsights,
    productTableFilters,
    productSectionNav,
    storeOverview: storeOverviewProbe,
    seriesOverview,
  };
  const safePayloadString = JSON.stringify(combinedSafePayload);
  const safeLeafValues = collectLeafValues(combinedSafePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    safePayloadString.includes(fieldName),
  );
  const warningSanitized =
    warningUploadCenter.safeWarnings.length <= 5 &&
    warningRawInspection.safeWarnings.length <= 5 &&
    !SENSITIVE_FIELD_NAMES.some((fieldName) =>
      `${warningUploadCenter.safeWarnings.join(" ")} ${warningRawInspection.safeWarnings.join(" ")}`.includes(fieldName),
    );
  const allRawRowsUseSelectedDate = Object.values(validRawInspection.rowsBySource).every((rows) =>
    rows.every((row) => row.cells.date === validRawInspection.selectedDate),
  );
  const pageSourcesIntegrated =
    sourceIncludesAll(homePageSource, [
      "HomeWorkbenchOverview",
      "HomeSectionNav",
      "TmallGlobalDataStatusGuide",
    ]) &&
    sourceIncludesAll(uploadPageSource, ["UploadDataQualityCenter", "buildTmallUploadDataQualityCenter"]) &&
    sourceIncludesAll(rawDataPageSource, ["RawDataSafeInspectionCenter", "buildTmallRawDataSafeInspection"]) &&
    sourceIncludesAll(storePageSource, ["TmallGlobalDataStatusGuide", "buildTmallStoreBoardOverview"]) &&
    sourceIncludesAll(seriesPageSource, ["TmallGlobalDataStatusGuide", "buildTmallSeriesBoardOverview"]) &&
    sourceIncludesAll(productPageSource, [
      "ProductFocusEntry",
      "ProductOperatingInsights",
      "ProductDataTable",
      "ProductBoardSectionNav",
    ]);
  const pageAnchorsIntegrated =
    pageSectionIdsMatch(`${homePageSource}\n${homeWorkbenchComponentSource}`, HOME_SECTION_IDS) &&
    pageSectionIdsMatch(productPageSource, PRODUCT_BOARD_SECTION_IDS) &&
    validHomeNav.visibleItems.every((item) => item.href === `#${item.sectionId}`) &&
    productSectionNav.visibleItems.every((item) => item.key === item.sectionId);
  const quickEntryHrefsPass =
    actionHrefs(emptyGlobalGuide.actions).includes("/upload") &&
    actionHrefs(targetCorruptedGuide.actions).includes("/targets") &&
    actionHrefs(seriesCorruptedGuide.actions).includes("/series-board") &&
    ["/home", "/store-board", "/product-board", "/raw-data"].every((href) =>
      uploadCenterSource.includes(`href: "${href}"`) || uploadCenterSource.includes(`href="${href}"`),
    ) &&
    ["/upload", "/home", "/store-board", "/product-board"].every((href) =>
      rawDataCenterSource.includes(`href: "${href}"`) || rawDataCenterSource.includes(`href="${href}"`),
    ) &&
    ["/store-board", "/series-board", "/product-board"].every((href) =>
      validHomeWorkbench.boardEntries.some((entry) => entry.href === href),
    );
  const noForbiddenBottomImports = [...V04E_CORE_SOURCES, ...PRODUCT_V04D_SOURCES].every((relativePath) => {
    const source = readSource(relativePath);
    return (
      !source.includes("run-tmall-four-source-analysis") &&
      !source.includes("table-parser")
    );
  });
  const noCoreRuleCrossImports =
    readSource("lib/tmall/view-models/raw-data-safe-inspection.ts").includes("target-diagnostics") === false &&
    readSource("lib/tmall/view-models/upload-data-quality-center.ts").includes("target-diagnostics") === false;

  const checks = {
    emptyStateMatrixPass:
      emptyHomeWorkbench.isEmpty &&
      emptyGlobalGuide.actions.some((action) => action.href === "/upload") &&
      emptyUploadCenter.isEmpty &&
      emptyRawInspection.isEmpty,
    corruptedStateMatrixPass:
      corruptedAnalysisState.status === "corrupted" &&
      corruptedGlobalGuide.tone === "risk" &&
      corruptedGlobalGuide.actions.some((action) => action.href === "/upload") &&
      corruptedUploadCenter.status === "risk" &&
      corruptedRawInspection.status === "risk" &&
      Object.values(corruptedRawInspection.rowsBySource).every((rows) => rows.length === 0) &&
      homePageSource.includes("TmallCorruptedResultState"),
    validStateMatrixPass:
      !validHomeWorkbench.isEmpty &&
      !validUploadCenter.isEmpty &&
      validRawInspection.sourceTabs.length === 4 &&
      storeOverview.selectedDate === TEST_DATE &&
      productOverview.selectedDate === TEST_DATE &&
      seriesOverview.selectedDate === TEST_DATE,
    sourceGapStatePass:
      sourceGapGlobalGuide.actions.some((action) => action.href === "/upload") &&
      sourceGapUploadCenter.actions.some((action) => action.key === "upload-after-sales") &&
      buildTmallStoreBoardOverview(sourceGapAnalysis, TEST_DATE).selectedDate === TEST_DATE &&
      buildTmallProductBoardOverview(sourceGapAnalysis, TEST_DATE, null).selectedDate === TEST_DATE,
    dataQualityWarningPass:
      validHomeWorkbench.dataQualityWarningCount > 0 &&
      warningGlobalGuide.actions.some((action) => action.href === "/upload") &&
      warningSanitized,
    targetStorageCorruptedPass:
      targetCorruptedState.status === "corrupted" &&
      targetCorruptedGuide.actions.some((action) => action.href === "/targets"),
    seriesStorageCorruptedPass:
      seriesCorruptedState.status === "corrupted" &&
      seriesCorruptedGuide.actions.some((action) => action.href === "/series-board") &&
      seriesPageSource.includes("seriesStorageStatus") &&
      seriesPageSource.includes("corrupted"),
    v04eViewModelsGenerated:
      validHomeWorkbench.boardEntries.length === 3 &&
      validHomeNav.visibleItems.length > 0 &&
      validGlobalGuide.shouldDisplay &&
      validUploadCenter.sourceCards.length === 4 &&
      validRawInspection.sourceTabs.length === 4,
    productBoardV04dRegressionPass:
      productFocusEntry.salesTopProducts.length <= 5 &&
      productOperatingInsights.priorityActions.length <= 3 &&
      productTableFilters.filters.length === 7 &&
      productSectionNav.visibleItems.length > 0,
    pageSourcesIntegrated,
    pageAnchorsIntegrated,
    quickEntryHrefsPass,
    dateRulesPass:
      validHomeWorkbench.selectedDate === TEST_DATE &&
      invalidDateHomeWorkbench.selectedDate === validHomeWorkbench.selectedDate &&
      validUploadCenter.selectedDate === TEST_DATE &&
      invalidDateUploadCenter.selectedDate === validUploadCenter.selectedDate &&
      validRawInspection.selectedDate === TEST_DATE &&
      invalidDateRawInspection.selectedDate === validRawInspection.selectedDate &&
      allRawRowsUseSelectedDate &&
      storeOverview.selectedDate === TEST_DATE &&
      productPageSource.includes("setSelectedProductId(null)"),
    actionLimitsPass:
      validHomeWorkbench.priorityActions.length <= 5 &&
      warningUploadCenter.safeWarnings.length <= 5 &&
      warningRawInspection.safeWarnings.length <= 5,
    noAdProductSafetyPass:
      noAdRows.every((row) => !row.hasAdData && row.adSpend === null && row.adRoi === null) &&
      productDataTableSource.includes("row.hasAdData ? formatMoney(row.adSpend) : \"--\"") &&
      productDataTableSource.includes("row.hasAdData ? formatTableRoi(row.adRoi) : \"--\"") &&
      !productPageSource.includes("用计划推广补齐") &&
      !productPageSource.includes("使用计划推广补齐") &&
      !productDataTableSource.includes("用计划推广补齐") &&
      !productDataTableSource.includes("使用计划推广补齐"),
    privacyPass:
      !containsSensitiveFieldName &&
      !containsSensitiveValue &&
      !sourceHasVisibleSensitiveTerms(),
    numberSafetyPass:
      !hasInvalidNumber(combinedSafePayload) &&
      !hasUndefined(combinedSafePayload) &&
      !safePayloadString.includes("NaN") &&
      !safePayloadString.includes("Infinity") &&
      !safePayloadString.includes("undefined"),
    objectMutationPass:
      sourcePayloadBefore === JSON.stringify(analysis) &&
      targetPayloadBefore === JSON.stringify(targetEmptyState) &&
      seriesPayloadBefore === JSON.stringify(seriesEmptyState),
    bottomLayerUntouchedByV04ePass: noForbiddenBottomImports && noCoreRuleCrossImports,
    rawDataCoreStillSafePass:
      rawDataPageSource.includes("useTmallAnalysisResult") &&
      !rawDataPageSource.includes("previewRows") &&
      readSource("lib/tmall/view-models/raw-data-safe-inspection.ts").includes("after_sales_safe"),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    summary: {
      sourceTabs: validRawInspection.sourceTabs.length,
      uploadSourceCards: validUploadCenter.sourceCards.length,
      homeBoardEntries: validHomeWorkbench.boardEntries.length,
      productFilters: productTableFilters.filters.length,
      homeNavItems: validHomeNav.visibleItems.length,
      productNavItems: productSectionNav.visibleItems.length,
      sensitiveSourceValueCount: sensitiveSourceValues.size,
      leakedSensitiveValueCount: containsSensitiveValue ? 1 : 0,
    },
    checks,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
};

void main().catch((error) => {
  process.stderr.write(
    JSON.stringify(
      {
        status: "ERROR",
        message: error instanceof Error ? error.message : "unknown error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
