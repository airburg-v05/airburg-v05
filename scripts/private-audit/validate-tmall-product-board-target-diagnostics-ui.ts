import fs from "node:fs";
import path from "node:path";
import { parseTmallTargetStorage, type TmallTargetStorageStatus } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallProductTargetDiagnostics,
  type TmallTargetDiagnosticSummary,
} from "../../lib/tmall/view-models/target-diagnostics";
import type { TmallAnalysisDisplayResult } from "../../types/tmall";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const OTHER_PRODUCT_ID = "938259176246";
const SERIES_ID = "product_board_diagnostic_series";

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

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

interface ProductDiagnosticCompositionInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
  productId: string | null;
  targetStorageStatus: TmallTargetStorageStatus;
}

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
    id: "product_ad_roi_target",
    name: "当前商品 ROI 目标验证",
    scope: "product",
    metricKey: "adRoi",
    targetValue: 10,
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
    id: "product_ad_spend_risk_target",
    name: "当前商品推广花费风险验证",
    scope: "product",
    metricKey: "adSpend",
    targetValue: 100,
    direction: "lower_is_better",
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
    id: "paused_product_target",
    name: "暂停当前商品目标验证",
    scope: "product",
    metricKey: "gsv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "paused",
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
    seriesId: SERIES_ID,
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
];

const buildProductDiagnosticsForUi = ({
  targets,
  analysis,
  productId,
  targetStorageStatus,
}: ProductDiagnosticCompositionInput): {
  summary: TmallTargetDiagnosticSummary | null;
  diagnosticsInvoked: boolean;
} => {
  if (targetStorageStatus === "corrupted") {
    return { summary: null, diagnosticsInvoked: false };
  }

  return {
    diagnosticsInvoked: true,
    summary: buildTmallProductTargetDiagnostics({
      targets,
      analysis,
      productId,
      options: { maxItems: 5 },
    }),
  };
};

const findDiagnostic = (
  summary: TmallTargetDiagnosticSummary,
  targetId: string,
) => summary.items.find((item) => item.targetId === targetId) ?? null;

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
  const beforeTargetsPayload = JSON.stringify(targets);
  const productDiagnosticsResult = buildProductDiagnosticsForUi({
    targets,
    analysis: result,
    productId: PRODUCT_ID,
    targetStorageStatus: "valid",
  });
  const noAdProductDiagnosticsResult = buildProductDiagnosticsForUi({
    targets,
    analysis: result,
    productId: NO_AD_PRODUCT_ID,
    targetStorageStatus: "valid",
  });
  const corruptedTargetResult = buildProductDiagnosticsForUi({
    targets,
    analysis: result,
    productId: PRODUCT_ID,
    targetStorageStatus: parseTmallTargetStorage("{bad-json").status,
  });
  const summary = productDiagnosticsResult.summary;
  const noAdSummary = noAdProductDiagnosticsResult.summary;
  if (!summary || !noAdSummary) {
    throw new Error("product_target_diagnostics_summary_missing");
  }

  const adRoiDiagnostic = findDiagnostic(summary, "product_ad_roi_risk_target");
  const adSpendDiagnostic = findDiagnostic(summary, "product_ad_spend_risk_target");
  const salesDiagnostic = findDiagnostic(summary, "product_gmv_target");
  const invalidDiagnostic = findDiagnostic(summary, "invalid_product_target");
  const pausedDiagnostic = findDiagnostic(summary, "paused_product_target");
  const noAdDiagnostic = findDiagnostic(noAdSummary, "no_ad_product_spend_target");
  const noAdMessages = [
    noAdDiagnostic?.message ?? "",
    noAdDiagnostic?.suggestion ?? "",
  ];
  const noAdMessageMentionsZero = noAdMessages.some((message) =>
    message.includes("按 0 计算") || message.includes("显示为 0"),
  );
  const suggestsPlanAdBackfill = noAdMessages.some(
    (message) => message.includes("计划推广") && message.includes("补齐"),
  );

  const safePayload = {
    summary,
    noAdSummary,
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
  const currentTargetIds = new Set(summary.items.map((item) => item.targetId));

  const output = {
    productDiagnosticCount: summary.totalDiagnosticCount,
    renderedItemCount: summary.items.length,
    maxItemsRespected: summary.items.length <= 5,
    onlyProductDiagnostics: summary.items.every((item) => item.scope === "product"),
    onlyCurrentProductDiagnostics:
      !currentTargetIds.has("store_target_should_not_show") &&
      !currentTargetIds.has("series_target_should_not_show") &&
      !currentTargetIds.has("other_product_target_should_not_show"),
    corruptedTargetSkipsDiagnostics:
      corruptedTargetResult.summary === null && !corruptedTargetResult.diagnosticsInvoked,
    criticalCount: summary.criticalCount,
    warningCount: summary.warningCount,
    infoCount: summary.infoCount,
    successCount: summary.successCount,
    adRoiRiskFound:
      adRoiDiagnostic?.status === "at_risk" &&
      adRoiDiagnostic.category === "ad_roi",
    adSpendRiskFound:
      adSpendDiagnostic?.status === "at_risk" &&
      adSpendDiagnostic.category === "ad_spend",
    salesRiskFound:
      salesDiagnostic?.status === "at_risk" &&
      salesDiagnostic.category === "sales",
    invalidDiagnosticFound:
      invalidDiagnostic?.severity === "critical" &&
      invalidDiagnostic.category === "invalid_target",
    pausedExcluded: pausedDiagnostic === null,
    noAdProductActualIsNull: noAdDiagnostic?.actualValue === null,
    noAdProductMissingActual: noAdDiagnostic?.status === "missing_actual",
    noAdMessageMentionsZero,
    suggestsPlanAdBackfill,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    targetObjectMutated: beforeTargetsPayload !== JSON.stringify(targets),
  };

  const checksPassed =
    output.productDiagnosticCount > 0 &&
    output.renderedItemCount > 0 &&
    output.maxItemsRespected &&
    output.onlyProductDiagnostics &&
    output.onlyCurrentProductDiagnostics &&
    output.corruptedTargetSkipsDiagnostics &&
    output.criticalCount > 0 &&
    output.warningCount > 0 &&
    output.infoCount > 0 &&
    output.successCount > 0 &&
    output.adRoiRiskFound &&
    output.adSpendRiskFound &&
    output.salesRiskFound &&
    output.invalidDiagnosticFound &&
    output.pausedExcluded &&
    output.noAdProductActualIsNull &&
    output.noAdProductMissingActual &&
    !output.noAdMessageMentionsZero &&
    !output.suggestsPlanAdBackfill &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.targetObjectMutated &&
    noAdSummary.items.every((item) => item.targetId === "no_ad_product_spend_target");

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_product_board_target_diagnostics_ui_validation_failed");
  process.exitCode = 1;
});
