import type {
  ImportBatchRecord,
  ImportFileRecord,
  OwnedAdPlanFact,
  OwnedAdProductFact,
  OwnedAfterSalesDailyAggregate,
  OwnedAfterSalesDistributionItem,
  OwnedAfterSalesOperationalSnapshot,
  OwnedAfterSalesRangeAggregate,
  OwnedBusinessProductFact,
  PlatformRecord,
  SeriesRecord,
  StoreRecord,
  StoreScope,
  TargetRecord,
  TrackedProductRecord,
} from "../domain/models";
import type { RepositoryResult } from "../domain/results";

export interface V2RecordRepository<TRecord> {
  get(key: string): Promise<RepositoryResult<TRecord>>;
  insert(record: TRecord): Promise<RepositoryResult<TRecord>>;
  insertMany(records: TRecord[]): Promise<RepositoryResult<TRecord[]>>;
  replace(record: TRecord): Promise<RepositoryResult<TRecord>>;
}

export interface PlatformRepository extends V2RecordRepository<PlatformRecord> {
  list(): Promise<RepositoryResult<PlatformRecord[]>>;
}

export interface StoreRepository extends V2RecordRepository<StoreRecord> {
  list(): Promise<RepositoryResult<StoreRecord[]>>;
  listByPlatform(platformCode: StoreScope["platformCode"]): Promise<RepositoryResult<StoreRecord[]>>;
}

export interface ImportBatchRepository extends V2RecordRepository<ImportBatchRecord> {
  list(scope: StoreScope): Promise<RepositoryResult<ImportBatchRecord[]>>;
}

export interface ImportFileRepository extends V2RecordRepository<ImportFileRecord> {
  list(scope: StoreScope): Promise<RepositoryResult<ImportFileRecord[]>>;
}

export interface BusinessProductFactRepository extends V2RecordRepository<OwnedBusinessProductFact> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedBusinessProductFact[]>>;
}

export interface AdProductFactRepository extends V2RecordRepository<OwnedAdProductFact> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAdProductFact[]>>;
}

export interface AdPlanFactRepository extends V2RecordRepository<OwnedAdPlanFact> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAdPlanFact[]>>;
}

export interface AfterSalesDailyAggregateRepository
  extends V2RecordRepository<OwnedAfterSalesDailyAggregate> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAfterSalesDailyAggregate[]>>;
}

export interface AfterSalesRangeAggregateRepository
  extends V2RecordRepository<OwnedAfterSalesRangeAggregate> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAfterSalesRangeAggregate[]>>;
}

export interface AfterSalesOperationalSnapshotRepository
  extends V2RecordRepository<OwnedAfterSalesOperationalSnapshot> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAfterSalesOperationalSnapshot[]>>;
}

export interface AfterSalesDistributionRepository
  extends V2RecordRepository<OwnedAfterSalesDistributionItem> {
  list(scope: StoreScope): Promise<RepositoryResult<OwnedAfterSalesDistributionItem[]>>;
}

export interface SeriesRepository extends V2RecordRepository<SeriesRecord> {
  list(scope: StoreScope): Promise<RepositoryResult<SeriesRecord[]>>;
}

export interface TrackedProductRepository extends V2RecordRepository<TrackedProductRecord> {
  list(scope: StoreScope): Promise<RepositoryResult<TrackedProductRecord[]>>;
}

export interface TargetRepository extends V2RecordRepository<TargetRecord> {
  listCompany(): Promise<RepositoryResult<TargetRecord[]>>;
  list(scope: StoreScope): Promise<RepositoryResult<TargetRecord[]>>;
}

export interface V2RepositoryBundle {
  platforms: PlatformRepository;
  stores: StoreRepository;
  importBatches: ImportBatchRepository;
  importFiles: ImportFileRepository;
  businessProductFacts: BusinessProductFactRepository;
  adProductFacts: AdProductFactRepository;
  adPlanFacts: AdPlanFactRepository;
  afterSalesDailyAggregates: AfterSalesDailyAggregateRepository;
  afterSalesRangeAggregates: AfterSalesRangeAggregateRepository;
  afterSalesOperationalSnapshots: AfterSalesOperationalSnapshotRepository;
  afterSalesDistributionItems: AfterSalesDistributionRepository;
  series: SeriesRepository;
  trackedProducts: TrackedProductRepository;
  targets: TargetRepository;
}
