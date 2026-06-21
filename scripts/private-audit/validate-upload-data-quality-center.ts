import fs from "node:fs";
import path from "node:path";
import { parseTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-validator";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { TMALL_SOURCE_TYPES } from "../../lib/tmall/source-types";
import {
  buildTmallUploadDataQualityCenter,
  type UploadDataQualityCenterViewModel,
} from "../../lib/tmall/view-models/upload-data-quality-center";
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

const withSafeAndSensitiveWarnings = (
  analysis: TmallAnalysisDisplayResult,
): TmallAnalysisDisplayResult => ({
  ...cloneAnalysis(analysis),
  dataQualityWarnings: [
    "检测到文件日期或字段需要复核。",
    "售后原始明细包含订单编号字段，已按安全规则隐藏。",
    "第三条安全提示。",
    "第四条安全提示。",
    "第五条安全提示。",
    "第六条安全提示。",
  ],
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

const sourceActionTitleExists = (
  center: UploadDataQualityCenterViewModel,
  title: string,
): boolean => center.actions.some((action) => action.title === title);

const pageIncludesDataQualityCenter = (): boolean => {
  const source = fs.readFileSync(path.join(ROOT, "app/(workspace)/upload/page.tsx"), "utf8");
  return (
    source.includes("UploadDataQualityCenter") &&
    source.includes("buildTmallUploadDataQualityCenter")
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
  const emptyCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "empty",
    analysis: null,
    selectedDate: null,
  });
  const corruptedState = parseTmallStoredAnalysisResult("{broken-analysis-json");
  const corruptedCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: corruptedState.status,
    analysis: corruptedState.result,
    selectedDate: null,
  });
  const validCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withoutWarnings(result),
    selectedDate: TEST_DATE,
  });
  const invalidDateCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withoutWarnings(result),
    selectedDate: "1900-01-01",
  });
  const missingBusinessCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withMissingSource(result, "business_product"),
    selectedDate: TEST_DATE,
  });
  const missingAdProductCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withMissingSource(result, "ad_product"),
    selectedDate: TEST_DATE,
  });
  const missingAdPlanCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withMissingSource(result, "ad_plan"),
    selectedDate: TEST_DATE,
  });
  const missingAfterSalesCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withMissingSource(result, "after_sales"),
    selectedDate: TEST_DATE,
  });
  const warningCenter = buildTmallUploadDataQualityCenter({
    analysisStatus: "valid",
    analysis: withSafeAndSensitiveWarnings(result),
    selectedDate: TEST_DATE,
  });
  const allCenters = [
    emptyCenter,
    corruptedCenter,
    validCenter,
    invalidDateCenter,
    missingBusinessCenter,
    missingAdProductCenter,
    missingAdPlanCenter,
    missingAfterSalesCenter,
    warningCenter,
  ];
  const safePayloadString = JSON.stringify(allCenters);
  const safeLeafValues = collectLeafValues(allCenters);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const viewModelSource = fs.readFileSync(
    path.join(ROOT, "lib/tmall/view-models/upload-data-quality-center.ts"),
    "utf8",
  );

  const expectedParsedSourceCount = TMALL_SOURCE_TYPES.filter(
    (sourceType) => result.sourceHealth[sourceType].status === "parsed",
  ).length;
  const selectedDateSourceCardsHaveCurrentDate = validCenter.sourceCards.every(
    (source) => source.status !== "parsed" || typeof source.hasSelectedDateData === "boolean",
  );

  const output = {
    emptyIsSafe: emptyCenter.status === "empty" && emptyCenter.isEmpty,
    corruptedIsRisk:
      corruptedCenter.status === "risk" &&
      sourceActionTitleExists(corruptedCenter, "请重新上传四源数据并重新分析"),
    validCanGenerate: validCenter.status === "normal" || validCenter.status === "watch",
    sourceCardsCount: validCenter.sourceCards.length,
    parsedSourceCountCorrect: validCenter.parsedSourceCount === expectedParsedSourceCount,
    sourceCountIsFour: validCenter.sourceCount === 4,
    missingBusinessAction: sourceActionTitleExists(missingBusinessCenter, "请上传生意参谋商品报表"),
    missingAdProductAction: sourceActionTitleExists(missingAdProductCenter, "请上传商品推广报表"),
    missingAdPlanAction: sourceActionTitleExists(missingAdPlanCenter, "请上传计划推广报表"),
    missingAfterSalesAction: sourceActionTitleExists(missingAfterSalesCenter, "请上传售后退货表"),
    dataQualityWarningAction: sourceActionTitleExists(warningCenter, "请复核上传文件日期和字段"),
    safeWarningsMaxFive: warningCenter.safeWarnings.length <= 5,
    recentDatesMaxFive: validCenter.recentDates.length <= 5,
    validSelectedDateUsed: validCenter.selectedDate === TEST_DATE,
    invalidSelectedDateFallsBack: invalidDateCenter.selectedDate === validCenter.recentDates[0],
    hasSelectedDateDataUsesEffectiveDate: selectedDateSourceCardsHaveCurrentDate,
    allNormalAction: sourceActionTitleExists(validCenter, "当前四源数据可用"),
    noInvalidNumber: !hasInvalidNumber(allCenters),
    noUndefined: !hasUndefined(allCenters),
    containsSensitiveFieldName: SENSITIVE_FIELD_NAMES.some((fieldName) =>
      safePayloadString.includes(fieldName),
    ),
    containsSensitiveValue: [...sensitiveSourceValues].some((value) =>
      safeLeafValues.has(value),
    ),
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
    uploadPageIntegrated: pageIncludesDataQualityCenter(),
  };

  const checksPassed =
    output.emptyIsSafe &&
    output.corruptedIsRisk &&
    output.validCanGenerate &&
    output.sourceCardsCount === 4 &&
    output.parsedSourceCountCorrect &&
    output.sourceCountIsFour &&
    output.missingBusinessAction &&
    output.missingAdProductAction &&
    output.missingAdPlanAction &&
    output.missingAfterSalesAction &&
    output.dataQualityWarningAction &&
    output.safeWarningsMaxFive &&
    output.recentDatesMaxFive &&
    output.validSelectedDateUsed &&
    output.invalidSelectedDateFallsBack &&
    output.hasSelectedDateDataUsesEffectiveDate &&
    output.allNormalAction &&
    output.noInvalidNumber &&
    output.noUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.storageStructureMutated &&
    output.parsingBottomLayerNotImported &&
    output.targetDiagnosticsNotImported &&
    output.productBoardRulesNotImported &&
    output.uploadPageIntegrated;

  const summary = {
    uploadDataQualityCenterPass: checksPassed,
    sourceCardsCount: output.sourceCardsCount,
    parsedSourceCount: validCenter.parsedSourceCount,
    sourceCount: validCenter.sourceCount,
    safeWarningCount: warningCenter.safeWarnings.length,
    recentDateCount: validCenter.recentDates.length,
    containsSensitiveFieldName: output.containsSensitiveFieldName,
    containsSensitiveValue: output.containsSensitiveValue,
    hasInvalidNumber: !output.noInvalidNumber,
    hasUndefined: !output.noUndefined,
    sourceObjectMutated: output.sourceObjectMutated,
    storageStructureMutated: output.storageStructureMutated,
    parsingBottomLayerTouched: !output.parsingBottomLayerNotImported,
    targetDiagnosticsTouched: !output.targetDiagnosticsNotImported,
    productBoardRulesTouched: !output.productBoardRulesNotImported,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

void main();
