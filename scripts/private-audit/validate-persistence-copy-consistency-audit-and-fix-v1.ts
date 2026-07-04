import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(`${name} failed`);
};

const userFacingFiles = [
  "components/upload/v1/upload-page-v1-dashboard.tsx",
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "components/upload/history/v1/history-data-v1-dashboard.tsx",
  "components/upload/quality/v1/upload-quality-v1-dashboard.tsx",
  "components/visual-system/v1/brand-model-filter-popover.tsx",
  "components/visual-system/v1/visual-system.tsx",
];

const oldCopyPhrases = [
  "只在当前浏览器内存中进行",
  "不写入本地存储",
  "刷新页面后不会保留",
  "仅当前页面临时生效",
  "当前仅页面内临时生效",
  "仅当前页面临时维护",
  "历史页无法查看本次导入",
  "不写入 storage / IndexedDB",
  "数据不写入本地存储",
  "当前仅保存为跨页面调试上下文，不保存目标或原始数据",
];

const sensitiveDisplayTokens = [
  "rawRows",
  "previewRows",
  "warning 原文",
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

const gitStatus = (args: string[]) =>
  execFileSync("git", ["status", "--porcelain", "--", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

const gitDiffNames = (args: string[]) =>
  execFileSync("git", ["diff", "--name-only", "--", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

const runCopyChecks = () => {
  const sources = Object.fromEntries(userFacingFiles.map((file) => [file, read(file)]));
  const combined = Object.entries(sources)
    .map(([file, source]) => `\n--- ${file} ---\n${source}`)
    .join("\n");

  const stalePhrases = oldCopyPhrases.filter((phrase) => combined.includes(phrase));
  addCheck("noMisleadingPersistenceCopyInUserFacingFiles", stalePhrases.length === 0, stalePhrases);

  const upload = sources["components/upload/v1/upload-page-v1-dashboard.tsx"];
  addCheck(
    "uploadExplainsSafeAggregatedBrowserPersistence",
    upload.includes("本次上传会保存为本浏览器的安全聚合数据") &&
      upload.includes("刷新后可继续查看") &&
      upload.includes("不会保存原始 Excel / CSV") &&
      upload.includes("不同浏览器和不同用户之间不共享"),
  );
  addCheck(
    "uploadSuccessExplainsRawFilesNotSaved",
    upload.includes("已保存本次安全聚合数据") &&
      upload.includes("不会保存原始 Excel / CSV、文件名或明细行"),
  );

  const home = sources["components/home/home-bi-dashboard.tsx"];
  addCheck("homeDataStatusUsesBrowserSafeCopy", home.includes("本浏览器安全聚合数据"));
  addCheck(
    "platformTargetExplainsDisplayOnlyBoundary",
    home.includes("目标草稿保存在本浏览器") &&
      home.includes("不改变真实实际值") &&
      home.includes("目标、差值、完成率和进度条"),
  );

  const series = sources["components/series-board/v1/series-board-v1-dashboard.tsx"];
  addCheck(
    "seriesCopyExplainsDebugContextPersistence",
    series.includes("配置保存在本浏览器的跨页面调试上下文"),
  );
  addCheck(
    "seriesTargetExplainsDisplayOnlyBoundary",
    series.includes("目标草稿保存在本浏览器") && series.includes("不改变真实实际值"),
  );

  const product = sources["components/product-board/v1/product-board-v1-dashboard.tsx"];
  addCheck(
    "productCopyExplainsDebugContextPersistence",
    product.includes("宝贝清单保存在本浏览器的跨页面调试上下文"),
  );
  addCheck(
    "productTargetExplainsDisplayOnlyBoundary",
    product.includes("目标草稿保存在本浏览器") && product.includes("不改变真实实际值"),
  );

  const history = sources["components/upload/history/v1/history-data-v1-dashboard.tsx"];
  addCheck(
    "historyExplainsReadonlySafeSummary",
    history.includes("历史页展示本浏览器保存的安全导入摘要") &&
      history.includes("只读查看") &&
      history.includes("不展示原始文件、来源私密信息或敏感明细"),
  );

  const quality = sources["components/upload/quality/v1/upload-quality-v1-dashboard.tsx"];
  addCheck(
    "qualityExplainsReadonlySafeIssueSummary",
    quality.includes("数据质量页展示安全 issue code 和聚合摘要") &&
      quality.includes("只读查看") &&
      quality.includes("不展示原始行、来源私密信息或敏感明细"),
  );

  const brandPopover = sources["components/visual-system/v1/brand-model-filter-popover.tsx"];
  addCheck(
    "brandPopoverExplainsDebugContextPersistence",
    brandPopover.includes("品牌词和中心词配置会保存在本浏览器的跨页面调试上下文") &&
      brandPopover.includes("不会保存原始文件或敏感明细") &&
      brandPopover.includes("不会写入目标草稿"),
  );

  const sensitiveHits = sensitiveDisplayTokens.filter((token) => combined.includes(token));
  addCheck("noSensitiveDisplayTokensInTouchedCopy", sensitiveHits.length === 0, sensitiveHits);
};

const runScopeChecks = () => {
  const forbiddenStatus = gitStatus([
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".vercel",
    "lib/storage",
    "lib/tmall",
    "lib/v05",
    "private-samples",
  ]);
  addCheck("noForbiddenPackageStorageV05VercelChanges", forbiddenStatus.length === 0, forbiddenStatus);

  addCheck("noTrackedEtlChanges", gitDiffNames(["lib/etl"]).length === 0, gitDiffNames(["lib/etl"]));
  addCheck(
    "noTrackedBiCalculationChanges",
    gitDiffNames(["lib/bi/bi.home-mapper.ts", "lib/bi/brand-model-semantic.ts"]).length === 0,
    gitDiffNames(["lib/bi/bi.home-mapper.ts", "lib/bi/brand-model-semantic.ts"]),
  );
  addCheck("noPersistenceSchemaChanges", gitDiffNames(["lib/persistence"]).length === 0, gitDiffNames(["lib/persistence"]));
};

const main = () => {
  runCopyChecks();
  runScopeChecks();

  const failed = checks.filter((check) => !check.pass);
  const status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ status, checks }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exit(1);
}
