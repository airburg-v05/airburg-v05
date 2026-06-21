import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_STORAGE_KEYS,
  LEGACY_TARGETS_KEY,
  V2_MIGRATION_VERSION,
  runLegacyStorageV2DryRunMigration,
  type LegacyMigrationDryRunResult,
  type LegacyStorageSnapshot,
} from "../../lib/v05";

const ROOT = process.cwd();
const CAPTURED_AT = "2026-06-21T19:30:00+08:00";
const BUSINESS_DATE = "2026-06-18";
const LEGACY_TASK_ID = "V0.5A_3_LEGACY_SNAPSHOT_AND_DRY_RUN_MIGRATION";
const CLOSURE_TASK_ID = "V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE";
const SAFE_AGGREGATE_TASK_ID = "V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS";
const BASELINE_COMMIT = "224fae67bb68226d8163ede8ce2b54c8f066e191";
const CLOSURE_BASELINE_COMMIT = "af3211efaf82d8d4bb4ff9ae0fce736d169c00c2";
const SAFE_AGGREGATE_BASELINE_COMMIT = "c6c73c3ec62398113ec9574fa5e0dff811c42dba";

const MIGRATION_FILES = [
  "lib/v05/migration/contracts.ts",
  "lib/v05/migration/hash.ts",
  "lib/v05/migration/legacy-snapshot.ts",
  "lib/v05/migration/analysis-mapper.ts",
  "lib/v05/migration/series-mapper.ts",
  "lib/v05/migration/target-mapper.ts",
  "lib/v05/migration/after-sales-mapper.ts",
  "lib/v05/migration/dry-run.ts",
  "lib/v05/migration/index.ts",
] as const;

const FORBIDDEN_MIGRATION_TOKENS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "IDBDatabase",
  "window",
  "document",
  "fetch",
  "axios",
  "node:fs",
  "setItem",
  "removeItem",
  "clear()",
  "active pointer save",
  "legacy key save",
  "storage event",
] as const;

const FORBIDDEN_NON_DETERMINISTIC_TOKENS = [
  "Date.now",
  "new Date",
  "Math.random",
  "randomUUID",
] as const;

const SENSITIVE_FIELD_NAMES = [
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
  "手机号",
  "电话",
  "地址",
  "收件人",
] as const;

const SENSITIVE_SOURCE_VALUES = [
  "ORDER-SECRET-001",
  "REFUND-SECRET-001",
  "ALIPAY-SECRET-001",
  "13800000000",
  "上海市敏感地址1号",
  "TRACK-SECRET-001",
  "请不要公开这条退款说明",
  "内部客服备注",
] as const;

interface Check {
  name: string;
  pass: boolean;
  details?: string;
}

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: string): void => {
  checks.push({ name, pass, ...(details ? { details } : {}) });
};

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPathPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  if (pattern.startsWith("**/")) return file === pattern.slice(3) || file.endsWith(`/${pattern.slice(3)}`);
  return false;
};

const pathMatchesAny = (file: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesPathPattern(file, pattern));

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const containsSensitiveText = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return [...SENSITIVE_FIELD_NAMES, ...SENSITIVE_SOURCE_VALUES].some((needle) =>
    serialized.includes(needle),
  );
};

const containsUnsafeRawShape = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return [
    "rawRows",
    "previewRows",
    "fileName",
    "headers",
    "rawContent",
    "fileContent",
    "ORDER-SECRET-001",
    "0.00 倍",
    "用计划推广补齐",
    "使用计划推广补齐",
  ].some((needle) => serialized.includes(needle));
};

const sourceHealth = (sourceType: string, status = "parsed", rowCount = 2) => ({
  sourceType,
  expectedSourceType: sourceType,
  status,
  fileName: `真实客户-${sourceType}-ORDER-SECRET-001.xlsx`,
  encoding: "GB18030",
  sheetNames: ["Sheet1"],
  headerRowNumber: 2,
  headers: ["订单编号", "商品ID", "支付金额"],
  rowCount,
  missingRequiredFields: status === "missing" ? ["商品ID"] : [],
  invalidDateCount: 0,
  invalidIdCount: 0,
  summaryRowCount: 0,
  unknownStatuses: [],
  warningTypes: ["safe_warning_type"],
});

const validAnalysis = (overrides: Record<string, unknown> = {}) => ({
  version: "tmall_four_source_v1",
  analysisTimestamp: "2026-06-18T12:00:00+08:00",
  sourceHealth: {
    business_product: sourceHealth("business_product", "parsed", 2),
    ad_product: sourceHealth("ad_product", "parsed", 1),
    ad_plan: sourceHealth("ad_plan", "parsed", 1),
    after_sales: sourceHealth("after_sales", "parsed", 3),
  },
  dateRanges: {
    business_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
    ad_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
    ad_plan: { start: "2026-06-12", end: BUSINESS_DATE },
    after_sales: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  },
  productDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      productId: "p-1001",
      productName: "Safe Product 1001",
      visitors: 100,
      pageViews: 200,
      paidBuyers: 10,
      gmv: 1000,
      refundSuccessAmount: 100,
      gsv: 900,
      refundRate: 0.1,
      conversionRate: 0.1,
      avgOrderValue: 100,
      favorites: 4,
      cartAdditions: 8,
      orderBuyers: 10,
      orderAmount: 1000,
      searchVisitors: 20,
      searchPaidBuyers: 2,
      hasAdData: true,
    },
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      productId: "p-1002",
      productName: "Safe Product 1002",
      visitors: 50,
      pageViews: 100,
      paidBuyers: 2,
      gmv: 200,
      refundSuccessAmount: 0,
      gsv: 200,
      refundRate: null,
      conversionRate: 0.04,
      avgOrderValue: 100,
      favorites: 1,
      cartAdditions: 2,
      orderBuyers: 2,
      orderAmount: 200,
      searchVisitors: 5,
      searchPaidBuyers: 1,
      hasAdData: false,
    },
  ],
  adProductDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      productId: "p-1001",
      adSpend: 50,
      impressions: 1000,
      clicks: 40,
      adTransactionAmount: 300,
      directTransactionAmount: 200,
      indirectTransactionAmount: 100,
      favoriteCartCount: 5,
      guidedVisitors: 30,
      guidedProspects: 6,
      newBuyers: 3,
      memberJoinCount: 1,
      clickRate: 0.04,
      avgClickCost: 1.25,
      cpm: 50,
      roi: 6,
      directTransactionShare: 0.67,
      indirectTransactionShare: 0.33,
      favoriteCartCost: 10,
      hasAdData: true,
    },
  ],
  adPlanDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      planId: "plan-2001",
      planName: "Safe Plan",
      sceneId: "scene-1",
      sceneName: "Safe Scene",
      adSpend: 70,
      impressions: 2000,
      clicks: 80,
      transactionAmount: 400,
      directTransactionAmount: 250,
      indirectTransactionAmount: 150,
      guidedVisitors: 50,
      guidedProspects: 8,
      newBuyers: 4,
      memberJoinCount: 2,
      memberFirstBuyers: 1,
      clickRate: 0.04,
      avgClickCost: 0.875,
      roi: 5.71,
      guidedProspectRate: 0.1,
      newBuyerRate: 0.05,
      memberJoinRate: 0.025,
    },
  ],
  afterSalesAggregates: {
    byApplyDate: [
      {
        date: BUSINESS_DATE,
        refundApplyCount: 2,
        refundApplyAmount: 120,
        refundOnlyCount: 1,
        returnRefundCount: 1,
        fullRefundCount: 1,
        partialRefundCount: 1,
      },
    ],
    bySuccessDate: [
      {
        date: BUSINESS_DATE,
        refundSuccessCount: 1,
        refundSuccessTotalAmount: 100,
        refundToBuyerAmount: 100,
        refundToPlatformAmount: 0,
      },
    ],
    byPaymentDate: [
      {
        date: BUSINESS_DATE,
        refundAttributionCount: 1,
        refundAttributionAmount: 100,
      },
    ],
    reasonDistribution: [],
    statusDistribution: [],
    productSummary: [],
    unknownStatus: [],
  },
  joinQuality: {
    advertisedProductJoinRate: 1,
    advertisedProductJoinedCount: 1,
    advertisedProductCount: 1,
    storePromotionCoverage: 0.5,
    promotedProductCount: 1,
    storeProductCount: 2,
    planJoinRate: 1,
    joinedPlanCount: 1,
    adProductPlanCount: 1,
    afterSalesProductJoinRate: null,
    joinedAfterSalesProductCount: 0,
    afterSalesProductCount: 0,
  },
  dataQualityWarnings: ["订单编号字段已在安全聚合中忽略"],
  ...overrides,
});

const validSeriesRaw = JSON.stringify({
  version: "tmall_series_groups_v1",
  groups: [
    {
      id: "series-1",
      name: "Safe Series",
      description: "description is ignored by V2 series records",
      productIds: ["p-1001", "p-1002", "p-1001"],
      createdAt: "2026-06-18T00:00:00+08:00",
      updatedAt: "2026-06-18T00:00:00+08:00",
    },
  ],
});

const validTargetsRaw = JSON.stringify({
  version: "tmall_targets_v1",
  targets: [
    {
      id: "target-store-gmv",
      name: "Store GMV",
      scope: "store",
      periodType: "daily",
      periodValue: BUSINESS_DATE,
      metricKey: "gmv",
      targetValue: 1000,
      direction: "higher_is_better",
      status: "active",
      createdAt: "2026-06-18T00:00:00+08:00",
      updatedAt: "2026-06-18T00:00:00+08:00",
    },
    {
      id: "target-product-gmv",
      name: "Product GMV",
      scope: "product",
      productId: "p-1001",
      periodType: "monthly",
      periodValue: "2026-06",
      metricKey: "gmv",
      targetValue: 30000,
      direction: "higher_is_better",
      status: "paused",
      createdAt: "2026-06-18T00:00:00+08:00",
      updatedAt: "2026-06-18T00:00:00+08:00",
    },
    {
      id: "target-series-gmv",
      name: "Series GMV",
      scope: "series",
      seriesId: "series-1",
      periodType: "daily",
      periodValue: BUSINESS_DATE,
      metricKey: "gmv",
      targetValue: 500,
      direction: "higher_is_better",
      status: "active",
      createdAt: "2026-06-18T00:00:00+08:00",
      updatedAt: "2026-06-18T00:00:00+08:00",
    },
  ],
});

const snapshot = (options: {
  analysis?: unknown;
  analysisRaw?: string | null;
  seriesRaw?: string | null;
  targetsRaw?: string | null;
  lastAnalysisRaw?: string | null;
  demoRaw?: string | null;
} = {}): LegacyStorageSnapshot => ({
  capturedAt: CAPTURED_AT,
  values: {
    [LEGACY_ANALYSIS_KEY]:
      options.analysisRaw === undefined
        ? JSON.stringify(options.analysis ?? validAnalysis())
        : options.analysisRaw,
    [LEGACY_SERIES_KEY]: options.seriesRaw === undefined ? validSeriesRaw : options.seriesRaw,
    [LEGACY_TARGETS_KEY]: options.targetsRaw === undefined ? validTargetsRaw : options.targetsRaw,
    [LEGACY_LAST_ANALYSIS_KEY]: options.lastAnalysisRaw === undefined
      ? JSON.stringify({
        "订单编号": "ORDER-SECRET-001",
        previewRows: [{ "手机号": "13800000000" }],
        fileName: "客户原始明细.xlsx",
      })
      : options.lastAnalysisRaw,
    [LEGACY_DEMO_SESSION_KEY]: options.demoRaw === undefined
      ? JSON.stringify({
        "退款编号": "REFUND-SECRET-001",
        "支付宝交易号": "ALIPAY-SECRET-001",
        "卖家退货地址": "上海市敏感地址1号",
        "物流单号": "TRACK-SECRET-001",
        "买家退款说明": "请不要公开这条退款说明",
        "商家备注": "内部客服备注",
      })
      : options.demoRaw,
  },
});

const run = async (input: LegacyStorageSnapshot): Promise<LegacyMigrationDryRunResult> =>
  runLegacyStorageV2DryRunMigration({ snapshot: input });

const hasIssue = (result: LegacyMigrationDryRunResult, code: string): boolean =>
  result.issues.some((issue) => issue.code === code);

const main = async (): Promise<void> => {
  MIGRATION_FILES.forEach((file) => addCheck(`${file} exists`, exists(file)));

  const migrationSource = MIGRATION_FILES.map((file) => readFile(file)).join("\n");
  FORBIDDEN_MIGRATION_TOKENS.forEach((token) => {
    addCheck(`migration source excludes ${token}`, !migrationSource.includes(token));
  });
  FORBIDDEN_NON_DETERMINISTIC_TOKENS.forEach((token) => {
    addCheck(`migration source excludes ${token}`, !migrationSource.includes(token));
  });

  const currentTask = JSON.parse(readFile("docs/project/current-task.json")) as {
    taskId: string;
    allowedModifyPaths: string[];
    authorizationFile?: string;
    baselineCommit: string;
    status: string;
  };
  const isLegacyTask = currentTask.taskId === LEGACY_TASK_ID;
  const isClosureTask = currentTask.taskId === CLOSURE_TASK_ID;
  const isSafeAggregateTask = currentTask.taskId === SAFE_AGGREGATE_TASK_ID;
  const activeBaselineCommit = isSafeAggregateTask
    ? SAFE_AGGREGATE_BASELINE_COMMIT
    : isClosureTask
      ? CLOSURE_BASELINE_COMMIT
      : BASELINE_COMMIT;

  addCheck("current task id is compatible with V0.5A-3 dry-run validation", isLegacyTask || isClosureTask || isSafeAggregateTask);
  addCheck("current task status is controlled", ["in_progress", "complete"].includes(currentTask.status));
  addCheck("current task baseline is expected for active task", currentTask.baselineCommit === activeBaselineCommit);
  addCheck(
    "authorization file exists",
    currentTask.authorizationFile ? exists(currentTask.authorizationFile) : false,
  );
  addCheck(
    "changed-path envelope is declared by current task",
    currentTask.allowedModifyPaths.length > 0,
  );

  const changedFiles = changedFilesSince(activeBaselineCommit);
  addCheck(
    "changed files stay inside authorization",
    changedFiles.every((file) => pathMatchesAny(file, currentTask.allowedModifyPaths)),
    changedFiles.join(","),
  );
  addCheck("package manifest unchanged", !changedFiles.includes("package.json"));
  addCheck("lock file unchanged", !changedFiles.some((file) => file.endsWith("package-lock.json") || file.endsWith("pnpm-lock.yaml") || file.endsWith("yarn.lock")));
  addCheck("business pages unchanged", !changedFiles.some((file) => file.startsWith("app/") || file.startsWith("components/")));
  addCheck("legacy storage modules unchanged", !changedFiles.some((file) => file.startsWith("lib/storage/")));
  addCheck("tmall analysis modules unchanged", !changedFiles.some((file) => file.startsWith("lib/tmall/")));
  addCheck("domain contracts unchanged unless A-3.2 authorized", isSafeAggregateTask || !changedFiles.some((file) => file.startsWith("lib/v05/domain/")));
  addCheck("repository contracts unchanged unless A-3.2 authorized", isSafeAggregateTask || !changedFiles.some((file) => file.startsWith("lib/v05/repositories/")));
  addCheck("validation contracts unchanged unless A-3.2 authorized", isSafeAggregateTask || !changedFiles.some((file) => file.startsWith("lib/v05/validation/")));
  addCheck("types unchanged", !changedFiles.some((file) => file.startsWith("types/")));

  const baseSnapshot = snapshot();
  const beforeSnapshot = stableStringify(baseSnapshot);
  const cleanResult = await run(baseSnapshot);
  const repeatResult = await run(clone(baseSnapshot));

  addCheck("snapshot contains all five legacy keys", LEGACY_STORAGE_KEYS.every((key) => key in baseSnapshot.values));
  addCheck("snapshot uses string or null values", Object.values(baseSnapshot.values).every((value) => value === null || typeof value === "string"));
  addCheck("dry run does not mutate snapshot", stableStringify(baseSnapshot) === beforeSnapshot);
  addCheck("clean dry-run status ready", cleanResult.status === "ready");
  addCheck("clean dry-run future activation eligible", cleanResult.futureActivationEligible === true);
  addCheck("migration version is V2 migration version", cleanResult.migrationVersion === V2_MIGRATION_VERSION);
  addCheck("default owner is Tmall default store", cleanResult.defaultOwner.storeId === "tmall-default-store" && cleanResult.defaultOwner.platformCode === "tmall");
  addCheck("staging dataset exists for ready result", cleanResult.stagingDataset !== null);
  addCheck("proposed active dataset pointer remains null", cleanResult.proposedActiveDatasetPointer === null);
  addCheck("staging active dataset pointer remains null", cleanResult.stagingDataset?.activeDatasetPointer === null);
  addCheck("manifest candidate exists", cleanResult.manifestCandidate !== null);
  addCheck("manifest candidate status ready", cleanResult.manifestCandidate?.status === "dry_run_ready");
  addCheck("manifest candidate is future eligible", cleanResult.manifestCandidate?.futureActivationEligible === true);
  addCheck("legacy key summary covers five keys", cleanResult.legacyKeySummary.length === 5);
  addCheck("legacy key hashes are stable", cleanResult.legacyKeySummary.filter((item) => item.present).every((item) => /^[a-f0-9]{64}$/.test(item.valueHash ?? "")));
  addCheck("dry-run output deterministic", stableStringify(cleanResult) === stableStringify(repeatResult));
  addCheck("no invalid number in ready result", !containsInvalidNumber(cleanResult));
  addCheck("no undefined in ready result", !containsUndefined(cleanResult));
  addCheck("ready result excludes sensitive names and values", !containsSensitiveText(cleanResult));
  addCheck("ready result excludes raw shapes", !containsUnsafeRawShape(cleanResult));
  addCheck("source summary includes four sources", cleanResult.sourceSummary.length === 4);
  addCheck("record counts match staging arrays", cleanResult.recordCounts.importFiles === cleanResult.stagingDataset?.importFiles.length);
  addCheck("one import batch generated", cleanResult.recordCounts.importBatches === 1);
  addCheck("four import files generated", cleanResult.recordCounts.importFiles === 4);
  addCheck("business facts mapped", cleanResult.recordCounts.businessProductFacts === 2);
  addCheck("ad product facts mapped", cleanResult.recordCounts.adProductFacts === 1);
  addCheck("ad plan facts mapped separately", cleanResult.recordCounts.adPlanFacts === 1);
  addCheck("plan fact does not enter product ad facts", cleanResult.stagingDataset?.adProductFacts.every((fact) => !("planId" in fact)) === true);
  addCheck("business date mapping uses businessDate", cleanResult.stagingDataset?.businessProductFacts.every((fact) => fact.businessDate === BUSINESS_DATE) === true);
  addCheck("all migrated facts own platform and store", cleanResult.stagingDataset?.businessProductFacts.every((fact) => fact.platformCode === "tmall" && fact.storeId === "tmall-default-store") === true);
  addCheck("after-sales daily basis separated", ["apply_date", "success_date", "payment_date"].every((basis) => cleanResult.stagingDataset?.afterSalesDailyAggregates.some((item) => item.dateBasis === basis)));
  addCheck("after-sales range basis separated", ["apply_date", "success_date", "payment_date"].every((basis) => cleanResult.stagingDataset?.afterSalesRangeAggregates.some((item) => item.dateBasis === basis)));
  addCheck("series migrated and product ids de-duplicated", cleanResult.stagingDataset?.series[0]?.productIds.length === 2);
  addCheck("targets migrated by supported period", cleanResult.recordCounts.targets === 3);
  addCheck("no tracked products auto-created", cleanResult.recordCounts.trackedProducts === 0);
  addCheck("ignored deprecated preview key recorded", cleanResult.ignoredLegacyKeys.some((item) => item.key === LEGACY_LAST_ANALYSIS_KEY && item.reason === "ignored_deprecated_preview"));
  addCheck("ignored demo session key recorded", cleanResult.ignoredLegacyKeys.some((item) => item.key === LEGACY_DEMO_SESSION_KEY && item.reason === "ignored_non_business_session"));
  addCheck("ready result has no rejected records", cleanResult.rejectedRecords.length === 0);
  addCheck("import file safe warning codes avoid raw text", cleanResult.stagingDataset?.importFiles.every((file) => file.safeWarningCodes.every((code) => !SENSITIVE_FIELD_NAMES.some((name) => code.includes(name)))) === true);
  addCheck("import file fingerprint avoids file names", cleanResult.stagingDataset?.importFiles.every((file) => !file.fileFingerprint.includes("客户")) === true);

  const emptyResult = await run(snapshot({ analysisRaw: null, seriesRaw: null, targetsRaw: null }));
  addCheck("empty snapshot returns empty", emptyResult.status === "empty");
  addCheck("empty result has no staging dataset", emptyResult.stagingDataset === null);

  const corruptedAnalysisResult = await run(snapshot({ analysisRaw: "{bad-json" }));
  addCheck("corrupted analysis returns migration_failed", corruptedAnalysisResult.status === "migration_failed");
  addCheck("corrupted analysis has no staging dataset", corruptedAnalysisResult.stagingDataset === null);
  addCheck("corrupted analysis issue recorded", hasIssue(corruptedAnalysisResult, "legacy_parse_failed"));

  const noHashResult = await runLegacyStorageV2DryRunMigration({
    snapshot: baseSnapshot,
    hasher: { hash: async () => { throw new Error("unavailable"); } },
  });
  addCheck("hash provider failure returns migration_failed", noHashResult.status === "migration_failed");
  addCheck("hash provider issue recorded", hasIssue(noHashResult, "hash_provider_unavailable"));

  const partialAnalysis = validAnalysis({
    sourceHealth: {
      business_product: sourceHealth("business_product", "parsed", 2),
      ad_product: sourceHealth("ad_product", "parsed", 1),
      ad_plan: sourceHealth("ad_plan", "missing", 0),
      after_sales: sourceHealth("after_sales", "parsed", 3),
    },
    adPlanDailyFacts: [],
  });
  const partialResult = await run(snapshot({ analysis: partialAnalysis }));
  addCheck("partial sources return ready_partial", partialResult.status === "ready_partial");
  addCheck("partial sources are not future eligible", partialResult.futureActivationEligible === false);

  const safeAfterSalesSummaryAnalysis = validAnalysis({
    afterSalesAggregates: {
      ...(validAnalysis().afterSalesAggregates as Record<string, unknown>),
      productSummary: [
        {
          productId: "p-1001",
          refundApplyCount: 1,
          refundSuccessCount: 1,
          refundApplyAmount: 10,
          refundSuccessTotalAmount: 10,
          pendingCount: 0,
          overduePendingCount: 0,
          customerServiceInterventionCount: 0,
          avgAfterSalesDurationHours: null,
          topReasons: [{ label: "safe reason", count: 1 }],
        },
      ],
      statusDistribution: [{ label: "safe status", count: 1 }],
    },
  });
  const safeAfterSalesSummaryResult = await run(snapshot({ analysis: safeAfterSalesSummaryAnalysis }));
  addCheck("safe after-sales summary no longer blocks activation", safeAfterSalesSummaryResult.status === "ready");
  addCheck("safe after-sales summary future activation true", safeAfterSalesSummaryResult.futureActivationEligible === true);
  addCheck("safe after-sales summary maps operational snapshots", (safeAfterSalesSummaryResult.recordCounts.afterSalesOperationalSnapshots ?? 0) > 0);
  addCheck("safe after-sales summary maps distributions", (safeAfterSalesSummaryResult.recordCounts.afterSalesDistributionItems ?? 0) > 0);
  addCheck("ambiguous issue removed for mapped safe summary", !hasIssue(safeAfterSalesSummaryResult, "ambiguous_after_sales_range_basis"));

  const unsupportedTargetRaw = JSON.stringify({
    version: "tmall_targets_v1",
    targets: [
      {
        id: "target-weekly",
        name: "Weekly target",
        scope: "store",
        periodType: "weekly",
        periodValue: "2026-W25",
        metricKey: "gmv",
        targetValue: 1000,
        direction: "higher_is_better",
        status: "active",
        createdAt: "2026-06-18T00:00:00+08:00",
        updatedAt: "2026-06-18T00:00:00+08:00",
      },
    ],
  });
  const unsupportedTargetResult = await run(snapshot({ targetsRaw: unsupportedTargetRaw }));
  addCheck("unsupported target period blocks activation", unsupportedTargetResult.status === "blocked");
  addCheck("unsupported target candidate preserved", unsupportedTargetResult.recordCounts.legacyTargetCandidates === 1);
  addCheck("unsupported target not active", unsupportedTargetResult.recordCounts.targets === 0);
  addCheck("unsupported target issue recorded", hasIssue(unsupportedTargetResult, "unsupported_legacy_period_type"));

  const missingSeriesReferenceRaw = JSON.stringify({
    version: "tmall_series_groups_v1",
    groups: [
      {
        id: "series-missing",
        name: "Missing Reference Series",
        productIds: ["p-404"],
        createdAt: "2026-06-18T00:00:00+08:00",
        updatedAt: "2026-06-18T00:00:00+08:00",
      },
    ],
  });
  const missingSeriesResult = await run(snapshot({ seriesRaw: missingSeriesReferenceRaw, targetsRaw: null }));
  addCheck("missing series product reference blocks activation", missingSeriesResult.status === "blocked");
  addCheck("missing series reference rejected", missingSeriesResult.rejectedRecords.some((record) => record.recordType === "series" && record.issueCodes.includes("reference_missing")));

  const missingProductTargetRaw = JSON.stringify({
    version: "tmall_targets_v1",
    targets: [
      {
        id: "target-missing-product",
        name: "Missing product target",
        scope: "product",
        periodType: "daily",
        periodValue: BUSINESS_DATE,
        metricKey: "gmv",
        targetValue: 100,
        direction: "higher_is_better",
        status: "active",
        createdAt: "2026-06-18T00:00:00+08:00",
        updatedAt: "2026-06-18T00:00:00+08:00",
      },
    ],
  });
  const missingTargetResult = await run(snapshot({ targetsRaw: missingProductTargetRaw }));
  addCheck("missing product target blocks activation", missingTargetResult.status === "blocked");
  addCheck("missing product target rejected", missingTargetResult.rejectedRecords.some((record) => record.recordType === "target" && record.issueCodes.includes("ownership_missing")));

  const corruptedSeriesResult = await run(snapshot({ seriesRaw: "{bad-json", targetsRaw: null }));
  addCheck("corrupted series blocks activation", corruptedSeriesResult.status === "blocked");
  addCheck("corrupted series issue recorded", hasIssue(corruptedSeriesResult, "legacy_parse_failed"));

  const corruptedTargetsResult = await run(snapshot({ targetsRaw: "{bad-json" }));
  addCheck("corrupted targets blocks activation", corruptedTargetsResult.status === "blocked");
  addCheck("corrupted targets issue recorded", hasIssue(corruptedTargetsResult, "legacy_parse_failed"));

  const invalidDateAnalysis = validAnalysis({
    productDailyFacts: [
      {
        ...(validAnalysis().productDailyFacts as Array<Record<string, unknown>>)[0],
        date: "not-a-date",
      },
    ],
  });
  const invalidDateResult = await run(snapshot({ analysis: invalidDateAnalysis, seriesRaw: null, targetsRaw: null }));
  addCheck("invalid fact date blocks activation", invalidDateResult.status === "blocked");
  addCheck("invalid fact date rejected safely", invalidDateResult.rejectedRecords.some((record) => record.issueCodes.includes("invalid_format")));

  const sourceOnlySnapshot = snapshot({ analysisRaw: null, seriesRaw: validSeriesRaw, targetsRaw: null });
  const missingAnalysisResult = await run(sourceOnlySnapshot);
  addCheck("dependent data without analysis blocks activation", missingAnalysisResult.status === "blocked");
  addCheck("dependent data without analysis has no staging", missingAnalysisResult.stagingDataset === null);

  addCheck("ready result remains privacy safe after string scan", !containsSensitiveText(cleanResult));
  addCheck("safe after-sales summary result remains privacy safe", !containsSensitiveText(safeAfterSalesSummaryResult));
  addCheck("failure result remains privacy safe", !containsSensitiveText(corruptedAnalysisResult));
  addCheck("all checked results have finite numbers", ![
    cleanResult,
    emptyResult,
    corruptedAnalysisResult,
    partialResult,
    safeAfterSalesSummaryResult,
    unsupportedTargetResult,
    missingSeriesResult,
    missingTargetResult,
  ].some(containsInvalidNumber));
  addCheck("all checked results have no undefined", ![
    cleanResult,
    emptyResult,
    corruptedAnalysisResult,
    partialResult,
    safeAfterSalesSummaryResult,
    unsupportedTargetResult,
    missingSeriesResult,
    missingTargetResult,
  ].some(containsUndefined));

  const commandSummary = {
    storageVersion: "airburg_storage_v2",
    readyStatus: cleanResult.status,
    readyPartialStatus: partialResult.status,
    blockedStatus: safeAfterSalesSummaryResult.status,
    migrationFailedStatus: corruptedAnalysisResult.status,
    futureActivationEligible: cleanResult.futureActivationEligible,
    proposedActiveDatasetPointerIsNull: cleanResult.proposedActiveDatasetPointer === null,
    containsSensitiveValue: containsSensitiveText(cleanResult),
    hasInvalidNumber: containsInvalidNumber(cleanResult),
    sourceObjectMutated: stableStringify(baseSnapshot) !== beforeSnapshot,
  };

  const failures = checks.filter((check) => !check.pass);
  const report = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    taskId: LEGACY_TASK_ID,
    passCount: checks.length - failures.length,
    failCount: failures.length,
    checks: checks.map((check) => ({
      name: check.name,
      status: check.pass ? "PASS" : "FAIL",
      ...(check.details ? { detailsHash: crypto.createHash("sha256").update(check.details).digest("hex") } : {}),
    })),
    summary: commandSummary,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    taskId: LEGACY_TASK_ID,
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
