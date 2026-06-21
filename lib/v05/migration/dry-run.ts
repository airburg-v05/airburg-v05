import { parseTmallStoredAnalysisResult } from "../../storage/tmall-analysis-validator";
import {
  V2_MIGRATION_VERSION,
  V2_SCHEMA_VERSION,
  type MigrationManifest,
  type OwnedAdProductFact,
  type V2Dataset,
} from "../domain/models";
import { validateV2Dataset } from "../validation/dataset";
import { createMemoryV2RepositoryBundle } from "../repositories/memory-adapter";
import { mapTmallAnalysisToV2 } from "./analysis-mapper";
import {
  LEGACY_ANALYSIS_KEY,
  LEGACY_SERIES_KEY,
  LEGACY_STORAGE_KEYS,
  LEGACY_TARGETS_KEY,
  DEFAULT_TMAIL_OWNER,
  countStagingDatasetRecords,
  createDryRunIssue,
  emptyRecordCounts,
  toDryRunIssue,
  type DryRunIssue,
  type DryRunMigrationManifest,
  type DryRunStatus,
  type LegacyHashSummary,
  type LegacyMigrationDryRunInput,
  type LegacyMigrationDryRunResult,
  type LegacyStorageSnapshot,
  type RejectedLegacyRecord,
  type SourceDryRunSummary,
  type V2StagingDataset,
} from "./contracts";
import {
  createBusinessDatasetFingerprintPayload,
  createWebCryptoLegacyValueHasher,
  createManifestFingerprintPayload,
  hashLegacyValue,
  hashStableFingerprintPayload,
} from "./hash";
import {
  summarizeIgnoredLegacyKeys,
  summarizeLegacyKeys,
  validateLegacyStorageSnapshot,
} from "./legacy-snapshot";
import { mapLegacySeriesGroupsToV2 } from "./series-mapper";
import { mapLegacyTargetsToV2 } from "./target-mapper";

const SOURCE_TYPES = ["business_product", "ad_product", "ad_plan", "after_sales"] as const;

const emptySourceSummary = (): SourceDryRunSummary[] =>
  SOURCE_TYPES.map((sourceType) => ({
    sourceType,
    status: "missing",
    rowCount: 0,
    headerRowNumber: null,
    importFileId: null,
    safeWarningCodeCount: 0,
    unmappedSafeAggregateSummary: [],
  }));

const hasBusinessLegacyValue = (snapshot: LegacyStorageSnapshot): boolean =>
  snapshot.values[LEGACY_ANALYSIS_KEY] !== null ||
  snapshot.values[LEGACY_SERIES_KEY] !== null ||
  snapshot.values[LEGACY_TARGETS_KEY] !== null;

const getHash = (hashes: LegacyHashSummary[], key: typeof LEGACY_STORAGE_KEYS[number]): string | null =>
  hashes.find((item) => item.key === key)?.valueHash ?? null;

const buildId = (
  prefix: string,
  hash: string,
  migrationVersion: string,
): string =>
  [
    prefix,
    hash.slice(0, 24),
    encodeURIComponent(migrationVersion).replace(/%/g, "~"),
  ].join("_");

const safeIssueCodes = (issues: DryRunIssue[]): string[] =>
  Array.from(new Set(issues.map((issue) => issue.code))).sort();

const containsBlockingIssue = (issues: DryRunIssue[]): boolean =>
  issues.some((issue) => issue.severity === "error");

const buildManifestRecord = (
  migrationManifestId: string,
  migrationVersion: string,
  importBatchId: string,
  legacyValueHash: string,
  capturedAt: string,
  issues: DryRunIssue[],
): MigrationManifest => ({
  schemaVersion: V2_SCHEMA_VERSION,
  migrationManifestId,
  migrationVersion,
  status: "pending",
  migratedFromKeys: [...LEGACY_STORAGE_KEYS],
  importBatchId,
  legacyValueHash,
  startedAt: capturedAt,
  completedAt: null,
  safeIssueCodes: safeIssueCodes(issues),
});

const buildManifestCandidate = (
  manifest: MigrationManifest,
  stagingDatasetId: string | null,
  status: DryRunStatus,
  futureActivationEligible: boolean,
): DryRunMigrationManifest => ({
  ...manifest,
  status: status === "ready"
    ? "dry_run_ready"
    : status === "ready_partial"
      ? "dry_run_partial"
      : status === "blocked"
        ? "dry_run_blocked"
        : "dry_run_failed",
  stagingDatasetId,
  futureActivationEligible,
});

const emptyResult = (
  snapshot: LegacyStorageSnapshot | null,
  hashes: LegacyHashSummary[],
  issues: DryRunIssue[],
  status: DryRunStatus,
  migrationVersion: string,
  businessDatasetFingerprint: string | null = null,
  manifestFingerprint: string | null = null,
): LegacyMigrationDryRunResult => ({
  status,
  futureActivationEligible: false,
  migrationVersion,
  defaultOwner: DEFAULT_TMAIL_OWNER,
  businessDatasetFingerprint,
  manifestFingerprint,
  stagingDataset: null,
  manifestCandidate: null,
  proposedActiveDatasetPointer: null,
  legacyKeySummary: snapshot ? summarizeLegacyKeys(snapshot, hashes) : [],
  sourceSummary: emptySourceSummary(),
  recordCounts: emptyRecordCounts(),
  rejectedRecords: [],
  ignoredLegacyKeys: snapshot ? summarizeIgnoredLegacyKeys(snapshot) : [],
  issues,
});

const mapValidationIssues = (issues: ReturnType<typeof validateV2Dataset>["issues"]): DryRunIssue[] =>
  issues.map(toDryRunIssue);

const isIndependentAdProductReferenceIssue = (issue: DryRunIssue): boolean =>
  issue.code === "reference_missing" && issue.path.startsWith("adProductFacts[");

const downgradeIndependentAdProductReferenceIssue = (issue: DryRunIssue): DryRunIssue =>
  createDryRunIssue(
    "reference_missing",
    issue.path,
    "Ad product source fact has no matching business product fact and is kept as an independent source fact candidate.",
    "warning",
    issue.details,
  );

const validateWithMemoryRepository = async (
  stagingDataset: V2StagingDataset,
): Promise<DryRunIssue[]> => {
  const issues: DryRunIssue[] = [];
  const repository = createMemoryV2RepositoryBundle();

  const insertResults = await Promise.all([
    repository.platforms.insertMany(stagingDataset.platforms),
    repository.stores.insertMany(stagingDataset.stores),
    repository.importBatches.insertMany(stagingDataset.importBatches),
    repository.importFiles.insertMany(stagingDataset.importFiles),
    repository.businessProductFacts.insertMany(stagingDataset.businessProductFacts),
    repository.adProductFacts.insertMany(stagingDataset.adProductFacts),
    repository.adPlanFacts.insertMany(stagingDataset.adPlanFacts),
    repository.afterSalesDailyAggregates.insertMany(stagingDataset.afterSalesDailyAggregates),
    repository.afterSalesRangeAggregates.insertMany(stagingDataset.afterSalesRangeAggregates),
    repository.series.insertMany(stagingDataset.series),
    repository.trackedProducts.insertMany(stagingDataset.trackedProducts),
    repository.targets.insertMany(stagingDataset.targets),
  ]);

  insertResults.forEach((result, index) => {
    if (result.status !== "success") {
      issues.push(
        createDryRunIssue(
          "memory_validation_failed",
          `stagingDataset.repositoryInsert[${index}]`,
          "Memory repository rejected a staging record group.",
          "error",
          { issueCount: result.issues.length },
        ),
      );
    }
  });

  const exported = repository.exportDataset();
  if (exported.activeDatasetPointer !== null) {
    issues.push(
      createDryRunIssue(
        "migration_state_invalid",
        "stagingDataset.activeDatasetPointer",
        "Dry-run repository export must not create an active dataset pointer.",
      ),
    );
  }

  if (stagingDataset.businessProductFacts.length > 0) {
    const duplicate = await repository.businessProductFacts.insert(stagingDataset.businessProductFacts[0]!);
    if (duplicate.status !== "conflict") {
      issues.push(
        createDryRunIssue(
          "duplicate_key",
          "businessProductFacts[0]",
          "Memory repository must reject duplicate fact insertion.",
        ),
      );
    }

    const firstRead = await repository.businessProductFacts.list(DEFAULT_TMAIL_OWNER);
    if (firstRead.data?.[0]) {
      firstRead.data[0].productId = "__mutation_probe__";
      const secondRead = await repository.businessProductFacts.list(DEFAULT_TMAIL_OWNER);
      if (secondRead.data?.some((fact) => fact.productId === "__mutation_probe__")) {
        issues.push(
          createDryRunIssue(
            "memory_validation_failed",
            "businessProductFacts",
            "Memory repository reads must not mutate stored records.",
          ),
        );
      }
    }
  }

  if (stagingDataset.adPlanFacts.length > 0) {
    const planAsProduct = stagingDataset.adPlanFacts[0] as unknown as OwnedAdProductFact;
    const wrongRepository = await repository.adProductFacts.insert(planAsProduct);
    if (wrongRepository.status !== "validation_error") {
      issues.push(
        createDryRunIssue(
          "source_type_mismatch",
          "adPlanFacts[0]",
          "Plan facts must not be accepted by the product ad repository.",
        ),
      );
    }
  }

  return issues;
};

export const runLegacyStorageV2DryRunMigration = async (
  input: LegacyMigrationDryRunInput,
): Promise<LegacyMigrationDryRunResult> => {
  const migrationVersion = input.migrationVersion ?? V2_MIGRATION_VERSION;
  const snapshotValidation = validateLegacyStorageSnapshot(input.snapshot);
  const snapshot = snapshotValidation.snapshot;

  if (!snapshotValidation.valid || !snapshot) {
    return emptyResult(null, [], snapshotValidation.issues, "migration_failed", migrationVersion);
  }

  const hasher = input.hasher ?? createWebCryptoLegacyValueHasher();
  const hashes: LegacyHashSummary[] = [];
  const hashIssues: DryRunIssue[] = [];
  for (const key of LEGACY_STORAGE_KEYS) {
    const hashResult = await hashLegacyValue(key, snapshot.values[key], hasher);
    hashes.push({ key, valueHash: hashResult.valueHash });
    hashIssues.push(...hashResult.issues);
  }

  if (hashIssues.length > 0) {
    return emptyResult(snapshot, hashes, hashIssues, "migration_failed", migrationVersion);
  }

  const businessFingerprintResult = await hashStableFingerprintPayload(
    createBusinessDatasetFingerprintPayload(hashes),
    hasher,
  );
  const manifestFingerprintResult = await hashStableFingerprintPayload(
    createManifestFingerprintPayload(hashes),
    hasher,
  );
  const fingerprintIssues = [
    ...businessFingerprintResult.issues,
    ...manifestFingerprintResult.issues,
  ];
  if (
    fingerprintIssues.length > 0 ||
    !businessFingerprintResult.fingerprint ||
    !manifestFingerprintResult.fingerprint
  ) {
    return emptyResult(
      snapshot,
      hashes,
      fingerprintIssues,
      "migration_failed",
      migrationVersion,
      businessFingerprintResult.fingerprint,
      manifestFingerprintResult.fingerprint,
    );
  }

  const businessDatasetFingerprint = businessFingerprintResult.fingerprint;
  const manifestFingerprint = manifestFingerprintResult.fingerprint;

  if (!hasBusinessLegacyValue(snapshot)) {
    return emptyResult(
      snapshot,
      hashes,
      [],
      "empty",
      migrationVersion,
      businessDatasetFingerprint,
      manifestFingerprint,
    );
  }

  const rawAnalysis = snapshot.values[LEGACY_ANALYSIS_KEY];
  if (rawAnalysis === null) {
    return emptyResult(
      snapshot,
      hashes,
      [
        createDryRunIssue(
          "required_field",
          LEGACY_ANALYSIS_KEY,
          "Legacy analysis result is required before series or target data can dry-run migrate.",
        ),
      ],
      "blocked",
      migrationVersion,
      businessDatasetFingerprint,
      manifestFingerprint,
    );
  }

  const parsedAnalysis = parseTmallStoredAnalysisResult(rawAnalysis);
  if (parsedAnalysis.status === "corrupted" || !parsedAnalysis.result) {
    return emptyResult(
      snapshot,
      hashes,
      [
        createDryRunIssue(
          "legacy_parse_failed",
          LEGACY_ANALYSIS_KEY,
          "Legacy analysis result could not be parsed safely.",
        ),
      ],
      "migration_failed",
      migrationVersion,
      businessDatasetFingerprint,
      manifestFingerprint,
    );
  }

  const analysisHash = getHash(hashes, LEGACY_ANALYSIS_KEY);
  if (!analysisHash) {
    return emptyResult(
      snapshot,
      hashes,
      [
        createDryRunIssue(
          "hash_provider_unavailable",
          LEGACY_ANALYSIS_KEY,
          "Legacy analysis hash is required for deterministic dry-run ids.",
        ),
      ],
      "migration_failed",
      migrationVersion,
      businessDatasetFingerprint,
      manifestFingerprint,
    );
  }

  const analysis = mapTmallAnalysisToV2({
    analysis: parsedAnalysis.result,
    analysisHash,
    capturedAt: snapshot.capturedAt,
    migrationVersion,
  });
  const series = mapLegacySeriesGroupsToV2({
    rawValue: snapshot.values[LEGACY_SERIES_KEY],
    capturedAt: snapshot.capturedAt,
    availableProductIds: analysis.productIds,
  });
  const target = mapLegacyTargetsToV2({
    rawValue: snapshot.values[LEGACY_TARGETS_KEY],
    availableProductIds: analysis.productIds,
    availableSeriesIds: new Set(series.series.map((item) => item.seriesId)),
  });

  const issues: DryRunIssue[] = [
    ...analysis.issues,
    ...series.issues,
    ...target.issues,
  ];
  const rejectedRecords: RejectedLegacyRecord[] = [
    ...analysis.rejectedRecords,
    ...series.rejectedRecords,
    ...target.rejectedRecords,
  ];

  const stagingDatasetId = buildId("legacy_staging_dataset", businessDatasetFingerprint, migrationVersion);
  const migrationManifestId = buildId("legacy_migration_manifest", manifestFingerprint, migrationVersion);
  const manifestRecord = buildManifestRecord(
    migrationManifestId,
    migrationVersion,
    analysis.importBatch.importBatchId,
    manifestFingerprint,
    snapshot.capturedAt,
    issues,
  );

  const stagingDataset: V2StagingDataset = {
    schemaVersion: V2_SCHEMA_VERSION,
    datasetId: stagingDatasetId,
    platforms: [analysis.platform],
    stores: [analysis.store],
    importBatches: [analysis.importBatch],
    importFiles: analysis.importFiles,
    businessProductFacts: analysis.businessProductFacts,
    adProductFacts: analysis.adProductFacts,
    adPlanFacts: analysis.adPlanFacts,
    afterSalesDailyAggregates: analysis.afterSalesDailyAggregates,
    afterSalesRangeAggregates: analysis.afterSalesRangeAggregates,
    series: series.series,
    trackedProducts: [],
    targets: target.targets,
    legacyTargetCandidates: target.legacyTargetCandidates,
    migrationManifests: [manifestRecord],
    activeDatasetPointer: null,
  };

  const datasetValidation = validateV2Dataset(stagingDataset as V2Dataset);
  const validationIssues = mapValidationIssues(datasetValidation.issues);
  const blockingValidationIssues = validationIssues.filter(
    (issue) => !isIndependentAdProductReferenceIssue(issue),
  );
  const downgradedValidationIssues = validationIssues
    .filter(isIndependentAdProductReferenceIssue)
    .map(downgradeIndependentAdProductReferenceIssue);
  issues.push(...downgradedValidationIssues);

  if (blockingValidationIssues.some((issue) => issue.severity === "error")) {
    return {
      status: "migration_failed",
      futureActivationEligible: false,
      migrationVersion,
      defaultOwner: DEFAULT_TMAIL_OWNER,
      businessDatasetFingerprint,
      manifestFingerprint,
      stagingDataset: null,
      manifestCandidate: buildManifestCandidate(
        manifestRecord,
        null,
        "migration_failed",
        false,
      ),
      proposedActiveDatasetPointer: null,
      legacyKeySummary: summarizeLegacyKeys(snapshot, hashes),
      sourceSummary: analysis.sourceSummary,
      recordCounts: emptyRecordCounts(),
      rejectedRecords,
      ignoredLegacyKeys: summarizeIgnoredLegacyKeys(snapshot),
      issues: [...issues, ...blockingValidationIssues],
    };
  }

  const memoryIssues = await validateWithMemoryRepository(stagingDataset);
  if (memoryIssues.some((issue) => issue.severity === "error")) {
    return {
      status: "migration_failed",
      futureActivationEligible: false,
      migrationVersion,
      defaultOwner: DEFAULT_TMAIL_OWNER,
      businessDatasetFingerprint,
      manifestFingerprint,
      stagingDataset: null,
      manifestCandidate: buildManifestCandidate(
        manifestRecord,
        null,
        "migration_failed",
        false,
      ),
      proposedActiveDatasetPointer: null,
      legacyKeySummary: summarizeLegacyKeys(snapshot, hashes),
      sourceSummary: analysis.sourceSummary,
      recordCounts: emptyRecordCounts(),
      rejectedRecords,
      ignoredLegacyKeys: summarizeIgnoredLegacyKeys(snapshot),
      issues: [...issues, ...memoryIssues],
    };
  }

  const status: DryRunStatus = containsBlockingIssue(issues)
    ? "blocked"
    : analysis.parsedSourceCount === analysis.sourceCount
      ? "ready"
      : "ready_partial";
  const futureActivationEligible = status === "ready";
  manifestRecord.safeIssueCodes = safeIssueCodes(issues);

  return {
    status,
    futureActivationEligible,
    migrationVersion,
    defaultOwner: DEFAULT_TMAIL_OWNER,
    businessDatasetFingerprint,
    manifestFingerprint,
    stagingDataset,
    manifestCandidate: buildManifestCandidate(
      manifestRecord,
      stagingDatasetId,
      status,
      futureActivationEligible,
    ),
    proposedActiveDatasetPointer: null,
    legacyKeySummary: summarizeLegacyKeys(snapshot, hashes),
    sourceSummary: analysis.sourceSummary,
    recordCounts: countStagingDatasetRecords(stagingDataset),
    rejectedRecords,
    ignoredLegacyKeys: summarizeIgnoredLegacyKeys(snapshot),
    issues,
  };
};
