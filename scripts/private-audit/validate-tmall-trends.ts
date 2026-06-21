import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildAfterSalesTrendSeries,
  buildProductTrendSeries,
  buildSeriesTrendSeries,
  buildStoreTrendSeries,
  getTrendDateCoverage,
} from "../../lib/tmall/view-models/trends";

const ROOT = process.cwd();

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
  const coverage = getTrendDateCoverage(result);
  const storeGmvTrend = buildStoreTrendSeries(result, "gmv");
  const storeGsvTrend = buildStoreTrendSeries(result, "gsv");
  const storeVisitorsTrend = buildStoreTrendSeries(result, "visitors");
  const storeConversionRateTrend = buildStoreTrendSeries(result, "conversionRate");
  const planAdSpendTrend = buildStoreTrendSeries(result, "adSpend");
  const planAdRoiTrend = buildStoreTrendSeries(result, "adRoi");
  const productTotals = new Map<string, number>();

  result.productDailyFacts.forEach((fact) => {
    productTotals.set(String(fact.productId), (productTotals.get(String(fact.productId)) ?? 0) + fact.gmv);
  });

  const topProductIds = [...productTotals.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([productId]) => productId);
  const selectedProductId = topProductIds[0] ?? "";
  const testSeriesProductIds = topProductIds.slice(0, 2);
  const selectedProductTrend = buildProductTrendSeries(result, selectedProductId, "gmv");
  const testSeriesTrend = buildSeriesTrendSeries(result, testSeriesProductIds, "gmv");
  const afterSalesApplyTrend = buildAfterSalesTrendSeries(result, "refundApplyCount", "applyDate");
  const afterPayload = JSON.stringify(result);
  const expectedSeriesGmv = result.productDailyFacts
    .filter((fact) => testSeriesProductIds.includes(String(fact.productId)))
    .reduce((total, fact) => total + fact.gmv, 0);
  const planAdSpendTotal = result.adPlanDailyFacts.reduce((total, fact) => total + fact.adSpend, 0);
  const planAdTrendDoesNotUseTotalAsSingleDay = planAdSpendTrend.points.every(
    (point) => point.value !== planAdSpendTotal,
  );
  const planAdRoiUsesDailyRatio = planAdRoiTrend.points.every((point) => {
    if (point.denominator === null || point.denominator === 0) return point.value === null;
    return closeTo(point.value, point.numerator === null ? 0 : point.numerator / point.denominator);
  });
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const trendPayload = {
    storeGmvTrend,
    storeGsvTrend,
    storeVisitorsTrend,
    storeConversionRateTrend,
    planAdSpendTrend,
    planAdRoiTrend,
    selectedProductTrend,
    testSeriesTrend,
    afterSalesApplyTrend,
  };
  const safeLeafValues = collectLeafValues(trendPayload);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(trendPayload).includes(fieldName),
  );

  const summary = {
    businessDatePointCount: coverage.businessProduct.dateCount,
    storeGmvTrendValue: storeGmvTrend.points[0]?.value ?? null,
    storeGsvTrendValue: storeGsvTrend.points[0]?.value ?? null,
    storeVisitorsTrendValue: storeVisitorsTrend.points[0]?.value ?? null,
    storeConversionRateTrendValue: storeConversionRateTrend.points[0]?.value ?? null,
    planAdTrendPointCount: planAdSpendTrend.pointCount,
    selectedProductTrendPointCount: selectedProductTrend.pointCount,
    testSeriesTrendPointCount: testSeriesTrend.pointCount,
    afterSalesApplyTrendPointCount: afterSalesApplyTrend.pointCount,
    storeBusinessTrendInsufficient: storeGmvTrend.insufficientDataForTrend,
    planAdTrendInsufficient: planAdSpendTrend.insufficientDataForTrend,
    hasInvalidNumber: hasInvalidNumber(trendPayload),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.businessDatePointCount === 1 &&
    closeTo(summary.storeGmvTrendValue, 73908.11) &&
    closeTo(summary.storeGsvTrendValue, 21287.79) &&
    summary.storeVisitorsTrendValue === 18466 &&
    closeTo(summary.storeConversionRateTrendValue, 78 / 18466) &&
    summary.planAdTrendPointCount === 7 &&
    planAdTrendDoesNotUseTotalAsSingleDay &&
    planAdRoiUsesDailyRatio &&
    summary.selectedProductTrendPointCount === 1 &&
    summary.testSeriesTrendPointCount === 1 &&
    closeTo(testSeriesTrend.points[0]?.value ?? null, expectedSeriesGmv) &&
    summary.afterSalesApplyTrendPointCount === 1 &&
    summary.storeBusinessTrendInsufficient &&
    !summary.planAdTrendInsufficient &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "trend_validation_failed");
  process.exitCode = 1;
});
