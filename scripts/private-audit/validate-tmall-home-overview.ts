import fs from "node:fs";
import path from "node:path";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import {
  buildTmallHomeOverview,
  getTmallBusinessDates,
} from "../../lib/tmall/view-models/home-overview";

const ROOT = process.cwd();

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

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
  const availableDates = getTmallBusinessDates(result);
  const selectedDate = availableDates[0] ?? null;
  const overview = buildTmallHomeOverview(result, selectedDate);
  const afterPayload = JSON.stringify(result);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const overviewLeafValues = collectLeafValues(overview);
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => overviewLeafValues.has(value));
  const selectedDatePlanSpend = result.adPlanDailyFacts
    .filter((fact) => fact.date === overview.selectedDate)
    .reduce((total, fact) => total + fact.adSpend, 0);
  const allPlanSpend = result.adPlanDailyFacts.reduce((total, fact) => total + fact.adSpend, 0);

  const summary = {
    availableDates: overview.availableDates,
    selectedDate: overview.selectedDate,
    GMV: overview.metrics.gmv,
    GSV: overview.metrics.gsv,
    refundAmount: overview.metrics.refundSuccessAmount,
    visitors: overview.metrics.visitors,
    paidBuyers: overview.metrics.paidBuyers,
    conversionRate: overview.metrics.conversionRate,
    adSpend: overview.metrics.adSpend,
    adTransactionAmount: overview.metrics.adTransactionAmount,
    ROI: overview.metrics.adRoi,
    rankingCount: overview.productRanking.length,
    riskCounts: {
      noPaymentProducts: overview.risks.noPaymentProducts.length,
      adSpendNoTransactionProducts: overview.risks.adSpendNoTransactionProducts.length,
      refundProducts: overview.risks.refundProducts.length,
      dataQualityWarnings: overview.risks.dataQualityWarningCount,
    },
    hasInvalidNumber: hasInvalidNumber(overview),
    containsSensitiveValue,
    selectedDatePlanSpend,
    allPlanSpend,
    usedSingleDayPlanSpend: overview.metrics.adSpend === selectedDatePlanSpend && overview.metrics.adSpend !== allPlanSpend,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const checksPassed =
    summary.selectedDate === "2026-06-18" &&
    summary.usedSingleDayPlanSpend &&
    summary.rankingCount <= 5 &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "home_overview_validation_failed");
  process.exitCode = 1;
});
