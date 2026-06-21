import fs from "node:fs";
import path from "node:path";
import { parseTmallSeriesGroupStorage } from "../../lib/storage/tmall-series-storage";
import { parseTmallTargetStorage } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallGlobalDataStatusGuide } from "../../lib/tmall/view-models/global-data-status-guide";
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

const withSourceGap = (analysis: TmallAnalysisDisplayResult): TmallAnalysisDisplayResult => {
  const cloned = withoutWarnings(analysis);
  cloned.sourceHealth.after_sales = {
    ...cloned.sourceHealth.after_sales,
    status: "missing",
    rowCount: 0,
  };
  return cloned;
};

const actionHrefs = (value: ReturnType<typeof buildTmallGlobalDataStatusGuide>): string[] =>
  value.actions.map((action) => action.href);

const pageIncludesGuide = (relativePath: string): boolean => {
  const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
  return (
    source.includes("TmallGlobalDataStatusGuide") &&
    source.includes("buildTmallGlobalDataStatusGuide")
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

  const targetEmptyState = parseTmallTargetStorage(null);
  const seriesEmptyState = parseTmallSeriesGroupStorage(null);
  const targetCorruptedState = parseTmallTargetStorage("{broken-target-json");
  const seriesCorruptedState = parseTmallSeriesGroupStorage("{broken-series-json");
  const beforeSourcePayload = JSON.stringify(result);
  const beforeTargetStoragePayload = JSON.stringify(targetEmptyState);
  const beforeSeriesStoragePayload = JSON.stringify(seriesEmptyState);
  const emptyGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "empty",
    analysis: null,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: null,
  });
  const corruptedGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "corrupted",
    analysis: null,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: null,
  });
  const sourceGapGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: withSourceGap(result),
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const warningGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: result,
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const targetCorruptedGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: withoutWarnings(result),
    targetStorageState: targetCorruptedState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const seriesCorruptedGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: withoutWarnings(result),
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesCorruptedState,
    selectedDate: TEST_DATE,
  });
  const normalGuide = buildTmallGlobalDataStatusGuide({
    analysisStatus: "valid",
    analysis: withoutWarnings(result),
    targetStorageState: targetEmptyState,
    seriesStorageState: seriesEmptyState,
    selectedDate: TEST_DATE,
  });
  const allGuides = [
    emptyGuide,
    corruptedGuide,
    sourceGapGuide,
    warningGuide,
    targetCorruptedGuide,
    seriesCorruptedGuide,
    normalGuide,
  ];
  const safePayloadString = JSON.stringify(allGuides);
  const safeLeafValues = collectLeafValues(allGuides);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const globalViewModelSource = fs.readFileSync(
    path.join(ROOT, "lib/tmall/view-models/global-data-status-guide.ts"),
    "utf8",
  );

  const output = {
    emptyShowsEmptyState:
      emptyGuide.tone === "empty" &&
      emptyGuide.title.includes("还没有") &&
      actionHrefs(emptyGuide).includes("/upload"),
    corruptedShowsRiskWithUpload:
      corruptedGuide.tone === "risk" && actionHrefs(corruptedGuide).includes("/upload"),
    sourceGapShowsUpload:
      ["risk", "watch"].includes(sourceGapGuide.tone) &&
      actionHrefs(sourceGapGuide).includes("/upload"),
    dataQualityWarningShown:
      warningGuide.title.includes("数据质量") &&
      warningGuide.items.some((item) => item.key === "data-quality" && item.value !== "0 条") &&
      actionHrefs(warningGuide).includes("/upload"),
    targetCorruptedShowsTargets:
      targetCorruptedGuide.tone === "risk" &&
      actionHrefs(targetCorruptedGuide).includes("/targets"),
    seriesCorruptedShowsSeriesOrTargets:
      seriesCorruptedGuide.tone === "risk" &&
      (actionHrefs(seriesCorruptedGuide).includes("/series-board") ||
        actionHrefs(seriesCorruptedGuide).includes("/targets")),
    normalShouldDisplay: normalGuide.shouldDisplay && normalGuide.tone === "normal",
    actionsMaxThree: allGuides.every((guide) => guide.actions.length <= 3),
    hasInvalidNumber: hasInvalidNumber(allGuides),
    hasUndefined: hasUndefined(allGuides),
    containsSensitiveFieldName: SENSITIVE_FIELD_NAMES.some((fieldName) =>
      safePayloadString.includes(fieldName),
    ),
    containsSensitiveValue: [...sensitiveSourceValues].some((value) =>
      safeLeafValues.has(value),
    ),
    sourceObjectMutated: beforeSourcePayload !== JSON.stringify(result),
    targetStorageObjectMutated: beforeTargetStoragePayload !== JSON.stringify(targetEmptyState),
    seriesStorageObjectMutated: beforeSeriesStoragePayload !== JSON.stringify(seriesEmptyState),
    productBoardRulesNotImported:
      !globalViewModelSource.includes("product-table-operating-filters") &&
      !globalViewModelSource.includes("product-focus-entry") &&
      !globalViewModelSource.includes("product-operating-insights"),
    targetDiagnosticsNotImported: !globalViewModelSource.includes("target-diagnostics"),
    homePageIntegrated: pageIncludesGuide("app/(workspace)/home/page.tsx"),
    storeBoardIntegrated: pageIncludesGuide("app/(workspace)/store-board/page.tsx"),
    seriesBoardIntegrated: pageIncludesGuide("app/(workspace)/series-board/page.tsx"),
    productBoardIntegrated: pageIncludesGuide("app/(workspace)/product-board/page.tsx"),
  };

  const checksPassed =
    output.emptyShowsEmptyState &&
    output.corruptedShowsRiskWithUpload &&
    output.sourceGapShowsUpload &&
    output.dataQualityWarningShown &&
    output.targetCorruptedShowsTargets &&
    output.seriesCorruptedShowsSeriesOrTargets &&
    output.normalShouldDisplay &&
    output.actionsMaxThree &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.targetStorageObjectMutated &&
    !output.seriesStorageObjectMutated &&
    output.productBoardRulesNotImported &&
    output.targetDiagnosticsNotImported &&
    output.homePageIntegrated &&
    output.storeBoardIntegrated &&
    output.seriesBoardIntegrated &&
    output.productBoardIntegrated;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "global_data_status_guide_validation_failed");
  process.exitCode = 1;
});
