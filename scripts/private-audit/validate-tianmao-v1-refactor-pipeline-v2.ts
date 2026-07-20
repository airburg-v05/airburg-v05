import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  aggregateSearchTotalKeywords,
  normalizeBrandModelFilter,
  resolveBrandCenterMatch,
} from "../../lib/bi/brand-model-semantic";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import { parseBusinessDate } from "../../lib/etl/date";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  searchProductKeywordDedupKeyV2,
  searchTotalKeywordDedupKeyV2,
} from "../../lib/etl/dedup-engine";
import { detectFileType, findField } from "../../lib/etl/runtime/file-router";
import { saveTargetDraft, loadActiveTargetDrafts } from "../../lib/persistence/target-drafts-persistence";
import {
  TARGET_DRAFT_SCHEMA_VERSION,
  type TargetDraftRecord,
} from "../../lib/persistence/target-drafts-persistence.types";

type Status = "PASS" | "FAIL" | "BLOCKED";
type TaskName =
  | "ETL_FILE_ROUTER_V2_FIX"
  | "RUNTIME_DATASET_APPEND_STRICT_V1"
  | "SEARCH_KEYWORD_DEDUP_V2"
  | "BRAND_CENTER_UNIFIED_RESOLVER_V1"
  | "TARGET_DRAFTS_ISOLATION_V1";

interface Check {
  task: TaskName | "RECONCILIATION" | "SAFETY";
  name: string;
  pass: boolean;
  details?: unknown;
}

interface ParsedRealFile {
  absolutePath: string;
  extension: string;
  safeCode: string;
  file: File;
  sheets: ParsedExcelSheet[];
  fileType: ETLSourceType;
  dates: string[];
  rowCount: number;
}

interface Totals {
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  spend: number | null;
  clicks: number | null;
  searchTotalVisitors: number | null;
  searchTotalBuyers: number | null;
  searchProductVisitors: number | null;
  searchProductBuyers: number | null;
  refundAmount: number | null;
  refundCount: number | null;
  shippedRefundAmount: number | null;
  shippedRefundCount: number | null;
  signedRefundAmount: number | null;
  signedRefundCount: number | null;
}

type RequestHandler = (() => void) | null;

interface FakeObjectStoreConfig {
  keyPath: string;
  records: Map<string, unknown>;
}

const REPO_ROOT = process.cwd();
const SOURCE_DIR = process.env.TMALL_DAILY_SOURCE_DIR ?? "/Users/zongji/Desktop/每日平台数据/天猫";
const EXPECTED_DATES = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const checks: Check[] = [];

const addCheck = (task: Check["task"], name: string, pass: boolean, details?: unknown) => {
  checks.push({ task, name, pass, details });
};

const block = (name: string, details?: unknown): never => {
  addCheck("SAFETY", name, false, details);
  const error = new Error(name);
  error.name = "BlockedAuditError";
  throw error;
};

const safeCode = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseNumber = (value: unknown): number | null => {
  const text = asText(value);
  if (!text || ["--", "-", "—", "null", "undefined", "nan"].includes(text.toLowerCase())) return null;
  const isPercent = text.includes("%");
  const normalized = text.replace(/[,，￥¥元%]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return isPercent ? parsed / 100 : parsed;
};

const readValue = (row: Record<string, unknown>, field: Parameters<typeof findField>[1]): unknown => {
  const actualField = findField(row, field);
  return actualField ? row[actualField] : null;
};

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const allRows = (sheets: ParsedExcelSheet[]): Record<string, unknown>[] =>
  sheets.flatMap((sheet) => sheet.rows).filter(hasAnyValue);

const add = (current: number | null, value: number | null): number | null =>
  value === null ? current : (current ?? 0) + value;

const round2 = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;

const emptyTotals = (): Totals => ({
  gmv: null,
  gsv: null,
  visitors: null,
  paidBuyers: null,
  spend: null,
  clicks: null,
  searchTotalVisitors: null,
  searchTotalBuyers: null,
  searchProductVisitors: null,
  searchProductBuyers: null,
  refundAmount: null,
  refundCount: null,
  shippedRefundAmount: null,
  shippedRefundCount: null,
  signedRefundAmount: null,
  signedRefundCount: null,
});

const findFiles = (directory: string): string[] => {
  const found: string[] = [];
  const walk = (current: string) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        return;
      }
      if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(next);
    });
  };
  walk(directory);
  return found.sort();
};

const dateCandidatesFor = (absolutePath: string, rows: Record<string, unknown>[]): string[] => {
  const dates = new Set<string>();
  const pathDate = parseBusinessDate(absolutePath);
  if (pathDate) dates.add(pathDate);
  rows.forEach((row) => {
    [
      parseBusinessDate(readValue(row, "date")),
      parseBusinessDate(readValue(row, "refundCompletedAt")),
      parseBusinessDate(readValue(row, "refundAppliedAt")),
    ].forEach((rowDate) => {
      if (rowDate) dates.add(rowDate);
    });
  });
  return Array.from(dates).sort();
};

const fileForPath = (absolutePath: string, dates: string[]): File => {
  const buffer = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const datePart = dates[0] ?? "no-date";
  const name = `tmall-v2-${datePart}-${safeCode(path.relative(SOURCE_DIR, absolutePath))}${extension}`;
  return new NodeFile([new Uint8Array(buffer)], name) as unknown as File;
};

const parseRealFiles = async (): Promise<ParsedRealFile[]> => {
  if (!fs.existsSync(SOURCE_DIR)) {
    block("realDirectoryMissing", { sourceDirHash: safeCode(SOURCE_DIR) });
  }
  const filePaths = findFiles(SOURCE_DIR);
  if (filePaths.length < 18) block("realFileCountTooSmall", { count: filePaths.length });

  const parsed: ParsedRealFile[] = [];
  for (const absolutePath of filePaths) {
    const extension = path.extname(absolutePath).toLowerCase();
    const preliminaryFile = new NodeFile([new Uint8Array(fs.readFileSync(absolutePath))], `precheck${extension}`) as unknown as File;
    const sheets = await parseExcelWorkbook(preliminaryFile);
    const rows = allRows(sheets);
    const dates = dateCandidatesFor(absolutePath, rows);
    parsed.push({
      absolutePath,
      extension,
      safeCode: safeCode(path.relative(SOURCE_DIR, absolutePath)),
      file: fileForPath(absolutePath, dates),
      sheets,
      fileType: detectFileType(sheets),
      dates,
      rowCount: rows.length,
    });
  }
  return parsed;
};

const runtimeDescriptors = (files: ParsedRealFile[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file: file.file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const hasAllExpectedDates = (dates: Set<string>): boolean =>
  EXPECTED_DATES.every((date) => dates.has(date));

const datesFor = (records: Array<{ date: string | null }>): Set<string> =>
  new Set(records.map((record) => record.date).filter((date): date is string => Boolean(date)));

const productMetricDates = (dataset: BIDataSet): Set<string> =>
  new Set(dataset.productMetrics.map((record) => record.date));

const planMetricDates = (dataset: BIDataSet): Set<string> =>
  new Set(dataset.planMetrics.map((record) => record.date));

const recordCount = (dataset: BIDataSet): number =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length +
  dataset.afterSalesMetrics.length;

const normalizeStatus = (value: unknown): string => asText(value)?.replace(/\s+/g, "") ?? "";

const isSuccessfulRefund = (row: Record<string, unknown>): boolean => {
  const refundStatus = normalizeStatus(readValue(row, "refundStatus"));
  if (refundStatus) return refundStatus.includes("成功");
  return parseBusinessDate(readValue(row, "refundCompletedAt")) !== null;
};

const isShippedRefund = (row: Record<string, unknown>): boolean => {
  const statusText = `${normalizeStatus(readValue(row, "shipmentStatus"))}${normalizeStatus(readValue(row, "signedStatus"))}`;
  if (!statusText || /未发货/.test(statusText)) return false;
  return /已寄回|已收到货|已发货|已退货|已签收|退货退款|退货/.test(statusText);
};

const isSignedRefund = (row: Record<string, unknown>): boolean => {
  const statusText = `${normalizeStatus(readValue(row, "signedStatus"))}${normalizeStatus(readValue(row, "shipmentStatus"))}`;
  return /已收到货|已签收|签收/.test(statusText);
};

const afterSalesDateForRow = (row: Record<string, unknown>, file: ParsedRealFile): string | null =>
  parseBusinessDate(readValue(row, "refundCompletedAt")) ??
  parseBusinessDate(readValue(row, "refundAppliedAt")) ??
  parseBusinessDate(readValue(row, "date")) ??
  file.dates[0] ??
  null;

const summarizeSourceTotals = (files: ParsedRealFile[]): Totals => {
  const totals = emptyTotals();
  const seenProductMetric = new Set<string>();
  const seenPlanMetric = new Set<string>();
  const seenSearchTotal = new Set<string>();
  const seenSearchProduct = new Set<string>();

  files.forEach((file) => {
    const rows = allRows(file.sheets);
    rows.forEach((row) => {
      const rowDate = parseBusinessDate(readValue(row, "date")) ?? file.dates[0] ?? null;
      if (file.fileType !== "after_sales" && (!rowDate || !EXPECTED_DATES.includes(rowDate))) return;

      if (file.fileType === "product_metric") {
        const productId = asText(readValue(row, "productId"));
        if (!productId || !rowDate) return;
        const key = `${productId}::${rowDate}`;
        if (seenProductMetric.has(key)) return;
        seenProductMetric.add(key);
        totals.gmv = add(totals.gmv, parseNumber(readValue(row, "gmv")));
        totals.gsv = add(totals.gsv, parseNumber(readValue(row, "gsv")));
        totals.visitors = add(totals.visitors, parseNumber(readValue(row, "visitors")));
        totals.paidBuyers = add(totals.paidBuyers, parseNumber(readValue(row, "buyers")));
      } else if (file.fileType === "plan_metric") {
        const productId = asText(readValue(row, "productId"));
        if (!productId || !rowDate) return;
        const key = `${productId}::${rowDate}`;
        if (seenPlanMetric.has(key)) return;
        seenPlanMetric.add(key);
        totals.spend = add(totals.spend, parseNumber(readValue(row, "spend")));
        totals.clicks = add(totals.clicks, parseNumber(readValue(row, "clicks")));
      } else if (file.fileType === "search_total") {
        const keyword = asText(readValue(row, "keyword"));
        if (!keyword || !rowDate) return;
        const key = searchTotalKeywordDedupKeyV2({
          platformCode: "tmall",
          platformName: "天猫",
          storeId: "tmall-default-store",
          storeName: "天猫默认店铺",
          date: rowDate,
          keyword,
          visitors: null,
          buyers: null,
          gmv: null,
        });
        if (seenSearchTotal.has(key)) return;
        seenSearchTotal.add(key);
        totals.searchTotalVisitors = add(totals.searchTotalVisitors, parseNumber(readValue(row, "visitors")));
        totals.searchTotalBuyers = add(totals.searchTotalBuyers, parseNumber(readValue(row, "buyers")));
      } else if (file.fileType === "search_product") {
        const productId = asText(readValue(row, "productId"));
        const keyword = asText(readValue(row, "keyword"));
        if (!productId || !keyword || !rowDate) return;
        const key = searchProductKeywordDedupKeyV2({
          platformCode: "tmall",
          platformName: "天猫",
          storeId: "tmall-default-store",
          storeName: "天猫默认店铺",
          date: rowDate,
          productId,
          keyword,
          visitors: null,
          buyers: null,
        });
        if (seenSearchProduct.has(key)) return;
        seenSearchProduct.add(key);
        totals.searchProductVisitors = add(totals.searchProductVisitors, parseNumber(readValue(row, "visitors")));
        totals.searchProductBuyers = add(totals.searchProductBuyers, parseNumber(readValue(row, "buyers")));
      } else if (file.fileType === "after_sales") {
        const afterSalesDate = afterSalesDateForRow(row, file);
        if (!afterSalesDate || !EXPECTED_DATES.includes(afterSalesDate) || !isSuccessfulRefund(row)) return;
        const refundAmount = parseNumber(readValue(row, "refundAmount"));
        totals.refundCount = add(totals.refundCount, 1);
        totals.refundAmount = add(totals.refundAmount, refundAmount);
        if (isShippedRefund(row)) {
          totals.shippedRefundCount = add(totals.shippedRefundCount, 1);
          totals.shippedRefundAmount = add(totals.shippedRefundAmount, refundAmount);
        }
        if (isSignedRefund(row)) {
          totals.signedRefundCount = add(totals.signedRefundCount, 1);
          totals.signedRefundAmount = add(totals.signedRefundAmount, refundAmount);
        }
      }
    });
  });

  return totals;
};

const summarizeRuntimeTotals = (dataset: BIDataSet): Totals => {
  const totals = emptyTotals();

  dataset.productMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
    totals.gmv = add(totals.gmv, row.gmv);
    totals.gsv = add(totals.gsv, row.gsv);
    totals.visitors = add(totals.visitors, row.visitors);
    totals.paidBuyers = add(totals.paidBuyers, row.buyers);
  });
  dataset.planMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date) || !row.productId) return;
    totals.spend = add(totals.spend, row.spend);
    totals.clicks = add(totals.clicks, row.clicks);
  });
  dataset.searchTotalKeywords.forEach((row) => {
    if (!row.date || !EXPECTED_DATES.includes(row.date)) return;
    totals.searchTotalVisitors = add(totals.searchTotalVisitors, row.visitors);
    totals.searchTotalBuyers = add(totals.searchTotalBuyers, row.buyers);
  });
  dataset.searchProductKeywords.forEach((row) => {
    if (!row.date || !EXPECTED_DATES.includes(row.date)) return;
    totals.searchProductVisitors = add(totals.searchProductVisitors, row.visitors);
    totals.searchProductBuyers = add(totals.searchProductBuyers, row.buyers);
  });
  dataset.afterSalesMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
    totals.refundAmount = add(totals.refundAmount, row.refundAmount);
    totals.refundCount = add(totals.refundCount, row.refundCount);
    totals.shippedRefundAmount = add(totals.shippedRefundAmount, row.shippedRefundAmount);
    totals.shippedRefundCount = add(totals.shippedRefundCount, row.shippedRefundCount);
    totals.signedRefundAmount = add(totals.signedRefundAmount, row.signedRefundAmount);
    totals.signedRefundCount = add(totals.signedRefundCount, row.signedRefundCount);
  });

  return totals;
};

const summarizePlanLevelCoverage = (dataset: BIDataSet): Pick<Totals, "spend" | "clicks"> & { rowCount: number } => {
  let rowCount = 0;
  let spend: number | null = null;
  let clicks: number | null = null;
  dataset.planMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date) || row.productId || !row.planId) return;
    rowCount += 1;
    spend = add(spend, row.spend);
    clicks = add(clicks, row.clicks);
  });
  return { rowCount, spend, clicks };
};

const closeEnough = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.0001;
};

const compareTotals = (source: Totals, runtime: Totals): Record<keyof Totals, boolean> => ({
  gmv: closeEnough(source.gmv, runtime.gmv),
  gsv: closeEnough(source.gsv, runtime.gsv),
  visitors: closeEnough(source.visitors, runtime.visitors),
  paidBuyers: closeEnough(source.paidBuyers, runtime.paidBuyers),
  spend: closeEnough(source.spend, runtime.spend),
  clicks: closeEnough(source.clicks, runtime.clicks),
  searchTotalVisitors: closeEnough(source.searchTotalVisitors, runtime.searchTotalVisitors),
  searchTotalBuyers: closeEnough(source.searchTotalBuyers, runtime.searchTotalBuyers),
  searchProductVisitors: closeEnough(source.searchProductVisitors, runtime.searchProductVisitors),
  searchProductBuyers: closeEnough(source.searchProductBuyers, runtime.searchProductBuyers),
  refundAmount: closeEnough(source.refundAmount, runtime.refundAmount),
  refundCount: closeEnough(source.refundCount, runtime.refundCount),
  shippedRefundAmount: closeEnough(source.shippedRefundAmount, runtime.shippedRefundAmount),
  shippedRefundCount: closeEnough(source.shippedRefundCount, runtime.shippedRefundCount),
  signedRefundAmount: closeEnough(source.signedRefundAmount, runtime.signedRefundAmount),
  signedRefundCount: closeEnough(source.signedRefundCount, runtime.signedRefundCount),
});

const duplicateKeys = <T>(records: T[], keyFor: (record: T) => string): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  records.forEach((record) => {
    const key = keyFor(record);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  });
  return Array.from(duplicates);
};

const duplicateDatesRetained = (
  records: Array<{ platformCode: string; storeId: string; productId?: string; keyword: string; date: string | null }>,
  includeProduct: boolean,
): boolean => {
  const grouped = new Map<string, Set<string>>();
  records.forEach((record) => {
    if (!record.date) return;
    const key = includeProduct
      ? `${record.platformCode}::${record.storeId}::${record.productId ?? ""}::${record.keyword}`
      : `${record.platformCode}::${record.storeId}::${record.keyword}`;
    const dates = grouped.get(key) ?? new Set<string>();
    dates.add(record.date);
    grouped.set(key, dates);
  });
  return Array.from(grouped.values()).some((dates) => dates.size > 1);
};

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;
  onupgradeneeded: RequestHandler = null;

  succeed(value: T) {
    this.result = JSON.parse(JSON.stringify(value)) as T;
    setTimeout(() => this.onsuccess?.(), 0);
  }
}

class FakeObjectStore {
  constructor(private readonly config: FakeObjectStoreConfig) {}

  put(value: Record<string, unknown>) {
    const request = new FakeRequest<IDBValidKey>();
    const key = String(value[this.config.keyPath]);
    this.config.records.set(key, JSON.parse(JSON.stringify(value)));
    request.succeed(key);
    return request as unknown as IDBRequest<IDBValidKey>;
  }

  getAll() {
    const request = new FakeRequest<unknown[]>();
    request.succeed([...this.config.records.values()].map((record) => JSON.parse(JSON.stringify(record))));
    return request as unknown as IDBRequest<unknown[]>;
  }

  delete(key: string) {
    const request = new FakeRequest<undefined>();
    this.config.records.delete(key);
    request.succeed(undefined);
    return request as unknown as IDBRequest<undefined>;
  }
}

class FakeTransaction {
  oncomplete: RequestHandler = null;
  onerror: RequestHandler = null;
  onabort: RequestHandler = null;
  error: Error | null = null;

  constructor(private readonly stores: Map<string, FakeObjectStoreConfig>) {
    setTimeout(() => this.oncomplete?.(), 5);
  }

  objectStore(name: string) {
    const config = this.stores.get(name);
    if (!config) throw new Error(`fake_store_missing:${name}`);
    return new FakeObjectStore(config) as unknown as IDBObjectStore;
  }
}

class FakeDatabase {
  objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  } as DOMStringList;

  constructor(readonly stores: Map<string, FakeObjectStoreConfig>) {}

  createObjectStore(name: string, options: IDBObjectStoreParameters) {
    this.stores.set(name, {
      keyPath: String(options.keyPath),
      records: new Map(),
    });
    return new FakeObjectStore(this.stores.get(name)!) as unknown as IDBObjectStore;
  }

  transaction(storeNames: string | string[]) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    names.forEach((name) => {
      if (!this.stores.has(name)) throw new Error(`fake_store_missing:${name}`);
    });
    return new FakeTransaction(this.stores) as unknown as IDBTransaction;
  }

  close() {}
}

class FakeIndexedDBFactory {
  private readonly databases = new Map<string, FakeDatabase>();

  open(name: string) {
    const request = new FakeRequest<IDBDatabase>();
    let db = this.databases.get(name);
    const isNewDatabase = !db;
    if (!db) {
      db = new FakeDatabase(new Map());
      this.databases.set(name, db);
    }
    request.result = db as unknown as IDBDatabase;
    setTimeout(() => {
      if (isNewDatabase) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request as unknown as IDBOpenDBRequest;
  }
}

const targetRecord = (): TargetDraftRecord => ({
  schemaVersion: TARGET_DRAFT_SCHEMA_VERSION,
  targetId: "pipeline-v2-target-isolation",
  scope: "platform",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  seriesId: null,
  productId: null,
  month: "2026-06",
  metricKey: "adRoi",
  targetValue: 2.5,
  unit: "倍",
  createdAt: "2026-07-02T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  status: "active",
});

const safeJson = (value: unknown): string => JSON.stringify(value);

const hasInvalidOrSensitiveOutput = (value: unknown): boolean =>
  /NaN|Infinity|undefined|rawRows|previewRows|订单号|退款编号|交易号|电话|地址|物流信息|买家说明|商家备注原文|BEGIN PRIVATE KEY/i.test(
    safeJson(value),
  );

const changedForbiddenFiles = (): string[] => {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split("\n")
    .map((line) => line.trim().replace(/^.. /, ""))
    .filter(Boolean)
    .filter((file) =>
      file === "package.json" ||
      file === "package-lock.json" ||
      file === "vercel.json" ||
      file.startsWith(".vercel/") ||
      file.startsWith("private-samples/") ||
      file.startsWith("lib/storage/") ||
      file.startsWith("lib/tmall/") ||
      file.startsWith("lib/v05/"),
    );
};

const taskStatus = (task: TaskName): Status =>
  checks.some((check) => check.task === task && !check.pass) ? "FAIL" : "PASS";

const main = async () => {
  const files = await parseRealFiles();
  const typeCounts = files.reduce<Record<string, number>>((counts, file) => {
    counts[file.fileType] = (counts[file.fileType] ?? 0) + 1;
    return counts;
  }, {});

  addCheck("ETL_FILE_ROUTER_V2_FIX", "realDailyFilesFound", files.length >= 18, { count: files.length });
  addCheck("ETL_FILE_ROUTER_V2_FIX", "afterSalesDetectedAsAfterSales", (typeCounts.after_sales ?? 0) >= 1, typeCounts);
  addCheck("ETL_FILE_ROUTER_V2_FIX", "planLevelAdPlanRoutedToPlanMetric", (typeCounts.plan_metric ?? 0) >= 2, typeCounts);
  addCheck("ETL_FILE_ROUTER_V2_FIX", "noUnknownDailyFiles", (typeCounts.unknown ?? 0) === 0, typeCounts);

  clearRuntimeBIDataSet();
  const allResult = await runETLRuntime(runtimeDescriptors(files));
  const allDataset = allResult.dataset;
  const allAtOnceRecordCount = recordCount(allDataset);
  const issueCodes = Array.from(new Set([...allResult.issues, ...allResult.errorQueue].map((issue) => issue.code))).sort();

  addCheck(
    "ETL_FILE_ROUTER_V2_FIX",
    "planLevelAdPlanAcceptedWithoutUnsupportedIssue",
    !issueCodes.includes("etl_plan_summary_without_product_id_unsupported") &&
      allDataset.planMetrics.some((metric) => !metric.productId && !!metric.planId),
    {
      issueCodes,
      planLevelRows: allDataset.planMetrics.filter((metric) => !metric.productId && !!metric.planId).length,
    },
  );
  addCheck("ETL_FILE_ROUTER_V2_FIX", "afterSalesNoUnsupportedIssue", !issueCodes.includes("etl_after_sales_not_supported"), issueCodes);

  addCheck("SEARCH_KEYWORD_DEDUP_V2", "searchTotalDatesComplete", hasAllExpectedDates(datesFor(allDataset.searchTotalKeywords)), Array.from(datesFor(allDataset.searchTotalKeywords)).sort());
  addCheck("SEARCH_KEYWORD_DEDUP_V2", "searchProductDatesComplete", hasAllExpectedDates(datesFor(allDataset.searchProductKeywords)), Array.from(datesFor(allDataset.searchProductKeywords)).sort());
  addCheck("SEARCH_KEYWORD_DEDUP_V2", "searchTotalNoDuplicateDateKeyword", duplicateKeys(allDataset.searchTotalKeywords, searchTotalKeywordDedupKeyV2).length === 0);
  addCheck("SEARCH_KEYWORD_DEDUP_V2", "searchProductNoDuplicateProductDateKeyword", duplicateKeys(allDataset.searchProductKeywords, searchProductKeywordDedupKeyV2).length === 0);
  addCheck("SEARCH_KEYWORD_DEDUP_V2", "sameKeywordAcrossDifferentDatesRetained", duplicateDatesRetained(allDataset.searchTotalKeywords, false));
  addCheck("SEARCH_KEYWORD_DEDUP_V2", "sameProductKeywordAcrossDifferentDatesRetained", duplicateDatesRetained(allDataset.searchProductKeywords, true));

  clearRuntimeBIDataSet();
  const perDateRuns: Array<{ date: string; inputFiles: number; recordCount: number; dates: string[] }> = [];
  let previousRecordCount = 0;
  for (const date of EXPECTED_DATES) {
    const dateFiles = files.filter((file) => file.dates.includes(date));
    const result = await runETLRuntime(runtimeDescriptors(dateFiles));
    const runtime = getRuntimeBIDataSet() ?? result.dataset;
    const runtimeDates = new Set<string>([
      ...Array.from(productMetricDates(runtime)),
      ...Array.from(planMetricDates(runtime)),
      ...Array.from(datesFor(runtime.searchTotalKeywords)),
      ...Array.from(datesFor(runtime.searchProductKeywords)),
      ...Array.from(datesFor(runtime.afterSalesMetrics)),
    ]);
    const nextRecordCount = recordCount(runtime);
    addCheck("RUNTIME_DATASET_APPEND_STRICT_V1", `appendDoesNotShrinkAfter${date}`, nextRecordCount >= previousRecordCount, { previousRecordCount, nextRecordCount });
    previousRecordCount = nextRecordCount;
    perDateRuns.push({
      date,
      inputFiles: dateFiles.length,
      recordCount: nextRecordCount,
      dates: Array.from(runtimeDates).sort(),
    });
  }

  const perDateRuntime = getRuntimeBIDataSet();
  if (!perDateRuntime) block("runtimeMissingAfterPerDateImports");
  const perDateRuntimeDataset = perDateRuntime as BIDataSet;
  const perDateRecordCount = recordCount(perDateRuntimeDataset);
  const perDateDates = new Set<string>([
    ...Array.from(productMetricDates(perDateRuntimeDataset)),
    ...Array.from(planMetricDates(perDateRuntimeDataset)),
    ...Array.from(datesFor(perDateRuntimeDataset.searchTotalKeywords)),
    ...Array.from(datesFor(perDateRuntimeDataset.searchProductKeywords)),
    ...Array.from(datesFor(perDateRuntimeDataset.afterSalesMetrics)),
  ]);
  addCheck("RUNTIME_DATASET_APPEND_STRICT_V1", "perDateImportsMergeNotReplace", hasAllExpectedDates(perDateDates), { perDateRuns, finalDates: Array.from(perDateDates).sort() });
  await runETLRuntime(runtimeDescriptors(files));
  const afterDuplicateImport = getRuntimeBIDataSet();
  addCheck("RUNTIME_DATASET_APPEND_STRICT_V1", "duplicateImportDoesNotDoubleRuntime", !!afterDuplicateImport && recordCount(afterDuplicateImport) === perDateRecordCount, {
    before: perDateRecordCount,
    after: afterDuplicateImport ? recordCount(afterDuplicateImport) : null,
  });
  addCheck("RUNTIME_DATASET_APPEND_STRICT_V1", "allAtOnceAndAppendRecordCountsMatch", perDateRecordCount === allAtOnceRecordCount, { allAtOnceRecordCount, perDateRecordCount });

  const centerP1 = { id: "center-p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] };
  const p1Filter = { brandWords: [], modelWords: [], centerWordGroups: [centerP1] };
  const legacyP1Filter = { brandWords: [], modelWords: ["P1"], centerWordGroups: [] };
  const p1Rows = [
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-26", keyword: "P1", visitors: 10, buyers: 1, gmv: null },
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-27", keyword: "KJ60F-P1", visitors: 20, buyers: 2, gmv: null },
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-28", keyword: "KJ60P1", visitors: 30, buyers: 3, gmv: null },
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-29", keyword: "KJ500F-P1", visitors: 40, buyers: 4, gmv: null },
    { platformCode: "tmall", platformName: "天猫", storeId: "tmall-default-store", storeName: "天猫默认店铺", date: "2026-06-30", keyword: "P2", visitors: 50, buyers: 5, gmv: null },
  ];
  const p1Aggregate = aggregateSearchTotalKeywords(p1Rows, p1Filter);
  const legacyAggregate = aggregateSearchTotalKeywords(p1Rows, legacyP1Filter);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "legacyModelWordsNormalizeToCenterWordGroup", (normalizeBrandModelFilter(legacyP1Filter).centerWordGroups ?? []).length === 1);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "p1AliasesMatchThroughUnifiedResolver", p1Aggregate.visitors === 60 && p1Aggregate.buyers === 6, p1Aggregate);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "legacyModelWordsUseSameResolver", legacyAggregate.visitors === 60 && legacyAggregate.buyers === 6, legacyAggregate);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "kj60fP1Included", resolveBrandCenterMatch("KJ60F-P1", p1Filter).matchesCenterWord);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "kj60P1Included", resolveBrandCenterMatch("KJ60P1", p1Filter).matchesCenterWord);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "kj500fP1Excluded", !resolveBrandCenterMatch("KJ500F-P1", p1Filter).matchesCenterWord);
  addCheck("BRAND_CENTER_UNIFIED_RESOLVER_V1", "p2ExcludedFromP1", !resolveBrandCenterMatch("P2", p1Filter).matchesCenterWord);

  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: new FakeIndexedDBFactory(),
  });
  const beforeTargetRuntime = safeJson(getRuntimeBIDataSet());
  const savedTarget = await saveTargetDraft(targetRecord());
  const activeTargets = await loadActiveTargetDrafts({ scope: "platform", metricKey: "adRoi" });
  const afterTargetRuntime = safeJson(getRuntimeBIDataSet());
  addCheck("TARGET_DRAFTS_ISOLATION_V1", "targetDraftCanPersistSeparately", savedTarget.status === "saved" && activeTargets.status === "ok" && activeTargets.records.length === 1, { saved: savedTarget.status, loaded: activeTargets.status });
  addCheck("TARGET_DRAFTS_ISOLATION_V1", "targetDraftDoesNotMutateRuntimeDataset", beforeTargetRuntime === afterTargetRuntime);
  addCheck("TARGET_DRAFTS_ISOLATION_V1", "runtimeDatasetHasNoTargetsField", !("targets" in (allDataset as unknown as Record<string, unknown>)));

  const sourceTotals = summarizeSourceTotals(files);
  const runtimeTotals = summarizeRuntimeTotals(allDataset);
  const planLevelCoverage = summarizePlanLevelCoverage(allDataset);
  const totalChecks = compareTotals(sourceTotals, runtimeTotals);
  addCheck("RECONCILIATION", "businessTotalsMatch", totalChecks.gmv && totalChecks.gsv && totalChecks.visitors && totalChecks.paidBuyers, { sourceTotals, runtimeTotals });
  addCheck("RECONCILIATION", "planTotalsMatch", totalChecks.spend && totalChecks.clicks, { sourceTotals, runtimeTotals });
  addCheck(
    "RECONCILIATION",
    "planLevelCoverageLayeredWithoutChangingAuthoritativeTotals",
    planLevelCoverage.rowCount > 0 && totalChecks.spend && totalChecks.clicks,
    { planLevelCoverage, sourceTotals, runtimeTotals },
  );
  addCheck("RECONCILIATION", "searchTotalsMatch", totalChecks.searchTotalVisitors && totalChecks.searchTotalBuyers && totalChecks.searchProductVisitors && totalChecks.searchProductBuyers, { sourceTotals, runtimeTotals });
  addCheck("RECONCILIATION", "afterSalesTotalsMatch", totalChecks.refundAmount && totalChecks.refundCount && totalChecks.shippedRefundAmount && totalChecks.shippedRefundCount && totalChecks.signedRefundAmount && totalChecks.signedRefundCount, { sourceTotals, runtimeTotals });
  addCheck("RECONCILIATION", "june26ToJune30FullyStable", hasAllExpectedDates(productMetricDates(allDataset)) && hasAllExpectedDates(planMetricDates(allDataset)) && hasAllExpectedDates(datesFor(allDataset.searchTotalKeywords)) && hasAllExpectedDates(datesFor(allDataset.searchProductKeywords)) && hasAllExpectedDates(datesFor(allDataset.afterSalesMetrics)), {
    productMetric: Array.from(productMetricDates(allDataset)).sort(),
    planMetric: Array.from(planMetricDates(allDataset)).sort(),
    searchTotal: Array.from(datesFor(allDataset.searchTotalKeywords)).sort(),
    searchProduct: Array.from(datesFor(allDataset.searchProductKeywords)).sort(),
    afterSales: Array.from(datesFor(allDataset.afterSalesMetrics)).sort(),
  });

  const forbiddenFiles = changedForbiddenFiles();
  addCheck("SAFETY", "noForbiddenPackageStorageTmallV05Changes", forbiddenFiles.length === 0, forbiddenFiles);

  const report = {
    status: "PASS" as Status,
    taskId: "TIANMAO_V1_REFACTOR_PIPELINE_V2",
    sourceDirHash: safeCode(SOURCE_DIR),
    fileCount: files.length,
    typeCounts,
    subtasks: {
      ETL_FILE_ROUTER_V2_FIX: taskStatus("ETL_FILE_ROUTER_V2_FIX"),
      RUNTIME_DATASET_APPEND_STRICT_V1: taskStatus("RUNTIME_DATASET_APPEND_STRICT_V1"),
      SEARCH_KEYWORD_DEDUP_V2: taskStatus("SEARCH_KEYWORD_DEDUP_V2"),
      BRAND_CENTER_UNIFIED_RESOLVER_V1: taskStatus("BRAND_CENTER_UNIFIED_RESOLVER_V1"),
      TARGET_DRAFTS_ISOLATION_V1: taskStatus("TARGET_DRAFTS_ISOLATION_V1"),
    },
    runtimeSummary: {
      allAtOnce: allResult.summary,
      issueCodes,
      recordCount: allAtOnceRecordCount,
      dateCoverage: {
        productMetric: Array.from(productMetricDates(allDataset)).sort(),
        planMetric: Array.from(planMetricDates(allDataset)).sort(),
        searchTotal: Array.from(datesFor(allDataset.searchTotalKeywords)).sort(),
        searchProduct: Array.from(datesFor(allDataset.searchProductKeywords)).sort(),
        afterSales: Array.from(datesFor(allDataset.afterSalesMetrics)).sort(),
      },
      perDateRuns,
    },
    reconciliationReport: {
      sourceTotals: Object.fromEntries(Object.entries(sourceTotals).map(([key, value]) => [key, round2(value)])),
      runtimeTotals: Object.fromEntries(Object.entries(runtimeTotals).map(([key, value]) => [key, round2(value)])),
      planLevelCoverage: {
        rowCount: planLevelCoverage.rowCount,
        spend: round2(planLevelCoverage.spend),
        clicks: round2(planLevelCoverage.clicks),
      },
      totalChecks,
    },
    stableRange: {
      range: "2026-06-26~2026-06-30",
      fullyStable: checks.find((check) => check.name === "june26ToJune30FullyStable")?.pass ?? false,
    },
    checks,
  };

  addCheck("SAFETY", "noInvalidOrSensitiveOutput", !hasInvalidOrSensitiveOutput(report));
  report.checks = checks;
  const failed = checks.filter((check) => !check.pass);
  report.status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  const status: Status = error instanceof Error && error.name === "BlockedAuditError" ? "BLOCKED" : "FAIL";
  console.log(JSON.stringify({
    status,
    taskId: "TIANMAO_V1_REFACTOR_PIPELINE_V2",
    checks,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
