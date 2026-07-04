import fs from "node:fs";
import path from "node:path";
import {
  TARGET_METRIC_DEFINITIONS,
  createBoardTargetKpiDefinitions,
  deriveTargetMetricValue,
} from "../../lib/bi/target-metric-definitions";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const REQUIRED_INPUT = ["gmv", "gsv", "adRoi", "conversionRate", "refundRate", "averageOrderValue", "directTransactionShare"].sort();
const DERIVED_DISPLAY = ["adSpend", "geoSearchShare", "adSpendRateAfterRefund"].sort();
const UNSUPPORTED_TARGET_INPUT = ["mtdTurnover", "regionalFulfillmentRate", "shippedRefundRate", "signedRefundRate", "cpc"].sort();
const ANALYSIS_ONLY_UNSUPPORTED = ["brandVisitors", "brandPaidBuyers"].sort();
const ALL_UNSUPPORTED = [...UNSUPPORTED_TARGET_INPUT, ...ANALYSIS_ONLY_UNSUPPORTED].sort();

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const sameList = (left: string[], right: string[]): boolean =>
  left.slice().sort().join("|") === right.slice().sort().join("|");

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const sourceHas = (source: string, snippets: string[]): boolean =>
  snippets.every((snippet) => source.includes(snippet));

const run = () => {
  const required = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "required").map((definition) => definition.metricKey);
  const derived = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "derived").map((definition) => definition.metricKey);
  const unsupported = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "unsupported").map((definition) => definition.metricKey);

  addCheck("requiredTargetsExactlySevenInputs", sameList(required, REQUIRED_INPUT), { required });
  addCheck("requiredTargetsShowInInputOnly", TARGET_METRIC_DEFINITIONS.every((definition) => definition.showInTargetInput === (definition.targetRule === "required")));
  addCheck("derivedTargetsDisplayOnly", sameList(derived, DERIVED_DISPLAY), { derived });
  addCheck("unsupportedDefinitionsIncludeTargetAndAnalysisOnly", sameList(unsupported, ALL_UNSUPPORTED), { unsupported });
  addCheck("roiUnitStillTimes", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "adRoi")?.unit === "倍");
  addCheck("adSpendNotInput", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "adSpend")?.showInTargetInput === false);
  addCheck("geoSearchShareNotInput", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "geoSearchShare")?.showInTargetInput === false);
  addCheck("directTransactionShareIsInput", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "directTransactionShare")?.showInTargetInput === true);
  addCheck("averageOrderValueIsInput", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "averageOrderValue")?.showInTargetInput === true);

  const values = {
    gmv: 100000,
    gsv: 80000,
    adRoi: 4,
    refundRate: 0.1,
    conversionRate: 0.02,
    averageOrderValue: 200,
    directTransactionShare: 0.6,
  };
  const adSpend = deriveTargetMetricValue("adSpend", values);
  const refundFeeRatio = deriveTargetMetricValue("adSpendRateAfterRefund", values);
  const geoSearchShare = deriveTargetMetricValue("geoSearchShare", values);
  addCheck("adSpendDerivedFromGsvAndRoi", adSpend.value === 20000, adSpend);
  addCheck("refundFeeRatioDerivedFromGsvRoiRefundRate", Math.abs((refundFeeRatio.value ?? 0) - (20000 / 72000)) < 0.000001, refundFeeRatio);
  addCheck("geoSearchShareNeedsBrandPaidBuyers", geoSearchShare.value === null && geoSearchShare.missingDependencies.includes("品牌词支付人数"), geoSearchShare);

  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const targetPersistence = read("lib/persistence/target-drafts-persistence.ts");
  const runtimeContext = read("lib/etl/runtime/context.ts");

  addCheck("homeTargetPopoverUsesRequiredRegistry", sourceHas(home, ["getRequiredTargetMetricDefinitionsForScope(\"platform\")", "需要填写的目标"]));
  addCheck("seriesTargetPopoverUsesRequiredRegistry", sourceHas(series, ["SERIES_TARGET_FIELDS = SERIES_KPIS.filter((definition) => definition.showInTargetInput)", "需要填写的目标"]));
  addCheck("productTargetPopoverUsesRequiredRegistry", sourceHas(product, ["PRODUCT_TARGET_FIELDS = PRODUCT_KPIS.filter((definition) => definition.showInTargetInput)", "需要填写的目标"]));
  addCheck("homeUnsupportedTargetsCollapsed", sourceHas(home, ["TARGET_UNSUPPORTED_INPUT_KEYS", "已隐藏的目标", "不写入目标草稿"]));
  addCheck("seriesUnsupportedTargetsCollapsed", sourceHas(series, ["TARGET_UNSUPPORTED_INPUT_KEYS", "已隐藏的目标", "不写入目标草稿"]));
  addCheck("productUnsupportedTargetsCollapsed", sourceHas(product, ["TARGET_UNSUPPORTED_INPUT_KEYS", "已隐藏的目标", "不写入目标草稿"]));

  const seriesKpis = createBoardTargetKpiDefinitions("series");
  const productKpis = createBoardTargetKpiDefinitions("product");
  addCheck("seriesTargetInputCountSeven", seriesKpis.filter((definition) => definition.showInTargetInput).length === REQUIRED_INPUT.length);
  addCheck("productTargetInputCountSeven", productKpis.filter((definition) => definition.showInTargetInput).length === REQUIRED_INPUT.length);
  addCheck("targetPersistenceSchemaStillDraftOnly", sourceHas(targetPersistence, ["TargetDraftRecord", "targetValue", "metricKey"]) && !/runtime dataset/i.test(targetPersistence));
  addCheck("runtimeDatasetHasNoTargetsField", !/targets\\??:|targets:/.test(runtimeContext));
  addCheck("noUiLiteralNaNInfinityUndefined", !/NaN|Infinity|undefined/.test(`${home}\n${series}\n${product}`.replace(/Number\.isNaN/g, "safe-nan-guard").replace(/typeof window === "undefined"/g, "browser-guard")));
};

let status: Status = "PASS";
try {
  run();
  if (checks.some((check) => !check.pass)) status = "FAIL";
} catch (error) {
  status = "FAIL";
  addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
}

console.log(JSON.stringify({
  status,
  taskId: "TARGET_UI_REPRESENTATION_REFACTOR_V1",
  requiredTargets: REQUIRED_INPUT,
  derivedTargets: DERIVED_DISPLAY,
  unsupportedTargetInputs: UNSUPPORTED_TARGET_INPUT,
  checks,
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);
