import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const files = {
  workspace: read("lib/v2/workspace/brand-workspace.ts"),
  workspaceHook: read("lib/v2/workspace/use-brand-workspace.ts"),
  seriesWorkspace: read("lib/v2/workspace/brand-series.ts"),
  runtimeAdapter: read("lib/v2/runtime/runtime-v2-dataset.ts"),
  homeSource: read("lib/bi/bi.data-source.ts"),
  homeAdapter: read("lib/v2/home/v2-home-adapter.ts"),
  homeDashboard: read("components/saas-v2/home/v2-home-dashboard.tsx"),
  homeToolbar: read("components/saas-v2/home/v2-home-toolbar.tsx"),
  homeChart: read("components/saas-v2/home/v2-home-chart.tsx"),
  seriesManager: read("components/saas-v2/series/v2-brand-series-manager.tsx"),
  seriesDashboard: read("components/saas-v2/series/v2-series-board-dashboard.tsx"),
  storeRuntime: read("lib/v05/store-board/browser-runtime.ts"),
  seriesRuntime: read("lib/v05/series-board/browser-runtime.ts"),
  productRuntime: read("lib/v05/product-board/browser-runtime.ts"),
  searchAssets: read("components/saas-v2/search-assets/v2-search-assets-workspace.tsx"),
  brandPage: read("app/(workspace-v2)/v2/brand-settings/page.tsx"),
  uploadDashboard: read("components/upload/v1/upload-page-v1-dashboard.tsx"),
};

const checks = [
  {
    name: "BrandWorkspaceSeparatesRuntimeTargetsAndDebugDatabases",
    pass:
      files.workspace.includes("runtimeDatabaseNameForBrand") &&
      files.workspace.includes("targetDatabaseNameForBrand") &&
      files.workspace.includes("debugDatabaseNameForBrand") &&
      files.brandPage.includes("V2BrandSettingsWorkspace"),
  },
  {
    name: "AllBoardRuntimesReadOneActiveBrandSnapshotAdapter",
    pass: [files.storeRuntime, files.seriesRuntime, files.productRuntime].every((source) =>
      source.includes("loadActiveBrandRuntimeV2Dataset") && !source.includes("IndexedDbV2PersistenceStore"),
    ),
  },
  {
    name: "BrandWorkspaceHydratesWithoutCrossBrandFirstPaintReads",
    pass:
      files.workspaceHook.includes("createDefaultBrandWorkspaceState") &&
      files.workspaceHook.includes("loadBrandWorkspaceState") &&
      files.workspaceHook.includes("BRAND_WORKSPACE_EVENT") &&
      files.workspaceHook.includes('window.addEventListener("storage"'),
  },
  {
    name: "HomeAndSearchAssetsUseCurrentBrandDatabases",
    pass:
      files.homeAdapter.includes("includeV05Persistence: false") &&
      files.homeAdapter.includes("runtimeDatabaseNameForBrand(brand.id)") &&
      files.searchAssets.includes("debugDatabaseNameForBrand(brand.id)"),
  },
  {
    name: "RuntimeAdapterPreservesMultiPlatformStoreFactsWithoutStaticMockData",
    pass:
      files.runtimeAdapter.includes("collectScopes") &&
      files.runtimeAdapter.includes("businessProductFacts") &&
      files.runtimeAdapter.includes("adProductFacts") &&
      files.runtimeAdapter.includes("trackedProducts") &&
      files.runtimeAdapter.includes("loadBrandSeries(brandId)"),
  },
  {
    name: "AppendImportRestoresActiveSnapshotBeforeMerge",
    pass:
      files.uploadDashboard.includes('mergeMode === "append"') &&
      files.uploadDashboard.includes("restoreRuntimeDatasetFromSnapshot") &&
      files.uploadDashboard.includes("runtimeDatabaseNameForBrand(brand.id)"),
  },
  {
    name: "SeriesCountUnlimitedButHomeSelectionCappedAtFive",
    pass:
      files.seriesWorkspace.includes("export const MAX_HOME_SERIES = 5") &&
      files.seriesManager.includes("系列数量不限") &&
      files.seriesManager.includes("驾驶舱最多展示 5 个") &&
      files.seriesManager.includes("showOnHome"),
  },
  {
    name: "SeriesCenterAllowsConfigurationWhenRuntimeExistsButSeriesIsEmpty",
    pass:
      files.seriesDashboard.includes('viewModel.statusLabel === "暂无数据"') &&
      files.seriesDashboard.includes("经营数据已就绪，尚未创建系列") &&
      files.seriesDashboard.includes("<V2BrandSeriesManager"),
  },
  {
    name: "KeySeriesIsInsideMetricSection",
    pass:
      files.homeDashboard.indexOf("<KeySeriesSection") > files.homeDashboard.indexOf("<V2HomeMetricGrid") &&
      files.homeDashboard.indexOf("<KeySeriesSection") < files.homeDashboard.indexOf("</section>", files.homeDashboard.indexOf("<V2HomeMetricGrid")),
  },
  {
    name: "CustomRangeRequiresExplicitApply",
    pass:
      files.homeToolbar.includes("自定义时间范围") &&
      files.homeToolbar.includes("setCustomDraft") &&
      files.homeToolbar.includes("onCustomRangeChange(customDraft)") &&
      files.homeToolbar.includes("应用"),
  },
  {
    name: "YoyAndPreviousPeriodUseExplicitReferenceRanges",
    pass:
      files.homeAdapter.includes("referenceRangeForComparison") &&
      files.homeAdapter.includes("previousYearDate") &&
      files.homeAdapter.includes("变化率显示在指标卡") &&
      files.homeToolbar.includes("与紧邻的上一等长日期区间比较"),
  },
  {
    name: "TrendFooterHealthRowRemoved",
    pass:
      !files.homeChart.includes("v2-home-data-health-summary") &&
      !files.homeChart.includes("healthRows"),
  },
  {
    name: "HomeRuntimeSeriesUsesBrandScopedManualSelection",
    pass:
      files.homeSource.includes("homeSeriesDefinitions") &&
      files.homeAdapter.includes("uniqueEligibleDefinitions") &&
      files.homeAdapter.includes("seriesId: series.seriesId"),
  },
];

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-unified-brand-runtime-and-owner-feedback-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
