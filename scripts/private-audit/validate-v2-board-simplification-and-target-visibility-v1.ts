import fs from "node:fs";
import path from "node:path";
import {
  aggregateV2HomeMonthlyTargetForRange,
  aggregateV2HomeNonAdditiveTargetForRange,
} from "../../lib/v2/home/v2-home-adapter";

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");
const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

const home = read("components/saas-v2/home/v2-home-dashboard.tsx");
const toolbar = read("components/saas-v2/home/v2-home-toolbar.tsx");
const series = read("components/saas-v2/series/v2-series-board-dashboard.tsx");
const manager = read("components/saas-v2/series/v2-brand-series-manager.tsx");
const store = read("components/saas-v2/store/v2-store-board-dashboard.tsx");
const product = read("components/saas-v2/product/v2-product-board-dashboard.tsx");
const pageHeader = read("components/saas-v2/layout/saas-v2-page-header.tsx");
const adapter = read("lib/v2/home/v2-home-adapter.ts");

check(
  "homeSeriesIntegratedIntoMetricScope",
  toolbar.includes('data-testid="v2-home-series-filter"') &&
    toolbar.includes("品牌整体") &&
    !home.includes("KeySeriesSection") &&
    !home.includes("重点系列"),
);
check(
  "seriesUsesExactHomeMetricAndChartSurfaces",
  series.includes("<V2HomeMetricGrid") &&
    series.includes("<V2HomeChart") &&
    series.includes("seriesOptionVisibility") &&
    !series.includes("ChartPanelV2") &&
    !series.includes("DataTableV2"),
);
check(
  "seriesLegacySectionsRemoved",
  ["当前系列概览", "系列商品贡献", "系列目标进度", "系列搜索表现", "数据状态与健康提示", "管理系列", "返回首页"].every((text) => !series.includes(text)),
);
check(
  "seriesManagerUsesPastedProductIds",
  manager.includes("<textarea") &&
    manager.includes("每行一个商品 ID") &&
    manager.includes("加载并绑定") &&
    manager.includes("系列列表") &&
    manager.includes("编辑") &&
    manager.includes("删除"),
);
check(
  "storeAndProductReducedToDecisionSurfaces",
  [store, product].every((source) =>
    source.includes("V2SimpleTrendChart") &&
    source.includes("MetricGridV2") &&
    !source.includes("DataTableV2") &&
    !source.includes("ChartPanelV2"),
  ),
);
check(
  "boardPageHeadersRemoved",
  pageHeader.includes('["/v2/home", "/v2/series-board", "/v2/store-board", "/v2/product-board"]'),
);
check(
  "seriesScopeDoesNotFabricateSearchMetrics",
  adapter.includes("当前搜索数据没有稳定的商品到系列归因") &&
    adapter.includes('contract.metricKey === "brandVisitors"') &&
    adapter.includes('contract.metricKey === "brandPaidBuyers"'),
);

const crossMonthRange = { mode: "custom" as const, startDate: "2026-06-29", endDate: "2026-07-05" };
const juneOnly = aggregateV2HomeMonthlyTargetForRange([
  { month: "2026-06", targetValue: 30_000 },
], crossMonthRange);
const twoMonths = aggregateV2HomeMonthlyTargetForRange([
  { month: "2026-06", targetValue: 30_000 },
  { month: "2026-07", targetValue: 31_000 },
], crossMonthRange);
const fullJune = aggregateV2HomeMonthlyTargetForRange([
  { month: "2026-06", targetValue: 30_000 },
], { mode: "month", startDate: "2026-06-01", endDate: "2026-06-30" });
const noTarget = aggregateV2HomeMonthlyTargetForRange([], crossMonthRange);
const partialJuneRate = aggregateV2HomeNonAdditiveTargetForRange([
  { month: "2026-06", targetValue: 0.92 },
], { mode: "custom", startDate: "2026-06-26", endDate: "2026-06-30" });
const incompleteCrossMonthRate = aggregateV2HomeNonAdditiveTargetForRange([
  { month: "2026-06", targetValue: 0.92 },
], crossMonthRange);
const completeCrossMonthRate = aggregateV2HomeNonAdditiveTargetForRange([
  { month: "2026-06", targetValue: 0.92 },
  { month: "2026-07", targetValue: 0.9 },
], crossMonthRange);

check("crossMonthJuneOverlapIsTwoDays", Math.abs((juneOnly ?? 0) - 2_000) < 0.0001, juneOnly);
check("crossMonthTwoTargetMonthsAggregateByOverlap", Math.abs((twoMonths ?? 0) - 7_000) < 0.0001, twoMonths);
check("fullMonthTargetPreserved", Math.abs((fullJune ?? 0) - 30_000) < 0.0001, fullJune);
check("missingTargetsRemainUnknown", noTarget === null, noTarget);
check("partialMonthRateTargetIsNotProrated", Math.abs((partialJuneRate ?? 0) - 0.92) < 0.000001, partialJuneRate);
check("crossMonthRateRequiresEveryMonth", incompleteCrossMonthRate === null, incompleteCrossMonthRate);
check(
  "crossMonthRateUsesDayWeightedAverage",
  Math.abs((completeCrossMonthRate ?? 0) - ((0.92 * 2 + 0.9 * 5) / 7)) < 0.000001,
  completeCrossMonthRate,
);

const failed = checks.filter((item) => !item.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  validator: "validate-v2-board-simplification-and-target-visibility-v1",
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
