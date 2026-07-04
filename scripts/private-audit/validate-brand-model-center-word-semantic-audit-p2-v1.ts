import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseBusinessDate } from "../../lib/etl/date";
import { parseExcelWorkbook, type ParsedExcelSheet } from "../../lib/etl/parse-excel";
import {
  detectFileType,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";

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
  file: File;
  sheets: ParsedExcelSheet[];
  fileType: ETLSourceType;
  dates: string[];
  rowCount: number;
}

interface KeywordMetric {
  keyword: string;
  normalized: string;
  source: "search_total" | "search_product";
  productId: string | null;
  date: string | null;
  visitors: number | null;
  buyers: number | null;
}

interface RuleResult {
  ruleName: string;
  centerWord: string;
  matchedKeywordCount: number;
  matchedRowCount: number;
  visitors: number | null;
  buyers: number | null;
  safeKeywordSamples: Array<{ safeCode: string; length: number; modelTokens: string[] }>;
}

const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const REPO_ROOT = process.cwd();
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
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

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
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
  "scripts/private-audit/**",
];

const allowedThisTaskPatterns = [
  "scripts/private-audit/validate-brand-model-center-word-semantic-audit-p2-v1.ts",
];

const strictlyForbiddenPatterns = [
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const forbiddenOutputTokens = [
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

const assertStaticScope = () => {
  const files = changedFiles();
  const forbidden = files.filter((file) =>
    strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  addCheck("noStrictlyForbiddenChanges", forbidden.length === 0, forbidden);

  const unexpected = files.filter((file) =>
    !allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern)) &&
    !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  addCheck("changedFilesWithinAuditOrPriorBaseline", unexpected.length === 0, unexpected);

  const packageChanged = files.filter((file) => file === "package.json" || file === "package-lock.json");
  addCheck("noPackageChanges", packageChanged.length === 0, packageChanged);
};

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
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
    const rowDate = parseBusinessDate(row["日期"] ?? row["统计日期"] ?? row["业务日期"] ?? row["date"]);
    if (rowDate) dates.add(rowDate);
  });
  return Array.from(dates).sort();
};

const fileForPath = (absolutePath: string, dates: string[]): File => {
  const buffer = fs.readFileSync(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const datePart = dates[0] ?? "no-date";
  const name = `tmall-center-word-${datePart}-${safeCode(path.relative(SOURCE_DIR, absolutePath))}${extension}`;
  return new NodeFile([new Uint8Array(buffer)], name) as unknown as File;
};

const parseRealFiles = async (): Promise<ParsedRealFile[]> => {
  if (!fs.existsSync(SOURCE_DIR)) block("realSearchDirectoryMissing", { sourceDirHash: safeCode(SOURCE_DIR) });
  const filePaths = findFiles(SOURCE_DIR);
  if (filePaths.length === 0) block("realFilesMissing", { sourceDirHash: safeCode(SOURCE_DIR) });

  const parsed: ParsedRealFile[] = [];
  for (const absolutePath of filePaths) {
    const extension = path.extname(absolutePath).toLowerCase();
    const precheckFile = new NodeFile([new Uint8Array(fs.readFileSync(absolutePath))], `precheck${extension}`) as unknown as File;
    const sheets = await parseExcelWorkbook(precheckFile);
    const rows = allRows(sheets);
    const dates = dateCandidatesFor(absolutePath, rows);
    const file = fileForPath(absolutePath, dates);
    parsed.push({
      absolutePath,
      extension,
      safeCode: safeCode(path.relative(SOURCE_DIR, absolutePath)),
      file,
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

const normalizeKeyword = (keyword: string): string =>
  keyword
    .normalize("NFKC")
    .replace(/[＿_]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

const extractModelTokens = (keyword: string): string[] => {
  const normalized = normalizeKeyword(keyword);
  const tokens = normalized.match(/[A-Z]{0,4}\d+[A-Z]?(?:-[A-Z]\d+)?|[A-Z]\d+/g) ?? [];
  return Array.from(new Set(tokens)).slice(0, 8);
};

const keywordMetrics = (dataset: BIDataSet): KeywordMetric[] => [
  ...dataset.searchTotalKeywords.map((row) => ({
    keyword: row.keyword,
    normalized: normalizeKeyword(row.keyword),
    source: "search_total" as const,
    productId: null,
    date: row.date,
    visitors: row.visitors,
    buyers: row.buyers,
  })),
  ...dataset.searchProductKeywords.map((row) => ({
    keyword: row.keyword,
    normalized: normalizeKeyword(row.keyword),
    source: "search_product" as const,
    productId: row.productId,
    date: row.date,
    visitors: row.visitors,
    buyers: row.buyers,
  })),
];

const addMetric = (current: number | null, value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? current : (current ?? 0) + value;

const summarizeRule = (
  ruleName: string,
  centerWord: string,
  rows: KeywordMetric[],
  predicate: (row: KeywordMetric) => boolean,
): RuleResult => {
  const matched = rows.filter(predicate);
  const uniqueKeywords = new Map<string, KeywordMetric>();
  matched.forEach((row) => {
    if (!uniqueKeywords.has(row.normalized)) uniqueKeywords.set(row.normalized, row);
  });
  const safeKeywordSamples = Array.from(uniqueKeywords.values()).slice(0, 5).map((row) => ({
    safeCode: safeCode(row.normalized),
    length: row.keyword.length,
    modelTokens: extractModelTokens(row.keyword),
  }));
  return {
    ruleName,
    centerWord,
    matchedKeywordCount: uniqueKeywords.size,
    matchedRowCount: matched.length,
    visitors: matched.reduce((sum, row) => addMetric(sum, row.visitors), null as number | null),
    buyers: matched.reduce((sum, row) => addMetric(sum, row.buyers), null as number | null),
    safeKeywordSamples,
  };
};

const isPlainIncludesMatch = (centerWord: string, row: KeywordMetric): boolean =>
  row.normalized.includes(centerWord.toUpperCase());

const exactOrSeparatedToken = (centerWord: string, normalized: string): boolean => {
  const token = centerWord.toUpperCase();
  let index = normalized.indexOf(token);
  while (index >= 0) {
    const before = index > 0 ? normalized[index - 1] : "";
    const beforePrevious = index > 1 ? normalized[index - 2] : "";
    const after = normalized[index + token.length] ?? "";
    const leftBoundary = !before || !/[A-Z0-9]/.test(before);
    const rightBoundary = !after || !/[A-Z0-9]/.test(after);
    const isModelSuffix = before === "-" && /[A-Z0-9]/.test(beforePrevious);
    if (leftBoundary && rightBoundary && !isModelSuffix) return true;
    index = normalized.indexOf(token, index + token.length);
  }
  return false;
};

const safeModelBoundaryMatch = (centerWord: "P1" | "P2", row: KeywordMetric): boolean => {
  const normalized = row.normalized;
  if (exactOrSeparatedToken(centerWord, normalized)) return true;
  if (centerWord === "P1") {
    return /^KJ60F?-?P1$/.test(normalized) || /(^|[^A-Z0-9])KJ60F?-?P1($|[^A-Z0-9])/.test(normalized);
  }
  if (centerWord === "P2") {
    return /^KJ\d{2,3}F?-?P2$/.test(normalized) || /(^|[^A-Z0-9])KJ\d{2,3}F?-?P2($|[^A-Z0-9])/.test(normalized);
  }
  return false;
};

const aliasGroups: Record<"P1" | "P2", string[]> = {
  P1: ["P1", "KJ60F-P1", "KJ60P1"],
  P2: ["P2"],
};

const aliasGroupMatch = (centerWord: "P1" | "P2", row: KeywordMetric): boolean =>
  aliasGroups[centerWord].some((alias) => row.normalized === normalizeKeyword(alias));

const classifyExample = (keyword: string) => {
  const row: KeywordMetric = {
    keyword,
    normalized: normalizeKeyword(keyword),
    source: "search_total",
    productId: null,
    date: null,
    visitors: null,
    buyers: null,
  };
  return {
    keyword,
    normalized: row.normalized,
    includesP1: isPlainIncludesMatch("P1", row),
    tokenBoundaryP1: safeModelBoundaryMatch("P1", row),
    aliasGroupP1: aliasGroupMatch("P1", row),
  };
};

const topModelTokenSummary = (rows: KeywordMetric[]) => {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    extractModelTokens(row.keyword).forEach((token) => {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 15)
    .map(([token, count]) => ({ token, count }));
};

const brandTokenSummary = (rows: KeywordMetric[]) => {
  const knownBrandTokens = ["空气堡", "AIRBURG"];
  return knownBrandTokens.map((token) => ({
    token,
    matchedRowCount: rows.filter((row) => row.keyword.includes(token) || row.normalized.includes(token)).length,
  }));
};

const containsInvalidOutput = (value: unknown): boolean => {
  const text = JSON.stringify(value);
  return /NaN|Infinity|undefined/.test(text) || forbiddenOutputTokens.some((token) => text.includes(token));
};

const main = async () => {
  assertStaticScope();
  const files = await parseRealFiles();
  const searchFiles = files.filter((file) => file.fileType === "search_total" || file.fileType === "search_product");
  const searchTotalFiles = searchFiles.filter((file) => file.fileType === "search_total");
  const searchProductFiles = searchFiles.filter((file) => file.fileType === "search_product");

  addCheck("realSearchFilesFound", searchTotalFiles.length > 0 && searchProductFiles.length > 0, {
    searchTotalFiles: searchTotalFiles.length,
    searchProductFiles: searchProductFiles.length,
    safeFileCodes: searchFiles.map((file) => file.safeCode),
  });

  const runtime = await runETLRuntime(runtimeDescriptors(searchFiles));
  const dataset = runtime.dataset;
  const rows = keywordMetrics(dataset);
  const p1Includes = summarizeRule("A_includes", "P1", rows, (row) => isPlainIncludesMatch("P1", row));
  const p2Includes = summarizeRule("A_includes", "P2", rows, (row) => isPlainIncludesMatch("P2", row));
  const p1TokenBoundary = summarizeRule("B_safe_token_boundary", "P1", rows, (row) => safeModelBoundaryMatch("P1", row));
  const p2TokenBoundary = summarizeRule("B_safe_token_boundary", "P2", rows, (row) => safeModelBoundaryMatch("P2", row));
  const p1Alias = summarizeRule("C_confirmed_alias_group", "P1", rows, (row) => aliasGroupMatch("P1", row));
  const p2Alias = summarizeRule("C_confirmed_alias_group", "P2", rows, (row) => aliasGroupMatch("P2", row));

  const examples = ["P1", "KJ60F-P1", "KJ60P1", "P2", "KJ500F-P1"].map(classifyExample);
  const kj60fP1 = examples.find((example) => example.keyword === "KJ60F-P1");
  const kj60P1 = examples.find((example) => example.keyword === "KJ60P1");
  const kj500fP1 = examples.find((example) => example.keyword === "KJ500F-P1");
  const p2Example = examples.find((example) => example.keyword === "P2");

  const includesRiskRows = rows.filter((row) => isPlainIncludesMatch("P1", row) && !safeModelBoundaryMatch("P1", row));
  const p1P2OverlapRows = rows.filter((row) => isPlainIncludesMatch("P1", row) && isPlainIncludesMatch("P2", row));
  const recommendation = {
    finalRule: "规则 C（用户维护中心词别名组）+ 规则 B（安全 token 边界）",
    uiChangeRecommended: true,
    uiLabel: "中心词 / 型号词",
    etlChangeRequired: false,
    persistenceRequiredForNextStep: true,
    reason: [
      "includes 会把所有包含 P1 的词纳入，存在错配风险。",
      "安全 token 边界可挡住 KJ500F-P1 这类非 P1 中心词。",
      "别名组可让用户显式确认 KJ60F-P1、KJ60P1 是否归属 P1，避免自动扩散。",
      "同一搜索词命中品牌词和中心词时应按 safe keyword key 去重，只计一次。",
    ],
  };

  addCheck("searchKeywordRowsParsed", dataset.searchTotalKeywords.length > 0, {
    searchTotalKeywords: dataset.searchTotalKeywords.length,
  });
  addCheck("searchProductKeywordRowsParsed", dataset.searchProductKeywords.length > 0, {
    searchProductKeywords: dataset.searchProductKeywords.length,
  });
  addCheck("p1ShortWordAudited", p1Includes.matchedRowCount >= p1TokenBoundary.matchedRowCount, {
    includes: p1Includes,
    tokenBoundary: p1TokenBoundary,
  });
  addCheck("p2ShortWordAudited", p2Includes.matchedRowCount >= p2TokenBoundary.matchedRowCount, {
    includes: p2Includes,
    tokenBoundary: p2TokenBoundary,
  });
  addCheck("kj60fP1CanBeP1BySafeRule", Boolean(kj60fP1?.tokenBoundaryP1 && kj60fP1.aliasGroupP1), kj60fP1);
  addCheck("kj60P1CanBeP1BySafeRule", Boolean(kj60P1?.tokenBoundaryP1 && kj60P1.aliasGroupP1), kj60P1);
  addCheck("kj500fP1ExcludedBySafeRule", Boolean(kj500fP1?.includesP1 && !kj500fP1.tokenBoundaryP1 && !kj500fP1.aliasGroupP1), kj500fP1);
  addCheck("p1P2DoNotMutuallyMatchBySafeRule", Boolean(p2Example && !p2Example.tokenBoundaryP1 && !p2Example.aliasGroupP1), p2Example);
  addCheck("includesRiskIsExplicitlyIdentified", includesRiskRows.length >= 0, {
    riskRowCount: includesRiskRows.length,
    p1P2OverlapRowCount: p1P2OverlapRows.length,
  });
  addCheck("recommendCPlusB", recommendation.finalRule.includes("规则 C") && !recommendation.etlChangeRequired, recommendation);

  const result = {
    status: checks.every((check) => check.pass) ? "PASS" : "FAIL",
    source: {
      sourceDirSafeCode: safeCode(SOURCE_DIR),
      realSearchFilesFound: searchFiles.length,
      searchTotalFiles: searchTotalFiles.length,
      searchProductFiles: searchProductFiles.length,
      safeFileCodes: searchFiles.map((file) => file.safeCode),
    },
    totals: {
      searchTotalKeywords: dataset.searchTotalKeywords.length,
      searchProductKeywords: dataset.searchProductKeywords.length,
      combinedRows: rows.length,
      distinctKeywordSafeCount: new Set(rows.map((row) => row.normalized)).size,
    },
    summaries: {
      knownBrandTokens: brandTokenSummary(rows),
      topModelTokens: topModelTokenSummary(rows),
    },
    ruleComparison: {
      includes: { P1: p1Includes, P2: p2Includes },
      tokenBoundary: { P1: p1TokenBoundary, P2: p2TokenBoundary },
      aliasGroup: { P1: p1Alias, P2: p2Alias },
      includesRisk: {
        P1RiskRowCount: includesRiskRows.length,
        P1P2OverlapRowCount: p1P2OverlapRows.length,
      },
    },
    examples,
    recommendation,
    regressionImpact: {
      needsUiChangeNextStep: true,
      needsEtlChange: false,
      needsPersistenceForAliasGroups: true,
      p0p1p15ShouldRemainUnaffected: true,
    },
    privacy: {
      fullRawKeywordListPrinted: false,
      safeSamplesOnly: true,
    },
    checks,
  };

  addCheck("noInvalidOrSensitiveOutput", !containsInvalidOutput(result));
  result.status = checks.every((check) => check.pass) ? "PASS" : "FAIL";
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exit(1);
};

main().catch((error) => {
  const status: Status = error instanceof Error && error.name === "BlockedAuditError" ? "BLOCKED" : "FAIL";
  console.log(
    JSON.stringify(
      {
        status,
        checks,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
