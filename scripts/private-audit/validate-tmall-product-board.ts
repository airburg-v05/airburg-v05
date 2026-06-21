import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallProductBoardOverview,
  getTmallProductBoardDates,
} from "../../lib/tmall/view-models/product-board";

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

const metricValueValid = (value: number | null): boolean => value === null || Number.isFinite(value);

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
  const selectedDate = getTmallProductBoardDates(result)[0] ?? null;
  const overview = buildTmallProductBoardOverview(result, selectedDate, null);
  const afterPayload = JSON.stringify(result);
  const selectedProductId = overview.selectedProductId;
  const metricCount = overview.businessMetrics.length + overview.adMetrics.length;
  const allMetrics = [...overview.businessMetrics, ...overview.adMetrics];
  const nullMetricCount = allMetrics.filter((metric) => metric.value === null).length;
  const selectedProduct = overview.productTableRows.find((row) => row.productId === selectedProductId);
  const adSpendRate = overview.adMetrics.find((metric) => metric.key === "adSpendRate")?.value ?? null;
  const adSpendRateAfterRefund = overview.adMetrics.find((metric) => metric.key === "adSpendRateAfterRefund")?.value ?? null;
  const defaultAdSpend = overview.adMetrics.find((metric) => metric.key === "adSpend")?.value ?? null;
  const noAdProduct = overview.products.find((product) => !product.hasAdData);
  const noAdOverview = noAdProduct
    ? buildTmallProductBoardOverview(result, selectedDate, noAdProduct.productId)
    : null;
  const noAdMetricsAreNull = noAdOverview
    ? noAdOverview.adMetrics.every((metric) => metric.value === null)
    : true;
  const audienceProspectRate = overview.audienceSummary?.prospectRate ?? null;
  const expectedProspectRate = overview.audienceSummary
    ? overview.audienceSummary.guidedVisitors === 0
      ? null
      : overview.audienceSummary.guidedProspects / overview.audienceSummary.guidedVisitors
    : null;
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const overviewLeafValues = collectLeafValues(overview.afterSalesSummary);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => overviewLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify(overview.afterSalesSummary ?? {}).includes(fieldName),
  );
  const hasInvalidMetric = allMetrics.some((metric) => !metricValueValid(metric.value));
  const formulaChecksPass =
    !!selectedProduct &&
    adSpendRate === (defaultAdSpend === null ? null : defaultAdSpend / selectedProduct.gmv) &&
    adSpendRateAfterRefund === (defaultAdSpend === null ? null : defaultAdSpend / selectedProduct.gsv) &&
    audienceProspectRate === expectedProspectRate;

  const summary = {
    selectedDate: overview.selectedDate,
    selectedProductId,
    productCount: overview.products.length,
    metricCount,
    nullMetricCount,
    hasAdData: overview.selectedProduct?.hasAdData ?? false,
    hasAfterSalesData: overview.selectedProduct?.hasAfterSalesData ?? false,
    hasInvalidNumber: hasInvalidNumber(overview) || hasInvalidMetric,
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.selectedDate === "2026-06-18" &&
    summary.selectedProductId === "937706023658" &&
    summary.productCount === 19 &&
    summary.metricCount === 18 &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated &&
    formulaChecksPass &&
    noAdMetricsAreNull;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "product_board_validation_failed");
  process.exitCode = 1;
});
