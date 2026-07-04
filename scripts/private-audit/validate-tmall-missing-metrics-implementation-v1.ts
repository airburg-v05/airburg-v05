import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIDataPoint, BIHomeDataStatus } from "../../lib/bi/bi.types";
import { createEmptyHomeBIDataSource, loadHomeBIDataSource, type BIHomeDataSource } from "../../lib/bi/bi.data-source";
import { parseBusinessDate } from "../../lib/etl/date";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import { detectFileType, findField } from "../../lib/etl/runtime/file-router";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface ParsedRealFile {
  absolutePath: string;
  file: File;
  sheets: ParsedExcelSheet[];
  fileType: ETLSourceType;
  dates: string[];
}

interface MetricTotals {
  gmv: number | null;
  gsv: number | null;
  visitors: number | null;
  paidBuyers: number | null;
  adSpend: number | null;
  adClicks: number | null;
  refundAmount: number | null;
  refundCount: number | null;
  shippedRefundAmount: number | null;
  shippedRefundCount: number | null;
  signedRefundAmount: number | null;
  signedRefundCount: number | null;
  directTransactionAmount: number | null;
  indirectTransactionAmount: number | null;
  totalTransactionAmount: number | null;
}

const ROOT = process.cwd();
const SOURCE_DIR = process.env.TMALL_DAILY_SOURCE_DIR ?? "/Users/zongji/Desktop/每日平台数据/天猫";
const EXPECTED_DATES = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const block = (name: string, details?: unknown): never => {
  addCheck(name, false, details);
  const error = new Error(name);
  error.name = "BlockedAuditError";
  throw error;
};

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const parseNumber = (value: unknown): number | null => {
  const text = asText(value);
  if (!text || ["--", "-", "—", "null", "undefined", "nan"].includes(text.toLowerCase())) return null;
  const normalized = text.replace(/[,，￥¥元%]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return text.includes("%") ? parsed / 100 : parsed;
};

const readValue = (row: Record<string, unknown>, field: Parameters<typeof findField>[1]): unknown => {
  const actualField = findField(row, field);
  return actualField ? row[actualField] : null;
};

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const rowsFor = (sheets: ParsedExcelSheet[]): Record<string, unknown>[] =>
  sheets.flatMap((sheet) => sheet.rows).filter(hasAnyValue);

const add = (current: number | null, value: number | null): number | null =>
  value === null ? current : (current ?? 0) + value;

const closeEnough = (left: number | null, right: number | null): boolean => {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.0001;
};

const rounded = (value: number | null, digits = 4): number | null =>
  value === null ? null : Number(value.toFixed(digits));

const dividePositive = (numerator: number | null, denominator: number | null): number | null => {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
};

const emptyTotals = (): MetricTotals => ({
  gmv: null,
  gsv: null,
  visitors: null,
  paidBuyers: null,
  adSpend: null,
  adClicks: null,
  refundAmount: null,
  refundCount: null,
  shippedRefundAmount: null,
  shippedRefundCount: null,
  signedRefundAmount: null,
  signedRefundCount: null,
  directTransactionAmount: null,
  indirectTransactionAmount: null,
  totalTransactionAmount: null,
});

const findFiles = (directory: string): string[] => {
  const files: string[] = [];
  const walk = (current: string) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        return;
      }
      if (/\.(xlsx?|csv)$/i.test(entry.name)) files.push(next);
    });
  };
  walk(directory);
  return files.sort();
};

const fileForPath = (absolutePath: string): File =>
  new NodeFile([new Uint8Array(fs.readFileSync(absolutePath))], path.basename(absolutePath)) as unknown as File;

const dateCandidates = (absolutePath: string, rows: Record<string, unknown>[]): string[] => {
  const dates = new Set<string>();
  const pathDate = parseBusinessDate(absolutePath);
  if (pathDate) dates.add(pathDate);
  rows.forEach((row) => {
    [
      parseBusinessDate(readValue(row, "date")),
      parseBusinessDate(readValue(row, "refundCompletedAt")),
      parseBusinessDate(readValue(row, "refundAppliedAt")),
    ].forEach((date) => {
      if (date) dates.add(date);
    });
  });
  return Array.from(dates).sort();
};

const parseRealFiles = async (): Promise<ParsedRealFile[]> => {
  if (!fs.existsSync(SOURCE_DIR)) block("realSourceDirectoryMissing");
  const filePaths = findFiles(SOURCE_DIR);
  if (filePaths.length < 18) block("real18FilesMissing", { count: filePaths.length });

  const parsed: ParsedRealFile[] = [];
  for (const absolutePath of filePaths) {
    const file = fileForPath(absolutePath);
    const sheets = await parseExcelWorkbook(file);
    const rows = rowsFor(sheets);
    parsed.push({
      absolutePath,
      file,
      sheets,
      fileType: detectFileType(sheets),
      dates: dateCandidates(absolutePath, rows),
    });
  }
  return parsed;
};

const descriptorsFor = (files: ParsedRealFile[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file: file.file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const datesFor = (records: Array<{ date: string | null }>): Set<string> =>
  new Set(records.map((record) => record.date).filter((date): date is string => Boolean(date)));

const hasExpectedDates = (dates: Set<string>): boolean => EXPECTED_DATES.every((date) => dates.has(date));

const normalizeStatus = (value: unknown): string => asText(value)?.replace(/\s+/g, "") ?? "";

const isSuccessfulRefund = (row: Record<string, unknown>): boolean => {
  const status = normalizeStatus(readValue(row, "refundStatus"));
  if (status) return status.includes("成功");
  return parseBusinessDate(readValue(row, "refundCompletedAt")) !== null;
};

const isShippedRefund = (row: Record<string, unknown>): boolean => {
  const status = `${normalizeStatus(readValue(row, "shipmentStatus"))}${normalizeStatus(readValue(row, "signedStatus"))}`;
  if (!status || /未发货/.test(status)) return false;
  return /已寄回|已收到货|已发货|已退货|已签收|退货退款|退货/.test(status);
};

const isSignedRefund = (row: Record<string, unknown>): boolean => {
  const status = `${normalizeStatus(readValue(row, "signedStatus"))}${normalizeStatus(readValue(row, "shipmentStatus"))}`;
  return /已收到货|已签收|签收/.test(status);
};

const refundDateFor = (row: Record<string, unknown>, file: ParsedRealFile): string | null =>
  parseBusinessDate(readValue(row, "refundCompletedAt")) ??
  parseBusinessDate(readValue(row, "refundAppliedAt")) ??
  parseBusinessDate(readValue(row, "date")) ??
  file.dates[0] ??
  null;

const summarizeRuntimeTotals = (dataset: BIDataSet): MetricTotals => {
  const totals = emptyTotals();
  dataset.productMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
    totals.gmv = add(totals.gmv, row.gmv);
    totals.gsv = add(totals.gsv, row.gsv);
    totals.visitors = add(totals.visitors, row.visitors);
    totals.paidBuyers = add(totals.paidBuyers, row.buyers);
  });
  dataset.planMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
    totals.adSpend = add(totals.adSpend, row.spend);
    totals.adClicks = add(totals.adClicks, row.clicks);
    totals.directTransactionAmount = add(totals.directTransactionAmount, row.directTransactionAmount ?? null);
    totals.indirectTransactionAmount = add(totals.indirectTransactionAmount, row.indirectTransactionAmount ?? null);
    totals.totalTransactionAmount = add(totals.totalTransactionAmount, row.totalTransactionAmount ?? null);
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

const summarizeSourcePlanTransactionTotals = (files: ParsedRealFile[]): Pick<MetricTotals, "directTransactionAmount" | "indirectTransactionAmount" | "totalTransactionAmount"> => {
  const totals = emptyTotals();
  const seen = new Set<string>();
  files.forEach((file) => {
    if (file.fileType !== "plan_metric") return;
    rowsFor(file.sheets).forEach((row) => {
      const productId = asText(readValue(row, "productId"));
      const date = parseBusinessDate(readValue(row, "date")) ?? file.dates[0] ?? null;
      if (!productId || !date || !EXPECTED_DATES.includes(date)) return;
      const key = `${productId}::${date}`;
      if (seen.has(key)) return;
      seen.add(key);
      totals.directTransactionAmount = add(totals.directTransactionAmount, parseNumber(readValue(row, "directTransactionAmount")));
      totals.indirectTransactionAmount = add(totals.indirectTransactionAmount, parseNumber(readValue(row, "indirectTransactionAmount")));
      totals.totalTransactionAmount = add(totals.totalTransactionAmount, parseNumber(readValue(row, "totalTransactionAmount")));
    });
  });
  return {
    directTransactionAmount: totals.directTransactionAmount,
    indirectTransactionAmount: totals.indirectTransactionAmount,
    totalTransactionAmount: totals.totalTransactionAmount,
  };
};

const summarizeSourceAfterSales = (files: ParsedRealFile[]): Pick<MetricTotals, "refundAmount" | "refundCount" | "shippedRefundAmount" | "shippedRefundCount" | "signedRefundAmount" | "signedRefundCount"> => {
  const totals = emptyTotals();
  files.forEach((file) => {
    if (file.fileType !== "after_sales") return;
    rowsFor(file.sheets).forEach((row) => {
      const date = refundDateFor(row, file);
      if (!date || !EXPECTED_DATES.includes(date) || !isSuccessfulRefund(row)) return;
      const refundAmount = parseNumber(readValue(row, "refundAmount"));
      totals.refundAmount = add(totals.refundAmount, refundAmount);
      totals.refundCount = add(totals.refundCount, 1);
      if (isShippedRefund(row)) {
        totals.shippedRefundAmount = add(totals.shippedRefundAmount, refundAmount);
        totals.shippedRefundCount = add(totals.shippedRefundCount, 1);
      }
      if (isSignedRefund(row)) {
        totals.signedRefundAmount = add(totals.signedRefundAmount, refundAmount);
        totals.signedRefundCount = add(totals.signedRefundCount, 1);
      }
    });
  });
  return {
    refundAmount: totals.refundAmount,
    refundCount: totals.refundCount,
    shippedRefundAmount: totals.shippedRefundAmount,
    shippedRefundCount: totals.shippedRefundCount,
    signedRefundAmount: totals.signedRefundAmount,
    signedRefundCount: totals.signedRefundCount,
  };
};

const buildState = () => ({
  ...createDefaultBIState(),
  selectedStores: ["tmall-default-store"],
  timeRange: { mode: "custom" as const, startDate: "2026-06-26", endDate: "2026-06-30" },
});

const cardRawValue = (source: BIHomeDataSource, title: string): number | null => {
  const card = buildHomeBIViewModel(source, buildState()).kpiCards.find((item) => item.title === title);
  return card?.rawValue ?? null;
};

const sourceWithPoints = (points: BIDataPoint[]): BIHomeDataSource => ({
  ...createEmptyHomeBIDataSource("v2_valid", "fixture"),
  mode: "v2_valid",
  points,
  seriesPoints: points,
  dataStatus: {
    mode: "v2_valid",
    label: "fixture",
    storeCount: 1,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  } satisfies BIHomeDataStatus,
  selectedDate: "2026-06-30",
});

const point = (productId: string, metrics: Record<string, number | null>): BIDataPoint => ({
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
  seriesId: null,
  seriesName: null,
  productId,
  productName: productId,
  businessDate: "2026-06-30",
  metrics,
});

const safeJson = (value: unknown): string => JSON.stringify(value);

const hasInvalidOrSensitiveOutput = (value: unknown): boolean =>
  /NaN|Infinity|undefined|rawRows|previewRows|订单号|退款编号|交易号|电话|地址|物流信息|买家说明|商家备注原文|BEGIN PRIVATE KEY/i.test(
    safeJson(value),
  );

const changedForbiddenFiles = (): string[] => {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
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

const runtimeSnapshotPreservesTransactionFields = (): boolean => {
  const source = fs.readFileSync(path.join(ROOT, "lib/persistence/runtime-dataset-persistence.ts"), "utf8");
  return [
    "directTransactionAmount: safeNumber(metric.directTransactionAmount)",
    "indirectTransactionAmount: safeNumber(metric.indirectTransactionAmount)",
    "totalTransactionAmount: safeNumber(metric.totalTransactionAmount)",
  ].every((snippet) => source.includes(snippet));
};

const recordCount = (dataset: BIDataSet): number =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length +
  dataset.afterSalesMetrics.length;

const main = async () => {
  const files = await parseRealFiles();
  const typeCounts = files.reduce<Record<string, number>>((counts, file) => {
    counts[file.fileType] = (counts[file.fileType] ?? 0) + 1;
    return counts;
  }, {});

  addCheck("real18FilesExist", files.length >= 18, { count: files.length });
  addCheck("planMetricFileDetected", (typeCounts.plan_metric ?? 0) >= 1, typeCounts);

  const sourceTransactionTotals = summarizeSourcePlanTransactionTotals(files);
  addCheck("sourceDirectTransactionAmountDetected", (sourceTransactionTotals.directTransactionAmount ?? 0) > 0, sourceTransactionTotals);
  addCheck("sourceIndirectTransactionAmountDetected", (sourceTransactionTotals.indirectTransactionAmount ?? 0) > 0, sourceTransactionTotals);
  addCheck("sourceTotalTransactionAmountDetected", (sourceTransactionTotals.totalTransactionAmount ?? 0) > 0, sourceTransactionTotals);

  clearRuntimeBIDataSet();
  const allAtOnce = await runETLRuntime(descriptorsFor(files));
  const dataset = allAtOnce.dataset;
  const runtimeTotals = summarizeRuntimeTotals(dataset);
  const sourceAfterSales = summarizeSourceAfterSales(files);

  addCheck("runtimePlanMetricAddsDirectField", dataset.planMetrics.some((row) => row.directTransactionAmount !== null && row.directTransactionAmount !== undefined));
  addCheck("runtimePlanMetricAddsIndirectField", dataset.planMetrics.some((row) => row.indirectTransactionAmount !== null && row.indirectTransactionAmount !== undefined));
  addCheck("runtimePlanMetricAddsTotalField", dataset.planMetrics.some((row) => row.totalTransactionAmount !== null && row.totalTransactionAmount !== undefined));
  addCheck("runtimeSnapshotPreservesTransactionFields", runtimeSnapshotPreservesTransactionFields());
  addCheck("runtimeDirectTotalsMatchSource", closeEnough(runtimeTotals.directTransactionAmount, sourceTransactionTotals.directTransactionAmount), { runtimeTotals, sourceTransactionTotals });
  addCheck("runtimeIndirectTotalsMatchSource", closeEnough(runtimeTotals.indirectTransactionAmount, sourceTransactionTotals.indirectTransactionAmount), { runtimeTotals, sourceTransactionTotals });
  addCheck("runtimeTotalTransactionTotalsMatchSource", closeEnough(runtimeTotals.totalTransactionAmount, sourceTransactionTotals.totalTransactionAmount), { runtimeTotals, sourceTransactionTotals });

  addCheck("gmvStill125596", closeEnough(runtimeTotals.gmv, 125596), runtimeTotals);
  addCheck("gsvStill85455_96", closeEnough(runtimeTotals.gsv, 85455.96), runtimeTotals);
  addCheck("visitorsStill143076", closeEnough(runtimeTotals.visitors, 143076), runtimeTotals);
  addCheck("paidBuyersStill128", closeEnough(runtimeTotals.paidBuyers, 128), runtimeTotals);
  addCheck("adSpendStill7625_95", closeEnough(runtimeTotals.adSpend, 7625.95), runtimeTotals);
  addCheck("adClicksStill6692", closeEnough(runtimeTotals.adClicks, 6692), runtimeTotals);
  addCheck("afterSalesStillMatchesSource", closeEnough(runtimeTotals.refundAmount, sourceAfterSales.refundAmount) && closeEnough(runtimeTotals.refundCount, sourceAfterSales.refundCount), { runtimeTotals, sourceAfterSales });

  const expectedRefundFeeRatio = dividePositive(runtimeTotals.adSpend, runtimeTotals.gsv !== null && runtimeTotals.refundAmount !== null ? runtimeTotals.gsv - runtimeTotals.refundAmount : null);
  const expectedDirectShare = dividePositive(
    runtimeTotals.directTransactionAmount,
    runtimeTotals.totalTransactionAmount ?? (
      runtimeTotals.directTransactionAmount !== null && runtimeTotals.indirectTransactionAmount !== null
        ? runtimeTotals.directTransactionAmount + runtimeTotals.indirectTransactionAmount
        : null
    ),
  );
  const source = await loadHomeBIDataSource();
  const refundFeeRatio = cardRawValue(source, "去退费比");
  const directShare = cardRawValue(source, "直接成交占比");

  addCheck("refundFeeRatioFormulaImplemented", closeEnough(refundFeeRatio, expectedRefundFeeRatio), { actual: refundFeeRatio, expected: expectedRefundFeeRatio });
  addCheck("directTransactionShareFormulaImplemented", closeEnough(directShare, expectedDirectShare), { actual: directShare, expected: expectedDirectShare });
  addCheck("homeRefundFeeRatioNoLongerFormulaNull", refundFeeRatio !== null, { refundFeeRatio });
  addCheck("homeDirectTransactionShareNoLongerMissingFieldNull", directShare !== null, { directShare });

  const invalidSource = sourceWithPoints([
    point("P1", { adSpend: 100, gsv: 80, refundAmount: 80, directTransactionAmount: 10, totalTransactionAmount: 0, indirectTransactionAmount: null }),
  ]);
  addCheck("invalidRefundFeeRatioDenominatorReturnsNull", cardRawValue(invalidSource, "去退费比") === null);
  addCheck("invalidDirectShareDenominatorReturnsNull", cardRawValue(invalidSource, "直接成交占比") === null);

  clearRuntimeBIDataSet();
  for (const date of EXPECTED_DATES) {
    const dateFiles = files.filter((file) => file.dates.includes(date));
    await runETLRuntime(descriptorsFor(dateFiles));
  }
  const appended = getRuntimeBIDataSet();
  if (!appended) block("appendedRuntimeMissing");
  const appendedDataset = appended as BIDataSet;
  addCheck("allAtOnceAndPerDateAppendConsistent", recordCount(appendedDataset) === recordCount(dataset), {
    allAtOnce: recordCount(dataset),
    appended: recordCount(appendedDataset),
  });
  await runETLRuntime(descriptorsFor(files));
  const afterDuplicate = getRuntimeBIDataSet();
  addCheck("duplicateImportDoesNotDouble", !!afterDuplicate && recordCount(afterDuplicate) === recordCount(appendedDataset), {
    before: recordCount(appendedDataset),
    after: afterDuplicate ? recordCount(afterDuplicate) : null,
  });

  const productTotals = new Map<string, number>();
  source.points.forEach((sourcePoint) => {
    if (!sourcePoint.productId) return;
    const value = sourcePoint.metrics.directTransactionAmount;
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    productTotals.set(sourcePoint.productId, (productTotals.get(sourcePoint.productId) ?? 0) + value);
  });
  const productValues = Array.from(productTotals.entries()).filter(([, value]) => value > 0);
  addCheck("seriesProductProductIdFirstDataAvailable", productValues.length >= 2, productValues.slice(0, 3));
  if (productValues.length >= 2) {
    const [leftProduct, rightProduct] = productValues;
    addCheck("seriesProductProductIdFirstDoesNotMix", leftProduct[0] !== rightProduct[0] && leftProduct[1] !== rightProduct[1], { leftProduct, rightProduct });
  }

  addCheck("p0DateCoverageStillComplete",
    hasExpectedDates(new Set(dataset.productMetrics.map((row) => row.date))) &&
    hasExpectedDates(new Set(dataset.planMetrics.map((row) => row.date))) &&
    hasExpectedDates(datesFor(dataset.searchTotalKeywords)) &&
    hasExpectedDates(datesFor(dataset.searchProductKeywords)),
    {
      productMetrics: Array.from(new Set(dataset.productMetrics.map((row) => row.date))).sort(),
      planMetrics: Array.from(new Set(dataset.planMetrics.map((row) => row.date))).sort(),
      searchTotalKeywords: Array.from(datesFor(dataset.searchTotalKeywords)).sort(),
      searchProductKeywords: Array.from(datesFor(dataset.searchProductKeywords)).sort(),
    },
  );
  addCheck("runtimeDatasetHasNoTargetsField", !("targets" in (dataset as unknown as Record<string, unknown>)));
  addCheck("noForbiddenPathChanges", changedForbiddenFiles().length === 0, changedForbiddenFiles());

  const report = {
    status: "PASS" as Status,
    taskId: "TMALL_MISSING_METRICS_IMPLEMENTATION_V1",
    fileCount: files.length,
    typeCounts,
    runtimeSummary: allAtOnce.summary,
    sourceTransactionTotals: Object.fromEntries(Object.entries(sourceTransactionTotals).map(([key, value]) => [key, rounded(value)])),
    runtimeTotals: Object.fromEntries(Object.entries(runtimeTotals).map(([key, value]) => [key, rounded(value)])),
    computedMetrics: {
      refundFeeRatio: rounded(refundFeeRatio),
      directTransactionShare: rounded(directShare),
      refundFeeRatioPercent: refundFeeRatio === null ? null : rounded(refundFeeRatio * 100, 2),
      directTransactionSharePercent: directShare === null ? null : rounded(directShare * 100, 2),
    },
    checks,
  };

  addCheck("noInvalidOrSensitiveOutput", !hasInvalidOrSensitiveOutput(report));
  report.checks = checks;
  const failed = checks.filter((check) => !check.pass);
  report.status = failed.length > 0 ? "FAIL" : "PASS";
  console.log(JSON.stringify(report, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  const status: Status = error instanceof Error && error.name === "BlockedAuditError" ? "BLOCKED" : "FAIL";
  console.log(JSON.stringify({
    status,
    taskId: "TMALL_MISSING_METRICS_IMPLEMENTATION_V1",
    checks,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
