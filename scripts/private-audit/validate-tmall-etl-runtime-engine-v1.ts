import { File as NodeFile } from "node:buffer";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { deduplicateBIDataSet } from "../../lib/etl/dedup-engine";
import { parseExcelWorkbook } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
  getRuntimeBIDataSet,
  runETLRuntime,
  type BIDataSet,
} from "../../lib/etl/runtime";
import { detectFileType } from "../../lib/etl/runtime/file-router";

interface AuditCheck {
  name: string;
  pass: boolean;
  details?: unknown;
}

const checks: AuditCheck[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const assertCheck = (name: string, condition: boolean, details?: unknown) => {
  addCheck(name, condition, details);
  if (!condition) {
    throw new Error(`${name} failed`);
  }
};

const repoRoot = path.resolve(__dirname, "../..");

const workbookFile = (sheets: Record<string, Record<string, unknown>[]>): File => {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([sheetName, rows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), sheetName);
  });
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new NodeFile([bytes], "audit.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }) as unknown as File;
};

const textFile = (rows: Record<string, unknown>[]): File => workbookFile({ Sheet1: rows });

const hasForbiddenRuntimeWrites = () => {
  const runtimeFiles = [
    "lib/etl/runtime/engine.ts",
    "lib/etl/runtime/pipeline.ts",
    "lib/etl/runtime/context.ts",
    "lib/bi/bi.data-source.ts",
    "components/upload/v1/upload-page-v1-dashboard.tsx",
  ];
  return runtimeFiles.some((file) => {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    return /localStorage\.setItem|indexedDB\.open|objectStore\(|IDBObjectStore|\.transaction\(/.test(source);
  });
};

const changedFiles = () =>
  execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, ""));

const forbiddenChanged = (file: string) =>
  file === "package.json" ||
  file === "package-lock.json" ||
  file === "vercel.json" ||
  file.startsWith(".vercel/") ||
  file.startsWith("lib/storage/") ||
  file.startsWith("lib/tmall/") ||
  file.startsWith("lib/v05/");

const countRecords = (dataset: BIDataSet) =>
  dataset.products.length +
  dataset.productMetrics.length +
  dataset.planMetrics.length +
  dataset.searchTotalKeywords.length +
  dataset.searchProductKeywords.length +
  dataset.afterSalesMetrics.length;

const main = async () => {
  clearRuntimeBIDataSet();

  const productDimensionFile = textFile([
    { "商品ID": "P1", "商品名称": "空气堡 P1" },
    { "商品ID": "P2", "商品名称": "空气堡 P2" },
  ]);
  const productMetricFile = workbookFile({
    "商品经营": [
      { "商品ID": "P1", "商品名称": "空气堡 P1", "日期": "2026-06-24", GMV: 100, GSV: 90, "访客": 10, "支付买家": 2 },
      { "商品ID": "P1", "商品名称": "空气堡 P1", "日期": "2026-06-24", GMV: 999, GSV: 999, "访客": 999, "支付买家": 999 },
      { "商品ID": "P2", "商品名称": "空气堡 P2", "日期": "2026-06-25", GMV: "bad-number", GSV: 40, "访客": 8, "支付买家": 1 },
    ],
    EmptySheet: [],
  });
  const planMetricFile = textFile([
    { "商品ID": "P1", "日期": "2026-06-24", "推广花费": 10, "点击": 5, ROI: 2.5 },
    { "商品ID": "P1", "日期": "2026-06-24", "推广花费": 999, "点击": 999, ROI: 99 },
  ]);
  const searchTotalFile = textFile([
    { "搜索词": "空气净化器", "访客": 30, "支付买家": 3, GMV: 300 },
  ]);
  const searchProductFile = textFile([
    { "商品ID": "P1", "搜索词": "空气堡", "访客": 12, "支付买家": 1 },
  ]);
  const unknownFile = textFile([{ "未知字段": "x" }]);

  const parsed = await parseExcelWorkbook(productMetricFile);
  assertCheck("multiSheetExcelParsed", parsed.length === 2 && parsed[0]?.rows.length === 3, {
    sheets: parsed.map((sheet) => ({ sheetName: sheet.sheetName, rows: sheet.rows.length })),
  });

  assertCheck("detectProductDimension", detectFileType(await parseExcelWorkbook(productDimensionFile)) === "product_dimension");
  assertCheck("detectProductMetric", detectFileType(parsed) === "product_metric");
  assertCheck("detectPlanMetric", detectFileType(await parseExcelWorkbook(planMetricFile)) === "plan_metric");
  assertCheck("detectSearchTotal", detectFileType(await parseExcelWorkbook(searchTotalFile)) === "search_total");
  assertCheck("detectSearchProduct", detectFileType(await parseExcelWorkbook(searchProductFile)) === "search_product");
  assertCheck("detectUnknown", detectFileType(await parseExcelWorkbook(unknownFile)) === "unknown");

  const runtimeResult = await runETLRuntime([
    productDimensionFile,
    productMetricFile,
    planMetricFile,
    searchTotalFile,
    searchProductFile,
    unknownFile,
  ]);

  assertCheck("runtimeReturnsBIDataSet", countRecords(runtimeResult.dataset) > 0, runtimeResult.summary);
  assertCheck("unknownFileEntersErrorQueue", runtimeResult.errorQueue.some((issue) => issue.code === "etl_file_type_unknown"));
  assertCheck("emptySheetSkippedWithWarning", runtimeResult.issues.some((issue) => issue.code === "etl_empty_sheet_skipped"));
  assertCheck("productMetricDedupKeepsSingleProductDate", runtimeResult.dataset.productMetrics.length === 2, runtimeResult.dataset.productMetrics);
  assertCheck("planMetricDedupKeepsSingleProductDate", runtimeResult.dataset.planMetrics.length === 1, runtimeResult.dataset.planMetrics);
  assertCheck("duplicateGmvNotAccumulated", runtimeResult.dataset.productMetrics[0]?.gmv === 100, runtimeResult.dataset.productMetrics[0]);
  assertCheck("invalidNumberFilteredToNull", runtimeResult.dataset.productMetrics.some((metric) => metric.productId === "P2" && metric.gmv === null));
  assertCheck("searchTotalStandardized", runtimeResult.dataset.searchTotalKeywords[0]?.keyword === "空气净化器");
  assertCheck("searchProductStandardized", runtimeResult.dataset.searchProductKeywords[0]?.productId === "P1");

  const cached = getRuntimeBIDataSet();
  assertCheck("runtimeDatasetStoredInMemory", !!cached && cached.productMetrics.length === 2);

  const homeSource = await loadHomeBIDataSource();
  assertCheck("biDataSourcePrefersRuntimeETL", homeSource.dataStatus.label === "ETL运行时数据", homeSource.dataStatus);
  assertCheck("biPointsReadableByHomeLayer", homeSource.points.some((point) => point.productId === "P1" && point.metrics.gmv === 100));

  const manualDedup = deduplicateBIDataSet({
    products: [],
    productMetrics: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-24",
        gmv: 1,
        gsv: null,
        visitors: null,
        buyers: null,
      },
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-24",
        gmv: 2,
        gsv: null,
        visitors: null,
        buyers: null,
      },
    ],
    planMetrics: [],
    searchTotalKeywords: [],
    searchProductKeywords: [],
    afterSalesMetrics: [],
  });
  assertCheck("dedupEngineUsesSetFirstRecordWins", manualDedup.removedCount === 1 && manualDedup.dataset.productMetrics[0]?.gmv === 1);

  const failedOnly = await runETLRuntime([unknownFile]);
  assertCheck("allFailedKeepsExistingRuntimeDataSet", countRecords(failedOnly.dataset) === countRecords(runtimeResult.dataset), failedOnly.summary);
  assertCheck("allFailedDoesNotClearExistingRuntimeDataSet", getRuntimeBIDataSet() !== null);

  clearRuntimeBIDataSet();
  const failedWithoutExisting = await runETLRuntime([unknownFile]);
  assertCheck("allFailedWithoutExistingRuntimeReturnsEmptyDataSet", countRecords(failedWithoutExisting.dataset) === 0, failedWithoutExisting.summary);
  assertCheck("allFailedWithoutExistingRuntimeKeepsRuntimeNull", getRuntimeBIDataSet() === null);

  const uploadSource = readFileSync(path.join(repoRoot, "components/upload/v1/upload-page-v1-dashboard.tsx"), "utf8");
  const dataSourceSource = readFileSync(path.join(repoRoot, "lib/bi/bi.data-source.ts"), "utf8");
  assertCheck("uploadButtonCallsRunETLRuntime", uploadSource.includes("runETLRuntime("));
  assertCheck("biDataSourceUsesRuntimeDataset", dataSourceSource.includes("getRuntimeBIDataSet"));
  assertCheck("noForbiddenRuntimeWrites", !hasForbiddenRuntimeWrites());

  const currentChangedFiles = changedFiles();
  assertCheck("noForbiddenFilesChanged", currentChangedFiles.every((file) => !forbiddenChanged(file)), currentChangedFiles.filter(forbiddenChanged));

  const failed = checks.filter((check) => !check.pass);
  const status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ status, checks }, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  addCheck("unhandledAuditError", false, error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ status: "FAIL", checks }, null, 2));
  process.exit(1);
});
