import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  parseTmallTargetStorage,
  toTmallTargetStorage,
} from "../../lib/storage/tmall-target-storage";
import {
  buildStoreTargetDefinition,
  buildTmallTargetPageViewModel,
  deleteTargetById,
  updateTargetStatus,
  upsertStoreTarget,
  type TmallStoreTargetFormValues,
} from "../../lib/tmall/view-models/target-page";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";

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
  values: Partial<TmallStoreTargetFormValues> & Pick<TmallStoreTargetFormValues, "metricKey" | "targetValue">,
): TmallStoreTargetFormValues => ({
  name: "店铺目标验证",
  periodType: "daily",
  periodValue: TEST_DATE,
  status: "active",
  ...values,
});

const nonStoreTargets = (): TmallTargetDefinition[] => [
  {
    id: "product_target_preserved",
    name: "宝贝目标保留验证",
    scope: "product",
    periodType: "daily",
    periodValue: TEST_DATE,
    metricKey: "gmv",
    targetValue: 1000,
    direction: "higher_is_better",
    status: "active",
    productId: PRODUCT_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
  {
    id: "series_target_preserved",
    name: "系列目标保留验证",
    scope: "series",
    periodType: "daily",
    periodValue: TEST_DATE,
    metricKey: "gmv",
    targetValue: 1000,
    direction: "higher_is_better",
    status: "active",
    seriesId: "series_for_preserve_check",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  },
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
  const emptyViewModel = buildTmallTargetPageViewModel({ targets: [], analysis: result });
  const gmvTarget = buildStoreTargetDefinition({
    id: "store_gmv_target",
    now: CREATED_AT,
    values: formValues({ metricKey: "gmv", targetValue: 100000 }),
  });
  const adSpendTarget = buildStoreTargetDefinition({
    id: "store_ad_spend_target",
    now: CREATED_AT,
    values: formValues({
      name: "店铺推广花费目标",
      metricKey: "adSpend",
      targetValue: 7000,
    }),
  });
  let targets = nonStoreTargets();
  targets = upsertStoreTarget(targets, gmvTarget);
  targets = upsertStoreTarget(targets, adSpendTarget);

  const storage = toTmallTargetStorage(targets);
  const viewModel = buildTmallTargetPageViewModel({ targets, analysis: result });
  const gmvProgress = viewModel.progressItems.find((item) => item.target.id === gmvTarget.id);
  const adSpendProgress = viewModel.progressItems.find((item) => item.target.id === adSpendTarget.id);
  const pausedTargets = updateTargetStatus({
    targets,
    targetId: adSpendTarget.id,
    status: "paused",
    updatedAt: CREATED_AT,
  });
  const pausedViewModel = buildTmallTargetPageViewModel({ targets: pausedTargets, analysis: result });
  const pausedStatus = pausedViewModel.progressItems.find((item) => item.target.id === adSpendTarget.id)?.status ?? null;
  const resumedTargets = updateTargetStatus({
    targets: pausedTargets,
    targetId: adSpendTarget.id,
    status: "active",
    updatedAt: CREATED_AT,
  });
  const resumedStatus = resumedTargets.find((target) => target.id === adSpendTarget.id)?.status ?? null;
  const deletedTargets = deleteTargetById(resumedTargets, gmvTarget.id);
  const deletedTargetCount = resumedTargets.length - deletedTargets.length;
  const missingActualStatus = buildTmallTargetPageViewModel({
    targets: [gmvTarget],
    analysis: null,
  }).progressItems[0]?.status ?? null;
  const storagePayload = JSON.stringify(storage);
  const storageHasBlockedKeys =
    storagePayload.includes("rows") ||
    storagePayload.includes("previewRows") ||
    storagePayload.includes("afterSalesRaw") ||
    storagePayload.includes("sourceHealth");
  const corruptedStatus = parseTmallTargetStorage("{bad-json").status;
  const afterPayload = JSON.stringify(result);

  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safePayload = {
    storage,
    viewModel,
    pausedViewModel,
    missingActualStatus,
  };
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(safePayload).includes(fieldName),
  );

  const summary = {
    emptyTargetCount: emptyViewModel.storeTargets.length,
    createdStoreTargetCount: viewModel.storeTargets.length,
    storageVersion: storage.version,
    storeListCount: viewModel.progressItems.length,
    preservedNonStoreTargetCount: viewModel.nonStoreTargets.length,
    gmvProgressRate: gmvProgress?.progressRate ?? null,
    adSpendProgressRate: adSpendProgress?.progressRate ?? null,
    pausedStatus,
    resumedStatus,
    deletedTargetCount,
    corruptedStatus,
    missingActualStatus,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName || storageHasBlockedKeys,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.emptyTargetCount === 0 &&
    summary.createdStoreTargetCount === 2 &&
    summary.storageVersion === "tmall_targets_v1" &&
    summary.storeListCount === 2 &&
    summary.preservedNonStoreTargetCount === 2 &&
    closeTo(summary.gmvProgressRate, 73908.11 / 100000) &&
    closeTo(summary.adSpendProgressRate, 7000 / 7585.7) &&
    summary.pausedStatus === "paused" &&
    summary.resumedStatus === "active" &&
    summary.deletedTargetCount === 1 &&
    summary.corruptedStatus === "corrupted" &&
    summary.missingActualStatus === "missing_actual" &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_target_page_validation_failed");
  process.exitCode = 1;
});
