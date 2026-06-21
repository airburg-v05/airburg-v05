import fs from "node:fs";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import {
  activatePreparedV2Dataset,
  createPreparedDatasetFromDryRun,
  readBackAndValidateV2Dataset,
} from "../../lib/v05/persistence/activation-engine";
import { MemoryTransactionalV2PersistenceStore } from "../../lib/v05/persistence/testing/memory-transactional-adapter";
import {
  buildV05TmallImportCandidate,
  executeV05TmallBatchImport,
  sha256File,
  type V05FileFingerprint,
} from "../../lib/v05/import";
import { DEFAULT_TMAIL_OWNER } from "../../lib/v05";
import {
  buildImportHistoryEntries,
  buildImportHistoryViewModel,
  filterImportHistoryEntries,
} from "../../lib/v05/import-history";
import { DEFAULT_IMPORT_HISTORY_FILTERS } from "../../lib/v05/import-history/filters";
import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../types/tmall";
import type { ImportBatchRecord, StoreRecord, V2Dataset } from "../../lib/v05/domain/models";
import type { V2DatasetMetadata, V2PersistenceStore } from "../../lib/v05/persistence/contracts";

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

const sampleFiles = (): Record<TmallSourceType, File> => ({
  business_product: createSampleFile(SAMPLE_FILES.business_product),
  ad_product: createSampleFile(SAMPLE_FILES.ad_product),
  ad_plan: createSampleFile(SAMPLE_FILES.ad_plan),
  after_sales: createSampleFile(SAMPLE_FILES.after_sales),
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

const containsForbiddenHistoryOutput = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return /fileName|rawRows|previewRows|File|Blob/.test(serialized);
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

const prepareValidateActivateCandidate = async ({
  store,
  analysis,
  storeRecord,
  capturedAt,
  expectedCurrentDatasetId,
}: {
  store: V2PersistenceStore;
  analysis: TmallFourSourceAnalysisResult;
  storeRecord: StoreRecord;
  capturedAt: string;
  expectedCurrentDatasetId: string | null;
}) => {
  const files = sampleFiles();
  const candidate = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: storeRecord.platformCode,
      storeId: storeRecord.storeId,
      storeName: storeRecord.storeName,
    },
    fileFingerprints: await buildFingerprints(files),
    capturedAt,
  });
  const prepared = createPreparedDatasetFromDryRun(candidate.dryRun, capturedAt);
  if (!prepared.data) throw new Error(`prepare_failed:${prepared.status}`);
  const write = await store.prepareDataset(prepared.data);
  if (write.status !== "prepared") throw new Error(`write_failed:${write.status}`);
  const readBack = await readBackAndValidateV2Dataset({
    store,
    datasetId: prepared.data.dataset.datasetId,
    validatedAt: capturedAt,
    expectedRecordCounts: prepared.data.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.data.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.data.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.data.recordKeys,
  });
  if (readBack.status !== "readback_validated") throw new Error(`readback_failed:${readBack.status}`);
  const activation = await activatePreparedV2Dataset({
    store,
    datasetId: prepared.data.dataset.datasetId,
    expectedCurrentDatasetId,
    activatedAt: capturedAt,
  });
  if (activation.status !== "activated") throw new Error(`activation_failed:${activation.status}`);
  return activation.data;
};

const prepareStagingOrFailedCandidate = async ({
  store,
  analysis,
  storeRecord,
  capturedAt,
  markFailed,
}: {
  store: V2PersistenceStore;
  analysis: TmallFourSourceAnalysisResult;
  storeRecord: StoreRecord;
  capturedAt: string;
  markFailed: boolean;
}) => {
  const files = sampleFiles();
  const candidate = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: storeRecord.platformCode,
      storeId: storeRecord.storeId,
      storeName: storeRecord.storeName,
    },
    fileFingerprints: await buildFingerprints(files),
    capturedAt,
  });
  const prepared = createPreparedDatasetFromDryRun(candidate.dryRun, capturedAt);
  if (!prepared.data) throw new Error(`prepare_failed:${prepared.status}`);
  await store.prepareDataset(prepared.data);
  if (markFailed) await store.markDatasetFailed(prepared.data.dataset.datasetId, capturedAt);
  return prepared.data.dataset.datasetId;
};

const loadHistoryViaPublicApi = async (store: V2PersistenceStore) => {
  const metadataList = await store.listDatasetMetadata();
  const datasets = [];
  for (const metadata of metadataList) {
    const dataset = await store.loadDataset(metadata.datasetId);
    if (!dataset) throw new Error("dataset_missing");
    datasets.push(dataset);
  }
  return {
    metadataList,
    datasets,
    activePointer: await store.getActivePointer(),
    activeDataset: await store.loadActiveDataset(),
    journal: await store.listActivationJournal(),
  };
};

const sameImportBatchDifferentStoresFixture = (dataset: V2Dataset, metadata: V2DatasetMetadata) => {
  const batch = dataset.importBatches[0]!;
  const secondStore: StoreRecord = {
    ...dataset.stores[0]!,
    storeId: "same-batch-second-store",
    storeName: "同批次第二店铺",
  };
  const secondBatch: ImportBatchRecord = {
    ...batch,
    storeId: secondStore.storeId,
  };
  return buildImportHistoryEntries({
    metadataList: [metadata],
    datasets: [{
      ...dataset,
      stores: [...dataset.stores, secondStore],
      importBatches: [batch, secondBatch],
    }],
    activePointer: null,
    activeDataset: null,
    journal: [],
  });
};

const main = async () => {
  const files = sampleFiles();
  const analysis = await runAnalysis(files);
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
    now: () => "2026-06-22T10:00:00+08:00",
  });
  const datasetOneId = first.datasetId!;

  const second = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: "tmall-second-store",
      storeName: "天猫第二店铺",
      isNew: true,
    },
    filesBySourceType: sampleFiles(),
    persistenceStore: store,
    now: () => "2026-06-22T10:10:00+08:00",
  });
  const datasetTwoId = second.datasetId!;

  await store.rollbackActiveDataset({
    expectedCurrentDatasetId: datasetTwoId,
    targetDatasetId: datasetOneId,
    rolledBackAt: "2026-06-22T10:20:00+08:00",
  });

  const inactiveStore: StoreRecord = {
    schemaVersion: "airburg_storage_v2",
    platformCode: "tmall",
    storeId: "tmall-inactive-valid-store",
    storeName: "历史有效测试店铺",
    status: "active",
    createdAt: "2026-06-22T10:30:00+08:00",
    updatedAt: "2026-06-22T10:30:00+08:00",
  };
  const inactiveActivation = await prepareValidateActivateCandidate({
    store,
    analysis,
    storeRecord: inactiveStore,
    capturedAt: "2026-06-22T10:30:00+08:00",
    expectedCurrentDatasetId: datasetOneId,
  });

  const thirdStore: StoreRecord = {
    schemaVersion: "airburg_storage_v2",
    platformCode: "tmall",
    storeId: "tmall-third-store",
    storeName: "天猫第三店铺",
    status: "active",
    createdAt: "2026-06-22T10:35:00+08:00",
    updatedAt: "2026-06-22T10:35:00+08:00",
  };
  await prepareValidateActivateCandidate({
    store,
    analysis,
    storeRecord: thirdStore,
    capturedAt: "2026-06-22T10:35:00+08:00",
    expectedCurrentDatasetId: inactiveActivation?.datasetId ?? null,
  });

  await prepareStagingOrFailedCandidate({
    store,
    analysis,
    storeRecord: {
      ...thirdStore,
      storeId: "tmall-staging-store",
      storeName: "暂存测试店铺",
    },
    capturedAt: "2026-06-22T10:40:00+08:00",
    markFailed: false,
  });
  await prepareStagingOrFailedCandidate({
    store,
    analysis,
    storeRecord: {
      ...thirdStore,
      storeId: "tmall-failed-store",
      storeName: "失败测试店铺",
    },
    capturedAt: "2026-06-22T10:50:00+08:00",
    markFailed: true,
  });

  const input = await loadHistoryViaPublicApi(store);
  const viewModel = buildImportHistoryViewModel(input, DEFAULT_IMPORT_HISTORY_FILTERS);
  const entries = viewModel.entries;
  const defaultEntry = entries.find((entry) => entry.storeId === DEFAULT_TMAIL_OWNER.storeId);
  const inactiveEntry = entries.find((entry) => entry.storeId === "tmall-inactive-valid-store");
  const secondEntry = entries.find((entry) => entry.storeId === "tmall-second-store");
  const thirdEntry = entries.find((entry) => entry.storeId === "tmall-third-store");
  const stagingEntry = entries.find((entry) => entry.storeId === "tmall-staging-store");
  const failedEntry = entries.find((entry) => entry.storeId === "tmall-failed-store");
  const duplicateKeys = entries.map((entry) => entry.historyKey).filter((key, index, all) => all.indexOf(key) !== index);
  const allDatasetBatchCount = input.datasets.reduce((sum, dataset) => sum + dataset.importBatches.length, 0);
  const platformFiltered = filterImportHistoryEntries(entries, {
    ...DEFAULT_IMPORT_HISTORY_FILTERS,
    platformCode: "tmall",
  });
  const storeFiltered = filterImportHistoryEntries(entries, {
    ...DEFAULT_IMPORT_HISTORY_FILTERS,
    storeKey: "tmall:tmall-second-store",
  });
  const searchFiltered = filterImportHistoryEntries(entries, {
    ...DEFAULT_IMPORT_HISTORY_FILTERS,
    searchTerm: "第二店铺",
  });
  const searchAndStatusFiltered = filterImportHistoryEntries(entries, {
    ...DEFAULT_IMPORT_HISTORY_FILTERS,
    storeKey: "tmall:tmall-second-store",
    datasetStatus: "rolled_back",
    searchTerm: secondEntry?.importBatchId.slice(0, 12) ?? "",
  });
  const sameBatchFixture = sameImportBatchDifferentStoresFixture(input.datasets[0]!, input.metadataList[0]!);
  const combinedOutput = {
    viewModel,
    sameBatchFixture,
  };

  const pageSource = read("app/(workspace)/upload/history/page.tsx");
  const componentSource = read("components/upload/import-history/import-history-client.tsx");
  const viewModelSource = read("lib/v05/import-history/build-history.ts");
  const runtimeSource = read("lib/v05/import-history/browser-runtime.ts");
  const sourceCombined = [pageSource, componentSource, viewModelSource, runtimeSource].join("\n");
  const b1Completion = JSON.parse(read("docs/project/task-completions/V0.5B_1_R1_PLATFORM_STORE_BATCH_IMPORT_UPLOAD_PAGE_RELAYOUT.json")) as {
    status: string;
    commandResults: Array<{ status: string }>;
  };

  const checks: Check[] = [
    { name: "b1_r1_completion_record_valid", pass: b1Completion.status === "complete" && b1Completion.commandResults.every((item) => item.status === "PASS") },
    { name: "public_adapter_read_methods_used", pass: ["listDatasetMetadata", "listActivationJournal", "getActivePointer", "loadDataset", "loadActiveDataset"].every((term) => runtimeSource.includes(term) || viewModelSource.includes(term)) },
    { name: "page_viewmodel_no_direct_indexeddb_open", pass: !/indexedDB\.open|indexeddb\.open/i.test(sourceCombined) },
    { name: "dedupe_across_merged_datasets", pass: duplicateKeys.length === 0 && allDatasetBatchCount > entries.length },
    { name: "composite_key_includes_platform_store_batch", pass: entries.every((entry) => entry.historyKey === `${entry.platformCode}:${entry.storeId}:${entry.importBatchId}`) },
    { name: "same_import_batch_id_different_stores_coexist", pass: sameBatchFixture.length === 2 },
    { name: "current_active_status_correct", pass: thirdEntry?.datasetStatus === "current_active" },
    { name: "inactive_valid_status_correct", pass: inactiveEntry?.datasetStatus === "inactive_valid" },
    { name: "rolled_back_status_correct", pass: secondEntry?.datasetStatus === "rolled_back" },
    { name: "failed_status_correct", pass: failedEntry?.datasetStatus === "failed" },
    { name: "staging_status_correct", pass: stagingEntry?.datasetStatus === "staging" },
    { name: "rollback_timeline_present", pass: (secondEntry?.rollbackEvents.length ?? 0) > 0 },
    { name: "record_counts_present", pass: entries.every((entry) => Object.values(entry.recordCounts).every((value) => Number.isFinite(value) && value >= 0)) },
    { name: "source_count_present", pass: entries.every((entry) => entry.sourceCount >= 0 && entry.sourceCount <= 4) },
    { name: "date_range_present", pass: entries.some((entry) => !!entry.dateRange.start && !!entry.dateRange.end) },
    { name: "filter_platform", pass: platformFiltered.length === entries.length },
    { name: "filter_store", pass: storeFiltered.length === 1 && storeFiltered[0]?.storeId === "tmall-second-store" },
    { name: "filter_search", pass: searchFiltered.length >= 1 && searchFiltered.every((entry) => entry.storeName.includes("第二店铺")) },
    { name: "filter_search_and_status_intersection", pass: searchAndStatusFiltered.length === 1 && searchAndStatusFiltered[0]?.storeId === "tmall-second-store" },
    { name: "input_not_mutated", pass: stableStringify(analysis) === analysisBefore },
    { name: "no_undefined", pass: !containsUndefined(combinedOutput) },
    { name: "no_invalid_number", pass: !containsInvalidNumber(combinedOutput) },
    { name: "no_file_or_raw_output", pass: !containsForbiddenHistoryOutput(combinedOutput) },
    { name: "no_sensitive_field_name", pass: !containsSensitiveFieldName(combinedOutput) },
    { name: "no_sensitive_source_value", pass: !containsSensitiveSourceValue(combinedOutput, sensitiveValues) },
    { name: "no_package_dependency_change", pass: !read("package.json").includes("import-history-placeholder") },
  ];

  const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  console.log(JSON.stringify({
    status,
    entryCount: entries.length,
    allDatasetBatchCount,
    activeStatuses: {
      defaultStore: defaultEntry?.datasetStatus ?? null,
      inactiveStore: inactiveEntry?.datasetStatus ?? null,
      secondStore: secondEntry?.datasetStatus ?? null,
      thirdStore: thirdEntry?.datasetStatus ?? null,
      staging: stagingEntry?.datasetStatus ?? null,
      failed: failedEntry?.datasetStatus ?? null,
    },
    duplicateHistoryKeys: duplicateKeys,
    sameBatchFixtureCount: sameBatchFixture.length,
    rollbackTimelineCount: secondEntry?.rollbackEvents.length ?? 0,
    privacyPass: !containsSensitiveSourceValue(combinedOutput, sensitiveValues),
    numberSafetyPass: !containsInvalidNumber(combinedOutput) && !containsUndefined(combinedOutput),
    checks,
  }, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

void main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    errorCode: error instanceof Error ? error.message : "unknown",
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6) : [],
  }));
  process.exitCode = 1;
});
