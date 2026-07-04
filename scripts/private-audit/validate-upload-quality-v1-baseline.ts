import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.UPLOAD_QUALITY_V1_AUDIT_BASE_URL ?? "http://localhost:3000";
const PAGE_URL = `${BASE_URL.replace(/\/$/, "")}/upload/quality?platform=tmall&storeId=tmall-default-store&batchId=quality-audit-batch`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-quality-v1-"));

interface ScreenshotRecord {
  route: string;
  viewport: string;
  screenshotPath: string;
  pageStatus: string;
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const navItems = ["经营首页", "系列看板", "店铺看板", "宝贝看板", "数据上传", "库存看板", "计划拆解", "历史数据", "AI顾问"];
const requiredTexts = [
  "数据质量",
  "退出",
  "平台筛选",
  "店铺筛选",
  "开始日期",
  "结束日期",
  "来源类型筛选",
  "问题类型筛选",
  "严重程度筛选",
  "搜索框",
  "高风险问题",
  "中风险问题",
  "低风险提示",
  "可进入看板状态",
  "质量问题列表",
  "质量影响矩阵",
  "去数据上传",
  "去历史数据",
];

const forbiddenUiActionTexts = ["删除", "回滚", "覆盖", "强制覆盖", "重新导入", "直接修复", "修改历史记录", "清空数据"];
const forbiddenPrivacyTexts = [
  "rawRows",
  "previewRows",
  "文件名历史",
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

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const parseChangedFiles = (): string[] => {
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

const allowedForThisTask = [
  "app/(workspace)/upload/quality/page.tsx",
  "components/upload/quality/**",
  "scripts/private-audit/validate-upload-quality-v1-baseline.ts",
];

const knownPriorBaselineChanges = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "components/home/**",
  "components/product-board/v1/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/upload/history/**",
  "components/upload/v1/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
  "scripts/private-audit/validate-core-pages-v1-local-acceptance.ts",
  "scripts/private-audit/validate-history-data-v1-baseline.ts",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-product-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-series-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-store-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
  "scripts/private-audit/validate-core-pages-v1-plus-upload-quality-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-p0-interaction-layout-regression.ts",
  "scripts/private-audit/validate-core-pages-v1-p1-chart-system-and-single-product-board.ts",
  "scripts/private-audit/validate-core-pages-v1-visual-system-unification.ts",
  "scripts/private-audit/validate-core-pages-v1-pixel-level-refinement.ts",
  "components/visual-system/v1/**",
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

const allAllowedChangePatterns = [...allowedForThisTask, ...knownPriorBaselineChanges];

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp200 = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(PAGE_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  readonly consoleErrors: string[] = [];
  readonly ignoredConsoleErrors: string[] = [];

  private constructor(private readonly socket: WebSocket) {}

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolve(client), { once: true });
      socket.addEventListener("error", (event) => reject(event), { once: true });
      socket.addEventListener("message", (event) => client.handleMessage(String(event.data)));
    });
  }

  close() {
    this.socket.close();
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as CdpMessage;
    if (message.id) {
      const callback = this.pending.get(message.id);
      if (!callback) return;
      this.pending.delete(message.id);
      if (message.error) callback.reject(message.error);
      else callback.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") this.consoleErrors.push("runtime_exception");
    if (message.method === "Runtime.consoleAPICalled") {
      const params = message.params as { type?: string } | undefined;
      if (params?.type === "error") this.consoleErrors.push("console_error");
    }
    if (message.method === "Log.entryAdded") {
      const params = message.params as { entry?: { level?: string; text?: string; url?: string } } | undefined;
      if (params?.entry?.level === "error") {
        const text = `${params.entry.url ?? "unknown"} ${params.entry.text ?? "log_error"}`;
        if (text.includes("/favicon.ico") && text.includes("404")) this.ignoredConsoleErrors.push(text);
        else this.consoleErrors.push(text);
      }
    }
  }

  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }
}

const launchChrome = async (port: number, profileDir: string): Promise<ChildProcessWithoutNullStreams> => {
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => undefined);
  chrome.stdout.on("data", () => undefined);
  for (let index = 0; index < 50; index += 1) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return chrome;
    } catch {
      await wait(100);
    }
  }
  chrome.kill("SIGTERM");
  throw new Error("Chrome remote debugging did not start");
};

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let index = 0; index < 50; index += 1) {
    const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await wait(100);
  }
  throw new Error("No Chrome page debugger URL found");
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(`Evaluation failed: ${expression}`);
  return result.result?.value as T;
};

const waitForSelector = async (client: CdpClient, selector: string): Promise<void> => {
  const escaped = JSON.stringify(selector);
  for (let index = 0; index < 80; index += 1) {
    const exists = await evaluate<boolean>(client, `Boolean(document.querySelector(${escaped}))`);
    if (exists) return;
    await wait(100);
  }
  throw new Error(`Missing selector: ${selector}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(300);
};

const capture = async (client: CdpClient, name: string, viewport: string, pageStatus: string): Promise<ScreenshotRecord> => {
  const horizontalOverflow = await evaluate<boolean>(
    client,
    `(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.ceil(root.scrollWidth) > Math.ceil(root.clientWidth) + 1 ||
        Math.ceil(body.scrollWidth) > Math.ceil(root.clientWidth) + 1;
    })()`,
  );
  const invalidText = await evaluate<boolean>(client, `/NaN|Infinity|undefined/.test(document.body.innerText)`);
  if (invalidText) throw new Error(`Invalid numeric text appeared during ${name}`);
  const forbiddenPrivacy = await evaluate<string[]>(
    client,
    `(() => {
      const text = document.body.innerText;
      const tokens = ${JSON.stringify(forbiddenPrivacyTexts)};
      return tokens.filter((token) => text.includes(token));
    })()`,
  );
  if (forbiddenPrivacy.length > 0) throw new Error(`Privacy token leaked during ${name}: ${forbiddenPrivacy.join(",")}`);
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: "/upload/quality",
    viewport,
    screenshotPath,
    pageStatus,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
  };
};

const clickByText = async (client: CdpClient, text: string) => {
  const escaped = JSON.stringify(text);
  await evaluate<void>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('button, a')).find((node) => node.textContent?.includes(${escaped}));
      if (!target) throw new Error('target not found');
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()`,
  );
  await wait(300);
};

const main = async () => {
  const pageSource = read("app/(workspace)/upload/quality/page.tsx");
  const componentSource = read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");
  const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)));
  const changedFilesWithinAllowed = changedFiles.every((file) =>
    allAllowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  const uploadQualityHttp200 = await waitForHttp200();
  const combinedSource = `${pageSource}\n${componentSource}\n${visualSystemSource}`;
  const forbiddenActionInSource = forbiddenUiActionTexts.filter((token) => combinedSource.includes(token));

  const staticChecks = {
    pageImportsV1Dashboard: pageSource.includes("UploadQualityV1Dashboard"),
    navItemsExist: navItems.every((item) => combinedSource.includes(item)),
    currentNavHighlight: componentSource.includes('activeLabel="数据上传"'),
    topBarExists: componentSource.includes('title="数据质量"') && visualSystemSource.includes("退出"),
    filtersExist: ["平台筛选", "店铺筛选", "来源类型筛选", "问题类型筛选", "严重程度筛选", "搜索框"].every((item) => componentSource.includes(item)),
    dateRangeExists: componentSource.includes("开始日期") && componentSource.includes("结束日期"),
    summaryCardsExist: ["高风险问题", "中风险问题", "低风险提示", "可进入看板状态"].every((item) => componentSource.includes(item)),
    issueListExists: componentSource.includes("质量问题列表"),
    impactMatrixExists: componentSource.includes("质量影响矩阵"),
    detailDrawerExists: componentSource.includes('data-testid="upload-quality-v1-detail-drawer"'),
    uploadEntryExists: componentSource.includes("/upload") && componentSource.includes("去数据上传"),
    historyEntryExists: componentSource.includes("/upload/history") && componentSource.includes("去历史数据"),
    noForbiddenActionInSource: forbiddenActionInSource.length === 0,
    readonlyBoundary: !componentSource.includes("localStorage.setItem") && !componentSource.includes("indexedDB.open") && !componentSource.includes("dataCenterReimportHref"),
    changedFilesWithinAllowed,
    noStrictlyForbiddenChanges: forbiddenChanged.length === 0,
    noNewDependencies: !changedFiles.includes("package.json") && !changedFiles.includes("package-lock.json"),
    uploadQualityHttp200,
  };

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-quality-chrome-profile-"));
  const port = 9650 + Math.floor(Math.random() * 300);
  let chrome: ChildProcessWithoutNullStreams | null = null;
  let client: CdpClient | null = null;
  const records: ScreenshotRecord[] = [];
  let capturedConsoleErrors: string[] = [];
  let ignoredConsoleErrors: string[] = [];

  try {
    chrome = await launchChrome(port, profileDir);
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "quality-v1-audit", loggedInAt: "2026-06-27T00:00:00.000Z" }));
        window.localStorage.setItem("airburg_tmall_analysis_v2", JSON.stringify({
          analysisTimestamp: "2026-06-27T00:00:00.000Z",
          dataQualityWarnings: ["safe_source_missing", "safe_metric_unavailable"],
          overview: { selectedDate: "2026-06-27", risks: { dataQualityWarningCount: 2 } }
        }));
      `,
    });
    await client.send("Page.navigate", { url: PAGE_URL });
    await waitForSelector(client, '[data-testid="upload-quality-v1-page"]');
    await wait(800);
    await setViewport(client, 1440, 1200);

    const bodyTextChecks = await evaluate<Record<string, boolean>>(
      client,
      `(() => {
        const text = document.body.innerText;
        return {
          requiredTextOk: ${JSON.stringify(requiredTexts)}.every((item) => text.includes(item)),
          navOk: ${JSON.stringify(navItems)}.every((item) => text.includes(item)),
          noForbiddenAction: ${JSON.stringify(forbiddenUiActionTexts)}.every((item) => !text.includes(item)),
          drawerMarker: Boolean(document.querySelector('[data-testid="upload-quality-v1-detail-drawer"]')),
          noInvalidText: !/NaN|Infinity|undefined/.test(text)
        };
      })()`,
    );

    records.push(await capture(client, "upload-quality-1440", "1440x1200", "base"));
    records.push(await capture(client, "upload-quality-filters", "1440x1200", "filters"));
    records.push(await capture(client, "upload-quality-issue-list", "1440x1200", "issue_list"));
    records.push(await capture(client, "upload-quality-impact-matrix", "1440x1200", "impact_matrix"));

    await clickByText(client, "查看详情");
    await waitForSelector(client, '[role="dialog"][aria-label="质量问题详情"]');
    records.push(await capture(client, "upload-quality-detail-drawer", "1440x1200", "detail_drawer"));
    await clickByText(client, "返回关闭");

    await setViewport(client, 390, 1000);
    records.push(await capture(client, "upload-quality-390", "390x1000", "mobile"));

    Object.entries(bodyTextChecks).forEach(([key, value]) => {
      if (!value) throw new Error(`Runtime body check failed: ${key}`);
    });
  } finally {
    if (client) {
      capturedConsoleErrors = [...client.consoleErrors];
      ignoredConsoleErrors = [...client.ignoredConsoleErrors];
    }
    client?.close();
    if (chrome) {
      chrome.kill("SIGTERM");
      await wait(500);
    }
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  const checks = {
    ...staticChecks,
    screenshotCount: records.length === 6,
    desktopNoOverflow: records.filter((record) => record.viewport.startsWith("1440")).every((record) => !record.horizontalOverflow),
    mobile390NoOverflow: records.find((record) => record.viewport.startsWith("390"))?.horizontalOverflow === false,
    consoleErrorZero: records.every((record) => record.consoleErrorsCount === 0),
    pageNoInvalidText: true,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        route: "/upload/quality",
        createdAt: new Date().toISOString(),
        screenshotDir,
        screenshots: records,
        consoleErrors: capturedConsoleErrors,
        ignoredConsoleErrors,
        checks,
        forbiddenChanged,
        forbiddenActionInSource,
      },
      null,
      2,
    ),
    "utf8",
  );

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    screenshotManifest: manifestPath,
    screenshots: records,
    consoleErrors: capturedConsoleErrors,
    ignoredConsoleErrors,
    checks,
    forbiddenChanged,
    forbiddenActionInSource,
  };
  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
