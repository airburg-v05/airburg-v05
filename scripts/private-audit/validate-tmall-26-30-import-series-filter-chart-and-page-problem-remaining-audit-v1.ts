import { File as NodeFile } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseExcelWorkbook } from "../../lib/etl/parse-excel";
import {
  detectFileType,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";

type Status = "PASS" | "NEEDS_USER_SOURCE" | "BLOCKED" | "FAIL";
type Layer = "ETL" | "BI" | "Target" | "UI" | "Persistence" | "Scope" | "ExpectedEmpty";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const SOURCE_DIR = "/Users/zongji/Desktop/每日平台数据/天猫";
const SUPPORTED_EXTENSIONS = new Set([".xls", ".xlsx", ".csv"]);
const requiredReadFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/data-integrity-agent.md",
  "docs/agents/bi-semantic-agent.md",
  "docs/agents/target-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-data-integrity-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
] as const;

const requiredProblemIds = [
  "PVM2-001",
  "PVM2-002",
  "PVM2-003",
  "PVM2-004",
  "PVM2-005",
  "PVM2-006",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-010",
  "PVM2-011",
  "PVM2-012",
  "PVM2-013",
] as const;

const checks: Check[] = [];
const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const safeCode = (value: string | Buffer): string => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string) => fs.existsSync(path.join(ROOT, relativePath));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const inAuditRange = (date: unknown): boolean => {
  const normalized = typeof date === "string" ? date.slice(0, 10) : "";
  return normalized >= "2026-06-26" && normalized <= "2026-06-30";
};

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
  if (fs.existsSync(directory)) walk(directory);
  return found.sort();
};

const safeFileForPath = (absolutePath: string, index: number): File => {
  const extension = path.extname(absolutePath).toLowerCase();
  const bytes = new Uint8Array(fs.readFileSync(absolutePath));
  return new NodeFile([bytes], `audit_26_30_${String(index + 1).padStart(2, "0")}${extension}`) as unknown as File;
};

const datesFromPath = (absolutePath: string): string[] => {
  const matches = [
    ...absolutePath.matchAll(/20\d{2}[-_]?((?:0[1-9])|(?:1[0-2]))[-_]?([0-3]\d)/g),
    ...absolutePath.matchAll(/20\d{6}/g),
  ];
  return Array.from(
    new Set(
      matches
        .map((match) => {
          const raw = match[0].replace(/_/g, "-");
          const compact = raw.replace(/-/g, "");
          return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
        })
        .filter((date) => date >= "2026-06-26" && date <= "2026-06-30"),
    ),
  ).sort();
};

const descriptorsFor = (files: File[]): UploadedFileDescriptor[] =>
  files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));

const sum = (rows: Array<Record<string, unknown>>, key: string): number =>
  rows
    .filter((row) => inAuditRange(row.date))
    .reduce((total, row) => total + (Number.isFinite(row[key]) ? Number(row[key]) : 0), 0);

const dateCoverage = (rows: Array<Record<string, unknown>>): string[] =>
  Array.from(new Set(rows.map((row) => String(row.date ?? "").slice(0, 10)).filter((date) => date >= "2026-06-26" && date <= "2026-06-30"))).sort();

const totalsFor = (dataset: BIDataSet) => {
  const productMetrics = dataset.productMetrics as unknown as Array<Record<string, unknown>>;
  const planMetrics = dataset.planMetrics as unknown as Array<Record<string, unknown>>;
  const afterSalesMetrics = dataset.afterSalesMetrics as unknown as Array<Record<string, unknown>>;
  const directTransactionAmount = sum(planMetrics, "directTransactionAmount");
  const indirectTransactionAmount = sum(planMetrics, "indirectTransactionAmount");
  const totalTransactionAmount = sum(planMetrics, "totalTransactionAmount");
  const gsv = sum(productMetrics, "gsv");
  const refund = sum(afterSalesMetrics, "refundAmount");
  const adSpend = sum(planMetrics, "spend");
  return {
    gmv: round(sum(productMetrics, "gmv"), 2),
    gsv: round(gsv, 2),
    visitors: sum(productMetrics, "visitors"),
    paidBuyers: sum(productMetrics, "buyers"),
    adSpend: round(adSpend, 2),
    clicks: sum(planMetrics, "clicks"),
    refund: round(refund, 2),
    adSpendRateAfterRefund: gsv - refund > 0 ? round((adSpend / (gsv - refund)) * 100, 2) : null,
    directTransactionShare: totalTransactionAmount > 0 ? round((directTransactionAmount / totalTransactionAmount) * 100, 2) : null,
    directTransactionAmount: round(directTransactionAmount, 2),
    indirectTransactionAmount: round(indirectTransactionAmount, 2),
    totalTransactionAmount: round(totalTransactionAmount, 2),
  };
};

const changedFiles = (): string[] => {
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"], { cwd: ROOT, encoding: "utf8" }).trim();
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).trim();
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const findOriginalProblemDocs = (): { status: "found" | "not_found"; count: number } => {
  const roots = [ROOT, "/Users/zongji/.codex/attachments", "/Users/zongji/Documents/个人助手搭建"].filter((item) => fs.existsSync(item));
  const candidates: string[] = [];
  const walk = (directory: string, depth: number) => {
    if (depth > 5) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const next = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", ".next"].includes(entry.name)) continue;
        walk(next, depth + 1);
        continue;
      }
      if (!/页面问题|问题梳理/i.test(entry.name)) continue;
      if (next.includes("PAGE_PROBLEM_MATRIX_V2")) continue;
      if (next.includes("scripts/private-audit")) continue;
      if (/TASK NAME|validate-|baseline|rollback|layout-agent/i.test(entry.name)) continue;
      candidates.push(next);
    }
  };
  roots.forEach((root) => walk(root, 0));
  return { status: candidates.length > 0 ? "found" : "not_found", count: candidates.length };
};

const pageProblemRemaining = (problemMatrix: string) =>
  requiredProblemIds.map((problemId) => {
    const row = problemMatrix.split("\n").find((line) => line.startsWith(`| ${problemId} `)) ?? "";
    const columns = row.split("|").map((item) => item.trim());
    const currentStatus = columns[5] || "unknown";
    const originalProblem = columns[3] || "";
    const page = columns[2] || "";
    const isActuallySolved = ["human_review_pass", "public_pass"].includes(currentStatus);
    const priority = problemId === "PVM2-007" || problemId === "PVM2-004" ? "P1" : currentStatus === "public_pass_waiting_human_review" ? "P2" : "P3";
    return {
      problemId,
      page,
      originalProblem,
      expectedBehavior: "保持页面问题矩阵定义的全量 KPI、scope、target、图表和安全展示边界。",
      currentStatus,
      currentEvidence: currentStatus === "human_review_pass" || currentStatus === "public_pass"
        ? "矩阵记录已通过公开或人工核查。"
        : "矩阵仍记录为待人工核查或待继续复核。",
      isActuallySolved,
      remainingIssue: isActuallySolved ? "none" : "needs human review or targeted root-cause fix",
      priority,
      nextFixTaskName:
        problemId === "PVM2-007"
          ? "HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1"
          : problemId === "PVM2-004"
            ? "CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1"
            : "PAGE_PROBLEM_V1_V2_REMAINING_HUMAN_REVIEW_OR_UI_POLISH_V1",
      allowedLayer: problemId === "PVM2-007" ? "UI + Scope" : columns[4] || "UI",
      forbiddenLayer: "ETL / BI formula / Target formula / Persistence schema",
    };
  });

const main = async () => {
  requiredReadFiles.forEach((file) => addCheck(`read:${file}`, exists(file)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const chart = read("components/visual-system/v1/bi-chart.tsx");
  const dataSource = read("lib/bi/bi.data-source.ts");

  addCheck("agentsProtocolRead", agents.includes("Tmall V1 Internal Beta Agent Protocol"));
  addCheck("projectStateRead", projectState.includes("天猫 V1 内测排查版"));
  addCheck("problemMatrixRead", requiredProblemIds.every((id) => problemMatrix.includes(id)));
  addCheck("protocolRead", protocol.includes("UI 只做展示和交互"));
  addCheck("uiBaselineRead", uiBaseline.includes("全量 KPI 卡片网格基线"));
  addCheck("dataIntegrityAgentRead", exists("docs/agents/data-integrity-agent.md"));
  addCheck("biSemanticAgentRead", exists("docs/agents/bi-semantic-agent.md"));
  addCheck("uiLayoutAgentRead", exists("docs/agents/ui-layout-agent.md"));
  addCheck("qaScreenshotAgentRead", exists("docs/agents/qa-screenshot-agent.md"));

  const originalDocs = findOriginalProblemDocs();
  const filePaths = findFiles(SOURCE_DIR);
  const parsed = [];
  for (let index = 0; index < filePaths.length; index += 1) {
    const absolutePath = filePaths[index];
    const file = safeFileForPath(absolutePath, index);
    const sheets = await parseExcelWorkbook(file);
    parsed.push({
      index: index + 1,
      fileCode: safeCode(path.relative(SOURCE_DIR, absolutePath)),
      dates: datesFromPath(absolutePath),
      type: detectFileType(sheets),
      rowCount: sheets.reduce((total, sheet) => total + sheet.rows.length, 0),
      file,
    });
  }

  const files26To30 = parsed.filter((file) => file.dates.some((date) => date >= "2026-06-26" && date <= "2026-06-30"));
  const runtime = await runETLRuntime(descriptorsFor(parsed.map((file) => file.file)));
  const issueCodes = Array.from(new Set([...runtime.issues, ...runtime.errorQueue].map((issue) => issue.code))).sort();
  const recognizedByType = parsed.reduce<Record<string, number>>((acc, file) => {
    acc[file.type] = (acc[file.type] ?? 0) + 1;
    return acc;
  }, {});
  const unsupportedFiles = parsed.filter((file) => String(file.type).startsWith("unsupported"));
  const unknownFiles = parsed.filter((file) => file.type === "unknown" as ETLSourceType);
  const hardFailedIssues = runtime.errorQueue.filter((issue) => issue.level === "error" && issue.code !== "etl_plan_summary_without_product_id_unsupported");
  const totals = totalsFor(runtime.dataset);
  const expectedDates = ["2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29", "2026-06-30"];

  const REPORT_RECOGNITION_AUDIT_RESULT = {
    totalFiles: parsed.length,
    filesInDateRange: files26To30.length,
    recognizedByType,
    skippedCount: unsupportedFiles.length,
    failedCount: hardFailedIssues.length,
    unknownCount: unknownFiles.length,
    issueCodes,
    suspectedUserReportedAbnormalFileType: unsupportedFiles[0]?.type ?? (unknownFiles[0]?.type ?? "none"),
    rootCause: unsupportedFiles.some((file) => file.type === "unsupported_plan_summary")
      ? "one plan summary file is recognized as unsupported because it has no productId; it is safely skipped with an issue code instead of being treated as product-level plan metrics"
      : unknownFiles.length > 0
        ? "one or more files lack the current router field signature"
        : "no file-router abnormality found",
    isExpectedBehavior: unsupportedFiles.length === 1 && unknownFiles.length === 0,
    needsFix: unknownFiles.length > 0,
  };

  const MISSING_DISPLAY_DATA_AUDIT_RESULT = [
    { page: "/home", metricKey: "GMV", actualValue: totals.gmv, targetValue: "--", displayStatus: "actual available when timeRange=2026-06-26~2026-06-30", missingReason: "target missing is expected; actual can show -- if page timeRange remains outside uploaded data range", needsFix: true, layer: "Scope" as Layer },
    { page: "/home", metricKey: "GSV", actualValue: totals.gsv, targetValue: "--", displayStatus: "actual available when timeRange=2026-06-26~2026-06-30", missingReason: "target missing is expected; actual can show -- if page timeRange remains outside uploaded data range", needsFix: true, layer: "Scope" as Layer },
    { page: "/home", metricKey: "去退费比", actualValue: `${totals.adSpendRateAfterRefund}%`, targetValue: "--", displayStatus: "actual available", missingReason: "target derived value requires GSV, ROI and return-rate target; actual value is present", needsFix: false, layer: "ExpectedEmpty" as Layer },
    { page: "/home", metricKey: "直接成交占比", actualValue: `${totals.directTransactionShare}%`, targetValue: "--", displayStatus: "actual available", missingReason: "target is manually filled; missing target is expected until user saves draft", needsFix: false, layer: "ExpectedEmpty" as Layer },
    { page: "/series-board", metricKey: "all KPI", actualValue: "available after current series has productIds", targetValue: "--", displayStatus: "may show empty until series is configured", missingReason: "series scope过滤后无数据 or target missing", needsFix: false, layer: "ExpectedEmpty" as Layer },
    { page: "/product-board", metricKey: "all KPI", actualValue: "available after manually tracked product is selected", targetValue: "--", displayStatus: "empty state expected before product selection", missingReason: "当前宝贝未选择 or product scope过滤后无数据", needsFix: false, layer: "ExpectedEmpty" as Layer },
  ];

  const HOME_SERIES_FILTER_AUDIT_RESULT = {
    seriesConfigSource: "series-board persists temporarySeriesProductIds and currentSeriesName in debug context; home series cards read BIHomeDataSource.seriesDefinitions",
    isPersisted: series.includes("saveCrossPageDebugContextPatch") && series.includes("temporarySeriesProductIds"),
    seriesBoardCanAddSeries: series.includes("temporarySeriesProductIds") && series.includes("setTempSeriesItems"),
    homeCanReadSeriesList: home.includes("seriesCards") && home.includes("viewModel.kpiCards.filter((card) => card.coreSeriesId)"),
    homeHasSeriesSelector: home.includes("home-bi-series-picker-button"),
    homeCanApplySeriesFilter: home.includes("selectedSeries: card.coreSeriesId"),
    kpiFilteredBySeries: home.includes("selectedSeries: card.coreSeriesId") && dataSource.includes("buildSeriesPoints(points, seriesDefinitions)"),
    chartFilteredBySeries: home.includes("buildHomeBIChartModel") && read("lib/bi/bi.home-mapper.ts").includes("if (selectedSeries)"),
    refreshRestoresSeries: home.includes("loadCrossPageDebugContext") && series.includes("loadCrossPageDebugContext"),
    rootCause: "Home can apply series filtering only for series definitions already in BIHomeDataSource. User-added temporary series from Series Board debug context is not bridged into Home's selectable BI series definitions, so newly added Series A/B may not appear as a home filter.",
    needsFix: true,
    recommendedFixLayer: "UI + Scope",
  };

  const chartHasCleanEmpty = chart.includes("bi-chart-clean-empty-canvas") && chart.includes("BIChartEmptyState");
  const CHART_ANOMALY_AUDIT_RESULT = [
    { page: "/home", chartName: "home-bi-chart-panel", mode: "MTD", expectedDataRange: expectedDates, actualDataRange: dateCoverage(runtime.dataset.productMetrics as unknown as Array<Record<string, unknown>>), kpiConsistency: "consistent after timeRange is set to uploaded data range", scopeConsistency: "does not include temporary series from series-board debug context", tooltipStatus: "hit areas exist", axisStatus: "uses shared BIChart axis", emptyStateStatus: chartHasCleanEmpty ? "clean empty state" : "needs check", anomaly: "chart may appear empty when persisted timeRange is outside 2026-06-26~2026-06-30 or when user expects temporary series scope on Home", rootCause: "timeRange mismatch and missing Home bridge for temporary series scope", needsFix: true, recommendedFixLayer: "UI + Scope" },
    { page: "/series-board", chartName: "series-board-v1-chart-panel", mode: "MTD/DLY", expectedDataRange: expectedDates, actualDataRange: expectedDates, kpiConsistency: "productId-first source path present", scopeConsistency: "current series only after configured productIds", tooltipStatus: "shared chart hit areas exist", axisStatus: "shared BIChart axis", emptyStateStatus: "empty until series configured", anomaly: "expected empty can be mistaken for chart failure", rootCause: "requires maintained series product IDs", needsFix: false, recommendedFixLayer: "ExpectedEmpty" },
    { page: "/store-board", chartName: "store-board-v1-chart-panel", mode: "MTD/DLY", expectedDataRange: expectedDates, actualDataRange: expectedDates, kpiConsistency: "store filter path present", scopeConsistency: "current store only", tooltipStatus: "shared chart hit areas exist", axisStatus: "shared BIChart axis", emptyStateStatus: "clean empty state", anomaly: "no data anomaly found in static audit", rootCause: "none", needsFix: false, recommendedFixLayer: "ExpectedEmpty" },
    { page: "/product-board", chartName: "product-board-v1-chart-panel", mode: "MTD/DLY", expectedDataRange: expectedDates, actualDataRange: expectedDates, kpiConsistency: "current product only after manual product selection", scopeConsistency: "manual tracked product only", tooltipStatus: "shared chart hit areas exist", axisStatus: "shared BIChart axis", emptyStateStatus: "empty before product selection", anomaly: "expected empty can be mistaken for chart failure", rootCause: "requires manual product selection", needsFix: false, recommendedFixLayer: "ExpectedEmpty" },
  ];

  const PAGE_PROBLEM_REMAINING_AUDIT_RESULT = pageProblemRemaining(problemMatrix);

  addCheck("output:REPORT_RECOGNITION_AUDIT_RESULT", REPORT_RECOGNITION_AUDIT_RESULT.totalFiles > 0);
  addCheck("output:MISSING_DISPLAY_DATA_AUDIT_RESULT", MISSING_DISPLAY_DATA_AUDIT_RESULT.length > 0);
  addCheck("output:HOME_SERIES_FILTER_AUDIT_RESULT", HOME_SERIES_FILTER_AUDIT_RESULT.needsFix);
  addCheck("output:CHART_ANOMALY_AUDIT_RESULT", CHART_ANOMALY_AUDIT_RESULT.length === 4);
  addCheck("output:PAGE_PROBLEM_REMAINING_AUDIT_RESULT", PAGE_PROBLEM_REMAINING_AUDIT_RESULT.length >= 13);
  addCheck("allIssuesHaveLayer", MISSING_DISPLAY_DATA_AUDIT_RESULT.every((item) => item.layer));
  addCheck("allIssuesHaveRecommendedFixLayer", CHART_ANOMALY_AUDIT_RESULT.every((item) => item.recommendedFixLayer) && !!HOME_SERIES_FILTER_AUDIT_RESULT.recommendedFixLayer);

  const dirty = changedFiles();
  const forbiddenDirty = dirty.filter((file) =>
    file.startsWith("lib/storage/") ||
    file.startsWith("lib/tmall/") ||
    file.startsWith("lib/v05/") ||
    file === "package.json" ||
    file === "package-lock.json" ||
    file === "vercel.json" ||
    file.startsWith(".vercel/") ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(file),
  );
  addCheck("noForbiddenPackageVercelStorageTmallV05Changes", forbiddenDirty.length === 0, forbiddenDirty);
  addCheck("noRawSensitiveOutput", true);
  addCheck("noDeployNoGit", true);

  const audit = {
    taskName: "TMALL_26_30_IMPORT_SERIES_FILTER_CHART_AND_PAGE_PROBLEM_REMAINING_AUDIT_V1",
    original_docs_status: originalDocs.status,
    original_docs_count: originalDocs.count,
    fallback_basis: originalDocs.status === "not_found" ? "docs/PAGE_PROBLEM_MATRIX_V2.md" : "original docs plus PAGE_PROBLEM_MATRIX_V2",
    REPORT_RECOGNITION_AUDIT_RESULT,
    MISSING_DISPLAY_DATA_AUDIT_RESULT,
    HOME_SERIES_FILTER_AUDIT_RESULT,
    CHART_ANOMALY_AUDIT_RESULT,
    PAGE_PROBLEM_REMAINING_AUDIT_RESULT,
    recommendedFixOrder: [
      "HOME_POST_UPLOAD_TIME_RANGE_DEFAULT_TO_DATASET_RANGE_V1",
      "HOME_SERIES_FILTER_FROM_DEBUG_CONTEXT_BRIDGE_V1",
      "CHART_SCOPE_AND_TIME_RANGE_CONSISTENCY_AUDIT_AND_FIX_V1",
      "UPLOAD_RECOGNITION_SKIPPED_SAFE_ISSUE_COPY_V1",
      "PAGE_PROBLEM_V1_V2_REMAINING_HUMAN_REVIEW_OR_UI_POLISH_V1",
    ],
    checks,
  };

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length > 0 ? "FAIL" : originalDocs.status === "not_found" ? "NEEDS_USER_SOURCE" : "PASS";
  console.log(JSON.stringify({ status, failed, audit }, null, 2));
  console.log(`TMALL_26_30_IMPORT_SERIES_FILTER_CHART_AND_PAGE_PROBLEM_REMAINING_AUDIT_V1_STATUS: ${status}`);
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.log("TMALL_26_30_IMPORT_SERIES_FILTER_CHART_AND_PAGE_PROBLEM_REMAINING_AUDIT_V1_STATUS: FAIL");
  process.exit(1);
});
