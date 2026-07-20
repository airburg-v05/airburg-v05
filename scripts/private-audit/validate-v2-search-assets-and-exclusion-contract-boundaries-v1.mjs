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
  name: "search-assets-workspace-binds-debug-context-contract",
  pass:
    searchWorkspace.includes("loadCrossPageDebugContext") &&
    searchWorkspace.includes("saveCrossPageDebugContextPatch") &&
    searchWorkspace.includes("BrandModelFilterPopover") &&
    searchWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT"),
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
    !exclusionWorkspace.includes("legacy BI state") &&
    !exclusionWorkspace.includes("persistence schema") &&
    !exclusionWorkspace.includes("route contract"),
});

checks.push({
  name: "exclusion-page-uses-blocked-workspace",
  pass: exclusionPage.includes("V2ExclusionRulesWorkspace") && !exclusionPage.includes("readOnly"),
});

checks.push({
  name: "exclusion-workspace-explicitly-blocks-missing-contract",
  pass:
    exclusionWorkspace.includes("BLOCKED_BY_MISSING_CONTRACT") &&
    exclusionWorkspace.includes("跨页保存") &&
    exclusionWorkspace.includes("统一读取"),
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
