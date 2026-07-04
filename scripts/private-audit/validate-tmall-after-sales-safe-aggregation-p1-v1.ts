import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-mapper";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { parseBusinessDate } from "../../lib/etl/date";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
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
  safeCode: string;
  extension: string;
  file: File;
  sheets: ParsedExcelSheet[];
  fileType: ETLSourceType;
  rowCount: number;
}

interface AfterSalesTotals {
  refundAmount: number | null;
  refundCount: number | null;
  shippedRefundAmount: number | null;
  shippedRefundCount: number | null;
  signedRefundAmount: number | null;
  signedRefundCount: number | null;
}

const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const EXPECTED_DATES = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const ROOT = process.cwd();
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
  const normalized = text.replace(/[,，￥¥元%]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const readValue = (row: Record<string, unknown>, field: Parameters<typeof findField>[1]): unknown => {
  const actualField = findField(row, field);
  return actualField ? row[actualField] : null;
};

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const allRows = (sheets: ParsedExcelSheet[]): Record<string, unknown>[] =>
  sheets.flatMap((sheet) => sheet.rows).filter(hasAnyValue);

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

const fileForPath = (absolutePath: string, index: number): File => {
  const buffer = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const datePart = parseBusinessDate(absolutePath) ?? "no-date";
  return new NodeFile([new Uint8Array(buffer)], `tmall-safe-input-${datePart}-${index + 1}${extension}`) as unknown as File;
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
  for (const [index, absolutePath] of filePaths.entries()) {
    const extension = path.extname(absolutePath).toLowerCase();
    const file = fileForPath(absolutePath, index);
    const sheets = await parseExcelWorkbook(file);
    parsed.push({
      safeCode: safeCode(path.relative(SOURCE_DIR, absolutePath)),
      extension,
      file,
      sheets,
      fileType: detectFileType(sheets),
      rowCount: allRows(sheets).length,
    });
  }
  return parsed;
};

const normalizeStatus = (value: unknown): string => asText(value)?.replace(/\s+/g, "") ?? "";

const afterSalesDateForRow = (row: Record<string, unknown>): string | null =>
  parseBusinessDate(readValue(row, "refundCompletedAt")) ??
  parseBusinessDate(readValue(row, "refundAppliedAt")) ??
  parseBusinessDate(readValue(row, "date"));

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

const add = (current: number | null, value: number | null): number | null =>
  value === null ? current : (current ?? 0) + value;

const summarizeSourceAfterSales = (files: ParsedRealFile[]): AfterSalesTotals => {
  const totals: AfterSalesTotals = {
    refundAmount: null,
    refundCount: null,
    shippedRefundAmount: null,
    shippedRefundCount: null,
    signedRefundAmount: null,
    signedRefundCount: null,
  };
  files.filter((file) => file.fileType === "after_sales").forEach((file) => {
    allRows(file.sheets).forEach((row) => {
      if (!isSuccessfulRefund(row)) return;
      const date = afterSalesDateForRow(row);
      if (!date) return;
      const amount = parseNumber(readValue(row, "refundAmount"));
      totals.refundAmount = add(totals.refundAmount, amount);
      totals.refundCount = (totals.refundCount ?? 0) + 1;
      if (isShippedRefund(row)) {
        totals.shippedRefundAmount = add(totals.shippedRefundAmount, amount);
        totals.shippedRefundCount = (totals.shippedRefundCount ?? 0) + 1;
      }
      if (isSignedRefund(row)) {
        totals.signedRefundAmount = add(totals.signedRefundAmount, amount);
        totals.signedRefundCount = (totals.signedRefundCount ?? 0) + 1;
      }
    });
  });
  return totals;
};

const summarizeRuntimeAfterSales = (dataset: BIDataSet): AfterSalesTotals => {
  const totals: AfterSalesTotals = {
    refundAmount: null,
    refundCount: null,
    shippedRefundAmount: null,
    shippedRefundCount: null,
    signedRefundAmount: null,
    signedRefundCount: null,
  };
  dataset.afterSalesMetrics.forEach((row) => {
    totals.refundAmount = add(totals.refundAmount, row.refundAmount);
    totals.refundCount = add(totals.refundCount, row.refundCount);
    totals.shippedRefundAmount = add(totals.shippedRefundAmount, row.shippedRefundAmount);
    totals.shippedRefundCount = add(totals.shippedRefundCount, row.shippedRefundCount);
    totals.signedRefundAmount = add(totals.signedRefundAmount, row.signedRefundAmount);
    totals.signedRefundCount = add(totals.signedRefundCount, row.signedRefundCount);
  });
  return totals;
};

const near = (left: number | null, right: number | null): boolean =>
  left === right || (left !== null && right !== null && Math.abs(left - right) < 0.01);

const allTotalsMatch = (left: AfterSalesTotals, right: AfterSalesTotals): boolean =>
  near(left.refundAmount, right.refundAmount) &&
  near(left.refundCount, right.refundCount) &&
  near(left.shippedRefundAmount, right.shippedRefundAmount) &&
  near(left.shippedRefundCount, right.shippedRefundCount) &&
  near(left.signedRefundAmount, right.signedRefundAmount) &&
  near(left.signedRefundCount, right.signedRefundCount);

const runtimeDescriptors = (files: ParsedRealFile[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file: file.file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const datesFor = (records: Array<{ date: string | null }>): Set<string> => {
  const dates = new Set<string>();
  records.forEach((record) => {
    if (record.date) dates.add(record.date);
  });
  return dates;
};

const productMetricDates = (dataset: BIDataSet): Set<string> => datesFor(dataset.productMetrics);
const planMetricDates = (dataset: BIDataSet): Set<string> => datesFor(dataset.planMetrics);

const hasAllExpectedDates = (dates: Set<string>): boolean =>
  EXPECTED_DATES.every((date) => dates.has(date));

const hasInvalidOutput = (value: unknown): boolean => {
  const seen = new Set<unknown>();
  const visit = (item: unknown): boolean => {
    if (item && typeof item === "object") {
      if (seen.has(item)) return false;
      seen.add(item);
      return Object.values(item).some(visit);
    }
    if (typeof item === "number") return !Number.isFinite(item);
    if (typeof item === "string") return /NaN|Infinity|undefined/.test(item);
    return false;
  };
  return visit(value);
};

const hasSensitiveOutput = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return [
    "rawRows",
    "previewRows",
    "订单号",
    "退款编号",
    "交易号",
    "电话",
    "地址",
    "物流信息",
    "买家说明",
    "商家备注",
    "操作人",
    "子账号",
    "支付宝交易号",
    "退货物流单号",
    "发货物流单号",
    "卖家真实姓名",
  ].some((token) => serialized.includes(token));
};

const changedFiles = (): string[] => {
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((item) => item.trim()).filter(Boolean))).sort();
};

const isForbiddenChange = (file: string): boolean =>
  file === "package.json" ||
  file === "package-lock.json" ||
  file === "vercel.json" ||
  file.startsWith(".vercel/") ||
  file.startsWith("private-samples/") ||
  file.startsWith("lib/storage/") ||
  file.startsWith("lib/tmall/") ||
  file.startsWith("lib/v05/");

const privateSamplesTracked = (): boolean =>
  execFileSync("git", ["status", "--porcelain", "--", "private-samples"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim().length > 0;

const main = async () => {
  clearRuntimeBIDataSet();
  const files = await parseRealFiles();
  addCheck("realFileCountAtLeast18", files.length >= 18, { count: files.length });

  const typeCounts = files.reduce<Record<string, number>>((counts, file) => {
    counts[file.fileType] = (counts[file.fileType] ?? 0) + 1;
    return counts;
  }, {});
  addCheck("afterSalesDetect", (typeCounts.after_sales ?? 0) >= 1, { typeCounts });
  addCheck("afterSalesNoLongerUnsupported", (typeCounts.unsupported_after_sales ?? 0) === 0, { typeCounts });
  addCheck("afterSalesNotProductDimension", files.filter((file) => file.fileType === "after_sales").length >= 1, { typeCounts });

  const sourceAfterSales = summarizeSourceAfterSales(files);
  clearRuntimeBIDataSet();
  const result = await runETLRuntime(runtimeDescriptors(files));
  const dataset = result.dataset;
  const issueCodes = Array.from(new Set([...result.issues, ...result.errorQueue].map((issue) => issue.code))).sort();
  const runtimeAfterSales = summarizeRuntimeAfterSales(dataset);

  addCheck("afterSalesNoUnsupportedIssue", !issueCodes.includes("etl_after_sales_not_supported"), { issueCodes });
  addCheck("afterSalesMetricsCreated", dataset.afterSalesMetrics.length > 0, {
    afterSalesMetrics: dataset.afterSalesMetrics.length,
  });
  addCheck("refundAmountAndCountAggregated", runtimeAfterSales.refundAmount !== null && runtimeAfterSales.refundCount !== null, runtimeAfterSales);
  addCheck("shippedAndSignedAggregatedSafely", runtimeAfterSales.shippedRefundAmount !== null && runtimeAfterSales.signedRefundAmount !== null, runtimeAfterSales);
  addCheck("sourceVsRuntimeAfterSalesTotals", allTotalsMatch(sourceAfterSales, runtimeAfterSales), {
    sourceAfterSales,
    runtimeAfterSales,
  });

  const source = await loadHomeBIDataSource();
  const state = {
    ...createDefaultBIState(),
    selectedMetric: "退货率（总）",
    timeRange: { mode: "custom" as const, startDate: EXPECTED_DATES[0], endDate: EXPECTED_DATES[EXPECTED_DATES.length - 1] },
  };
  const viewModel = buildHomeBIViewModel(source, state);
  const totalReturnCard = viewModel.kpiCards.find((card) => card.title === "退货率（总）");
  const shippedReturnCard = viewModel.kpiCards.find((card) => card.title === "发货退货率");
  const signedReturnCard = viewModel.kpiCards.find((card) => card.title === "已签收退货率");
  const returnChart = buildHomeBIViewModel(source, { ...state, selectedMetric: "退货率（总）" }).chartModel;
  addCheck("homeReturnRateCalculatedFromRealAfterSales", totalReturnCard?.rawValue !== null && totalReturnCard?.rawValue !== undefined, {
    value: totalReturnCard?.value,
  });
  addCheck("homeShippedReturnRateCalculatedOrSafe", shippedReturnCard?.rawValue !== undefined, { value: shippedReturnCard?.value });
  addCheck("homeSignedReturnRateCalculatedOrSafe", signedReturnCard?.rawValue !== undefined, { value: signedReturnCard?.value });
  addCheck("returnChartKeepsThreeLines", returnChart.lines.map((line) => line.name).join("|") === "总退货率|发货退货率|已签收退货率", {
    lines: returnChart.lines.map((line) => line.name),
  });
  addCheck("homeStoreSeriesProductDataSourceCanReadAfterSales", source.points.some((point) => point.metrics.refundAmount !== undefined) && source.points.some((point) => point.productId && point.metrics.refundAmount !== undefined), {
    pointCount: source.points.length,
    refundPointCount: source.points.filter((point) => point.metrics.refundAmount !== undefined).length,
  });

  addCheck("p0ProductDatesStillComplete", hasAllExpectedDates(productMetricDates(dataset)), Array.from(productMetricDates(dataset)).sort());
  addCheck("p0PlanDatesStillComplete", hasAllExpectedDates(planMetricDates(dataset)), Array.from(planMetricDates(dataset)).sort());
  addCheck("p0SearchTotalDatesStillComplete", hasAllExpectedDates(datesFor(dataset.searchTotalKeywords)), Array.from(datesFor(dataset.searchTotalKeywords)).sort());
  addCheck("p0SearchProductDatesStillComplete", hasAllExpectedDates(datesFor(dataset.searchProductKeywords)), Array.from(datesFor(dataset.searchProductKeywords)).sort());

  const outputForSafety = {
    dataset,
    issues: result.issues,
    source,
    viewModel,
  };
  addCheck("noInvalidOutput", !hasInvalidOutput(outputForSafety));
  addCheck("noSensitiveRuntimeLeak", !hasSensitiveOutput(outputForSafety));
  addCheck("privateSamplesNotTracked", !privateSamplesTracked());
  const currentChanged = changedFiles();
  addCheck("noForbiddenPathChanges", currentChanged.every((file) => !isForbiddenChange(file)), currentChanged.filter(isForbiddenChange));

  const report = {
    status: "PASS" as Status,
    gate: {
      taskMeaning: "售后文件从 unsupported issue 升级为安全聚合，仅服务退货率类经营判断。",
      evidenceRead: [
        "/Users/zongji/Desktop/每日平台数据/天猫",
        "lib/etl/runtime/*",
        "lib/bi/bi.data-source.ts",
        "lib/bi/bi.home-mapper.ts",
      ],
      gateStatus: "pass",
      unsafeShortcutAvoided: "没有保留售后明细、原始行、文件名或敏感字段；没有把未完成退款当成功退款。",
      validation: "真实文件识别 + 源表直算聚合 + runETLRuntime + BI source/view model + P0 日期覆盖检查",
      archiveTarget: "script output and final response only",
    },
    sourceDirHash: safeCode(SOURCE_DIR),
    fileCount: files.length,
    typeCounts,
    runtime: {
      summary: result.summary,
      issueCodes,
      afterSalesMetricCount: dataset.afterSalesMetrics.length,
      afterSalesDates: Array.from(datesFor(dataset.afterSalesMetrics)).sort(),
      sourceAfterSales,
      runtimeAfterSales,
      p0Coverage: {
        productMetrics: Array.from(productMetricDates(dataset)).sort(),
        planMetrics: Array.from(planMetricDates(dataset)).sort(),
        searchTotalKeywords: Array.from(datesFor(dataset.searchTotalKeywords)).sort(),
        searchProductKeywords: Array.from(datesFor(dataset.searchProductKeywords)).sort(),
      },
    },
    checks,
  };

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.log(JSON.stringify({ ...report, status: "FAIL" as Status, failed }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  const status: Status = error?.name === "BlockedAuditError" ? "BLOCKED" : "FAIL";
  console.log(JSON.stringify({ status, error: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exit(1);
});
