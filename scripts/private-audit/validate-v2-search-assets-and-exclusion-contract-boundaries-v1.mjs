import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const checks = [];

const searchPage = read("app/(workspace-v2)/v2/search-assets/page.tsx");
const searchWorkspace = read("components/saas-v2/search-assets/v2-search-assets-workspace.tsx");
const exclusionPage = read("app/(workspace-v2)/v2/exclusion-rules/page.tsx");
const exclusionWorkspace = read("components/saas-v2/exclusion-rules/v2-exclusion-rules-workspace.tsx");

checks.push({
  name: "search-assets-page-uses-real-workspace",
  pass: searchPage.includes("V2SearchAssetsWorkspace") && !searchPage.includes("aliasRows"),
});

checks.push({
  name: "search-assets-workspace-binds-current-browser-config",
  pass:
    searchWorkspace.includes("loadCrossPageDebugContext") &&
    searchWorkspace.includes("saveCrossPageDebugContextPatch") &&
    searchWorkspace.includes("BrandModelFilterPopover") &&
    searchWorkspace.includes("暂未开放的效果看板") &&
    !searchWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT"),
});

checks.push({
  name: "search-assets-removes-static-comparison-mocks",
  pass:
    !searchWorkspace.includes("keywordComparisonRows") &&
    !searchWorkspace.includes("searchAssetRows") &&
    !searchWorkspace.includes("ChartPanelV2"),
});

checks.push({
  name: "user-facing-copy-avoids_engineering_terms",
  pass:
    !searchWorkspace.includes("analytics contract") &&
    !searchWorkspace.includes("persistence + route") &&
    !searchWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT") &&
    !searchWorkspace.includes("mock") &&
    !exclusionWorkspace.includes("legacy BI state") &&
    !exclusionWorkspace.includes("persistence schema") &&
    !exclusionWorkspace.includes("route contract") &&
    !exclusionWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT") &&
    !exclusionWorkspace.includes("mock"),
});

checks.push({
  name: "exclusion-page-uses-blocked-workspace",
  pass: exclusionPage.includes("V2ExclusionRulesWorkspace") && !exclusionPage.includes("readOnly"),
});

checks.push({
  name: "exclusion-workspace-uses-business-planned-state",
  pass:
    exclusionWorkspace.includes("排除规则暂未开放") &&
    exclusionWorkspace.includes("当前页面只保留规划状态") &&
    exclusionWorkspace.includes("开放前还需要确认"),
});

checks.push({
  name: "exclusion-workspace-removes-static-rule-tables",
  pass:
    !exclusionWorkspace.includes("exclusionRuleRows") &&
    !exclusionWorkspace.includes("sourceCapabilityRows") &&
    !exclusionWorkspace.includes("input"),
});

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
