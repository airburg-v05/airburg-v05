import { File as NodeFile } from "node:buffer";
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
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
  extension: string;
  safeCode: string;
  safeName: string;
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
}

const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const EXPECTED_DATES = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const REPO_ROOT = process.cwd();
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

const findFiles = (directory: string): string[] => {
  const found: string[] = [];
  const walk = (current: string) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        return;
      }
      if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        found.push(next);
      }
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
    const rowDate = parseBusinessDate(readValue(row, "date"));
    if (rowDate) dates.add(rowDate);
  });
  return Array.from(dates).sort();
};

const fileForPath = (absolutePath: string, dates: string[]): File => {
  const buffer = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const datePart = dates[0] ?? "no-date";
  const name = `tmall-daily-${datePart}-${safeCode(path.relative(SOURCE_DIR, absolutePath))}${extension}`;
  return new NodeFile([new Uint8Array(buffer)], name) as unknown as File;
};

const parseRealFiles = async (): Promise<ParsedRealFile[]> => {
  if (!fs.existsSync(SOURCE_DIR)) {
    block("realDirectoryMissing", { sourceDirHash: safeCode(SOURCE_DIR) });
  }
  const filePaths = findFiles(SOURCE_DIR);
  if (filePaths.length < 18) {
    block("realFileCountTooSmall", { count: filePaths.length });
  }

  const parsed: ParsedRealFile[] = [];
  for (const absolutePath of filePaths) {
    const extension = path.extname(absolutePath).toLowerCase();
    const preliminaryFile = new NodeFile([new Uint8Array(fs.readFileSync(absolutePath))], `precheck${extension}`) as unknown as File;
    const sheets = await parseExcelWorkbook(preliminaryFile);
    const rows = allRows(sheets);
    const dates = dateCandidatesFor(absolutePath, rows);
    const file = fileForPath(absolutePath, dates);
    parsed.push({
      absolutePath,
      extension,
      safeCode: safeCode(path.relative(SOURCE_DIR, absolutePath)),
      safeName: file.name,
      file,
      sheets,
      fileType: detectFileType(sheets),
      dates,
      rowCount: rows.length,
    });
  }
  return parsed;
};

const dateSetForFiles = (files: ParsedRealFile[], predicate: (file: ParsedRealFile) => boolean): Set<string> => {
  const dates = new Set<string>();
  files.filter(predicate).forEach((file) => file.dates.forEach((date) => dates.add(date)));
  return dates;
};

const hasAllExpectedDates = (dates: Set<string>): boolean =>
  EXPECTED_DATES.every((date) => dates.has(date));

const summarizeSourceTotals = (files: ParsedRealFile[]): Totals => {
  const totals: Totals = {
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
  };
  const seenProductMetric = new Set<string>();
  const seenPlanMetric = new Set<string>();
  const seenSearchTotal = new Set<string>();
  const seenSearchProduct = new Set<string>();

  files.forEach((file) => {
    const rows = allRows(file.sheets);
    rows.forEach((row) => {
      const rowDate = parseBusinessDate(readValue(row, "date")) ?? file.dates[0] ?? null;
      if (!rowDate || !EXPECTED_DATES.includes(rowDate)) return;

      if (file.fileType === "product_metric") {
        const productId = asText(readValue(row, "productId"));
        if (!productId) return;
        const key = `tmall::tmall-default-store::${productId}::${rowDate}`;
        if (seenProductMetric.has(key)) return;
        seenProductMetric.add(key);
        totals.gmv = add(totals.gmv, parseNumber(readValue(row, "gmv")));
        totals.gsv = add(totals.gsv, parseNumber(readValue(row, "gsv")));
        totals.visitors = add(totals.visitors, parseNumber(readValue(row, "visitors")));
        totals.paidBuyers = add(totals.paidBuyers, parseNumber(readValue(row, "buyers")));
      } else if (file.fileType === "plan_metric") {
        const productId = asText(readValue(row, "productId"));
        if (!productId) return;
        const key = `tmall::tmall-default-store::${productId}::${rowDate}`;
        if (seenPlanMetric.has(key)) return;
        seenPlanMetric.add(key);
        totals.spend = add(totals.spend, parseNumber(readValue(row, "spend")));
        totals.clicks = add(totals.clicks, parseNumber(readValue(row, "clicks")));
      } else if (file.fileType === "search_total") {
        const keyword = asText(readValue(row, "keyword"));
        if (!keyword) return;
        const key = `tmall::tmall-default-store::${rowDate}::${keyword}`;
        if (seenSearchTotal.has(key)) return;
        seenSearchTotal.add(key);
        totals.searchTotalVisitors = add(totals.searchTotalVisitors, parseNumber(readValue(row, "visitors")));
        totals.searchTotalBuyers = add(totals.searchTotalBuyers, parseNumber(readValue(row, "buyers")));
      } else if (file.fileType === "search_product") {
        const productId = asText(readValue(row, "productId"));
        const keyword = asText(readValue(row, "keyword"));
        if (!productId || !keyword) return;
        const key = `tmall::tmall-default-store::${productId}::${rowDate}::${keyword}`;
        if (seenSearchProduct.has(key)) return;
        seenSearchProduct.add(key);
        totals.searchProductVisitors = add(totals.searchProductVisitors, parseNumber(readValue(row, "visitors")));
        totals.searchProductBuyers = add(totals.searchProductBuyers, parseNumber(readValue(row, "buyers")));
      }
    });
  });

  return totals;
};

const summarizeRuntimeTotals = (dataset: BIDataSet): Totals => {
  const totals: Totals = {
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
  };

  dataset.productMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
    totals.gmv = add(totals.gmv, row.gmv);
    totals.gsv = add(totals.gsv, row.gsv);
    totals.visitors = add(totals.visitors, row.visitors);
    totals.paidBuyers = add(totals.paidBuyers, row.buyers);
  });
  dataset.planMetrics.forEach((row) => {
    if (!EXPECTED_DATES.includes(row.date)) return;
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

  return totals;
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
});

const datesFor = (records: Array<{ date: string | null }>): Set<string> =>
  new Set(records.map((record) => record.date).filter((date): date is string => Boolean(date)));

const productMetricDates = (dataset: BIDataSet): Set<string> =>
  new Set(dataset.productMetrics.map((record) => record.date));

const planMetricDates = (dataset: BIDataSet): Set<string> =>
  new Set(dataset.planMetrics.map((record) => record.date));

const runtimeDescriptors = (files: ParsedRealFile[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file: file.file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

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

const commonBrandToken = (files: ParsedRealFile[]): string => {
  const keywordDates = new Map<string, Set<string>>();
  files.filter((file) => file.fileType === "search_total").forEach((file) => {
    allRows(file.sheets).forEach((row) => {
      const keyword = asText(readValue(row, "keyword"));
      const date = parseBusinessDate(readValue(row, "date")) ?? file.dates[0] ?? null;
      if (!keyword || !date) return;
      const dates = keywordDates.get(keyword) ?? new Set<string>();
      dates.add(date);
      keywordDates.set(keyword, dates);
    });
  });

  const exact = Array.from(keywordDates.entries()).find(([, dates]) => EXPECTED_DATES.every((date) => dates.has(date)));
  if (exact) return exact[0];
  for (const candidate of ["空气堡", "空气", "净化", "新风", "滤网"]) {
    const matchedDates = new Set<string>();
    keywordDates.forEach((dates, keyword) => {
      if (keyword.includes(candidate)) dates.forEach((date) => matchedDates.add(date));
    });
    if (EXPECTED_DATES.every((date) => matchedDates.has(date))) return candidate;
  }
  return Array.from(keywordDates.keys())[0]?.slice(0, 2) || "空气";
};

const chartCoverage = async (files: ParsedRealFile[]) => {
  clearRuntimeBIDataSet();
  await runETLRuntime(runtimeDescriptors(files));
  const source = await loadHomeBIDataSource();
  const token = commonBrandToken(files);
  const metrics = ["GMV", "GSV", "投入产出比", "推广点击单价", "推广花费", "转化率", "客单价", "品牌词访客", "品牌词支付人数", "GEO搜索占比"];

  return metrics.map((metric) => {
    const state = {
      ...createDefaultBIState(),
      selectedMetric: metric,
      timeRange: { mode: "custom" as const, startDate: EXPECTED_DATES[0], endDate: EXPECTED_DATES[EXPECTED_DATES.length - 1] },
      brandModelFilter: { brandWords: [token], modelWords: [] },
    };
    const viewModel = buildHomeBIViewModel(source, state);
    const nonNullDates = new Set<string>();
    viewModel.chartModel.lines.forEach((line) => {
      line.points.forEach((point) => {
        if (point.value !== null) nonNullDates.add(point.date);
      });
    });
    return {
      metric,
      xAxis: viewModel.chartModel.xAxis,
      nonNullDates: Array.from(nonNullDates).sort(),
      coversXAxis: EXPECTED_DATES.every((date) => viewModel.chartModel.xAxis.includes(date)),
      coversNonNull: EXPECTED_DATES.every((date) => nonNullDates.has(date)),
    };
  });
};

const runByDateImports = async (files: ParsedRealFile[]) => {
  clearRuntimeBIDataSet();
  const runs = [];
  for (const date of EXPECTED_DATES) {
    const dateFiles = files.filter((file) => file.dates.includes(date));
    const result = await runETLRuntime(runtimeDescriptors(dateFiles));
    const runtime = getRuntimeBIDataSet();
    const allDates = new Set<string>([
      ...Array.from(productMetricDates(runtime ?? result.dataset)),
      ...Array.from(planMetricDates(runtime ?? result.dataset)),
      ...Array.from(datesFor((runtime ?? result.dataset).searchTotalKeywords)),
      ...Array.from(datesFor((runtime ?? result.dataset).searchProductKeywords)),
    ]);
    runs.push({
      date,
      inputFiles: dateFiles.length,
      filesParsed: result.summary.filesParsed,
      filesFailed: result.summary.filesFailed,
      runtimeDates: Array.from(allDates).sort(),
    });
  }
  return runs;
};

const changedFiles = (): string[] =>
  execSync("git status --porcelain", { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, ""));

const forbiddenChanged = (file: string): boolean =>
  file === "package.json" ||
  file === "package-lock.json" ||
  file === "vercel.json" ||
  file.startsWith(".vercel/") ||
  file.startsWith("private-samples/") ||
  file.startsWith("lib/storage/") ||
  file.startsWith("lib/tmall/") ||
  file.startsWith("lib/v05/");

const ensureNoInvalidText = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return !/(NaN|Infinity|undefined|rawRows|previewRows|订单号|退款编号|电话|地址|买家说明|商家备注)/i.test(text);
};

const main = async () => {
  const files = await parseRealFiles();
  addCheck("realFileCountAtLeast18", files.length >= 18, { count: files.length });

  const productDates = dateSetForFiles(files, (file) => file.fileType === "product_metric");
  const planDates = dateSetForFiles(files, (file) => file.fileType === "plan_metric" || file.fileType === "unsupported_plan_summary");
  const searchTotalDates = dateSetForFiles(files, (file) => file.fileType === "search_total");
  const searchProductDates = dateSetForFiles(files, (file) => file.fileType === "search_product");

  addCheck("productMetricFilesCoverFiveDays", hasAllExpectedDates(productDates), Array.from(productDates).sort());
  addCheck("planFilesExposeFiveDays", hasAllExpectedDates(planDates), Array.from(planDates).sort());
  addCheck("searchTotalFilesCoverFiveDays", hasAllExpectedDates(searchTotalDates), Array.from(searchTotalDates).sort());
  addCheck("searchProductFilesCoverFiveDays", hasAllExpectedDates(searchProductDates), Array.from(searchProductDates).sort());

  const afterSalesFiles = files.filter((file) => file.fileType === "after_sales");
  const planSummaryFiles = files.filter((file) => file.fileType === "unsupported_plan_summary");
  addCheck("afterSalesNotProductDimension", afterSalesFiles.length >= 1 && files.every((file) => file.fileType !== "product_dimension" || file.dates.length > 0), {
    afterSalesFiles: afterSalesFiles.length,
  });
  addCheck("planSummaryUnsupportedDetected", planSummaryFiles.length >= 1, { count: planSummaryFiles.length });

  clearRuntimeBIDataSet();
  const allResult = await runETLRuntime(runtimeDescriptors(files));
  const dataset = allResult.dataset;
  const issueCodes = Array.from(new Set([...allResult.issues, ...allResult.errorQueue].map((issue) => issue.code))).sort();
  addCheck("afterSalesSupportedSafeAggregation", dataset.afterSalesMetrics.length > 0 && !issueCodes.includes("etl_after_sales_not_supported"), {
    afterSalesMetrics: dataset.afterSalesMetrics.length,
    issueCodes,
  });
  addCheck("planSummaryUnsupportedIssue", issueCodes.includes("etl_plan_summary_without_product_id_unsupported"), issueCodes);
  addCheck("allFilesProductDatesComplete", hasAllExpectedDates(productMetricDates(dataset)), Array.from(productMetricDates(dataset)).sort());
  addCheck("allFilesPlanDatesComplete", hasAllExpectedDates(planMetricDates(dataset)), Array.from(planMetricDates(dataset)).sort());
  addCheck("allFilesSearchTotalDatesComplete", hasAllExpectedDates(datesFor(dataset.searchTotalKeywords)), Array.from(datesFor(dataset.searchTotalKeywords)).sort());
  addCheck("allFilesSearchProductDatesComplete", hasAllExpectedDates(datesFor(dataset.searchProductKeywords)), Array.from(datesFor(dataset.searchProductKeywords)).sort());

  const sourceTotals = summarizeSourceTotals(files);
  const runtimeTotals = summarizeRuntimeTotals(dataset);
  const totalChecks = compareTotals(sourceTotals, runtimeTotals);
  addCheck("sourceVsRuntimeBusinessTotals", totalChecks.gmv && totalChecks.gsv && totalChecks.visitors && totalChecks.paidBuyers, { sourceTotals, runtimeTotals });
  addCheck("sourceVsRuntimePlanTotals", totalChecks.spend && totalChecks.clicks, { sourceTotals, runtimeTotals });
  addCheck("sourceVsRuntimeSearchTotals", totalChecks.searchTotalVisitors && totalChecks.searchTotalBuyers && totalChecks.searchProductVisitors && totalChecks.searchProductBuyers, {
    sourceTotals,
    runtimeTotals,
  });

  addCheck("searchTotalDedupKeepsDifferentDates", duplicateDatesRetained(dataset.searchTotalKeywords, false));
  addCheck("searchProductDedupKeepsDifferentDates", duplicateDatesRetained(dataset.searchProductKeywords, true));

  const perDateRuns = await runByDateImports(files);
  const finalRuntime = getRuntimeBIDataSet();
  const finalRuntimeDates = new Set<string>([
    ...Array.from(productMetricDates(finalRuntime ?? dataset)),
    ...Array.from(planMetricDates(finalRuntime ?? dataset)),
    ...Array.from(datesFor((finalRuntime ?? dataset).searchTotalKeywords)),
    ...Array.from(datesFor((finalRuntime ?? dataset).searchProductKeywords)),
  ]);
  addCheck("perDateImportsMergeNotReplace", hasAllExpectedDates(finalRuntimeDates), { runs: perDateRuns, finalDates: Array.from(finalRuntimeDates).sort() });

  const charts = await chartCoverage(files);
  const brandCharts = charts.filter((item) => ["品牌词访客", "品牌词支付人数", "GEO搜索占比"].includes(item.metric));
  const planCharts = charts.filter((item) => ["投入产出比", "推广点击单价", "推广花费"].includes(item.metric));
  addCheck("brandChartsCoverFiveDayAxis", brandCharts.every((item) => item.coversXAxis), brandCharts);
  addCheck("brandChartsHaveFiveDayNonNullTrend", brandCharts.every((item) => item.coversNonNull), brandCharts);
  addCheck("planChartsCoverFiveDayAxis", planCharts.every((item) => item.coversXAxis), planCharts);
  addCheck("planChartsNoLongerMissJune30", planCharts.every((item) => item.nonNullDates.includes("2026-06-30")), planCharts);

  const currentChanged = changedFiles();
  addCheck("noForbiddenPathChanges", currentChanged.every((file) => !forbiddenChanged(file)), currentChanged.filter(forbiddenChanged));

  const output = {
    status: "PASS" as Status,
    sourceDirHash: safeCode(SOURCE_DIR),
    fileCount: files.length,
    typeCounts: files.reduce<Record<string, number>>((counts, file) => {
      counts[file.fileType] = (counts[file.fileType] ?? 0) + 1;
      return counts;
    }, {}),
    dateCoverage: {
      productMetric: Array.from(productDates).sort(),
      planLike: Array.from(planDates).sort(),
      searchTotal: Array.from(searchTotalDates).sort(),
      searchProduct: Array.from(searchProductDates).sort(),
    },
    allFilesRuntime: {
      summary: allResult.summary,
      issueCodes,
      productMetricDates: Array.from(productMetricDates(dataset)).sort(),
      planMetricDates: Array.from(planMetricDates(dataset)).sort(),
      searchTotalDates: Array.from(datesFor(dataset.searchTotalKeywords)).sort(),
      searchProductDates: Array.from(datesFor(dataset.searchProductKeywords)).sort(),
      afterSalesDates: Array.from(datesFor(dataset.afterSalesMetrics)).sort(),
      sourceTotals,
      runtimeTotals,
    },
    perDateRuns,
    charts,
    checks,
  };

  addCheck("noInvalidOrSensitiveOutput", ensureNoInvalidText(output));
  const failed = checks.filter((check) => !check.pass);
  output.status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify(output, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  const status: Status = error instanceof Error && error.name === "BlockedAuditError" ? "BLOCKED" : "FAIL";
  console.log(JSON.stringify({
    status,
    checks,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
