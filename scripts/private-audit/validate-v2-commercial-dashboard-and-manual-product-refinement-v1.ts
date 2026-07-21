import fs from "node:fs";
import path from "node:path";
import {
  aggregateV2HomeMonthlyTargetForRange,
  aggregateV2HomeNonAdditiveTargetForRange,
} from "../../lib/v2/home/v2-home-adapter";
import {
  V2_HOME_DISPLAY_METRIC_KEYS,
  V2_HOME_METRIC_KEYS,
} from "../../types/v2/home";

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");
const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

const home = read("components/saas-v2/home/v2-home-dashboard.tsx");
const grid = read("components/saas-v2/home/v2-home-metric-grid.tsx");
const toolbar = read("components/saas-v2/home/v2-home-toolbar.tsx");
const series = read("components/saas-v2/series/v2-series-board-dashboard.tsx");
const seriesManager = read("components/saas-v2/series/v2-brand-series-manager.tsx");
const store = read("components/saas-v2/store/v2-store-board-dashboard.tsx");
const product = read("components/saas-v2/product/v2-product-board-dashboard.tsx");
const productManager = read("components/saas-v2/product/v2-brand-product-manager.tsx");
const productStorage = read("lib/v2/workspace/brand-products.ts");
const targetCenter = read("components/saas-v2/targets/v2-brand-target-center.tsx");
const adapter = read("lib/v2/home/v2-home-adapter.ts");

check(
  "displayContractKeepsTruthButHidesUnsupportedCard",
  V2_HOME_METRIC_KEYS.length === 17 &&
    V2_HOME_DISPLAY_METRIC_KEYS.length === 16 &&
    !(V2_HOME_DISPLAY_METRIC_KEYS as readonly string[]).includes("brandKeywordPaidShare"),
  { contract: V2_HOME_METRIC_KEYS.length, display: V2_HOME_DISPLAY_METRIC_KEYS.length },
);
check(
  "homeSeriesSelectionLivesInMetricSettings",
  !toolbar.includes("v2-home-series-filter") &&
    grid.includes("首页系列") &&
    grid.includes("MAX_HOME_SERIES") &&
    home.includes("v2-home-selected-series"),
);
check(
  "balancedCommercialMetricGrid",
  grid.includes("min-[920px]:grid-cols-4") && !grid.includes("grid-cols-5") && !grid.includes("grid-cols-6"),
);
check(
  "targetPresentationSeparatesUnsupportedAndMissing",
  grid.includes("分析指标 · 暂不设置目标") &&
    grid.includes("待补基础目标") &&
    grid.includes("未设置目标"),
);
check(
  "seriesCenterOwnsSeriesSelector",
  seriesManager.includes("当前") &&
    seriesManager.includes("<select") &&
    !seriesManager.includes("驾驶舱可筛选") &&
    series.includes("targetScope: \"series\""),
);
check(
  "storeUsesFullSharedMetricSurface",
  store.includes("V2HomeMetricGrid") &&
    store.includes("V2HomeChart") &&
    store.includes("targetScope: \"platform\"") &&
    !store.includes("MetricGridV2") &&
    !store.includes("V2SimpleTrendChart"),
);
check(
  "productIsManualOnlyAndUsesSharedMetricSurface",
  product.includes("V2BrandProductManager") &&
    product.includes("V2HomeMetricGrid") &&
    product.includes("targetScope: \"product\"") &&
    productManager.includes("手动粘贴商品 ID") &&
    productManager.includes("上传后自动裁成 1:1") &&
    productManager.includes("商品列表") &&
    !product.includes("trackedOptions"),
);
check(
  "manualProductsAreBrandScopedAndSanitized",
  productStorage.includes("airburg:v2:brand-products:v1") &&
    productStorage.includes("imageDataUrl") &&
    productStorage.includes("700_000") &&
    productStorage.includes("BRAND_PRODUCTS_EVENT"),
);
check(
  "targetCenterFollowsLatestOperatingMonth",
  targetCenter.includes("latestOperatingMonth") &&
    targetCenter.includes("经营数据最新月份") &&
    targetCenter.includes("monthTouched") &&
    targetCenter.includes("loadBrandProducts"),
);
check(
  "adapterUsesExplicitTargetScopes",
  adapter.includes('targetScope === "platform"') &&
    adapter.includes('targetScope === "series"') &&
    adapter.includes('targetScope === "product"') &&
    adapter.includes("sourceForSelectedProduct") &&
    adapter.includes("selectedSeriesCards"),
);

const juneRange = { mode: "month" as const, startDate: "2026-06-01", endDate: "2026-06-30" };
const partialJune = { mode: "custom" as const, startDate: "2026-06-26", endDate: "2026-06-30" };
const juneTarget = aggregateV2HomeMonthlyTargetForRange([{ month: "2026-06", targetValue: 300_000 }], juneRange);
const julyOnly = aggregateV2HomeMonthlyTargetForRange([{ month: "2026-07", targetValue: 300_000 }], juneRange);
const partialRate = aggregateV2HomeNonAdditiveTargetForRange([{ month: "2026-06", targetValue: 0.92 }], partialJune);
check("matchingMonthTargetApplies", juneTarget === 300_000, juneTarget);
check("futureMonthTargetDoesNotApplyToPastActuals", julyOnly === null, julyOnly);
check("nonAdditiveTargetIsNotDayProrated", Math.abs((partialRate ?? 0) - 0.92) < 0.000001, partialRate);

const failed = checks.filter((item) => !item.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  validator: "validate-v2-commercial-dashboard-and-manual-product-refinement-v1",
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
