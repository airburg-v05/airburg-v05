import { File as NodeFile } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { parseExcelWorkbook } from "../../lib/etl/parse-excel";
import {
  clearRuntimeBIDataSet,
  createEmptyBIDataSet,
  detectFileType,
  runETLRuntime,
  setRuntimeBIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(ROOT, "scripts/private-audit/fixtures/tmall-plan-level-ad-plan-sanitized.csv");
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(name);
};

const sumMetric = (source: Awaited<ReturnType<typeof loadHomeBIDataSource>>, metricKey: string): number =>
  Math.round(
    source.points.reduce((sum, point) => sum + (typeof point.metrics[metricKey] === "number" ? (point.metrics[metricKey] as number) : 0), 0) *
      100,
  ) / 100;

const main = async () => {
  addCheck("fixtureExists", fs.existsSync(FIXTURE_PATH), { fixturePath: FIXTURE_PATH });

  const buffer = fs.readFileSync(FIXTURE_PATH);
  const file = new NodeFile([new Uint8Array(buffer)], path.basename(FIXTURE_PATH), {
    type: "text/csv",
  }) as unknown as File;

  const sheets = await parseExcelWorkbook(file);
  addCheck("fixtureDetectedAsPlanMetric", detectFileType(sheets) === "plan_metric");

  const descriptors: UploadedFileDescriptor[] = [{
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }];

  const runtime = await runETLRuntime(descriptors);
  const issueCodes = Array.from(new Set([...runtime.issues, ...runtime.errorQueue].map((issue) => issue.code))).sort();
  const planRows = runtime.dataset.planMetrics;
  const planLevelRows = planRows.filter((row) => !row.productId && !!row.planId);
  const spendTotal = planRows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
  const totalTransactionAmount = planRows.reduce((sum, row) => sum + (row.totalTransactionAmount ?? 0), 0);

  addCheck("runtimeHasNoUnsupportedPlanSummaryIssue", !issueCodes.includes("etl_plan_summary_without_product_id_unsupported"), { issueCodes });
  addCheck("runtimeParsedThreeDedupedPlanRows", planRows.length === 3, { planMetricCount: planRows.length });
  addCheck("allRowsRemainPlanLevel", planLevelRows.length === 3, {
    planLevelRows: planLevelRows.length,
    productIds: planRows.map((row) => row.productId),
  });
  addCheck("sameDaySamePlanDuplicateDoesNotDoubleCount", planRows.filter((row) => row.date === "2026-06-30" && row.planId === "PLAN-A").length === 1, {
    planKeys: planRows.map((row) => `${row.date}:${row.planId}`),
  });
  addCheck("planIdDedupPreservesDistinctPlans", new Set(planRows.map((row) => `${row.date}:${row.planId}`)).size === 3, {
    planKeys: planRows.map((row) => `${row.date}:${row.planId}`),
  });
  addCheck("aggregatesMatchFixture", spendTotal === 110 && totalTransactionAmount === 290, {
    spendTotal,
    totalTransactionAmount,
  });

  const mixedGranularity = createEmptyBIDataSet();
  mixedGranularity.products.push({
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
    productId: "PRODUCT-1",
    name: "Product 1",
    brandWord: null,
    modelWord: null,
  });
  mixedGranularity.planMetrics.push(
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: "PRODUCT-1",
      planId: "PLAN-X",
      planName: "计划 X",
      date: "2026-06-30",
      spend: 100,
      roi: 2,
      clicks: 10,
      directTransactionAmount: 50,
      indirectTransactionAmount: 150,
      totalTransactionAmount: 200,
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      productId: null,
      planId: "PLAN-X",
      planName: "计划 X",
      date: "2026-06-30",
      spend: 100,
      roi: 2,
      clicks: 10,
      directTransactionAmount: 50,
      indirectTransactionAmount: 150,
      totalTransactionAmount: 200,
    },
  );
  setRuntimeBIDataSet(mixedGranularity, []);
  const mixedSource = await loadHomeBIDataSource();
  addCheck("mixedGranularityDoesNotDoubleCountAdSpend", sumMetric(mixedSource, "adSpend") === 100, {
    adSpend: sumMetric(mixedSource, "adSpend"),
    pointCount: mixedSource.points.length,
  });
  addCheck("mixedGranularityDoesNotDoubleCountClicks", sumMetric(mixedSource, "adClicks") === 10, {
    adClicks: sumMetric(mixedSource, "adClicks"),
  });
  addCheck("mixedGranularityPreservesProductLevelRevenueSemantics", sumMetric(mixedSource, "adRevenue") === 200, {
    adRevenue: sumMetric(mixedSource, "adRevenue"),
  });

  const planOnlyFallback = createEmptyBIDataSet();
  planOnlyFallback.planMetrics.push({
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
    productId: null,
    planId: "PLAN-Y",
    planName: "计划 Y",
    date: "2026-06-30",
    spend: 90,
    roi: 3,
    clicks: 9,
    directTransactionAmount: 40,
    indirectTransactionAmount: 230,
    totalTransactionAmount: 270,
  });
  setRuntimeBIDataSet(planOnlyFallback, []);
  const fallbackSource = await loadHomeBIDataSource();
  addCheck("planOnlyFallbackStillFeedsAdSpendWhenProductLevelMissing", sumMetric(fallbackSource, "adSpend") === 90, {
    adSpend: sumMetric(fallbackSource, "adSpend"),
  });
  addCheck("planOnlyFallbackStillFeedsAdRevenueWhenProductLevelMissing", sumMetric(fallbackSource, "adRevenue") === 270, {
    adRevenue: sumMetric(fallbackSource, "adRevenue"),
  });

  console.log(JSON.stringify({
    status: "PASS",
    validator: "validate-tmall-plan-level-ad-plan-regression-v1",
    checks,
    issueCodes,
    summary: runtime.summary,
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    validator: "validate-tmall-plan-level-ad-plan-regression-v1",
    checks,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}).finally(() => {
  clearRuntimeBIDataSet();
});
