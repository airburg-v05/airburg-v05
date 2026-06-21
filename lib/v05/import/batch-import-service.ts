import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../../types/tmall";
import { runTmallFourSourceAnalysis } from "../../tmall/pipeline/run-tmall-four-source-analysis";
import { validateV2Dataset } from "../validation/dataset";
import { DEFAULT_TMAIL_OWNER, LEGACY_ANALYSIS_KEY, emptyRecordCounts } from "../migration/contracts";
import { captureLegacyStorageSnapshot } from "../persistence/legacy-reader";
import {
  activateLegacySnapshotToV2,
  activatePreparedV2Dataset,
  createPreparedDatasetFromDryRun,
  readBackAndValidateV2Dataset,
} from "../persistence/activation-engine";
import {
  V05_IMPORT_SOURCE_TYPES,
  type V05BatchImportInput,
  type V05BatchImportResult,
  type V05FileFingerprint,
} from "./contracts";
import { sha256File } from "./hash";
import { buildV05TmallImportCandidate } from "./tmall-import-mapper";
import {
  countV05DatasetRecords,
  mergeV05ImportCandidateIntoActiveDataset,
} from "./dataset-merge";

const nowIso = (): string => new Date().toISOString();

const issueCodesOf = (issues: Array<{ code?: string }>): string[] =>
  Array.from(new Set(issues.map((issue) => issue.code).filter((code): code is string => !!code))).sort();

const failedResult = ({
  status,
  message,
  input,
  issueCodes = [],
  importBatchId = null,
  datasetId = null,
  legacyMigrationStatus = null,
}: {
  status: V05BatchImportResult["status"];
  message: string;
  input: V05BatchImportInput;
  issueCodes?: string[];
  importBatchId?: string | null;
  datasetId?: string | null;
  legacyMigrationStatus?: string | null;
}): V05BatchImportResult => ({
  status,
  message,
  platformCode: input.platformCode,
  storeId: input.store.storeId,
  storeName: input.store.storeName,
  importBatchId,
  datasetId,
  previousDatasetId: null,
  analysisTimestamp: null,
  sourceCount: V05_IMPORT_SOURCE_TYPES.length,
  parsedSourceCount: 0,
  recordCounts: emptyRecordCounts(),
  issueCodes,
  legacyCompatibilitySaved: false,
  legacyMigrationStatus,
  prepareStatus: null,
  readBackStatus: null,
  activationStatus: null,
});

const hasLegacyAnalysis = (storage: Storage | null | undefined): boolean =>
  !!storage?.getItem(LEGACY_ANALYSIS_KEY);

const calculateFileFingerprints = async (
  filesBySourceType: Record<TmallSourceType, File>,
): Promise<V05FileFingerprint[]> =>
  Promise.all(
    V05_IMPORT_SOURCE_TYPES.map(async (sourceType) => ({
      sourceType,
      fileFingerprint: await sha256File(filesBySourceType[sourceType]),
    })),
  );

const runAnalysis = (
  filesBySourceType: Record<TmallSourceType, File>,
): Promise<TmallFourSourceAnalysisResult> =>
  runTmallFourSourceAnalysis({
    businessProductFile: filesBySourceType.business_product,
    adProductFile: filesBySourceType.ad_product,
    adPlanFile: filesBySourceType.ad_plan,
    afterSalesFile: filesBySourceType.after_sales,
  });

export const executeV05TmallBatchImport = async (
  input: V05BatchImportInput,
): Promise<V05BatchImportResult> => {
  const capturedAt = input.now?.() ?? nowIso();
  if (input.platformCode !== "tmall" || input.store.platformCode !== "tmall") {
    return failedResult({
      status: "blocked",
      message: "当前仅开放天猫批量导入。",
      input,
      issueCodes: ["platform_not_open"],
    });
  }

  const missingSourceTypes = V05_IMPORT_SOURCE_TYPES.filter((sourceType) => !input.filesBySourceType[sourceType]);
  if (missingSourceTypes.length > 0) {
    return failedResult({
      status: "blocked",
      message: "四类报表必须完整识别后才能导入。",
      input,
      issueCodes: ["missing_required_source"],
    });
  }

  let legacyMigrationStatus: string | null = null;
  let activeDataset = await input.persistenceStore.loadActiveDataset();
  let activePointer = await input.persistenceStore.getActivePointer();

  if (!activeDataset && hasLegacyAnalysis(input.legacyStorage)) {
    const legacy = await activateLegacySnapshotToV2({
      snapshot: captureLegacyStorageSnapshot({
        storage: input.legacyStorage!,
        capturedAt,
      }),
      store: input.persistenceStore,
      preparedAt: capturedAt,
      readBackAt: capturedAt,
      activatedAt: capturedAt,
      expectedCurrentDatasetId: null,
    });
    legacyMigrationStatus = legacy.status;
    if (legacy.status !== "activated" && legacy.status !== "already_active") {
      return failedResult({
        status: "blocked",
        message: "旧版本地数据尚未通过只读迁移校验，请先保留旧数据并处理迁移问题。",
        input,
        issueCodes: issueCodesOf(legacy.issues),
        legacyMigrationStatus,
      });
    }
    activeDataset = await input.persistenceStore.loadActiveDataset();
    activePointer = await input.persistenceStore.getActivePointer();
  }

  const fileFingerprints = await calculateFileFingerprints(input.filesBySourceType);
  const analysis = await runAnalysis(input.filesBySourceType);
  const candidate = await buildV05TmallImportCandidate({
    analysis,
    store: input.store,
    fileFingerprints,
    capturedAt,
  });

  if (candidate.dryRun.status !== "ready" || !candidate.dryRun.futureActivationEligible) {
    return failedResult({
      status: "blocked",
      message: "本次导入候选数据未通过 V2 安全校验。",
      input,
      issueCodes: issueCodesOf(candidate.dryRun.issues),
      importBatchId: candidate.importBatchId,
      datasetId: candidate.dataset.datasetId,
      legacyMigrationStatus,
    });
  }

  const merged = await mergeV05ImportCandidateIntoActiveDataset(activeDataset, candidate);
  if (merged.merge.status === "already_imported") {
    return {
      status: "already_imported",
      message: "这批文件已经导入过，本次未重复写入。",
      platformCode: input.platformCode,
      storeId: input.store.storeId,
      storeName: input.store.storeName,
      importBatchId: candidate.importBatchId,
      datasetId: activeDataset?.datasetId ?? null,
      previousDatasetId: activeDataset?.datasetId ?? null,
      analysisTimestamp: analysis.analysisTimestamp,
      sourceCount: V05_IMPORT_SOURCE_TYPES.length,
      parsedSourceCount: V05_IMPORT_SOURCE_TYPES.length,
      recordCounts: countV05DatasetRecords(activeDataset),
      issueCodes: [],
      legacyCompatibilitySaved: false,
      legacyMigrationStatus,
      prepareStatus: null,
      readBackStatus: null,
      activationStatus: null,
    };
  }

  if (merged.merge.status === "conflict" || !merged.dryRun) {
    return failedResult({
      status: "conflict",
      message: "本次数据与已激活数据存在同 key 不同内容冲突，未改变当前数据。",
      input,
      issueCodes: merged.merge.issueCodes,
      importBatchId: candidate.importBatchId,
      legacyMigrationStatus,
    });
  }

  const validation = validateV2Dataset(merged.dryRun.stagingDataset!);
  if (!validation.valid) {
    return failedResult({
      status: "blocked",
      message: "合并后的 V2 数据集未通过结构校验。",
      input,
      issueCodes: issueCodesOf(validation.issues),
      importBatchId: candidate.importBatchId,
      datasetId: merged.dryRun.stagingDataset?.datasetId ?? null,
      legacyMigrationStatus,
    });
  }

  const prepared = createPreparedDatasetFromDryRun(merged.dryRun, capturedAt);
  if (prepared.status !== "prepared" || !prepared.data) {
    return failedResult({
      status: "failed",
      message: "V2 staging 准备失败，未激活新数据。",
      input,
      issueCodes: issueCodesOf(prepared.issues),
      importBatchId: candidate.importBatchId,
      datasetId: merged.dryRun.stagingDataset?.datasetId ?? null,
      legacyMigrationStatus,
    });
  }

  const write = await input.persistenceStore.prepareDataset(prepared.data);
  if (write.status !== "prepared") {
    return failedResult({
      status: "failed",
      message: "写入 V2 staging 失败，未激活新数据。",
      input,
      issueCodes: issueCodesOf(write.issues),
      importBatchId: candidate.importBatchId,
      datasetId: prepared.data.dataset.datasetId,
      legacyMigrationStatus,
    });
  }

  const readBack = await readBackAndValidateV2Dataset({
    store: input.persistenceStore,
    datasetId: prepared.data.dataset.datasetId,
    validatedAt: capturedAt,
    expectedRecordCounts: prepared.data.metadata.recordCounts,
    expectedBusinessDatasetFingerprint: prepared.data.metadata.businessDatasetFingerprint,
    expectedManifestFingerprint: prepared.data.metadata.manifestFingerprint,
    expectedRecordKeys: prepared.data.recordKeys,
  });
  if (readBack.status !== "readback_validated" || !readBack.data) {
    return failedResult({
      status: "failed",
      message: "V2 readback 校验失败，未激活新数据。",
      input,
      issueCodes: issueCodesOf(readBack.issues),
      importBatchId: candidate.importBatchId,
      datasetId: prepared.data.dataset.datasetId,
      legacyMigrationStatus,
    });
  }

  const activation = await activatePreparedV2Dataset({
    store: input.persistenceStore,
    datasetId: prepared.data.dataset.datasetId,
    expectedCurrentDatasetId: activePointer?.datasetId ?? null,
    activatedAt: capturedAt,
  });
  if (activation.status !== "activated" && activation.status !== "already_active") {
    return failedResult({
      status: activation.status === "conflict" ? "conflict" : "failed",
      message: "V2 激活失败，当前 active pointer 未改变。",
      input,
      issueCodes: issueCodesOf(activation.issues),
      importBatchId: candidate.importBatchId,
      datasetId: prepared.data.dataset.datasetId,
      legacyMigrationStatus,
    });
  }

  let legacyCompatibilitySaved = false;
  if (input.store.storeId === DEFAULT_TMAIL_OWNER.storeId && input.compatibilityWriter) {
    input.compatibilityWriter(analysis);
    legacyCompatibilitySaved = true;
  }

  return {
    status: "success",
    message: "导入完成，V2 数据集已激活。",
    platformCode: input.platformCode,
    storeId: input.store.storeId,
    storeName: input.store.storeName,
    importBatchId: candidate.importBatchId,
    datasetId: prepared.data.dataset.datasetId,
    previousDatasetId: activePointer?.datasetId ?? null,
    analysisTimestamp: analysis.analysisTimestamp,
    sourceCount: V05_IMPORT_SOURCE_TYPES.length,
    parsedSourceCount: V05_IMPORT_SOURCE_TYPES.length,
    recordCounts: prepared.data.metadata.recordCounts,
    issueCodes: prepared.data.metadata.safeIssueCodes,
    legacyCompatibilitySaved,
    legacyMigrationStatus,
    prepareStatus: write.status,
    readBackStatus: readBack.data,
    activationStatus: activation.data,
  };
};
