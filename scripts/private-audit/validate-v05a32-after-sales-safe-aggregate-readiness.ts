import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_DEMO_SESSION_KEY,
  LEGACY_LAST_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_TARGETS_KEY,
  createMemoryV2RepositoryBundle,
  runLegacyStorageV2DryRunMigration,
  type LegacyMigrationDryRunResult,
  type LegacyStorageSnapshot,
  type OwnedAfterSalesDailyAggregate,
  type OwnedAfterSalesRangeAggregate,
} from "../../lib/v05";

const ROOT = process.cwd();
const TASK_ID = "V0.5A_3_2_AFTER_SALES_SAFE_AGGREGATE_CONTRACT_AND_REAL_FIXTURE_READINESS";
const DEPENDENCY_TASK_ID = "V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE";
const CAPTURED_AT = "2026-06-21T20:20:00+08:00";
const BUSINESS_DATE = "2026-06-18";
const CUSTOM_VERSION = "legacy_tmall_v1_to_storage_v2_v1_after_sales_safe_aggregate";

const MIGRATION_FILES = [
  "lib/v05/migration/contracts.ts",
  "lib/v05/migration/hash.ts",
  "lib/v05/migration/analysis-mapper.ts",
  "lib/v05/migration/after-sales-mapper.ts",
  "lib/v05/migration/dry-run.ts",
  "lib/v05/migration/index.ts",
] as const;

const FORBIDDEN_PERSISTENCE_TOKENS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "IDBDatabase",
  "setItem",
  "removeItem",
  "clear()",
  "active pointer save",
  "legacy key save",
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

interface Check {
  name: string;
  pass: boolean;
  details?: string;
}

interface CurrentTask {
  taskId: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface CompletionRecord {
  taskId: string;
  status: string;
  commandResults: Array<{ command: string; status: string }>;
}

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: string): void => {
  checks.push({ name, pass, ...(details ? { details } : {}) });
};

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(readFile(relativePath)) as T;

const createFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

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
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

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

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectLeafValues = (value: unknown, values = new Set<string>()): Set<string> => {
  const leafValue = normalizeLeafValue(value);
  if (leafValue !== null) {
    values.add(leafValue);
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

const isCheckableSensitiveValue = (value: string): boolean => {
  const placeholders = new Set(["-", "--", "无", "暂无", "空", "null", "NULL", "0"]);
  return value.length >= 4 && !placeholders.has(value);
};

const collectSensitiveSourceValues = async (afterSalesFile: File): Promise<Set<string>> => {
  const table = await parseTmallTableFile(afterSalesFile);
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((header) => {
      const value = normalizeLeafValue(row[header]);
      if (value && isCheckableSensitiveValue(value)) values.add(value);
    });
  });
  return values;
};

const sourceHealth = (sourceType: string, status = "parsed", rowCount = 1) => ({
  sourceType,
  expectedSourceType: sourceType,
  status,
  fileName: `redacted-${sourceType}.xlsx`,
  encoding: "GB18030",
  sheetNames: ["Sheet1"],
  headerRowNumber: 1,
  headers: ["redacted_header"],
  rowCount,
  missingRequiredFields: [],
  invalidDateCount: 0,
  invalidIdCount: 0,
  summaryRowCount: 0,
  unknownStatuses: [],
  warningTypes: [],
});

const emptyAfterSalesAggregates = () => ({
  byApplyDate: [],
  bySuccessDate: [],
  byPaymentDate: [],
  reasonDistribution: [],
  statusDistribution: [],
  productSummary: [],
  unknownStatus: [],
});

const safeAfterSalesAggregates = () => ({
  byApplyDate: [
    {
      date: BUSINESS_DATE,
      refundApplyCount: 2,
      refundApplyAmount: 100,
    },
  ],
  bySuccessDate: [
    {
      date: BUSINESS_DATE,
      refundSuccessCount: 1,
      refundSuccessTotalAmount: 60,
    },
  ],
  byPaymentDate: [
    {
      date: BUSINESS_DATE,
      refundAttributionCount: 1,
      refundAttributionAmount: 40,
    },
  ],
  reasonDistribution: [
    { label: "质量原因", count: 2 },
  ],
  statusDistribution: [
    { label: "待处理", count: 1 },
  ],
  productSummary: [
    {
      productId: "p-1001",
      refundApplyCount: 2,
      refundApplyAmount: 100,
      refundSuccessCount: 1,
      refundSuccessTotalAmount: 60,
      pendingCount: 1,
      overduePendingCount: 0,
      customerServiceInterventionCount: 0,
      avgAfterSalesDurationHours: 24,
      topReasons: [
        { label: "尺寸原因", count: 1 },
      ],
    },
  ],
  unknownStatus: ["待人工确认"],
});

const baseAnalysis = (overrides: Record<string, unknown> = {}) => ({
  version: "tmall_four_source_v1",
  analysisTimestamp: "2026-06-18T12:00:00+08:00",
  sourceHealth: {
    business_product: sourceHealth("business_product", "parsed", 1),
    ad_product: sourceHealth("ad_product", "parsed", 1),
    ad_plan: sourceHealth("ad_plan", "parsed", 1),
    after_sales: sourceHealth("after_sales", "parsed", 1),
  },
  dateRanges: {
    business_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
    ad_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
    ad_plan: { start: BUSINESS_DATE, end: BUSINESS_DATE },
    after_sales: { start: BUSINESS_DATE, end: BUSINESS_DATE },
  },
  productDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      productId: "p-1001",
      productName: "Safe Product",
      visitors: 100,
      pageViews: 200,
      paidBuyers: 10,
      gmv: 1000,
      refundSuccessAmount: 0,
      gsv: 1000,
      refundRate: null,
      conversionRate: 0.1,
      avgOrderValue: 100,
      favorites: 1,
      cartAdditions: 2,
      orderBuyers: 10,
      orderAmount: 1000,
      searchVisitors: 20,
      searchPaidBuyers: 2,
      hasAdData: true,
    },
  ],
  adProductDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      productId: "p-1001",
      adSpend: 20,
      impressions: 1000,
      clicks: 50,
      adTransactionAmount: 200,
      directTransactionAmount: 150,
      indirectTransactionAmount: 50,
      favoriteCartCount: 3,
      guidedVisitors: 30,
      guidedProspects: 4,
      newBuyers: 2,
      memberJoinCount: 1,
      clickRate: 0.05,
      avgClickCost: 0.4,
      cpm: 20,
      roi: 10,
      directTransactionShare: 0.75,
      indirectTransactionShare: 0.25,
      favoriteCartCost: 6.67,
      hasAdData: true,
    },
  ],
  adPlanDailyFacts: [
    {
      platform: "tmall",
      date: BUSINESS_DATE,
      planId: "plan-1",
      planName: "Safe Plan",
      sceneId: null,
      sceneName: null,
      adSpend: 30,
      impressions: 2000,
      clicks: 60,
      transactionAmount: 300,
      directTransactionAmount: 200,
      indirectTransactionAmount: 100,
      guidedVisitors: 40,
      guidedProspects: 5,
      newBuyers: 3,
      memberJoinCount: 1,
      memberFirstBuyers: 1,
      clickRate: 0.03,
      avgClickCost: 0.5,
      roi: 10,
      guidedProspectRate: 0.08,
      newBuyerRate: 0.05,
      memberJoinRate: 0.02,
    },
  ],
  afterSalesAggregates: safeAfterSalesAggregates(),
  joinQuality: {
    advertisedProductJoinRate: 1,
    advertisedProductJoinedCount: 1,
    advertisedProductCount: 1,
    storePromotionCoverage: 1,
    promotedProductCount: 1,
    storeProductCount: 1,
    planJoinRate: 1,
    joinedPlanCount: 1,
    adProductPlanCount: 1,
    afterSalesProductJoinRate: 1,
    joinedAfterSalesProductCount: 1,
    afterSalesProductCount: 1,
  },
  dataQualityWarnings: [],
  ...overrides,
});

const targetsRaw = (productId = "p-1001") => JSON.stringify({
  version: "tmall_targets_v1",
  targets: [
    {
      id: `target-${productId}`,
      name: "Safe Product Target",
      scope: "product",
      productId,
      periodType: "daily",
      periodValue: BUSINESS_DATE,
      metricKey: "gmv",
      targetValue: 1000,
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
  lastRaw?: string | null;
  demoRaw?: string | null;
} = {}): LegacyStorageSnapshot => ({
  capturedAt: CAPTURED_AT,
  values: {
    [LEGACY_ANALYSIS_KEY]:
      options.analysisRaw === undefined
        ? JSON.stringify(options.analysis ?? baseAnalysis())
        : options.analysisRaw,
    [LEGACY_SERIES_KEY]: options.seriesRaw === undefined ? null : options.seriesRaw,
    [LEGACY_TARGETS_KEY]: options.targetsRaw === undefined ? null : options.targetsRaw,
    [LEGACY_LAST_ANALYSIS_KEY]: options.lastRaw === undefined ? JSON.stringify({ previewRows: [] }) : options.lastRaw,
    [LEGACY_DEMO_SESSION_KEY]: options.demoRaw === undefined ? JSON.stringify({ demo: true }) : options.demoRaw,
  },
});

const dryRun = (input: LegacyStorageSnapshot, migrationVersion = CUSTOM_VERSION) =>
  runLegacyStorageV2DryRunMigration({ snapshot: input, migrationVersion });

const issueCodes = (result: LegacyMigrationDryRunResult): string[] =>
  Array.from(new Set(result.issues.map((issue) => issue.code))).sort();

const hasIssue = (result: LegacyMigrationDryRunResult, code: string): boolean =>
  issueCodes(result).includes(code);

const main = async (): Promise<void> => {
  const currentTask = parseJson<CurrentTask>("docs/project/current-task.json");
  const changedFiles = changedFilesSince(currentTask.baselineCommit);
  const dependencyRecordPath = `docs/project/task-completions/${DEPENDENCY_TASK_ID}.json`;
  const dependencyRecord = parseJson<CompletionRecord>(dependencyRecordPath);

  addCheck("current task is A-3.2", currentTask.taskId === TASK_ID);
  addCheck("A-3.1 completion record exists", exists(dependencyRecordPath));
  addCheck("A-3.1 dependency remains complete", dependencyRecord.taskId === DEPENDENCY_TASK_ID && dependencyRecord.status === "complete");
  addCheck(
    "A-3.1 dependency command results remain PASS",
    dependencyRecord.commandResults.every((result) => result.status === "PASS"),
  );
  addCheck("A-3.1 completion record not modified", !changedFiles.includes(dependencyRecordPath));
  addCheck(
    "changed files stay inside A-3.2 authorization",
    changedFiles.every((file) => pathMatchesAny(file, currentTask.allowedModifyPaths)),
    changedFiles.join(","),
  );
  addCheck(
    "forbidden paths unchanged",
    !changedFiles.some((file) => pathMatchesAny(file, currentTask.forbiddenModifyPaths)),
    changedFiles.join(","),
  );
  addCheck("private samples unchanged", !changedFiles.some((file) => file.startsWith("private-samples/")));
  addCheck("storage modules unchanged", !changedFiles.some((file) => file.startsWith("lib/storage/")));
  addCheck("tmall modules unchanged", !changedFiles.some((file) => file.startsWith("lib/tmall/")));
  addCheck("app and components unchanged", !changedFiles.some((file) => file.startsWith("app/") || file.startsWith("components/")));

  const migrationSource = MIGRATION_FILES.map(readFile).join("\n");
  FORBIDDEN_PERSISTENCE_TOKENS.forEach((token) => {
    addCheck(`migration source excludes ${token}`, !migrationSource.includes(token));
  });

  const baseSnapshot = snapshot();
  const baseBefore = stableStringify(baseSnapshot);
  const splitResult = await dryRun(baseSnapshot);
  addCheck("input snapshot is not mutated", stableStringify(baseSnapshot) === baseBefore);
  addCheck("safe after-sales result ready", splitResult.status === "ready");
  addCheck("safe after-sales future eligible", splitResult.futureActivationEligible === true);
  addCheck("ambiguous after-sales issue removed", !hasIssue(splitResult, "ambiguous_after_sales_range_basis"));
  addCheck("product apply range aggregate created", splitResult.stagingDataset?.afterSalesRangeAggregates.some(
    (record) =>
      record.productId === "p-1001" &&
      record.dateBasis === "apply_date" &&
      record.refundOrderCount === 2 &&
      record.refundAmount === 100,
  ) === true);
  addCheck("product success range aggregate created", splitResult.stagingDataset?.afterSalesRangeAggregates.some(
    (record) =>
      record.productId === "p-1001" &&
      record.dateBasis === "success_date" &&
      record.refundOrderCount === 1 &&
      record.refundAmount === 60,
  ) === true);
  addCheck("operational snapshot created", splitResult.stagingDataset?.afterSalesOperationalSnapshots.some(
    (record) =>
      record.productId === "p-1001" &&
      record.pendingCount === 1 &&
      record.avgAfterSalesDurationHours === 24 &&
      !("businessDate" in record),
  ) === true);
  addCheck("distribution items created", splitResult.stagingDataset?.afterSalesDistributionItems.some(
    (record) =>
      record.productId === "p-1001" &&
      record.distributionKind === "reason_distribution" &&
      record.safeLabel === "尺寸原因" &&
      record.count === 1,
  ) === true);
  addCheck("unknown status distribution created", splitResult.stagingDataset?.afterSalesDistributionItems.some(
    (record) => record.distributionKind === "unknown_status_distribution" && record.safeLabel === "待人工确认",
  ) === true);
  addCheck("record counts include operational snapshots", splitResult.recordCounts.afterSalesOperationalSnapshots > 0);
  addCheck("record counts include distribution items", splitResult.recordCounts.afterSalesDistributionItems > 0);

  const repository = createMemoryV2RepositoryBundle();
  const snapshotRecord = splitResult.stagingDataset?.afterSalesOperationalSnapshots[0];
  const distributionRecord = splitResult.stagingDataset?.afterSalesDistributionItems[0];
  if (snapshotRecord && distributionRecord) {
    const snapshotInsert = await repository.afterSalesOperationalSnapshots.insert(snapshotRecord);
    const distributionInsert = await repository.afterSalesDistributionItems.insert(distributionRecord);
    const dailyRejectsSnapshot = await repository.afterSalesDailyAggregates.insert(
      snapshotRecord as unknown as OwnedAfterSalesDailyAggregate,
    );
    const dailyRejectsDistribution = await repository.afterSalesDailyAggregates.insert(
      distributionRecord as unknown as OwnedAfterSalesDailyAggregate,
    );
    const rangeRejectsSnapshot = await repository.afterSalesRangeAggregates.insert(
      snapshotRecord as unknown as OwnedAfterSalesRangeAggregate,
    );
    const rangeRejectsDistribution = await repository.afterSalesRangeAggregates.insert(
      distributionRecord as unknown as OwnedAfterSalesRangeAggregate,
    );
    addCheck("snapshot repository accepts snapshot", snapshotInsert.status === "success");
    addCheck("distribution repository accepts distribution", distributionInsert.status === "success");
    addCheck("daily repository rejects snapshot", dailyRejectsSnapshot.status === "validation_error");
    addCheck("daily repository rejects distribution", dailyRejectsDistribution.status === "validation_error");
    addCheck("range repository rejects snapshot", rangeRejectsSnapshot.status === "validation_error");
    addCheck("range repository rejects distribution", rangeRejectsDistribution.status === "validation_error");
  } else {
    addCheck("repository isolation source records available", false);
  }

  const unsafeLabelResult = await dryRun(snapshot({
    analysis: baseAnalysis({
      afterSalesAggregates: {
        ...safeAfterSalesAggregates(),
        reasonDistribution: [{ label: "订单编号", count: 1 }],
      },
    }),
  }));
  addCheck("unsafe distribution label creates issue", hasIssue(unsafeLabelResult, "after_sales_distribution_label_unsafe"));
  addCheck("unsafe distribution label blocks activation", unsafeLabelResult.status === "blocked" && unsafeLabelResult.futureActivationEligible === false);

  const invalidCountResult = await dryRun(snapshot({
    analysis: baseAnalysis({
      afterSalesAggregates: {
        ...safeAfterSalesAggregates(),
        reasonDistribution: [{ label: "安全原因", count: 0 }],
      },
    }),
  }));
  addCheck("invalid distribution count creates issue", hasIssue(invalidCountResult, "after_sales_count_reconciliation_failed"));
  addCheck("invalid distribution count blocks activation", invalidCountResult.status === "blocked" && invalidCountResult.futureActivationEligible === false);

  const unmappedResult = await dryRun(snapshot({
    analysis: baseAnalysis({
      dateRanges: {
        business_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
        ad_product: { start: BUSINESS_DATE, end: BUSINESS_DATE },
        ad_plan: { start: BUSINESS_DATE, end: BUSINESS_DATE },
        after_sales: null,
      },
    }),
  }));
  addCheck("missing after-sales range creates unmapped issue", hasIssue(unmappedResult, "after_sales_aggregate_unmapped"));
  addCheck("unmapped after-sales aggregate blocks activation", unmappedResult.status === "blocked" && unmappedResult.futureActivationEligible === false);
  addCheck("unmapped after-sales aggregate does not guess date basis", !hasIssue(unmappedResult, "ambiguous_after_sales_range_basis"));

  const sourceMismatchResult = await dryRun(snapshot({
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "parsed", 1),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "missing", 0),
      },
    }),
  }));
  addCheck("non-parsed source with fact candidates creates mismatch", hasIssue(sourceMismatchResult, "legacy_source_state_mismatch"));
  addCheck("source mismatch blocks future activation", sourceMismatchResult.futureActivationEligible === false);
  addCheck("source mismatch does not stage non-parsed facts", (
    sourceMismatchResult.stagingDataset?.adPlanFacts.length === 0 &&
    sourceMismatchResult.stagingDataset?.afterSalesDailyAggregates.length === 0 &&
    sourceMismatchResult.stagingDataset?.afterSalesRangeAggregates.length === 0 &&
    sourceMismatchResult.stagingDataset?.afterSalesOperationalSnapshots.length === 0 &&
    sourceMismatchResult.stagingDataset?.afterSalesDistributionItems.length === 0
  ));

  const legalPartialResult = await dryRun(snapshot({
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "parsed", 1),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "missing", 0),
      },
      adPlanDailyFacts: [],
      afterSalesAggregates: emptyAfterSalesAggregates(),
    }),
  }));
  addCheck("partial result only stages parsed source facts", (
    legalPartialResult.status === "ready_partial" &&
    legalPartialResult.stagingDataset?.businessProductFacts.length === 1 &&
    legalPartialResult.stagingDataset?.adProductFacts.length === 1 &&
    legalPartialResult.stagingDataset?.adPlanFacts.length === 0 &&
    legalPartialResult.stagingDataset?.afterSalesDailyAggregates.length === 0 &&
    legalPartialResult.stagingDataset?.afterSalesRangeAggregates.length === 0 &&
    legalPartialResult.stagingDataset?.afterSalesOperationalSnapshots.length === 0 &&
    legalPartialResult.stagingDataset?.afterSalesDistributionItems.length === 0
  ));
  addCheck("partial result is not activation eligible", legalPartialResult.futureActivationEligible === false);

  const adOnlyResult = await dryRun(snapshot({
    targetsRaw: targetsRaw("p-ad-only"),
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "missing", 0),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "missing", 0),
      },
      productDailyFacts: [],
      adProductDailyFacts: [
        {
          ...(baseAnalysis().adProductDailyFacts as Array<Record<string, unknown>>)[0],
          productId: "p-ad-only",
        },
      ],
      adPlanDailyFacts: [],
      afterSalesAggregates: emptyAfterSalesAggregates(),
    }),
  }));
  addCheck("ad-only product fact is retained", adOnlyResult.stagingDataset?.adProductFacts.length === 1);
  addCheck("ad-only product target can migrate", adOnlyResult.stagingDataset?.targets.some(
    (target) => target.scope === "product" && target.productId === "p-ad-only",
  ) === true);
  addCheck("ad-only product target has no reference missing issue", !adOnlyResult.issues.some(
    (issue) => issue.path.includes("targets") && issue.code === "reference_missing",
  ));

  const emptyCustom = await dryRun(snapshot({ analysisRaw: null, seriesRaw: null, targetsRaw: null }), "custom_empty_v32");
  const blockedCustom = await dryRun(snapshot({
    analysis: baseAnalysis({
      afterSalesAggregates: {
        ...safeAfterSalesAggregates(),
        reasonDistribution: [{ label: "订单编号", count: 1 }],
      },
    }),
  }), "custom_blocked_v32");
  const failedCustom = await dryRun(snapshot({ analysisRaw: "{bad-json" }), "custom_failed_v32");
  addCheck("custom migrationVersion kept for empty", emptyCustom.migrationVersion === "custom_empty_v32");
  addCheck("custom migrationVersion kept for blocked", blockedCustom.migrationVersion === "custom_blocked_v32");
  addCheck("custom migrationVersion kept for migration_failed", failedCustom.migrationVersion === "custom_failed_v32");

  const afterSalesFile = createFile("private-samples/tmall/after-sales/当日售后退货表.xlsx");
  const realAnalysis = await runTmallFourSourceAnalysis({
    businessProductFile: createFile(
      "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
    ),
    adProductFile: createFile("private-samples/tmall/ad-product/商品报表_20260619_110309.csv"),
    adPlanFile: createFile("private-samples/tmall/ad-plan/计划报表_20260619_110330.csv"),
    afterSalesFile,
    analysisTimestamp: "2026-06-19T00:00:00.000Z",
  });
  const realStored = toTmallStoredAnalysisResult(realAnalysis);
  const realStoredBefore = stableStringify(realStored);
  const realDryRun = await dryRun(snapshot({
    analysisRaw: JSON.stringify(realStored),
    seriesRaw: null,
    targetsRaw: null,
    lastRaw: null,
    demoRaw: null,
  }));
  const realStoredAfter = stableStringify(realStored);
  const sensitiveValues = await collectSensitiveSourceValues(afterSalesFile);
  const outputValues = collectLeafValues(realDryRun);
  const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => outputValues.has(value)).length;

  addCheck("real fixture dry-run executed", ["ready", "ready_partial", "blocked", "migration_failed"].includes(realDryRun.status));
  addCheck("real fixture no ambiguous issue", !hasIssue(realDryRun, "ambiguous_after_sales_range_basis"));
  addCheck("real fixture maps operational snapshots", realDryRun.recordCounts.afterSalesOperationalSnapshots > 0);
  addCheck("real fixture maps distribution items", realDryRun.recordCounts.afterSalesDistributionItems > 0);
  addCheck("real fixture source object is not mutated", realStoredBefore === realStoredAfter);
  addCheck("real fixture output excludes sensitive field names", !containsSensitiveFieldName(realDryRun));
  addCheck("real fixture output excludes sensitive values", leakedSensitiveValueCount === 0);

  const allResults = [
    splitResult,
    unsafeLabelResult,
    invalidCountResult,
    unmappedResult,
    sourceMismatchResult,
    legalPartialResult,
    adOnlyResult,
    emptyCustom,
    blockedCustom,
    failedCustom,
    realDryRun,
  ];
  addCheck("all results have finite numbers", !allResults.some(containsInvalidNumber));
  addCheck("all results have no undefined", !allResults.some(containsUndefined));
  addCheck("all results exclude sensitive field names", !allResults.some(containsSensitiveFieldName));

  const realActivationReady = realDryRun.status === "ready" && realDryRun.futureActivationEligible === true;
  const implementationFailures = checks.filter((check) => !check.pass);
  const implementationStatus = implementationFailures.length === 0 ? "PASS" : "FAIL";
  const activationEntryStatus = realActivationReady ? "PASS" : "BLOCKED";
  const status = implementationStatus === "PASS" && activationEntryStatus === "PASS" ? "PASS" : "FAIL";
  const report = {
    status,
    taskId: TASK_ID,
    implementationStatus,
    activationEntryStatus,
    passCount: checks.length - implementationFailures.length,
    failCount: implementationFailures.length,
    checks: checks.map((check) => ({
      name: check.name,
      status: check.pass ? "PASS" : "FAIL",
      ...(check.details ? { detailsHash: sha256(check.details) } : {}),
    })),
    summary: {
      splitRecordCounts: splitResult.recordCounts,
      sourceMismatchIssueCodes: issueCodes(sourceMismatchResult),
      legalPartialStatus: legalPartialResult.status,
      adOnlyStatus: adOnlyResult.status,
      adOnlyTargetCount: adOnlyResult.stagingDataset?.targets.length ?? 0,
      realFixtureStatus: realDryRun.status,
      realFixtureFutureActivationEligible: realDryRun.futureActivationEligible,
      realFixtureIssueCodes: issueCodes(realDryRun),
      realFixtureRecordCounts: realDryRun.recordCounts,
      realFixtureSensitiveSourceValueCount: sensitiveValues.size,
      realFixtureLeakedSensitiveValueCount: leakedSensitiveValueCount,
      changedFileCount: changedFiles.length,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    implementationStatus: "FAIL",
    activationEntryStatus: "BLOCKED",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
