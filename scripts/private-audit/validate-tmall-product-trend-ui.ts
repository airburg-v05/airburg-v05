import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { buildTmallProductBoardOverview } from "../../lib/tmall/view-models/product-board";
import { buildTmallProductTrendSection } from "../../lib/tmall/view-models/product-trend-section";
import type { TmallProductTrendCardViewModel } from "../../lib/tmall/view-models/product-trend-section";
import type { TmallTrendMetricKey } from "../../lib/tmall/view-models/trends";

const ROOT = process.cwd();
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

const findCard = (
  cards: TmallProductTrendCardViewModel[],
  metricKey: TmallTrendMetricKey,
): TmallProductTrendCardViewModel | null =>
  cards.find((card) => card.metricKey === metricKey) ?? null;

const latestValuesAreSafe = (cards: TmallProductTrendCardViewModel[]): boolean =>
  cards.every((card) => card.latestValue === null || Number.isFinite(card.latestValue));

const changeRatesAreSafe = (cards: TmallProductTrendCardViewModel[]): boolean =>
  cards.every((card) => card.changeRate === null || Number.isFinite(card.changeRate));

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
  const overview = buildTmallProductBoardOverview(result, null, null);
  const selectedProductId = overview.selectedProductId ?? "";
  const section = buildTmallProductTrendSection(result, selectedProductId);
  const noAdSection = buildTmallProductTrendSection(result, NO_AD_PRODUCT_ID);
  const afterPayload = JSON.stringify(result);
  const gmvCard = findCard(section.cards, "gmv");
  const adSpendCard = findCard(section.cards, "adSpend");
  const adRoiCard = findCard(section.cards, "adRoi");
  const noAdSpendCard = findCard(noAdSection.cards, "adSpend");
  const noAdRoiCard = findCard(noAdSection.cards, "adRoi");
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const safeLeafValues = collectLeafValues({ section, noAdSection });
  const containsSensitiveValue = [...sensitiveSourceValues].some((value) => safeLeafValues.has(value));
  const containsSensitiveFieldName = SENSITIVE_FIELD_NAMES.some((fieldName) =>
    JSON.stringify({ section, noAdSection }).includes(fieldName),
  );

  const summary = {
    cardCount: section.cards.length,
    selectedProductId,
    productGmvPointCount: gmvCard?.pointCount ?? 0,
    productGmvInsufficient: gmvCard?.series.insufficientDataForTrend ?? false,
    productAdSpendPointCount: adSpendCard?.pointCount ?? 0,
    productAdSpendInsufficient: adSpendCard?.series.insufficientDataForTrend ?? false,
    productAdRoiPointCount: adRoiCard?.pointCount ?? 0,
    productAdRoiInsufficient: adRoiCard?.series.insufficientDataForTrend ?? false,
    noAdProductAdSpendPointCount: noAdSpendCard?.pointCount ?? 0,
    noAdProductAdRoiPointCount: noAdRoiCard?.pointCount ?? 0,
    hasInvalidNumber:
      hasInvalidNumber({ section, noAdSection }) ||
      !latestValuesAreSafe(section.cards) ||
      !latestValuesAreSafe(noAdSection.cards) ||
      !changeRatesAreSafe(section.cards) ||
      !changeRatesAreSafe(noAdSection.cards),
    containsSensitiveValue: containsSensitiveValue || containsSensitiveFieldName,
    sourceObjectMutated: beforePayload !== afterPayload,
  };

  const noAdSpendMissing =
    noAdSpendCard?.pointCount === 0 || noAdSpendCard?.series.missingDataSource === true;
  const noAdRoiMissing =
    noAdRoiCard?.pointCount === 0 || noAdRoiCard?.series.missingDataSource === true;
  const checksPassed =
    summary.cardCount === 6 &&
    summary.selectedProductId.length > 0 &&
    summary.productGmvPointCount === 1 &&
    summary.productGmvInsufficient &&
    summary.productAdSpendPointCount === 1 &&
    summary.productAdSpendInsufficient &&
    summary.productAdRoiPointCount === 1 &&
    summary.productAdRoiInsufficient &&
    noAdSpendMissing &&
    noAdRoiMissing &&
    !summary.hasInvalidNumber &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated;

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "product_trend_ui_validation_failed");
  process.exitCode = 1;
});
