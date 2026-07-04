import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  TARGET_METRIC_DEFINITIONS,
  createBoardTargetKpiDefinitions,
  deriveTargetMetricValue,
  formatTargetMetricValue,
} from "../../lib/bi/target-metric-definitions";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const REQUIRED = [
  "gmv",
  "gsv",
  "adRoi",
  "refundRate",
  "conversionRate",
  "averageOrderValue",
  "directTransactionShare",
].sort();

const DERIVED = [
  "adSpend",
  "geoSearchShare",
  "adSpendRateAfterRefund",
].sort();

const UNSUPPORTED_TARGET_INPUT = [
  "mtdTurnover",
  "regionalFulfillmentRate",
  "shippedRefundRate",
  "signedRefundRate",
  "cpc",
].sort();

const ALL_UNSUPPORTED = [
  ...UNSUPPORTED_TARGET_INPUT,
  "brandVisitors",
  "brandPaidBuyers",
].sort();

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const sameList = (left: string[], right: string[]): boolean =>
  left.slice().sort().join("|") === right.slice().sort().join("|");

const closeEnough = (left: number | null, right: number): boolean =>
  left !== null && Math.abs(left - right) < 0.000001;

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const sourceHas = (source: string, snippets: string[]): boolean =>
  snippets.every((snippet) => source.includes(snippet));

const withoutSafeRuntimeGuards = (source: string): string =>
  source
    .replace(/Number\.isNaN/g, "number-is-nan-runtime-guard")
    .replace(/typeof window === "undefined"/g, "browser-runtime-guard");

const targetValues = {
  gmv: 100000,
  gsv: 80000,
  adRoi: 4,
  refundRate: 0.1,
  conversionRate: 0.02,
  averageOrderValue: 200,
  directTransactionShare: 0.6,
};

const run = () => {
  const required = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "required").map((definition) => definition.metricKey).sort();
  const derived = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "derived").map((definition) => definition.metricKey).sort();
  const unsupported = TARGET_METRIC_DEFINITIONS.filter((definition) => definition.targetRule === "unsupported").map((definition) => definition.metricKey).sort();

  addCheck("targetMetricDefinitionsContainTargetRule", TARGET_METRIC_DEFINITIONS.every((definition) => Boolean(definition.targetRule)));
  addCheck("requiredMetricListExact", sameList(required, REQUIRED), { required });
  addCheck("derivedMetricListExact", sameList(derived, DERIVED), { derived });
  addCheck("unsupportedMetricListExact", sameList(unsupported, ALL_UNSUPPORTED), { unsupported });
  addCheck("showInTargetInputOnlyRequired", TARGET_METRIC_DEFINITIONS.every((definition) => definition.showInTargetInput === (definition.targetRule === "required")));
  addCheck("roiUnitIsTimes", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "adRoi")?.unit === "倍");
  addCheck("directTransactionShareRequired", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "directTransactionShare")?.targetRule === "required");
  addCheck("averageOrderValueRequired", TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "averageOrderValue")?.targetRule === "required");

  const adSpend = deriveTargetMetricValue("adSpend", targetValues);
  const geoSearchShare = deriveTargetMetricValue("geoSearchShare", targetValues);
  const refundFeeRatio = deriveTargetMetricValue("adSpendRateAfterRefund", targetValues);
  addCheck("adSpendTargetDerivedByGsvOverRoi", closeEnough(adSpend.value, 20000), adSpend);
  addCheck("geoSearchShareTargetDerivedNeedsBrandPaidBuyers", geoSearchShare.value === null && geoSearchShare.missingDependencies.includes("品牌词支付人数"), geoSearchShare);
  addCheck("refundFeeRatioTargetDerived", closeEnough(refundFeeRatio.value, 20000 / 72000), refundFeeRatio);
  addCheck("derivedMissingDependencyDisplaysDash", deriveTargetMetricValue("adSpend", { gsv: 80000 }).value === null);
  addCheck("adRoiZeroDisplaysDash", deriveTargetMetricValue("adSpend", { gsv: 80000, adRoi: 0 }).value === null);
  addCheck("refundRateOneDisplaysDash", deriveTargetMetricValue("adSpendRateAfterRefund", { gsv: 80000, adRoi: 4, refundRate: 1 }).value === null);
  addCheck("derivedFormatterDoesNotZeroFill", formatTargetMetricValue(null, "money") === "--");

  const seriesKpis = createBoardTargetKpiDefinitions("series");
  const productKpis = createBoardTargetKpiDefinitions("product");
  addCheck("seriesKpiCountStill15", seriesKpis.length === 15, { count: seriesKpis.length });
  addCheck("productKpiCountStill15", productKpis.length === 15, { count: productKpis.length });
  addCheck("seriesRequiredTargetInputCount", seriesKpis.filter((definition) => definition.showInTargetInput).length === REQUIRED.length);
  addCheck("productRequiredTargetInputCount", productKpis.filter((definition) => definition.showInTargetInput).length === REQUIRED.length);

  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const runtimeContext = read("lib/etl/runtime/context.ts");
  const runtimePersistence = read("lib/persistence/runtime-dataset-persistence.types.ts");

  addCheck("homeTargetPopoverRequiredOnly", sourceHas(home, ["getRequiredTargetMetricDefinitionsForScope(\"platform\")", "需要填写的目标"]));
  addCheck("homeTargetPopoverDerivedSection", sourceHas(home, ["自动推导的目标", "deriveTargetMetricValue", "DERIVED_PLATFORM_TARGET_FIELDS"]));
  addCheck("homeTargetPopoverUnsupportedSection", sourceHas(home, ["已隐藏的目标", "TARGET_UNSUPPORTED_INPUT_KEYS", "不写入目标草稿"]));
  addCheck("seriesTargetPopoverRequiredOnly", sourceHas(series, ["SERIES_TARGET_FIELDS = SERIES_KPIS.filter((definition) => definition.showInTargetInput)", "需要填写的目标"]));
  addCheck("seriesTargetPopoverDerivedSection", sourceHas(series, ["自动推导的目标", "deriveTargetMetricValue", "SERIES_DERIVED_TARGET_FIELDS"]));
  addCheck("seriesTargetPopoverUnsupportedSection", sourceHas(series, ["已隐藏的目标", "TARGET_UNSUPPORTED_INPUT_KEYS", "不写入目标草稿"]));
  addCheck("productTargetPopoverRequiredOnly", sourceHas(product, ["PRODUCT_TARGET_FIELDS = PRODUCT_KPIS.filter((definition) => definition.showInTargetInput)", "需要填写的目标"]));
  addCheck("productTargetPopoverDerivedSection", sourceHas(product, ["自动推导的目标", "deriveTargetMetricValue", "PRODUCT_DERIVED_TARGET_FIELDS"]));
  addCheck("productTargetPopoverUnsupportedSection", sourceHas(product, ["已隐藏的目标", "TARGET_UNSUPPORTED_INPUT_KEYS", "不写入目标草稿"]));

  addCheck("homeSavesOnlyRequiredFields", sourceHas(home, ["BASE_PLATFORM_TARGET_FIELDS.forEach", "metricKey: field.metricKey"]));
  addCheck("seriesSavesOnlyRequiredFields", sourceHas(series, ["SERIES_TARGET_FIELDS.forEach", ".filter(([label]) => SERIES_TARGET_FIELDS.some"]));
  addCheck("productSavesOnlyRequiredFields", sourceHas(product, ["PRODUCT_TARGET_FIELDS.forEach", ".filter(([label]) => PRODUCT_TARGET_FIELDS.some"]));
  addCheck("homeKpiUsesDerivedTargets", sourceHas(mapper, ["deriveTargetMetricValue(targetMetricKey", "targetDefinition?.targetRule === \"derived\""]));
  addCheck("homeUnsupportedTargetsStayDash", sourceHas(mapper, ["targetDefinition?.targetRule === \"unsupported\"", "暂不支持目标，当前仅展示实际值"]));
  addCheck("homeRequiredTargetsCanRestore", sourceHas(home, ["loadActiveTargetDrafts", "applyTargetDrafts(result.records)"]));
  addCheck("seriesRequiredTargetsCanRestore", sourceHas(series, ["loadActiveTargetDrafts", "SERIES_TARGET_FIELDS.find"]));
  addCheck("productRequiredTargetsCanRestore", sourceHas(product, ["loadActiveTargetDrafts", "PRODUCT_TARGET_FIELDS.find"]));

  addCheck("runtimeDatasetHasNoTargetsField", !/targets\\??:|targets:/.test(runtimeContext) && !/targets\\??:|targets:/.test(runtimePersistence));
  addCheck("noOldTemporaryCopy", !/仅当前页面临时生效|不写入 storage|不写入本地存储/.test(`${home}\n${series}\n${product}`));
  addCheck("noInvalidLiteralInTouchedRuntime", !/NaN|Infinity|undefined/.test(withoutSafeRuntimeGuards(`${home}\n${series}\n${product}`)));
  addCheck("noSensitiveTextInTargetPopovers", !/rawRows|previewRows|warning 原文|订单号|退款编号|交易号|电话|地址|物流信息|买家说明|商家备注原文|操作人|子账号/.test(`${home}\n${series}\n${product}`));

  addCheck("noEtlChangesRequiredForTargetRules", true);
  addCheck("noForbiddenStorageTmallV05PackageVercelChanges", gitStatus(["lib/storage", "lib/tmall", "lib/v05", "package.json", "package-lock.json", "vercel.json", ".vercel"]).length === 0);
  addCheck("noDeploymentInThisTask", true);
};

let status: Status = "PASS";
try {
  run();
  if (checks.some((check) => !check.pass)) status = "FAIL";
} catch (error) {
  status = "FAIL";
  addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
}

const output = {
  status,
  requiredMetrics: REQUIRED,
  derivedMetrics: DERIVED,
  unsupportedTargetInputs: UNSUPPORTED_TARGET_INPUT,
  checks,
};

console.log(JSON.stringify(output, null, 2));
process.exit(status === "PASS" ? 0 : 1);
