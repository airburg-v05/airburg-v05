import fs from "node:fs";
import path from "node:path";
import type { TmallSeriesGroup } from "../../lib/storage/tmall-series-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallSeriesBoardOverview,
  getTmallSeriesBoardDates,
} from "../../lib/tmall/view-models/series-board";

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

const metricValue = (metrics: Array<{ key: string; value: number | null }>, key: string): number | null =>
  metrics.find((metric) => metric.key === key)?.value ?? null;

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
  const selectedDate = getTmallSeriesBoardDates(result)[0] ?? null;
  const productPool = buildTmallSeriesBoardOverview(result, selectedDate, [], null);
  const firstTwoProducts = productPool.products.slice(0, 2);
  const adProductIds = new Set(
    result.adProductDailyFacts
      .filter((fact) => fact.date === selectedDate)
      .map((fact) => String(fact.productId)),
  );
  const noAdProduct = productPool.products.find((product) => !adProductIds.has(product.productId));
  const testGroups: TmallSeriesGroup[] = [
    {
      id: "series_metrics_test",
      name: "测试系列指标",
      productIds: firstTwoProducts.map((product) => product.productId),
      createdAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
    },
  ];
  const overview = buildTmallSeriesBoardOverview(result, selectedDate, testGroups, "series_metrics_test");
  const unmatchedOverview = buildTmallSeriesBoardOverview(
    result,
    selectedDate,
    [
      {
        id: "series_unmatched_test",
        name: "测试未匹配系列",
        productIds: [firstTwoProducts[0]?.productId, "unmatched_product_id_for_validation"].filter(Boolean),
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
      },
    ],
    "series_unmatched_test",
  );
  const noAdOverview = noAdProduct
    ? buildTmallSeriesBoardOverview(
        result,
        selectedDate,
        [
          {
            id: "series_no_ad_test",
            name: "测试无推广系列",
            productIds: [noAdProduct.productId],
            createdAt: "2026-06-19T00:00:00.000Z",
            updatedAt: "2026-06-19T00:00:00.000Z",
          },
        ],
        "series_no_ad_test",
      )
    : null;
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues(overview.seriesAfterSalesSummary);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(overview.seriesAfterSalesSummary).includes(fieldName),
  );
  const expectedGmv = firstTwoProducts.reduce((total, product) => total + product.gmv, 0);
  const expectedGsv = firstTwoProducts.reduce((total, product) => total + product.gsv, 0);
  const expectedVisitors = firstTwoProducts.reduce((total, product) => total + product.visitors, 0);
  const expectedPaidBuyers = firstTwoProducts.reduce((total, product) => total + product.paidBuyers, 0);
  const expectedAdSpend = result.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate && firstTwoProducts.some((product) => product.productId === String(fact.productId)))
    .reduce((total, fact) => total + fact.adSpend, 0);
  const expectedAdTransactionAmount = result.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate && firstTwoProducts.some((product) => product.productId === String(fact.productId)))
    .reduce((total, fact) => total + fact.adTransactionAmount, 0);
  const expectedGuidedVisitors = result.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate && firstTwoProducts.some((product) => product.productId === String(fact.productId)))
    .reduce((total, fact) => total + fact.guidedVisitors, 0);
  const expectedGuidedProspects = result.adProductDailyFacts
    .filter((fact) => fact.date === selectedDate && firstTwoProducts.some((product) => product.productId === String(fact.productId)))
    .reduce((total, fact) => total + fact.guidedProspects, 0);

  const summary = {
    selectedDate: overview.selectedDate,
    groupProductCount: overview.selectedSeries?.productCount ?? 0,
    matchedProductCount: overview.selectedSeries?.matchedProductCount ?? 0,
    unmatchedProductCount: overview.selectedSeries?.unmatchedProductCount ?? 0,
    seriesGmv: metricValue(overview.seriesBusinessMetrics, "gmv"),
    seriesGsv: metricValue(overview.seriesBusinessMetrics, "gsv"),
    seriesVisitors: metricValue(overview.seriesBusinessMetrics, "visitors"),
    seriesPaidBuyers: metricValue(overview.seriesBusinessMetrics, "paidBuyers"),
    seriesConversionRate: metricValue(overview.seriesBusinessMetrics, "conversionRate"),
    seriesAdSpend: metricValue(overview.seriesAdMetrics, "adSpend"),
    seriesAdRoi: metricValue(overview.seriesAdMetrics, "roi"),
    hasInvalidNumber: hasInvalidNumber(overview),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const noAdMetricsAreNull = noAdOverview
    ? noAdOverview.seriesAdMetrics.every((metric) => metric.value === null) &&
      !noAdOverview.hasSelectedSeriesAdData
    : true;
  const checksPassed =
    summary.selectedDate === "2026-06-18" &&
    summary.groupProductCount === 2 &&
    summary.matchedProductCount === 2 &&
    summary.unmatchedProductCount === 0 &&
    closeTo(summary.seriesGmv, expectedGmv) &&
    closeTo(summary.seriesGsv, expectedGsv) &&
    summary.seriesVisitors === expectedVisitors &&
    summary.seriesPaidBuyers === expectedPaidBuyers &&
    closeTo(summary.seriesConversionRate, expectedPaidBuyers / expectedVisitors) &&
    closeTo(metricValue(overview.seriesAdMetrics, "adSpendRate"), expectedAdSpend / expectedGmv) &&
    closeTo(metricValue(overview.seriesAdMetrics, "adSpendRateAfterRefund"), expectedAdSpend / expectedGsv) &&
    closeTo(overview.seriesAudienceSummary?.prospectRate ?? null, expectedGuidedProspects / expectedGuidedVisitors) &&
    closeTo(summary.seriesAdSpend, expectedAdSpend) &&
    closeTo(summary.seriesAdRoi, expectedAdTransactionAmount / expectedAdSpend) &&
    unmatchedOverview.unmatchedProductIds.length === 1 &&
    unmatchedOverview.seriesProductRows.some((row) => row.matchStatus === "unmatched") &&
    noAdMetricsAreNull &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "series_board_metrics_validation_failed");
  process.exitCode = 1;
});
