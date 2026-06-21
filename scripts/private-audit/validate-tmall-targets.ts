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
  buildTmallTargetActualValue,
  buildTmallTargetProgress,
  getTmallTargetMetricDefinition,
} from "../../lib/tmall/view-models/targets";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const DEFAULT_PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const TEST_DATE = "2026-06-18";
const TEST_MONTH = "2026-06";
const CREATED_AT = "2026-06-20T00:00:00.000Z";

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

const closeTo = (actual: number | null, expected: number, precision = 0.01): boolean =>
  actual !== null && Math.abs(actual - expected) <= precision;

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
  const seriesGroups = [seriesGroup];
  const expectedSeriesGmv = topTwoProductIds.reduce(
    (total, productId) => total + (productGmv.get(productId) ?? 0),
    0,
  );

  const storeGmvTarget = target({
    id: "store_daily_gmv",
    name: "店铺日 GMV 目标",
    scope: "store",
    metricKey: "gmv",
    targetValue: 100000,
  });
  const storeGsvTarget = target({
    id: "store_daily_gsv",
    name: "店铺日 GSV 目标",
    scope: "store",
    metricKey: "gsv",
    targetValue: 30000,
  });
  const storeConversionTarget = target({
    id: "store_daily_conversion",
    name: "店铺日转化率目标",
    scope: "store",
    metricKey: "conversionRate",
    targetValue: 0.005,
  });
  const storeAdSpendTarget = target({
    id: "store_daily_ad_spend",
    name: "店铺日推广花费目标",
    scope: "store",
    metricKey: "adSpend",
    targetValue: 7000,
  });
  const productGmvTarget = target({
    id: "product_daily_gmv",
    name: "宝贝日 GMV 目标",
    scope: "product",
    metricKey: "gmv",
    targetValue: 50000,
    productId: DEFAULT_PRODUCT_ID,
  });
  const noAdProductTarget = target({
    id: "product_no_ad_spend",
    name: "无推广宝贝推广花费目标",
    scope: "product",
    metricKey: "adSpend",
    targetValue: 1000,
    productId: NO_AD_PRODUCT_ID,
  });
  const seriesGmvTarget = target({
    id: "series_daily_gmv",
    name: "系列日 GMV 目标",
    scope: "series",
    metricKey: "gmv",
    targetValue: 60000,
    seriesId: seriesGroup.id,
  });
  const monthlyTarget = target({
    id: "store_monthly_gmv",
    name: "店铺月 GMV 目标",
    scope: "store",
    metricKey: "gmv",
    targetValue: 200000,
    periodType: "monthly",
    periodValue: TEST_MONTH,
  });
  const pausedTarget = target({
    id: "paused_target",
    name: "暂停目标",
    scope: "store",
    metricKey: "gmv",
    targetValue: 100000,
    status: "paused",
  });
  const invalidTarget = {
    ...storeGmvTarget,
    id: "invalid_target",
    name: "非法目标",
    targetValue: 0,
  } satisfies TmallTargetDefinition;

  const validStorage = toTmallTargetStorage([storeGmvTarget, productGmvTarget, seriesGmvTarget]);
  const emptyStorageStatus = parseTmallTargetStorage(null).status;
  const badJsonStatus = parseTmallTargetStorage("{bad-json").status;
  const wrongStructureStatus = parseTmallTargetStorage(JSON.stringify({ version: "bad", targets: [] })).status;
  const validStorageStatus = parseTmallTargetStorage(JSON.stringify(validStorage)).status;
  const storagePayload = JSON.stringify(validStorage);
  const storageHasBlockedKeys =
    storagePayload.includes("rows") ||
    storagePayload.includes("previewRows") ||
    storagePayload.includes("afterSalesRaw") ||
    storagePayload.includes("sourceHealth");

  const storeDailyGmv = buildTmallTargetActualValue(result, storeGmvTarget);
  const storeDailyGsv = buildTmallTargetActualValue(result, storeGsvTarget);
  const storeDailyConversion = buildTmallTargetActualValue(result, storeConversionTarget);
  const storeDailyAdSpend = buildTmallTargetActualValue(result, storeAdSpendTarget);
  const productDailyGmv = buildTmallTargetActualValue(result, productGmvTarget);
  const noAdProductAdSpend = buildTmallTargetActualValue(result, noAdProductTarget);
  const seriesDailyGmv = buildTmallTargetActualValue(result, seriesGmvTarget, seriesGroups);
  const monthlyActual = buildTmallTargetActualValue(result, monthlyTarget);
  const higherProgress = buildTmallTargetProgress(result, [storeGmvTarget])[0];
  const lowerProgress = buildTmallTargetProgress(result, [storeAdSpendTarget])[0];
  const pausedProgress = buildTmallTargetProgress(result, [pausedTarget])[0];
  const invalidProgress = buildTmallTargetProgress(result, [invalidTarget])[0];
  const afterPayload = JSON.stringify(result);

  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const targetPayload = {
    validStorage,
    storeDailyGmv,
    storeDailyGsv,
    storeDailyConversion,
    storeDailyAdSpend,
    productDailyGmv,
    noAdProductAdSpend,
    seriesDailyGmv,
    monthlyActual,
    higherProgress,
    lowerProgress,
    pausedProgress,
    invalidProgress,
  };
  const leafValues = collectLeafValues(targetPayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => leafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(targetPayload).includes(fieldName),
  );

  const summary = {
    emptyStorageStatus,
    badJsonStatus,
    wrongStructureStatus,
    validStorageStatus,
    storeDailyGmvActual: storeDailyGmv.value,
    storeDailyGsvActual: storeDailyGsv.value,
    storeDailyConversionRateActual: storeDailyConversion.value,
    storeDailyAdSpendActual: storeDailyAdSpend.value,
    productDailyGmvActual: productDailyGmv.value,
    noAdProductAdSpendActual: noAdProductAdSpend.value,
    seriesDailyGmvActual: seriesDailyGmv.value,
    higherProgressRate: higherProgress?.progressRate ?? null,
    lowerProgressRate: lowerProgress?.progressRate ?? null,
    pausedStatus: pausedProgress?.status ?? null,
    invalidTargetStatus: invalidProgress?.status ?? null,
    monthlyWarningCount: monthlyActual.warnings.length,
    hasInvalidNumber: hasInvalidNumber(targetPayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName || storageHasBlockedKeys,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.emptyStorageStatus === "empty" &&
    summary.badJsonStatus === "corrupted" &&
    summary.wrongStructureStatus === "corrupted" &&
    summary.validStorageStatus === "valid" &&
    closeTo(summary.storeDailyGmvActual, 73908.11) &&
    closeTo(summary.storeDailyGsvActual, 21287.79) &&
    closeTo(summary.storeDailyConversionRateActual, 78 / 18466, 0.000001) &&
    closeTo(summary.storeDailyAdSpendActual, 7585.7) &&
    storeDailyAdSpend.source === "ad_plan" &&
    closeTo(summary.productDailyGmvActual, 38772.36) &&
    summary.noAdProductAdSpendActual === null &&
    closeTo(summary.seriesDailyGmvActual, expectedSeriesGmv) &&
    closeTo(summary.higherProgressRate, 73908.11 / 100000, 0.000001) &&
    higherProgress?.status === "at_risk" &&
    closeTo(summary.lowerProgressRate, 7000 / 7585.7, 0.000001) &&
    lowerProgress?.status === "in_progress" &&
    summary.pausedStatus === "paused" &&
    summary.invalidTargetStatus === "invalid_target" &&
    summary.monthlyWarningCount > 0 &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_target_validation_failed");
  process.exitCode = 1;
});
