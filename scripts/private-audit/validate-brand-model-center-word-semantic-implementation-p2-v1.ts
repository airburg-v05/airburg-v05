import { execFileSync } from "node:child_process";
import fs from "node:fs";
import {
  aggregateSearchTotalKeywords,
  buildBrandModelMatch,
  centerWordFilter,
  hasBrandModelTokens,
  normalizeBrandModelFilter,
  safeCenterWordBoundaryMatch,
} from "../../lib/bi/brand-model-semantic";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-mapper";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import type { BIHomeDataSource } from "../../lib/bi/bi.data-source";
import type { BIDataPoint, UIState } from "../../lib/bi/bi.types";
import type { BISearchProductKeyword, BISearchTotalKeyword, BrandModelFilter } from "../../lib/bi/search-keyword.types";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const REPO_ROOT = process.cwd();
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const allowedCurrentTaskPatterns = [
  "lib/bi/search-keyword.types.ts",
  "lib/bi/brand-model-semantic.ts",
  "lib/bi/bi.home-mapper.ts",
  "components/visual-system/v1/brand-model-filter-popover.tsx",
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "scripts/private-audit/validate-brand-model-center-word-semantic-implementation-p2-v1.ts",
  "scripts/private-audit/validate-brand-model-semantic-layer-v1.ts",
];

const knownPriorBaselinePatterns = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "components/upload/v1/**",
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const strictlyForbiddenPatterns = [
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const sensitiveTokens = [
  "rawRows",
  "previewRows",
  "订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注明细",
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const read = (file: string): string => fs.readFileSync(file, "utf8");

const totalRow = (keyword: string, visitors: number, buyers: number, date = "2026-06-30"): BISearchTotalKeyword => ({
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
  date,
  keyword,
  visitors,
  buyers,
  gmv: null,
});

const productRow = (productId: string, keyword: string, visitors: number, buyers: number): BISearchProductKeyword => ({
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
  date: "2026-06-30",
  productId,
  keyword,
  visitors,
  buyers,
});

const point = (productId: string, gmv: number): BIDataPoint => ({
  platformCode: "tmall",
  platformName: "天猫",
  storeId: "tmall-default-store",
  storeName: "天猫默认店铺",
  seriesId: null,
  seriesName: null,
  productId,
  productName: productId,
  businessDate: "2026-06-30",
  metrics: {
    gmv,
    gsv: gmv,
    visitors: 100,
    paidBuyers: 10,
  },
});

const buildSource = (searchTotalKeywords: BISearchTotalKeyword[], searchProductKeywords: BISearchProductKeyword[]): BIHomeDataSource => ({
  mode: "empty",
  points: [point("p-a", 100), point("p-b", 200)],
  seriesPoints: [],
  seriesDefinitions: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "tmall-default-store",
      storeName: "天猫默认店铺",
      seriesId: "series-a",
      seriesName: "核心系列A",
      productIds: ["p-a"],
    },
  ],
  searchTotalKeywords,
  searchProductKeywords,
  targets: [],
  dataStatus: {
    mode: "empty",
    label: "ETL运行时数据",
    storeCount: 1,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  },
  selectedDate: "2026-06-30",
  safeWarnings: [],
  notices: [],
});

const runScopeChecks = () => {
  const files = changedFiles();
  const forbidden = files.filter((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)));
  const unexpected = files.filter(
    (file) =>
      !allowedCurrentTaskPatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );

  addCheck("noStrictlyForbiddenChanges", forbidden.length === 0, forbidden);
  addCheck("changedFilesWithinAllowedOrPriorBaseline", unexpected.length === 0, unexpected);
  addCheck("noPackageOrVercelChanges", !files.some((file) => ["package.json", "package-lock.json", "vercel.json"].includes(file)), files);
};

const runSemanticChecks = () => {
  const centerP1 = { id: "p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] };
  const centerP2 = { id: "p2", centerWord: "P2", aliases: ["P2"] };
  const p1Filter: BrandModelFilter = { brandWords: [], modelWords: [], centerWordGroups: [centerP1] };
  const legacyP1Filter: BrandModelFilter = { brandWords: [], modelWords: ["P1"] };
  const brandAndCenterFilter: BrandModelFilter = { brandWords: ["空气堡"], modelWords: [], centerWordGroups: [centerP1] };
  const p2Filter: BrandModelFilter = { brandWords: [], modelWords: [], centerWordGroups: [centerP2] };
  const rows = [
    totalRow("P1", 10, 1),
    totalRow("KJ60F-P1", 20, 2),
    totalRow("KJ60P1", 30, 3),
    totalRow("KJ500F-P1", 40, 4),
    totalRow("P2", 50, 5),
    totalRow("空气堡 P1", 60, 6),
  ];

  const p1Aggregate = aggregateSearchTotalKeywords(rows, p1Filter);
  const legacyAggregate = aggregateSearchTotalKeywords(rows, legacyP1Filter);
  const p2Aggregate = aggregateSearchTotalKeywords(rows, p2Filter);
  const unionDedupAggregate = aggregateSearchTotalKeywords([totalRow("空气堡 P1", 60, 6)], brandAndCenterFilter);

  addCheck("centerWordGroupsNormalize", (normalizeBrandModelFilter(p1Filter).centerWordGroups ?? [])[0]?.centerWord === "P1");
  addCheck("legacyModelWordsRemainCompatible", legacyAggregate.visitors === 120 && legacyAggregate.buyers === 12, legacyAggregate);
  addCheck("p1SafeAggregateIncludesExpectedAliases", p1Aggregate.visitors === 120 && p1Aggregate.buyers === 12, p1Aggregate);
  addCheck("p2DoesNotMatchP1", p2Aggregate.visitors === 50 && p2Aggregate.buyers === 5, p2Aggregate);
  addCheck("kj60fP1BelongsToP1", buildBrandModelMatch({ keyword: "KJ60F-P1" }, p1Filter).matches);
  addCheck("kj60P1BelongsToP1", buildBrandModelMatch({ keyword: "KJ60P1" }, p1Filter).matches);
  addCheck("kj500fP1ExcludedBySafeRule", !buildBrandModelMatch({ keyword: "KJ500F-P1" }, p1Filter).matches);
  addCheck("p2ExcludedByP1SafeRule", !buildBrandModelMatch({ keyword: "P2" }, p1Filter).matches);
  addCheck("brandAndCenterSameKeywordCountOnce", unionDedupAggregate.visitors === 60 && unionDedupAggregate.matchedRowCount === 1, unionDedupAggregate);
  addCheck("safeBoundaryHelperExcludesRiskTerm", !safeCenterWordBoundaryMatch("P1", "KJ500F-P1"));
  addCheck("hasCenterTokens", hasBrandModelTokens(p1Filter));
  addCheck("emptyCenterFilterHasNoTokens", !hasBrandModelTokens({ brandWords: [], modelWords: [], centerWordGroups: [] }));

  const centerOnly = centerWordFilter(centerP1);
  addCheck("centerWordFilterIsCenterOnly", centerOnly.brandWords.length === 0 && centerOnly.modelWords.length === 0 && centerOnly.centerWordGroups?.length === 1);
};

const runViewModelChecks = () => {
  const centerP1 = { id: "p1", centerWord: "P1", aliases: ["P1", "KJ60F-P1", "KJ60P1"] };
  const rows = [
    totalRow("P1", 10, 1, "2026-06-26"),
    totalRow("KJ60F-P1", 20, 2, "2026-06-27"),
    totalRow("KJ60P1", 30, 3, "2026-06-28"),
    totalRow("KJ500F-P1", 40, 4, "2026-06-29"),
    totalRow("P2", 50, 5, "2026-06-30"),
  ];
  const productRows = [
    productRow("p-a", "P1", 3, 1),
    productRow("p-a", "KJ60F-P1", 4, 1),
    productRow("p-b", "KJ500F-P1", 10, 2),
  ];
  const state: UIState = {
    ...createDefaultBIState(),
    selectedStores: ["tmall-default-store"],
    selectedMetric: "品牌词访客",
    brandModelFilter: { brandWords: ["空气堡"], modelWords: [], centerWordGroups: [centerP1] },
    timeRange: { mode: "day", startDate: "2026-06-26", endDate: "2026-06-30" },
  };
  const viewModel = buildHomeBIViewModel(buildSource(rows, productRows), state);
  const brandCard = viewModel.kpiCards.find((card) => card.title === "品牌词访客");
  const lineNames = viewModel.mtdChartModel.lines.map((line) => line.name);

  addCheck("homeBrandVisitorsUsesSafeCenterWords", brandCard?.rawValue === 60, brandCard);
  addCheck("homeBrandChartKeepsBrandTotalLine", lineNames.includes("品牌词合计"), lineNames);
  addCheck("homeBrandChartAddsCenterWordLine", lineNames.includes("中心词-P1"), lineNames);
  addCheck("homeChartDoesNotExposeRiskKeyword", !JSON.stringify(viewModel.mtdChartModel).includes("KJ500F-P1"));
  addCheck("homeNoInvalidOutput", !/NaN|Infinity|undefined/.test(JSON.stringify(viewModel)));
};

const runStaticChecks = () => {
  const semantic = read("lib/bi/brand-model-semantic.ts");
  const popover = read("components/visual-system/v1/brand-model-filter-popover.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("typeAddsCenterWordGroups", read("lib/bi/search-keyword.types.ts").includes("CenterWordGroup") && read("lib/bi/search-keyword.types.ts").includes("centerWordGroups"));
  addCheck("semanticUsesSafeBoundary", semantic.includes("safeCenterWordBoundaryMatch") && semantic.includes("KJ500F-P1"));
  addCheck("popoverUsesCenterWordLabel", popover.includes("品牌词 / 中心词设置") && popover.includes("中心词 / 型号词"));
  const debugContextBoundary =
    popover.includes("跨页面调试上下文") &&
    popover.includes("本浏览器") &&
    popover.includes("不会保存原始文件或敏感明细") &&
    popover.includes("不会写入目标草稿");
  addCheck("popoverKeepsSafeDebugContextBoundary", debugContextBoundary, {
    debugContextBoundary,
  });
  addCheck("popoverExplainsNoSimpleIncludes", popover.includes("安全边界 + 别名组") && popover.includes("KJ500F-P1"));
  addCheck("homeMapperAddsCenterWordLine", mapper.includes("中心词-") && mapper.includes("centerWordFilter"));
  addCheck("homeClearIncludesCenterGroups", home.includes("centerWordGroups: []"));
  addCheck("seriesClearIncludesCenterGroups", series.includes("centerWordGroups: []"));
  addCheck("productClearIncludesCenterGroups", product.includes("centerWordGroups: []"));
  addCheck("noStorageWritesInTouchedFiles", ![semantic, popover, mapper, home, series, product].some((source) =>
    /(?:window\.)?(?:localStorage|indexedDB)\s*\./.test(source) ||
    /(?:window\.)?(?:localStorage|indexedDB)\s*\[/.test(source),
  ));
  addCheck("noSensitiveTextInTouchedFiles", ![semantic, popover, mapper, home, series, product].some((source) => sensitiveTokens.some((token) => source.includes(token))));
};

const main = () => {
  runScopeChecks();
  runSemanticChecks();
  runViewModelChecks();
  runStaticChecks();

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(
    JSON.stringify(
      {
        status,
        taskId: "BRAND_MODEL_CENTER_WORD_SEMANTIC_IMPLEMENTATION_P2_V1",
        summary: {
          centerWordGroups: "enabled",
          matching: "user alias groups + safe token boundary",
          excludedRiskExample: "KJ500F-P1",
          storageWrites: false,
          etlChanged: false,
          deployment: false,
        },
        checks,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exit(1);
};

main();
