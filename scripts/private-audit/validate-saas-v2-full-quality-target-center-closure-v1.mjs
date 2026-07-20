import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const checks = [];

const addCheck = (name, pass, details = undefined) => {
  checks.push({ name, pass, details });
};

const sameList = (left, right) =>
  left.slice().sort().join("|") === right.slice().sort().join("|");

const ssot = readJson("docs/project/PROJECT_SSOT.json");
const routeMatrix = readJson("docs/project/ROUTE_DATA_SOURCE_MATRIX.json");
const targetClient = read("components/targets/v05/target-management-client.tsx");
const targetOptions = read("lib/v05/target-management/options.ts");
const targetMutations = read("lib/v05/target-management/mutations.ts");
const routeMapping = read("lib/v2/route-mapping.ts");
const searchWorkspace = read("components/saas-v2/search-assets/v2-search-assets-workspace.tsx");
const exclusionWorkspace = read("components/saas-v2/exclusion-rules/v2-exclusion-rules-workspace.tsx");
const v2UploadPage = read("app/(workspace-v2)/v2/upload/page.tsx");
const uploadDashboard = read("components/upload/v1/upload-page-v1-dashboard.tsx");
const batchImportWorkbench = read("components/upload/batch-import/tmall-batch-import-workbench.tsx");
const upload18Validator = read("scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs");
const targetRuntime = read("lib/v05/target-management/browser-runtime.ts");
const taskIssueMatrix = read("docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/issue-matrix.md");
const freeze = read("docs/releases/v0.5f-target-allocation-freeze.md");

const expectedV2Routes = [
  "/v2/home",
  "/v2/series-board",
  "/v2/store-board",
  "/v2/product-board",
  "/v2/upload",
  "/v2/upload/history",
  "/v2/data-health",
  "/v2/target-center",
  "/v2/search-assets",
  "/v2/exclusion-rules",
];

const expectedDataBoundRoutes = [
  "/v2/home",
  "/v2/series-board",
  "/v2/store-board",
  "/v2/product-board",
  "/v2/upload/history",
  "/v2/data-health",
  "/v2/target-center",
];

const v2Routes = routeMatrix.routes.filter((route) => route.route.startsWith("/v2/"));
const routeByPath = new Map(v2Routes.map((route) => [route.route, route]));
const saasUiV2 = ssot.tracks.saasUiV2;

addCheck("ssotRouteCountIsTen", saasUiV2.routeCount === 10, saasUiV2.routeCount);
addCheck("routeMatrixHasExactlyTenV2Routes", sameList(v2Routes.map((route) => route.route), expectedV2Routes), v2Routes.map((route) => route.route));
addCheck("ssotDataBoundRoutesAreNuancedReadersOnly", sameList(saasUiV2.dataBoundRoutes, expectedDataBoundRoutes), saasUiV2.dataBoundRoutes);
addCheck("ssotRuntimeWriterRoutesSeparated", sameList(saasUiV2.runtimeWriterRoutes ?? [], ["/v2/upload"]), saasUiV2.runtimeWriterRoutes);
addCheck("ssotConfigurationRoutesSeparated", sameList(saasUiV2.configurationBoundRoutes ?? [], ["/v2/search-assets"]), saasUiV2.configurationBoundRoutes);
addCheck("ssotBlockedRoutesSeparated", sameList(saasUiV2.blockedByMissingContractRoutes ?? [], ["/v2/exclusion-rules"]), saasUiV2.blockedByMissingContractRoutes);
addCheck("ssotNoOldStaticShellCount", saasUiV2.remainingStaticShellRouteCount === 0, saasUiV2.remainingStaticShellRouteCount);
addCheck("ssotDoesNotOverclaimWriterOrConfigAsDashboardDataBound", !saasUiV2.dataBoundRoutes.includes("/v2/upload") && !saasUiV2.dataBoundRoutes.includes("/v2/search-assets") && !saasUiV2.dataBoundRoutes.includes("/v2/exclusion-rules"));

addCheck("homeClassifiedAsRuntimeReader", routeByPath.get("/v2/home")?.bindingClass === "BUSINESS_RUNTIME_READER_WITH_TARGET_OVERLAY");
addCheck("boardsClassifiedAsRuntimeReaders", ["/v2/series-board", "/v2/store-board", "/v2/product-board"].every((route) => routeByPath.get(route)?.bindingClass === "BUSINESS_RUNTIME_READER_WITH_CONTEXT_FALLBACK"));
addCheck("uploadClassifiedAsRuntimeWriter", routeByPath.get("/v2/upload")?.bindingClass === "RUNTIME_WRITER_NOT_DASHBOARD_DATA_BOUND" && routeByPath.get("/v2/upload")?.isRuntimeWriter === true);
addCheck("uploadHistoryClassifiedAsMetadataReader", routeByPath.get("/v2/upload/history")?.bindingClass === "RUNTIME_METADATA_READER");
addCheck("dataHealthClassifiedAsQualityReader", routeByPath.get("/v2/data-health")?.bindingClass === "RUNTIME_QUALITY_READER");
addCheck("targetCenterClassifiedAsTargetReaderWriter", routeByPath.get("/v2/target-center")?.bindingClass === "TARGET_DATA_READER_WRITER");
addCheck("searchAssetsClassifiedAsConfiguration", routeByPath.get("/v2/search-assets")?.bindingClass === "CONFIGURATION_READER_WRITER_NOT_BUSINESS_DATA_BOUND" && routeByPath.get("/v2/search-assets")?.isConfigurationBound === true);
addCheck("exclusionRulesSafeBlocked", routeByPath.get("/v2/exclusion-rules")?.status === "BLOCKED_BY_MISSING_CONTRACT" && routeByPath.get("/v2/exclusion-rules")?.bindingClass === "SAFE_BLOCKED_NO_MOCK_DATA");
addCheck("noV2RouteStillClaimsStaticConstants", v2Routes.every((route) => !String(route.currentDataSource).includes("components/saas-v2/data.ts static constants")));
addCheck("v2UploadInputKeepsSingleChangeHandler", !uploadDashboard.includes("onInput=") && uploadDashboard.includes('onChange={(event) => void handleSelectFiles(event.currentTarget.files)}'));
addCheck("v05FoundationInputKeepsSingleChangeHandler", !batchImportWorkbench.includes("onInput=") && batchImportWorkbench.includes('data-testid="v05-batch-file-input"') && batchImportWorkbench.includes("void handleSelectFiles(event.target.files)"));
addCheck("upload18ValidatorUsesNativeFileChooserPath", upload18Validator.includes("Page.setInterceptFileChooserDialog") && upload18Validator.includes("Page.fileChooserOpened") && upload18Validator.includes("backendNodeId") && upload18Validator.includes("nativeClickSelector"));
addCheck("upload18ValidatorCoversSeparatedRuntimeAndTargetFoundationRegression", upload18Validator.includes("targetCenterPreconditionRegression") && upload18Validator.includes("targetFoundationImportRegression") && upload18Validator.includes("targetCenterWritableRegression") && upload18Validator.includes("targetCenterPercentTargetSavedAndReadBack") && upload18Validator.includes("targetCenterPauseStateReadsBack") && upload18Validator.includes("targetCenterReactivateKeepsTarget"));
addCheck("v2UploadExposesTargetFoundationWithoutDecorativeOuterCard", v2UploadPage.includes("v2-upload-target-foundation") && v2UploadPage.includes("<TmallBatchImportWorkbench routeVariant=\"v2\" />") && !v2UploadPage.includes("rounded-3xl"));
addCheck("v2UploadKeepsRuntimeAndV05FoundationSeparated", v2UploadPage.includes("18 文件入口写入经营首页和看板使用的安全聚合数据") && v2UploadPage.includes("目标中心沿用 V0.5F") && !uploadDashboard.includes("runV05BrowserTmallBatchImport"));
addCheck("v05BatchImportWorkbenchSupportsV2LinksWithoutChangingLegacyDefault", batchImportWorkbench.includes('routeVariant = "legacy"') && batchImportWorkbench.includes('type DataCenterRouteVariant') && batchImportWorkbench.includes("}, { routeVariant })"));
addCheck("targetRuntimeExplainsRuntimeVsTargetFoundationPrecondition", targetRuntime.includes("loadActiveRuntimeDatasetSnapshot") && targetRuntime.includes("经营数据已导入，但目标中心数据底座尚未初始化") && targetRuntime.includes("18 文件安全聚合数据"));

addCheck("targetFreezeForbidsHardDelete", freeze.includes("新建、编辑、暂停和重新启用") && freeze.includes("暂停目标不硬删除"));
addCheck("targetUiDoesNotOpenDeleteAction", !/>\s*删除\s*</.test(targetClient) && !targetClient.includes("setTargetStatusMutation({ targetId, status: \"deleted\""));
addCheck("targetUiKeepsPauseReactivateActions", targetClient.includes("重新启用") && targetClient.includes("暂停"));
addCheck("targetUiTruthfulWriteCopy", targetClient.includes("点击保存后会写入当前浏览器的目标数据，并通过读回校验后生效。") && !targetClient.includes("保存前不会写入本地数据"));
addCheck("targetUiShowsFrozenBoundary", targetClient.includes("目标中心边界") && targetClient.includes("周、自定义和多月范围没有独立合同"));
addCheck("targetDrawerHasSinglePlatformStoreLabel", (targetClient.match(/>平台和店铺</g) ?? []).length === 1);
addCheck("targetPercentInputNormalizesBusinessForms", targetClient.includes("百分比支持 92、92% 或 0.92") && targetClient.includes("inputMode=\"decimal\"") && targetClient.includes("parseTargetValueText(draft.metricKey, draft.targetValueText)"));
addCheck("targetMutationRejectsUnknownMetrics", targetMutations.includes("target_metric_unsupported") && targetOptions.includes("isTargetManagementMetricKey"));
addCheck("targetMutationRejectsUnnormalizedPercent", targetMutations.includes("target_percent_value_invalid") && targetMutations.includes("targetMetricFormat(draft.metricKey.trim()) === \"percent\""));
addCheck("targetStatusMutationRemainsPauseOnly", targetMutations.includes('status: "active" | "paused";') && !targetMutations.includes('status: "deleted";'));

addCheck("explicitV2RouteMapperStillBlocksMissingManagementRoutes", routeMapping.includes('"/series-board/manage"') && routeMapping.includes('"/product-board/tracked"') && routeMapping.includes('"/upload/quality": "/v2/data-health"'));
addCheck("searchCopyUsesBusinessPageNames", searchWorkspace.includes("首页、系列看板和商品看板") && !searchWorkspace.includes("`/v2/home`"));
addCheck("exclusionCopyUsesBusinessPageNames", exclusionWorkspace.includes("首页、商品看板") && !exclusionWorkspace.includes("`/v2/home`"));
addCheck("searchAndExclusionDoNotReintroduceMockRows", !searchWorkspace.includes("keywordComparisonRows") && !exclusionWorkspace.includes("exclusionRuleRows") && !exclusionWorkspace.includes("readOnly"));
addCheck("targetAgentConflictRecorded", taskIssueMatrix.includes("TARGET_AGENT_REQUIRED_CONFLICT_STALE") && taskIssueMatrix.includes("stable registry"));

const failed = checks.filter((check) => !check.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-saas-v2-full-quality-target-center-closure-v1",
  routeCount: v2Routes.length,
  failed,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exit(1);
