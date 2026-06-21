import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
import { buildTmallProductFocusEntry } from "../../lib/tmall/view-models/product-focus-entry";
import { buildTmallProductTargetDiagnostics } from "../../lib/tmall/view-models/target-diagnostics";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";

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

const buildTargets = (): TmallTargetDefinition[] => [
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

  const overview = buildTmallProductBoardOverview(result, TEST_DATE, PRODUCT_ID);
  const beforeResultPayload = JSON.stringify(result);
  const beforeOverviewPayload = JSON.stringify(overview);
  const targetDiagnostics = buildTmallProductTargetDiagnostics({
    targets: buildTargets(),
    analysis: result,
    productId: PRODUCT_ID,
  });
  const beforeTargetDiagnosticsPayload = JSON.stringify(targetDiagnostics);
  const focusEntry = buildTmallProductFocusEntry(overview);
  const emptyFocusEntry = buildTmallProductFocusEntry(null);

  const overviewProductIds = new Set(overview.products.map((product) => product.productId));
  const allItems = [
    ...focusEntry.salesTopProducts,
    ...focusEntry.adFocusProducts,
    ...focusEntry.afterSalesFocusProducts,
    ...(focusEntry.selectedProduct ? [focusEntry.selectedProduct] : []),
  ];
  const safePayload = { focusEntry, emptyFocusEntry };
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
    salesTopMaxFive: focusEntry.salesTopProducts.length <= 5,
    adFocusMaxFive: focusEntry.adFocusProducts.length <= 5,
    afterSalesFocusMaxFive: focusEntry.afterSalesFocusProducts.length <= 5,
    adFocusOnlyHasAdData: focusEntry.adFocusProducts.every((item) => item.hasAdData),
    noAdProductExcludedFromAdFocus:
      !focusEntry.adFocusProducts.some((item) => item.productId === NO_AD_PRODUCT_ID),
    selectedProductHighlighted:
      focusEntry.selectedProductId === PRODUCT_ID &&
      focusEntry.selectedProduct?.productId === PRODUCT_ID &&
      focusEntry.selectedProduct.isSelected &&
      allItems
        .filter((item) => item.productId === PRODUCT_ID)
        .every((item) => item.isSelected),
    clickableProductIdsExist: allItems.every((item) => overviewProductIds.has(item.productId)),
    emptyStateSafe:
      emptyFocusEntry.isEmpty &&
      emptyFocusEntry.salesTopProducts.length === 0 &&
      emptyFocusEntry.adFocusProducts.length === 0 &&
      emptyFocusEntry.afterSalesFocusProducts.length === 0,
    noMisleadingZeroText:
      !safePayloadString.includes("按 0 计算") &&
      !safePayloadString.includes("显示为 0") &&
      !safePayloadString.includes("0.00 倍"),
    noPlanBackfillSuggestion:
      !safePayloadString.includes("用计划推广补齐") &&
      !safePayloadString.includes("使用计划推广补齐"),
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    overviewObjectMutated: beforeOverviewPayload !== JSON.stringify(overview),
    targetDiagnosticsObjectMutated:
      beforeTargetDiagnosticsPayload !== JSON.stringify(targetDiagnostics),
  };

  const checksPassed =
    output.salesTopMaxFive &&
    output.adFocusMaxFive &&
    output.afterSalesFocusMaxFive &&
    output.adFocusOnlyHasAdData &&
    output.noAdProductExcludedFromAdFocus &&
    output.selectedProductHighlighted &&
    output.clickableProductIdsExist &&
    output.emptyStateSafe &&
    output.noMisleadingZeroText &&
    output.noPlanBackfillSuggestion &&
    !output.hasInvalidNumber &&
    !output.hasUndefined &&
    !output.containsSensitiveFieldName &&
    !output.containsSensitiveValue &&
    !output.sourceObjectMutated &&
    !output.overviewObjectMutated &&
    !output.targetDiagnosticsObjectMutated;

  console.log(JSON.stringify(output, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_product_board_focus_entry_validation_failed");
  process.exitCode = 1;
});
