import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallStoreTargetSummary } from "../../lib/tmall/view-models/store-target-summary";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const SERIES_ID = "target_validation_series";

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

const closeTo = (actual: number | null, expected: number, precision = 0.000001): boolean =>
  actual !== null && Math.abs(actual - expected) <= precision;

const target = (
  values: Omit<TmallTargetDefinition, "periodType" | "periodValue" | "createdAt" | "updatedAt">,
): TmallTargetDefinition => ({
  periodType: "daily",
  periodValue: TEST_DATE,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...values,
});

const buildValidationTargets = (): TmallTargetDefinition[] => [
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
    id: "store_gsv_target",
    name: "店铺 GSV 目标验证",
    scope: "store",
    metricKey: "gsv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "active",
  }),
  target({
    id: "store_paused_target",
    name: "暂停店铺目标验证",
    scope: "store",
    metricKey: "visitors",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "paused",
  }),
  target({
    id: "product_target_excluded",
    name: "宝贝目标排除验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
  }),
  target({
    id: "series_target_excluded",
    name: "系列目标排除验证",
    scope: "series",
    metricKey: "gmv",
    targetValue: 60000,
    direction: "higher_is_better",
    status: "active",
    seriesId: SERIES_ID,
  }),
];

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

  const beforePayload = JSON.stringify(result);
  const summaryViewModel = buildTmallStoreTargetSummary({
    targets: buildValidationTargets(),
    analysis: result,
  });
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(summaryViewModel);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(summaryViewModel).includes(fieldName),
  );
  const gmvItem = summaryViewModel.targetItems.find((item) => item.targetId === "store_gmv_target");
  const adSpendItem = summaryViewModel.targetItems.find((item) => item.targetId === "store_ad_spend_target");
  const gsvItem = summaryViewModel.targetItems.find((item) => item.targetId === "store_gsv_target");
  const hasNonStoreTargetInItems = summaryViewModel.targetItems.some((item) =>
    ["product_target_excluded", "series_target_excluded"].includes(item.targetId),
  );

  const summary = {
    totalStoreTargetCount: summaryViewModel.totalStoreTargetCount,
    activeStoreTargetCount: summaryViewModel.activeStoreTargetCount,
    pausedStoreTargetCount: summaryViewModel.pausedStoreTargetCount,
    achievedCount: summaryViewModel.achievedCount,
    inProgressCount: summaryViewModel.inProgressCount,
    atRiskCount: summaryViewModel.atRiskCount,
    missingActualCount: summaryViewModel.missingActualCount,
    targetItemCount: summaryViewModel.targetItems.length,
    gmvProgressRate: gmvItem?.progressRate ?? null,
    adSpendProgressRate: adSpendItem?.progressRate ?? null,
    gsvStatus: gsvItem?.status ?? null,
    primaryActionHref: summaryViewModel.primaryActionHref,
    hasNonStoreTargetInItems,
    hasInvalidNumber: hasInvalidNumber(summaryViewModel),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.totalStoreTargetCount === 4 &&
    summary.activeStoreTargetCount === 3 &&
    summary.pausedStoreTargetCount === 1 &&
    summary.targetItemCount <= 6 &&
    closeTo(summary.gmvProgressRate, 73908.11 / 100000) &&
    closeTo(summary.adSpendProgressRate, 7000 / 7585.7) &&
    summary.gsvStatus === "achieved" &&
    summary.primaryActionHref === "/targets" &&
    !summary.hasNonStoreTargetInItems &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "store_target_summary_validation_failed");
  process.exitCode = 1;
});
