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
import type { V2DatasetMetadata } from "../persistence/contracts";
import type {
  DataQualityDateRange,
  DataQualityFilterOptions,
  DataQualityFilters,
  DataQualityIssueType,
  DataQualitySeverity,
  DataQualitySourceState,
  DataQualityStatus,
  DataQualityViewModel,
  V2DataQualityIssue,
  V2DataQualitySummary,
} from "./contracts";
import { normalizeDataQualityFilters } from "./filters";

interface BuildDataQualityInput {
  metadataList: V2DatasetMetadata[];
  datasets: V2Dataset[];
  activePointer: ActiveDatasetPointer | null;
  activeDataset: V2Dataset | null;
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

const DATASET_STATUS_LABELS: Record<V2DataQualitySummary["datasetStatus"], string> = {
  current_active: "当前使用",
  inactive_valid: "历史有效",
  rolled_back: "已回滚",
  failed: "失败",
  staging: "暂存中",
  validated: "已校验",
};

const STATUS_LABELS: Record<Exclude<DataQualityStatus, "empty" | "corrupted">, string> = {
  normal: "正常",
  watch: "观察",
  risk: "风险",
};

const ISSUE_LABELS: Record<Exclude<DataQualityIssueType, "all">, string> = {
  source_missing: "来源缺失",
  source_parse_failed: "来源解析失败",
  invalid_date_count: "日期格式异常计数",
  invalid_id_count: "ID 异常计数",
  missing_required_fields: "必需字段缺失",
  source_state_mismatch: "来源状态不一致",
  summary_row_count: "汇总行已忽略",
  unknown_status_count: "未识别状态计数",
  activation_failed: "激活未完成",
  conflict: "同 key 数据冲突",
  safe_warning: "安全提示",
};

const issueDescriptionByType: Record<Exclude<DataQualityIssueType, "all">, string> = {
  source_missing: "当前批次缺少该来源，相关指标可能无法完整计算。",
  source_parse_failed: "当前来源未能安全识别或解析，建议重新导出后导入。",
  invalid_date_count: "当前批次存在日期格式异常计数，页面不会展示原始日期值。",
  invalid_id_count: "当前批次存在商品或计划 ID 异常计数，页面只展示安全计数。",
  missing_required_fields: "当前批次存在必需字段缺失，建议检查导出字段是否完整。",
  source_state_mismatch: "来源状态和安全记录数量不一致，当前批次需要重新核对。",
  summary_row_count: "当前批次存在被忽略的汇总行，建议确认导出范围。",
  unknown_status_count: "当前批次存在未识别状态计数，页面不会展示原始状态值。",
  activation_failed: "当前数据集未完成安全激活，旧 active 数据不会被覆盖。",
  conflict: "检测到同店铺、同日期已有不同数据，本次未覆盖原数据。",
  safe_warning: "当前批次存在安全提示，建议复核文件日期和字段。",
};

const issueSuggestionByType: Record<Exclude<DataQualityIssueType, "all">, string> = {
  source_missing: "返回上传页补齐四源报表，并创建新的修复批次。",
  source_parse_failed: "重新从平台导出对应报表，再通过上传页重新导入。",
  invalid_date_count: "重新导出包含标准日期字段的报表后再导入。",
  invalid_id_count: "检查商品 ID 或计划 ID 字段后重新导入。",
  missing_required_fields: "确认导出字段完整，重新选择四源文件导入。",
  source_state_mismatch: "重新导出对应来源，避免状态和事实记录不一致。",
  summary_row_count: "确认导出明细范围，必要时重新导入。",
  unknown_status_count: "复核售后或状态字段口径，重新导入后再查看。",
  activation_failed: "保持旧批次只读，重新导入完整四源文件。",
  conflict: "不要覆盖旧批次，请重新确认日期范围和文件版本后再导入。",
  safe_warning: "复核上传文件日期和字段，必要时重新导入。",
};

const SAFE_CODE_TO_TYPE: Record<string, Exclude<DataQualityIssueType, "all">> = {
  invalid_date_count: "invalid_date_count",
  invalid_id_count: "invalid_id_count",
  missing_required_fields: "missing_required_fields",
  summary_row_count: "summary_row_count",
  unknown_status_count: "unknown_status_count",
  legacy_source_state_mismatch: "source_state_mismatch",
  record_key_conflict: "conflict",
  source_health_missing: "source_parse_failed",
};

const severityForType = (issueType: Exclude<DataQualityIssueType, "all">): DataQualitySeverity => {
  if (
    issueType === "source_missing" ||
    issueType === "source_parse_failed" ||
    issueType === "missing_required_fields" ||
    issueType === "source_state_mismatch" ||
    issueType === "activation_failed" ||
    issueType === "conflict"
  ) {
    return "risk";
  }
  return "watch";
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const safeCount = (value: unknown): number =>
  isFiniteNumber(value) && value > 0 ? Math.trunc(value) : 0;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeIsoDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
};

const minMaxDates = (values: Array<string | null>): DataQualityDateRange => {
  const dates = values
    .map((value) => normalizeIsoDate(value))
    .filter((value): value is string => !!value)
    .sort();
  if (dates.length === 0) return { start: null, end: null };
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
};

const combineDateRanges = (
  ranges: Array<DateRange | null | undefined>,
  dates: string[] = [],
): DataQualityDateRange =>
  minMaxDates([
    ...dates,
    ...ranges.flatMap((range) => (range ? [range.start, range.end] : [])),
  ]);

const batchKey = (batch: Pick<ImportBatchRecord, "platformCode" | "storeId" | "importBatchId">): string =>
  `${batch.platformCode}:${batch.storeId}:${batch.importBatchId}`;

const sortAppearance = (left: Appearance, right: Appearance): number =>
  left.metadata.preparedAt.localeCompare(right.metadata.preparedAt) ||
  left.metadata.datasetId.localeCompare(right.metadata.datasetId);

const findStore = (dataset: V2Dataset, platformCode: PlatformCode, storeId: string): StoreRecord | null =>
  dataset.stores.find((store) => store.platformCode === platformCode && store.storeId === storeId) ?? null;

const datasetStatusForSummary = ({
  metadata,
  datasetId,
  activePointer,
  activeDataset,
  existsInActiveDataset,
}: {
  metadata: V2DatasetMetadata;
  datasetId: string;
  activePointer: ActiveDatasetPointer | null;
  activeDataset: V2Dataset | null;
  existsInActiveDataset: boolean;
}): V2DataQualitySummary["datasetStatus"] => {
  if (existsInActiveDataset || activeDataset?.datasetId === datasetId || activePointer?.datasetId === datasetId) {
    return "current_active";
  }
  if (metadata.status === "failed") return "failed";
  if (metadata.status === "staging") return "staging";
  if (metadata.status === "validated") return "validated";
  return "inactive_valid";
};

const matchesBatch = (batch: ImportBatchRecord) =>
  (record: { platformCode: PlatformCode; storeId: string; importBatchId: string }): boolean =>
    record.platformCode === batch.platformCode &&
    record.storeId === batch.storeId &&
    record.importBatchId === batch.importBatchId;

const recordCountForSource = (dataset: V2Dataset, batch: ImportBatchRecord, sourceType: V2SourceType): number => {
  const matches = matchesBatch(batch);
  if (sourceType === "business_product") return dataset.businessProductFacts.filter(matches).length;
  if (sourceType === "ad_product") return dataset.adProductFacts.filter(matches).length;
  if (sourceType === "ad_plan") return dataset.adPlanFacts.filter(matches).length;
  return (
    dataset.afterSalesDailyAggregates.filter(matches).length +
    dataset.afterSalesRangeAggregates.filter(matches).length +
    dataset.afterSalesOperationalSnapshots.filter(matches).length +
    dataset.afterSalesDistributionItems.filter(matches).length
  );
};

const dateRangeForBatch = (dataset: V2Dataset, batch: ImportBatchRecord): DataQualityDateRange => {
  const matches = matchesBatch(batch);
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

const sourceStatesForBatch = (dataset: V2Dataset, batch: ImportBatchRecord): DataQualitySourceState[] => {
  const files = dataset.importFiles.filter(matchesBatch(batch));
  return SOURCE_TYPES.map((sourceType) => {
    const file = files.find((item) => item.sourceType === sourceType) ?? null;
    const status = file?.status ?? "missing";
    return {
      sourceType,
      sourceLabel: SOURCE_LABELS[sourceType],
      status,
      statusLabel: SOURCE_STATUS_LABELS[status],
      rowCount: safeCount(file?.rowCount),
      safeWarningCodeCount: file ? new Set(file.safeWarningCodes).size : 0,
      dateRange: file?.dateRange ? cloneJson(file.dateRange) : { start: null, end: null },
    };
  });
};

const issueTypeForCode = (code: string): Exclude<DataQualityIssueType, "all"> => {
  if (code.startsWith("source_warning_")) return "safe_warning";
  return SAFE_CODE_TO_TYPE[code] ?? "safe_warning";
};

const makeIssue = ({
  summaryKey,
  platformCode,
  storeId,
  importBatchId,
  datasetId,
  sourceType,
  issueType,
  code,
  count,
}: {
  summaryKey: string;
  platformCode: PlatformCode;
  storeId: string;
  importBatchId: string;
  datasetId: string;
  sourceType: V2SourceType | null;
  issueType: Exclude<DataQualityIssueType, "all">;
  code: string;
  count: number;
}): V2DataQualityIssue => ({
  issueKey: `${summaryKey}:${sourceType ?? "dataset"}:${issueType}:${code}`,
  platformCode,
  storeId,
  importBatchId,
  datasetId,
  sourceType,
  issueType,
  code,
  severity: severityForType(issueType),
  count: Math.max(1, safeCount(count)),
  title: ISSUE_LABELS[issueType],
  safeDescription: issueDescriptionByType[issueType],
  suggestion: issueSuggestionByType[issueType],
  repairable: true,
});

const issuesForBatch = ({
  dataset,
  metadata,
  batch,
  sourceStates,
}: {
  dataset: V2Dataset;
  metadata: V2DatasetMetadata;
  batch: ImportBatchRecord;
  sourceStates: DataQualitySourceState[];
}): V2DataQualityIssue[] => {
  const summaryKey = `${batch.platformCode}:${batch.storeId}:${batch.importBatchId}`;
  const issues: V2DataQualityIssue[] = [];
  const push = (
    sourceType: V2SourceType | null,
    issueType: Exclude<DataQualityIssueType, "all">,
    code: string,
    count = 1,
  ) => {
    issues.push(makeIssue({
      summaryKey,
      platformCode: batch.platformCode,
      storeId: batch.storeId,
      importBatchId: batch.importBatchId,
      datasetId: dataset.datasetId,
      sourceType,
      issueType,
      code,
      count,
    }));
  };

  sourceStates.forEach((source) => {
    const factCount = recordCountForSource(dataset, batch, source.sourceType);
    if (source.status === "missing") {
      push(source.sourceType, "source_missing", `${source.sourceType}_missing`);
    } else if (source.status === "unknown" || source.status === "error") {
      push(source.sourceType, "source_parse_failed", `${source.sourceType}_${source.status}`);
    }
    if (source.status !== "parsed" && factCount > 0) {
      push(source.sourceType, "source_state_mismatch", "legacy_source_state_mismatch", factCount);
    }
  });

  dataset.importFiles
    .filter(matchesBatch(batch))
    .forEach((file) => {
      file.safeWarningCodes.forEach((code) => {
        push(file.sourceType, issueTypeForCode(code), code);
      });
    });

  metadata.safeIssueCodes.forEach((code) => {
    push(null, issueTypeForCode(code), code);
  });

  if (metadata.status === "failed" || batch.status === "failed") {
    push(null, "activation_failed", "activation_failed");
  }
  if (metadata.status === "staging" || metadata.status === "validated") {
    push(null, "activation_failed", `activation_${metadata.status}`);
  }

  const byKey = new Map<string, V2DataQualityIssue>();
  issues.forEach((issue) => {
    const existing = byKey.get(issue.issueKey);
    if (!existing) {
      byKey.set(issue.issueKey, issue);
      return;
    }
    byKey.set(issue.issueKey, {
      ...existing,
      count: existing.count + issue.count,
    });
  });
  return [...byKey.values()].sort((left, right) =>
    left.severity.localeCompare(right.severity) ||
    left.issueType.localeCompare(right.issueType) ||
    (left.sourceType ?? "").localeCompare(right.sourceType ?? "") ||
    left.code.localeCompare(right.code),
  );
};

const statusForIssues = (issues: V2DataQualityIssue[]): Exclude<DataQualityStatus, "empty" | "corrupted"> => {
  if (issues.some((issue) => issue.severity === "risk")) return "risk";
  if (issues.some((issue) => issue.severity === "watch")) return "watch";
  return "normal";
};

export const buildDataQualitySummaries = ({
  metadataList,
  datasets,
  activePointer,
  activeDataset,
}: BuildDataQualityInput): V2DataQualitySummary[] => {
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
    .map(([summaryKey, appearances]) => {
      const latest = [...appearances].sort(sortAppearance).at(-1)!;
      const store = findStore(latest.dataset, latest.batch.platformCode, latest.batch.storeId);
      const existsInActiveDataset = !!activeDataset?.importBatches.some((batch) => batchKey(batch) === summaryKey);
      const datasetStatus = datasetStatusForSummary({
        metadata: latest.metadata,
        datasetId: latest.dataset.datasetId,
        activePointer,
        activeDataset,
        existsInActiveDataset,
      });
      const sourceStates = sourceStatesForBatch(latest.dataset, latest.batch);
      const issues = issuesForBatch({
        dataset: latest.dataset,
        metadata: latest.metadata,
        batch: latest.batch,
        sourceStates,
      });
      const status = statusForIssues(issues);
      return {
        summaryKey,
        platformCode: latest.batch.platformCode,
        platformLabel: PLATFORM_LABELS[latest.batch.platformCode],
        storeId: latest.batch.storeId,
        storeName: store?.storeName ?? "未知店铺",
        importBatchId: latest.batch.importBatchId,
        datasetId: latest.dataset.datasetId,
        datasetStatus,
        datasetStatusLabel: DATASET_STATUS_LABELS[datasetStatus],
        status,
        statusLabel: STATUS_LABELS[status],
        importStartedAt: latest.batch.importStartedAt,
        importCompletedAt: latest.batch.importCompletedAt,
        sourceCount: SOURCE_TYPES.length,
        parsedSourceCount: sourceStates.filter((source) => source.status === "parsed").length,
        warningCount: issues.filter((issue) => issue.severity === "watch").reduce((total, issue) => total + issue.count, 0),
        blockingIssueCount: issues.filter((issue) => issue.severity === "risk").reduce((total, issue) => total + issue.count, 0),
        dateRange: dateRangeForBatch(latest.dataset, latest.batch),
        sourceStates,
        issues,
      };
    })
    .sort((left, right) => {
      if (left.datasetStatus === "current_active" && right.datasetStatus !== "current_active") return -1;
      if (right.datasetStatus === "current_active" && left.datasetStatus !== "current_active") return 1;
      const statusOrder = { risk: 0, watch: 1, normal: 2 } satisfies Record<V2DataQualitySummary["status"], number>;
      return statusOrder[left.status] - statusOrder[right.status] ||
        right.importStartedAt.localeCompare(left.importStartedAt) ||
        left.summaryKey.localeCompare(right.summaryKey);
    });
};

export const filterDataQualitySummaries = (
  summaries: V2DataQualitySummary[],
  inputFilters: Partial<DataQualityFilters> | null | undefined,
): V2DataQualitySummary[] => {
  const filters = normalizeDataQualityFilters(inputFilters);
  const search = filters.searchTerm.toLowerCase();
  return summaries.filter((summary) => {
    if (filters.platformCode !== "all" && summary.platformCode !== filters.platformCode) return false;
    if (filters.storeKey !== "all" && `${summary.platformCode}:${summary.storeId}` !== filters.storeKey) return false;
    if (filters.importBatchId !== "all" && summary.importBatchId !== filters.importBatchId) return false;
    if (filters.status !== "all" && summary.status !== filters.status) return false;
    if (filters.issueType !== "all" && !summary.issues.some((issue) => issue.issueType === filters.issueType)) return false;
    if (search) {
      const haystack = [
        summary.importBatchId,
        summary.storeName,
        summary.storeId,
        summary.datasetId,
      ].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
};

const countBy = <TItem, TKey extends string>(
  items: TItem[],
  keyOf: (item: TItem) => TKey,
): Map<TKey, number> => {
  const counts = new Map<TKey, number>();
  items.forEach((item) => {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

const buildFilterOptions = (summaries: V2DataQualitySummary[]): DataQualityFilterOptions => {
  const platformCounts = countBy(summaries, (summary) => summary.platformCode);
  const storeCounts = countBy(summaries, (summary) => `${summary.platformCode}:${summary.storeId}`);
  const batchCounts = countBy(summaries, (summary) => summary.importBatchId);
  const statusCounts = countBy(summaries, (summary) => summary.status);
  const issueCounts = new Map<DataQualityIssueType, number>();
  summaries.forEach((summary) => {
    summary.issues.forEach((issue) => {
      issueCounts.set(issue.issueType, (issueCounts.get(issue.issueType) ?? 0) + 1);
    });
  });

  const stores = [...storeCounts.entries()]
    .map(([key, count]) => {
      const [platformCode, storeId] = key.split(":") as [PlatformCode, string];
      const summary = summaries.find((item) => item.platformCode === platformCode && item.storeId === storeId);
      return {
        value: key,
        platformCode,
        storeId,
        label: summary?.storeName ?? storeId,
        count,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));

  return {
    platforms: [...platformCounts.entries()]
      .map(([platformCode, count]) => ({
        value: platformCode,
        label: PLATFORM_LABELS[platformCode],
        count,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN")),
    stores,
    batches: [...batchCounts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    issueTypes: ([...issueCounts.entries()] as Array<[Exclude<DataQualityIssueType, "all">, number]>)
      .map(([value, count]) => ({ value, label: ISSUE_LABELS[value], count }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN")),
    statuses: [...statusCounts.entries()]
      .map(([value, count]) => ({ value, label: STATUS_LABELS[value], count }))
      .sort((left, right) => left.label.localeCompare(right.label, "zh-CN")),
  };
};

export const buildDataQualityViewModel = (
  input: BuildDataQualityInput,
  filters?: Partial<DataQualityFilters> | null,
): DataQualityViewModel => {
  const summaries = buildDataQualitySummaries(input);
  const filteredSummaries = filterDataQualitySummaries(summaries, filters);
  const totalIssueCount = summaries.reduce((total, summary) => total + summary.issues.length, 0);
  const repairableIssueCount = summaries.reduce(
    (total, summary) => total + summary.issues.filter((issue) => issue.repairable).length,
    0,
  );
  return {
    summaries,
    filteredSummaries,
    filterOptions: buildFilterOptions(summaries),
    activeDatasetId: input.activePointer?.datasetId ?? null,
    datasetCount: input.metadataList.length,
    totalIssueCount,
    repairableIssueCount,
    notices: [
      "数据质量页只展示安全元数据、来源状态和 warning code 计数。",
      "重新导入会创建新批次，不会修改原批次。",
    ],
    isEmpty: summaries.length === 0,
  };
};

export const dataQualityReimportHref = (issue: Pick<V2DataQualityIssue, "platformCode" | "storeId" | "importBatchId">): string =>
  `/upload?mode=reimport&platform=${encodeURIComponent(issue.platformCode)}&storeId=${encodeURIComponent(issue.storeId)}&sourceBatchId=${encodeURIComponent(issue.importBatchId)}`;

export const dataQualityBatchReimportHref = (summary: Pick<V2DataQualitySummary, "platformCode" | "storeId" | "importBatchId">): string =>
  `/upload?mode=reimport&platform=${encodeURIComponent(summary.platformCode)}&storeId=${encodeURIComponent(summary.storeId)}&sourceBatchId=${encodeURIComponent(summary.importBatchId)}`;
