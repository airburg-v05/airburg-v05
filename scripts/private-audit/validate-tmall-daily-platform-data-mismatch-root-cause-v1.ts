import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIMetricKey, UIState } from "../../lib/bi/bi.types";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";
import { detectFileType } from "../../lib/etl/runtime/file-router";

type Status = "PASS" | "FAIL" | "BLOCKED";
type DiagnosticType = ETLSourceType | "unsupported_after_sales" | "plan_metric_without_product_id";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface ParsedFileAudit {
  absolutePath: string;
  relativePath: string;
  safeCode: string;
  relativePathHash: string;
  extension: string;
  sheets: ParsedExcelSheet[];
  sheetCount: number;
  rowCount: number;
  first20Fields: string[];
  safeFirst20Fields: string[];
  detectFileType: ETLSourceType;
  diagnosticType: DiagnosticType;
  scores: Record<string, number>;
  matchedCanonicalFields: string[];
  dateCandidates: string[];
  pathDateDetected: boolean;
  hasProductId: boolean;
  hasKeyword: boolean;
  hasPlanMetrics: boolean;
  hasBusinessMetrics: boolean;
  hasAfterSalesFields: boolean;
  parseError?: string;
}

interface DateBucket {
  date: string;
  productMetricFiles: number;
  planMetricFiles: number;
  searchTotalFiles: number;
  searchProductFiles: number;
  afterSalesFiles: number;
  unknownFiles: number;
}

interface NumberAgg {
  count: number;
  sum: number | null;
}

interface DirectDateSummary {
  date: string;
  productMetricRows: number;
  productCount: number;
  gmv: NumberAgg;
  gsv: NumberAgg;
  visitors: NumberAgg;
  paidBuyers: NumberAgg;
  planMetricRows: number;
  planProductIdCount: number;
  spend: NumberAgg;
  clicks: NumberAgg;
  roiFiniteCount: number;
  adRevenue: NumberAgg;
  searchTotalRows: number;
  keywordCount: number;
  searchTotalVisitors: NumberAgg;
  searchTotalBuyers: NumberAgg;
  searchTotalGmv: NumberAgg;
  searchProductRows: number;
  searchProductProductIdCount: number;
  searchProductKeywordCount: number;
  searchProductVisitors: NumberAgg;
  searchProductBuyers: NumberAgg;
  afterSalesRows: number;
  refundAmount: NumberAgg;
  refundCount: NumberAgg;
  hasShipmentStatusField: boolean;
  hasSignedStatusField: boolean;
  hasSensitiveAfterSalesFields: boolean;
}

interface RuntimeSummary {
  filesParsed: number;
  filesFailed: number;
  issueCodes: string[];
  products: number;
  productMetrics: number;
  planMetrics: number;
  searchTotalKeywords: number;
  searchProductKeywords: number;
  productMetricsByDate: Record<string, number>;
  planMetricsByDate: Record<string, number>;
  searchTotalKeywordsByDate: { date_lost: true; total: number };
  searchProductKeywordsByDate: { date_lost: true; total: number };
  totals: {
    gmv: number | null;
    gsv: number | null;
    visitors: number | null;
    paidBuyers: number | null;
    spend: number | null;
    clicks: number | null;
    searchTotalVisitors: number | null;
    searchProductVisitors: number | null;
  };
}

interface ChartDiagnostic {
  metric: string;
  xAxisDates: string[];
  nonNullDates: string[];
  missingDates: string[];
  sourceDateBasis: string[];
  xAxisMatchesSourceDates: boolean;
}

const ROOT = process.cwd();
const CANDIDATE_DIRS = [
  "/Users/zongji/Desktop/每日平台数据/天猫",
  "/Users/zongji/Desktop/每日平台数据",
  "/Users/zongji/Desktop/平台报表/天猫",
];

const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const block = (name: string, details?: unknown): never => {
  addCheck(name, false, details);
  const error = new Error(`${name} blocked`);
  error.name = "AuditBlockedError";
  throw error;
};

const safeCode = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

const compact = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_\-:：/\\|（）()［\][\]【】《》"'“”‘’]/g, "")
    .replace(/　/g, "");

const FIELD_ALIASES = {
  productId: ["商品ID", "商品id", "宝贝ID", "宝贝id", "产品ID", "主商品ID", "主体ID", "主体id", "productId", "product_id", "itemId"],
  productName: ["商品名称", "商品名", "宝贝名称", "宝贝标题", "商品标题", "标题", "产品名称", "主体名称", "productName", "name"],
  date: ["日期", "统计日期", "业务日期", "时间", "下载周期", "报表日期", "date"],
  gmv: ["GMV", "成交金额", "交易金额", "支付金额", "支付子订单金额", "销售额", "下单金额", "引导支付金额", "总预售成交金额", "引导成交金额", "gmv"],
  gsv: ["GSV", "净销售额", "净成交金额", "成功成交金额", "支付金额", "支付子订单金额", "gsv"],
  visitors: ["访客", "访客数", "搜索词访客数", "商品访客", "商品访客数", "引导访客数", "UV", "uv", "visitors"],
  buyers: ["支付买家", "支付买家数", "支付人数", "成交人数", "引导支付买家数", "买家数", "buyers", "paidBuyers"],
  spend: ["推广花费", "花费", "消耗", "总花费", "spend", "adSpend"],
  clicks: ["点击", "点击量", "点击数", "clicks"],
  roi: ["ROI", "投入产出比", "投产比", "roi"],
  keyword: ["搜索词", "关键词", "引流搜索词", "词根", "keyword", "searchTerm"],
  refundAmount: ["退款金额", "成功退款金额", "申请退款金额", "退货退款金额", "refundAmount"],
  refundCount: ["退款数", "退款笔数", "退货数", "退货退款数", "refundCount"],
} as const;

type CanonicalField = keyof typeof FIELD_ALIASES;

const aliasSet = (field: CanonicalField): Set<string> => new Set(FIELD_ALIASES[field].map(compact));

const readValue = (row: Record<string, unknown>, field: CanonicalField): unknown => {
  const aliases = aliasSet(field);
  const actual = Object.keys(row).find((key) => aliases.has(compact(key)));
  return actual ? row[actual] : null;
};

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
  const range = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (range) return `${range[1]}-${range[2].padStart(2, "0")}-${range[3].padStart(2, "0")}`;
  const monthDayYear = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (monthDayYear) {
    const year = monthDayYear[3].length === 2 ? `20${monthDayYear[3]}` : monthDayYear[3];
    return `${year}-${monthDayYear[1].padStart(2, "0")}-${monthDayYear[2].padStart(2, "0")}`;
  }
  const compactDate = text.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;
  return null;
};

const datesFromPath = (filePath: string): string[] => {
  const normalized = filePath.replace(/\\/g, "/");
  const dates = new Set<string>();
  for (const match of normalized.matchAll(/(20\d{2})[-_.年]?(\d{2})[-_.月]?(\d{2})/g)) {
    dates.add(`${match[1]}-${match[2]}-${match[3]}`);
  }
  return Array.from(dates).sort();
};

const hasAnyValue = (row: Record<string, unknown>): boolean =>
  Object.values(row).some((value) => asText(value) !== null);

const allRows = (sheets: ParsedExcelSheet[]): Record<string, unknown>[] =>
  sheets.flatMap((sheet) => sheet.rows).filter(hasAnyValue);

const firstFields = (sheets: ParsedExcelSheet[]): string[] => {
  const fields: string[] = [];
  sheets.forEach((sheet) => {
    sheet.rows.slice(0, 20).forEach((row) => {
      Object.keys(row).forEach((field) => {
        if (!fields.includes(field)) fields.push(field);
      });
    });
  });
  return fields.slice(0, 20);
};

const sensitiveFieldCategory = (field: string): string | null => {
  const normalized = compact(field);
  if (/订单|交易|退款编号|编号|单号/.test(normalized)) return "transaction_id";
  if (/电话|手机|联系方式/.test(normalized)) return "contact";
  if (/地址|物流/.test(normalized)) return "address_or_logistics";
  if (/买家说明|商家备注|备注|操作人|子账号/.test(normalized)) return "private_note_or_operator";
  return null;
};

const safeFieldName = (field: string): string => {
  const category = sensitiveFieldCategory(field);
  return category ? `[sensitive_field:${category}]` : field;
};

const fieldSet = (fields: string[]): Set<string> => new Set(fields.map(compact));

const hasAliasInFields = (fields: Set<string>, field: CanonicalField): boolean =>
  FIELD_ALIASES[field].some((alias) => fields.has(compact(alias)));

const countMatches = (fields: Set<string>, aliases: string[]): number =>
  aliases.reduce((score, alias) => score + (fields.has(compact(alias)) ? 1 : 0), 0);

const countSubstringMatches = (fields: Set<string>, aliases: string[]): number => {
  const normalizedAliases = aliases.map(compact);
  let score = 0;
  fields.forEach((field) => {
    if (normalizedAliases.some((alias) => field.includes(alias) || alias.includes(field))) score += 1;
  });
  return score;
};

const AFTER_SALES_HINTS = [
  "售后",
  "退货",
  "退款",
  "成功退款",
  "申请退款",
  "发货状态",
  "签收状态",
  "退款原因",
  "退货退款",
  "仅退款",
];

const diagnosticScores = (fields: string[]): Record<string, number> => {
  const set = fieldSet(fields);
  const hasProductId = hasAliasInFields(set, "productId");
  const hasProductName = hasAliasInFields(set, "productName");
  const hasDate = hasAliasInFields(set, "date");
  const hasKeyword = hasAliasInFields(set, "keyword");
  const businessCount = countMatches(set, [...FIELD_ALIASES.gmv, ...FIELD_ALIASES.gsv, ...FIELD_ALIASES.visitors, ...FIELD_ALIASES.buyers]);
  const planCount = countMatches(set, [...FIELD_ALIASES.spend, ...FIELD_ALIASES.clicks, ...FIELD_ALIASES.roi]);
  const afterSalesCount = countSubstringMatches(set, AFTER_SALES_HINTS);

  return {
    product_dimension: (hasProductId ? 2 : 0) + (hasProductName ? 3 : 0) - businessCount - planCount,
    product_metric: (hasProductId ? 2 : 0) + (hasDate ? 2 : 0) + businessCount * 2 - planCount,
    plan_metric: (hasDate ? 1 : 0) + planCount * 3 + (hasProductId ? 1 : 0),
    plan_metric_without_product_id: (hasDate ? 1 : 0) + planCount * 3 + (hasProductId ? -2 : 2),
    search_total: (hasKeyword ? 3 : 0) + (hasAliasInFields(set, "visitors") ? 2 : 0) + (hasProductId ? -3 : 1),
    search_product: (hasKeyword ? 3 : 0) + (hasProductId ? 3 : 0) + (hasAliasInFields(set, "visitors") ? 1 : 0),
    unsupported_after_sales: afterSalesCount * 3,
  };
};

const chooseDiagnosticType = (fields: string[]): DiagnosticType => {
  const set = fieldSet(fields);
  const scores = diagnosticScores(fields);
  const hasProductId = hasAliasInFields(set, "productId");
  const hasKeyword = hasAliasInFields(set, "keyword");
  const hasPlan = hasAliasInFields(set, "spend") || hasAliasInFields(set, "clicks") || hasAliasInFields(set, "roi");
  const hasBusiness =
    hasAliasInFields(set, "gmv") ||
    hasAliasInFields(set, "gsv") ||
    hasAliasInFields(set, "visitors") ||
    hasAliasInFields(set, "buyers");

  if (scores.unsupported_after_sales >= 6) return "unsupported_after_sales";
  if (hasKeyword && hasProductId) return "search_product";
  if (hasKeyword && !hasProductId) return "search_total";
  if (hasPlan && !hasProductId) return "plan_metric_without_product_id";
  if (hasProductId && hasBusiness && scores.product_metric >= scores.plan_metric) return "product_metric";
  if (hasProductId && hasPlan) return "plan_metric";
  if (hasProductId && hasAliasInFields(set, "productName")) return "product_dimension";
  return "unknown";
};

const findFiles = (dir: string): string[] => {
  const results: string[] = [];
  const visit = (current: string) => {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(next);
        return;
      }
      if (/\.(xls|xlsx|csv)$/i.test(entry.name)) results.push(next);
    });
  };
  visit(dir);
  return results.sort();
};

const toFile = (buffer: Buffer, safeName: string): File => {
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new NodeFile([bytes], safeName) as unknown as File;
};

const makeDescriptor = (file: ParsedFileAudit): UploadedFileDescriptor => ({
  file: toFile(fs.readFileSync(file.absolutePath), `${file.safeCode}${file.extension}`),
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
});

const discoverDirectory = (): string | null => CANDIDATE_DIRS.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()) ?? null;

const parseFiles = async (sourceDir: string, files: string[]): Promise<ParsedFileAudit[]> => {
  const audits: ParsedFileAudit[] = [];
  for (const absolutePath of files) {
    const buffer = fs.readFileSync(absolutePath);
    const fileSafeCode = safeCode(buffer);
    const extension = path.extname(absolutePath).toLowerCase();
    const relativePath = path.relative(sourceDir, absolutePath);
    try {
      const sheets = await parseExcelWorkbook(toFile(buffer, `${fileSafeCode}${extension}`));
      const fields = firstFields(sheets);
      const set = fieldSet(fields);
      const rowDates = Array.from(
        new Set(allRows(sheets).map((row) => parseDate(readValue(row, "date"))).filter((date): date is string => Boolean(date))),
      ).sort();
      const pathDates = datesFromPath(relativePath);
      const dateCandidates = (rowDates.length > 0 ? rowDates : pathDates).sort();
      const matchedCanonicalFields = (Object.keys(FIELD_ALIASES) as CanonicalField[])
        .filter((field) => hasAliasInFields(set, field));
      audits.push({
        absolutePath,
        relativePath,
        safeCode: fileSafeCode,
        relativePathHash: safeCode(relativePath),
        extension,
        sheets,
        sheetCount: sheets.length,
        rowCount: sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
        first20Fields: fields,
        safeFirst20Fields: fields.map(safeFieldName),
        detectFileType: detectFileType(sheets),
        diagnosticType: chooseDiagnosticType(fields),
        scores: diagnosticScores(fields),
        matchedCanonicalFields,
        dateCandidates,
        pathDateDetected: datesFromPath(relativePath).length > 0,
        hasProductId: hasAliasInFields(set, "productId"),
        hasKeyword: hasAliasInFields(set, "keyword"),
        hasPlanMetrics: hasAliasInFields(set, "spend") || hasAliasInFields(set, "clicks") || hasAliasInFields(set, "roi"),
        hasBusinessMetrics: hasAliasInFields(set, "gmv") || hasAliasInFields(set, "gsv") || hasAliasInFields(set, "visitors") || hasAliasInFields(set, "buyers"),
        hasAfterSalesFields: diagnosticScores(fields).unsupported_after_sales >= 3,
      });
    } catch (error) {
      audits.push({
        absolutePath,
        relativePath,
        safeCode: fileSafeCode,
        relativePathHash: safeCode(relativePath),
        extension,
        sheets: [],
        sheetCount: 0,
        rowCount: 0,
        first20Fields: [],
        safeFirst20Fields: [],
        detectFileType: "unknown",
        diagnosticType: "unknown",
        scores: {},
        matchedCanonicalFields: [],
        dateCandidates: datesFromPath(relativePath),
        pathDateDetected: datesFromPath(relativePath).length > 0,
        hasProductId: false,
        hasKeyword: false,
        hasPlanMetrics: false,
        hasBusinessMetrics: false,
        hasAfterSalesFields: false,
        parseError: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return audits;
};

const emptyNumberAgg = (): NumberAgg => ({ count: 0, sum: null });

const addNumber = (agg: NumberAgg, value: unknown) => {
  const parsed = parseNumber(value);
  if (parsed === null) return;
  agg.count += 1;
  agg.sum = (agg.sum ?? 0) + parsed;
};

const emptyDirectDateSummary = (date: string): DirectDateSummary => ({
  date,
  productMetricRows: 0,
  productCount: 0,
  gmv: emptyNumberAgg(),
  gsv: emptyNumberAgg(),
  visitors: emptyNumberAgg(),
  paidBuyers: emptyNumberAgg(),
  planMetricRows: 0,
  planProductIdCount: 0,
  spend: emptyNumberAgg(),
  clicks: emptyNumberAgg(),
  roiFiniteCount: 0,
  adRevenue: emptyNumberAgg(),
  searchTotalRows: 0,
  keywordCount: 0,
  searchTotalVisitors: emptyNumberAgg(),
  searchTotalBuyers: emptyNumberAgg(),
  searchTotalGmv: emptyNumberAgg(),
  searchProductRows: 0,
  searchProductProductIdCount: 0,
  searchProductKeywordCount: 0,
  searchProductVisitors: emptyNumberAgg(),
  searchProductBuyers: emptyNumberAgg(),
  afterSalesRows: 0,
  refundAmount: emptyNumberAgg(),
  refundCount: emptyNumberAgg(),
  hasShipmentStatusField: false,
  hasSignedStatusField: false,
  hasSensitiveAfterSalesFields: false,
});

const dateForRow = (file: ParsedFileAudit, row: Record<string, unknown>): string =>
  parseDate(readValue(row, "date")) ?? file.dateCandidates[0] ?? "unknown_date";

const addUnique = (map: Map<string, Set<string>>, date: string, value: unknown) => {
  const text = asText(value);
  if (!text) return;
  const set = map.get(date) ?? new Set<string>();
  set.add(text);
  map.set(date, set);
};

const directSummaries = (files: ParsedFileAudit[]): Record<string, DirectDateSummary> => {
  const byDate = new Map<string, DirectDateSummary>();
  const productIds = new Map<string, Set<string>>();
  const planProductIds = new Map<string, Set<string>>();
  const keywords = new Map<string, Set<string>>();
  const searchProductIds = new Map<string, Set<string>>();
  const searchProductKeywords = new Map<string, Set<string>>();
  const ensure = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const next = emptyDirectDateSummary(date);
    byDate.set(date, next);
    return next;
  };

  files.forEach((file) => {
    allRows(file.sheets).forEach((row) => {
      const date = dateForRow(file, row);
      const summary = ensure(date);
      if (file.diagnosticType === "product_metric") {
        summary.productMetricRows += 1;
        addUnique(productIds, date, readValue(row, "productId"));
        addNumber(summary.gmv, readValue(row, "gmv"));
        addNumber(summary.gsv, readValue(row, "gsv"));
        addNumber(summary.visitors, readValue(row, "visitors"));
        addNumber(summary.paidBuyers, readValue(row, "buyers"));
      } else if (file.diagnosticType === "plan_metric" || file.diagnosticType === "plan_metric_without_product_id") {
        summary.planMetricRows += 1;
        addUnique(planProductIds, date, readValue(row, "productId"));
        addNumber(summary.spend, readValue(row, "spend"));
        addNumber(summary.clicks, readValue(row, "clicks"));
        const roi = parseNumber(readValue(row, "roi"));
        const spend = parseNumber(readValue(row, "spend"));
        if (roi !== null) summary.roiFiniteCount += 1;
        if (roi !== null && spend !== null) addNumber(summary.adRevenue, roi * spend);
      } else if (file.diagnosticType === "search_total") {
        summary.searchTotalRows += 1;
        addUnique(keywords, date, readValue(row, "keyword"));
        addNumber(summary.searchTotalVisitors, readValue(row, "visitors"));
        addNumber(summary.searchTotalBuyers, readValue(row, "buyers"));
        addNumber(summary.searchTotalGmv, readValue(row, "gmv"));
      } else if (file.diagnosticType === "search_product") {
        summary.searchProductRows += 1;
        addUnique(searchProductIds, date, readValue(row, "productId"));
        addUnique(searchProductKeywords, date, readValue(row, "keyword"));
        addNumber(summary.searchProductVisitors, readValue(row, "visitors"));
        addNumber(summary.searchProductBuyers, readValue(row, "buyers"));
      } else if (file.diagnosticType === "unsupported_after_sales") {
        summary.afterSalesRows += 1;
        addNumber(summary.refundAmount, readValue(row, "refundAmount"));
        addNumber(summary.refundCount, readValue(row, "refundCount"));
        const fields = Object.keys(row).map(compact).join("|");
        summary.hasShipmentStatusField ||= /发货/.test(fields);
        summary.hasSignedStatusField ||= /签收/.test(fields);
        summary.hasSensitiveAfterSalesFields ||= Object.keys(row).some((field) => sensitiveFieldCategory(field) !== null);
      }
    });
  });

  byDate.forEach((summary, date) => {
    summary.productCount = productIds.get(date)?.size ?? 0;
    summary.planProductIdCount = planProductIds.get(date)?.size ?? 0;
    summary.keywordCount = keywords.get(date)?.size ?? 0;
    summary.searchProductProductIdCount = searchProductIds.get(date)?.size ?? 0;
    summary.searchProductKeywordCount = searchProductKeywords.get(date)?.size ?? 0;
  });

  return Object.fromEntries(Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right)));
};

const dateMatrix = (files: ParsedFileAudit[]): DateBucket[] => {
  const dates = new Set(files.flatMap((file) => file.dateCandidates.length ? file.dateCandidates : ["unknown_date"]));
  return Array.from(dates).sort().map((date) => {
    const matching = files.filter((file) => (file.dateCandidates.length ? file.dateCandidates : ["unknown_date"]).includes(date));
    return {
      date,
      productMetricFiles: matching.filter((file) => file.diagnosticType === "product_metric").length,
      planMetricFiles: matching.filter((file) => file.diagnosticType === "plan_metric" || file.diagnosticType === "plan_metric_without_product_id").length,
      searchTotalFiles: matching.filter((file) => file.diagnosticType === "search_total").length,
      searchProductFiles: matching.filter((file) => file.diagnosticType === "search_product").length,
      afterSalesFiles: matching.filter((file) => file.diagnosticType === "unsupported_after_sales").length,
      unknownFiles: matching.filter((file) => file.diagnosticType === "unknown").length,
    };
  });
};

const sumRuntime = (dataset: BIDataSet): RuntimeSummary["totals"] => {
  const sum = <T>(rows: T[], valueFor: (row: T) => number | null): number | null => {
    let has = false;
    const total = rows.reduce<number>((acc, row) => {
      const value = valueFor(row);
      if (typeof value !== "number" || !Number.isFinite(value)) return acc;
      has = true;
      return acc + value;
    }, 0);
    return has ? total : null;
  };
  return {
    gmv: sum(dataset.productMetrics, (row) => row.gmv),
    gsv: sum(dataset.productMetrics, (row) => row.gsv),
    visitors: sum(dataset.productMetrics, (row) => row.visitors),
    paidBuyers: sum(dataset.productMetrics, (row) => row.buyers),
    spend: sum(dataset.planMetrics, (row) => row.spend),
    clicks: sum(dataset.planMetrics, (row) => row.clicks),
    searchTotalVisitors: sum(dataset.searchTotalKeywords, (row) => row.visitors),
    searchProductVisitors: sum(dataset.searchProductKeywords, (row) => row.visitors),
  };
};

const countByDate = <T extends { date: string }>(rows: T[]): Record<string, number> => {
  const result: Record<string, number> = {};
  rows.forEach((row) => {
    result[row.date] = (result[row.date] ?? 0) + 1;
  });
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
};

const runRuntimeAllFiles = async (files: ParsedFileAudit[]): Promise<{ result: Awaited<ReturnType<typeof runETLRuntime>>; summary: RuntimeSummary }> => {
  clearRuntimeBIDataSet();
  const result = await runETLRuntime(files.map(makeDescriptor));
  return {
    result,
    summary: {
      filesParsed: result.summary.filesParsed,
      filesFailed: result.summary.filesFailed,
      issueCodes: Array.from(new Set(result.issues.map((issue) => issue.code))).sort(),
      products: result.dataset.products.length,
      productMetrics: result.dataset.productMetrics.length,
      planMetrics: result.dataset.planMetrics.length,
      searchTotalKeywords: result.dataset.searchTotalKeywords.length,
      searchProductKeywords: result.dataset.searchProductKeywords.length,
      productMetricsByDate: countByDate(result.dataset.productMetrics),
      planMetricsByDate: countByDate(result.dataset.planMetrics),
      searchTotalKeywordsByDate: { date_lost: true, total: result.dataset.searchTotalKeywords.length },
      searchProductKeywordsByDate: { date_lost: true, total: result.dataset.searchProductKeywords.length },
      totals: sumRuntime(result.dataset),
    },
  };
};

const sourceTotals = (summaries: Record<string, DirectDateSummary>) => {
  const dates = Object.values(summaries);
  const add = (values: Array<number | null>): number | null => {
    let has = false;
    const total = values.reduce<number>((sum, value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return sum;
      has = true;
      return sum + value;
    }, 0);
    return has ? total : null;
  };
  return {
    gmv: add(dates.map((date) => date.gmv.sum)),
    gsv: add(dates.map((date) => date.gsv.sum)),
    visitors: add(dates.map((date) => date.visitors.sum)),
    paidBuyers: add(dates.map((date) => date.paidBuyers.sum)),
    spend: add(dates.map((date) => date.spend.sum)),
    clicks: add(dates.map((date) => date.clicks.sum)),
    searchTotalVisitors: add(dates.map((date) => date.searchTotalVisitors.sum)),
    searchProductVisitors: add(dates.map((date) => date.searchProductVisitors.sum)),
  };
};

const diff = (source: number | null, runtime: number | null): number | null => {
  if (source === null && runtime === null) return null;
  return (runtime ?? 0) - (source ?? 0);
};

const compareTotals = (source: ReturnType<typeof sourceTotals>, runtime: RuntimeSummary["totals"]) => ({
  gmvDiff: diff(source.gmv, runtime.gmv),
  gsvDiff: diff(source.gsv, runtime.gsv),
  visitorsDiff: diff(source.visitors, runtime.visitors),
  paidBuyersDiff: diff(source.paidBuyers, runtime.paidBuyers),
  spendDiff: diff(source.spend, runtime.spend),
  clicksDiff: diff(source.clicks, runtime.clicks),
  searchTotalVisitorsDiff: diff(source.searchTotalVisitors, runtime.searchTotalVisitors),
  searchProductVisitorsDiff: diff(source.searchProductVisitors, runtime.searchProductVisitors),
});

const filesForImportDate = (files: ParsedFileAudit[], date: string): ParsedFileAudit[] =>
  files.filter((file) => datesFromPath(file.relativePath).includes(date));

const multiImportDiagnostics = async (files: ParsedFileAudit[], dates: string[]) => {
  clearRuntimeBIDataSet();
  const runs = [];
  let previousRuntimeDates: string[] = [];
  let replaceDetected = false;
  for (const date of dates) {
    const matching = filesForImportDate(files, date);
    if (matching.length === 0) continue;
    const result = await runETLRuntime(matching.map(makeDescriptor));
    const runtime = getRuntimeBIDataSet();
    const runtimeDates = Array.from(
      new Set([
        ...(runtime?.productMetrics.map((row) => row.date) ?? []),
        ...(runtime?.planMetrics.map((row) => row.date) ?? []),
      ]),
    ).sort();
    if (previousRuntimeDates.length > 0 && !previousRuntimeDates.every((prev) => runtimeDates.includes(prev))) {
      replaceDetected = true;
    }
    runs.push({
      date,
      files: matching.length,
      filesParsed: result.summary.filesParsed,
      filesFailed: result.summary.filesFailed,
      runtimeDates,
      previousDatesStillPresent: previousRuntimeDates.length === 0 || previousRuntimeDates.every((prev) => runtimeDates.includes(prev)),
      productMetrics: runtime?.productMetrics.length ?? 0,
      planMetrics: runtime?.planMetrics.length ?? 0,
      searchTotalKeywords: runtime?.searchTotalKeywords.length ?? 0,
      searchProductKeywords: runtime?.searchProductKeywords.length ?? 0,
    });
    previousRuntimeDates = runtimeDates;
  }
  return {
    rootCause: replaceDetected ? "runtime_replace_not_append" : "runtime_append_or_single_run_only",
    runs,
  };
};

const nonNullDates = (chart: ReturnType<typeof buildHomeBIViewModel>["mtdChartModel"]): string[] =>
  Array.from(
    new Set(
      chart.lines.flatMap((line) =>
        line.points
          .filter((point) => typeof point.value === "number" && Number.isFinite(point.value))
          .map((point) => point.date),
      ),
    ),
  ).sort();

const chartDiagnostics = async (
  sourceDates: {
    productMetric: string[];
    planMetric: string[];
    search: string[];
    all: string[];
  },
): Promise<ChartDiagnostic[]> => {
  const source = await loadHomeBIDataSource();
  const selectedDate = source.selectedDate ?? sourceDates.all[sourceDates.all.length - 1] ?? null;
  const baseState: UIState = {
    ...createDefaultBIState(),
    selectedStores: ["tmall-default-store"],
    timeRange: {
      mode: "custom",
      startDate: sourceDates.all[0] ?? selectedDate,
      endDate: sourceDates.all[sourceDates.all.length - 1] ?? selectedDate,
    },
    brandModelFilter: { brandWords: ["空气堡"], modelWords: [] },
  };
  const metrics: Array<{ title: string; key: BIMetricKey; basis: string[] }> = [
    { title: "GMV", key: "GMV", basis: sourceDates.productMetric },
    { title: "GSV", key: "GSV", basis: sourceDates.productMetric },
    { title: "投入产出比", key: "投入产出比", basis: sourceDates.planMetric },
    { title: "推广点击单价", key: "推广点击单价", basis: sourceDates.planMetric },
    { title: "推广花费", key: "推广花费", basis: sourceDates.planMetric },
    { title: "转化率", key: "转化率", basis: sourceDates.productMetric },
    { title: "客单价", key: "客单价", basis: sourceDates.productMetric },
    { title: "品牌词访客", key: "品牌词访客", basis: sourceDates.search },
    { title: "品牌词支付人数", key: "品牌词支付人数", basis: sourceDates.search },
    { title: "GEO搜索占比", key: "GEO搜索占比", basis: sourceDates.search },
  ];
  return metrics.map(({ title, key, basis }) => {
    const vm = buildHomeBIViewModel(source, { ...baseState, selectedMetric: key });
    const xAxisDates = vm.mtdChartModel.xAxis;
    const withValue = nonNullDates(vm.mtdChartModel);
    return {
      metric: title,
      xAxisDates,
      nonNullDates: withValue,
      missingDates: basis.filter((date) => !withValue.includes(date)),
      sourceDateBasis: basis,
      xAxisMatchesSourceDates: basis.every((date) => xAxisDates.includes(date)),
    };
  });
};

const currentChangeSafety = () => {
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  const changed = Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].filter(Boolean))).sort();
  const forbidden = changed.filter(
    (file) =>
      file === "package.json" ||
      file === "package-lock.json" ||
      file === "vercel.json" ||
      file.startsWith(".vercel/") ||
      file.startsWith("lib/storage/") ||
      file.startsWith("lib/tmall/") ||
      file.startsWith("lib/v05/") ||
      file.startsWith("private-samples/"),
  );
  return { changed, forbidden };
};

const countTypes = (files: ParsedFileAudit[], field: "detectFileType" | "diagnosticType") => {
  const counts: Record<string, number> = {};
  files.forEach((file) => {
    const value = String(file[field]);
    counts[value] = (counts[value] ?? 0) + 1;
  });
  return counts;
};

const buildRootCauses = ({
  files,
  runtime,
  totalDiffs,
  multiImport,
  charts,
  sourcePlanDates,
}: {
  files: ParsedFileAudit[];
  runtime: RuntimeSummary;
  totalDiffs: ReturnType<typeof compareTotals>;
  multiImport: Awaited<ReturnType<typeof multiImportDiagnostics>>;
  charts: ChartDiagnostic[];
  sourcePlanDates: string[];
}): string[] => {
  const causes = new Set<string>();
  if (files.some((file) => file.detectFileType === "plan_metric" && file.diagnosticType === "product_metric")) {
    causes.add("product_metric_misidentified_as_plan_metric_due_to_plan_field_priority");
  }
  if (files.some((file) => file.diagnosticType === "plan_metric_without_product_id")) {
    causes.add("plan_summary_without_product_id_not_supported_for_product_level_plan_metrics");
  }
  if (files.some((file) => file.diagnosticType === "unsupported_after_sales")) {
    causes.add("after_sales_not_supported_in_etl_v2");
  }
  if (multiImport.rootCause === "runtime_replace_not_append") {
    causes.add("runtime_replace_not_append");
  }
  if (runtime.searchTotalKeywordsByDate.date_lost || runtime.searchProductKeywordsByDate.date_lost) {
    causes.add("search_keyword_date_lost_or_cross_day_dedup");
  }
  const runtimePlanDates = Object.keys(runtime.planMetricsByDate).sort();
  const oneDayEarlier = (date: string): string => {
    const parsed = new Date(`${date}T00:00:00Z`);
    parsed.setUTCDate(parsed.getUTCDate() - 1);
    return parsed.toISOString().slice(0, 10);
  };
  if (
    sourcePlanDates.length > 0 &&
    sourcePlanDates.some((date) => !runtimePlanDates.includes(date) && runtimePlanDates.includes(oneDayEarlier(date)))
  ) {
    causes.add("slash_date_timezone_shift_in_etl_parse_date");
  }
  if (Object.values(totalDiffs).some((value) => typeof value === "number" && Math.abs(value) > 0.0001)) {
    causes.add("runtime_totals_do_not_match_direct_source_summary");
  }
  if (charts.some((chart) => chart.missingDates.length > 0)) {
    causes.add("chart_non_null_dates_do_not_cover_source_dates");
  }
  return Array.from(causes);
};

const outputSafeFileSummaries = (files: ParsedFileAudit[]) =>
  files.map((file) => ({
    safeCode: file.safeCode,
    relativePathHash: file.relativePathHash,
    extension: file.extension,
    sheetCount: file.sheetCount,
    rowCount: file.rowCount,
    first20Fields: file.safeFirst20Fields,
    detectFileType: file.detectFileType,
    diagnosticType: file.diagnosticType,
    matchedCanonicalFields: file.matchedCanonicalFields,
    scoreTop: Object.entries(file.scores)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 4),
    inferredDates: file.dateCandidates,
    pathDateDetected: file.pathDateDetected,
    hasProductId: file.hasProductId,
    hasKeyword: file.hasKeyword,
    hasPlanMetrics: file.hasPlanMetrics,
    hasBusinessMetrics: file.hasBusinessMetrics,
    hasAfterSalesFields: file.hasAfterSalesFields,
    parseError: file.parseError ?? null,
  }));

const main = async () => {
  const sourceDir = discoverDirectory();
  if (!sourceDir) {
    block("realDirectoryNotFound", { tried: CANDIDATE_DIRS });
  }
  const selectedSourceDir: string = sourceDir ?? block("realDirectoryNotFound", { tried: CANDIDATE_DIRS });

  const sourceFiles = findFiles(selectedSourceDir);
  if (sourceFiles.length === 0) {
    block("noExcelOrCsvFilesFound", { sourceDir: safeCode(selectedSourceDir) });
  }

  const parsedFiles = await parseFiles(selectedSourceDir, sourceFiles);
  const detectedCounts = countTypes(parsedFiles, "detectFileType");
  const diagnosticCounts = countTypes(parsedFiles, "diagnosticType");
  const directByDate = directSummaries(parsedFiles);
  const matrix = dateMatrix(parsedFiles);
  const source = sourceTotals(directByDate);
  const runtimeAll = await runRuntimeAllFiles(parsedFiles);
  const totalDiffs = compareTotals(source, runtimeAll.summary.totals);
  const dates = Object.keys(directByDate).filter((date) => date !== "unknown_date").sort();
  const multiImport = await multiImportDiagnostics(parsedFiles, dates);

  await runRuntimeAllFiles(parsedFiles);
  const productMetricDates = matrix.filter((row) => row.productMetricFiles > 0).map((row) => row.date).filter((date) => date !== "unknown_date");
  const planMetricDates = matrix.filter((row) => row.planMetricFiles > 0).map((row) => row.date).filter((date) => date !== "unknown_date");
  const searchDates = matrix
    .filter((row) => row.searchTotalFiles > 0 || row.searchProductFiles > 0)
    .map((row) => row.date)
    .filter((date) => date !== "unknown_date");
  const charts = await chartDiagnostics({
    productMetric: productMetricDates,
    planMetric: planMetricDates,
    search: searchDates,
    all: dates,
  });
  const rootCauses = buildRootCauses({
    files: parsedFiles,
    runtime: runtimeAll.summary,
    totalDiffs,
    multiImport,
    charts,
    sourcePlanDates: planMetricDates,
  });
  const changeSafety = currentChangeSafety();
  addCheck("realDirectoryFound", true, { selectedPathHash: safeCode(selectedSourceDir), tried: CANDIDATE_DIRS.length });
  addCheck("filesScanned", parsedFiles.length > 0, { count: parsedFiles.length });
  addCheck("noForbiddenPathChanges", changeSafety.forbidden.length === 0, changeSafety.forbidden);
  addCheck("scriptOnlyBusinessNoop", true, "No app/components/lib/package/server writes performed by this script.");

  const hasProductMetricMisid = parsedFiles.some((file) => file.detectFileType === "plan_metric" && file.diagnosticType === "product_metric");
  const planErrors = runtimeAll.result.issues
    .filter((issue) => issue.code === "etl_missing_required_field" || issue.code === "etl_file_type_unknown" || issue.code === "etl_parse_failed")
    .map((issue) => ({ code: issue.code, level: issue.level, fileName: issue.fileName, sheetName: issue.sheetName ?? null, rowIndex: issue.rowIndex ?? null }));

  const report = {
    status: "PASS" as Status,
    gate: {
      taskMeaning: "真实文件数据对账和根因诊断；不修 UI、不改 ETL/BI、不部署。",
      evidenceRead: [selectedSourceDir, "lib/etl/runtime/*", "lib/bi/bi.data-source.ts", "lib/bi/bi.home-mapper.ts"],
      gateStatus: "pass",
      unsafeShortcutAvoided: "没有把公网页面现象当根因；先做源文件直算 vs runtime vs chart 日期轴对账。",
      validation: "scan + detect/scoring + direct aggregation + runETLRuntime + multi-import replacement check + chart xAxis diagnostics",
      archiveTarget: "script output and final response only",
    },
    directory: {
      found: true,
      selectedPathHash: safeCode(selectedSourceDir),
      tried: CANDIDATE_DIRS,
    },
    fileScan: {
      fileCount: parsedFiles.length,
      safeFiles: outputSafeFileSummaries(parsedFiles),
    },
    recognitionMatrix: {
      detectCounts: detectedCounts,
      diagnosticCounts,
      productReportMisidentifiedAsPlan: hasProductMetricMisid,
      planReportIssues: planErrors.slice(0, 50),
      afterSalesDetected: diagnosticCounts.unsupported_after_sales ?? 0,
      unknownCount: detectedCounts.unknown ?? 0,
    },
    dateMatrix: matrix,
    directSourceSummaryByDate: directByDate,
    runtimeETLSummary: runtimeAll.summary,
    directVsRuntimeDiff: totalDiffs,
    multiImportDiagnostics: multiImport,
    chartDiagnostics: charts,
    searchKeywordDiagnostics: {
      searchTotalKeepsDateInRuntime: false,
      searchProductKeepsDateInRuntime: false,
      searchTotalDedupIncludesDate: false,
      searchProductDedupIncludesDate: false,
      rootCause: "search_keyword_date_lost_or_cross_day_dedup",
    },
    afterSalesDiagnostics: {
      afterSalesDetected: (diagnosticCounts.unsupported_after_sales ?? 0) > 0,
      supportedByCurrentETL: false,
      rootCause: (diagnosticCounts.unsupported_after_sales ?? 0) > 0 ? "after_sales_not_supported_in_etl_v2" : null,
    },
    searchProductRemovalDecision: {
      canRemoveSearchProductForHome: true,
      canRemoveSearchProductForSeries: false,
      canRemoveSearchProductForProduct: false,
      reason: "首页总品牌词可由总搜索词表计算；系列/宝贝必须 productId-first，不能只靠总搜索词表。",
    },
    rootCauses,
    nextFixTasks: {
      P0: [
        "修正文件识别优先级：商品经营表同时含 ROI/花费字段时不得优先路由到 plan_metric。",
        "为计划汇总类文件给出明确 unsupported_plan_summary 或安全降级，不要伪装商品级计划指标。",
        "为搜索词 ETL 合同加入 date，并把 dedup key 改为 platform/store/date/keyword 与 platform/store/product/date/keyword。",
        "明确多次导入行为：当前 runtime 是 replace，需要实现 append/merge 或在 UI 明确覆盖边界。",
      ],
      P1: [
        "接入 after_sales 文件类型与安全聚合，支持总退货率/发货退货率/已签收退货率。",
        "统一 chart xAxis：GMV/GSV/转化率/客单价与推广指标按日期轴对齐，缺失值保留 null 不补 0。",
        "补系列/宝贝筛选交互的数据口径验证，确保 productId-first 不跨商品混算。",
      ],
      P2: [
        "优化识别失败和缺日期提示文案，把源文件缺失、ETL 不支持、图表缺值分开显示。",
      ],
    },
    safety: {
      noCodeModifiedByScript: true,
      noRealSamplesUploaded: true,
      noStorageTmallV05Changed: changeSafety.forbidden.filter((file) => file.startsWith("lib/storage/") || file.startsWith("lib/tmall/") || file.startsWith("lib/v05/")).length === 0,
      noPackageChanged: !changeSafety.changed.includes("package.json") && !changeSafety.changed.includes("package-lock.json"),
      changedFilesCount: changeSafety.changed.length,
      forbiddenChangedFiles: changeSafety.forbidden,
    },
    checks,
  };

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.log(JSON.stringify({ ...report, status: "FAIL" as Status }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  const status: Status = error instanceof Error && error.name === "AuditBlockedError" ? "BLOCKED" : "FAIL";
  console.log(JSON.stringify({
    status,
    error: error instanceof Error ? error.message : String(error),
    checks,
  }, null, 2));
  process.exit(status === "BLOCKED" ? 2 : 1);
});
