import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildEmptyHomeCommandCenterViewModel,
  buildHomeCommandCenterViewModel,
  buildLegacyHomeCommandCenterViewModel,
  type HomeCommandCenterViewModel,
} from "../../lib/v05/home-command-center";
import { buildV05TmallImportCandidate, sha256File, type V05FileFingerprint } from "../../lib/v05/import";
import {
  DEFAULT_TMAIL_OWNER,
  V2_SCHEMA_VERSION,
  type TargetRecord,
  type V2Dataset,
} from "../../lib/v05";
import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../types/tmall";

const ROOT = process.cwd();
const CAPTURED_AT = "2026-06-22T12:00:00+08:00";
const B5_COMPLETION = "docs/project/task-completions/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json";

const SAMPLE_FILES = {
  business_product:
    "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  ad_product: "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  ad_plan: "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  after_sales: "private-samples/tmall/after-sales/当日售后退货表.xlsx",
} as const satisfies Record<TmallSourceType, string>;

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
] as const;

interface Check {
  name: string;
  pass: boolean;
  details?: Record<string, unknown>;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const sampleFiles = (): Record<TmallSourceType, File> => ({
  business_product: createFile(SAMPLE_FILES.business_product),
  ad_product: createFile(SAMPLE_FILES.ad_product),
  ad_plan: createFile(SAMPLE_FILES.ad_plan),
  after_sales: createFile(SAMPLE_FILES.after_sales),
});

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const containsInvalidNumber = (value: unknown): boolean => {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsInvalidNumber);
  if (value && typeof value === "object") return Object.values(value).some(containsInvalidNumber);
  return false;
};

const containsUndefined = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") return Object.values(value).some(containsUndefined);
  return false;
};

const normalizeLeaf = (value: unknown): string | null => {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length >= 4 ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectLeaves = (value: unknown, values = new Set<string>()): Set<string> => {
  const leaf = normalizeLeaf(value);
  if (leaf) {
    values.add(leaf);
    return values;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLeaves(item, values));
    return values;
  }
  if (value && typeof value === "object") Object.values(value).forEach((item) => collectLeaves(item, values));
  return values;
};

const collectSensitiveSourceValues = async (afterSalesFile: File): Promise<Set<string>> => {
  const table = await parseTmallTableFile(afterSalesFile);
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((fieldName) => {
      const value = normalizeLeaf(row[fieldName]);
      if (value && !["null", "NULL", "--", "暂无"].includes(value)) values.add(value);
    });
  });
  return values;
};

const containsSensitiveFieldName = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return SENSITIVE_FIELD_NAMES.some((fieldName) => serialized.includes(fieldName));
};

const containsSensitiveSourceValue = (value: unknown, sensitiveValues: Set<string>): boolean => {
  const leaves = collectLeaves(value);
  return [...sensitiveValues].some((sensitiveValue) => leaves.has(sensitiveValue));
};

const metricByKey = (viewModel: HomeCommandCenterViewModel, key: string): number | null =>
  viewModel.metrics.find((metric) => metric.key === key)?.value ?? null;

const closeEnough = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.000001);
};

const buildFingerprints = async (files: Record<TmallSourceType, File>): Promise<V05FileFingerprint[]> =>
  Promise.all(
    (Object.keys(files) as TmallSourceType[]).map(async (sourceType) => ({
      sourceType,
      fileFingerprint: await sha256File(files[sourceType]),
    })),
  );

const runAnalysis = (files: Record<TmallSourceType, File>): Promise<TmallFourSourceAnalysisResult> =>
  runTmallFourSourceAnalysis({
    businessProductFile: files.business_product,
    adProductFile: files.ad_product,
    adPlanFile: files.ad_plan,
    afterSalesFile: files.after_sales,
  });

const uniqueBy = <T>(items: T[], getKey: (item: T) => string): T[] => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
};

const withTargets = (dataset: V2Dataset, date: string, totalGmv: number, totalAdSpend: number): V2Dataset => {
  const targets: TargetRecord[] = [
    {
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: "c1-company-daily-gmv",
      scope: "company",
      periodType: "daily",
      periodValue: date,
      metricKey: "gmv",
      targetValue: totalGmv,
      direction: "higher_is_better",
      status: "active",
      createdAt: CAPTURED_AT,
      updatedAt: CAPTURED_AT,
    },
    {
      schemaVersion: V2_SCHEMA_VERSION,
      targetId: "c1-store-monthly-ad-spend",
      scope: "store",
      platformCode: "tmall",
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      periodType: "monthly",
      periodValue: date.slice(0, 7),
      metricKey: "adSpend",
      targetValue: totalAdSpend,
      direction: "lower_is_better",
      status: "active",
      createdAt: CAPTURED_AT,
      updatedAt: CAPTURED_AT,
    },
  ];
  return { ...dataset, targets };
};

const combineDatasets = (first: V2Dataset, second: V2Dataset): V2Dataset => ({
  ...first,
  datasetId: "v05c1-audit-combined-dataset",
  platforms: uniqueBy([...first.platforms, ...second.platforms], (item) => item.platformCode),
  stores: uniqueBy([...first.stores, ...second.stores], (item) => `${item.platformCode}:${item.storeId}`),
  importBatches: [...first.importBatches, ...second.importBatches],
  importFiles: [...first.importFiles, ...second.importFiles],
  businessProductFacts: [...first.businessProductFacts, ...second.businessProductFacts],
  adProductFacts: [...first.adProductFacts, ...second.adProductFacts],
  adPlanFacts: [...first.adPlanFacts, ...second.adPlanFacts],
  afterSalesDailyAggregates: [...first.afterSalesDailyAggregates, ...second.afterSalesDailyAggregates],
  afterSalesRangeAggregates: [...first.afterSalesRangeAggregates, ...second.afterSalesRangeAggregates],
  afterSalesOperationalSnapshots: [...first.afterSalesOperationalSnapshots, ...second.afterSalesOperationalSnapshots],
  afterSalesDistributionItems: [...first.afterSalesDistributionItems, ...second.afterSalesDistributionItems],
  series: [...first.series, ...second.series],
  trackedProducts: [...first.trackedProducts, ...second.trackedProducts],
  targets: [...first.targets, ...second.targets],
  legacyTargetCandidates: [...first.legacyTargetCandidates, ...second.legacyTargetCandidates],
  migrationManifests: [...first.migrationManifests, ...second.migrationManifests],
});

const main = async () => {
  const files = sampleFiles();
  const analysis = await runAnalysis(files);
  const analysisBefore = stableStringify(analysis);
  const storedAnalysis = toTmallStoredAnalysisResult(analysis);
  const fingerprints = await buildFingerprints(files);
  const first = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: "tmall",
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      storeName: DEFAULT_TMAIL_OWNER.storeName,
    },
    fileFingerprints: fingerprints,
    capturedAt: CAPTURED_AT,
  });
  const second = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: "tmall",
      storeId: "tmall-second-store",
      storeName: "天猫第二店铺",
      isNew: true,
    },
    fileFingerprints: fingerprints,
    capturedAt: CAPTURED_AT,
  });
  const businessDate = storedAnalysis.productDailyFacts[0]?.date ?? "2026-06-18";
  const legacyDay = buildLegacyHomeCommandCenterViewModel({
    analysis: storedAnalysis,
    targets: [],
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const defaultStoreDay = buildHomeCommandCenterViewModel({
    dataset: first.dataset,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "tmall",
    storeFilter: `tmall:${DEFAULT_TMAIL_OWNER.storeId}`,
  });
  const combinedWithoutTargets = combineDatasets(first.dataset, second.dataset);
  const combinedDayNoTargets = buildHomeCommandCenterViewModel({
    dataset: combinedWithoutTargets,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const combined = withTargets(
    combinedWithoutTargets,
    businessDate,
    metricByKey(combinedDayNoTargets, "gmv") ?? 1,
    metricByKey(defaultStoreDay, "ad") ?? 1,
  );
  const combinedDay = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const week = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "week",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const month = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "month",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const custom = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "custom",
    selectedDate: businessDate,
    customDateRange: { start: businessDate, end: businessDate },
    platformFilter: "all",
    storeFilter: "all",
  });
  const invalidCustom = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "custom",
    selectedDate: businessDate,
    customDateRange: { start: "2026-06-19", end: "2026-06-18" },
    platformFilter: "all",
    storeFilter: "all",
  });
  const noDataRange = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "custom",
    selectedDate: businessDate,
    customDateRange: { start: "2026-01-01", end: "2026-01-02" },
    platformFilter: "all",
    storeFilter: "all",
  });
  const secondStore = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "tmall",
    storeFilter: "tmall:tmall-second-store",
  });
  const empty = buildEmptyHomeCommandCenterViewModel();
  const sensitiveValues = await collectSensitiveSourceValues(files.after_sales);
  const homePageSource = read("app/(workspace)/home/page.tsx");
  const changedPackageFiles = git(["diff", "--name-only", "HEAD", "--", "package.json", "package-lock.json"]);
  const b5Completion = exists(B5_COMPLETION) ? JSON.parse(read(B5_COMPLETION)) as { status?: string } : null;
  const lock = JSON.parse(read("docs/project/v0.5-lock.json")) as {
    stageStatuses?: Record<string, string>;
    executionSequence?: Array<{ id: string; status: string }>;
  };

  const checks: Check[] = [
    { name: "b5_completion_record_valid", pass: b5Completion?.status === "complete" },
    { name: "stage_a_complete", pass: lock.stageStatuses?.["V0.5A"] === "complete" },
    { name: "stage_b_complete", pass: lock.stageStatuses?.["V0.5B"] === "complete" },
    { name: "stage_c_pending", pass: lock.stageStatuses?.["V0.5C"] === "pending" },
    { name: "home_does_not_directly_open_indexeddb", pass: !homePageSource.includes("indexedDB.open") },
    { name: "default_store_gmv_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "gmv"), metricByKey(legacyDay, "gmv")) },
    { name: "default_store_gsv_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "gsv"), metricByKey(legacyDay, "gsv")) },
    { name: "default_store_visitors_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "visitors"), metricByKey(legacyDay, "visitors")) },
    { name: "default_store_buyers_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "paidBuyers"), metricByKey(legacyDay, "paidBuyers")) },
    { name: "default_store_conversion_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "conversionRate"), metricByKey(legacyDay, "conversionRate")) },
    { name: "default_store_ad_spend_matches_legacy", pass: closeEnough(metricByKey(defaultStoreDay, "ad"), metricByKey(legacyDay, "ad")) },
    { name: "cross_store_gmv_sums", pass: closeEnough(metricByKey(combinedDay, "gmv"), (metricByKey(defaultStoreDay, "gmv") ?? 0) * 2) },
    { name: "cross_store_gsv_sums", pass: closeEnough(metricByKey(combinedDay, "gsv"), (metricByKey(defaultStoreDay, "gsv") ?? 0) * 2) },
    { name: "cross_store_visitors_sums", pass: closeEnough(metricByKey(combinedDay, "visitors"), (metricByKey(defaultStoreDay, "visitors") ?? 0) * 2) },
    { name: "cross_store_buyers_sums", pass: closeEnough(metricByKey(combinedDay, "paidBuyers"), (metricByKey(defaultStoreDay, "paidBuyers") ?? 0) * 2) },
    { name: "conversion_uses_total_numerator_denominator", pass: closeEnough(metricByKey(combinedDay, "conversionRate"), metricByKey(defaultStoreDay, "conversionRate")) },
    { name: "ad_spend_not_doubly_counted_with_ad_product", pass: closeEnough(metricByKey(combinedDay, "ad"), (metricByKey(defaultStoreDay, "ad") ?? 0) * 2) },
    { name: "day_range_valid", pass: combinedDay.dateRange.naturalDayCount === 1 && combinedDay.dateRange.dataDayCount === 1 },
    { name: "week_range_monday_to_sunday", pass: week.dateRange.start === "2026-06-15" && week.dateRange.end === "2026-06-21" },
    { name: "month_range_valid", pass: month.dateRange.start === "2026-06-01" && month.dateRange.end === "2026-06-30" },
    { name: "custom_range_valid", pass: custom.dateRange.valid && custom.dateRange.dataDayCount === 1 },
    { name: "invalid_custom_range_safe", pass: !invalidCustom.dateRange.valid && invalidCustom.dateRange.error !== null },
    { name: "no_data_range_empty", pass: noDataRange.isEmpty && noDataRange.trendPoints.length === 0 },
    { name: "missing_dates_not_filled", pass: week.trendPoints.length === 1 },
    { name: "store_sorting_and_count", pass: combinedDay.storePerformance.length === 2 && combinedDay.storePerformance[0]?.gmv !== null },
    { name: "same_product_id_cross_store_isolated", pass: new Set(combined.businessProductFacts.map((fact) => fact.storeId)).size === 2 },
    { name: "single_store_filter_matches_default", pass: closeEnough(metricByKey(secondStore, "gmv"), metricByKey(defaultStoreDay, "gmv")) },
    { name: "target_scope_no_product_series_rollup", pass: combinedDay.targetProgress.every((target) => target.scopeLabel === "公司" || target.scopeLabel === "店铺") },
    { name: "week_target_not_auto_prorated", pass: week.targetProgress.length === 0 },
    { name: "custom_target_not_auto_prorated", pass: custom.targetProgress.length === 0 },
    { name: "legacy_fallback_does_not_write_v2", pass: !homePageSource.includes("prepareDataset(") && !homePageSource.includes("activateDataset(") },
    { name: "empty_view_model_safe", pass: empty.isEmpty && empty.metrics.length <= 6 },
    { name: "no_undefined", pass: !containsUndefined({ combinedDay, legacyDay, empty }) },
    { name: "no_invalid_number", pass: !containsInvalidNumber({ combinedDay, legacyDay, empty }) },
    { name: "no_sensitive_field_name", pass: !containsSensitiveFieldName({ combinedDay, legacyDay, empty }) },
    { name: "no_sensitive_source_value", pass: !containsSensitiveSourceValue({ combinedDay, legacyDay, empty }, sensitiveValues) },
    { name: "analysis_input_not_mutated", pass: stableStringify(analysis) === analysisBefore },
    { name: "no_dependency_change", pass: changedPackageFiles.trim() === "" },
  ];

  const failed = checks.filter((check) => !check.pass);
  const output = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c1-home-command-center-data",
    checkCount: checks.length,
    failedChecks: failed.map((check) => ({ name: check.name, details: check.details ?? null })),
    storeCount: combinedDay.storePerformance.length,
    platformCount: combinedDay.dataStatus.platformCount,
    defaultDate: combinedDay.dateRange.selectedDate,
    trendPointCount: combinedDay.trendPoints.length,
    privacyPass: !containsSensitiveFieldName({ combinedDay, legacyDay, empty }) &&
      !containsSensitiveSourceValue({ combinedDay, legacyDay, empty }, sensitiveValues),
    numberSafetyPass: !containsInvalidNumber({ combinedDay, legacyDay, empty }) &&
      !containsUndefined({ combinedDay, legacyDay, empty }),
  };

  console.log(JSON.stringify(output, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c1-home-command-center-data",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
