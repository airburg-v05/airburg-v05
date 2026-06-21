import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  parseTmallTargetStorage,
  toTmallTargetStorage,
} from "../../lib/storage/tmall-target-storage";
import {
  buildTargetDefinition,
  buildTmallTargetPageViewModel,
  deleteTargetById,
  updateTargetStatus,
  upsertTarget,
  type TmallTargetFormValues,
} from "../../lib/tmall/view-models/target-page";
import { getTmallTargetMetricDefinition } from "../../lib/tmall/view-models/targets";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";

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

const formValues = (
  values: Partial<TmallTargetFormValues> &
    Pick<TmallTargetFormValues, "scope" | "metricKey" | "targetValue">,
): TmallTargetFormValues => ({
  name: "目标验证",
  periodType: "daily",
  periodValue: TEST_DATE,
  status: "active",
  ...values,
});

const seriesTarget = (): TmallTargetDefinition => ({
  id: "series_target_preserved",
  name: "系列目标保留验证",
  scope: "series",
  periodType: "daily",
  periodValue: TEST_DATE,
  metricKey: "gmv",
  targetValue: 1000,
  direction: getTmallTargetMetricDefinition("gmv").direction,
  status: "active",
  seriesId: "series_for_preserve_check",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
});

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
  const storeGmvTarget = buildTargetDefinition({
    id: "store_gmv_target",
    now: CREATED_AT,
    values: formValues({
      name: "店铺 GMV 目标",
      scope: "store",
      metricKey: "gmv",
      targetValue: 100000,
    }),
  });
  const productGmvTarget = buildTargetDefinition({
    id: "product_gmv_target",
    now: CREATED_AT,
    values: formValues({
      name: "宝贝 GMV 目标",
      scope: "product",
      metricKey: "gmv",
      targetValue: 50000,
      productId: PRODUCT_ID,
    }),
  });
  const noAdProductTarget = buildTargetDefinition({
    id: "product_no_ad_spend_target",
    now: CREATED_AT,
    values: formValues({
      name: "无推广宝贝推广花费目标",
      scope: "product",
      metricKey: "adSpend",
      targetValue: 1000,
      productId: NO_AD_PRODUCT_ID,
    }),
  });

  let targets = [seriesTarget()];
  targets = upsertTarget(targets, storeGmvTarget);
  targets = upsertTarget(targets, productGmvTarget);
  targets = upsertTarget(targets, noAdProductTarget);

  const storage = toTmallTargetStorage(targets);
  const viewModel = buildTmallTargetPageViewModel({
    targets,
    analysis: result,
    selectedDate: TEST_DATE,
  });
  const productOptionsSorted = viewModel.productOptions.every((option, index, options) =>
    index === 0 || options[index - 1].gmv >= option.gmv,
  );
  const storeGmvProgress = viewModel.storeProgressItems.find(
    (item) => item.target.id === storeGmvTarget.id,
  );
  const productGmvProgress = viewModel.productProgressItems.find(
    (item) => item.target.id === productGmvTarget.id,
  );
  const noAdProductProgress = viewModel.productProgressItems.find(
    (item) => item.target.id === noAdProductTarget.id,
  );

  const pausedTargets = updateTargetStatus({
    targets,
    targetId: productGmvTarget.id,
    status: "paused",
    updatedAt: CREATED_AT,
  });
  const pausedProductStatus = pausedTargets.find((target) => target.id === productGmvTarget.id)?.status ?? null;
  const resumedTargets = updateTargetStatus({
    targets: pausedTargets,
    targetId: productGmvTarget.id,
    status: "active",
    updatedAt: CREATED_AT,
  });
  const resumedProductStatus = resumedTargets.find((target) => target.id === productGmvTarget.id)?.status ?? null;
  const deletedTargets = deleteTargetById(resumedTargets, productGmvTarget.id);
  const deletedProductTargetCount =
    resumedTargets.filter((target) => target.scope === "product").length -
    deletedTargets.filter((target) => target.scope === "product").length;
  const missingActualProductStatus = buildTmallTargetPageViewModel({
    targets: [productGmvTarget],
    analysis: null,
    selectedDate: TEST_DATE,
  }).productProgressItems[0]?.status ?? null;
  const corruptedStatus = parseTmallTargetStorage("{bad-json").status;
  const afterPayload = JSON.stringify(result);

  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safePayload = {
    storage,
    viewModel,
    missingActualProductStatus,
  };
  const safePayloadString = JSON.stringify(safePayload);
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    safePayloadString.includes(fieldName),
  );
  const storageHasBlockedKeys =
    safePayloadString.includes("rows") ||
    safePayloadString.includes("previewRows") ||
    safePayloadString.includes("afterSalesRaw") ||
    safePayloadString.includes("fileName") ||
    safePayloadString.includes("localStorage");

  const summary = {
    productOptionCount: viewModel.productOptions.length,
    productOptionsSorted,
    storageVersion: storage.version,
    storeTargetCount: viewModel.storeTargets.length,
    productTargetCount: viewModel.productTargets.length,
    preservedSeriesTargetCount: viewModel.seriesTargets.length,
    storeGmvProgressRate: storeGmvProgress?.progressRate ?? null,
    productGmvActual: productGmvProgress?.actualValue ?? null,
    productGmvProgressRate: productGmvProgress?.progressRate ?? null,
    noAdProductAdSpendActual: noAdProductProgress?.actualValue ?? null,
    noAdProductStatus: noAdProductProgress?.status ?? null,
    pausedProductStatus,
    resumedProductStatus,
    deletedProductTargetCount,
    missingActualProductStatus,
    corruptedStatus,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName || storageHasBlockedKeys,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.productOptionCount === 19 &&
    summary.productOptionsSorted &&
    summary.storageVersion === "tmall_targets_v1" &&
    summary.storeTargetCount === 1 &&
    summary.productTargetCount === 2 &&
    summary.preservedSeriesTargetCount === 1 &&
    closeTo(summary.storeGmvProgressRate, 73908.11 / 100000) &&
    closeTo(summary.productGmvActual, 38772.36) &&
    closeTo(summary.productGmvProgressRate, 38772.36 / 50000) &&
    summary.noAdProductAdSpendActual === null &&
    summary.noAdProductStatus === "missing_actual" &&
    summary.pausedProductStatus === "paused" &&
    summary.resumedProductStatus === "active" &&
    summary.deletedProductTargetCount === 1 &&
    summary.missingActualProductStatus === "missing_actual" &&
    summary.corruptedStatus === "corrupted" &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_target_product_page_validation_failed");
  process.exitCode = 1;
});
