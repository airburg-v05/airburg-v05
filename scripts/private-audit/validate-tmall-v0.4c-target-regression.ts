import fs from "node:fs";
import path from "node:path";
import { parseTmallSeriesGroupStorage, toTmallSeriesGroupStorage, type TmallSeriesGroup } from "../../lib/storage/tmall-series-storage";
import { parseTmallTargetStorage, toTmallTargetStorage } from "../../lib/storage/tmall-target-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallHomeTargetSummary } from "../../lib/tmall/view-models/home-target-summary";
import { buildTmallProductTargetSummary } from "../../lib/tmall/view-models/product-target-summary";
import { buildTmallSeriesTargetSummary } from "../../lib/tmall/view-models/series-target-summary";
import { buildTmallStoreTargetSummary } from "../../lib/tmall/view-models/store-target-summary";
import { buildTmallTargetProgress } from "../../lib/tmall/view-models/targets";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const SERIES_ID = "target_regression_series";
const NO_AD_SERIES_ID = "target_regression_no_ad_series";
const MISSING_SERIES_ID = "target_regression_missing_series";

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

const hasUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === "object") return Object.values(value).some(hasUndefined);
  return false;
};

const closeTo = (actual: number | null, expected: number | null, precision = 0.000001): boolean => {
  if (actual === null || expected === null) return actual === expected;
  return Math.abs(actual - expected) <= precision;
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

const sum = <TItem>(items: TItem[], getValue: (item: TItem) => number): number =>
  items.reduce((total, item) => total + getValue(item), 0);

const safeDivide = (numerator: number, denominator: number): number | null => {
  if (denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const productGmv = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productId: string,
): number =>
  sum(
    result.productDailyFacts.filter(
      (fact) => fact.date === TEST_DATE && String(fact.productId) === productId,
    ),
    (fact) => fact.gmv,
  );

const storeGmv = (result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>): number =>
  sum(
    result.productDailyFacts.filter((fact) => fact.date === TEST_DATE),
    (fact) => fact.gmv,
  );

const storeAdSpend = (result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>): number =>
  sum(
    result.adPlanDailyFacts.filter((fact) => fact.date === TEST_DATE),
    (fact) => fact.adSpend,
  );

const seriesGmv = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productIds: string[],
): number =>
  sum(
    result.productDailyFacts.filter(
      (fact) => fact.date === TEST_DATE && productIds.includes(String(fact.productId)),
    ),
    (fact) => fact.gmv,
  );

const topProductIds = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
): string[] => {
  const totals = new Map<string, number>();
  result.productDailyFacts
    .filter((fact) => fact.date === TEST_DATE)
    .forEach((fact) => {
      const productId = String(fact.productId);
      totals.set(productId, (totals.get(productId) ?? 0) + fact.gmv);
    });

  return [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 2)
    .map(([productId]) => productId);
};

const buildTargets = (): {
  validTargets: TmallTargetDefinition[];
  invalidTarget: TmallTargetDefinition;
} => {
  const validTargets: TmallTargetDefinition[] = [
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
      id: "product_gmv_target",
      name: "宝贝 GMV 目标验证",
      scope: "product",
      metricKey: "gmv",
      targetValue: 50000,
      direction: "higher_is_better",
      status: "active",
      productId: PRODUCT_ID,
    }),
    target({
      id: "no_ad_product_spend_target",
      name: "无推广宝贝花费目标验证",
      scope: "product",
      metricKey: "adSpend",
      targetValue: 1000,
      direction: "lower_is_better",
      status: "active",
      productId: NO_AD_PRODUCT_ID,
    }),
    target({
      id: "series_gmv_target",
      name: "系列 GMV 目标验证",
      scope: "series",
      metricKey: "gmv",
      targetValue: 60000,
      direction: "higher_is_better",
      status: "active",
      seriesId: SERIES_ID,
    }),
    target({
      id: "no_ad_series_spend_target",
      name: "无推广系列花费目标验证",
      scope: "series",
      metricKey: "adSpend",
      targetValue: 1000,
      direction: "lower_is_better",
      status: "active",
      seriesId: NO_AD_SERIES_ID,
    }),
    target({
      id: "missing_series_target",
      name: "缺失系列目标验证",
      scope: "series",
      metricKey: "gmv",
      targetValue: 1000,
      direction: "higher_is_better",
      status: "active",
      seriesId: MISSING_SERIES_ID,
    }),
    target({
      id: "paused_target",
      name: "暂停目标验证",
      scope: "store",
      metricKey: "gsv",
      targetValue: 10000,
      direction: "higher_is_better",
      status: "paused",
    }),
  ];

  const invalidTarget: TmallTargetDefinition = {
    ...validTargets[0],
    id: "invalid_target",
    name: "非法目标验证",
    targetValue: 0,
  };

  return { validTargets, invalidTarget };
};

const itemStatus = (
  items: { targetId: string; status: string }[],
  targetId: string,
): string | null => items.find((item) => item.targetId === targetId)?.status ?? null;

const itemActual = (
  items: { targetId: string; actualValue: number | null }[],
  targetId: string,
): number | null | undefined => items.find((item) => item.targetId === targetId)?.actualValue;

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
  const selectedSeriesProductIds = topProductIds(result);
  const seriesGroups: TmallSeriesGroup[] = [
    {
      id: SERIES_ID,
      name: "目标验证系列",
      productIds: selectedSeriesProductIds,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: NO_AD_SERIES_ID,
      name: "无推广验证系列",
      productIds: [NO_AD_PRODUCT_ID],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ];
  const { validTargets, invalidTarget } = buildTargets();
  const allTargets = [...validTargets, invalidTarget];
  const targetStorage = toTmallTargetStorage(validTargets);
  const seriesStorage = toTmallSeriesGroupStorage(seriesGroups);
  const beforeTargetStoragePayload = JSON.stringify(targetStorage);
  const beforeSeriesStoragePayload = JSON.stringify(seriesStorage);

  const progressItems = buildTmallTargetProgress(result, allTargets, seriesGroups);
  const storeSummary = buildTmallStoreTargetSummary({ targets: allTargets, analysis: result });
  const productSummary = buildTmallProductTargetSummary({
    targets: allTargets,
    analysis: result,
    productId: PRODUCT_ID,
  });
  const noAdProductSummary = buildTmallProductTargetSummary({
    targets: allTargets,
    analysis: result,
    productId: NO_AD_PRODUCT_ID,
  });
  const seriesSummary = buildTmallSeriesTargetSummary({
    targets: allTargets,
    analysis: result,
    seriesGroups,
    seriesId: SERIES_ID,
  });
  const noAdSeriesSummary = buildTmallSeriesTargetSummary({
    targets: allTargets,
    analysis: result,
    seriesGroups,
    seriesId: NO_AD_SERIES_ID,
  });
  const missingSeriesSummary = buildTmallSeriesTargetSummary({
    targets: allTargets,
    analysis: result,
    seriesGroups,
    seriesId: MISSING_SERIES_ID,
  });
  const homeSummary = buildTmallHomeTargetSummary({
    targets: allTargets,
    analysis: result,
    seriesGroups,
  });
  const storeSummaryWithCorruptedSeries = buildTmallStoreTargetSummary({
    targets: allTargets,
    analysis: result,
  });
  const productSummaryWithCorruptedSeries = buildTmallProductTargetSummary({
    targets: allTargets,
    analysis: result,
    productId: PRODUCT_ID,
  });

  const storeGmvProgress = progressItems.find((item) => item.target.id === "store_gmv_target");
  const storeAdSpendProgress = progressItems.find((item) => item.target.id === "store_ad_spend_target");
  const productGmvProgress = progressItems.find((item) => item.target.id === "product_gmv_target");
  const seriesGmvProgress = progressItems.find((item) => item.target.id === "series_gmv_target");
  const pausedProgress = progressItems.find((item) => item.target.id === "paused_target");
  const invalidProgress = progressItems.find((item) => item.target.id === "invalid_target");
  const noAdProductActual = itemActual(noAdProductSummary.targetItems, "no_ad_product_spend_target");
  const noAdSeriesActual = itemActual(noAdSeriesSummary.targetItems, "no_ad_series_spend_target");
  const missingSeriesStatus = itemStatus(missingSeriesSummary.targetItems, "missing_series_target");

  const safePayload = {
    targetStorage,
    seriesStorage,
    progressItems,
    homeSummary,
    storeSummary,
    productSummary,
    noAdProductSummary,
    seriesSummary,
    noAdSeriesSummary,
    missingSeriesSummary,
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
  const storageHasBlockedKeys =
    JSON.stringify(targetStorage).includes("rows") ||
    JSON.stringify(targetStorage).includes("previewRows") ||
    JSON.stringify(targetStorage).includes("fileName") ||
    JSON.stringify(targetStorage).includes("sourceHealth") ||
    JSON.stringify(seriesStorage).includes("rows") ||
    JSON.stringify(seriesStorage).includes("previewRows") ||
    JSON.stringify(seriesStorage).includes("fileName") ||
    JSON.stringify(seriesStorage).includes("sourceHealth");

  const expectedStoreGmvProgress = safeDivide(storeGmv(result), 100000);
  const expectedStoreAdSpendProgress = safeDivide(7000, storeAdSpend(result));
  const expectedProductGmvProgress = safeDivide(productGmv(result, PRODUCT_ID), 50000);
  const expectedSeriesGmvProgress = safeDivide(seriesGmv(result, selectedSeriesProductIds), 60000);

  const storeTargetPass =
    closeTo(storeGmvProgress?.progressRate ?? null, expectedStoreGmvProgress) &&
    closeTo(storeAdSpendProgress?.progressRate ?? null, expectedStoreAdSpendProgress);
  const productTargetPass =
    closeTo(productGmvProgress?.progressRate ?? null, expectedProductGmvProgress) &&
    noAdProductActual === null &&
    itemStatus(noAdProductSummary.targetItems, "no_ad_product_spend_target") === "missing_actual";
  const seriesTargetPass =
    closeTo(seriesGmvProgress?.progressRate ?? null, expectedSeriesGmvProgress) &&
    noAdSeriesActual === null &&
    itemStatus(noAdSeriesSummary.targetItems, "no_ad_series_spend_target") === "missing_actual" &&
    missingSeriesStatus === "missing_actual";
  const homeSummaryPass =
    homeSummary.totalTargetCount === allTargets.length &&
    homeSummary.storeTargetCount === 3 &&
    homeSummary.productTargetCount === 2 &&
    homeSummary.seriesTargetCount === 3;
  const storeBoardSummaryPass =
    storeSummary.totalStoreTargetCount === 4 &&
    storeSummary.targetItems.every((item) =>
      ["store_gmv_target", "store_ad_spend_target", "paused_target", "invalid_target"].includes(item.targetId),
    );
  const productBoardSummaryPass =
    productSummary.totalProductTargetCount === 1 &&
    productSummary.targetItems.every((item) => item.targetId === "product_gmv_target");
  const seriesBoardSummaryPass =
    seriesSummary.totalSeriesTargetCount === 1 &&
    seriesSummary.targetItems.every((item) => item.targetId === "series_gmv_target");
  const corruptedTargetStatus = parseTmallTargetStorage("{bad-json").status;
  const corruptedSeriesStatus = parseTmallSeriesGroupStorage("{bad-json").status;
  const corruptedSeriesDoesNotAffectStoreProduct =
    corruptedSeriesStatus === "corrupted" &&
    storeSummaryWithCorruptedSeries.totalStoreTargetCount === storeSummary.totalStoreTargetCount &&
    productSummaryWithCorruptedSeries.totalProductTargetCount === productSummary.totalProductTargetCount;
  const sourceObjectMutated =
    beforeResultPayload !== JSON.stringify(result) ||
    beforeTargetStoragePayload !== JSON.stringify(targetStorage) ||
    beforeSeriesStoragePayload !== JSON.stringify(seriesStorage);

  const summary = {
    storageVersion: targetStorage.version,
    storeTargetPass,
    productTargetPass,
    seriesTargetPass,
    homeSummaryPass,
    storeBoardSummaryPass,
    productBoardSummaryPass,
    seriesBoardSummaryPass,
    noAdProductActualIsNull: noAdProductActual === null,
    noAdSeriesActualIsNull: noAdSeriesActual === null,
    missingSeriesStatus,
    pausedStatus: pausedProgress?.status ?? null,
    invalidTargetStatus: invalidProgress?.status ?? null,
    corruptedTargetStatus,
    corruptedSeriesStatus,
    corruptedSeriesDoesNotAffectStoreProduct,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveValue,
    containsSensitiveFieldName: containsSensitiveFieldName || storageHasBlockedKeys,
    sourceObjectMutated,
  };

  const checksPassed =
    summary.storageVersion === "tmall_targets_v1" &&
    summary.storeTargetPass &&
    summary.productTargetPass &&
    summary.seriesTargetPass &&
    summary.homeSummaryPass &&
    summary.storeBoardSummaryPass &&
    summary.productBoardSummaryPass &&
    summary.seriesBoardSummaryPass &&
    summary.noAdProductActualIsNull &&
    summary.noAdSeriesActualIsNull &&
    summary.missingSeriesStatus === "missing_actual" &&
    summary.pausedStatus === "paused" &&
    summary.invalidTargetStatus === "invalid_target" &&
    summary.corruptedTargetStatus === "corrupted" &&
    summary.corruptedSeriesStatus === "corrupted" &&
    summary.corruptedSeriesDoesNotAffectStoreProduct &&
    !summary.hasInvalidNumber &&
    !summary.hasUndefined &&
    !summary.containsSensitiveValue &&
    !summary.containsSensitiveFieldName &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_v0_4c_target_regression_failed");
  process.exitCode = 1;
});
