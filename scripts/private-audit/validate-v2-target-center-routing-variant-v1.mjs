import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const pageSource = read("app/(workspace-v2)/v2/target-center/page.tsx");
const clientSource = read("components/saas-v2/targets/v2-brand-target-center.tsx");
const uploadSource = read("app/(workspace-v2)/v2/upload/page.tsx");
const targetDefinitions = read("lib/bi/target-metric-definitions.ts");
const targetPersistence = read("lib/persistence/target-drafts-persistence.ts");

const checks = [
  {
    name: "V2TargetCenterUsesBrandIndependentClient",
    pass: pageSource.includes("<V2BrandTargetCenter />") && !pageSource.includes("RoutedTargetManagementClient"),
  },
  {
    name: "BrandScopeIsAvailableWithoutOperatingDataset",
    pass:
      clientSource.includes('useState<EditableScope>("brand")') &&
      clientSource.includes('scope === "brand" || Boolean(') &&
      clientSource.includes('item.scope !== "brand" && !currentDataset'),
  },
  {
    name: "BrandTargetsUseBrandScopedDatabase",
    pass:
      clientSource.includes("targetDatabaseNameForBrand(brand.id)") &&
      clientSource.includes("loadTargetDrafts(query, { databaseName })") &&
      clientSource.includes("saveTargetDrafts(nextRecords, { databaseName })"),
  },
  {
    name: "TargetFoundationUploadWorkbenchRemoved",
    pass:
      !uploadSource.includes("TmallBatchImportWorkbench") &&
      !uploadSource.includes("目标中心数据底座") &&
      uploadSource.includes('<UploadPageV1Dashboard layoutMode="embedded" routeVariant="v2" />'),
  },
  {
    name: "BrandScopeSupportedByMetricAndPersistenceContracts",
    pass:
      targetDefinitions.includes('export type TargetMetricScope = "brand" | "platform" | "series" | "product";') &&
      targetPersistence.includes('value === "brand"') &&
      targetPersistence.includes('scope !== "brand" && !platformCode'),
  },
  {
    name: "PauseAndReactivateRemainAvailable",
    pass:
      clientSource.includes("pauseTargetDraft") &&
      clientSource.includes('status: "active"') &&
      clientSource.includes("重新启用"),
  },
];

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-target-center-routing-variant-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
