import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));

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
  const currentTask = read("docs/project/current-task.json");
  const packageJson = read("package.json");
  const compactSummary = read("components/target-context/compact-target-summary.tsx");
  const targetContext = read("lib/v05/target-context/index.ts");
  const homeMainTrend = read("components/home/v05/home-main-trend.tsx");
  const homeContextBar = read("components/home/v05/home-context-bar.tsx");
  const homeTargets = read("lib/v05/home-command-center/targets.ts");
  const homeBuild = read("lib/v05/home-command-center/build-view-model.ts");
  const storeComponent = read("components/store-board/v05/store-board-command-center.tsx");
  const seriesComponent = read("components/series-board/v05/series-board-command-center.tsx");
  const productComponent = read("components/product-board/v05/product-board-command-center.tsx");
  const storeTargets = read("lib/v05/store-board/targets.ts");
  const seriesTargets = read("lib/v05/series-board/targets.ts");
  const productTargets = read("lib/v05/product-board/targets.ts");
  const storePage = read("app/(workspace)/store-board/page.tsx");
  const seriesPage = read("app/(workspace)/series-board/page.tsx");
  const productPage = read("app/(workspace)/product-board/page.tsx");
  const homePage = read("app/(workspace)/home/page.tsx");

  const touchedSources = [
    compactSummary,
    targetContext,
    homeMainTrend,
    homeContextBar,
    homeTargets,
    homeBuild,
    storeComponent,
    seriesComponent,
    productComponent,
    storeTargets,
    seriesTargets,
    productTargets,
    storePage,
    seriesPage,
    productPage,
    homePage,
  ].join("\n");

  const checks: Check[] = [
    { name: "target-context helper exists", pass: exists("lib/v05/target-context/index.ts") },
    { name: "compact target summary exists", pass: exists("components/target-context/compact-target-summary.tsx") },
    { name: "compact summary shows actual target gap progress allocation", pass: ["实际", "目标", "差额", "完成率", "分配状态"].every((text) => compactSummary.includes(text)) },
    { name: "compact summary always has target settings link", pass: compactSummary.includes("settingsHref") && compactSummary.includes("目标设置") },
    { name: "home uses company compact summary", pass: homeMainTrend.includes("公司目标进度") && homeMainTrend.includes("/targets?scope=company") },
    { name: "home no longer says company or store targets", pass: !homeMainTrend.includes("公司或店铺目标") },
    { name: "home build passes company scope", pass: homeBuild.includes('targetScope: "company"') },
    { name: "home context target link has company scope", pass: homeContextBar.includes("/targets?scope=company") },
    { name: "store summary uses current store scope", pass: storeComponent.includes('scope: "store"') && storeComponent.includes("platformCode: context.platformCode") && storeComponent.includes("storeId: context.storeId") },
    { name: "series summary uses current series scope", pass: seriesComponent.includes('scope: "series"') && seriesComponent.includes("seriesId: viewModel.selectedSeriesId") },
    { name: "product summary uses current product scope", pass: productComponent.includes('scope: "product"') && productComponent.includes("productId: identity.productId") },
    { name: "store target builder still filters store scope", pass: storeTargets.includes('target.scope === "store"') && storeTargets.includes("target.platformCode === platformCode && target.storeId === storeId") },
    { name: "series target builder still filters series scope", pass: seriesTargets.includes('target.scope === "series"') && seriesTargets.includes("target.seriesId === seriesId") },
    { name: "product target builder still filters product scope", pass: productTargets.includes('target.scope === "product"') && productTargets.includes("target.productId === productId") },
    { name: "week custom targets not prorated", pass: [homeTargets, storeTargets, seriesTargets, productTargets].every((source) => source.includes("return false;")) },
    { name: "allocation helper uses F2 summary", pass: targetContext.includes("buildTargetAllocationSummary") && targetContext.includes("getTargetMetricAllocationMode") },
    { name: "product targets marked terminal", pass: targetContext.includes('target.scope === "product"') && targetContext.includes("末级目标") },
    { name: "no long target diagnostics restored in v05 pages", pass: ![homeMainTrend, storeComponent, seriesComponent, productComponent].some((source) => source.includes("目标诊断")) },
    { name: "no direct persistence or indexedDB in pages", pass: ![homePage, storePage, seriesPage, productPage].some((source) => /indexedDB\.open|prepareDataset|activateDataset|localStorage\.setItem/.test(source)) },
    { name: "no auto allocation wording", pass: !/自动分配|自动生成目标|AI/.test(touchedSources) },
    { name: "no sensitive field names", pass: !forbiddenSensitiveText.some((keyword) => touchedSources.includes(keyword)) },
    { name: "no invalid number literal output", pass: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(touchedSources) && !/\"(NaN|Infinity|undefined)\"/.test(touchedSources) },
    { name: "current task is F3", pass: currentTask.includes("V0.5F_3_TARGET_CONTEXT_AND_BOARD_INTEGRATION") },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05f3-target-context-board-integration-ui",
    failedChecks,
    safeUiEvidence: {
      compactSummary: true,
      homeScope: "company",
      storeScope: "store",
      seriesScope: "series",
      productScope: "product",
      contextLinks: true,
    },
    checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
  }, null, 2));

  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
