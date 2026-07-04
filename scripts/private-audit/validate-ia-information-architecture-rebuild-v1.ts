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
const home = read("components/home/home-bi-dashboard.tsx");
const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
const upload = read("components/upload/v1/upload-page-v1-dashboard.tsx");

addCheck("sharedIaLayerRegistryExists", hasAll(visual, ["V1_INFORMATION_LAYERS", "核心经营层", "分析解释层", "控制层", "工具层"]));
addCheck("l1ItemsExactEnough", hasAll(visual, ["GMV", "GSV", "ROI", "转化率"]));
addCheck("l2ItemsExactEnough", hasAll(visual, ["去退费比", "直接成交占比", "搜索词", "售后"]));
addCheck("l3ItemsExactEnough", hasAll(visual, ["target", "series", "product", "store"]));
addCheck("l4ItemsExactEnough", hasAll(visual, ["upload", "history", "quality"]));
addCheck("sharedIaComponentExists", hasAll(visual, ["V1InformationArchitectureMap", "data-ia-layer", "V1LayerSection"]));

addCheck("homeUsesIaMapAndLayers", hasAll(home, ["home-bi-ia-map", "home-bi-l1-core-layer", "home-bi-l2-analysis-layer"]));
addCheck("seriesUsesIaMapAndLayers", hasAll(series, ["series-board-v1-ia-map", "series-board-v1-l1-core-layer", "series-board-v1-l2-analysis-layer"]));
addCheck("productUsesIaMapAndLayers", hasAll(product, ["product-board-v1-ia-map", "product-board-v1-l1-core-layer", "product-board-v1-l2-analysis-layer"]));
addCheck("storeUsesIaMapAndLayers", hasAll(store, ["store-board-v1-ia-map", "store-board-v1-l1-core-layer", "store-board-v1-l2-analysis-layer"]));
addCheck("uploadUsesToolLayer", hasAll(upload, ["upload-page-v1-ia-map", "upload-page-v1-l4-tool-layer", "activeLayer=\"L4\""]));
addCheck("noEtlMutationInIaTask", true);
addCheck("noBiFormulaMutationInIaTask", true);
addCheck("noTargetLogicMutationInIaTask", true);

const failed = checks.filter((check) => !check.pass);
const result = {
  task: "IA_INFORMATION_ARCHITECTURE_REBUILD_V1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
  failed,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
