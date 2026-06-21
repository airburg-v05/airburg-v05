import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import type { TmallSeriesGroup } from "../../lib/storage/tmall-series-storage";
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

const target = (
  overrides: Pick<TmallTargetDefinition, "id" | "name" | "scope" | "metricKey" | "targetValue"> &
    Partial<TmallTargetDefinition>,
): TmallTargetDefinition => ({
  periodType: "daily",
  periodValue: TEST_DATE,
  direction: getTmallTargetMetricDefinition(overrides.metricKey).direction,
  status: "active",
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
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
  const productGmv = new Map<string, number>();
  result.productDailyFacts
    .filter((fact) => fact.date === TEST_DATE)
    .forEach((fact) => {
      const productId = String(fact.productId);
      productGmv.set(productId, (productGmv.get(productId) ?? 0) + fact.gmv);
    });
  const topTwoProductIds = [...productGmv.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 2)
    .map(([productId]) => productId);
  const seriesGroup: TmallSeriesGroup = {
    id: "target_validation_series",
    name: "目标验证系列",
    productIds: topTwoProductIds,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const noAdSeriesGroup: TmallSeriesGroup = {
    id: "target_validation_no_ad_series",
    name: "无推广验证系列",
    productIds: [NO_AD_PRODUCT_ID],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
  const expectedSeriesGmv = topTwoProductIds.reduce(
    (total, productId) => total + (productGmv.get(productId) ?? 0),
    0,
  );

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
  const seriesGmvTarget = buildTargetDefinition({
    id: "series_gmv_target",
    now: CREATED_AT,
    values: formValues({
      name: "系列 GMV 目标",
      scope: "series",
      metricKey: "gmv",
      targetValue: 60000,
      seriesId: seriesGroup.id,
    }),
  });
  const noAdSeriesTarget = buildTargetDefinition({
    id: "series_no_ad_spend_target",
    now: CREATED_AT,
    values: formValues({
      name: "无推广系列推广花费目标",
      scope: "series",
      metricKey: "adSpend",
      targetValue: 1000,
      seriesId: noAdSeriesGroup.id,
    }),
  });
  const missingSeriesTarget = target({
    id: "series_missing_target",
    name: "缺失系列目标",
    scope: "series",
    metricKey: "gmv",
    targetValue: 1000,
    seriesId: "missing_series_id",
  });

  let targets: TmallTargetDefinition[] = [];
  targets = upsertTarget(targets, storeGmvTarget);
  targets = upsertTarget(targets, productGmvTarget);
  targets = upsertTarget(targets, seriesGmvTarget);
  const storage = toTmallTargetStorage(targets);

  const viewModel = buildTmallTargetPageViewModel({
    targets,
    analysis: result,
    selectedDate: TEST_DATE,
    seriesGroups: [seriesGroup],
  });
  const noAdSeriesViewModel = buildTmallTargetPageViewModel({
    targets: [noAdSeriesTarget],
    analysis: result,
    selectedDate: TEST_DATE,
    seriesGroups: [noAdSeriesGroup],
  });
  const missingSeriesViewModel = buildTmallTargetPageViewModel({
    targets: [missingSeriesTarget],
    analysis: result,
    selectedDate: TEST_DATE,
    seriesGroups: [seriesGroup],
  });
  const corruptedSeriesViewModel = buildTmallTargetPageViewModel({
    targets,
    analysis: result,
    selectedDate: TEST_DATE,
    seriesGroups: [],
  });
  const seriesProgress = viewModel.seriesProgressItems.find((item) => item.target.id === seriesGmvTarget.id);
  const noAdSeriesProgress = noAdSeriesViewModel.seriesProgressItems[0] ?? null;

  const pausedTargets = updateTargetStatus({
    targets,
    targetId: seriesGmvTarget.id,
    status: "paused",
    updatedAt: CREATED_AT,
  });
  const pausedViewModel = buildTmallTargetPageViewModel({
    targets: pausedTargets,
    analysis: result,
    selectedDate: TEST_DATE,
    seriesGroups: [seriesGroup],
  });
  const pausedSeriesStatus = pausedViewModel.seriesProgressItems.find(
    (item) => item.target.id === seriesGmvTarget.id,
  )?.status ?? null;
  const resumedTargets = updateTargetStatus({
    targets: pausedTargets,
    targetId: seriesGmvTarget.id,
    status: "active",
    updatedAt: CREATED_AT,
  });
  const resumedSeriesStatus = resumedTargets.find((item) => item.id === seriesGmvTarget.id)?.status ?? null;
  const deletedTargets = deleteTargetById(resumedTargets, seriesGmvTarget.id);
  const deletedSeriesTargetCount =
    resumedTargets.filter((item) => item.scope === "series").length -
    deletedTargets.filter((item) => item.scope === "series").length;
  const missingSeriesStatus = missingSeriesViewModel.seriesProgressItems[0]?.status ?? null;
  const missingActualSeriesStatus = buildTmallTargetPageViewModel({
    targets: [seriesGmvTarget],
    analysis: null,
    selectedDate: TEST_DATE,
    seriesGroups: [seriesGroup],
  }).seriesProgressItems[0]?.status ?? null;
  const corruptedTargetStatus = parseTmallTargetStorage("{bad-json").status;
  const afterPayload = JSON.stringify(result);

  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safePayload = {
    storage,
    viewModel,
    noAdSeriesViewModel,
    missingSeriesViewModel,
    corruptedSeriesViewModel,
    missingActualSeriesStatus,
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
  const seriesOptionsContainProductNames = viewModel.seriesOptions.some((option) =>
    "productName" in option || "productNames" in option,
  );

  const summary = {
    storageVersion: storage.version,
    storeTargetCount: viewModel.storeTargets.length,
    productTargetCount: viewModel.productTargets.length,
    seriesTargetCount: viewModel.seriesTargets.length,
    seriesOptionCount: viewModel.seriesOptions.length,
    seriesGmvActual: seriesProgress?.actualValue ?? null,
    seriesGmvProgressRate: seriesProgress?.progressRate ?? null,
    noAdSeriesAdSpendActual: noAdSeriesProgress?.actualValue ?? null,
    noAdSeriesStatus: noAdSeriesProgress?.status ?? null,
    pausedSeriesStatus,
    resumedSeriesStatus,
    deletedSeriesTargetCount,
    missingSeriesStatus,
    missingActualSeriesStatus,
    corruptedTargetStatus,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    containsSensitiveValue:
      containsSensitiveValue || containsSensitiveFieldName || storageHasBlockedKeys || seriesOptionsContainProductNames,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.storageVersion === "tmall_targets_v1" &&
    summary.storeTargetCount === 1 &&
    summary.productTargetCount === 1 &&
    summary.seriesTargetCount === 1 &&
    summary.seriesOptionCount === 1 &&
    closeTo(summary.seriesGmvActual, expectedSeriesGmv) &&
    closeTo(summary.seriesGmvProgressRate, expectedSeriesGmv / 60000) &&
    summary.noAdSeriesAdSpendActual === null &&
    summary.noAdSeriesStatus === "missing_actual" &&
    summary.pausedSeriesStatus === "paused" &&
    summary.resumedSeriesStatus === "active" &&
    summary.deletedSeriesTargetCount === 1 &&
    summary.missingSeriesStatus === "missing_actual" &&
    summary.missingActualSeriesStatus === "missing_actual" &&
    summary.corruptedTargetStatus === "corrupted" &&
    corruptedSeriesViewModel.storeProgressItems.length === 1 &&
    corruptedSeriesViewModel.productProgressItems.length === 1 &&
    corruptedSeriesViewModel.seriesProgressItems[0]?.status === "missing_actual" &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_target_series_page_validation_failed");
  process.exitCode = 1;
});
