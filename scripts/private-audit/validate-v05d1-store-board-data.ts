import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  buildLegacyStoreBoardViewModel,
  buildV2StoreBoardViewModel,
} from "../../lib/v05/store-board";
import {
  buildHomeCommandCenterViewModel,
  type HomeCommandCenterViewModel,
} from "../../lib/v05/home-command-center";
import { buildV05TmallImportCandidate, sha256File, type V05FileFingerprint } from "../../lib/v05/import";
import {
  DEFAULT_TMAIL_OWNER,
  type V2Dataset,
} from "../../lib/v05";
import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../types/tmall";

const ROOT = process.cwd();
const CAPTURED_AT = "2026-06-22T12:00:00+08:00";
const C31_COMPLETION = "docs/project/task-completions/V0.5C_3_1_STAGE_SCOPED_FREEZE_GATE_AND_POST_REGISTRATION_CLOSURE.json";

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

const containsSensitiveFieldName = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return SENSITIVE_FIELD_NAMES.some((fieldName) => serialized.includes(fieldName));
};

const containsSensitiveSourceValue = (value: unknown, sensitiveValues: Set<string>): boolean => {
  const leaves = collectLeaves(value);
  return [...sensitiveValues].some((sensitiveValue) => leaves.has(sensitiveValue));
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

const combineDatasets = (first: V2Dataset, second: V2Dataset): V2Dataset => ({
  ...first,
  datasetId: "v05d1-audit-combined-dataset",
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

const metricByKey = (
  viewModel: ReturnType<typeof buildV2StoreBoardViewModel> | ReturnType<typeof buildLegacyStoreBoardViewModel>,
  key: string,
): number | null =>
  viewModel.metrics.find((metric) => metric.key === key)?.value ?? null;

const homeStore = (viewModel: HomeCommandCenterViewModel, storeId: string) =>
  viewModel.storePerformance.find((store) => store.storeId === storeId) ?? null;

const closeEnough = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.000001);
};

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
  const combined = combineDatasets(first.dataset, second.dataset);
  const businessDate = storedAnalysis.productDailyFacts[0]?.date ?? "2026-06-18";
  const defaultStore = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: DEFAULT_TMAIL_OWNER.storeId,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const secondStore = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: "tmall-second-store",
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const legacyStore = buildLegacyStoreBoardViewModel({
    analysis: storedAnalysis,
    targets: [],
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const week = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: DEFAULT_TMAIL_OWNER.storeId,
    selectedPeriod: "week",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const month = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: DEFAULT_TMAIL_OWNER.storeId,
    selectedPeriod: "month",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const custom = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: DEFAULT_TMAIL_OWNER.storeId,
    selectedPeriod: "custom",
    selectedDate: businessDate,
    customDateRange: { start: businessDate, end: businessDate },
  });
  const invalidStore = buildV2StoreBoardViewModel({
    dataset: combined,
    platformCode: "tmall",
    storeId: "missing-store",
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
  });
  const home = buildHomeCommandCenterViewModel({
    dataset: combined,
    selectedPeriod: "day",
    selectedDate: businessDate,
    customDateRange: { start: null, end: null },
    platformFilter: "all",
    storeFilter: "all",
  });
  const sensitiveValues = await collectSensitiveSourceValues(files.after_sales);
  const storePageSource = read("app/(workspace)/store-board/page.tsx");
  const homeStoreRankingSource = read("lib/v05/home-command-center/store-ranking.ts");
  const changedPackageFiles = git(["diff", "--name-only", "HEAD", "--", "package.json", "package-lock.json"]);
  const c31Completion = exists(C31_COMPLETION)
    ? JSON.parse(read(C31_COMPLETION)) as { taskId?: string; status?: string; completionCommit?: string }
    : null;
  const lock = JSON.parse(read("docs/project/v0.5-lock.json")) as {
    stageStatuses?: Record<string, string>;
    executionSequence?: Array<{ id: string; status: string }>;
  };

  const checks: Check[] = [
    {
      name: "c31_completion_record_valid",
      pass:
        c31Completion?.taskId === "V0.5C_3_1_STAGE_SCOPED_FREEZE_GATE_AND_POST_REGISTRATION_CLOSURE" &&
        c31Completion.status === "complete" &&
        typeof c31Completion.completionCommit === "string",
    },
    { name: "stage_a_complete", pass: lock.stageStatuses?.["V0.5A"] === "complete" },
    { name: "stage_b_complete", pass: lock.stageStatuses?.["V0.5B"] === "complete" },
    { name: "stage_c_complete", pass: lock.stageStatuses?.["V0.5C"] === "complete" },
    { name: "stage_d_pending", pass: lock.stageStatuses?.["V0.5D"] === "pending" },
    { name: "store_page_does_not_directly_open_indexeddb", pass: !storePageSource.includes("indexedDB.open") },
    { name: "store_page_uses_store_board_runtime", pass: storePageSource.includes("loadStoreBoardContext") },
    { name: "default_store_gmv_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "gmv"), metricByKey(legacyStore, "gmv")) },
    { name: "default_store_gsv_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "gsv"), metricByKey(legacyStore, "gsv")) },
    { name: "default_store_visitors_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "visitors"), metricByKey(legacyStore, "visitors")) },
    { name: "default_store_buyers_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "paidBuyers"), metricByKey(legacyStore, "paidBuyers")) },
    { name: "default_store_conversion_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "conversionRate"), metricByKey(legacyStore, "conversionRate")) },
    { name: "default_store_ad_spend_matches_legacy", pass: closeEnough(metricByKey(defaultStore, "ad"), metricByKey(legacyStore, "ad")) },
    { name: "second_store_scoped_metrics_match_fixture", pass: closeEnough(metricByKey(secondStore, "gmv"), metricByKey(defaultStore, "gmv")) },
    { name: "second_store_context_is_distinct", pass: secondStore.storeContext?.storeId === "tmall-second-store" },
    { name: "same_product_id_cross_store_isolated", pass: new Set(combined.businessProductFacts.map((fact) => fact.storeId)).size === 2 },
    { name: "week_range_monday_to_sunday", pass: week.dateRange.start === "2026-06-15" && week.dateRange.end === "2026-06-21" },
    { name: "month_range_valid", pass: month.dateRange.start === "2026-06-01" && month.dateRange.end === "2026-06-30" },
    { name: "custom_range_valid", pass: custom.dateRange.valid && custom.dateRange.dataDayCount === 1 },
    { name: "main_trend_has_single_point_for_sample", pass: defaultStore.trendPoints.length === 1 },
    { name: "target_progress_store_scope_only", pass: defaultStore.targetProgress.every((target) => target.label.includes("店铺目标")) },
    { name: "series_uses_user_defined_series_only", pass: defaultStore.seriesProgress.length <= combined.series.length },
    { name: "product_top_limited", pass: defaultStore.productTop.length <= 5 },
    { name: "ad_summary_uses_plan_data", pass: defaultStore.adSummary.hasAdData && defaultStore.adSummary.planCount > 0 },
    { name: "after_sales_safe_aggregate_exists", pass: defaultStore.afterSalesSummary.hasAfterSalesData },
    { name: "invalid_store_safe", pass: invalidStore.mode === "invalid_store" },
    { name: "home_default_store_drilldown_enabled", pass: homeStore(home, DEFAULT_TMAIL_OWNER.storeId)?.canOpenStoreBoard === true },
    { name: "home_second_store_drilldown_enabled", pass: homeStore(home, "tmall-second-store")?.storeBoardHref?.includes("storeId=tmall-second-store") === true },
    { name: "home_store_ranking_no_default_only_gate", pass: !homeStoreRankingSource.includes("storeId === DEFAULT_TMAIL_STORE_ID") },
    { name: "no_undefined", pass: !containsUndefined({ defaultStore, secondStore, legacyStore, invalidStore }) },
    { name: "no_invalid_number", pass: !containsInvalidNumber({ defaultStore, secondStore, legacyStore, invalidStore }) },
    { name: "no_sensitive_field_name", pass: !containsSensitiveFieldName({ defaultStore, secondStore, legacyStore, invalidStore }) },
    { name: "no_sensitive_source_value", pass: !containsSensitiveSourceValue({ defaultStore, secondStore, legacyStore, invalidStore }, sensitiveValues) },
    { name: "analysis_input_not_mutated", pass: stableStringify(analysis) === analysisBefore },
    { name: "no_dependency_change", pass: changedPackageFiles.trim() === "" },
  ];

  const failed = checks.filter((check) => !check.pass);
  const output = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05d1-store-board-data",
    checkCount: checks.length,
    failedChecks: failed.map((check) => check.name),
    defaultStoreDate: defaultStore.dateRange.selectedDate,
    defaultStoreTrendPointCount: defaultStore.trendPoints.length,
    defaultStoreProductTopCount: defaultStore.productTop.length,
    secondStoreId: secondStore.storeContext?.storeId ?? null,
    homeSecondStoreCanOpen: homeStore(home, "tmall-second-store")?.canOpenStoreBoard ?? false,
    privacyPass: !containsSensitiveFieldName({ defaultStore, secondStore, legacyStore, invalidStore }) &&
      !containsSensitiveSourceValue({ defaultStore, secondStore, legacyStore, invalidStore }, sensitiveValues),
    numberSafetyPass: !containsInvalidNumber({ defaultStore, secondStore, legacyStore, invalidStore }) &&
      !containsUndefined({ defaultStore, secondStore, legacyStore, invalidStore }),
  };

  console.log(JSON.stringify(output, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05d1-store-board-data",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
