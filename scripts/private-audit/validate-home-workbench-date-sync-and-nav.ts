import fs from "node:fs";
import path from "node:path";
import { parseTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-validator";
import { parseTmallSeriesGroupStorage } from "../../lib/storage/tmall-series-storage";
import { parseTmallTargetStorage } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallHomeSectionNav,
  HOME_SECTION_IDS,
} from "../../lib/tmall/view-models/home-section-nav";
import { buildTmallHomeWorkbenchOverview } from "../../lib/tmall/view-models/home-workbench-overview";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
import { buildTmallProductFocusEntry } from "../../lib/tmall/view-models/product-focus-entry";
import type { TmallAnalysisDisplayResult } from "../../types/tmall";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const SYNTHETIC_DATE = "2026-06-17";

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

const addSyntheticBusinessDate = (
  result: TmallAnalysisDisplayResult,
): TmallAnalysisDisplayResult => {
  const cloned = JSON.parse(JSON.stringify(result)) as TmallAnalysisDisplayResult;
  const baseProductFacts = result.productDailyFacts.slice(0, 2);
  const syntheticProductFacts = baseProductFacts.map((fact, index) => ({
    ...fact,
    date: SYNTHETIC_DATE,
    gmv: index === 0 ? 1234 : 567,
    gsv: index === 0 ? 1000 : 400,
    refundSuccessAmount: index === 0 ? 234 : 167,
    visitors: index === 0 ? 120 : 80,
    paidBuyers: index === 0 ? 3 : 1,
  }));
  const baseAdProductFact = result.adProductDailyFacts[0];
  const baseAdPlanFact = result.adPlanDailyFacts[0];

  cloned.productDailyFacts = [...cloned.productDailyFacts, ...syntheticProductFacts];

  if (baseAdProductFact && syntheticProductFacts[0]) {
    cloned.adProductDailyFacts = [
      ...cloned.adProductDailyFacts,
      {
        ...baseAdProductFact,
        date: SYNTHETIC_DATE,
        productId: syntheticProductFacts[0].productId,
        adSpend: 88,
        adTransactionAmount: 176,
      },
    ];
  }

  if (baseAdPlanFact) {
    cloned.adPlanDailyFacts = [
      ...cloned.adPlanDailyFacts,
      {
        ...baseAdPlanFact,
        date: SYNTHETIC_DATE,
        adSpend: 200,
        transactionAmount: 500,
      },
    ];
  }

  return cloned;
};

const runAnalysis = async (afterSalesFile: File) =>
  runTmallFourSourceAnalysis({
    businessProductFile: createFile(
      "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
    ),
    adProductFile: createFile("private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
    adPlanFile: createFile("private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });

const main = async () => {
  const afterSalesFile = createFile("private-samples/tmall/after-sales/当日售后退货表.xlsx");
  const result = await runAnalysis(afterSalesFile);
  const syntheticResult = addSyntheticBusinessDate(result);
  const targetStorageState = parseTmallTargetStorage(null);
  const seriesStorageState = parseTmallSeriesGroupStorage(null);
  const beforeSourcePayload = JSON.stringify(syntheticResult);
  const targetStoragePayload = JSON.stringify(targetStorageState);
  const seriesStoragePayload = JSON.stringify(seriesStorageState);

  const emptyWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: null,
    targetStorageState,
    seriesStorageState,
    selectedDate: null,
  });
  const validDateWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: syntheticResult,
    targetStorageState,
    seriesStorageState,
    selectedDate: SYNTHETIC_DATE,
  });
  const invalidDateWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: syntheticResult,
    targetStorageState,
    seriesStorageState,
    selectedDate: "2099-01-01",
  });
  const expectedSyntheticOverview = buildTmallProductBoardOverview(
    syntheticResult,
    SYNTHETIC_DATE,
    null,
  );
  const expectedSyntheticFocus = buildTmallProductFocusEntry(expectedSyntheticOverview);
  const nav = buildTmallHomeSectionNav({
    hasTrendSummary: true,
    hasTargetSummary: true,
    hasTargetDiagnostics: true,
    hasReconciliation: true,
    hasMetricGrid: true,
    hasProductRanking: true,
    hasRiskList: true,
    hasQualitySummary: true,
  });
  const homePageSource = fs.readFileSync(path.join(ROOT, "app/(workspace)/home/page.tsx"), "utf8");
  const homeWorkbenchSource = fs.readFileSync(
    path.join(ROOT, "components/home/home-workbench-overview.tsx"),
    "utf8",
  );
  const combinedHomeSource = `${homePageSource}\n${homeWorkbenchSource}`;
  const safePayload = { emptyWorkbench, validDateWorkbench, invalidDateWorkbench, nav };
  const safePayloadString = JSON.stringify(safePayload);
  const safeLeafValues = collectLeafValues(safePayload);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const sourceStatusByKey = new Map(
    validDateWorkbench.sourceStatuses.map((source) => [source.key, source]),
  );
  const navIds = nav.items.map((item) => item.sectionId);
  const navKeys = nav.items.map((item) => item.key);
  const pageSectionIdsMatch = HOME_SECTION_IDS.every((sectionId) =>
    combinedHomeSource.includes(`id="${sectionId}"`),
  );
  const boardEntriesByKey = new Map(validDateWorkbench.boardEntries.map((entry) => [entry.key, entry]));

  const output = {
    emptyStateSafe: emptyWorkbench.isEmpty && emptyWorkbench.selectedDate === null,
    corruptedAnalysisUsesSafeState:
      parseTmallStoredAnalysisResult("{broken-analysis-json").status === "corrupted" &&
      homePageSource.includes("TmallCorruptedResultState") &&
      homePageSource.includes('analysisState.status !== "corrupted"'),
    validWorkbenchGenerated: !validDateWorkbench.isEmpty,
    supportsSelectedDateParam:
      fs
        .readFileSync(path.join(ROOT, "lib/tmall/view-models/home-workbench-overview.ts"), "utf8")
        .includes("selectedDate: string | null"),
    validDateRespected: validDateWorkbench.selectedDate === SYNTHETIC_DATE,
    invalidDateFallsBack: invalidDateWorkbench.selectedDate === TEST_DATE,
    productFocusSummaryUsesEffectiveDate:
      validDateWorkbench.productFocusSummary.productCount ===
        expectedSyntheticOverview.productTableRows.length &&
      validDateWorkbench.productFocusSummary.salesTopCount ===
        expectedSyntheticFocus.salesTopProducts.length &&
      validDateWorkbench.productFocusSummary.hasAdCount ===
        expectedSyntheticOverview.productTableRows.filter((row) => row.hasAdData).length &&
      validDateWorkbench.productFocusSummary.noAdCount ===
        expectedSyntheticOverview.productTableRows.filter((row) => !row.hasAdData).length,
    sourceStatusesUseEffectiveDate:
      sourceStatusByKey.get("business_product")?.hasSelectedDateData === true &&
      sourceStatusByKey.get("ad_product")?.hasSelectedDateData === true &&
      sourceStatusByKey.get("ad_plan")?.hasSelectedDateData === true &&
      sourceStatusByKey.get("after_sales")?.hasSelectedDateData === true,
    pagePassesEffectiveSelectedDate:
      homePageSource.includes("selectedDate: effectiveSelectedDate"),
    workbenchDateCopyUpdated:
      homeWorkbenchSource.includes("当前工作台经营日期") &&
      !homeWorkbenchSource.includes("当前默认经营日期"),
    navKeysUnique: new Set(navKeys).size === navKeys.length,
    navIdsUnique: new Set(navIds).size === navIds.length,
    navIdsMatchPage: pageSectionIdsMatch,
    navHrefsAreAnchors: nav.items.every((item) => item.href === `#${item.sectionId}`),
    priorityActionsMaxFive: validDateWorkbench.priorityActions.length <= 5,
    boardEntriesContainStoreSeriesProduct:
      boardEntriesByKey.has("store") &&
      boardEntriesByKey.has("series") &&
      boardEntriesByKey.has("product"),
    boardEntryHrefsCorrect:
      boardEntriesByKey.get("store")?.href === "/store-board" &&
      boardEntriesByKey.get("series")?.href === "/series-board" &&
      boardEntriesByKey.get("product")?.href === "/product-board",
    noMisleadingZeroText:
      !safePayloadString.includes("按 0 计算") &&
      !safePayloadString.includes("显示为 0") &&
      !safePayloadString.includes("0.00 倍"),
    noPlanBackfillSuggestion:
      !safePayloadString.includes("用计划推广补齐") &&
      !safePayloadString.includes("使用计划推广补齐"),
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName: SENSITIVE_FIELD_NAMES.some((fieldName) =>
      safePayloadString.includes(fieldName),
    ),
    containsSensitiveValue: [...sensitiveSourceValues].some((value) =>
      safeLeafValues.has(value),
    ),
    sourceObjectMutated: beforeSourcePayload !== JSON.stringify(syntheticResult),
    targetStorageObjectMutated: targetStoragePayload !== JSON.stringify(targetStorageState),
    seriesStorageObjectMutated: seriesStoragePayload !== JSON.stringify(seriesStorageState),
    productBoardFrozenFilesNotImportedByHomePage:
      !homePageSource.includes("@/components/product-board"),
  };

  const checksPassed =
    output.emptyStateSafe &&
    output.corruptedAnalysisUsesSafeState &&
    output.validWorkbenchGenerated &&
    output.supportsSelectedDateParam &&
    output.validDateRespected &&
    output.invalidDateFallsBack &&
    output.productFocusSummaryUsesEffectiveDate &&
    output.sourceStatusesUseEffectiveDate &&
    output.pagePassesEffectiveSelectedDate &&
    output.workbenchDateCopyUpdated &&
    output.navKeysUnique &&
    output.navIdsUnique &&
    output.navIdsMatchPage &&
    output.navHrefsAreAnchors &&
    output.priorityActionsMaxFive &&
    output.boardEntriesContainStoreSeriesProduct &&
    output.boardEntryHrefsCorrect &&
    output.noMisleadingZeroText &&
    output.noPlanBackfillSuggestion &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.targetStorageObjectMutated &&
    !output.seriesStorageObjectMutated &&
    output.productBoardFrozenFilesNotImportedByHomePage;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "home_date_sync_nav_validation_failed");
  process.exitCode = 1;
});
