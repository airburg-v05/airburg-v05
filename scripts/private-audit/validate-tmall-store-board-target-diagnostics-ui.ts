import fs from "node:fs";
import path from "node:path";
import { parseTmallTargetStorage, type TmallTargetStorageStatus } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallStoreTargetDiagnostics,
  type TmallTargetDiagnosticSummary,
} from "../../lib/tmall/view-models/target-diagnostics";
import type { TmallAnalysisDisplayResult } from "../../types/tmall";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const SERIES_ID = "store_board_diagnostic_series";

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

interface StoreDiagnosticCompositionInput {
  targets: TmallTargetDefinition[];
  analysis: TmallAnalysisDisplayResult | null;
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

const buildTargets = (): TmallTargetDefinition[] => [
  target({
    id: "store_gmv_target",
    name: "店铺 GMV 目标验证",
    scope: "store",
    metricKey: "gmv",
    targetValue: 100000,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "store_ad_spend_target",
    name: "店铺推广花费目标验证",
    scope: "store",
    metricKey: "adSpend",
    targetValue: 7000,
    direction: "lower_is_better",
    status: "active",
  }),
  target({
    id: "store_ad_spend_risk_target",
    name: "店铺推广花费风险验证",
    scope: "store",
    metricKey: "adSpend",
    targetValue: 100,
    direction: "lower_is_better",
    status: "active",
  }),
  target({
    id: "store_gsv_target",
    name: "店铺 GSV 目标验证",
    scope: "store",
    metricKey: "gsv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "invalid_store_target",
    name: "非法店铺目标验证",
    scope: "store",
    metricKey: "gmv",
    targetValue: 0,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "paused_store_target",
    name: "暂停店铺目标验证",
    scope: "store",
    metricKey: "gsv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "paused",
  }),
  target({
    id: "achieved_store_target",
    name: "达成店铺目标验证",
    scope: "store",
    metricKey: "visitors",
    targetValue: 1,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "product_target_should_not_show",
    name: "宝贝目标过滤验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
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
];

const buildStoreDiagnosticsForUi = ({
  targets,
  analysis,
  targetStorageStatus,
}: StoreDiagnosticCompositionInput): {
  summary: TmallTargetDiagnosticSummary | null;
  diagnosticsInvoked: boolean;
} => {
  if (targetStorageStatus === "corrupted") {
    return { summary: null, diagnosticsInvoked: false };
  }

  return {
    diagnosticsInvoked: true,
    summary: buildTmallStoreTargetDiagnostics({
      targets,
      analysis,
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
  const targets = buildTargets();
  const beforeTargetsPayload = JSON.stringify(targets);
  const storeDiagnosticsResult = buildStoreDiagnosticsForUi({
    targets,
    analysis: result,
    targetStorageStatus: "valid",
  });
  const corruptedTargetResult = buildStoreDiagnosticsForUi({
    targets,
    analysis: result,
    targetStorageStatus: parseTmallTargetStorage("{bad-json").status,
  });
  const summary = storeDiagnosticsResult.summary;
  if (!summary) {
    throw new Error("store_target_diagnostics_summary_missing");
  }

  const adSpendRiskDiagnostic = findDiagnostic(summary, "store_ad_spend_risk_target");
  const salesDiagnostic = findDiagnostic(summary, "store_gmv_target");
  const invalidDiagnostic = findDiagnostic(summary, "invalid_store_target");
  const pausedDiagnostic = findDiagnostic(summary, "paused_store_target");

  const safePayload = { summary };
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
    storeDiagnosticCount: summary.totalDiagnosticCount,
    renderedItemCount: summary.items.length,
    maxItemsRespected: summary.items.length <= 5,
    onlyStoreDiagnostics: summary.items.every((item) => item.scope === "store"),
    corruptedTargetSkipsDiagnostics:
      corruptedTargetResult.summary === null && !corruptedTargetResult.diagnosticsInvoked,
    criticalCount: summary.criticalCount,
    warningCount: summary.warningCount,
    infoCount: summary.infoCount,
    successCount: summary.successCount,
    adSpendRiskFound:
      adSpendRiskDiagnostic?.status === "at_risk" &&
      adSpendRiskDiagnostic.category === "ad_spend",
    salesRiskFound:
      salesDiagnostic?.status === "at_risk" &&
      salesDiagnostic.category === "sales",
    invalidDiagnosticFound:
      invalidDiagnostic?.severity === "critical" &&
      invalidDiagnostic.category === "invalid_target",
    pausedExcluded: pausedDiagnostic === null,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    targetObjectMutated: beforeTargetsPayload !== JSON.stringify(targets),
  };

  const checksPassed =
    output.storeDiagnosticCount > 0 &&
    output.renderedItemCount > 0 &&
    output.maxItemsRespected &&
    output.onlyStoreDiagnostics &&
    output.corruptedTargetSkipsDiagnostics &&
    output.criticalCount > 0 &&
    output.warningCount > 0 &&
    output.infoCount > 0 &&
    output.successCount > 0 &&
    output.adSpendRiskFound &&
    output.salesRiskFound &&
    output.invalidDiagnosticFound &&
    output.pausedExcluded &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.targetObjectMutated &&
    !summary.items.some((item) => item.scope === "product" || item.scope === "series") &&
    !summary.items.some((item) =>
      ["product_target_should_not_show", "series_target_should_not_show"].includes(item.targetId),
    );

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_store_board_target_diagnostics_ui_validation_failed");
  process.exitCode = 1;
});
