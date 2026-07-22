import fs from "node:fs";
import path from "node:path";
import { HOME_BI_KPI_DEFINITIONS } from "../../lib/bi/bi.home-mapper";
import { TARGET_METRIC_DEFINITIONS } from "../../lib/bi/target-metric-definitions";
import {
  V2_HOME_DISPLAY_METRIC_KEYS,
  V2_HOME_METRIC_KEYS,
} from "../../types/v2/home";

const root = process.cwd();
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), "utf8");
const readOptional = (relativePath: string): string => {
  const target = path.join(root, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
};
const contract = JSON.parse(read("docs/project/V2_HOME_DATA_CONTRACT.json")) as {
  metricCount: number;
  commercialDisplayMetricCount: number;
  metrics: Array<{ metricKey: string; availability: string; actualSource: string }>;
};
const checks: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, detail });

const seriesDashboard = read("components/saas-v2/series/v2-series-board-dashboard.tsx");
const lensSwitch = read("components/saas-v2/series/v2-series-analysis-lens.tsx");
const breakdown = readOptional("components/saas-v2/series/v2-series-store-breakdown.tsx");
const toolbar = read("components/saas-v2/home/v2-home-toolbar.tsx");
const home = read("components/saas-v2/home/v2-home-dashboard.tsx");
const adapter = read("lib/v2/home/v2-home-adapter.ts");
const task = read("docs/project/tasks/SAAS_V2_CROSS_PLATFORM_SERIES_LENSES_AND_GROWTH_DRIVERS_V1/TASK.md");
const decision = read("docs/project/tasks/SAAS_V2_CROSS_PLATFORM_SERIES_LENSES_AND_GROWTH_DRIVERS_V1/DIMENSION_AND_METRIC_DECISION.md");
const currentTask = JSON.parse(read("docs/project/current-task.json")) as {
  taskId: string;
  previousTask?: string;
  deploymentAuthorized: boolean;
  stableBaselineTag?: string;
};
const deploymentEvidence = JSON.parse(read("docs/project/tasks/SAAS_V2_CROSS_PLATFORM_SERIES_LENSES_AND_GROWTH_DRIVERS_V1/deployment-evidence.json")) as {
  taskId: string;
  implementationCommit: string;
  publicBrowserRegression: { checksPassed: number; checksFailed: number };
};

const contractKeys = contract.metrics.map((metric) => metric.metricKey);
const commercialKeys = V2_HOME_DISPLAY_METRIC_KEYS as readonly string[];
check(
  "truthAndDisplayCountsStayExplicit",
  V2_HOME_METRIC_KEYS.length === 19 &&
    contract.metricCount === 19 &&
    new Set(contractKeys).size === 19 &&
    commercialKeys.length === 16 &&
    contract.commercialDisplayMetricCount === 16,
  { truth: V2_HOME_METRIC_KEYS.length, contract: contract.metricCount, display: commercialKeys.length },
);
check(
  "realGrowthDriversReplaceUnavailableDisplaySlots",
  commercialKeys.includes("visitors") &&
    commercialKeys.includes("paidBuyers") &&
    !commercialKeys.includes("brandKeywordPaidShare") &&
    !commercialKeys.includes("mtdTurnover") &&
    !commercialKeys.includes("regionalFulfillmentRate"),
  commercialKeys,
);
check(
  "growthDriversUseBoundRuntimeFacts",
  HOME_BI_KPI_DEFINITIONS.some((definition) =>
    definition.title === "访客数" && definition.sourceMetric === "visitors",
  ) &&
    HOME_BI_KPI_DEFINITIONS.some((definition) =>
      definition.title === "支付买家数" && definition.sourceMetric === "paidBuyers",
    ) &&
    contract.metrics.find((metric) => metric.metricKey === "visitors")?.availability === "AVAILABLE" &&
    contract.metrics.find((metric) => metric.metricKey === "paidBuyers")?.availability === "AVAILABLE",
);
check(
  "growthDriverTargetsAreNotInvented",
  !TARGET_METRIC_DEFINITIONS.some((definition) =>
    definition.metricKey === "visitors" || definition.metricKey === "paidBuyers",
  ) &&
    contract.metrics.find((metric) => metric.metricKey === "visitors")?.actualSource.includes("metrics.visitors") === true &&
    contract.metrics.find((metric) => metric.metricKey === "paidBuyers")?.actualSource.includes("metrics.paidBuyers") === true,
);
check(
  "seriesCenterHasExplicitAnalysisLenses",
  seriesDashboard.includes("V2SeriesAnalysisLensSwitch") &&
    lensSwitch.includes('"brand"') &&
    lensSwitch.includes('"store"') &&
    lensSwitch.includes("品牌汇总") &&
    lensSwitch.includes("单店拆解"),
);
check(
  "brandLensLocksAllStoresAndSuppressesStoreTargets",
  seriesDashboard.includes('selectedPlatform: initialLens === "brand" ? null') &&
    seriesDashboard.includes('suppressTargets: initialLens === "brand"') &&
    seriesDashboard.includes('scopeLocked={analysisLens === "brand"}') &&
    seriesDashboard.includes("不自动合并单店目标") &&
    adapter.includes("options.suppressTargets"),
);
check(
  "storeLensRequiresSingleStore",
  seriesDashboard.includes('analysisLens !== "store"') &&
    seriesDashboard.includes('storeSelectionMode={analysisLens === "store" ? "single" : "multiple"}') &&
    toolbar.includes('storeSelectionMode === "single"') &&
    toolbar.includes('type={storeSelectionMode === "single" ? "radio" : "checkbox"}'),
);
check(
  "brandSeriesStoreContributionContractRemainsAvailable",
    seriesDashboard.includes("includeStoreBreakdown: true") &&
    adapter.includes("options.includeStoreBreakdown") &&
    adapter.includes("storeBreakdownForRange") &&
    (breakdown === "" || (breakdown.includes("GMV 贡献") && breakdown.includes("支付买家"))),
);
check(
  "legacyMetricPreferencesMigrateWithoutLosingGridBalance",
  home.includes('if (value === "mtdTurnover") return "visitors";') &&
    home.includes('if (value === "regionalFulfillmentRate") return "paidBuyers";'),
);
check(
  "productIdentityBoundaryRemainsExplicit",
  decision.includes("brandProductId") &&
    decision.includes("The UI must not merge listings by title, image or similar IDs."),
);
check(
  "historicalDeploymentLifecycleRecorded",
  (currentTask.taskId === deploymentEvidence.taskId || currentTask.previousTask === deploymentEvidence.taskId) &&
    deploymentEvidence.implementationCommit.length === 40 &&
    deploymentEvidence.publicBrowserRegression.checksPassed === 52 &&
    deploymentEvidence.publicBrowserRegression.checksFailed === 0 &&
    task.includes("After the owner's explicit A3 authorization"),
);

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  validator: "validate-v2-cross-platform-series-lenses-and-growth-drivers-v1",
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
