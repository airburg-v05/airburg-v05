import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const files = {
  uploadPage: read("app/(workspace-v2)/v2/upload/page.tsx"),
  uploadDashboard: read("components/upload/v1/upload-page-v1-dashboard.tsx"),
  dataHealthPage: read("app/(workspace-v2)/v2/data-health/page.tsx"),
  dataHealthClient: read("components/saas-v2/data-health/v2-runtime-data-health.tsx"),
  uploadHistoryPage: read("app/(workspace-v2)/v2/upload/history/page.tsx"),
  importHistoryClient: read("components/saas-v2/upload/v2-runtime-import-history.tsx"),
  runtimePersistence: read("lib/persistence/runtime-dataset-persistence.ts"),
  pageHeader: read("components/saas-v2/layout/saas-v2-page-header.tsx"),
};

const checks = [
  {
    name: "V2UploadPageUsesOnlyEmbeddedRuntimeDashboard",
    pass:
      files.uploadPage.includes('<UploadPageV1Dashboard layoutMode="embedded" routeVariant="v2" />') &&
      !files.uploadPage.includes("TmallBatchImportWorkbench"),
  },
  {
    name: "UploadDefaultsToReplaceAndRequiresExplicitAppend",
    pass:
      files.uploadDashboard.includes('useState<ImportMergeMode>("replace")') &&
      files.uploadDashboard.includes('mergeMode === "append"') &&
      files.uploadDashboard.includes("替换当前品牌数据") &&
      files.uploadDashboard.includes("追加店铺/批次"),
  },
  {
    name: "UploadUsesBrandScopedRuntimeAndSnapshotDatabase",
    pass:
      files.uploadDashboard.includes("{ brandId: brand.id, mergeMode }") &&
      files.uploadDashboard.includes("runtimeDatabaseNameForBrand(brand.id)") &&
      files.uploadDashboard.includes("includeV05Persistence: false"),
  },
  {
    name: "UploadCanRegisterAdditionalTmallStoreWithoutOverclaimingOtherAdapters",
    pass:
      files.uploadDashboard.includes("新增天猫店铺") &&
      files.uploadDashboard.includes("当前真实文件适配器只开放天猫") &&
      files.uploadDashboard.includes("setManualStores"),
  },
  {
    name: "V2DataHealthReadsRuntimeSnapshotContract",
    pass:
      files.dataHealthPage.includes("<V2RuntimeDataHealth />") &&
      files.dataHealthClient.includes("loadActiveRuntimeDatasetSnapshot") &&
      files.dataHealthClient.includes("listRuntimeDatasetSnapshots") &&
      files.dataHealthClient.includes("mergeMode ?? \"unknown\"") &&
      !files.dataHealthPage.includes("DataQualityClient"),
  },
  {
    name: "V2ImportHistoryUsesSameBrandSnapshotHistory",
    pass:
      files.uploadHistoryPage.includes("<V2RuntimeImportHistory />") &&
      files.importHistoryClient.includes("listRuntimeDatasetSnapshots") &&
      files.importHistoryClient.includes("runtimeDatabaseNameForBrand(brand.id)"),
  },
  {
    name: "RuntimeSupportsExplicitFullBrandClear",
    pass:
      files.runtimePersistence.includes("export const clearAllRuntimeDatasetSnapshots") &&
      files.runtimePersistence.includes("transaction.objectStore(SNAPSHOTS_STORE).clear()") &&
      files.runtimePersistence.includes("transaction.objectStore(ACTIVE_POINTER_STORE).clear()"),
  },
  {
    name: "SaasV2PageHeaderDoesNotLinkBackToLegacyHome",
    pass: files.pageHeader.includes('href="/v2/home"') && !files.pageHeader.includes('href="/home"'),
  },
];

const failed = checks.filter((check) => !check.pass);
console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-upload-data-health-embedded-routing-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
