import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import type { TmallSeriesGroup } from "../../lib/storage/tmall-series-storage";
import { buildTmallSeriesTargetSummary } from "../../lib/tmall/view-models/series-target-summary";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const SELECTED_SERIES_ID = "target_validation_series";
const NO_AD_SERIES_ID = "no_ad_series";
const OTHER_SERIES_ID = "other_series_id";
const MISSING_SERIES_ID = "missing_series_id";
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
    id: "selected_series_gmv_target",
    name: "当前系列 GMV 目标验证",
    scope: "series",
    metricKey: "gmv",
    targetValue: 60000,
    direction: "higher_is_better",
    status: "active",
    seriesId: SELECTED_SERIES_ID,
  }),
  target({
    id: "selected_series_roi_target",
    name: "当前系列推广 ROI 目标验证",
    scope: "series",
    metricKey: "adRoi",
    targetValue: 2,
    direction: "higher_is_better",
    status: "active",
    seriesId: SELECTED_SERIES_ID,
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
    id: "selected_series_paused_target",
    name: "暂停当前系列目标验证",
    scope: "series",
    metricKey: "visitors",
    targetValue: 1000,
    direction: "higher_is_better",
    status: "paused",
    seriesId: SELECTED_SERIES_ID,
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
    id: "other_series_target_excluded",
    name: "其他系列目标排除验证",
    scope: "series",
    metricKey: "gmv",
    targetValue: 10000,
    direction: "higher_is_better",
    status: "active",
    seriesId: OTHER_SERIES_ID,
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
];

const seriesGmv = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productIds: string[],
): number =>
  result.productDailyFacts
    .filter(
      (fact) =>
        fact.date === TEST_DATE &&
        productIds.includes(String(fact.productId)),
    )
    .reduce((total, fact) => total + fact.gmv, 0);

const seriesRoi = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
  productIds: string[],
): number | null => {
  const facts = result.adProductDailyFacts.filter(
    (fact) =>
      fact.date === TEST_DATE &&
      productIds.includes(String(fact.productId)),
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

const topGmvProductIds = (
  result: Awaited<ReturnType<typeof runTmallFourSourceAnalysis>>,
): string[] => {
  const productGmv = new Map<string, number>();
  result.productDailyFacts
    .filter((fact) => fact.date === TEST_DATE)
    .forEach((fact) => {
      const productId = String(fact.productId);
      productGmv.set(productId, (productGmv.get(productId) ?? 0) + fact.gmv);
    });

  return [...productGmv.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 2)
    .map(([productId]) => productId);
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
  const selectedProductIds = topGmvProductIds(result);
  const seriesGroups: TmallSeriesGroup[] = [
    {
      id: SELECTED_SERIES_ID,
      name: "目标验证系列",
      productIds: selectedProductIds,
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
    {
      id: OTHER_SERIES_ID,
      name: "其他验证系列",
      productIds: [PRODUCT_ID],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ];
  const targets = buildValidationTargets();
  const summaryViewModel = buildTmallSeriesTargetSummary({
    targets,
    analysis: result,
    seriesGroups,
    seriesId: SELECTED_SERIES_ID,
  });
  const noAdSeriesSummary = buildTmallSeriesTargetSummary({
    targets,
    analysis: result,
    seriesGroups,
    seriesId: NO_AD_SERIES_ID,
  });
  const missingSeriesSummary = buildTmallSeriesTargetSummary({
    targets,
    analysis: result,
    seriesGroups,
    seriesId: MISSING_SERIES_ID,
  });
  const editedSeriesSummary = buildTmallSeriesTargetSummary({
    targets,
    analysis: result,
    seriesGroups: [
      {
        ...seriesGroups[0],
        productIds: [NO_AD_PRODUCT_ID],
      },
    ],
    seriesId: SELECTED_SERIES_ID,
  });
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safePayload = {
    summaryViewModel,
    noAdSeriesSummary,
    missingSeriesSummary,
  };
  const safeLeafValues = collectLeafValues(safePayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) =>
    safeLeafValues.has(value),
  );
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(safePayload).includes(fieldName),
  );
  const gmvItem = summaryViewModel.targetItems.find(
    (item) => item.targetId === "selected_series_gmv_target",
  );
  const roiItem = summaryViewModel.targetItems.find(
    (item) => item.targetId === "selected_series_roi_target",
  );
  const noAdItem = noAdSeriesSummary.targetItems.find(
    (item) => item.targetId === "no_ad_series_spend_target",
  );
  const missingSeriesItem = missingSeriesSummary.targetItems.find(
    (item) => item.targetId === "missing_series_target",
  );
  const editedSeriesRoiItem = editedSeriesSummary.targetItems.find(
    (item) => item.targetId === "selected_series_roi_target",
  );
  const nonCurrentSeriesTargetIds = [
    "no_ad_series_spend_target",
    "other_series_target_excluded",
    "missing_series_target",
  ];
  const storeOrProductTargetIds = ["store_target_excluded", "product_target_excluded"];
  const hasNonCurrentSeriesTargetInItems = summaryViewModel.targetItems.some((item) =>
    nonCurrentSeriesTargetIds.includes(item.targetId),
  );
  const hasStoreOrProductTargetInItems = summaryViewModel.targetItems.some((item) =>
    storeOrProductTargetIds.includes(item.targetId),
  );
  const expectedSeriesGmv = seriesGmv(result, selectedProductIds);
  const expectedSeriesRoi = seriesRoi(result, selectedProductIds);

  const summary = {
    selectedSeriesId: summaryViewModel.seriesId,
    totalSeriesTargetCount: summaryViewModel.totalSeriesTargetCount,
    activeSeriesTargetCount: summaryViewModel.activeSeriesTargetCount,
    pausedSeriesTargetCount: summaryViewModel.pausedSeriesTargetCount,
    achievedCount: summaryViewModel.achievedCount,
    inProgressCount: summaryViewModel.inProgressCount,
    atRiskCount: summaryViewModel.atRiskCount,
    missingActualCount: summaryViewModel.missingActualCount,
    targetItemCount: summaryViewModel.targetItems.length,
    seriesGmvProgressRate: gmvItem?.progressRate ?? null,
    seriesRoiProgressRate: roiItem?.progressRate ?? null,
    noAdSeriesActual: noAdItem?.actualValue ?? null,
    noAdSeriesStatus: noAdItem?.status ?? null,
    missingSeriesStatus: missingSeriesItem?.status ?? null,
    primaryActionHref: summaryViewModel.primaryActionHref,
    hasNonCurrentSeriesTargetInItems,
    hasStoreOrProductTargetInItems,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.selectedSeriesId === SELECTED_SERIES_ID &&
    summary.totalSeriesTargetCount === 3 &&
    summary.activeSeriesTargetCount === 2 &&
    summary.pausedSeriesTargetCount === 1 &&
    summary.targetItemCount <= 6 &&
    closeTo(summary.seriesGmvProgressRate, expectedSeriesGmv / 60000) &&
    expectedSeriesRoi !== null &&
    closeTo(summary.seriesRoiProgressRate, expectedSeriesRoi / 2) &&
    summary.noAdSeriesActual === null &&
    summary.noAdSeriesStatus === "missing_actual" &&
    summary.missingSeriesStatus === "missing_actual" &&
    editedSeriesRoiItem?.actualValue === null &&
    editedSeriesRoiItem?.status === "missing_actual" &&
    summary.primaryActionHref === "/targets" &&
    !summary.hasNonCurrentSeriesTargetInItems &&
    !summary.hasStoreOrProductTargetInItems &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_series_board_target_summary_validation_failed");
  process.exitCode = 1;
});
