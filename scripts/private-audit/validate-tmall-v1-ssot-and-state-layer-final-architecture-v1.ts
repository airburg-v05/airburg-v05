import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  BI_VERSION,
  CURRENT_DATASET_HASH,
  CURRENT_PLATFORM,
  ETL_VERSION,
  KPI_SEMANTIC_LOCK,
  PLATFORM_ADAPTER_MODEL,
  SSOT_ARCHITECTURE_LOCK,
  SYSTEM_STATE_SCHEMA_VERSION,
  TARGET_OVERLAY_LOCK,
  TARGET_VERSION,
  UI_ARCH_VERSION,
  createDatasetHash,
  createSystemState,
  createSystemStateFromSources,
  restoreSystemState,
  serializeSystemState,
  stableStringify,
  validateSystemState,
  type TmallV1SystemState,
} from "../../lib/state/system-state";
import {
  TARGET_METRIC_DEFINITIONS,
  deriveTargetMetricValue,
  getDerivedTargetMetricDefinitionsForScope,
  getRequiredTargetMetricDefinitionsForScope,
  getUnsupportedTargetMetricDefinitionsForScope,
} from "../../lib/bi/target-metric-definitions";
import type { RuntimeDatasetSnapshot } from "../../lib/persistence/runtime-dataset-persistence.types";
import { RUNTIME_DATASET_SCHEMA_VERSION } from "../../lib/persistence/runtime-dataset-persistence.types";
import type { CrossPageDebugContextSnapshot } from "../../lib/persistence/debug-context-persistence";
import { DEBUG_CONTEXT_SCHEMA_VERSION } from "../../lib/persistence/debug-context-persistence";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const sameList = <T extends string>(left: readonly T[], right: readonly T[]): boolean =>
  left.slice().sort().join("|") === right.slice().sort().join("|");

const gitStatus = (paths: string[]): string =>
  execFileSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const sampleRuntimeSnapshot = (): RuntimeDatasetSnapshot => ({
  schemaVersion: RUNTIME_DATASET_SCHEMA_VERSION,
  activeDatasetId: "runtime-test-2026-06-26-2026-06-30",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  platformCode: "tmall",
  storeId: "tmall-default-store",
  dateRange: {
    startDate: "2026-06-26",
    endDate: "2026-06-30",
  },
  dataset: {
    products: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        name: "P1",
        brandWord: "空气堡",
        modelWord: "P1",
      },
    ],
    productMetrics: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-26",
        gmv: 34047,
        gsv: 26000,
        visitors: 1000,
        buyers: 20,
      },
    ],
    planMetrics: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-26",
        spend: 1000,
        clicks: 500,
        roi: 3.4,
        directTransactionAmount: 2000,
        indirectTransactionAmount: 1000,
        totalTransactionAmount: 3000,
      },
    ],
    searchTotalKeywords: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        date: "2026-06-26",
        keyword: "空气堡 P1",
        visitors: 100,
        buyers: 5,
        gmv: 2000,
      },
    ],
    searchProductKeywords: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-26",
        keyword: "空气堡 KJ60F-P1",
        visitors: 80,
        buyers: 4,
      },
    ],
    afterSalesMetrics: [
      {
        platformCode: "tmall",
        platformName: "天猫",
        storeId: "tmall-default-store",
        storeName: "天猫默认店铺",
        productId: "P1",
        date: "2026-06-26",
        refundAmount: 1200,
        refundCount: 2,
        shippedRefundAmount: 800,
        shippedRefundCount: 1,
        signedRefundAmount: 0,
        signedRefundCount: 0,
      },
    ],
  },
  safeIssues: [],
  importSummary: {
    filesParsed: 18,
    filesFailed: 0,
    dedupedRecords: 0,
    productMetricsCount: 1,
    planMetricsCount: 1,
    searchTotalKeywordsCount: 1,
    searchProductKeywordsCount: 1,
    afterSalesMetricsCount: 1,
  },
  sourceCoverage: {
    product_dimension: { present: true, rowCount: 1 },
    product_metric: { present: true, rowCount: 1 },
    plan_metric: { present: true, rowCount: 1 },
    search_total: { present: true, rowCount: 1 },
    search_product: { present: true, rowCount: 1 },
    after_sales: { present: true, rowCount: 1 },
  },
});

const sampleDebugContext = (): CrossPageDebugContextSnapshot => ({
  schemaVersion: DEBUG_CONTEXT_SCHEMA_VERSION,
  contextId: "active",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  selectedPlatform: "tmall",
  selectedStores: ["tmall-default-store"],
  timeRange: {
    mode: "custom",
    startDate: "2026-06-26",
    endDate: "2026-06-30",
  },
  brandModelFilter: {
    brandWords: ["空气堡"],
    modelWords: ["P1"],
    centerWordGroups: [
      {
        id: "p1",
        centerWord: "P1",
        aliases: ["P1", "KJ60F-P1", "KJ60P1"],
      },
    ],
  },
  centerWordGroups: [
    {
      id: "p1",
      centerWord: "P1",
      aliases: ["P1", "KJ60F-P1", "KJ60P1"],
    },
  ],
  selectedMetric: "gmv",
  chartMode: "mtd",
  pages: {
    home: {
      selectedMetric: "gmv",
      chartMode: "mtd",
    },
    series: {
      selectedMetric: "seriesGmv",
      chartMode: "mtd",
      currentSeriesName: "系列A",
      temporarySeriesProductIds: [
        {
          id: "series-a-p1",
          seriesId: "series-a",
          seriesName: "系列A",
          platformCode: "tmall",
          platformName: "天猫",
          storeId: "tmall-default-store",
          storeName: "天猫默认店铺",
          productId: "P1",
          remark: "",
          source: "temp",
        },
      ],
    },
    product: {
      selectedMetric: "productGmv",
      chartMode: "mtd",
      currentProductKey: "tracked-p1",
      temporaryTrackedProducts: [
        {
          id: "tracked-p1",
          platformCode: "tmall",
          platformName: "天猫",
          storeId: "tmall-default-store",
          storeName: "天猫默认店铺",
          productId: "P1",
          productName: "P1",
        },
      ],
    },
  },
});

const assertSystemStateShape = (state: TmallV1SystemState) => {
  addCheck("stateLayerContainsRequestedVersionFields", Boolean(state.ETL_VERSION && state.BI_VERSION && state.TARGET_VERSION && state.UI_ARCH_VERSION));
  addCheck("stateLayerContainsRequestedCurrentFields", Boolean(state.CURRENT_PLATFORM && state.CURRENT_DATASET_HASH && state.CURRENT_TIME_RANGE && state.CURRENT_ACTIVE_SERIES && state.CURRENT_ACTIVE_PRODUCT));
  addCheck("stateLayerDefaultPlatformIsTmall", state.CURRENT_PLATFORM === CURRENT_PLATFORM);
  addCheck("stateLayerSchemaVersion", state.schemaVersion === SYSTEM_STATE_SCHEMA_VERSION);
};

const run = () => {
  const stateSource = read("lib/state/system-state.ts");
  const runtimeContext = read("lib/etl/runtime/context.ts");
  const runtimePersistenceTypes = read("lib/persistence/runtime-dataset-persistence.types.ts");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const visualSystem = read("components/visual-system/v1/visual-system.tsx");
  const chart = read("components/visual-system/v1/bi-chart.tsx");
  const upload = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const brandSemantic = read("lib/bi/brand-model-semantic.ts");
  const dedup = read("lib/etl/dedup-engine.ts");

  addCheck("systemStateFileExists", fs.existsSync(path.join(ROOT, "lib/state/system-state.ts")));
  addCheck("versionsFrozen", ETL_VERSION.includes("V2") && BI_VERSION.includes("SSOT") && TARGET_VERSION.includes("REQUIRED_DERIVED_UNSUPPORTED") && UI_ARCH_VERSION.includes("L1_L2_L3_L4"));

  const defaultState = createSystemState({ now: () => new Date("2026-07-03T00:00:00.000Z") });
  assertSystemStateShape(defaultState);
  addCheck("stateIsSerializable", JSON.parse(serializeSystemState(defaultState)).stateId === defaultState.stateId);
  const restored = restoreSystemState(serializeSystemState(defaultState));
  addCheck("stateIsRestorable", restored.status === "valid", restored);
  addCheck("validateSystemStateRejectsMismatchedVersion", validateSystemState({ ...defaultState, BI_VERSION: "broken" }).status === "invalid");

  const hashA = createDatasetHash({ b: 2, a: { y: 2, x: 1 } });
  const hashB = createDatasetHash({ a: { x: 1, y: 2 }, b: 2 });
  addCheck("datasetHashStableAcrossKeyOrder", hashA === hashB, { hashA, hashB });
  addCheck("emptyDatasetHashIsExplicit", createDatasetHash({}) === CURRENT_DATASET_HASH);
  addCheck("stableStringifySortsKeys", stableStringify({ z: 1, a: 2 }) === "{\"a\":2,\"z\":1}");

  const sourceState = createSystemStateFromSources({
    runtimeSnapshot: sampleRuntimeSnapshot(),
    debugContext: sampleDebugContext(),
    now: () => new Date("2026-07-03T00:00:00.000Z"),
  });
  addCheck("sourceStateRestoresTimeRange", sourceState.CURRENT_TIME_RANGE.startDate === "2026-06-26" && sourceState.CURRENT_TIME_RANGE.endDate === "2026-06-30", sourceState.CURRENT_TIME_RANGE);
  addCheck("sourceStateRestoresActiveSeries", sourceState.CURRENT_ACTIVE_SERIES.seriesId === "series-a" && sourceState.CURRENT_ACTIVE_SERIES.seriesName === "系列A", sourceState.CURRENT_ACTIVE_SERIES);
  addCheck("sourceStateRestoresActiveProduct", sourceState.CURRENT_ACTIVE_PRODUCT.productId === "P1", sourceState.CURRENT_ACTIVE_PRODUCT);
  addCheck("sourceStateDatasetHashNotEmpty", sourceState.CURRENT_DATASET_HASH !== CURRENT_DATASET_HASH, sourceState.CURRENT_DATASET_HASH);
  addCheck("sourceStatePointersPreserved", sourceState.sourcePointers.runtimeDatasetSnapshotId === "runtime-test-2026-06-26-2026-06-30" && sourceState.sourcePointers.debugContextId === "active", sourceState.sourcePointers);

  addCheck("ssotFlowExact", sameList(SSOT_ARCHITECTURE_LOCK.flow, ["ETL", "BI", "DOMAIN", "UI"] as const), SSOT_ARCHITECTURE_LOCK.flow);
  addCheck("etlRuleStructureOnly", SSOT_ARCHITECTURE_LOCK.rules.ETL === "structure_source_files_only");
  addCheck("biIsMetricSsot", SSOT_ARCHITECTURE_LOCK.rules.BI === "single_metric_interpretation_source");
  addCheck("domainGroupingOnly", SSOT_ARCHITECTURE_LOCK.rules.DOMAIN === "dimension_grouping_only");
  addCheck("uiPresentationOnly", SSOT_ARCHITECTURE_LOCK.rules.UI === "presentation_only");
  addCheck("uiCannotCalculateBusinessMetricsRule", SSOT_ARCHITECTURE_LOCK.forbidden.UI.includes("calculate_business_metrics"));
  addCheck("biCannotWriteBackEtlRule", SSOT_ARCHITECTURE_LOCK.forbidden.BI.includes("write_back_to_etl"));

  addCheck("kpiOnlyFromBI", KPI_SEMANTIC_LOCK.source === "BI");
  addCheck("primaryKpiFrozen", sameList(KPI_SEMANTIC_LOCK.primary, ["gmv", "gsv", "adRoi"] as const), KPI_SEMANTIC_LOCK.primary);
  addCheck("secondaryKpiFrozen", sameList(KPI_SEMANTIC_LOCK.secondary, ["adSpendRateAfterRefund", "directTransactionShare"] as const), KPI_SEMANTIC_LOCK.secondary);
  addCheck("hiddenKpiFrozen", sameList(KPI_SEMANTIC_LOCK.hidden, ["mtd", "dly", "trendDetail"] as const), KPI_SEMANTIC_LOCK.hidden);
  addCheck("homePrimaryKpiLayerMatchesLock", home.includes("PRIMARY_HOME_KPI_TITLES = [\"GMV\", \"GSV\", \"投入产出比\"]"));
  addCheck("homeSecondaryKpiLayerMatchesLock", home.includes("SECONDARY_HOME_KPI_TITLES = [\"去退费比\", \"直接成交占比\"]"));

  addCheck("targetOverlayIsolated", TARGET_OVERLAY_LOCK.policy === "overlay_only" && TARGET_OVERLAY_LOCK.canChangeActualMetrics === false && TARGET_OVERLAY_LOCK.canWriteRuntimeDataset === false);
  addCheck("targetRoiUnitFrozen", TARGET_OVERLAY_LOCK.roiUnit === "倍" && TARGET_METRIC_DEFINITIONS.find((definition) => definition.metricKey === "adRoi")?.unit === "倍");
  addCheck("targetRequiredDefinitionsFrozen", sameList(getRequiredTargetMetricDefinitionsForScope("platform").map((definition) => definition.metricKey), ["gmv", "gsv", "adRoi", "refundRate", "averageOrderValue", "conversionRate", "directTransactionShare"]));
  addCheck("targetDerivedDefinitionsFrozen", sameList(getDerivedTargetMetricDefinitionsForScope("platform").map((definition) => definition.metricKey), ["adSpend", "geoSearchShare", "adSpendRateAfterRefund"]));
  addCheck("targetUnsupportedDefinitionsFrozen", sameList(getUnsupportedTargetMetricDefinitionsForScope("platform").map((definition) => definition.metricKey), ["brandVisitors", "brandPaidBuyers", "shippedRefundRate", "signedRefundRate", "mtdTurnover", "regionalFulfillmentRate", "cpc"]));
  addCheck("targetDerivedFormulaStillWorks", deriveTargetMetricValue("adSpend", { gsv: 80000, adRoi: 4 }).value === 20000);
  addCheck("targetDraftsDoNotEnterRuntimeDataset", !/targets\\??:|targets:/.test(runtimeContext) && !/targets\\??:|targets:/.test(runtimePersistenceTypes));

  addCheck("platformAdapterModelReady", sameList(PLATFORM_ADAPTER_MODEL.adapters, ["tmall", "jd", "douyin"] as const), PLATFORM_ADAPTER_MODEL.adapters);
  addCheck("platformAdapterOnlySwapsEtl", PLATFORM_ADAPTER_MODEL.extensionRule === "replace_etl_adapter_only");
  addCheck("multiPlatformKeepsBiUiTarget", PLATFORM_ADAPTER_MODEL.biReusable && PLATFORM_ADAPTER_MODEL.uiReusable && PLATFORM_ADAPTER_MODEL.targetStructureStable);
  addCheck("systemStateSupportsRequestedPlatformCodes", /\"tmall\" \\| \"jd\" \\| \"douyin\" \\| \"yiz\"/.test(stateSource));

  addCheck("searchDedupByDateKeywordStillPresent", dedup.includes("date ?? \"__no_date__\"") && dedup.includes("keyword"));
  addCheck("brandCenterUnifiedStillPresent", brandSemantic.includes("centerWordGroups") && brandSemantic.includes("resolveBrandCenterMatch"));
  addCheck("biMapperOwnsMetricInterpretation", mapper.includes("deriveTargetMetricValue(targetMetricKey") && mapper.includes("directTransactionShare"));
  addCheck("iaLayerPresentInUi", visualSystem.includes("核心经营层") && visualSystem.includes("分析解释层") && visualSystem.includes("控制层") && visualSystem.includes("工具层"));
  addCheck("chartSemanticUnified", chart.includes("data-chart-semantic-layer=\"unified\""));
  addCheck("uploadProductizedPlatformTabs", upload.includes("京东") && upload.includes("抖音") && upload.includes("有赞") && upload.includes("拼多多") && upload.includes("skipped"));
  addCheck("seriesUsesTargetOverlay", series.includes("deriveTargetMetricValue") && series.includes("loadActiveTargetDrafts"));
  addCheck("productUsesTargetOverlay", product.includes("deriveTargetMetricValue") && product.includes("loadActiveTargetDrafts"));

  addCheck("noForbiddenRuntimeCopyInStateLayer", !/localStorage|raw row|file content|stack trace/i.test(stateSource));
  addCheck("forbiddenPathsNotModifiedByThisTask", gitStatus(["lib/storage", "lib/tmall", "lib/v05", "package.json", "package-lock.json", "vercel.json", ".vercel"]).length === 0);
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
  versions: {
    ETL_VERSION,
    BI_VERSION,
    TARGET_VERSION,
    UI_ARCH_VERSION,
  },
  ssotFlow: SSOT_ARCHITECTURE_LOCK.flow,
  kpiSemanticLock: KPI_SEMANTIC_LOCK,
  targetOverlayLock: TARGET_OVERLAY_LOCK,
  platformAdapterModel: PLATFORM_ADAPTER_MODEL,
  checks,
};

console.log(JSON.stringify(output, null, 2));
process.exit(status === "PASS" ? 0 : 1);
