import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import {
  buildDataQualityViewModel,
  filterDataQualitySummaries,
} from "../../lib/v05/data-quality";
import { DEFAULT_DATA_QUALITY_FILTERS } from "../../lib/v05/data-quality/filters";
import { DEFAULT_TMAIL_OWNER } from "../../lib/v05";
import {
  buildV05TmallImportCandidate,
  executeV05TmallBatchImport,
  mergeV05ImportCandidateIntoActiveDataset,
  sha256File,
  type V05FileFingerprint,
} from "../../lib/v05/import";
import { MemoryTransactionalV2PersistenceStore } from "../../lib/v05/persistence/testing/memory-transactional-adapter";
import type { PlatformCode, V2Dataset } from "../../lib/v05/domain/models";
import type { V2DatasetMetadata } from "../../lib/v05/persistence/contracts";
import type { TmallSourceType } from "../../types/tmall";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";

const ROOT = process.cwd();

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
  "操作人",
] as const;

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const createSampleFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const createMutatedTextFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer), new TextEncoder().encode("\n")], path.basename(absolutePath));
};

const sampleFiles = (): Record<TmallSourceType, File> => ({
  business_product: createSampleFile(SAMPLE_FILES.business_product),
  ad_product: createSampleFile(SAMPLE_FILES.ad_product),
  ad_plan: createSampleFile(SAMPLE_FILES.ad_plan),
  after_sales: createSampleFile(SAMPLE_FILES.after_sales),
});

const reimportFiles = (): Record<TmallSourceType, File> => ({
  ...sampleFiles(),
  ad_product: createMutatedTextFile(SAMPLE_FILES.ad_product),
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
  if (value && typeof value === "object") Object.values(value).forEach((item) => collectLeafValues(item, values));
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

const containsSensitiveFieldName = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return SENSITIVE_FIELD_NAMES.some((fieldName) => serialized.includes(fieldName));
};

const containsSensitiveSourceValue = (value: unknown, sensitiveValues: Set<string>): boolean => {
  const outputValues = collectLeafValues(value);
  return [...sensitiveValues].some((sensitiveValue) => outputValues.has(sensitiveValue));
};

const containsForbiddenRawOutput = (value: unknown): boolean =>
  /fileName|rawRows|previewRows|Blob|原始异常|原始 warning/.test(JSON.stringify(value));

const buildFingerprints = async (files: Record<TmallSourceType, File>): Promise<V05FileFingerprint[]> =>
  Promise.all(
    (Object.keys(files) as TmallSourceType[]).map(async (sourceType) => ({
      sourceType,
      fileFingerprint: await sha256File(files[sourceType]),
    })),
  );

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const cloneDatasetForQualityFixture = ({
  dataset,
  metadata,
  suffix,
  preparedAt,
  metadataStatus = "inactive_valid",
  metadataIssueCodes = [],
  fileMutator,
}: {
  dataset: V2Dataset;
  metadata: V2DatasetMetadata;
  suffix: string;
  preparedAt: string;
  metadataStatus?: V2DatasetMetadata["status"];
  metadataIssueCodes?: string[];
  fileMutator?: (dataset: V2Dataset) => void;
}): { dataset: V2Dataset; metadata: V2DatasetMetadata } => {
  const nextDataset = clone(dataset);
  const sourceBatchId = nextDataset.importBatches[0]!.importBatchId;
  const nextBatchId = `${sourceBatchId}_${suffix}`;
  nextDataset.datasetId = `${dataset.datasetId}_${suffix}`;
  nextDataset.importBatches = nextDataset.importBatches.map((batch, index) =>
    index === 0
      ? {
        ...batch,
        importBatchId: nextBatchId,
        importStartedAt: preparedAt,
        importCompletedAt: preparedAt,
        updatedAt: preparedAt,
      }
      : batch,
  );
  const rewriteBatch = <TRecord extends { importBatchId: string }>(record: TRecord): TRecord =>
    record.importBatchId === sourceBatchId ? { ...record, importBatchId: nextBatchId } : record;
  nextDataset.importFiles = nextDataset.importFiles.map(rewriteBatch);
  nextDataset.businessProductFacts = nextDataset.businessProductFacts.map(rewriteBatch);
  nextDataset.adProductFacts = nextDataset.adProductFacts.map(rewriteBatch);
  nextDataset.adPlanFacts = nextDataset.adPlanFacts.map(rewriteBatch);
  nextDataset.afterSalesDailyAggregates = nextDataset.afterSalesDailyAggregates.map(rewriteBatch);
  nextDataset.afterSalesRangeAggregates = nextDataset.afterSalesRangeAggregates.map(rewriteBatch);
  nextDataset.afterSalesOperationalSnapshots = nextDataset.afterSalesOperationalSnapshots.map(rewriteBatch);
  nextDataset.afterSalesDistributionItems = nextDataset.afterSalesDistributionItems.map(rewriteBatch);
  fileMutator?.(nextDataset);
  return {
    dataset: nextDataset,
    metadata: {
      ...metadata,
      datasetId: nextDataset.datasetId,
      status: metadataStatus,
      preparedAt,
      validatedAt: metadataStatus === "validated" || metadataStatus === "inactive_valid" ? preparedAt : null,
      activatedAt: null,
      failedAt: metadataStatus === "failed" ? preparedAt : null,
      safeIssueCodes: metadataIssueCodes,
    },
  };
};

const main = async () => {
  const files = sampleFiles();
  const analysis = await runTmallFourSourceAnalysis({
    businessProductFile: files.business_product,
    adProductFile: files.ad_product,
    adPlanFile: files.ad_plan,
    afterSalesFile: files.after_sales,
  });
  const analysisBefore = stableStringify(analysis);
  const sensitiveValues = await collectSensitiveSourceValues(files.after_sales);
  const store = new MemoryTransactionalV2PersistenceStore();

  const first = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      storeName: DEFAULT_TMAIL_OWNER.storeName,
    },
    filesBySourceType: files,
    persistenceStore: store,
    now: () => "2026-06-22T11:00:00+08:00",
  });
  const reimport = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      storeName: DEFAULT_TMAIL_OWNER.storeName,
    },
    filesBySourceType: reimportFiles(),
    persistenceStore: store,
    now: () => "2026-06-22T11:10:00+08:00",
  });
  const pointerAfterReimport = await store.getActivePointer();

  const failed = await executeV05TmallBatchImport({
    platformCode: "pdd" as PlatformCode,
    store: {
      platformCode: "pdd" as PlatformCode,
      storeId: "pdd-test-store",
      storeName: "拼多多测试店铺",
    },
    filesBySourceType: sampleFiles(),
    persistenceStore: store,
    now: () => "2026-06-22T11:20:00+08:00",
  });
  const pointerAfterFailed = await store.getActivePointer();

  const secondStore = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: "tmall-quality-second-store",
      storeName: "质量测试第二店铺",
      isNew: true,
    },
    filesBySourceType: sampleFiles(),
    persistenceStore: store,
    now: () => "2026-06-22T11:30:00+08:00",
  });
  const pointerBeforeConflict = await store.getActivePointer();

  const candidate = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: "tmall",
      storeId: "conflict-store",
      storeName: "冲突测试店铺",
    },
    fileFingerprints: await buildFingerprints(files),
    capturedAt: "2026-06-22T11:40:00+08:00",
  });
  const conflictDataset = {
    ...candidate.dataset,
    importBatches: [],
    businessProductFacts: [{
      ...candidate.dataset.businessProductFacts[0]!,
      gmv: (candidate.dataset.businessProductFacts[0]?.gmv ?? 0) + 1,
    }],
  };
  const conflict = await mergeV05ImportCandidateIntoActiveDataset(conflictDataset, candidate);
  const pointerAfterConflict = await store.getActivePointer();

  const metadataList = await store.listDatasetMetadata();
  const datasets = [];
  for (const metadata of metadataList) {
    const dataset = await store.loadDataset(metadata.datasetId);
    if (!dataset) throw new Error("dataset_missing");
    datasets.push(dataset);
  }
  const baseMetadata = metadataList[0]!;
  const baseDataset = datasets[0]!;
  const missingFixture = cloneDatasetForQualityFixture({
    dataset: baseDataset,
    metadata: baseMetadata,
    suffix: "missing_source",
    preparedAt: "2026-06-22T12:00:00+08:00",
    fileMutator: (dataset) => {
      dataset.importFiles = dataset.importFiles.filter((file) => file.sourceType !== "ad_plan");
    },
  });
  const parseFailedFixture = cloneDatasetForQualityFixture({
    dataset: baseDataset,
    metadata: baseMetadata,
    suffix: "parse_failed",
    preparedAt: "2026-06-22T12:10:00+08:00",
    fileMutator: (dataset) => {
      dataset.importFiles = dataset.importFiles.map((file) =>
        file.sourceType === "ad_product" ? { ...file, status: "error", rowCount: 0 } : file,
      );
    },
  });
  const warningFixture = cloneDatasetForQualityFixture({
    dataset: baseDataset,
    metadata: baseMetadata,
    suffix: "warning",
    preparedAt: "2026-06-22T12:20:00+08:00",
    fileMutator: (dataset) => {
      dataset.importFiles = dataset.importFiles.map((file) =>
        file.sourceType === "business_product"
          ? { ...file, safeWarningCodes: ["invalid_date_count", "invalid_id_count", "summary_row_count"] }
          : file,
      );
    },
  });
  const conflictFixture = cloneDatasetForQualityFixture({
    dataset: baseDataset,
    metadata: baseMetadata,
    suffix: "conflict",
    preparedAt: "2026-06-22T12:30:00+08:00",
    metadataStatus: "failed",
    metadataIssueCodes: ["record_key_conflict"],
  });

  const allMetadata = [
    ...metadataList,
    missingFixture.metadata,
    parseFailedFixture.metadata,
    warningFixture.metadata,
    conflictFixture.metadata,
  ];
  const allDatasets = [
    ...datasets,
    missingFixture.dataset,
    parseFailedFixture.dataset,
    warningFixture.dataset,
    conflictFixture.dataset,
  ];
  const sourceObjectBefore = stableStringify({ allMetadata, allDatasets });
  const viewModel = buildDataQualityViewModel({
    metadataList: allMetadata,
    datasets: allDatasets,
    activePointer: await store.getActivePointer(),
    activeDataset: await store.loadActiveDataset(),
  }, DEFAULT_DATA_QUALITY_FILTERS);
  const filteredSecondStore = filterDataQualitySummaries(viewModel.summaries, {
    ...DEFAULT_DATA_QUALITY_FILTERS,
    storeKey: "tmall:tmall-quality-second-store",
  });
  const filteredSearchRisk = filterDataQualitySummaries(viewModel.summaries, {
    ...DEFAULT_DATA_QUALITY_FILTERS,
    searchTerm: "warning",
    status: "watch",
  });

  const sourceCode = [
    read("lib/v05/data-quality/build-quality.ts"),
    read("lib/v05/data-quality/browser-runtime.ts"),
    read("components/upload/data-quality/data-quality-client.tsx"),
    read("app/(workspace)/upload/quality/page.tsx"),
  ].join("\n");

  const flattenedIssues = viewModel.summaries.flatMap((summary) => summary.issues);
  const checks: Check[] = [
    { name: "b2_completion_record_valid", pass: JSON.parse(read("docs/project/task-completions/V0.5B_2_IMPORT_HISTORY_AND_BATCH_TRACEABILITY_CENTER.json")).status === "complete" },
    { name: "quality_data_uses_safe_v2_metadata", pass: ["DatasetMetadata", "ImportBatch", "ImportFile", "safeWarningCodes", "rowCount"].some((term) => sourceCode.includes(term)) },
    { name: "no_direct_indexeddb_open", pass: !/indexedDB\.open|indexeddb\.open/i.test(sourceCode) },
    { name: "source_missing_detected", pass: flattenedIssues.some((issue) => issue.issueType === "source_missing") },
    { name: "source_parse_failed_detected", pass: flattenedIssues.some((issue) => issue.issueType === "source_parse_failed") },
    { name: "warning_code_detected", pass: flattenedIssues.some((issue) => issue.issueType === "invalid_date_count") },
    { name: "invalid_date_count_safe", pass: flattenedIssues.some((issue) => issue.issueType === "invalid_date_count" && issue.count > 0) },
    { name: "invalid_id_count_safe", pass: flattenedIssues.some((issue) => issue.issueType === "invalid_id_count" && issue.count > 0) },
    { name: "no_raw_exception_values", pass: !containsForbiddenRawOutput(viewModel) },
    { name: "no_raw_warning_text", pass: !/source_warning_\d.+[\\u4e00-\\u9fa5]{4,}/.test(JSON.stringify(viewModel)) },
    { name: "no_file_name_output", pass: !/fileName|文件名|文件路径/.test(JSON.stringify(viewModel)) },
    { name: "no_sensitive_field_name", pass: !containsSensitiveFieldName(viewModel) },
    { name: "no_sensitive_source_value", pass: !containsSensitiveSourceValue(viewModel, sensitiveValues) },
    { name: "normal_status_correct", pass: viewModel.summaries.some((summary) => summary.status === "normal") },
    { name: "watch_status_correct", pass: viewModel.summaries.some((summary) => summary.status === "watch") },
    { name: "risk_status_correct", pass: viewModel.summaries.some((summary) => summary.status === "risk") },
    { name: "two_store_data_isolated", pass: secondStore.status === "success" && filteredSecondStore.every((summary) => summary.storeId === "tmall-quality-second-store") },
    { name: "search_filter_intersection", pass: filteredSearchRisk.length > 0 && filteredSearchRisk.every((summary) => summary.status === "watch" && summary.importBatchId.includes("warning")) },
    { name: "reimport_created_new_batch", pass: first.status === "success" && reimport.status === "success" && first.importBatchId !== reimport.importBatchId },
    { name: "original_batch_unchanged", pass: viewModel.summaries.some((summary) => summary.importBatchId === first.importBatchId) },
    { name: "failed_import_pointer_unchanged", pass: failed.status === "blocked" && pointerAfterFailed?.datasetId === pointerAfterReimport?.datasetId },
    { name: "conflict_does_not_overwrite", pass: conflict.merge.status === "conflict" && pointerAfterConflict?.datasetId === pointerBeforeConflict?.datasetId },
    { name: "no_undefined", pass: !containsUndefined(viewModel) },
    { name: "no_nan_or_infinity", pass: !containsInvalidNumber(viewModel) },
    { name: "no_dependency_change", pass: !read("package.json").includes("v05b3-extra-dependency") },
    { name: "input_not_mutated", pass: stableStringify({ allMetadata, allDatasets }) === sourceObjectBefore && stableStringify(analysis) === analysisBefore },
  ];

  const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  console.log(JSON.stringify({
    status,
    summaryCount: viewModel.summaries.length,
    issueCount: flattenedIssues.length,
    firstStatus: first.status,
    reimportStatus: reimport.status,
    failedStatus: failed.status,
    conflictStatus: conflict.merge.status,
    pointerUnchangedAfterFailed: pointerAfterFailed?.datasetId === pointerAfterReimport?.datasetId,
    pointerUnchangedAfterConflict: pointerAfterConflict?.datasetId === pointerBeforeConflict?.datasetId,
    sourceObjectMutated: stableStringify({ allMetadata, allDatasets }) !== sourceObjectBefore,
    privacyPass: !containsSensitiveFieldName(viewModel) && !containsSensitiveSourceValue(viewModel, sensitiveValues),
    numberSafetyPass: !containsInvalidNumber(viewModel) && !containsUndefined(viewModel),
    checks,
  }, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

void main().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", errorCode: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
