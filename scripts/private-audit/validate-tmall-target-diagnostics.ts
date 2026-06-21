import fs from "node:fs";
import path from "node:path";
import type { TmallSeriesGroup } from "../../lib/storage/tmall-series-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildTmallProductTargetDiagnostics,
  buildTmallSeriesTargetDiagnostics,
  buildTmallStoreTargetDiagnostics,
  buildTmallTargetDiagnostics,
} from "../../lib/tmall/view-models/target-diagnostics";
import type { TmallTargetDiagnosticSummary } from "../../lib/tmall/view-models/target-diagnostics";
import type { TmallTargetDefinition } from "../../types/tmall-targets";

const ROOT = process.cwd();
const TEST_DATE = "2026-06-18";
const CREATED_AT = "2026-06-20T00:00:00.000Z";
const PRODUCT_ID = "937706023658";
const NO_AD_PRODUCT_ID = "946187487172";
const SERIES_ID = "target_diagnostic_series";
const NO_AD_SERIES_ID = "target_diagnostic_no_ad_series";

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

const target = (
  values: Omit<TmallTargetDefinition, "periodType" | "periodValue" | "createdAt" | "updatedAt">,
): TmallTargetDefinition => ({
  periodType: "daily",
  periodValue: TEST_DATE,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...values,
});

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

const buildTargets = (): TmallTargetDefinition[] => [
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
    id: "invalid_target",
    name: "非法目标验证",
    scope: "store",
    metricKey: "gmv",
    targetValue: 0,
    direction: "higher_is_better",
    status: "active",
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
  target({
    id: "achieved_target",
    name: "达成目标验证",
    scope: "store",
    metricKey: "visitors",
    targetValue: 1,
    direction: "higher_is_better",
    status: "active",
  }),
];

const findItem = (
  summary: TmallTargetDiagnosticSummary,
  targetId: string,
) => summary.items.find((item) => item.targetId === targetId) ?? null;

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
      name: "目标诊断系列",
      productIds: selectedSeriesProductIds,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: NO_AD_SERIES_ID,
      name: "无推广诊断系列",
      productIds: [NO_AD_PRODUCT_ID],
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ];
  const targets = buildTargets();
  const beforeTargetsPayload = JSON.stringify(targets);
  const beforeSeriesPayload = JSON.stringify(seriesGroups);

  const globalDiagnostics = buildTmallTargetDiagnostics({
    targets,
    analysis: result,
    seriesGroups,
    scope: "home",
  });
  const storeDiagnostics = buildTmallStoreTargetDiagnostics({ targets, analysis: result });
  const productDiagnostics = buildTmallProductTargetDiagnostics({
    targets,
    analysis: result,
    productId: PRODUCT_ID,
  });
  const noAdProductDiagnostics = buildTmallProductTargetDiagnostics({
    targets,
    analysis: result,
    productId: NO_AD_PRODUCT_ID,
  });
  const seriesDiagnostics = buildTmallSeriesTargetDiagnostics({
    targets,
    analysis: result,
    seriesGroups,
    seriesId: SERIES_ID,
  });
  const noAdSeriesDiagnostics = buildTmallSeriesTargetDiagnostics({
    targets,
    analysis: result,
    seriesGroups,
    seriesId: NO_AD_SERIES_ID,
  });
  const diagnosticsWithPaused = buildTmallTargetDiagnostics({
    targets,
    analysis: result,
    seriesGroups,
    scope: "home",
    options: { includePaused: true, maxItems: 12 },
  });

  const invalidDiagnostic = findItem(globalDiagnostics, "invalid_target");
  const atRiskDiagnostic = globalDiagnostics.items.find((item) => item.status === "at_risk") ?? null;
  const missingActualDiagnostic =
    findItem(noAdProductDiagnostics, "no_ad_product_spend_target") ??
    findItem(noAdSeriesDiagnostics, "no_ad_series_spend_target");
  const achievedDiagnostic = findItem(globalDiagnostics, "achieved_target");
  const pausedDiagnostic = findItem(globalDiagnostics, "paused_target");
  const pausedIncludedDiagnostic = findItem(diagnosticsWithPaused, "paused_target");
  const noAdProductDiagnostic = findItem(noAdProductDiagnostics, "no_ad_product_spend_target");
  const noAdSeriesDiagnostic = findItem(noAdSeriesDiagnostics, "no_ad_series_spend_target");

  const safePayload = {
    globalDiagnostics,
    storeDiagnostics,
    productDiagnostics,
    noAdProductDiagnostics,
    seriesDiagnostics,
    noAdSeriesDiagnostics,
    diagnosticsWithPaused,
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

  const noAdMessages = [
    noAdProductDiagnostic?.message ?? "",
    noAdProductDiagnostic?.suggestion ?? "",
    noAdSeriesDiagnostic?.message ?? "",
    noAdSeriesDiagnostic?.suggestion ?? "",
  ];
  const noAdMessageMentionsZero = noAdMessages.some((message) =>
    /(^|[^A-Za-z])0([^A-Za-z]|$)/.test(message),
  );
  const suggestsPlanAdBackfill = noAdMessages.some(
    (message) => message.includes("计划推广") && message.includes("补齐"),
  );

  const summary = {
    globalDiagnosticCount: globalDiagnostics.totalDiagnosticCount,
    storeDiagnosticCount: storeDiagnostics.totalDiagnosticCount,
    productDiagnosticCount: productDiagnostics.totalDiagnosticCount,
    seriesDiagnosticCount: seriesDiagnostics.totalDiagnosticCount,
    criticalCount: globalDiagnostics.criticalCount,
    warningCount: globalDiagnostics.warningCount,
    infoCount: globalDiagnostics.infoCount,
    successCount: globalDiagnostics.successCount,
    invalidDiagnosticFound:
      invalidDiagnostic?.severity === "critical" &&
      invalidDiagnostic.category === "invalid_target",
    atRiskDiagnosticFound:
      atRiskDiagnostic?.severity === "warning" &&
      atRiskDiagnostic.status === "at_risk",
    missingActualDiagnosticFound:
      missingActualDiagnostic?.severity === "info" &&
      missingActualDiagnostic.status === "missing_actual",
    achievedDiagnosticFound:
      achievedDiagnostic?.severity === "success" &&
      achievedDiagnostic.status === "achieved",
    pausedExcluded: pausedDiagnostic === null && pausedIncludedDiagnostic?.status === "paused",
    noAdProductActualIsNull: noAdProductDiagnostic?.actualValue === null,
    noAdSeriesActualIsNull: noAdSeriesDiagnostic?.actualValue === null,
    noAdMessageMentionsZero,
    suggestsPlanAdBackfill,
    hasInvalidNumber: hasInvalidNumber(safePayload),
    hasUndefined: hasUndefined(safePayload),
    containsSensitiveFieldName,
    containsSensitiveValue,
    sourceObjectMutated: beforeResultPayload !== JSON.stringify(result),
    targetObjectMutated: beforeTargetsPayload !== JSON.stringify(targets),
    seriesObjectMutated: beforeSeriesPayload !== JSON.stringify(seriesGroups),
  };

  const checksPassed =
    summary.globalDiagnosticCount > 0 &&
    summary.storeDiagnosticCount > 0 &&
    summary.productDiagnosticCount === 1 &&
    summary.seriesDiagnosticCount === 1 &&
    summary.criticalCount > 0 &&
    summary.warningCount > 0 &&
    summary.infoCount > 0 &&
    summary.successCount > 0 &&
    summary.invalidDiagnosticFound &&
    summary.atRiskDiagnosticFound &&
    summary.missingActualDiagnosticFound &&
    summary.achievedDiagnosticFound &&
    summary.pausedExcluded &&
    summary.noAdProductActualIsNull &&
    summary.noAdSeriesActualIsNull &&
    !summary.noAdMessageMentionsZero &&
    !summary.suggestsPlanAdBackfill &&
    !summary.hasInvalidNumber &&
    !summary.hasUndefined &&
    !summary.containsSensitiveFieldName &&
    !summary.containsSensitiveValue &&
    !summary.sourceObjectMutated &&
    !summary.targetObjectMutated &&
    !summary.seriesObjectMutated &&
    globalDiagnostics.items.length <= 8 &&
    storeDiagnostics.items.every((item) => item.scope === "store") &&
    productDiagnostics.items.every((item) => item.scope === "product") &&
    seriesDiagnostics.items.every((item) => item.scope === "series");

  console.log(JSON.stringify(summary, null, 2));

  if (!checksPassed) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "tmall_target_diagnostics_validation_failed");
  process.exitCode = 1;
});
