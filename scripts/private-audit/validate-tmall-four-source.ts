import fs from "node:fs";
import path from "node:path";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";

const ROOT = process.cwd();

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const hasDuplicateKey = <TItem>(items: TItem[], getKey: (item: TItem) => string): boolean => {
  const keys = new Set<string>();
  for (const item of items) {
    const key = getKey(item);
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
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

  const afterSalesPayload = JSON.stringify(result.afterSalesAggregates);
  const storedResult = toTmallStoredAnalysisResult(result);
  const storedPayload = JSON.stringify(storedResult);
  const sensitiveSourceValues = await collectSensitiveSourceValues(afterSalesFile);
  const outputLeafValues = collectLeafValues({
    result,
    storedResult,
  });
  const leakedSensitiveValueCount = [...sensitiveSourceValues].filter((value) =>
    outputLeafValues.has(value),
  ).length;
  const sensitiveTokens = [
    "订单编号",
    "退款编号",
    "支付宝交易号",
    "电话",
    "手机",
    "地址",
    "物流单号",
    "物流信息",
    "买家退款说明",
    "商家备注",
    "操作人",
    "子账号",
  ];

  const summary = {
    version: result.version,
    sourceTypes: Object.fromEntries(
      Object.entries(result.sourceHealth).map(([sourceType, health]) => [
        sourceType,
        {
          status: health.status,
          detectedSourceType: health.sourceType,
          encoding: health.encoding,
          headerRowNumber: health.headerRowNumber,
          rowCount: health.rowCount,
          missingRequiredFieldCount: health.missingRequiredFields.length,
          warningTypes: health.warningTypes,
        },
      ]),
    ),
    dateRanges: result.dateRanges,
    factCounts: {
      productDailyFacts: result.productDailyFacts.length,
      adProductDailyFacts: result.adProductDailyFacts.length,
      adPlanDailyFacts: result.adPlanDailyFacts.length,
      afterSalesApplyDateGroups: result.afterSalesAggregates.byApplyDate.length,
      afterSalesSuccessDateGroups: result.afterSalesAggregates.bySuccessDate.length,
      afterSalesProductSummary: result.afterSalesAggregates.productSummary.length,
    },
    joinQuality: result.joinQuality,
    reconciliation: result.reconciliation,
    uniqueness: {
      adProductDateProductUnique: !hasDuplicateKey(
        result.adProductDailyFacts,
        (item) => `${item.date}::${item.productId}`,
      ),
      adPlanDatePlanUnique: !hasDuplicateKey(result.adPlanDailyFacts, (item) => `${item.date}::${item.planId}`),
    },
    privacy: {
      afterSalesPayloadContainsSensitiveToken: sensitiveTokens.some((token) => afterSalesPayload.includes(token)),
      storageTopLevelKeys: Object.keys(storedResult),
      storageContainsDisallowedTopLevelKey: Object.keys(storedResult).some(
        (key) =>
          ![
            "version",
            "analysisTimestamp",
            "sourceHealth",
            "dateRanges",
            "productDailyFacts",
            "adProductDailyFacts",
            "adPlanDailyFacts",
            "afterSalesAggregates",
            "joinQuality",
            "reconciliation",
            "dataQualityWarnings",
          ].includes(key),
      ),
      hasRawRowsKey: storedPayload.includes('"rows"') || storedPayload.includes('"previewRows"'),
      sensitiveSourceValueCount: sensitiveSourceValues.size,
      leakedSensitiveValueCount,
      hasSensitiveValueLeak: leakedSensitiveValueCount > 0,
    },
    warningTypes: result.dataQualityWarnings,
  };

  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "validation_failed");
  process.exitCode = 1;
});
