import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));

const component = () => read("components/focus-management/focus-management-client.tsx");
const storeBoard = () => read("components/store-board/v05/store-board-command-center.tsx");

const forbiddenSensitiveText = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "买家退款说明",
  "商家备注",
  "物流单号",
  "物流信息",
];

const main = () => {
  const focusSource = component();
  const storeBoardSource = storeBoard();
  const focusRuntime = read("lib/v05/focus-management/browser-runtime.ts");
  const datasetUpdate = read("lib/v05/focus-management/dataset-update.ts");
  const seriesService = read("lib/v05/focus-management/series-service.ts");
  const trackedService = read("lib/v05/focus-management/tracked-product-service.ts");
  const productCandidates = read("lib/v05/focus-management/product-candidates.ts");
  const packageJson = read("package.json");

  const checks: Check[] = [
    { name: "/series-board/manage route exists", pass: exists("app/(workspace)/series-board/manage/page.tsx") },
    { name: "/product-board/tracked route exists", pass: exists("app/(workspace)/product-board/tracked/page.tsx") },
    { name: "Store Board manage series entry exists", pass: storeBoardSource.includes("/series-board/manage?") && storeBoardSource.includes("管理系列") },
    { name: "Store Board manage tracked product entry exists", pass: storeBoardSource.includes("/product-board/tracked?") && storeBoardSource.includes("管理重点商品") },
    { name: "platform/store context present", pass: focusSource.includes("当前店铺上下文") && focusSource.includes("platform") && focusSource.includes("storeId") },
    { name: "invalid_store safe state present", pass: read("lib/v05/focus-management/context.ts").includes("invalid_store") && focusSource.includes("当前店铺不可用") },
    { name: "series list exists", pass: focusSource.includes("系列列表") && focusSource.includes("SeriesList") },
    { name: "tracked product list exists", pass: focusSource.includes("重点商品列表") && focusSource.includes("TrackedProductList") },
    { name: "drawer exists", pass: focusSource.includes("role=\"dialog\"") && focusSource.includes("aria-modal=\"true\"") },
    { name: "product selector limits candidates", pass: productCandidates.includes("limit = 50") && focusSource.includes("最多显示 50 条候选") },
    { name: "candidate uses current store union", pass: productCandidates.includes("businessProductFacts") && productCandidates.includes("adProductFacts") && productCandidates.includes("仅推广数据") },
    { name: "form labels exist", pass: focusSource.includes("系列名称") && focusSource.includes("搜索商品名称或商品 ID") && focusSource.includes("展示名称") },
    { name: "buttons declare type", pass: !/<button(?![^>]*type=)/.test(focusSource) && !/<button(?![^>]*type=)/.test(storeBoardSource) },
    { name: "save before write boundary copy", pass: focusSource.includes("保存前不会写入本地数据") },
    { name: "Escape closes drawer", pass: focusSource.includes("event.key === \"Escape\"") },
    { name: "focus return exists", pass: focusSource.includes("lastTriggerRef.current?.focus()") },
    { name: "390px drawer full width", pass: focusSource.includes("w-full") && focusSource.includes("sm:max-w-[640px]") },
    { name: "whole-page overflow avoided", pass: focusSource.includes("overflow-x-auto") && focusSource.includes("max-w-full") },
    { name: "page components do not directly indexedDB.open", pass: !focusSource.includes("indexedDB.open") && !storeBoardSource.includes("indexedDB.open") },
    { name: "page components do not use localStorage", pass: !focusSource.includes("localStorage") && !storeBoardSource.includes("localStorage") },
    { name: "runtime uses public persistence store", pass: focusRuntime.includes("IndexedDbV2PersistenceStore.open") && !focusRuntime.includes("indexedDB.open") },
    { name: "atomic prepare/readback/activate used", pass: datasetUpdate.includes("prepareDataset") && datasetUpdate.includes("readBackAndValidateV2Dataset") && datasetUpdate.includes("activatePreparedV2Dataset") },
    { name: "series duplicate and cross-store rules present", pass: seriesService.includes("series_name_duplicate") && seriesService.includes("series_product_cross_store") },
    { name: "tracked duplicate and cross-store rules present", pass: trackedService.includes("tracked_product_duplicate") && trackedService.includes("tracked_product_cross_store") },
    { name: "no sensitive field names in new UI/runtime", pass: !forbiddenSensitiveText.some((keyword) => `${focusSource}\n${focusRuntime}\n${seriesService}\n${trackedService}`.includes(keyword)) },
    { name: "no NaN Infinity undefined text in UI", pass: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(focusSource) && !/\"(NaN|Infinity|undefined)\"/.test(focusSource) },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e1-series-tracked-product-ui",
    failedChecks,
    routes: ["/series-board/manage", "/product-board/tracked"],
    storeBoardEntries: ["管理系列", "管理重点商品"],
    checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
