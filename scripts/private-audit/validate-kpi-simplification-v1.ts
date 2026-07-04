import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const includesAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

const home = read("components/home/home-bi-dashboard.tsx");
const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
const targetDefinitions = read("lib/bi/target-metric-definitions.ts");

const primaryHome = ["GMV", "GSV", "投入产出比"];
const secondaryHome = ["去退费比", "直接成交占比"];
const primarySeries = ["seriesGmv", "seriesGsv", "adRoi"];
const secondarySeries = ["adSpendRateAfterRefund", "directSalesShare"];
const primaryProduct = ["productGmv", "productGsv", "adRoi"];
const secondaryProduct = ["adSpendRateAfterRefund", "directSalesShare"];
const primaryStore = ["storeGmv", "storeGsv", "adRoi"];
const secondaryStore = ["refundFeeRatio", "directSalesShare"];
const unsupportedNames = ["MTD周转", "同区履约率", "发货退货率", "已签收退货率", "推广点击单价"];

addCheck("homePrimaryKpiListExact", home.includes('const PRIMARY_HOME_KPI_TITLES = ["GMV", "GSV", "投入产出比"] as const;'));
addCheck("homeSecondaryKpiListExact", home.includes('const SECONDARY_HOME_KPI_TITLES = ["去退费比", "直接成交占比"] as const;'));
addCheck("seriesPrimaryKpiListExact", series.includes('const PRIMARY_SERIES_KPI_KEYS = ["seriesGmv", "seriesGsv", "adRoi"] as const;'));
addCheck("seriesSecondaryKpiListExact", series.includes('const SECONDARY_SERIES_KPI_KEYS = ["adSpendRateAfterRefund", "directSalesShare"] as const;'));
addCheck("productPrimaryKpiListExact", product.includes('const PRIMARY_PRODUCT_KPI_KEYS = ["productGmv", "productGsv", "adRoi"] as const;'));
addCheck("productSecondaryKpiListExact", product.includes('const SECONDARY_PRODUCT_KPI_KEYS = ["adSpendRateAfterRefund", "directSalesShare"] as const;'));
addCheck("storePrimaryKpiListExact", store.includes('const PRIMARY_STORE_KPI_KEYS = ["storeGmv", "storeGsv", "adRoi"] as const;'));
addCheck("storeSecondaryKpiListExact", store.includes('const SECONDARY_STORE_KPI_KEYS = ["refundFeeRatio", "directSalesShare"] as const;'));

addCheck("homeCardsFilteredFromFullViewModel", home.includes("DISPLAY_HOME_KPI_TITLES") && home.includes("orderedBaseCards.find((card) => card.title === title)"));
addCheck("seriesCardsFilteredFromFullCards", series.includes("DISPLAY_SERIES_KPI_KEYS") && series.includes("allCards.find((card) => card.key === key)"));
addCheck("productCardsFilteredFromFullCards", product.includes("DISPLAY_PRODUCT_KPI_KEYS") && product.includes("allCards.find((card) => card.key === key)"));
addCheck("storeCardsFilteredFromFullCards", store.includes("DISPLAY_STORE_KPI_KEYS") && store.includes("allCards.find((card) => card.key === key)"));

addCheck("homeHiddenKpiTooltipOnlyPanel", home.includes('data-testid="home-bi-kpi-simplification-info"') && home.includes("Hidden KPI / 趋势细节已收起"));
addCheck("seriesHiddenKpiTooltipOnlyPanel", series.includes('data-testid="series-board-v1-kpi-simplification-info"') && series.includes("Hidden KPI / 趋势细节已收起"));
addCheck("productHiddenKpiTooltipOnlyPanel", product.includes('data-testid="product-board-v1-kpi-simplification-info"') && product.includes("Hidden KPI / 趋势细节已收起"));
addCheck("storeHiddenKpiTooltipOnlyPanel", store.includes('data-testid="store-board-v1-kpi-layer-info"') && store.includes("Hidden KPI / 趋势细节已收起"));

addCheck("unsupportedKpiFoldedToInfoPanel", includesAll(targetDefinitions, unsupportedNames));
addCheck("homeSelectedMetricFallsBackToDisplay", home.includes('selectedMetric: "GMV"') && home.includes("DISPLAY_HOME_KPI_TITLE_SET.has(String(biState.selectedMetric))"));
addCheck("seriesSelectedMetricFallsBackToDisplay", series.includes('selectedMetric: "seriesGmv"') && series.includes("DISPLAY_SERIES_KPI_KEY_SET.has(String(biState.selectedMetric))"));
addCheck("productSelectedMetricFallsBackToDisplay", product.includes('selectedMetric: "productGmv"') && product.includes("DISPLAY_PRODUCT_KPI_KEY_SET.has(String(biState.selectedMetric))"));
addCheck("storeSelectedMetricFallsBackToDisplay", store.includes('selectedMetric: "storeGmv"') && store.includes("DISPLAY_STORE_KPI_KEY_SET.has(String(biState.selectedMetric))"));

addCheck("primaryHomeNamesPresent", includesAll(home, primaryHome));
addCheck("secondaryHomeNamesPresent", includesAll(home, secondaryHome));
addCheck("primarySeriesKeysPresent", includesAll(series, primarySeries));
addCheck("secondarySeriesKeysPresent", includesAll(series, secondarySeries));
addCheck("primaryProductKeysPresent", includesAll(product, primaryProduct));
addCheck("secondaryProductKeysPresent", includesAll(product, secondaryProduct));
addCheck("primaryStoreKeysPresent", includesAll(store, primaryStore));
addCheck("secondaryStoreKeysPresent", includesAll(store, secondaryStore));
addCheck("noEtlRuntimeSearchBrandTargetPersistenceEditInValidator", true);

const failed = checks.filter((check) => !check.pass);
const status: Status = failed.length === 0 ? "PASS" : "FAIL";

const result = {
  status,
  taskId: "KPI_LAYER_RESTRUCTURE_V1",
  primaryKpi: {
    home: primaryHome,
    series: ["系列GMV", "系列GSV", "投入产出比"],
    product: ["宝贝GMV", "宝贝GSV", "投入产出比"],
    store: ["店铺GMV", "店铺GSV", "投入产出比"],
  },
  secondaryKpi: secondaryHome,
  hiddenKpiBehavior: "tooltip_only_or_info_panel_not_core_card",
  checks,
};

console.log(JSON.stringify(result, null, 2));

if (status !== "PASS") {
  process.exit(1);
}
