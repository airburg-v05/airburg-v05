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
  runLegacyStorageV2DryRunMigration,
  type LegacyMigrationDryRunResult,
  type LegacyStorageSnapshot,
} from "../../lib/v05";

const ROOT = process.cwd();
const CAPTURED_AT = "2026-06-21T19:35:00+08:00";
const BUSINESS_DATE = "2026-06-18";
const CUSTOM_VERSION = "legacy_tmall_v1_to_storage_v2_v1_closure";
const TASK_ID = "V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE";
const BASELINE_COMMIT = "af3211efaf82d8d4bb4ff9ae0fce736d169c00c2";

const ALLOWED_CHANGED_PATHS = [
  "lib/v05/migration/contracts.ts",
  "lib/v05/migration/hash.ts",
  "lib/v05/migration/analysis-mapper.ts",
  "lib/v05/migration/dry-run.ts",
  "scripts/private-audit/validate-v05a3-legacy-snapshot-dry-run.ts",
  "scripts/private-audit/validate-v05a31-dry-run-closure.ts",
  "lib/v05/migration/index.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE.json",
  "docs/project/task-completions/V0.5A_3_1_DRY_RUN_IDENTITY_SOURCE_STATE_AND_REAL_FIXTURE_CLOSURE.json",
] as const;

const MIGRATION_FILES = [
  "lib/v05/migration/contracts.ts",
  "lib/v05/migration/hash.ts",
  "lib/v05/migration/analysis-mapper.ts",
  "lib/v05/migration/dry-run.ts",
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

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: string): void => {
  checks.push({ name, pass, ...(details ? { details } : {}) });
};

const readFile = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

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
  afterSalesAggregates: {
    byApplyDate: [],
    bySuccessDate: [],
    byPaymentDate: [],
    reasonDistribution: [],
    statusDistribution: [],
    productSummary: [],
    unknownStatus: [],
  },
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
    afterSalesProductJoinRate: null,
    joinedAfterSalesProductCount: 0,
    afterSalesProductCount: 0,
  },
  dataQualityWarnings: [],
  ...overrides,
});

const seriesRaw = JSON.stringify({
  version: "tmall_series_groups_v1",
  groups: [
    {
      id: "series-1",
      name: "Safe Series",
      productIds: ["p-1001"],
      createdAt: "2026-06-18T00:00:00+08:00",
      updatedAt: "2026-06-18T00:00:00+08:00",
    },
  ],
});

const targetsRaw = JSON.stringify({
  version: "tmall_targets_v1",
  targets: [
    {
      id: "target-1",
      name: "Safe Target",
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
    [LEGACY_SERIES_KEY]: options.seriesRaw === undefined ? seriesRaw : options.seriesRaw,
    [LEGACY_TARGETS_KEY]: options.targetsRaw === undefined ? targetsRaw : options.targetsRaw,
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

const visibleSourceTypes = (result: LegacyMigrationDryRunResult): string[] => {
  const dataset = result.stagingDataset;
  if (!dataset) return [];
  return [
    dataset.businessProductFacts.length ? "business_product" : null,
    dataset.adProductFacts.length ? "ad_product" : null,
    dataset.adPlanFacts.length ? "ad_plan" : null,
    dataset.afterSalesDailyAggregates.length || dataset.afterSalesRangeAggregates.length ? "after_sales" : null,
  ].filter((item): item is string => item !== null);
};

const main = async (): Promise<void> => {
  const migrationSource = MIGRATION_FILES.map(readFile).join("\n");
  FORBIDDEN_MIGRATION_TOKENS.forEach((token) => {
    addCheck(`migration source excludes ${token}`, !migrationSource.includes(token));
  });

  const changedFiles = changedFilesSince(BASELINE_COMMIT);
  addCheck(
    "changed files stay inside authorization",
    changedFiles.every((file) => ALLOWED_CHANGED_PATHS.includes(file as (typeof ALLOWED_CHANGED_PATHS)[number])),
    changedFiles.join(","),
  );
  addCheck("private samples unchanged", !changedFiles.some((file) => file.startsWith("private-samples/")));
  addCheck("storage modules unchanged", !changedFiles.some((file) => file.startsWith("lib/storage/")));
  addCheck("tmall modules unchanged", !changedFiles.some((file) => file.startsWith("lib/tmall/")));
  addCheck("domain modules unchanged", !changedFiles.some((file) => file.startsWith("lib/v05/domain/")));
  addCheck("repository modules unchanged", !changedFiles.some((file) => file.startsWith("lib/v05/repositories/")));
  addCheck("validation modules unchanged", !changedFiles.some((file) => file.startsWith("lib/v05/validation/")));

  const baseSnapshot = snapshot();
  const baseBefore = stableStringify(baseSnapshot);
  const base = await dryRun(baseSnapshot);
  const repeat = await dryRun(clone(baseSnapshot));
  addCheck("same five-key snapshot is deterministic", stableStringify(base) === stableStringify(repeat));
  addCheck("input snapshot is not mutated", stableStringify(baseSnapshot) === baseBefore);
  addCheck("base result has dataset fingerprint", !!base.businessDatasetFingerprint);
  addCheck("base result has manifest fingerprint", !!base.manifestFingerprint);
  addCheck("base dataset id uses business fingerprint", base.stagingDataset?.datasetId.includes(base.businessDatasetFingerprint?.slice(0, 24) ?? "__missing__") === true);
  addCheck("base manifest id uses manifest fingerprint", base.manifestCandidate?.migrationManifestId.includes(base.manifestFingerprint?.slice(0, 24) ?? "__missing__") === true);

  const analysisChanged = await dryRun(snapshot({
    analysis: baseAnalysis({
      productDailyFacts: [
        {
          ...(baseAnalysis().productDailyFacts as Array<Record<string, unknown>>)[0],
          gmv: 1001,
        },
      ],
    }),
  }));
  const seriesChanged = await dryRun(snapshot({
    seriesRaw: JSON.stringify({
      version: "tmall_series_groups_v1",
      groups: [
        {
          id: "series-1",
          name: "Safe Series Changed",
          productIds: ["p-1001"],
          createdAt: "2026-06-18T00:00:00+08:00",
          updatedAt: "2026-06-18T00:00:00+08:00",
        },
      ],
    }),
  }));
  const targetsChanged = await dryRun(snapshot({
    targetsRaw: JSON.stringify({
      version: "tmall_targets_v1",
      targets: [
        {
          id: "target-1",
          name: "Safe Target",
          scope: "store",
          periodType: "daily",
          periodValue: BUSINESS_DATE,
          metricKey: "gmv",
          targetValue: 1001,
          direction: "higher_is_better",
          status: "active",
          createdAt: "2026-06-18T00:00:00+08:00",
          updatedAt: "2026-06-18T00:00:00+08:00",
        },
      ],
    }),
  }));
  const ignoredChanged = await dryRun(snapshot({ lastRaw: JSON.stringify({ previewRows: ["changed"] }) }));

  addCheck("analysis payload change changes datasetId", analysisChanged.stagingDataset?.datasetId !== base.stagingDataset?.datasetId);
  addCheck("series payload change changes datasetId", seriesChanged.stagingDataset?.datasetId !== base.stagingDataset?.datasetId);
  addCheck("targets payload change changes datasetId", targetsChanged.stagingDataset?.datasetId !== base.stagingDataset?.datasetId);
  addCheck("ignored preview change does not change business datasetId", ignoredChanged.stagingDataset?.datasetId === base.stagingDataset?.datasetId);
  addCheck("ignored preview change changes manifestId", ignoredChanged.manifestCandidate?.migrationManifestId !== base.manifestCandidate?.migrationManifestId);

  const sourceMismatch = await dryRun(snapshot({
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "parsed", 1),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "parsed", 1),
      },
    }),
  }));
  addCheck("source-state mismatch creates issue", hasIssue(sourceMismatch, "legacy_source_state_mismatch"));
  addCheck("source-state mismatch blocks future activation", sourceMismatch.futureActivationEligible === false);
  addCheck("source-state mismatch does not stage non-parsed plan facts", sourceMismatch.stagingDataset?.adPlanFacts.length === 0);

  const legalPartial = await dryRun(snapshot({
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "parsed", 1),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "missing", 0),
      },
      adPlanDailyFacts: [],
      afterSalesAggregates: {
        byApplyDate: [],
        bySuccessDate: [],
        byPaymentDate: [],
        reasonDistribution: [],
        statusDistribution: [],
        productSummary: [],
        unknownStatus: [],
      },
    }),
  }));
  addCheck("legal partial status ready_partial", legalPartial.status === "ready_partial");
  addCheck("legal partial is not future eligible", legalPartial.futureActivationEligible === false);
  addCheck("legal partial stages only parsed source facts", stableStringify(visibleSourceTypes(legalPartial)) === stableStringify(["business_product", "ad_product"]));

  const adOnly = await dryRun(snapshot({
    seriesRaw: null,
    targetsRaw: null,
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "missing", 0),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "missing", 0),
        after_sales: sourceHealth("after_sales", "missing", 0),
      },
      productDailyFacts: [],
      adPlanDailyFacts: [],
    }),
  }));
  addCheck("ad-only product fact is retained", adOnly.stagingDataset?.adProductFacts.length === 1);
  addCheck("ad-only result has no business facts", adOnly.stagingDataset?.businessProductFacts.length === 0);
  addCheck("ad-only join warning is safe", adOnly.issues.some((issue) => issue.code === "reference_missing" && issue.severity === "warning"));
  addCheck("ad-only is partial and not eligible", adOnly.status === "ready_partial" && adOnly.futureActivationEligible === false);

  const emptyCustom = await dryRun(snapshot({ analysisRaw: null, seriesRaw: null, targetsRaw: null }), "custom_empty_version");
  const blockedCustom = await dryRun(snapshot({
    analysis: baseAnalysis({
      sourceHealth: {
        business_product: sourceHealth("business_product", "parsed", 1),
        ad_product: sourceHealth("ad_product", "parsed", 1),
        ad_plan: sourceHealth("ad_plan", "error", 0),
        after_sales: sourceHealth("after_sales", "parsed", 1),
      },
    }),
  }), "custom_blocked_version");
  const failedCustom = await dryRun(snapshot({ analysisRaw: "{bad-json" }), "custom_failed_version");
  addCheck("custom migrationVersion kept for empty", emptyCustom.migrationVersion === "custom_empty_version");
  addCheck("custom migrationVersion kept for blocked", blockedCustom.migrationVersion === "custom_blocked_version");
  addCheck("custom migrationVersion kept for migration_failed", failedCustom.migrationVersion === "custom_failed_version");

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
  const realStoredRaw = JSON.stringify(toTmallStoredAnalysisResult(realAnalysis));
  const realDryRun = await dryRun(snapshot({
    analysisRaw: realStoredRaw,
    seriesRaw: null,
    targetsRaw: null,
    lastRaw: null,
    demoRaw: null,
  }));
  const sensitiveValues = await collectSensitiveSourceValues(afterSalesFile);
  const outputValues = collectLeafValues(realDryRun);
  const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => outputValues.has(value)).length;
  addCheck("real fixture dry-run executed", ["ready", "ready_partial", "blocked", "migration_failed"].includes(realDryRun.status));
  addCheck("real fixture output excludes sensitive field names", !containsSensitiveFieldName(realDryRun));
  addCheck("real fixture output excludes sensitive values", leakedSensitiveValueCount === 0);
  addCheck("real fixture output has no invalid numbers", !containsInvalidNumber(realDryRun));
  addCheck("real fixture output has no undefined", !containsUndefined(realDryRun));

  const allResults = [
    base,
    analysisChanged,
    seriesChanged,
    targetsChanged,
    ignoredChanged,
    sourceMismatch,
    legalPartial,
    adOnly,
    emptyCustom,
    blockedCustom,
    failedCustom,
    realDryRun,
  ];
  addCheck("all synthetic and real results exclude sensitive field names", !allResults.some(containsSensitiveFieldName));
  addCheck("all synthetic and real results have finite numbers", !allResults.some(containsInvalidNumber));
  addCheck("all synthetic and real results have no undefined", !allResults.some(containsUndefined));

  const failures = checks.filter((check) => !check.pass);
  const report = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    taskId: TASK_ID,
    passCount: checks.length - failures.length,
    failCount: failures.length,
    checks: checks.map((check) => ({
      name: check.name,
      status: check.pass ? "PASS" : "FAIL",
      ...(check.details ? { detailsHash: crypto.createHash("sha256").update(check.details).digest("hex") } : {}),
    })),
    summary: {
      businessDatasetFingerprint: base.businessDatasetFingerprint,
      manifestFingerprint: base.manifestFingerprint,
      partialStatus: legalPartial.status,
      partialSourceTypes: visibleSourceTypes(legalPartial),
      adOnlyStatus: adOnly.status,
      adOnlyAdProductFactCount: adOnly.stagingDataset?.adProductFacts.length ?? 0,
      realFixtureStatus: realDryRun.status,
      realFixtureFutureActivationEligible: realDryRun.futureActivationEligible,
      realFixtureIssueCodes: issueCodes(realDryRun),
      realFixtureRecordCounts: realDryRun.recordCounts,
      realFixtureSensitiveSourceValueCount: sensitiveValues.size,
      realFixtureLeakedSensitiveValueCount: leakedSensitiveValueCount,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
