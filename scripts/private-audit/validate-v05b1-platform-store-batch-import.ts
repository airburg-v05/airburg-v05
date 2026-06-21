import fs from "node:fs";
import path from "node:path";
import { toTmallStoredAnalysisResult } from "../../lib/storage/tmall-analysis-storage";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";
import { runTmallFourSourceAnalysis } from "../../lib/tmall/pipeline/run-tmall-four-source-analysis";
import { MemoryTransactionalV2PersistenceStore } from "../../lib/v05/persistence/testing/memory-transactional-adapter";
import { DEFAULT_TMAIL_OWNER } from "../../lib/v05";
import {
  buildV05TmallImportCandidate,
  countV05DatasetRecords,
  detectV05TmallBatchFiles,
  executeV05TmallBatchImport,
  mergeV05ImportCandidateIntoActiveDataset,
  sha256File,
  type V05FileFingerprint,
} from "../../lib/v05/import";
import type { TmallFourSourceAnalysisResult, TmallSourceType } from "../../types/tmall";

const ROOT = process.cwd();
const CAPTURED_AT = "2026-06-22T10:20:00+08:00";

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

class MapStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

interface Check {
  name: string;
  pass: boolean;
}

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

const issueCodes = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];
  const issues = (value as { issueCodes?: string[] }).issueCodes;
  return Array.isArray(issues) ? issues : [];
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

const main = async () => {
  const files = sampleFiles();
  const detection = await detectV05TmallBatchFiles(Object.values(files));
  const analysis = await runAnalysis(files);
  const analysisBefore = stableStringify(analysis);
  const sensitiveValues = await collectSensitiveSourceValues(files.after_sales);
  const store = new MemoryTransactionalV2PersistenceStore();
  const legacyStorage = new MapStorage();
  legacyStorage.setItem("airburg_tmall_analysis_v2", JSON.stringify(toTmallStoredAnalysisResult(analysis)));
  let defaultCompatibilitySaved = 0;
  let secondStoreCompatibilitySaved = 0;

  const first = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: DEFAULT_TMAIL_OWNER.storeId,
      storeName: DEFAULT_TMAIL_OWNER.storeName,
    },
    filesBySourceType: files,
    persistenceStore: store,
    legacyStorage,
    compatibilityWriter: () => {
      defaultCompatibilitySaved += 1;
    },
    now: () => CAPTURED_AT,
  });

  const secondFiles = sampleFiles();
  const second = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: "tmall-second-store",
      storeName: "天猫第二店铺",
      isNew: true,
    },
    filesBySourceType: secondFiles,
    persistenceStore: store,
    legacyStorage,
    compatibilityWriter: () => {
      secondStoreCompatibilitySaved += 1;
    },
    now: () => CAPTURED_AT,
  });
  const afterSecond = await store.loadActiveDataset();
  const pointerAfterSecond = await store.getActivePointer();

  const duplicate = await executeV05TmallBatchImport({
    platformCode: "tmall",
    store: {
      platformCode: "tmall",
      storeId: "tmall-second-store",
      storeName: "天猫第二店铺",
    },
    filesBySourceType: sampleFiles(),
    persistenceStore: store,
    legacyStorage,
    now: () => CAPTURED_AT,
  });
  const pointerAfterDuplicate = await store.getActivePointer();

  const candidate = await buildV05TmallImportCandidate({
    analysis,
    store: {
      platformCode: "tmall",
      storeId: "conflict-store",
      storeName: "冲突测试店铺",
    },
    fileFingerprints: await buildFingerprints(files),
    capturedAt: CAPTURED_AT,
  });
  const modifiedFact = {
    ...candidate.dataset.businessProductFacts[0]!,
    gmv: (candidate.dataset.businessProductFacts[0]?.gmv ?? 0) + 1,
  };
  const conflictDataset = {
    ...candidate.dataset,
    importBatches: [],
    businessProductFacts: [modifiedFact],
  };
  const conflict = await mergeV05ImportCandidateIntoActiveDataset(conflictDataset, candidate);

  const defaultProductIds = new Set(
    afterSecond?.businessProductFacts
      .filter((fact) => fact.storeId === DEFAULT_TMAIL_OWNER.storeId)
      .map((fact) => fact.productId) ?? [],
  );
  const secondProductIds = new Set(
    afterSecond?.businessProductFacts
      .filter((fact) => fact.storeId === "tmall-second-store")
      .map((fact) => fact.productId) ?? [],
  );
  const sharedProductCount = [...defaultProductIds].filter((productId) => secondProductIds.has(productId)).length;

  const checks: Check[] = [
    { name: "detects_all_four_sources", pass: detection.canImport },
    { name: "default_store_import_success", pass: first.status === "success" },
    { name: "prepare_readback_activate_success", pass: !!first.datasetId && !!first.activationStatus },
    { name: "default_legacy_compatibility_saved", pass: defaultCompatibilitySaved === 1 },
    { name: "second_store_import_success", pass: second.status === "success" },
    { name: "active_dataset_has_two_stores", pass: (afterSecond?.stores.length ?? 0) >= 2 },
    { name: "cross_store_same_product_isolated", pass: sharedProductCount > 0 },
    { name: "second_store_does_not_write_legacy_key", pass: secondStoreCompatibilitySaved === 0 },
    { name: "duplicate_import_already_imported", pass: duplicate.status === "already_imported" },
    { name: "duplicate_does_not_change_pointer", pass: pointerAfterDuplicate?.datasetId === pointerAfterSecond?.datasetId },
    { name: "conflict_detected", pass: conflict.merge.status === "conflict" },
    { name: "ad_product_facts_present", pass: (afterSecond?.adProductFacts.length ?? 0) > 0 },
    { name: "ad_plan_facts_present", pass: (afterSecond?.adPlanFacts.length ?? 0) > 0 },
    { name: "after_sales_safe_aggregates_present", pass: (afterSecond?.afterSalesDistributionItems.length ?? 0) > 0 },
    { name: "privacy_field_names_absent", pass: !containsSensitiveFieldName({ first, second, afterSecond }) },
    { name: "privacy_values_absent", pass: !containsSensitiveSourceValue({ first, second, afterSecond }, sensitiveValues) },
    { name: "no_invalid_numbers", pass: !containsInvalidNumber({ first, second, afterSecond }) },
    { name: "no_undefined", pass: !containsUndefined({ first, second, afterSecond }) },
    { name: "input_analysis_not_mutated", pass: stableStringify(analysis) === analysisBefore },
  ];

  const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  const output = {
    status,
    detectionCanImport: detection.canImport,
    firstStatus: first.status,
    secondStatus: second.status,
    duplicateStatus: duplicate.status,
    conflictStatus: conflict.merge.status,
    legacyMigrationStatus: first.legacyMigrationStatus,
    futureRecordCounts: afterSecond ? countV05DatasetRecords(afterSecond) : {},
    issueCodes: {
      first: issueCodes(first),
      second: issueCodes(second),
      duplicate: issueCodes(duplicate),
      conflict: conflict.merge.issueCodes,
    },
    defaultCompatibilitySaved,
    secondStoreCompatibilitySaved,
    sharedProductCount,
    privacyPass: checks.find((check) => check.name === "privacy_values_absent")?.pass === true,
    numberSafetyPass: checks.find((check) => check.name === "no_invalid_numbers")?.pass === true,
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

void main().catch((error) => {
  console.error(JSON.stringify({ status: "FAIL", errorCode: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
