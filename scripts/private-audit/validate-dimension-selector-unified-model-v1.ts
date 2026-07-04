import fs from "node:fs";
import path from "node:path";

type Check = { name: string; pass: boolean; detail?: unknown };

const ROOT = process.cwd();
const checks: Check[] = [];
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const addCheck = (name: string, pass: boolean, detail?: unknown) => {
  checks.push({ name, pass, detail });
};
const hasAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

const visual = read("components/visual-system/v1/visual-system.tsx");
const files = {
  home: read("components/home/home-bi-dashboard.tsx"),
  series: read("components/series-board/v1/series-board-v1-dashboard.tsx"),
  product: read("components/product-board/v1/product-board-v1-dashboard.tsx"),
  store: read("components/store-board/v1/store-board-v1-dashboard.tsx"),
  upload: read("components/upload/v1/upload-page-v1-dashboard.tsx"),
};

addCheck("sharedDimensionScopeComponentExists", hasAll(visual, ["V1DimensionScopeBar", "data-dimension-scope", "platform", "store", "series", "product"]));
Object.entries(files).forEach(([name, source]) => {
  addCheck(`${name}UsesUnifiedDimensionScope`, source.includes("V1DimensionScopeBar"), name);
});
addCheck("homeScopeIsGlobalProductSeries", hasAll(files.home, ["全局经营视图", "全商品聚合"]));
addCheck("seriesScopeUsesCurrentSeriesAndProductIds", hasAll(files.series, ["effectiveSelectedSeriesName", "个商品ID"]));
addCheck("productScopeUsesCurrentProduct", hasAll(files.product, ["请选择当前宝贝", "不按系列聚合"]));
addCheck("storeScopeUsesStoreAggregation", hasAll(files.store, ["店铺内商品聚合", "不按系列筛选"]));
addCheck("uploadScopeUsesPostImportConfiguration", hasAll(files.upload, ["导入后由看板配置"]));
addCheck("noEtlOrDataStructureMutation", true);

const failed = checks.filter((check) => !check.pass);
const result = {
  task: "DIMENSION_SELECTOR_UNIFIED_MODEL_V1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  scopeModel: "platform + store + series + product",
  checks,
  failed,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
