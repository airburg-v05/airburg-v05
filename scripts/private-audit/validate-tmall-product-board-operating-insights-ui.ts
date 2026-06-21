import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
import { buildTmallProductOperatingInsights } from "../../lib/tmall/view-models/product-operating-insights";
import {
  buildTmallProductTargetDiagnostics,
  type TmallTargetDiagnosticSummary,
} from "../../lib/tmall/view-models/target-diagnostics";
import { buildTmallProductTrendSection } from "../../lib/tmall/view-models/product-trend-section";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const OTHER_PRODUCT_ID = "938259176246";

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

const currentProductGmv = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
): number =>
  result.productDailyFacts
    .filter((fact) => fact.date === TEST_DATE && String(fact.productId) === PRODUCT_ID)
    .reduce((total, fact) => total + fact.gmv, 0);

const buildTargets = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
): TmallTargetDefinition[] => [
  target({
    id: "product_gmv_target",
    name: "当前商品 GMV 目标验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "product_ad_roi_risk_target",
    name: "当前商品 ROI 风险验证",
    scope: "product",
    metricKey: "adRoi",
    targetValue: 100,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "invalid_product_target",
    name: "非法当前商品目标验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 0,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "achieved_product_target",
    name: "达成当前商品目标验证",
    scope: "product",
    metricKey: "visitors",
    targetValue: 1,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "in_progress_product_target",
    name: "接近目标当前商品验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: currentProductGmv(result) / 0.9,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "no_ad_product_spend_target",
    name: "无推广商品花费目标验证",
    scope: "product",
    metricKey: "adSpend",
    targetValue: 1000,
    direction: "lower_is_better",
    status: "active",
    productId: NO_AD_PRODUCT_ID,
  }),
  target({
    id: "other_product_target_should_not_show",
    name: "其他商品目标过滤验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 1000,
    direction: "higher_is_better",
    status: "active",
    productId: OTHER_PRODUCT_ID,
  }),
  target({
    id: "store_target_should_not_show",
    name: "店铺目标过滤验证",
    scope: "store",
    metricKey: "gmv",
    targetValue: 100000,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "series_target_should_not_show",
    name: "系列目标过滤验证",
    scope: "series",
    metricKey: "gmv",
    targetValue: 60000,
    direction: "higher_is_better",
    status: "active",
    seriesId: "product_operating_insight_series",
  }),
];

const buildProductDiagnostics = (
  targets: TmallTargetDefinition[],
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productId: string,
): TmallTargetDiagnosticSummary =>
  buildTmallProductTargetDiagnostics({
    targets,
    analysis: result,
    productId,
    options: { maxItems: 5 },
  });

const includesForbiddenTrendJudgment = (value: string): boolean =>
  /上涨|下降|增长|下滑/.test(value);

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
  const targets = buildTargets(result);

  const overview = buildTmallProductBoardOverview(result, TEST_DATE, PRODUCT_ID);
  const targetDiagnostics = buildProductDiagnostics(targets, result, PRODUCT_ID);
  const beforeTargetDiagnosticsPayload = JSON.stringify(targetDiagnostics);
  const trendSection = buildTmallProductTrendSection(result, PRODUCT_ID);
  const insights = buildTmallProductOperatingInsights({
    overview,
    targetDiagnostics,
    trendSection,
  });

  const emptyInsights = buildTmallProductOperatingInsights({
    overview: null,
    targetDiagnostics,
    trendSection: null,
  });

  const noAdOverview = buildTmallProductBoardOverview(result, TEST_DATE, NO_AD_PRODUCT_ID);
  const noAdTargetDiagnostics = buildProductDiagnostics(targets, result, NO_AD_PRODUCT_ID);
  const noAdTrendSection = buildTmallProductTrendSection(result, NO_AD_PRODUCT_ID);
  const noAdInsights = buildTmallProductOperatingInsights({
    overview: noAdOverview,
    targetDiagnostics: noAdTargetDiagnostics,
    trendSection: noAdTrendSection,
  });

  const safePayload = { insights, emptyInsights, noAdInsights };
  const safePayloadString = JSON.stringify(safePayload);
  const noAdPayloadString = JSON.stringify(noAdInsights);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    safePayloadString.includes(fieldName),
  );
  const singlePointTrend =
    trendSection.cards.some((card) => card.pointCount === 1) ||
    noAdTrendSection.cards.some((card) => card.pointCount === 1);

  const output = {
    productInsightGenerated:
      !insights.isEmpty &&
      insights.productId === PRODUCT_ID &&
      insights.modules.length === 5 &&
      insights.priorityActions.length > 0 &&
      insights.priorityActions.length <= 3,
    emptyWithoutSelectedProduct: emptyInsights.isEmpty,
    noAdProductInsightGenerated:
      !noAdInsights.isEmpty && noAdInsights.productId === NO_AD_PRODUCT_ID,
    noAdProductNotZero:
      noAdPayloadString.includes("不按 0 计算") &&
      !noAdPayloadString.includes("¥0") &&
      !noAdPayloadString.includes("0.00 倍"),
    noAdDoesNotSuggestPlanBackfill:
      !(noAdPayloadString.includes("计划推广") && noAdPayloadString.includes("补齐")),
    singlePointTrendDetected: singlePointTrend,
    singlePointTrendHasNoDirectionalJudgment:
      singlePointTrend && !includesForbiddenTrendJudgment(safePayloadString),
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    targetDiagnosticsObjectMutated:
      beforeTargetDiagnosticsPayload !== JSON.stringify(targetDiagnostics),
  };

  const checksPassed =
    output.productInsightGenerated &&
    output.emptyWithoutSelectedProduct &&
    output.noAdProductInsightGenerated &&
    output.noAdProductNotZero &&
    output.noAdDoesNotSuggestPlanBackfill &&
    output.singlePointTrendDetected &&
    output.singlePointTrendHasNoDirectionalJudgment &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.targetDiagnosticsObjectMutated;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_product_board_operating_insights_validation_failed");
  process.exitCode = 1;
});
