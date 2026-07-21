import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const files = {
  routeMapping: read("lib/v2/route-mapping.ts"),
  series: read("components/saas-v2/series/v2-series-board-dashboard.tsx"),
  store: read("components/saas-v2/store/v2-store-board-dashboard.tsx"),
  product: read("components/saas-v2/product/v2-product-board-dashboard.tsx"),
  homeAdapter: read("lib/v2/home/v2-home-adapter.ts"),
};

const checks = [
  {
    name: "RouteMappingDefinesExactUploadQualityAndHistoryMappings",
    pass:
      files.routeMapping.includes('"/upload/history": "/v2/upload/history"') &&
      files.routeMapping.includes('"/upload/quality": "/v2/data-health"') &&
      files.routeMapping.includes('"/upload": "/v2/upload"'),
  },
  {
    name: "RouteMappingKeepsManagementInsideV2Workspace",
    pass:
      files.routeMapping.includes('"/series-board/manage": "/v2/series-board"') &&
      files.routeMapping.includes('"/product-board/tracked": "/v2/product-board"'),
  },
  {
    name: "SeriesBoardUsesExplicitV2RouteMapper",
    pass:
      files.series.includes('mapHrefToAuthorizedV2Route') &&
      files.series.includes('管理页暂未开放') &&
      !files.series.includes('href={viewModel.storeContext.manageSeriesHref}') &&
      !files.series.includes('href={viewModel.storeContext.storeBoardHref}') &&
      !files.series.includes('href={row.productBoardHref}') &&
      !files.series.includes('href={row.fallbackHref}'),
  },
  {
    name: "StoreBoardNoLongerUsesRegexMapperAndNoUploadQualityMisroute",
    pass:
      !files.store.includes('const toV2Href =') &&
      files.store.includes('mapHrefToAuthorizedV2Route') &&
      !files.store.includes('/v2/upload/quality') &&
      files.store.includes('mappedQualityHref?.sourceHref.startsWith("/upload/quality") ? "查看数据健康" : "前往上传"'),
  },
  {
    name: "ProductBoardNoLongerUsesRegexMapperAndBlocksMissingManageRoute",
    pass:
      !files.product.includes('const toV2Href =') &&
      files.product.includes('mapHrefToAuthorizedV2Route') &&
      files.product.includes('管理页暂未开放') &&
      !files.product.includes('/v2/product-board/tracked') &&
      files.product.includes('mappedQualityHref?.sourceHref.startsWith("/upload/quality") ? "查看数据健康" : "前往上传"'),
  },
  {
    name: "V2HomeEmptyStateUsesV2UploadHref",
    pass:
      files.homeAdapter.includes('uploadHref: "/v2/upload"') &&
      !files.homeAdapter.includes('uploadHref: "/upload"'),
  },
];

const failed = checks.filter((check) => !check.pass);

console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-board-route-mapping-and-home-empty-cta-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
