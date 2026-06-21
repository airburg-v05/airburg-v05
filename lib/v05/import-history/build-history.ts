import type {
  ActiveDatasetPointer,
  DateRange,
  ImportBatchRecord,
  ImportFileRecord,
  PlatformCode,
  StoreRecord,
  V2Dataset,
  V2SourceType,
} from "../domain/models";
import type { ActivationJournalRecord, V2DatasetMetadata } from "../persistence/contracts";
import type {
  ImportHistoryActivationEvent,
  ImportHistoryDatasetStatus,
  ImportHistoryEntry,
  ImportHistoryFilterOptions,
  ImportHistoryFilters,
  ImportHistorySourceState,
  ImportHistoryViewModel,
} from "./contracts";

interface BuildImportHistoryInput {
  metadataList: V2DatasetMetadata[];
  datasets: V2Dataset[];
  activePointer: ActiveDatasetPointer | null;
  activeDataset: V2Dataset | null;
  journal: ActivationJournalRecord[];
}

interface Appearance {
  dataset: V2Dataset;
  metadata: V2DatasetMetadata;
  batch: ImportBatchRecord;
}

const SOURCE_TYPES: V2SourceType[] = ["business_product", "ad_product", "ad_plan", "after_sales"];

const SOURCE_LABELS: Record<V2SourceType, string> = {
  business_product: "生意参谋商品表",
  ad_product: "商品推广报表",
  ad_plan: "计划推广报表",
  after_sales: "售后退货表",
};

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  tmall: "天猫",
  jd: "京东",
  pdd: "拼多多",
  douyin: "抖音",
  youzan: "有赞",
};

const SOURCE_STATUS_LABELS: Record<ImportFileRecord["status"], string> = {
  parsed: "已解析",
  missing: "缺失",
  unknown: "未识别",
  error: "解析失败",
};

const IMPORT_STATUS_LABELS: Record<ImportHistoryEntry["importStatus"], string> = {
  success: "成功",
  partial_success: "部分成功",
  failed: "失败",
};

const DATASET_STATUS_LABELS: Record<ImportHistoryDatasetStatus, string> = {
  current_active: "当前使用",
  inactive_valid: "历史有效",
  rolled_back: "已回滚",
  failed: "失败",
  staging: "暂存中",
  validated: "已校验",
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const safeCount = (value: unknown): number =>
  isFiniteNumber(value) && value > 0 ? value : 0;

const normalizeIsoDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
};

const minMaxDates = (values: Array<string | null>): { start: string | null; end: string | null } => {
  const dates = values.filter((value): value is string => !!normalizeIsoDate(value)).map((value) => normalizeIsoDate(value)!);
  if (dates.length === 0) return { start: null, end: null };
  const sorted = [...dates].sort();
  return { start: sorted[0] ?? null, end: sorted.at(-1) ?? null };
};

const combineDateRanges = (ranges: Array<DateRange | null | undefined>, dates: string[] = []) =>
  minMaxDates([
    ...dates,
    ...ranges.flatMap((range) => (range ? [range.start, range.end] : [])),
  ]);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const batchKey = (batch: Pick<ImportBatchRecord, "platformCode" | "storeId" | "importBatchId">): string =>
  `${batch.platformCode}:${batch.storeId}:${batch.importBatchId}`;

const normalizeImportStatus = (status: ImportBatchRecord["status"]): ImportHistoryEntry["importStatus"] => {
  if (status === "success" || status === "partial_success" || status === "failed") return status;
  return "partial_success";
};

const sortByPreparedAt = (left: Appearance, right: Appearance): number =>
  left.metadata.preparedAt.localeCompare(right.metadata.preparedAt) ||
  left.metadata.datasetId.localeCompare(right.metadata.datasetId);

const findStore = (dataset: V2Dataset, platformCode: PlatformCode, storeId: string): StoreRecord | null =>
  dataset.stores.find((store) => store.platformCode === platformCode && store.storeId === storeId) ?? null;

const relatedEvents = (
  datasets: Set<string>,
  journal: ActivationJournalRecord[],
): ImportHistoryActivationEvent[] =>
  journal
    .filter((event) => datasets.has(event.datasetId) || (!!event.previousDatasetId && datasets.has(event.previousDatasetId)))
    .map((event) => ({
      action: event.action,
      datasetId: event.datasetId,
      previousDatasetId: event.previousDatasetId,
      createdAt: event.createdAt,
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.datasetId.localeCompare(right.datasetId));

const datasetStatusForEntry = ({
  latestMetadata,
  latestDatasetId,
  existsInActiveDataset,
  activeDataset,
  activePointer,
  events,
}: {
  latestMetadata: V2DatasetMetadata;
  latestDatasetId: string;
  existsInActiveDataset: boolean;
  activeDataset: V2Dataset | null;
  activePointer: ActiveDatasetPointer | null;
  events: ImportHistoryActivationEvent[];
}): ImportHistoryDatasetStatus => {
  if (existsInActiveDataset || activeDataset?.datasetId === latestDatasetId || activePointer?.datasetId === latestDatasetId) return "current_active";
  if (latestMetadata.status === "failed") return "failed";
  if (latestMetadata.status === "staging") return "staging";
  if (latestMetadata.status === "validated") return "validated";
  const rolledAway = events.some(
    (event) => event.action === "rolled_back" && event.previousDatasetId === latestDatasetId,
  );
  if (rolledAway) return "rolled_back";
  return "inactive_valid";
};

const recordCountsForBatch = (dataset: V2Dataset, batch: ImportBatchRecord) => ({
  businessProduct: dataset.businessProductFacts.filter(
    (fact) =>
      fact.platformCode === batch.platformCode &&
      fact.storeId === batch.storeId &&
      fact.importBatchId === batch.importBatchId,
  ).length,
  adProduct: dataset.adProductFacts.filter(
    (fact) =>
      fact.platformCode === batch.platformCode &&
      fact.storeId === batch.storeId &&
      fact.importBatchId === batch.importBatchId,
  ).length,
  adPlan: dataset.adPlanFacts.filter(
    (fact) =>
      fact.platformCode === batch.platformCode &&
      fact.storeId === batch.storeId &&
      fact.importBatchId === batch.importBatchId,
  ).length,
  afterSalesSafe:
    dataset.afterSalesDailyAggregates.filter(
      (fact) =>
        fact.platformCode === batch.platformCode &&
        fact.storeId === batch.storeId &&
        fact.importBatchId === batch.importBatchId,
    ).length +
    dataset.afterSalesRangeAggregates.filter(
      (fact) =>
        fact.platformCode === batch.platformCode &&
        fact.storeId === batch.storeId &&
        fact.importBatchId === batch.importBatchId,
    ).length +
    dataset.afterSalesOperationalSnapshots.filter(
      (fact) =>
        fact.platformCode === batch.platformCode &&
        fact.storeId === batch.storeId &&
        fact.importBatchId === batch.importBatchId,
    ).length +
    dataset.afterSalesDistributionItems.filter(
      (fact) =>
        fact.platformCode === batch.platformCode &&
        fact.storeId === batch.storeId &&
        fact.importBatchId === batch.importBatchId,
    ).length,
});

const dateRangeForBatch = (dataset: V2Dataset, batch: ImportBatchRecord) => {
  const matches = (fact: { platformCode: PlatformCode; storeId: string; importBatchId: string }) =>
    fact.platformCode === batch.platformCode &&
    fact.storeId === batch.storeId &&
    fact.importBatchId === batch.importBatchId;

  return combineDateRanges(
    [
      ...dataset.importFiles.filter(matches).map((file) => file.dateRange),
      ...dataset.afterSalesRangeAggregates.filter(matches).map((item) => item.dateRange),
      ...dataset.afterSalesOperationalSnapshots.filter(matches).map((item) => item.dateRange),
      ...dataset.afterSalesDistributionItems.filter(matches).map((item) => item.dateRange),
    ],
    [
      ...dataset.businessProductFacts.filter(matches).map((item) => item.businessDate),
      ...dataset.adProductFacts.filter(matches).map((item) => item.businessDate),
      ...dataset.adPlanFacts.filter(matches).map((item) => item.businessDate),
      ...dataset.afterSalesDailyAggregates.filter(matches).map((item) => item.businessDate),
    ],
  );
};

const sourceStatesForBatch = (dataset: V2Dataset, batch: ImportBatchRecord): ImportHistorySourceState[] => {
  const files = dataset.importFiles.filter(
    (file) =>
      file.platformCode === batch.platformCode &&
      file.storeId === batch.storeId &&
      file.importBatchId === batch.importBatchId,
  );

  return SOURCE_TYPES.map((sourceType) => {
    const file = files.find((item) => item.sourceType === sourceType) ?? null;
    const status = file?.status ?? "missing";
    return {
      sourceType,
      sourceLabel: SOURCE_LABELS[sourceType],
      status,
      statusLabel: SOURCE_STATUS_LABELS[status],
      rowCount: safeCount(file?.rowCount),
      hasDateRange: !!file?.dateRange,
      dateRange: file?.dateRange ? cloneJson(file.dateRange) : { start: null, end: null },
      safeWarningCodeCount: file ? new Set(file.safeWarningCodes).size : 0,
    };
  });
};

const safeWarningCodeCountForBatch = (dataset: V2Dataset, batch: ImportBatchRecord, metadata: V2DatasetMetadata): number => {
  const codes = new Set<string>(metadata.safeIssueCodes);
  dataset.importFiles
    .filter(
      (file) =>
        file.platformCode === batch.platformCode &&
        file.storeId === batch.storeId &&
        file.importBatchId === batch.importBatchId,
    )
    .forEach((file) => file.safeWarningCodes.forEach((code) => codes.add(code)));
  return codes.size;
};

export const buildImportHistoryEntries = ({
  metadataList,
  datasets,
  activePointer,
  activeDataset,
  journal,
}: BuildImportHistoryInput): ImportHistoryEntry[] => {
  const metadataByDatasetId = new Map(metadataList.map((metadata) => [metadata.datasetId, metadata]));
  const appearancesByKey = new Map<string, Appearance[]>();

  datasets.forEach((dataset) => {
    const metadata = metadataByDatasetId.get(dataset.datasetId);
    if (!metadata) return;
    dataset.importBatches.forEach((batch) => {
      const key = batchKey(batch);
      const list = appearancesByKey.get(key) ?? [];
      list.push({ dataset, metadata, batch });
      appearancesByKey.set(key, list);
    });
  });

  return [...appearancesByKey.entries()]
    .map(([historyKey, appearances]) => {
      const sorted = [...appearances].sort(sortByPreparedAt);
      const first = sorted[0]!;
      const latest = sorted.at(-1)!;
      const datasetIds = new Set(sorted.map((appearance) => appearance.dataset.datasetId));
      const events = relatedEvents(datasetIds, journal);
      const rollbackEvents = events.filter((event) => event.action === "rolled_back");
      const store = findStore(latest.dataset, latest.batch.platformCode, latest.batch.storeId);
      const existsInActiveDataset = !!activeDataset?.importBatches.some(
        (batch) => batchKey(batch) === historyKey,
      );
      const datasetStatus = datasetStatusForEntry({
        latestMetadata: latest.metadata,
        latestDatasetId: latest.dataset.datasetId,
        existsInActiveDataset,
        activeDataset,
        activePointer,
        events,
      });

      return {
        historyKey,
        platformCode: latest.batch.platformCode,
        platformLabel: PLATFORM_LABELS[latest.batch.platformCode],
        storeId: latest.batch.storeId,
        storeName: store?.storeName ?? "未知店铺",
        importBatchId: latest.batch.importBatchId,
        importStatus: normalizeImportStatus(latest.batch.status),
        importStatusLabel: IMPORT_STATUS_LABELS[normalizeImportStatus(latest.batch.status)],
        datasetStatus,
        datasetStatusLabel: DATASET_STATUS_LABELS[datasetStatus],
        firstDatasetId: first.dataset.datasetId,
        latestDatasetId: latest.dataset.datasetId,
        existsInActiveDataset,
        importedAt: first.batch.importStartedAt,
        completedAt: latest.batch.importCompletedAt,
        dateRange: dateRangeForBatch(latest.dataset, latest.batch),
        sourceCount: new Set(latest.batch.sourceTypes).size,
        recordCounts: recordCountsForBatch(latest.dataset, latest.batch),
        safeWarningCodeCount: safeWarningCodeCountForBatch(latest.dataset, latest.batch, latest.metadata),
        sourceStates: sourceStatesForBatch(latest.dataset, latest.batch),
        activationEvents: events,
        rollbackEvents,
      } satisfies ImportHistoryEntry;
    })
    .sort(
      (left, right) =>
        right.importedAt.localeCompare(left.importedAt) ||
        left.storeName.localeCompare(right.storeName, "zh-CN") ||
        left.importBatchId.localeCompare(right.importBatchId),
    );
};

export const buildImportHistoryFilterOptions = (entries: ImportHistoryEntry[]): ImportHistoryFilterOptions => {
  const platformCounts = new Map<PlatformCode, { label: string; count: number }>();
  const storeCounts = new Map<string, { platformCode: PlatformCode; storeId: string; storeName: string; count: number }>();
  const statusCounts = new Map<ImportHistoryDatasetStatus, { label: string; count: number }>();

  entries.forEach((entry) => {
    const platform = platformCounts.get(entry.platformCode) ?? { label: entry.platformLabel, count: 0 };
    platform.count += 1;
    platformCounts.set(entry.platformCode, platform);

    const storeKey = `${entry.platformCode}:${entry.storeId}`;
    const store = storeCounts.get(storeKey) ?? {
      platformCode: entry.platformCode,
      storeId: entry.storeId,
      storeName: entry.storeName,
      count: 0,
    };
    store.count += 1;
    storeCounts.set(storeKey, store);

    const status = statusCounts.get(entry.datasetStatus) ?? { label: entry.datasetStatusLabel, count: 0 };
    status.count += 1;
    statusCounts.set(entry.datasetStatus, status);
  });

  return {
    platforms: [...platformCounts.entries()]
      .map(([platformCode, value]) => ({ platformCode, label: value.label, count: value.count }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN")),
    stores: [...storeCounts.values()].sort((left, right) => left.storeName.localeCompare(right.storeName, "zh-CN")),
    datasetStatuses: [...statusCounts.entries()]
      .map(([status, value]) => ({ status, label: value.label, count: value.count }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN")),
  };
};

const importedAtInRange = (importedAt: string, start: string | null, end: string | null): boolean => {
  const date = normalizeIsoDate(importedAt);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
};

const dateRangeForFilter = (entries: ImportHistoryEntry[], filters: ImportHistoryFilters): { start: string | null; end: string | null } => {
  if (filters.datePreset === "all") return { start: null, end: null };
  if (filters.datePreset === "custom") {
    return {
      start: filters.customStartDate || null,
      end: filters.customEndDate || null,
    };
  }
  const latestDate = entries
    .map((entry) => normalizeIsoDate(entry.importedAt))
    .filter((date): date is string => !!date)
    .sort()
    .at(-1);
  if (!latestDate) return { start: null, end: null };
  const days = filters.datePreset === "last_7_days" ? 6 : 29;
  const date = new Date(`${latestDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return { start: date.toISOString().slice(0, 10), end: latestDate };
};

export const filterImportHistoryEntries = (
  entries: ImportHistoryEntry[],
  filters: ImportHistoryFilters,
): ImportHistoryEntry[] => {
  const search = filters.searchTerm.trim().toLowerCase();
  const { start, end } = dateRangeForFilter(entries, filters);

  return entries.filter((entry) => {
    if (filters.platformCode !== "all" && entry.platformCode !== filters.platformCode) return false;
    if (filters.storeKey !== "all" && `${entry.platformCode}:${entry.storeId}` !== filters.storeKey) return false;
    if (filters.datasetStatus !== "all" && entry.datasetStatus !== filters.datasetStatus) return false;
    if (!importedAtInRange(entry.importedAt, start, end)) return false;
    if (!search) return true;
    return (
      entry.importBatchId.toLowerCase().includes(search) ||
      entry.storeName.toLowerCase().includes(search)
    );
  });
};

export const buildImportHistoryViewModel = (
  input: BuildImportHistoryInput,
  filters: ImportHistoryFilters,
): ImportHistoryViewModel => {
  const entries = buildImportHistoryEntries(input);
  const filteredEntries = filterImportHistoryEntries(entries, filters);
  return {
    entries,
    filteredEntries,
    filterOptions: buildImportHistoryFilterOptions(entries),
    totalEntryCount: entries.length,
    activeDatasetId: input.activePointer?.datasetId ?? null,
    datasetCount: input.metadataList.length,
    journalCount: input.journal.length,
    notices: [
      "重复或冲突结果只在导入当次反馈，不生成新的历史批次。",
      "导入记录仅展示安全聚合信息，不展示文件名和原始明细。",
    ],
    isEmpty: entries.length === 0,
  };
};
