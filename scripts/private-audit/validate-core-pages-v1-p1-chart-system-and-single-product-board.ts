import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.CORE_PAGES_V1_P1_AUDIT_BASE_URL ?? "http://localhost:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-p1-"));

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface ScreenshotRecord {
  label: string;
  route: string;
  viewport: string;
  screenshotPath: string;
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
}

const pages = [
  { route: "/home", root: "[data-testid='home-bi-dashboard']", chart: "[data-testid='home-bi-chart-panel']" },
  { route: "/series-board", root: "[data-testid='series-board-v1-dashboard']", chart: "[data-testid='series-board-v1-chart-panel']" },
  { route: "/store-board", root: "[data-testid='store-board-v1-dashboard']", chart: "[data-testid='store-board-v1-chart-panel']" },
  { route: "/product-board", root: "[data-testid='product-board-v1-dashboard']", chart: "[data-testid='product-board-v1-chart-panel']" },
];

const forbiddenChangePatterns = [
  "app/(workspace)/upload/**",
  "components/upload/**",
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

const allowedChangePatterns = [
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
  "components/visual-system/v1/**",
  "lib/bi/**",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-series-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-store-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-product-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
  "scripts/private-audit/validate-history-data-v1-baseline.ts",
  "scripts/private-audit/validate-upload-quality-v1-baseline.ts",
  "scripts/private-audit/validate-core-pages-v1-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-plus-upload-quality-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-visual-system-unification.ts",
  "scripts/private-audit/validate-core-pages-v1-pixel-level-refinement.ts",
  "scripts/private-audit/validate-core-pages-v1-p0-interaction-layout-regression.ts",
  "scripts/private-audit/validate-core-pages-v1-p1-chart-system-and-single-product-board.ts",
];

const sensitiveTokens = [
  "NaN",
  "Infinity",
  "undefined",
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
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

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

const waitForHttp200 = async (route: string): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}${route}`, { signal: controller.signal });
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
    const pagesResult = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pagesResult.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
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
  await wait(250);
};

const capture = async (client: CdpClient, label: string, route: string, viewport: string): Promise<ScreenshotRecord> => {
  const horizontalOverflow = await evaluate<boolean>(
    client,
    `(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.ceil(root.scrollWidth) > Math.ceil(root.clientWidth) + 1 ||
        Math.ceil(body.scrollWidth) > Math.ceil(root.clientWidth) + 1;
    })()`,
  );
  const pageTextUnsafe = await evaluate<boolean>(
    client,
    `(() => ${JSON.stringify(sensitiveTokens)}.some((token) => document.body.innerText.includes(token)))()`,
  );
  if (pageTextUnsafe) throw new Error(`Sensitive or invalid text appeared on ${route}`);
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotPath = path.join(screenshotDir, `${label}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return { label, route, viewport, screenshotPath, consoleErrorsCount: client.consoleErrors.length, horizontalOverflow };
};

const click = async (client: CdpClient, selector: string) => {
  await evaluate<void>(
    client,
    `(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) throw new Error("missing click selector");
      node.click();
    })()`,
  );
  await wait(350);
};

const sourceChecks = async () => {
  const chart = read("components/visual-system/v1/bi-chart.tsx");
  const chartUtils = read("components/visual-system/v1/chart-utils.ts");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter(
    (file) =>
      forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  const unexpectedChanged = changedFiles.filter((file) => !allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)));
  const checks = {
    sharedChartExists:
      chart.includes("BIChartCard") &&
      chart.includes("BITrendChart") &&
      chart.includes("BIChartLegend") &&
      chart.includes("BIChartEmptyState"),
    allPagesUseSharedChart: [home, series, store, product].every((source) => source.includes("BIChartCard")),
    noScatteredSimpleChartPanel: [home, series, store, product].every((source) => !source.includes("function ChartPanel")),
    plotAreaAndGrid: chart.includes("BITrendChart") && chart.includes("gridCount = 5") && chart.includes("<rect") && chart.includes("yTicks"),
    yAxisTicks: chart.includes("formatAxisValue") && chart.includes("textAnchor=\"end\""),
    emptyState: chart.includes("data-testid=\"bi-chart-empty-state\"") && chart.includes("当前指标暂无可展示趋势"),
    singlePointHandling: chart.includes("bi-chart-single-point-label") && chart.includes("单日数据"),
    legendCollapse: chart.includes("hiddenCount") && chart.includes("+{hiddenCount}"),
    nullNotZero: chartUtils.includes("finiteChartValues") && chartUtils.includes("value === null") && chart.includes("含缺失点"),
    homeStillSingleChart: home.includes('testId="home-bi-chart-panel"') && home.includes("home-bi-chart-mode-switch"),
    returnRateStillThreeLines: read("lib/bi/bi.home-mapper.ts").includes("return-shipped") && read("lib/bi/bi.home-mapper.ts").includes("return-signed"),
    seriesStillHasTop: series.includes("系列内商品贡献 TOP"),
    storeStillHasTop: store.includes("店铺内商品贡献 TOP"),
    productSelector: product.includes("选择宝贝") && product.includes("product-board-v1-product-selector"),
    productCurrentInfo: product.includes("product-board-v1-current-product-info"),
    productSingleChart: product.includes("单宝贝趋势") && product.includes("maxLegendItems={3}"),
    productSingleFunnel: product.includes("SingleProductFunnel") && product.includes("单品流量漏斗"),
    productNoTopTitle: !product.includes("单品流量漏斗 TOP"),
    productNoMultiRankFunnel: !product.includes("#{item.rank}") && !product.includes("selectedProductKeys"),
    noForbiddenChanges: forbiddenChanged.length === 0,
    noUnexpectedChanges: unexpectedChanged.length === 0,
    noNewDependencies: !git(["diff", "--name-only", "--", "package.json", "package-lock.json"]),
  };
  return { checks, changedFiles, forbiddenChanged, unexpectedChanged };
};

const runBrowserAudit = async () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-p1-profile-"));
  const port = 9850 + Math.floor(Math.random() * 200);
  let chrome: ChildProcessWithoutNullStreams | null = null;
  let client: CdpClient | null = null;
  const screenshots: ScreenshotRecord[] = [];
  const runtimeChecks: Record<string, boolean> = {};

  try {
    chrome = await launchChrome(port, profileDir);
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "p1-chart-audit", loggedInAt: "2026-06-28T00:00:00.000Z" }));`,
    });

    for (const page of pages) {
      await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${page.route}` });
      await waitForSelector(client, page.root);
      await waitForSelector(client, page.chart);
      await wait(500);
      await setViewport(client, 1440, 1100);
      screenshots.push(await capture(client, `${page.route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-1440`, page.route, "1440x1100"));
      runtimeChecks[`${page.route}-chart-has-grid`] = await evaluate<boolean>(
        client,
        `document.querySelectorAll(${JSON.stringify(`${page.chart} svg line`)}).length >= 5`,
      );
      runtimeChecks[`${page.route}-has-legend`] = await evaluate<boolean>(
        client,
        `Boolean(document.querySelector(${JSON.stringify(`${page.chart} [data-testid='bi-chart-legend']`)}))`,
      );
      await setViewport(client, 390, 1000);
      screenshots.push(await capture(client, `${page.route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-390`, page.route, "390x1000"));
    }

    await setViewport(client, 1440, 1100);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-chart-panel']");
    screenshots.push(await capture(client, "home-chart-mtd", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-chart-mode-switch'] button:nth-child(2)");
    screenshots.push(await capture(client, "home-chart-dly", "/home", "1440x1100"));

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/series-board` });
    await waitForSelector(client, "[data-testid='series-board-v1-chart-panel']");
    screenshots.push(await capture(client, "series-board-chart", "/series-board", "1440x1100"));

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/store-board` });
    await waitForSelector(client, "[data-testid='store-board-v1-chart-panel']");
    screenshots.push(await capture(client, "store-board-chart", "/store-board", "1440x1100"));

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/product-board` });
    await waitForSelector(client, "[data-testid='product-board-v1-product-selector']");
    await waitForSelector(client, "[data-testid='product-board-v1-current-product-info']");
    await waitForSelector(client, "[data-testid='product-board-v1-chart-panel']");
    await waitForSelector(client, "[data-testid='product-board-v1-single-product-funnel'], [data-testid='product-board-v1-product-top']");
    screenshots.push(await capture(client, "product-board-selector", "/product-board", "1440x1100"));
    screenshots.push(await capture(client, "product-board-current-product-info", "/product-board", "1440x1100"));
    screenshots.push(await capture(client, "product-board-single-product-chart", "/product-board", "1440x1100"));
    screenshots.push(await capture(client, "product-board-single-product-funnel", "/product-board", "1440x1100"));

    runtimeChecks.productLegendAtMostThree = await evaluate<boolean>(
      client,
      `document.querySelectorAll("[data-testid='product-board-v1-chart-panel'] [data-testid='bi-chart-legend'] span").length <= 3`,
    );
    runtimeChecks.productNoMultiRankMain = await evaluate<boolean>(
      client,
      `!/#[1-4]/.test(document.querySelector("[data-testid='product-board-v1-product-top']")?.textContent ?? "")`,
    );
    runtimeChecks.productSelectorExists = await evaluate<boolean>(
      client,
      `Boolean(document.querySelector("[data-testid='product-board-v1-product-selector']"))`,
    );
    const switchedProduct = await evaluate<boolean>(
      client,
      `(() => {
        const select = document.querySelector("[data-testid='product-board-v1-product-selector']");
        if (!select || select.options.length < 2) return false;
        select.selectedIndex = 1;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
    );
    await wait(600);
    screenshots.push(await capture(client, "product-board-after-product-switch", "/product-board", "1440x1100"));
    runtimeChecks.productSwitchSafe = switchedProduct
      ? await evaluate<boolean>(
          client,
          `Boolean(document.querySelector("[data-testid='product-board-v1-current-product-info']")) &&
            document.querySelectorAll("[data-testid='product-board-v1-chart-panel'] [data-testid='bi-chart-legend'] span").length <= 3`,
        )
      : true;
  } finally {
    client?.close();
    if (chrome) {
      chrome.kill("SIGTERM");
      await wait(500);
    }
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  return { screenshots, runtimeChecks };
};

const main = async () => {
  const source = await sourceChecks();
  const httpChecks = Object.fromEntries(await Promise.all(pages.map(async (page) => [page.route, await waitForHttp200(page.route)])));
  const browser = await runBrowserAudit();
  const checks = {
    ...source.checks,
    http200: Object.values(httpChecks).every(Boolean),
    screenshotsGenerated: browser.screenshots.length >= 17,
    consoleErrorZero: browser.screenshots.every((record) => record.consoleErrorsCount === 0),
    mobile390NoOverflow: browser.screenshots.filter((record) => record.viewport.startsWith("390")).every((record) => !record.horizontalOverflow),
    desktopNoOverflow: browser.screenshots.filter((record) => record.viewport.startsWith("1440")).every((record) => !record.horizontalOverflow),
    ...browser.runtimeChecks,
  };
  const failed = Object.entries(checks).filter(([, passed]) => passed !== true).map(([name]) => name);
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: failed.length === 0 ? "PASS" : "FAIL",
        checks,
        failed,
        httpChecks,
        changedFiles: source.changedFiles,
        forbiddenChanged: source.forbiddenChanged,
        unexpectedChanged: source.unexpectedChanged,
        screenshots: browser.screenshots,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(JSON.stringify({ status: failed.length === 0 ? "PASS" : "FAIL", failed, checks, screenshotManifest: manifestPath, screenshots: browser.screenshots }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
