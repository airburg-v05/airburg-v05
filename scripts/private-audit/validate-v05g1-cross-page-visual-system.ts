import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE";
const F5_COMPLETION =
  "docs/project/task-completions/V0.5F_5_R1_FINAL_REGRESSION_AND_STAGE_FREEZE.json";

const REQUIRED_NAV = [
  { label: "经营首页", href: "/home" },
  { label: "数据中心", href: "/upload" },
  { label: "店铺看板", href: "/store-board" },
  { label: "系列看板", href: "/series-board" },
  { label: "宝贝看板", href: "/product-board" },
  { label: "目标管理", href: "/targets" },
  { label: "安全数据", href: "/raw-data" },
] as const;

const PAGE_FILES = [
  "app/login/page.tsx",
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "app/(workspace)/raw-data/page.tsx",
  "app/(workspace)/targets/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/series-board/manage/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/product-board/tracked/page.tsx",
] as const;

const OLD_VISIBLE_TERMS = [
  "天猫 · V1",
  "第一阶段",
  "AI 运营诊断",
  "AI 顾问",
  "天猫数据分析 V1",
] as const;

const INTERNAL_TERMS = [
  "active pointer",
  "readback",
  "V2 staging",
  "legacy adapter",
] as const;

interface CurrentTask {
  taskId: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface CompletionRecord {
  status: string;
  requiredCommands: string[];
  commandResults: Array<{ command: string; status: string }>;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const json = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const toPosix = (value: string): string => value.split(path.sep).join("/");

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedFile === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) {
    return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  }
  return false;
};

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const inOrder = (source: string, terms: readonly string[]): boolean => {
  let lastIndex = -1;
  return terms.every((term) => {
    const index = source.indexOf(term);
    if (index <= lastIndex) return false;
    lastIndex = index;
    return true;
  });
};

const requiredCommandsPass = (record: CompletionRecord): boolean =>
  record.status === "complete" &&
  record.requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );

const sourceContainsNone = (source: string, terms: readonly string[]): boolean =>
  !terms.some((term) => source.includes(term));

const main = () => {
  const currentTask = json<CurrentTask>("docs/project/current-task.json");
  const f5Completion = json<CompletionRecord>(F5_COMPLETION);
  const appShell = read("components/layout/app-shell.tsx");
  const globals = read("app/globals.css");
  const pageHeader = read("components/ui/page-header.tsx");
  const sectionCard = read("components/ui/section-card.tsx");
  const statusPill = read("components/ui/status-pill.tsx");
  const metricCard = read("components/ui/metric-card.tsx");
  const login = read("app/login/page.tsx");
  const changedFiles = changedFilesSince(currentTask.baselineCommit);

  const checks = {
    currentTaskIsG1: currentTask.taskId === TASK_ID,
    f5CompletionPass: requiredCommandsPass(f5Completion),
    allPageFilesExist: PAGE_FILES.every(exists),
    navLabelsInRequiredOrder: inOrder(appShell, REQUIRED_NAV.map((item) => item.label)),
    navHrefsPresent: REQUIRED_NAV.every((item) => appShell.includes(`href: "${item.href}"`)),
    dataCenterIsSecondNavItem:
      appShell.indexOf('label: "数据中心"') > appShell.indexOf('label: "经营首页"') &&
      appShell.indexOf('label: "数据中心"') < appShell.indexOf('label: "店铺看板"'),
    navHasAriaLabel: appShell.includes('aria-label="主导航"'),
    navHasAriaCurrent: appShell.includes("aria-current={active ? \"page\" : undefined}"),
    uploadSubroutesUseParentHighlight:
      appShell.includes("pathname.startsWith(`${item.href}/`)") &&
      appShell.includes('"/upload/history"') &&
      appShell.includes('"/upload/quality"'),
    seriesManagePageNamed: appShell.includes('"/series-board/manage": "系列管理"'),
    trackedProductPageNamed: appShell.includes('"/product-board/tracked": "重点商品管理"'),
    noNavStagePills: !appShell.includes("stage?:") && !appShell.includes("item.stage"),
    mainWidthIs1440: appShell.includes("max-w-[1440px]") && !appShell.includes("max-w-[1500px]"),
    sharedFocusStyleExists: globals.includes(":focus-visible") && globals.includes("outline-offset"),
    panelMinWidthSafe: globals.includes(".panel") && globals.includes("min-width: 0"),
    metricCardMinWidthSafe: globals.includes(".metric-card") && globals.includes("min-width: 0"),
    pageHeaderWrapSafe:
      pageHeader.includes("min-w-0") &&
      pageHeader.includes("break-words") &&
      pageHeader.includes("shrink-0"),
    sectionCardWrapSafe:
      sectionCard.includes("min-w-0") &&
      sectionCard.includes("break-words") &&
      sectionCard.includes("shrink-0"),
    statusPillUsesLockedTones:
      statusPill.includes("emerald") &&
      statusPill.includes("amber") &&
      statusPill.includes("rose") &&
      statusPill.includes("blue") &&
      statusPill.includes("slate"),
    metricCardUsesSharedClass: metricCard.includes("metric-card"),
    loginHasNoOldVisibleTerms: sourceContainsNone(login, OLD_VISIBLE_TERMS),
    appShellHasNoOldVisibleTerms: sourceContainsNone(appShell, OLD_VISIBLE_TERMS),
    appShellHasNoInternalTerms: sourceContainsNone(appShell, INTERNAL_TERMS),
    changedFilesWithinAllowed: changedFiles.every((file) =>
      currentTask.allowedModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    changedFilesAvoidForbidden: !changedFiles.some((file) =>
      currentTask.forbiddenModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
    ),
    noLibBusinessChanges: !changedFiles.some((file) => file.startsWith("lib/")),
    noTypesChanges: !changedFiles.some((file) => file.startsWith("types/")),
    noPackageChanges: !changedFiles.some((file) =>
      ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file),
    ),
    noFrozenDocsChanged: !changedFiles.some((file) =>
      file.startsWith("docs/releases/v0.5") || file.startsWith("docs/product/") ||
      file.startsWith("docs/architecture/") || file.startsWith("docs/decisions/"),
    ),
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    taskId: TASK_ID,
    failedChecks,
    navigationLabels: REQUIRED_NAV.map((item) => item.label),
    pageCount: PAGE_FILES.length,
    changedFiles,
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
