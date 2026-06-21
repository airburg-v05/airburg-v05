import type {
  ImportBatchRecord,
  ImportFileRecord,
  OwnedAdPlanFact,
  OwnedAdProductFact,
  OwnedAfterSalesDailyAggregate,
  OwnedAfterSalesRangeAggregate,
  OwnedBusinessProductFact,
  PlatformRecord,
  SeriesRecord,
  StoreRecord,
  StoreScope,
  TargetRecord,
  TrackedProductRecord,
  V2Dataset,
} from "../domain/models";
import {
  buildAdPlanFactKey,
  buildAdProductFactKey,
  buildAfterSalesDailyAggregateKey,
  buildAfterSalesRangeAggregateKey,
  buildBusinessProductFactKey,
  buildImportBatchKey,
  buildImportFileKey,
  buildSeriesKey,
  buildStoreKey,
  buildTargetRecordKey,
  buildTrackedProductKey,
} from "../domain/keys";
import {
  repositoryConflict,
  repositoryEmpty,
  repositoryNotFound,
  repositorySuccess,
  repositoryValidationError,
  type RepositoryResult,
  type ValidationResult,
} from "../domain/results";
import { validateV2Dataset } from "../validation/dataset";
import {
  validateImportBatchRecord,
  validateImportFileRecord,
  validateOwnedAdPlanFact,
  validateOwnedAdProductFact,
  validateOwnedAfterSalesDailyAggregate,
  validateOwnedAfterSalesRangeAggregate,
  validateOwnedBusinessProductFact,
  validatePlatformRecord,
  validateSeriesRecord,
  validateStoreRecord,
  validateTargetRecord,
  validateTrackedProductRecord,
} from "../validation/records";
import type {
  AdPlanFactRepository,
  AdProductFactRepository,
  AfterSalesDailyAggregateRepository,
  AfterSalesRangeAggregateRepository,
  BusinessProductFactRepository,
  ImportBatchRepository,
  ImportFileRepository,
  PlatformRepository,
  SeriesRepository,
  StoreRepository,
  TargetRepository,
  TrackedProductRepository,
  V2RecordRepository,
  V2RepositoryBundle,
} from "./contracts";

type KeyBuilder<TRecord> = (record: TRecord) => string;
type RecordValidator<TRecord> = (record: TRecord) => ValidationResult;

interface ScopedRecord {
  platformCode: StoreScope["platformCode"];
  storeId: string;
}

const cloneRecord = <TRecord>(record: TRecord): TRecord =>
  JSON.parse(JSON.stringify(record)) as TRecord;

const matchesScope = (record: ScopedRecord, scope: StoreScope): boolean =>
  record.platformCode === scope.platformCode && record.storeId === scope.storeId;

class MemoryRecordRepository<TRecord> implements V2RecordRepository<TRecord> {
  protected readonly records = new Map<string, TRecord>();

  constructor(
    protected readonly buildKey: KeyBuilder<TRecord>,
    protected readonly validateRecord: RecordValidator<TRecord>,
  ) {}

  async get(key: string): Promise<RepositoryResult<TRecord>> {
    const record = this.records.get(key);
    return record ? repositorySuccess(cloneRecord(record)) : repositoryNotFound(key);
  }

  async insert(record: TRecord): Promise<RepositoryResult<TRecord>> {
    const validation = this.validateRecord(record);
    if (!validation.valid) return repositoryValidationError(validation.issues);

    const key = this.buildKey(record);
    if (this.records.has(key)) return repositoryConflict(key);

    this.records.set(key, cloneRecord(record));
    return repositorySuccess(cloneRecord(record));
  }

  async insertMany(records: TRecord[]): Promise<RepositoryResult<TRecord[]>> {
    const staged = new Map<string, TRecord>();
    const issues = records.flatMap((record) => this.validateRecord(record).issues);
    if (issues.some((issue) => issue.severity === "error")) return repositoryValidationError(issues);

    for (const record of records) {
      const key = this.buildKey(record);
      if (this.records.has(key) || staged.has(key)) return repositoryConflict(key);
      staged.set(key, cloneRecord(record));
    }

    staged.forEach((record, key) => this.records.set(key, record));
    return repositorySuccess(records.map(cloneRecord));
  }

  async replace(record: TRecord): Promise<RepositoryResult<TRecord>> {
    const validation = this.validateRecord(record);
    if (!validation.valid) return repositoryValidationError(validation.issues);

    const key = this.buildKey(record);
    if (!this.records.has(key)) return repositoryNotFound(key);

    this.records.set(key, cloneRecord(record));
    return repositorySuccess(cloneRecord(record));
  }

  protected listAll(): TRecord[] {
    return [...this.records.values()].map(cloneRecord);
  }

  snapshot(): TRecord[] {
    return this.listAll();
  }
}

class MemoryPlatformRepository
  extends MemoryRecordRepository<PlatformRecord>
  implements PlatformRepository {
  async list(): Promise<RepositoryResult<PlatformRecord[]>> {
    const records = this.listAll();
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }
}

class MemoryStoreRepository extends MemoryRecordRepository<StoreRecord> implements StoreRepository {
  async list(): Promise<RepositoryResult<StoreRecord[]>> {
    const records = this.listAll();
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }

  async listByPlatform(platformCode: StoreScope["platformCode"]): Promise<RepositoryResult<StoreRecord[]>> {
    const records = this.listAll().filter((record) => record.platformCode === platformCode);
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }
}

class MemoryScopedRepository<TRecord extends ScopedRecord> extends MemoryRecordRepository<TRecord> {
  async list(scope: StoreScope): Promise<RepositoryResult<TRecord[]>> {
    const records = this.listAll().filter((record) => matchesScope(record, scope));
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }
}

class MemoryTargetRepository
  extends MemoryRecordRepository<TargetRecord>
  implements TargetRepository {
  async listCompany(): Promise<RepositoryResult<TargetRecord[]>> {
    const records = this.listAll().filter((record) => record.scope === "company");
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }

  async list(scope: StoreScope): Promise<RepositoryResult<TargetRecord[]>> {
    const records = this.listAll().filter(
      (record) =>
        record.scope !== "company" &&
        record.platformCode === scope.platformCode &&
        record.storeId === scope.storeId,
    );
    return records.length ? repositorySuccess(records) : repositoryEmpty();
  }
}

export interface MemoryV2RepositoryBundle extends V2RepositoryBundle {
  seedValidation: ValidationResult;
  exportDataset(): V2Dataset;
}

export const createMemoryV2RepositoryBundle = (seed?: V2Dataset): MemoryV2RepositoryBundle => {
  const platforms = new MemoryPlatformRepository((record) => record.platformCode, validatePlatformRecord);
  const stores = new MemoryStoreRepository(buildStoreKey, validateStoreRecord);
  const importBatches = new MemoryScopedRepository<ImportBatchRecord>(
    buildImportBatchKey,
    validateImportBatchRecord,
  ) as MemoryScopedRepository<ImportBatchRecord> & ImportBatchRepository;
  const importFiles = new MemoryScopedRepository<ImportFileRecord>(
    buildImportFileKey,
    validateImportFileRecord,
  ) as MemoryScopedRepository<ImportFileRecord> & ImportFileRepository;
  const businessProductFacts = new MemoryScopedRepository<OwnedBusinessProductFact>(
    buildBusinessProductFactKey,
    validateOwnedBusinessProductFact,
  ) as MemoryScopedRepository<OwnedBusinessProductFact> & BusinessProductFactRepository;
  const adProductFacts = new MemoryScopedRepository<OwnedAdProductFact>(
    buildAdProductFactKey,
    validateOwnedAdProductFact,
  ) as MemoryScopedRepository<OwnedAdProductFact> & AdProductFactRepository;
  const adPlanFacts = new MemoryScopedRepository<OwnedAdPlanFact>(
    buildAdPlanFactKey,
    validateOwnedAdPlanFact,
  ) as MemoryScopedRepository<OwnedAdPlanFact> & AdPlanFactRepository;
  const afterSalesDailyAggregates = new MemoryScopedRepository<OwnedAfterSalesDailyAggregate>(
    buildAfterSalesDailyAggregateKey,
    validateOwnedAfterSalesDailyAggregate,
  ) as MemoryScopedRepository<OwnedAfterSalesDailyAggregate> & AfterSalesDailyAggregateRepository;
  const afterSalesRangeAggregates = new MemoryScopedRepository<OwnedAfterSalesRangeAggregate>(
    buildAfterSalesRangeAggregateKey,
    validateOwnedAfterSalesRangeAggregate,
  ) as MemoryScopedRepository<OwnedAfterSalesRangeAggregate> & AfterSalesRangeAggregateRepository;
  const series = new MemoryScopedRepository<SeriesRecord>(
    buildSeriesKey,
    validateSeriesRecord,
  ) as MemoryScopedRepository<SeriesRecord> & SeriesRepository;
  const trackedProducts = new MemoryScopedRepository<TrackedProductRecord>(
    buildTrackedProductKey,
    validateTrackedProductRecord,
  ) as MemoryScopedRepository<TrackedProductRecord> & TrackedProductRepository;
  const targets = new MemoryTargetRepository(buildTargetRecordKey, validateTargetRecord);

  const seedValidation = seed ? validateV2Dataset(seed) : { valid: true, issues: [] };

  if (seed && seedValidation.valid) {
    void platforms.insertMany(seed.platforms);
    void stores.insertMany(seed.stores);
    void importBatches.insertMany(seed.importBatches);
    void importFiles.insertMany(seed.importFiles);
    void businessProductFacts.insertMany(seed.businessProductFacts);
    void adProductFacts.insertMany(seed.adProductFacts);
    void adPlanFacts.insertMany(seed.adPlanFacts);
    void afterSalesDailyAggregates.insertMany(seed.afterSalesDailyAggregates);
    void afterSalesRangeAggregates.insertMany(seed.afterSalesRangeAggregates);
    void series.insertMany(seed.series);
    void trackedProducts.insertMany(seed.trackedProducts);
    void targets.insertMany(seed.targets);
  }

  return {
    platforms,
    stores,
    importBatches,
    importFiles,
    businessProductFacts,
    adProductFacts,
    adPlanFacts,
    afterSalesDailyAggregates,
    afterSalesRangeAggregates,
    series,
    trackedProducts,
    targets,
    seedValidation,
    exportDataset: () => ({
      schemaVersion: seed?.schemaVersion ?? "airburg_storage_v2",
      datasetId: seed?.datasetId ?? "memory-dataset",
      platforms: platforms.snapshot(),
      stores: stores.snapshot(),
      importBatches: importBatches.snapshot(),
      importFiles: importFiles.snapshot(),
      businessProductFacts: businessProductFacts.snapshot(),
      adProductFacts: adProductFacts.snapshot(),
      adPlanFacts: adPlanFacts.snapshot(),
      afterSalesDailyAggregates: afterSalesDailyAggregates.snapshot(),
      afterSalesRangeAggregates: afterSalesRangeAggregates.snapshot(),
      series: series.snapshot(),
      trackedProducts: trackedProducts.snapshot(),
      targets: targets.snapshot(),
      legacyTargetCandidates: seed?.legacyTargetCandidates ? cloneRecord(seed.legacyTargetCandidates) : [],
      migrationManifests: seed?.migrationManifests ? cloneRecord(seed.migrationManifests) : [],
      activeDatasetPointer: seed?.activeDatasetPointer ? cloneRecord(seed.activeDatasetPointer) : null,
    }),
  };
};
