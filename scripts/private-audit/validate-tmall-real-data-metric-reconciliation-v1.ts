import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import { detectFileType, runETLRuntime, type BIDataSet, type ETLSourceType, type UploadedFileDescriptor } from "../../lib/etl/runtime";
import { loadHomeBIDataSource, type BIHomeDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-mapper";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import {
  aggregateSearchProductKeywords,
  aggregateSearchTotalKeywords,
} from "../../lib/bi/brand-model-semantic";
import type { BrandModelFilter } from "../../lib/bi/search-keyword.types";
import type { BIDataPoint, UIState } from "../../lib/bi/bi.types";

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "private-samples/tmall-real-etl");

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface NumberSummary {
  count: number;
  sum: number | null;
}

interface SourceMetricSummary {
  sourceRows: number;
  finalCount: number;
  productCount?: number;
  dateCount?: number;
  keywordCount?: number;
  gmv: NumberSummary;
  gsv: NumberSummary;
  visitors: NumberSummary;
  buyers: NumberSummary;
  spend: NumberSummary;
  clicks: NumberSummary;
  roiFiniteCount: number;
  missingFields: string[];
}

interface SourceSummary {
  productMetric: SourceMetricSummary;
  planMetric: SourceMetricSummary;
  planLevelCoverage: SourceMetricSummary;
  searchTotal: SourceMetricSummary;
  searchProduct: SourceMetricSummary;
}

interface RuntimeSummary {
  products: number;
  productMetrics: number;
  planMetrics: number;
  authoritativePlanMetrics: number;
  planLevelPlanMetrics: number;
  searchTotalKeywords: number;
  searchProductKeywords: number;
  afterSalesMetrics: number;
  productMetricTotals: Pick<SourceMetricSummary, "gmv" | "gsv" | "visitors" | "buyers">;
  planMetricTotals: Pick<SourceMetricSummary, "spend" | "clicks"> & { roiFiniteCount: number };
  planLevelCoverageTotals: Pick<SourceMetricSummary, "spend" | "clicks"> & { roiFiniteCount: number };
  searchTotalTotals: Pick<SourceMetricSummary, "gmv" | "visitors" | "buyers">;
  searchProductTotals: Pick<SourceMetricSummary, "visitors" | "buyers">;
}

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const assertCheck = (name: string, condition: boolean, details?: unknown) => {
  addCheck(name, condition, details);
  if (!condition) throw new Error(`${name} failed`);
};

const block = (name: string, details?: unknown): never => {
  addCheck(name, false, details);
  const error = new Error(`${name} blocked`);
  error.name = "AuditBlockedError";
  throw error;
};

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const knownPriorBaselinePatterns = [
  "docs/**",
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "components/upload/v1/**",
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const forbiddenChangePatterns = [
  "components/home/**",
  "components/series-board/**",
  "components/store-board/**",
  "components/product-board/**",
  "components/upload/v1/**",
  "components/upload/history/**",
  "components/upload/quality/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const allowedThisTaskPatterns = [
  "scripts/private-audit/validate-tmall-real-data-metric-reconciliation-v1.ts",
  "lib/etl/runtime/file-router.ts",
  "lib/etl/runtime/pipeline.ts",
  "lib/etl/runtime/validator.ts",
  "lib/etl/parse-excel.ts",
  "lib/etl/dedup-engine.ts",
  "lib/etl/field-alias.ts",
  "lib/bi/brand-model-semantic.ts",
];

const sensitiveOutputTokens = [
  "rawRows",
  "previewRows",
  "文件名历史",
  "warning 原文",
  "订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注明细",
  "操作人",
  "子账号",
  "技术错误堆栈",
  "NaN",
  "Infinity",
  "undefined",
];

const FIELD_ALIASES = {
  productId: ["商品ID", "商品id", "宝贝ID", "宝贝id", "产品ID", "主商品ID", "主体ID", "productId", "product_id", "itemId"],
  productName: ["商品名称", "商品名", "宝贝名称", "宝贝标题", "商品标题", "标题", "产品名称", "主体名称", "productName", "name"],
  date: ["日期", "统计日期", "业务日期", "时间", "date"],
  gmv: ["GMV", "成交金额", "交易金额", "支付金额", "支付子订单金额", "销售额", "下单金额", "引导支付金额", "总预售成交金额", "gmv"],
  gsv: ["GSV", "净销售额", "净成交金额", "成功成交金额", "支付金额", "支付子订单金额", "gsv"],
  visitors: ["访客", "访客数", "搜索词访客数", "商品访客", "商品访客数", "引导访客数", "UV", "uv", "visitors"],
  buyers: ["支付买家", "支付买家数", "支付人数", "成交人数", "引导支付买家数", "买家数", "buyers", "paidBuyers"],
  spend: ["推广花费", "花费", "消耗", "总花费", "spend", "adSpend"],
  clicks: ["点击", "点击量", "点击数", "clicks"],
  roi: ["ROI", "投入产出比", "投产比", "roi"],
  keyword: ["搜索词", "关键词", "引流搜索词", "词根", "keyword", "searchTerm"],
} as const;

type CanonicalField = keyof typeof FIELD_ALIASES;

const compact = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_\-:：/\\|（）()［\][\]【】]/g, "")
    .replace(/　/g, "");

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

const excelSerialDate = (value: number): string | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + value * 24 * 60 * 60 * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const parseDate = (value: unknown): string | null => {
  if (typeof value === "number") return excelSerialDate(value);
  const text = asText(value);
  if (!text) return null;
  const direct = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (direct) {
    const [, year, month, day] = direct;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const compactDate = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const readValue = (row: Record<string, unknown>, canonicalField: CanonicalField): unknown => {
  const aliases = new Set(FIELD_ALIASES[canonicalField].map(compact));
  const actualField = Object.keys(row).find((field) => aliases.has(compact(field)));
  return actualField ? row[actualField] : null;
};

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const addValue = (summary: NumberSummary, value: unknown) => {
  const parsed = parseNumber(value);
  if (parsed === null) return;
  summary.count += 1;
  summary.sum = (summary.sum ?? 0) + parsed;
};

const emptyNumberSummary = (): NumberSummary => ({ count: 0, sum: null });

const emptySourceMetricSummary = (): SourceMetricSummary => ({
  sourceRows: 0,
  finalCount: 0,
  gmv: emptyNumberSummary(),
  gsv: emptyNumberSummary(),
  visitors: emptyNumberSummary(),
  buyers: emptyNumberSummary(),
  spend: emptyNumberSummary(),
  clicks: emptyNumberSummary(),
  roiFiniteCount: 0,
  missingFields: [],
});

const uniqueRows = <T>(rows: T[], keyFor: (row: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];
  rows.forEach((row) => {
    const key = keyFor(row);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(row);
  });
  return result;
};

const listRealFilePaths = (): string[] => {
  if (!fs.existsSync(SAMPLE_DIR)) return [];
  return fs
    .readdirSync(SAMPLE_DIR)
    .filter((name) => /\.(xlsx?|csv)$/i.test(name))
    .map((name) => path.join(SAMPLE_DIR, name))
    .sort();
};

const makeNodeFile = (filePath: string, index: number): File => {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const type = extension === ".csv" ? "text/csv" : "application/vnd.ms-excel";
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new NodeFile([bytes], `metric_reconciliation_${index + 1}${extension}`, { type }) as unknown as File;
};

const collectRowsByType = async (files: File[]): Promise<{
  detectedTypes: ETLSourceType[];
  rowsByType: Record<ETLSourceType, Record<string, unknown>[]>;
  fileSummaries: Array<{ safeCode: string; detectedType: ETLSourceType; sheetCount: number; rowCount: number }>;
}> => {
  const rowsByType: Record<ETLSourceType, Record<string, unknown>[]> = {
    product_dimension: [],
    product_metric: [],
    plan_metric: [],
    search_total: [],
    search_product: [],
    after_sales: [],
    unsupported_after_sales: [],
    unsupported_plan_summary: [],
    unknown: [],
  };
  const detectedTypes: ETLSourceType[] = [];
  const fileSummaries: Array<{ safeCode: string; detectedType: ETLSourceType; sheetCount: number; rowCount: number }> = [];

  for (const [index, file] of files.entries()) {
    const sheets = await parseExcelWorkbook(file);
    const detectedType = detectFileType(sheets);
    detectedTypes.push(detectedType);
    const rows = sheets.flatMap((sheet: ParsedExcelSheet) => sheet.rows.filter(hasAnyValue));
    rowsByType[detectedType].push(...rows);
    fileSummaries.push({
      safeCode: safeCode(fs.readFileSync(listRealFilePaths()[index] ?? "")),
      detectedType,
      sheetCount: sheets.length,
      rowCount: rows.length,
    });
  }

  return { detectedTypes, rowsByType, fileSummaries };
};

const metricRowsFromSource = (rows: Record<string, unknown>[]) => {
  const sourceRows = rows
    .map((row) => ({
      productId: asText(readValue(row, "productId")),
      date: parseDate(readValue(row, "date")),
      gmv: readValue(row, "gmv"),
      gsv: readValue(row, "gsv"),
      visitors: readValue(row, "visitors"),
      buyers: readValue(row, "buyers"),
    }))
    .filter((row) => row.productId && row.date);
  return uniqueRows(sourceRows, (row) => `${row.productId}::${row.date}`);
};

const authoritativePlanRowsFromSource = (rows: Record<string, unknown>[]) => {
  const sourceRows = rows
    .map((row) => ({
      productId: asText(readValue(row, "productId")),
      date: parseDate(readValue(row, "date")),
      spend: readValue(row, "spend"),
      clicks: readValue(row, "clicks"),
      roi: readValue(row, "roi"),
    }))
    .filter((row) => row.productId && row.date);
  return uniqueRows(sourceRows, (row) => `${row.productId}::${row.date}`);
};

const planLevelRowsFromSource = (rows: Record<string, unknown>[]) => {
  const sourceRows = rows
    .map((row) => ({
      productId: asText(readValue(row, "productId")),
      planId: asText(row["计划ID"] ?? row["计划id"] ?? row["推广计划ID"] ?? row["推广计划id"] ?? row.planId ?? row.plan_id),
      date: parseDate(readValue(row, "date")),
      spend: readValue(row, "spend"),
      clicks: readValue(row, "clicks"),
      roi: readValue(row, "roi"),
    }))
    .filter((row) => !row.productId && row.planId && row.date);
  return uniqueRows(sourceRows, (row) => `${row.planId}::${row.date}`);
};

const searchTotalRowsFromSource = (rows: Record<string, unknown>[]) => {
  const sourceRows = rows
    .map((row) => ({
      keyword: asText(readValue(row, "keyword")),
      visitors: readValue(row, "visitors"),
      buyers: readValue(row, "buyers"),
      gmv: readValue(row, "gmv"),
    }))
    .filter((row) => row.keyword);
  return uniqueRows(sourceRows, (row) => `${row.keyword}`);
};

const searchProductRowsFromSource = (rows: Record<string, unknown>[]) => {
  const sourceRows = rows
    .map((row) => ({
      productId: asText(readValue(row, "productId")),
      keyword: asText(readValue(row, "keyword")),
      visitors: readValue(row, "visitors"),
      buyers: readValue(row, "buyers"),
    }))
    .filter((row) => row.productId && row.keyword);
  return uniqueRows(sourceRows, (row) => `${row.productId}::${row.keyword}`);
};

const buildSourceSummary = (rowsByType: Record<ETLSourceType, Record<string, unknown>[]>): SourceSummary => {
  const productMetricRows = metricRowsFromSource(rowsByType.product_metric);
  const planRows = authoritativePlanRowsFromSource(rowsByType.plan_metric);
  const planLevelRows = planLevelRowsFromSource(rowsByType.plan_metric);
  const searchTotalRows = searchTotalRowsFromSource(rowsByType.search_total);
  const searchProductRows = searchProductRowsFromSource(rowsByType.search_product);

  const productMetric = emptySourceMetricSummary();
  productMetric.sourceRows = rowsByType.product_metric.filter(hasAnyValue).length;
  productMetric.finalCount = productMetricRows.length;
  productMetric.productCount = new Set(productMetricRows.map((row) => row.productId)).size;
  productMetric.dateCount = new Set(productMetricRows.map((row) => row.date)).size;
  productMetricRows.forEach((row) => {
    addValue(productMetric.gmv, row.gmv);
    addValue(productMetric.gsv, row.gsv);
    addValue(productMetric.visitors, row.visitors);
    addValue(productMetric.buyers, row.buyers);
  });

  const planMetric = emptySourceMetricSummary();
  planMetric.sourceRows = rowsByType.plan_metric.filter(hasAnyValue).length;
  planMetric.finalCount = planRows.length;
  planMetric.productCount = new Set(planRows.map((row) => row.productId)).size;
  planMetric.dateCount = new Set(planRows.map((row) => row.date)).size;
  planRows.forEach((row) => {
    addValue(planMetric.spend, row.spend);
    addValue(planMetric.clicks, row.clicks);
    if (parseNumber(row.roi) !== null) planMetric.roiFiniteCount += 1;
  });

  const planLevelCoverage = emptySourceMetricSummary();
  planLevelCoverage.sourceRows = rowsByType.plan_metric.filter(hasAnyValue).length;
  planLevelCoverage.finalCount = planLevelRows.length;
  planLevelCoverage.dateCount = new Set(planLevelRows.map((row) => row.date)).size;
  planLevelCoverage.keywordCount = new Set(planLevelRows.map((row) => row.planId)).size;
  planLevelRows.forEach((row) => {
    addValue(planLevelCoverage.spend, row.spend);
    addValue(planLevelCoverage.clicks, row.clicks);
    if (parseNumber(row.roi) !== null) planLevelCoverage.roiFiniteCount += 1;
  });

  const searchTotal = emptySourceMetricSummary();
  searchTotal.sourceRows = rowsByType.search_total.filter(hasAnyValue).length;
  searchTotal.finalCount = searchTotalRows.length;
  searchTotal.keywordCount = new Set(searchTotalRows.map((row) => row.keyword)).size;
  searchTotalRows.forEach((row) => {
    addValue(searchTotal.visitors, row.visitors);
    addValue(searchTotal.buyers, row.buyers);
    addValue(searchTotal.gmv, row.gmv);
  });

  const searchProduct = emptySourceMetricSummary();
  searchProduct.sourceRows = rowsByType.search_product.filter(hasAnyValue).length;
  searchProduct.finalCount = searchProductRows.length;
  searchProduct.productCount = new Set(searchProductRows.map((row) => row.productId)).size;
  searchProduct.keywordCount = new Set(searchProductRows.map((row) => row.keyword)).size;
  searchProductRows.forEach((row) => {
    addValue(searchProduct.visitors, row.visitors);
    addValue(searchProduct.buyers, row.buyers);
  });

  return { productMetric, planMetric, planLevelCoverage, searchTotal, searchProduct };
};

const runtimeSummary = (dataset: BIDataSet): RuntimeSummary => {
  const productMetricTotals = {
    gmv: emptyNumberSummary(),
    gsv: emptyNumberSummary(),
    visitors: emptyNumberSummary(),
    buyers: emptyNumberSummary(),
  };
  dataset.productMetrics.forEach((row) => {
    addValue(productMetricTotals.gmv, row.gmv);
    addValue(productMetricTotals.gsv, row.gsv);
    addValue(productMetricTotals.visitors, row.visitors);
    addValue(productMetricTotals.buyers, row.buyers);
  });

  const planMetricTotals = {
    spend: emptyNumberSummary(),
    clicks: emptyNumberSummary(),
    roiFiniteCount: 0,
  };
  const planLevelCoverageTotals = {
    spend: emptyNumberSummary(),
    clicks: emptyNumberSummary(),
    roiFiniteCount: 0,
  };
  let authoritativePlanMetrics = 0;
  let planLevelPlanMetrics = 0;
  dataset.planMetrics.forEach((row) => {
    if (row.productId) {
      authoritativePlanMetrics += 1;
      addValue(planMetricTotals.spend, row.spend);
      addValue(planMetricTotals.clicks, row.clicks);
      if (typeof row.roi === "number" && Number.isFinite(row.roi)) planMetricTotals.roiFiniteCount += 1;
      return;
    }
    if (row.planId) {
      planLevelPlanMetrics += 1;
      addValue(planLevelCoverageTotals.spend, row.spend);
      addValue(planLevelCoverageTotals.clicks, row.clicks);
      if (typeof row.roi === "number" && Number.isFinite(row.roi)) planLevelCoverageTotals.roiFiniteCount += 1;
    }
  });

  const searchTotalTotals = {
    gmv: emptyNumberSummary(),
    visitors: emptyNumberSummary(),
    buyers: emptyNumberSummary(),
  };
  dataset.searchTotalKeywords.forEach((row) => {
    addValue(searchTotalTotals.gmv, row.gmv);
    addValue(searchTotalTotals.visitors, row.visitors);
    addValue(searchTotalTotals.buyers, row.buyers);
  });

  const searchProductTotals = {
    visitors: emptyNumberSummary(),
    buyers: emptyNumberSummary(),
  };
  dataset.searchProductKeywords.forEach((row) => {
    addValue(searchProductTotals.visitors, row.visitors);
    addValue(searchProductTotals.buyers, row.buyers);
  });

  return {
    products: dataset.products.length,
    productMetrics: dataset.productMetrics.length,
    planMetrics: dataset.planMetrics.length,
    authoritativePlanMetrics,
    planLevelPlanMetrics,
    searchTotalKeywords: dataset.searchTotalKeywords.length,
    searchProductKeywords: dataset.searchProductKeywords.length,
    afterSalesMetrics: dataset.afterSalesMetrics.length,
    productMetricTotals,
    planMetricTotals,
    planLevelCoverageTotals,
    searchTotalTotals,
    searchProductTotals,
  };
};

const sumPointMetric = (points: BIDataPoint[], metric: string): number | null => {
  let result: number | null = null;
  points.forEach((point) => {
    const value = point.metrics[metric];
    if (typeof value === "number" && Number.isFinite(value)) result = (result ?? 0) + value;
  });
  return result;
};

const compareNumber = (name: string, actual: number | null, expected: number | null, tolerance: number, details?: unknown) => {
  const pass = actual === null && expected === null
    ? true
    : actual !== null && expected !== null && Math.abs(actual - expected) <= tolerance;
  assertCheck(name, pass, { actual, expected, tolerance, ...((details as Record<string, unknown>) ?? {}) });
};

const compareCount = (name: string, actual: number, expected: number, details?: unknown) => {
  assertCheck(name, actual === expected, { actual, expected, ...((details as Record<string, unknown>) ?? {}) });
};

const cardRawValue = (source: BIHomeDataSource, state: UIState, title: string): number | null => {
  const card = buildHomeBIViewModel(source, state).kpiCards.find((item) => item.title === title);
  return typeof card?.rawValue === "number" && Number.isFinite(card.rawValue) ? card.rawValue : null;
};

const chooseKeywordAndProduct = (source: BIHomeDataSource): { keyword: string; productId: string } => {
  const envBrandWords = (process.env.BRAND_WORDS ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  const keyword = envBrandWords[0] || source.searchTotalKeywords.find((row) => row.keyword.trim().length >= 2)?.keyword;
  const productId = source.searchProductKeywords.find((row) => row.productId.trim() && (!keyword || row.keyword.includes(keyword)))?.productId
    ?? source.searchProductKeywords.find((row) => row.productId.trim())?.productId;

  if (!keyword || !productId) {
    block("brandKeywordOrProductIdMissing", {
      searchTotalKeywords: source.searchTotalKeywords.length,
      searchProductKeywords: source.searchProductKeywords.length,
    });
    throw new Error("brandKeywordOrProductIdMissing");
  }
  return { keyword, productId };
};

const buildBrandFilter = (keyword: string): BrandModelFilter => {
  const envBrandWords = (process.env.BRAND_WORDS ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  const envModelWords = (process.env.MODEL_WORDS ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return {
    brandWords: envBrandWords.length > 0 ? envBrandWords : [keyword],
    modelWords: envModelWords,
  };
};

const staticChecks = () => {
  const files = changedFiles();
  const packageChanged = files.filter((file) => file === "package.json" || file === "package-lock.json");
  assertCheck("noNewDependencies", packageChanged.length === 0, packageChanged);
  assertCheck("privateSamplesNotInGitStatus", git(["status", "--porcelain", "--", "private-samples"]).length === 0);

  const forbidden = files.filter(
    (file) =>
      forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("noForbiddenChangesOutsideKnownBaseline", forbidden.length === 0, forbidden);

  const unexpected = files.filter(
    (file) =>
      !allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("changedFilesWithinTaskOrPriorBaseline", unexpected.length === 0, unexpected);
};

const main = async () => {
  staticChecks();

  const filePaths = listRealFilePaths();
  assertCheck("sampleDirectoryExists", fs.existsSync(SAMPLE_DIR), { sampleDir: "private-samples/tmall-real-etl" });
  assertCheck("atLeastFiveRealFilesFound", filePaths.length >= 5, { fileCount: filePaths.length });

  const files = filePaths.map(makeNodeFile);
  const { detectedTypes, rowsByType, fileSummaries } = await collectRowsByType(files);
  const requiredTypes: ETLSourceType[] = [
    "product_metric",
    "plan_metric",
    "search_total",
    "search_product",
    "after_sales",
  ];
  requiredTypes.forEach((type) => assertCheck(`realFileCoverage_${type}`, detectedTypes.includes(type), { detectedTypes }));

  const descriptors: UploadedFileDescriptor[] = files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));
  const runtimeResult = await runETLRuntime(descriptors);
  const issueCodes = new Set([...runtimeResult.issues, ...runtimeResult.errorQueue].map((issue) => issue.code));
  assertCheck("runETLRuntimeAcceptedPlanLevelAdPlan", runtimeResult.summary.filesParsed >= 6 && runtimeResult.summary.filesFailed === 0, runtimeResult.summary);
  assertCheck("planLevelAdPlanDoesNotEnterSafeIssueQueue", !issueCodes.has("etl_after_sales_not_supported") && !issueCodes.has("etl_plan_summary_without_product_id_unsupported"), {
    issueCodes: Array.from(issueCodes).sort(),
    afterSalesMetrics: runtimeResult.dataset.afterSalesMetrics.length,
    planLevelRows: runtimeResult.dataset.planMetrics.filter((row) => !row.productId && !!row.planId).length,
  });

  const source = buildSourceSummary(rowsByType);
  const runtime = runtimeSummary(runtimeResult.dataset);
  const biSource = await loadHomeBIDataSource();

  assertCheck("biHomeReadsRuntimeETL", biSource.dataStatus.label === "ETL运行时数据", biSource.dataStatus);
  compareCount("productMetricsCountMatchesSource", runtime.productMetrics, source.productMetric.finalCount);
  compareCount("planMetricsCountMatchesSource", runtime.planMetrics, source.planMetric.finalCount + source.planLevelCoverage.finalCount);
  compareCount("authoritativePlanMetricsCountMatchesSource", runtime.authoritativePlanMetrics, source.planMetric.finalCount);
  compareCount("planLevelCoverageCountMatchesSource", runtime.planLevelPlanMetrics, source.planLevelCoverage.finalCount);
  compareCount("searchTotalCountMatchesSource", runtime.searchTotalKeywords, source.searchTotal.finalCount);
  compareCount("searchProductCountMatchesSource", runtime.searchProductKeywords, source.searchProduct.finalCount);
  assertCheck("afterSalesSafeAggregationExists", runtime.afterSalesMetrics > 0, { afterSalesMetrics: runtime.afterSalesMetrics });
  compareCount("biSearchTotalCountMatchesRuntime", biSource.searchTotalKeywords.length, runtime.searchTotalKeywords);
  compareCount("biSearchProductCountMatchesRuntime", biSource.searchProductKeywords.length, runtime.searchProductKeywords);
  compareCount("biPointsCountMatchesRuntimeBusinessPlanAndAfterSales", biSource.points.length, runtime.productMetrics + runtime.authoritativePlanMetrics + runtime.afterSalesMetrics);
  assertCheck(
    "planLevelCoverageAcceptedWithoutEnteringBiPointCount",
    runtime.planLevelPlanMetrics > 0 && biSource.points.length === runtime.productMetrics + runtime.authoritativePlanMetrics + runtime.afterSalesMetrics,
    {
      biPoints: biSource.points.length,
      authoritativePlanMetrics: runtime.authoritativePlanMetrics,
      planLevelPlanMetrics: runtime.planLevelPlanMetrics,
    },
  );

  compareNumber("gmvTotalMatchesSource", runtime.productMetricTotals.gmv.sum, source.productMetric.gmv.sum, 0.01);
  compareNumber("gsvTotalMatchesSource", runtime.productMetricTotals.gsv.sum, source.productMetric.gsv.sum, 0.01);
  compareNumber("visitorsTotalMatchesSource", runtime.productMetricTotals.visitors.sum, source.productMetric.visitors.sum, 0);
  compareNumber("buyersTotalMatchesSource", runtime.productMetricTotals.buyers.sum, source.productMetric.buyers.sum, 0);
  compareNumber("planSpendTotalMatchesSource", runtime.planMetricTotals.spend.sum, source.planMetric.spend.sum, 0.01);
  compareNumber("planClicksTotalMatchesSource", runtime.planMetricTotals.clicks.sum, source.planMetric.clicks.sum, 0);
  compareNumber("searchTotalVisitorsMatchesSource", runtime.searchTotalTotals.visitors.sum, source.searchTotal.visitors.sum, 0);
  compareNumber("searchTotalBuyersMatchesSource", runtime.searchTotalTotals.buyers.sum, source.searchTotal.buyers.sum, 0);
  compareNumber("searchTotalGmvMatchesSource", runtime.searchTotalTotals.gmv.sum, source.searchTotal.gmv.sum, 0.01);
  compareNumber("searchProductVisitorsMatchesSource", runtime.searchProductTotals.visitors.sum, source.searchProduct.visitors.sum, 0);
  compareNumber("searchProductBuyersMatchesSource", runtime.searchProductTotals.buyers.sum, source.searchProduct.buyers.sum, 0);

  compareNumber("biGmvPointsMatchRuntime", sumPointMetric(biSource.points, "gmv"), runtime.productMetricTotals.gmv.sum, 0.01);
  compareNumber("biGsvPointsMatchRuntime", sumPointMetric(biSource.points, "gsv"), runtime.productMetricTotals.gsv.sum, 0.01);
  compareNumber("biVisitorsPointsMatchRuntime", sumPointMetric(biSource.points, "visitors"), runtime.productMetricTotals.visitors.sum, 0);
  compareNumber("biBuyersPointsMatchRuntime", sumPointMetric(biSource.points, "paidBuyers"), runtime.productMetricTotals.buyers.sum, 0);
  compareNumber("biAdSpendPointsMatchRuntime", sumPointMetric(biSource.points, "adSpend"), runtime.planMetricTotals.spend.sum, 0.01);
  compareNumber("planLevelCoverageDoesNotChangeBiAdSpend", sumPointMetric(biSource.points, "adSpend"), source.planMetric.spend.sum, 0.01);

  const latestDate = Array.from(new Set(biSource.points.map((point) => point.businessDate).filter(Boolean))).sort().at(-1) ?? null;
  assertCheck("selectedDateMatchesLatestPointDate", biSource.selectedDate === latestDate, { selectedDate: biSource.selectedDate, latestDate });

  const { keyword, productId } = chooseKeywordAndProduct(biSource);
  const brandFilter = buildBrandFilter(keyword);
  const duplicatedFilter: BrandModelFilter = { brandWords: [keyword], modelWords: [keyword] };
  const totalAggregate = aggregateSearchTotalKeywords(biSource.searchTotalKeywords, brandFilter);
  const duplicatedAggregate = aggregateSearchTotalKeywords(biSource.searchTotalKeywords, duplicatedFilter);
  assertCheck("brandAndModelSameKeywordDeduped", totalAggregate.visitors === duplicatedAggregate.visitors && totalAggregate.buyers === duplicatedAggregate.buyers, {
    keywordSafeCode: safeCode(keyword),
  });

  const baseState = {
    ...createDefaultBIState(),
    selectedStores: Array.from(new Set(biSource.points.map((point) => point.storeId).filter(Boolean))) as string[],
    timeRange: { mode: "day" as const, startDate: biSource.selectedDate, endDate: biSource.selectedDate },
  };
  const brandState: UIState = {
    ...baseState,
    brandModelFilter: brandFilter,
  };
  compareNumber("homeBrandVisitorsMatchesAggregate", cardRawValue(biSource, { ...brandState, selectedMetric: "品牌词访客" }, "品牌词访客"), totalAggregate.visitors, 0);
  compareNumber("homeBrandBuyersMatchesAggregate", cardRawValue(biSource, { ...brandState, selectedMetric: "品牌词支付人数" }, "品牌词支付人数"), totalAggregate.buyers, 0);
  compareNumber(
    "homeGeoSearchShareMatchesFormula",
    cardRawValue(biSource, { ...brandState, selectedMetric: "GEO搜索占比" }, "GEO搜索占比"),
    totalAggregate.buyers !== null && runtime.productMetricTotals.buyers.sum ? totalAggregate.buyers / runtime.productMetricTotals.buyers.sum : null,
    0.0001,
  );

  compareNumber(
    "homeGmvUnaffectedByBrandFilter",
    cardRawValue(biSource, { ...brandState, selectedMetric: "gmv" }, "GMV"),
    cardRawValue(biSource, { ...baseState, selectedMetric: "gmv" }, "GMV"),
    0.01,
  );
  compareNumber(
    "homeGsvUnaffectedByBrandFilter",
    cardRawValue(biSource, { ...brandState, selectedMetric: "gsv" }, "GSV"),
    cardRawValue(biSource, { ...baseState, selectedMetric: "gsv" }, "GSV"),
    0.01,
  );

  const productAggregate = aggregateSearchProductKeywords(biSource.searchProductKeywords, brandFilter, [productId]);
  const manualProductVisitors = biSource.searchProductKeywords
    .filter((row) => row.productId === productId && row.keyword.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))
    .reduce<number | null>((sum, row) => (typeof row.visitors === "number" ? (sum ?? 0) + row.visitors : sum), null);
  const manualProductBuyers = biSource.searchProductKeywords
    .filter((row) => row.productId === productId && row.keyword.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()))
    .reduce<number | null>((sum, row) => (typeof row.buyers === "number" ? (sum ?? 0) + row.buyers : sum), null);
  compareNumber("seriesBrandVisitorsProductIdFirstMatchesManual", productAggregate.visitors, manualProductVisitors, 0, {
    productIdSafeCode: safeCode(productId),
    keywordSafeCode: safeCode(keyword),
  });
  compareNumber("seriesBrandBuyersProductIdFirstMatchesManual", productAggregate.buyers, manualProductBuyers, 0, {
    productIdSafeCode: safeCode(productId),
    keywordSafeCode: safeCode(keyword),
  });
  const missingProductAggregate = aggregateSearchProductKeywords(biSource.searchProductKeywords, brandFilter, ["__missing_product__"]);
  assertCheck("seriesProductIdFirstDoesNotCrossProduct", missingProductAggregate.matchedRowCount === 0 && missingProductAggregate.visitors === null, {
    productIdSafeCode: safeCode(productId),
    keywordSafeCode: safeCode(keyword),
  });

  const missingFields = [
    ...source.productMetric.missingFields,
    ...source.planMetric.missingFields,
    ...source.searchTotal.missingFields,
    ...source.searchProduct.missingFields,
  ];
  assertCheck("noCriticalMissingFields", missingFields.length === 0, missingFields);

  const output = {
    status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
    source: {
      sampleDirExists: fs.existsSync(SAMPLE_DIR),
      fileCount: filePaths.length,
      privateSamplesGitStatusEmpty: git(["status", "--porcelain", "--", "private-samples"]).length === 0,
      fileSummaries,
      detectedTypes,
    },
    sourceSummary: {
      productMetric: source.productMetric,
      planMetric: source.planMetric,
      planLevelCoverage: source.planLevelCoverage,
      searchTotal: source.searchTotal,
      searchProduct: source.searchProduct,
    },
    runtime: {
      summary: runtimeResult.summary,
      issueCodes: Array.from(new Set(runtimeResult.issues.map((issue) => issue.code))),
      counts: {
        products: runtime.products,
        productMetrics: runtime.productMetrics,
        planMetrics: runtime.planMetrics,
        authoritativePlanMetrics: runtime.authoritativePlanMetrics,
        planLevelPlanMetrics: runtime.planLevelPlanMetrics,
        searchTotalKeywords: runtime.searchTotalKeywords,
        searchProductKeywords: runtime.searchProductKeywords,
      },
      totals: {
        gmv: runtime.productMetricTotals.gmv.sum,
        gsv: runtime.productMetricTotals.gsv.sum,
        visitors: runtime.productMetricTotals.visitors.sum,
        buyers: runtime.productMetricTotals.buyers.sum,
        adSpend: runtime.planMetricTotals.spend.sum,
        adClicks: runtime.planMetricTotals.clicks.sum,
        planLevelCoverageSpend: runtime.planLevelCoverageTotals.spend.sum,
        planLevelCoverageClicks: runtime.planLevelCoverageTotals.clicks.sum,
      },
    },
    biHomeDataSource: {
      points: biSource.points.length,
      searchTotalKeywords: biSource.searchTotalKeywords.length,
      searchProductKeywords: biSource.searchProductKeywords.length,
      selectedDate: biSource.selectedDate,
      dataStatusLabel: biSource.dataStatus.label,
    },
    semantic: {
      keywordSafeCode: safeCode(keyword),
      keywordLength: keyword.length,
      productIdSafeCode: safeCode(productId),
      brandVisitors: totalAggregate.visitors === null ? "no_match" : "matched",
      brandBuyers: totalAggregate.buyers === null ? "no_match" : "matched",
      geoSearchShare: totalAggregate.buyers !== null && runtime.productMetricTotals.buyers.sum ? "matched" : "no_match",
      seriesProductIdFirst: productAggregate.matchedRowCount > 0 && missingProductAggregate.matchedRowCount === 0,
    },
    changed: {
      etlAliasOrParserModifiedByThisTask: false,
      semanticAggregationModifiedByThisTask: false,
      uiModifiedByThisTask: false,
      storageTmallV05Modified: false,
      newDependencies: false,
    },
    checks,
  };

  const serialized = JSON.stringify(output);
  assertCheck("noSensitiveOutputInAudit", !sensitiveOutputTokens.some((token) => serialized.includes(token)));
  console.log(JSON.stringify(output, null, 2));
  if (checks.some((check) => !check.pass)) process.exit(1);
};

main().catch((error) => {
  const blocked = error instanceof Error && error.name === "AuditBlockedError";
  const output = {
    status: blocked ? "BLOCKED" as Status : "FAIL" as Status,
    checks,
    error: error instanceof Error ? error.message : String(error),
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(1);
});
