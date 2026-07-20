import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const files = {
  uploadPage: read("app/(workspace-v2)/v2/upload/page.tsx"),
  uploadDashboard: read("components/upload/v1/upload-page-v1-dashboard.tsx"),
  dataHealthPage: read("app/(workspace-v2)/v2/data-health/page.tsx"),
  dataHealthClient: read("components/upload/data-quality/data-quality-client.tsx"),
  uploadHistoryPage: read("app/(workspace-v2)/v2/upload/history/page.tsx"),
  importHistoryClient: read("components/upload/import-history/import-history-client.tsx"),
  dataCenterContext: read("lib/v05/data-center/context.ts"),
  pageHeader: read("components/saas-v2/layout/saas-v2-page-header.tsx"),
};

const checks = [
  {
    name: "V2UploadPageUsesEmbeddedDashboardMode",
    pass: files.uploadPage.includes('<UploadPageV1Dashboard layoutMode="embedded" routeVariant="v2" />'),
  },
  {
    name: "UploadDashboardSupportsEmbeddedLayoutAndRouteVariant",
    pass:
      files.uploadDashboard.includes('layoutMode?: "legacy" | "embedded"') &&
      files.uploadDashboard.includes("routeVariant?: DataCenterRouteVariant"),
  },
  {
    name: "UploadDashboardEmbeddedModeDoesNotRenderLegacyChromeOrFixedOverlay",
    pass:
      files.uploadDashboard.includes('{isEmbedded ? null : <Sidebar />}') &&
      files.uploadDashboard.includes('{isEmbedded ? null : <TopBar />}') &&
      files.uploadDashboard.includes('? "min-w-0 text-slate-950"') &&
      files.uploadDashboard.includes(': "fixed inset-0 z-50 flex overflow-hidden bg-[#F5F7FB] text-slate-950"'),
  },
  {
    name: "UploadDashboardResultLinksCanStayInsideV2",
    pass:
      files.uploadDashboard.includes('const homeHref = routeVariant === "v2" ? "/v2/home" : "/home";') &&
      files.uploadDashboard.includes('const historyHref = dataCenterHref("history", null, { routeVariant });'),
  },
  {
    name: "DataCenterContextDefinesV2Paths",
    pass:
      files.dataCenterContext.includes('export type DataCenterRouteVariant = "legacy" | "v2";') &&
      files.dataCenterContext.includes('upload: "/v2/upload"') &&
      files.dataCenterContext.includes('history: "/v2/upload/history"') &&
      files.dataCenterContext.includes('quality: "/v2/data-health"'),
  },
  {
    name: "V2DataHealthPageUsesV2RouteVariant",
    pass: files.dataHealthPage.includes('<DataQualityClient routeVariant="v2" />'),
  },
  {
    name: "DataQualityClientThreadsRouteVariantThroughUploadHistoryAndReimportLinks",
    pass:
      files.dataHealthClient.includes('routeVariant?: DataCenterRouteVariant;') &&
      files.dataHealthClient.includes('dataCenterHref("upload", dataCenterContext, { routeVariant })') &&
      files.dataHealthClient.includes('dataCenterHref("history", dataCenterContext, { routeVariant })') &&
      files.dataHealthClient.includes('dataCenterReimportHref({') &&
      files.dataHealthClient.includes('}, { routeVariant })'),
  },
  {
    name: "V2UploadHistoryRouteExistsAndUsesV2Variant",
    pass: files.uploadHistoryPage.includes('<ImportHistoryClient routeVariant="v2" />'),
  },
  {
    name: "ImportHistoryClientThreadsRouteVariantThroughCrossPageLinks",
    pass:
      files.importHistoryClient.includes('routeVariant?: DataCenterRouteVariant;') &&
      files.importHistoryClient.includes('actionHref={dataCenterHref("upload", null, { routeVariant })}') &&
      files.importHistoryClient.includes('}, { routeVariant })'),
  },
  {
    name: "SaasV2PageHeaderDoesNotLinkBackToLegacyHome",
    pass:
      files.pageHeader.includes('href="/v2/home"') &&
      !files.pageHeader.includes('href="/home"'),
  },
];

const failed = checks.filter((check) => !check.pass);

console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-upload-data-health-embedded-routing-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
