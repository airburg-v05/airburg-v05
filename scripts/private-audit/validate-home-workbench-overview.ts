import fs from "node:fs";
import path from "node:path";
import { parseTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-validator";
import {
  parseTmallSeriesGroupStorage,
  toTmallSeriesGroupStorage,
  type TmallSeriesGroup,
} from "../../lib/storage/tmall-series-storage";
import {
  parseTmallTargetStorage,
  toTmallTargetStorage,
} from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallHomeWorkbenchOverview } from "../../lib/tmall/view-models/home-workbench-overview";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
import { buildTmallProductFocusEntry } from "../../lib/tmall/view-models/product-focus-entry";
import type { TmallAnalysisDisplayResult } from "../../types/tmall";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-21T00:00:00.000Z";
const SERIES_ID = "home_workbench_validation_series";

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

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const storeGmv = (result: TmallAnalysisDisplayResult): number =>
  sum(
    result.productDailyFacts.filter((fact) => fact.date === TEST_DATE),
    (fact) => fact.gmv,
  );

const productGmv = (result: TmallAnalysisDisplayResult, productId: string): number =>
  sum(
    result.productDailyFacts.filter(
      (fact) => fact.date === TEST_DATE && fact.productId === productId,
    ),
    (fact) => fact.gmv,
  );

const buildTargets = ({
  result,
  productId,
}: {
  result: TmallAnalysisDisplayResult;
  productId: string;
}): TmallTargetDefinition[] => [
  target({
    id: "home_workbench_store_gmv",
    name: "店铺 GMV 验证目标",
    scope: "store",
    metricKey: "gmv",
    targetValue: Math.max(storeGmv(result) * 1.2, 1),
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "home_workbench_product_gmv",
    name: "宝贝 GMV 验证目标",
    scope: "product",
    metricKey: "gmv",
    targetValue: Math.max(productGmv(result, productId) * 1.2, 1),
    direction: "higher_is_better",
    status: "active",
    productId,
  }),
  target({
    id: "home_workbench_series_gmv",
    name: "系列 GMV 验证目标",
    scope: "series",
    metricKey: "gmv",
    targetValue: 1,
    direction: "higher_is_better",
    status: "active",
    seriesId: SERIES_ID,
  }),
];

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
  const productOverview = buildTmallProductBoardOverview(result, TEST_DATE, null);
  const firstProductId = productOverview.productTableRows[0]?.productId ?? "";
  const seriesProductIds = productOverview.productTableRows
    .slice(0, 2)
    .map((row) => row.productId);
  const seriesGroups: TmallSeriesGroup[] = [
    {
      id: SERIES_ID,
      name: "首页工作台验证系列",
      productIds: seriesProductIds,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ];
  const targetStorage = toTmallTargetStorage(
    buildTargets({ result, productId: firstProductId }),
  );
  const seriesStorage = toTmallSeriesGroupStorage(seriesGroups);
  const targetStorageState = parseTmallTargetStorage(JSON.stringify(targetStorage));
  const seriesStorageState = parseTmallSeriesGroupStorage(JSON.stringify(seriesStorage));
  const emptyTargetStorageState = parseTmallTargetStorage(null);
  const emptySeriesStorageState = parseTmallSeriesGroupStorage(null);
  const corruptedTargetStorageState = parseTmallTargetStorage("{broken-target-json");
  const corruptedAnalysisState = parseTmallStoredAnalysisResult("{broken-analysis-json");

  const beforeResultPayload = JSON.stringify(result);
  const beforeTargetStoragePayload = JSON.stringify(targetStorage);
  const beforeSeriesStoragePayload = JSON.stringify(seriesStorage);
  const workbench = buildTmallHomeWorkbenchOverview({
    analysis: result,
    targetStorageState,
    seriesStorageState,
    selectedDate: TEST_DATE,
  });
  const emptyWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: null,
    targetStorageState: emptyTargetStorageState,
    seriesStorageState: emptySeriesStorageState,
    selectedDate: null,
  });
  const corruptedTargetWorkbench = buildTmallHomeWorkbenchOverview({
    analysis: result,
    targetStorageState: corruptedTargetStorageState,
    seriesStorageState,
    selectedDate: TEST_DATE,
  });
  const afterResultPayload = JSON.stringify(result);
  const afterTargetStoragePayload = JSON.stringify(targetStorage);
  const afterSeriesStoragePayload = JSON.stringify(seriesStorage);

  const expectedProductOverview = buildTmallProductBoardOverview(
    result,
    workbench.selectedDate,
    null,
  );
  const expectedProductFocus = buildTmallProductFocusEntry(expectedProductOverview);
  const expectedHasAdCount = expectedProductOverview.productTableRows.filter(
    (row) => row.hasAdData,
  ).length;
  const expectedNoAdCount = expectedProductOverview.productTableRows.filter(
    (row) => !row.hasAdData,
  ).length;
  const expectedAfterSalesFocusCount = expectedProductOverview.productTableRows.filter(
    (row) => row.refundSuccessAmount > 0,
  ).length;
  const boardEntriesByKey = new Map(workbench.boardEntries.map((entry) => [entry.key, entry]));
  const safePayload = { workbench, emptyWorkbench, corruptedTargetWorkbench };
  const safePayloadString = JSON.stringify(safePayload);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(safePayload);
  const homePageSource = fs.readFileSync(path.join(ROOT, "app/(workspace)/home/page.tsx"), "utf8");

  const output = {
    emptyStateSafe:
      emptyWorkbench.isEmpty &&
      emptyWorkbench.status === "empty" &&
      emptyWorkbench.priorityActions.length === 1 &&
      emptyWorkbench.priorityActions[0]?.href === "/upload",
    corruptedAnalysisSafe:
      corruptedAnalysisState.status === "corrupted" &&
      homePageSource.includes("TmallCorruptedResultState") &&
      homePageSource.includes('analysisState.status !== "corrupted"'),
    validWorkbenchGenerated:
      !workbench.isEmpty &&
      workbench.selectedDate === TEST_DATE &&
      workbench.availableDateCount > 0 &&
      workbench.sourceCount === 4,
    boardEntriesContainStoreSeriesProduct:
      workbench.boardEntries.length === 3 &&
      boardEntriesByKey.has("store") &&
      boardEntriesByKey.has("series") &&
      boardEntriesByKey.has("product"),
    boardEntryHrefsCorrect:
      boardEntriesByKey.get("store")?.href === "/store-board" &&
      boardEntriesByKey.get("series")?.href === "/series-board" &&
      boardEntriesByKey.get("product")?.href === "/product-board",
    priorityActionsMaxFive: workbench.priorityActions.length <= 5,
    productFocusSummaryUsesDefaultDate:
      workbench.productFocusSummary.productCount ===
        expectedProductOverview.productTableRows.length &&
      workbench.productFocusSummary.salesTopCount ===
        expectedProductFocus.salesTopProducts.length &&
      workbench.productFocusSummary.hasAdCount === expectedHasAdCount &&
      workbench.productFocusSummary.noAdCount === expectedNoAdCount &&
      workbench.productFocusSummary.afterSalesFocusCount === expectedAfterSalesFocusCount,
    hasAdCountOnlyHasAdData:
      workbench.productFocusSummary.hasAdCount === expectedHasAdCount,
    noAdCountOnlyNoAdData:
      workbench.productFocusSummary.noAdCount === expectedNoAdCount,
    corruptedTargetStorageSafe:
      corruptedTargetWorkbench.priorityActions.some(
        (action) => action.key === "target-storage-corrupted" && action.href === "/targets",
      ) && corruptedTargetWorkbench.boardEntries.length === 3,
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
    sourceObjectMutated: beforeResultPayload !== afterResultPayload,
    targetStorageObjectMutated: beforeTargetStoragePayload !== afterTargetStoragePayload,
    seriesStorageObjectMutated: beforeSeriesStoragePayload !== afterSeriesStoragePayload,
    productBoardFrozenFilesNotImportedByHomePage:
      !homePageSource.includes("@/components/product-board"),
  };

  const checksPassed =
    output.emptyStateSafe &&
    output.corruptedAnalysisSafe &&
    output.validWorkbenchGenerated &&
    output.boardEntriesContainStoreSeriesProduct &&
    output.boardEntryHrefsCorrect &&
    output.priorityActionsMaxFive &&
    output.productFocusSummaryUsesDefaultDate &&
    output.hasAdCountOnlyHasAdData &&
    output.noAdCountOnlyNoAdData &&
    output.corruptedTargetStorageSafe &&
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
  console.error(error instanceof Error ? error.message : "home_workbench_validation_failed");
  process.exitCode = 1;
});
