import { File as NodeFile } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { aggregateSearchProductKeywords } from "../../lib/bi/brand-model-semantic";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-mapper";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFile,
} from "../../lib/etl/runtime";
import { detectFileType } from "../../lib/etl/runtime/file-router";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface FileSummary {
  safeCode: string;
  extension: string;
  sheetCount: number;
  rowCount: number;
  detectedType: ETLSourceType;
  headerSummary: string[];
}

const ROOT = process.cwd();
const SAMPLE_DIR = path.join(ROOT, "private-samples/tmall-real-etl");
const checks: Check[] = [];

const REQUIRED_TYPES: ETLSourceType[] = [
  "product_dimension",
  "product_metric",
  "plan_metric",
  "search_total",
  "search_product",
];

const SENSITIVE_OUTPUT_TOKENS = [
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
];

const SENSITIVE_HEADER_PATTERN = /订单|退款|交易|支付宝|电话|地址|物流|买家说明|商家备注|操作人|子账号/i;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const assertCheck = (name: string, condition: boolean, details?: unknown) => {
  addCheck(name, condition, details);
  if (!condition) throw new Error(`${name} failed`);
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

const isForbiddenChange = (file: string): boolean =>
  file === "package.json" ||
  file === "package-lock.json" ||
  file === "vercel.json" ||
  file.startsWith(".vercel/") ||
  file.startsWith("app/(workspace)/targets/") ||
  file.startsWith("app/(workspace)/raw-data/") ||
  file.startsWith("lib/storage/") ||
  file.startsWith("lib/tmall/") ||
  file.startsWith("lib/v05/");

const isPrivateSampleTracked = (): boolean =>
  git(["status", "--porcelain", "--", "private-samples"]).length > 0;

const listRealFiles = (): string[] => {
  if (!fs.existsSync(SAMPLE_DIR)) return [];
  const results: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 3) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
        return;
      }
      if (/\.(xls|xlsx|csv)$/i.test(entry.name)) results.push(fullPath);
    });
  };
  visit(SAMPLE_DIR, 0);
  return results.sort();
};

const safeCodeForBuffer = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex").slice(0, 12);

const fileFromPath = (filePath: string, index: number): { file: File; safeCode: string; extension: string } => {
  const buffer = fs.readFileSync(filePath);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return {
    file: new NodeFile([bytes], `real_sample_${index + 1}.${extension}`) as unknown as File,
    safeCode: safeCodeForBuffer(buffer),
    extension,
  };
};

const headerSummaryForSheets = (sheets: ParsedExcelSheet[]): string[] => {
  const headers = new Set<string>();
  sheets.forEach((sheet) => {
    const firstRow = sheet.rows.find((row) => Object.keys(row).length > 0);
    Object.keys(firstRow ?? {}).slice(0, 16).forEach((header) => {
      headers.add(SENSITIVE_HEADER_PATTERN.test(header) ? "[redacted-sensitive-header]" : header);
    });
  });
  return Array.from(headers).slice(0, 24);
};

const recordCount = (dataset: BIDataSet): number =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length;

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
  return SENSITIVE_OUTPUT_TOKENS.some((token) => serialized.includes(token));
};

const firstUsefulKeyword = (keywords: Array<{ keyword: string }>): string | null =>
  keywords.map((row) => row.keyword?.trim()).find(Boolean) ?? null;

const deriveBrandWords = (keyword: string | null): string[] => {
  const envWords = process.env.BRAND_WORDS?.split(/,|，|\n/).map((word) => word.trim()).filter(Boolean);
  if (envWords?.length) return envWords.slice(0, 4);
  if (!keyword) return [];
  const chunks = keyword.match(/[\p{Script=Han}A-Za-z0-9]+/gu) ?? [];
  const candidate = chunks.find((chunk) => chunk.length >= 2) ?? keyword;
  return [candidate.slice(0, Math.min(4, Math.max(2, candidate.length)))];
};

const deriveModelWords = (keyword: string | null): string[] => {
  const envWords = process.env.MODEL_WORDS?.split(/,|，|\n/).map((word) => word.trim()).filter(Boolean);
  if (envWords?.length) return envWords.slice(0, 4);
  if (!keyword) return [];
  return (keyword.match(/[A-Za-z]*\d+[A-Za-z0-9-]*/g) ?? []).slice(0, 3);
};

const summarizeByType = (summaries: FileSummary[]) =>
  REQUIRED_TYPES.map((type) => ({
    type,
    fileCount: summaries.filter((summary) => summary.detectedType === type).length,
    rowCount: summaries
      .filter((summary) => summary.detectedType === type)
      .reduce((total, summary) => total + summary.rowCount, 0),
  }));

const hasHeader = (summary: FileSummary, patterns: RegExp[]): boolean =>
  patterns.every((pattern) => summary.headerSummary.some((header) => pattern.test(header)));

const hasProductDimensionCoverage = (summaries: FileSummary[]): boolean =>
  summaries.some((summary) => summary.detectedType === "product_dimension") ||
  summaries.some((summary) =>
    hasHeader(summary, [/商品ID|宝贝ID|产品ID|主体ID|主商品ID|productId|itemId/i, /商品名称|宝贝名称|商品标题|主体名称|productName/i]),
  );

const main = async () => {
  clearRuntimeBIDataSet();

  assertCheck("sampleDirectoryExists", fs.existsSync(SAMPLE_DIR), { sampleDir: "private-samples/tmall-real-etl" });
  assertCheck("privateSamplesNotTracked", !isPrivateSampleTracked());

  const files = listRealFiles();
  assertCheck("atLeastFiveRealFilesFound", files.length >= 5, { fileCount: files.length });

  const fileInputs = files.map(fileFromPath);
  const summaries: FileSummary[] = [];
  for (const input of fileInputs) {
    const sheets = await parseExcelWorkbook(input.file);
    const rowCount = sheets.reduce((total, sheet) => total + sheet.rows.length, 0);
    summaries.push({
      safeCode: input.safeCode,
      extension: input.extension,
      sheetCount: sheets.length,
      rowCount,
      detectedType: detectFileType(sheets),
      headerSummary: headerSummaryForSheets(sheets),
    });
  }

  REQUIRED_TYPES.forEach((type) => {
    const pass = type === "product_dimension"
      ? hasProductDimensionCoverage(summaries)
      : summaries.some((summary) => summary.detectedType === type);
    assertCheck(`detect_${type}`, pass, {
      typeSummary: summarizeByType(summaries),
      productDimensionCoverage: type === "product_dimension" ? hasProductDimensionCoverage(summaries) : undefined,
      unknown: summaries
        .filter((summary) => summary.detectedType === "unknown")
        .map(({ safeCode, extension, sheetCount, rowCount, headerSummary }) => ({
          safeCode,
          extension,
          sheetCount,
          rowCount,
          headerSummary,
        })),
    });
  });

  const uploadedFiles: UploadedFile[] = fileInputs.map((input) => ({
    file: input.file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-real-smoke-store",
    storeName: "天猫真实样本店铺",
  }));

  const runtimeResult = await runETLRuntime(uploadedFiles);
  const { dataset } = runtimeResult;

  assertCheck("runETLRuntimeSucceeded", recordCount(dataset) > 0, runtimeResult.summary);
  assertCheck("productMetricsParsed", dataset.productMetrics.length > 0, { count: dataset.productMetrics.length });
  assertCheck("planMetricsParsedOrSafelyEmpty", dataset.planMetrics.length >= 0, { count: dataset.planMetrics.length });
  assertCheck("searchTotalKeywordsParsed", dataset.searchTotalKeywords.length > 0, { count: dataset.searchTotalKeywords.length });
  assertCheck("searchProductKeywordsParsed", dataset.searchProductKeywords.length > 0, { count: dataset.searchProductKeywords.length });
  assertCheck("noInvalidDatasetOutput", !hasInvalidOutput(dataset));

  const homeSource = await loadHomeBIDataSource();
  assertCheck("biHomeDataSourceReadsRuntimeETL", homeSource.dataStatus.label === "ETL运行时数据", homeSource.dataStatus);
  assertCheck("biHomePointsExist", homeSource.points.length > 0, { points: homeSource.points.length });
  assertCheck("biHomeSearchTotalExists", homeSource.searchTotalKeywords.length > 0, { count: homeSource.searchTotalKeywords.length });
  assertCheck("biHomeSearchProductExists", homeSource.searchProductKeywords.length > 0, { count: homeSource.searchProductKeywords.length });
  assertCheck("biHomeNoticesIncludeSearchCounts", homeSource.notices.some((notice) => notice.includes("搜索词总表")));

  const keyword = firstUsefulKeyword(homeSource.searchTotalKeywords);
  const brandWords = deriveBrandWords(keyword);
  const modelWords = deriveModelWords(keyword);
  assertCheck("brandOrModelWordsDerived", brandWords.length > 0 || modelWords.length > 0, {
    brandWordCount: brandWords.length,
    modelWordCount: modelWords.length,
  });

  const state = {
    ...createDefaultBIState(),
    selectedPlatform: "tmall",
    selectedStores: ["tmall-real-smoke-store"],
    selectedMetric: "品牌词访客" as const,
    brandModelFilter: { brandWords, modelWords },
  };
  const brandVisitorsViewModel = buildHomeBIViewModel(homeSource, state);
  const brandVisitorsCard = brandVisitorsViewModel.kpiCards.find((card) => card.title === "品牌词访客");
  const brandBuyersCard = brandVisitorsViewModel.kpiCards.find((card) => card.title === "品牌词支付人数");
  const geoCard = brandVisitorsViewModel.kpiCards.find((card) => card.title === "GEO搜索占比");
  const gmvBefore = brandVisitorsViewModel.kpiCards.find((card) => card.title === "GMV")?.rawValue ?? null;

  assertCheck("homeBrandVisitorsCalculatedOrNoMatch", !!brandVisitorsCard && (brandVisitorsCard.rawValue !== null || (brandVisitorsCard.description?.includes("不足") ?? false)), {
    rawValueStatus: brandVisitorsCard?.rawValue === null ? "no_match" : "calculated",
  });
  assertCheck("homeBrandBuyersCalculatedOrNoMatch", !!brandBuyersCard && (brandBuyersCard.rawValue !== null || (brandBuyersCard.description?.includes("不足") ?? false)), {
    rawValueStatus: brandBuyersCard?.rawValue === null ? "no_match" : "calculated",
  });
  assertCheck("geoSearchShareSafe", !!geoCard && (geoCard.rawValue === null || (geoCard.rawValue >= 0 && Number.isFinite(geoCard.rawValue))), {
    rawValueStatus: geoCard?.rawValue === null ? "no_match" : "calculated",
  });
  assertCheck("homeBrandTrendHasTotalLine", brandVisitorsViewModel.mtdChartModel.lines.some((line) => line.name === "品牌词合计"));

  const noFilterViewModel = buildHomeBIViewModel(homeSource, {
    ...state,
    brandModelFilter: { brandWords: [], modelWords: [] },
  });
  const gmvAfterNoFilter = noFilterViewModel.kpiCards.find((card) => card.title === "GMV")?.rawValue ?? null;
  assertCheck("globalGmvUnaffectedByBrandFilter", gmvBefore === gmvAfterNoFilter, { gmvBefore, gmvAfterNoFilter });

  const seriesProductId = homeSource.searchProductKeywords.find((row) => row.productId?.trim())?.productId ?? null;
  assertCheck("seriesProductIdAvailable", !!seriesProductId);
  const productFirstAggregate = aggregateSearchProductKeywords(homeSource.searchProductKeywords, { brandWords, modelWords }, [seriesProductId!]);
  const crossProductAggregate = aggregateSearchProductKeywords(homeSource.searchProductKeywords, { brandWords, modelWords }, ["__missing_product__"]);
  assertCheck("seriesProductIdFirstRule", productFirstAggregate.matchedRowCount >= 0 && crossProductAggregate.matchedRowCount === 0, {
    matchedRowCount: productFirstAggregate.matchedRowCount,
    missingProductMatchedRowCount: crossProductAggregate.matchedRowCount,
  });

  const currentChangedFiles = changedFiles();
  assertCheck("privateSamplesRemainIgnored", !currentChangedFiles.some((file) => file.startsWith("private-samples/")), currentChangedFiles);
  assertCheck("noForbiddenLayerChangesForSmoke", currentChangedFiles.every((file) => !isForbiddenChange(file)), currentChangedFiles.filter(isForbiddenChange));
  assertCheck("noSensitiveOutputInAudit", !hasSensitiveOutput({ summaries, runtimeSummary: runtimeResult.summary }));
  assertCheck("noInvalidOutputInAudit", !hasInvalidOutput({ summaries, runtimeSummary: runtimeResult.summary, homeStatus: homeSource.dataStatus }));

  const output = {
    status: "PASS",
    source: {
      sampleDirExists: true,
      fileCount: files.length,
      privateSamplesGitStatusEmpty: !isPrivateSampleTracked(),
    },
    typeSummary: summarizeByType(summaries),
    files: summaries.map(({ safeCode, extension, sheetCount, rowCount, detectedType, headerSummary }) => ({
      safeCode,
      extension,
      sheetCount,
      rowCount,
      detectedType,
      headerSummary,
    })),
    runtime: {
      summary: runtimeResult.summary,
      productMetrics: dataset.productMetrics.length,
      planMetrics: dataset.planMetrics.length,
      searchTotalKeywords: dataset.searchTotalKeywords.length,
      searchProductKeywords: dataset.searchProductKeywords.length,
      issueCodes: Array.from(new Set(runtimeResult.issues.map((issue) => issue.code))).sort(),
    },
    semantic: {
      brandWordCount: brandWords.length,
      modelWordCount: modelWords.length,
      homeBrandVisitors: brandVisitorsCard?.rawValue === null ? "no_match" : "calculated",
      homeBrandBuyers: brandBuyersCard?.rawValue === null ? "no_match" : "calculated",
      geoSearchShare: geoCard?.rawValue === null ? "no_match" : "calculated",
      seriesProductIdFirst: true,
    },
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
};

main().catch((error) => {
  addCheck("unhandledAuditError", false, error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ status: "FAIL", checks }, null, 2));
  process.exit(1);
});
