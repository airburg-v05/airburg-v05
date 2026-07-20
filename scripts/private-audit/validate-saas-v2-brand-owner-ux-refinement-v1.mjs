import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const checks = [];
const addCheck = (name, pass, details = undefined) => checks.push({ name, pass, details });

const sources = {
  pageHeader: read("components/saas-v2/layout/saas-v2-page-header.tsx"),
  sidebar: read("components/saas-v2/layout/saas-v2-sidebar.tsx"),
  data: read("components/saas-v2/data.ts"),
  homeToolbar: read("components/saas-v2/home/v2-home-toolbar.tsx"),
  homeMetrics: read("components/saas-v2/home/v2-home-metric-grid.tsx"),
  metricCard: read("components/saas-v2/cards/metric-card-v2.tsx"),
  safeEmptyState: read("components/saas-v2/empty/safe-empty-state.tsx"),
  series: read("components/saas-v2/series/v2-series-board-dashboard.tsx"),
  store: read("components/saas-v2/store/v2-store-board-dashboard.tsx"),
  product: read("components/saas-v2/product/v2-product-board-dashboard.tsx"),
  uploadPage: read("app/(workspace-v2)/v2/upload/page.tsx"),
  uploadDashboard: read("components/upload/v1/upload-page-v1-dashboard.tsx"),
  uploadHistory: read("components/upload/history/v1/history-data-v1-dashboard.tsx"),
  uploadQuality: read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx"),
  targetRuntime: read("lib/v05/target-management/browser-runtime.ts"),
  targetClient: read("components/targets/v05/target-management-client.tsx"),
  searchWorkspace: read("components/saas-v2/search-assets/v2-search-assets-workspace.tsx"),
  searchPopover: read("components/visual-system/v1/brand-model-filter-popover.tsx"),
  exclusionWorkspace: read("components/saas-v2/exclusion-rules/v2-exclusion-rules-workspace.tsx"),
  tenRouteValidator: read("scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs"),
  issueMatrix: read("docs/project/tasks/SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1/issue-matrix.md"),
};

const uiSource = [
  sources.pageHeader,
  sources.data,
  sources.homeToolbar,
  sources.homeMetrics,
  sources.metricCard,
  sources.series,
  sources.store,
  sources.product,
  sources.uploadPage,
  sources.uploadDashboard,
  sources.uploadHistory,
  sources.uploadQuality,
  sources.targetRuntime,
  sources.targetClient,
  sources.searchWorkspace,
  sources.searchPopover,
  sources.exclusionWorkspace,
].join("\n");

addCheck(
  "secondaryPageHeaderIsCompactAndNoOldWorkspaceHero",
  sources.pageHeader.includes('data-testid="saas-v2-compact-page-header"') &&
    sources.pageHeader.includes("返回首页") &&
    !sources.pageHeader.includes("Airburg Business Workspace") &&
    !sources.pageHeader.includes("品牌经营分析工作区") &&
    !sources.pageHeader.includes("返回 V2 首页"),
);

addCheck(
  "exclusionRulesHiddenFromMainNavigationButDirectRouteRemains",
  !sources.data.includes('{ href: "/v2/exclusion-rules"') &&
    !sources.homeToolbar.includes('href: "/v2/exclusion-rules"') &&
    sources.exclusionWorkspace.includes("排除规则暂未开放"),
);

addCheck(
  "homeKpiNoTargetUsesCompactState",
  sources.homeMetrics.includes("hasHomeTargetDetail") &&
    sources.homeMetrics.includes('data-target-state={showTargetDetail ? "ready" : "empty"}') &&
    sources.homeMetrics.includes("未设置目标") &&
    sources.metricCard.includes("hasMeaningfulTarget") &&
    sources.metricCard.includes("未设置目标"),
);

addCheck(
  "emptyBoardsDoNotRenderFullBlankStacks",
  ["series", "store", "product"].every((key) =>
    sources[key].includes('!viewModel || !viewModel.storeContext || viewModel.statusLabel === "暂无数据"') &&
    sources[key].includes("SafeEmptyState"),
  ),
);

addCheck(
  "emptyBoardStatesHaveSingleV2UploadCta",
  sources.safeEmptyState.includes('data-testid="safe-empty-state-primary-cta"') &&
    sources.safeEmptyState.includes("actionHref") &&
    ["series", "store", "product"].every((key) =>
      sources[key].includes('actionHref="/v2/upload"') &&
      sources[key].includes('actionLabel="前往数据接入"'),
    ) &&
    sources.tenRouteValidator.includes("emptyBoardPrimaryCtaPointsToV2Upload"),
);

addCheck(
  "searchAssetsModalIsFocusedScrollableAndFooterFixed",
  sources.searchPopover.includes('data-testid={`${testId}-scrollable-content`}') &&
    sources.searchPopover.includes("overflow-y-auto") &&
    sources.searchPopover.includes('data-testid={`${testId}-fixed-footer`}') &&
    !sources.searchPopover.includes("groupPanelMode") &&
    !sources.searchPopover.includes(">查看<") &&
    !sources.searchPopover.includes(">编辑分组<") &&
    sources.searchPopover.includes("一次只编辑一个分组"),
);

addCheck(
  "searchAndExclusionPagesUseBusinessCopyOnly",
  !sources.searchWorkspace.includes("SafeIssueCodeBadge") &&
    !sources.searchWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT") &&
    !sources.searchWorkspace.includes("mock") &&
    sources.searchWorkspace.includes("暂未开放的效果看板") &&
    !sources.exclusionWorkspace.includes("SafeIssueCodeBadge") &&
    !sources.exclusionWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT") &&
    !sources.exclusionWorkspace.includes("mock") &&
    !sources.exclusionWorkspace.includes("readOnly") &&
    !sources.exclusionWorkspace.includes("<input") &&
    sources.exclusionWorkspace.includes("当前页面只保留规划状态"),
);

addCheck(
  "uploadV2EmbeddedCopyIsCompactAndNoSkippedEnglishVisible",
  sources.uploadDashboard.includes("{isEmbedded ? null : (") &&
    sources.uploadDashboard.includes("<V1DimensionScopeBar") &&
    sources.uploadDashboard.includes("选择天猫数据文件") &&
    !sources.uploadDashboard.includes("统一选择、多类型识别、安全聚合保存") &&
    !sources.uploadDashboard.includes("只展示成功 / 失败 / skipped") &&
    !sources.uploadDashboard.includes("skipped：") &&
    sources.uploadDashboard.includes("productStatusLabel"),
);

addCheck(
  "historyAndQualityUseBusinessIdentifiersNotSafeCodeCopy",
  !sources.uploadHistory.includes("安全短码") &&
    !sources.uploadHistory.includes("active dataset") &&
    sources.uploadHistory.includes("批次标识") &&
    !sources.uploadQuality.includes("安全短码") &&
    !sources.uploadQuality.includes("safe warning code") &&
    !sources.uploadQuality.includes("问题 code") &&
    !sources.uploadQuality.includes("安全 issue code") &&
    !sources.uploadQuality.includes("active dataset") &&
    !sources.uploadQuality.includes("持久化数据 schema") &&
    !sources.uploadQuality.includes("持久化 schema") &&
    sources.uploadQuality.includes("问题标识") &&
    sources.uploadQuality.includes("批次标识"),
);

addCheck(
  "targetCenterRemovesInternalMainCopy",
  sources.targetClient.includes("目标设置说明") &&
    sources.targetClient.includes("当前支持日目标和单月目标；周、自定义和多月目标暂未开放。") &&
    !sources.targetClient.includes("TARGET CENTER") &&
    !sources.targetClient.includes("V0.5F") &&
    !sources.targetClient.includes("schema") &&
    sources.targetRuntime.includes("四类目标基础报表") &&
    !sources.targetRuntime.includes("V0.5F 四源目标底座") &&
    !sources.targetRuntime.includes("18 文件安全聚合数据") &&
    sources.targetClient.includes('routeVariant === "v2" ? ('),
);

addCheck(
  "businessUiAvoidsInternalStatusTokens",
  ![
    "Airburg Business Workspace",
    "Preview pending",
    "Dataset: preview pending",
    "BLOCKED_BY_MISSING_CONTRACT",
    "TARGET CENTER",
    "safe issue code",
    "safe warning code",
    "问题 code",
    "安全 issue code",
    "安全短码",
    "active dataset",
    "legacy BI state",
    "persistence schema",
    "route contract",
  ].some((token) => uiSource.includes(token)),
);

addCheck(
  "mobileSearchModalEvidenceAndBrowserLockRecorded",
  sources.issueMatrix.includes("scrollHeight=1761") &&
    sources.issueMatrix.includes("scrollWidth=390") &&
    sources.issueMatrix.includes("footer actions `取消/清空/保存` are not visible") &&
    sources.tenRouteValidator.includes("v2SearchAssetsMobile390ModalFooterReachable") &&
    sources.tenRouteValidator.includes("viewportHeight === 844"),
);

const failed = checks.filter((check) => !check.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  validator: "validate-saas-v2-brand-owner-ux-refinement-v1",
  failed,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exit(1);
