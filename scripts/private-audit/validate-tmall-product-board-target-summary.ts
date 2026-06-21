import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallProductTargetSummary } from "../../lib/tmall/view-models/product-target-summary";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const SELECTED_PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const OTHER_PRODUCT_ID = "824014970181";
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
    id: "selected_product_gmv_target",
    name: "当前商品 GMV 目标验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    direction: "higher_is_better",
    status: "active",
    productId: SELECTED_PRODUCT_ID,
  }),
  target({
    id: "selected_product_roi_target",
    name: "当前商品推广 ROI 目标验证",
    scope: "product",
    metricKey: "adRoi",
    targetValue: 10,
    direction: "higher_is_better",
    status: "active",
    productId: SELECTED_PRODUCT_ID,
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
    id: "selected_product_paused_target",
    name: "暂停当前商品目标验证",
    scope: "product",
    metricKey: "visitors",
    targetValue: 1000,
    direction: "higher_is_better",
    status: "paused",
    productId: SELECTED_PRODUCT_ID,
  }),
  target({
    id: "store_target_excluded",
    name: "店铺目标排除验证",
    scope: "store",
    metricKey: "gmv",
    targetValue: 100000,
    direction: "higher_is_better",
    status: "active",
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
  target({
    id: "other_product_target_excluded",
    name: "其他商品目标排除验证",
    scope: "product",
    metricKey: "gmv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "active",
    productId: OTHER_PRODUCT_ID,
  }),
];

const selectedProductRoi = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
): number | null => {
  const facts = result.adProductDailyFacts.filter(
    (fact) => fact.date === TEST_DATE && String(fact.productId) === SELECTED_PRODUCT_ID,
  );
  const adSpend = facts.reduce((total, fact) => total + fact.adSpend, 0);
  const adTransactionAmount = facts.reduce(
    (total, fact) => total + fact.adTransactionAmount,
    0,
  );
  if (adSpend === 0) return null;
  const value = adTransactionAmount / adSpend;
  return Number.isFinite(value) ? value : null;
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

  const beforePayload = JSON.stringify(result);
  const targets = buildValidationTargets();
  const summaryViewModel = buildTmallProductTargetSummary({
    targets,
    analysis: result,
    productId: SELECTED_PRODUCT_ID,
  });
  const noAdProductSummary = buildTmallProductTargetSummary({
    targets,
    analysis: result,
    productId: NO_AD_PRODUCT_ID,
  });
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safePayload = {
    summaryViewModel,
    noAdProductSummary,
  };
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(safePayload).includes(fieldName),
  );
  const gmvItem = summaryViewModel.targetItems.find(
    (item) => item.targetId === "selected_product_gmv_target",
  );
  const roiItem = summaryViewModel.targetItems.find(
    (item) => item.targetId === "selected_product_roi_target",
  );
  const noAdItem = noAdProductSummary.targetItems.find(
    (item) => item.targetId === "no_ad_product_spend_target",
  );
  const nonCurrentProductTargetIds = [
    "no_ad_product_spend_target",
    "other_product_target_excluded",
  ];
  const storeOrSeriesTargetIds = ["store_target_excluded", "series_target_excluded"];
  const hasNonCurrentProductTargetInItems = summaryViewModel.targetItems.some((item) =>
    nonCurrentProductTargetIds.includes(item.targetId),
  );
  const hasStoreOrSeriesTargetInItems = summaryViewModel.targetItems.some((item) =>
    storeOrSeriesTargetIds.includes(item.targetId),
  );
  const expectedRoi = selectedProductRoi(result);

  const summary = {
    selectedProductId: summaryViewModel.productId,
    totalProductTargetCount: summaryViewModel.totalProductTargetCount,
    activeProductTargetCount: summaryViewModel.activeProductTargetCount,
    pausedProductTargetCount: summaryViewModel.pausedProductTargetCount,
    achievedCount: summaryViewModel.achievedCount,
    inProgressCount: summaryViewModel.inProgressCount,
    atRiskCount: summaryViewModel.atRiskCount,
    missingActualCount: summaryViewModel.missingActualCount,
    targetItemCount: summaryViewModel.targetItems.length,
    productGmvProgressRate: gmvItem?.progressRate ?? null,
    productRoiProgressRate: roiItem?.progressRate ?? null,
    noAdProductActual: noAdItem?.actualValue ?? null,
    noAdProductStatus: noAdItem?.status ?? null,
    primaryActionHref: summaryViewModel.primaryActionHref,
    hasNonCurrentProductTargetInItems,
    hasStoreOrSeriesTargetInItems,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.selectedProductId === SELECTED_PRODUCT_ID &&
    summary.totalProductTargetCount === 3 &&
    summary.activeProductTargetCount === 2 &&
    summary.pausedProductTargetCount === 1 &&
    summary.targetItemCount <= 6 &&
    closeTo(summary.productGmvProgressRate, 38772.36 / 50000) &&
    expectedRoi !== null &&
    closeTo(summary.productRoiProgressRate, expectedRoi / 10) &&
    summary.noAdProductActual === null &&
    summary.noAdProductStatus === "missing_actual" &&
    summary.primaryActionHref === "/targets" &&
    !summary.hasNonCurrentProductTargetInItems &&
    !summary.hasStoreOrSeriesTargetInItems &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "product_target_summary_validation_failed");
  process.exitCode = 1;
});
