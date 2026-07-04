import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.CORE_PAGES_V1_P0_AUDIT_BASE_URL ?? "http://localhost:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-p0-"));

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

const pageSpecs = [
  { route: "/home", root: "[data-testid='home-bi-dashboard']", title: "经营首页" },
  { route: "/series-board", root: "[data-testid='series-board-v1-dashboard']", title: "系列看板" },
  { route: "/store-board", root: "[data-testid='store-board-v1-dashboard']", title: "店铺看板" },
  { route: "/product-board", root: "[data-testid='product-board-v1-dashboard']", title: "宝贝看板" },
  { route: "/upload", root: "[data-testid='upload-page-v1-dashboard']", title: "数据上传" },
  { route: "/upload/history", root: "[data-testid='history-data-v1-page']", title: "历史数据" },
  { route: "/upload/quality", root: "[data-testid='upload-quality-v1-page']", title: "数据质量" },
] as const;

const forbiddenChangePatterns = [
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

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const parseChangedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const fetchOk = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
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

  send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }
}

const launchChrome = async (port: number, profileDir: string): Promise<ChildProcessWithoutNullStreams> => {
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--window-size=1440,1100",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => void 0);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return chrome;
    } catch {
      await wait(250);
    }
  }
  chrome.kill("SIGKILL");
  throw new Error("Chrome CDP did not start.");
};

const ensureDevServer = async (): Promise<{ process: ChildProcessWithoutNullStreams | null }> => {
  if (await fetchOk(`${BASE_URL}/home`)) return { process: null };
  const child = spawn("npm", ["run", "dev"], { cwd: ROOT, env: process.env });
  child.stdout.on("data", () => void 0);
  child.stderr.on("data", () => void 0);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await fetchOk(`${BASE_URL}/home`)) return { process: child };
    await wait(500);
  }
  child.kill("SIGTERM");
  throw new Error("Next dev server did not become ready.");
};

const connectClient = async (port: number): Promise<CdpClient> => {
  let debuggerUrl: string | null = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    debuggerUrl = pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
    if (debuggerUrl) break;
    await wait(100);
  }
  if (!debuggerUrl) throw new Error("No Chrome page debugger URL found.");
  const client = await CdpClient.connect(debuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  return client;
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send<{ result?: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`Evaluation failed: ${expression}`);
  return result.result?.value as T;
};

const click = async (client: CdpClient, selector: string): Promise<boolean> =>
  evaluate<boolean>(
    client,
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`,
  );

const navigate = async (client: CdpClient, route: string, width = 1440, height = 1100) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 390,
  });
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await wait(1200);
};

const waitForSelector = async (client: CdpClient, selector: string): Promise<void> => {
  const escaped = JSON.stringify(selector);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const exists = await evaluate<boolean>(client, `(() => Boolean(document.querySelector(${escaped})))()`);
    if (exists) return;
    await wait(150);
  }
  throw new Error(`Missing selector: ${selector}`);
};

const capture = async (client: CdpClient, label: string, route: string, viewport: string): Promise<ScreenshotRecord> => {
  const overflow = await evaluate<boolean>(
    client,
    `(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 || document.body.scrollWidth > window.innerWidth + 2)()`,
  );
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(screenshotDir, `${label}.png`);
  fs.writeFileSync(file, Buffer.from(screenshot.data, "base64"));
  return {
    label,
    route,
    viewport,
    screenshotPath: file,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow: overflow,
  };
};

const pageAuditExpression = (root: string, title: string) => `
(() => {
  const text = document.body.innerText || "";
  const root = document.querySelector(${JSON.stringify(root)});
  const navText = root ? Array.from(root.querySelectorAll("nav a, nav button")).map((node) => (node.textContent || "").trim()) : [];
  const navItems = ${JSON.stringify(["经营首页", "系列看板", "店铺看板", "宝贝看板", "数据上传", "库存看板", "计划拆解", "历史数据", "AI顾问"])};
  const sensitive = ${JSON.stringify(sensitiveTokens)};
  return {
    rootExists: Boolean(root),
    titleExists: text.includes(${JSON.stringify(title)}),
    singleSidebar: root ? root.querySelectorAll("aside nav").length === 1 : false,
    navComplete: navItems.every((item) => navText.includes(item)),
    noSensitiveText: !sensitive.some((item) => text.includes(item)),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 || document.body.scrollWidth > window.innerWidth + 2,
  };
})()
`;

const sourceChecks = () => {
  const home = read("components/home/home-bi-dashboard.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const visual = read("components/visual-system/v1/visual-system.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const history = read("components/upload/history/v1/history-data-v1-dashboard.tsx");
  const quality = read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");
  return {
    visualSystemControlsExist:
      visual.includes("V1LogoAccountButton") &&
      visual.includes("V1ChartModeSwitch") &&
      visual.includes("V1TimeRangeDetailControls"),
    homeLogoClickable: home.includes("home-bi-logo-button") && home.includes("V1LogoAccountButton"),
    platformTargetMonthControlled: home.includes('type="month"') && home.includes("platformTargetMonth"),
    homeTimeControlsComplete: home.includes("onDayDateChange") && home.includes("onWeekChange") && home.includes("onMonthChange"),
    homeSeriesNoHardcodedCards:
      mapper.includes("seriesMetricDefinitions") &&
      !mapper.includes('metricKey: "空气净化器"') &&
      !mapper.includes('metricKey: "新风系统"') &&
      !mapper.includes('metricKey: "滤网配件"'),
    homeGlobalKpisIgnoreSelectedSeries: mapper.includes("globalStateForHomeKpi") && mapper.includes("selectedSeries: null"),
    homeSeriesPickerExists: home.includes("SeriesPickerDialog") && home.includes("home-bi-series-picker-dialog"),
    homeKpiCustomizerExists: home.includes("KpiCustomizerDialog") && home.includes("home-bi-kpi-customizer-dialog"),
    homeSingleChartSwitch: home.includes("home-bi-chart-mode-switch") && !home.includes("xl:grid-cols-2"),
    pageTimeControls: [series, store, product].every((source) => source.includes("V1TimeRangeDetailControls")),
    pageChartSwitches:
      series.includes("series-board-v1-chart-mode-switch") &&
      store.includes("store-board-v1-chart-mode-switch") &&
      product.includes("product-board-v1-chart-mode-switch"),
    historyFixedShell: history.includes("fixed inset-0 z-50 flex overflow-hidden"),
    qualityFixedShell: quality.includes("fixed inset-0 z-50 flex overflow-hidden"),
  };
};

const changeChecks = () => {
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)));
  const unknownChanged = changedFiles.filter((file) => !allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)));
  return {
    changedFiles,
    forbiddenChanged,
    unknownChanged,
    changedFilesWithinAllowed: unknownChanged.length === 0,
    noForbiddenChanges: forbiddenChanged.length === 0,
    noNewDependencies: !changedFiles.includes("package.json") && !changedFiles.includes("package-lock.json"),
  };
};

const runBrowserAudit = async (): Promise<ScreenshotRecord[]> => {
  const { process: server } = await ensureDevServer();
  const port = 9630 + Math.floor(Math.random() * 300);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-p0-chrome-"));
  let chrome: ChildProcessWithoutNullStreams | null = null;
  let client: CdpClient | null = null;
  const screenshots: ScreenshotRecord[] = [];

  try {
    chrome = await launchChrome(port, profileDir);
    client = await connectClient(port);
    await navigate(client, "/login", 1440, 1100);
    await evaluate(
      client,
      `(() => localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "p0-audit@airburg.local", loggedInAt: new Date().toISOString() })))()`,
    );

    for (const spec of pageSpecs) {
      await navigate(client, spec.route, 1440, 1100);
      await waitForSelector(client, spec.root);
      const audit = await evaluate<{
        rootExists: boolean;
        titleExists: boolean;
        singleSidebar: boolean;
        navComplete: boolean;
        noSensitiveText: boolean;
        horizontalOverflow: boolean;
      }>(client, pageAuditExpression(spec.root, spec.title));
      if (!audit.rootExists || !audit.titleExists || !audit.singleSidebar || !audit.navComplete || !audit.noSensitiveText || audit.horizontalOverflow) {
        throw new Error(`Page audit failed for ${spec.route}: ${JSON.stringify(audit)}`);
      }
      screenshots.push(await capture(client, `${spec.route.replaceAll("/", "-").replace(/^-/, "") || "home"}-1440`, spec.route, "1440x1100"));
    }

    await navigate(client, "/home", 1440, 1100);
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await click(client, "[data-testid='home-bi-logo-button']");
    screenshots.push(await capture(client, "home-logo-popover", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-platform-target-button']");
    await waitForSelector(client, "[data-testid='home-bi-platform-target-popover']");
    const monthOk = await evaluate<boolean>(client, `(() => document.querySelector("[data-testid='home-bi-platform-target-popover'] input[type='month']") !== null)()`);
    if (!monthOk) throw new Error("Home platform target month input is not controlled as type=month.");
    screenshots.push(await capture(client, "home-platform-target-month", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-platform-target-button']");
    await click(client, "[data-testid='home-bi-series-picker-button']");
    screenshots.push(await capture(client, "home-series-picker", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-series-picker-dialog'] button");
    await click(client, "[data-testid='home-bi-kpi-customizer-button']");
    screenshots.push(await capture(client, "home-kpi-customizer", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-kpi-customizer-dialog'] button");
    const homeChartCount = await evaluate<number>(client, `(() => document.querySelectorAll("[data-testid='home-bi-chart-panel']").length)()`);
    if (homeChartCount !== 1) throw new Error(`Home should render exactly one main chart, got ${homeChartCount}.`);
    screenshots.push(await capture(client, "home-mtd", "/home", "1440x1100"));
    await click(client, "[data-testid='home-bi-chart-mode-switch'] button:nth-child(2)");
    screenshots.push(await capture(client, "home-dly", "/home", "1440x1100"));

    for (const route of ["/series-board", "/store-board", "/product-board"]) {
      await navigate(client, route, 1440, 1100);
      const prefix = route === "/series-board" ? "series-board-v1" : route === "/store-board" ? "store-board-v1" : "product-board-v1";
      await waitForSelector(client, `[data-testid='${prefix}-dashboard']`);
      const ok = await evaluate<boolean>(
        client,
        `(() => document.querySelector("[data-testid='${prefix}-chart-mode-switch']") !== null && document.querySelectorAll("[data-testid='${prefix}-chart-panel']").length === 1)()`,
      );
      if (!ok) throw new Error(`${route} chart switch or single chart check failed.`);
      await click(client, `[data-testid='${prefix}-chart-mode-switch'] button:nth-child(2)`);
      screenshots.push(await capture(client, `${prefix}-dly`, route, "1440x1100"));
    }

    for (const spec of pageSpecs) {
      await navigate(client, spec.route, 390, 1000);
      await waitForSelector(client, spec.root);
      screenshots.push(await capture(client, `${spec.route.replaceAll("/", "-").replace(/^-/, "") || "home"}-390`, spec.route, "390x1000"));
    }

    return screenshots;
  } finally {
    client?.close();
    chrome?.kill("SIGKILL");
    server?.kill("SIGTERM");
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Chrome can keep a lock for a short moment after SIGKILL; the audit only uses this isolated temp profile.
    }
  }
};

const main = async () => {
  const sources = sourceChecks();
  const changes = changeChecks();
  const screenshots = await runBrowserAudit();
  const runtimeChecks = {
    screenshotsGenerated: screenshots.length >= pageSpecs.length * 2,
    consoleErrorZero: screenshots.every((record) => record.consoleErrorsCount === 0),
    mobile390NoOverflow: screenshots.filter((record) => record.viewport.startsWith("390")).every((record) => !record.horizontalOverflow),
    desktopNoOverflow: screenshots.filter((record) => record.viewport.startsWith("1440")).every((record) => !record.horizontalOverflow),
  };
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: "PASS",
        screenshotDir,
        screenshots,
        sources,
        changes,
        runtimeChecks,
      },
      null,
      2,
    ),
  );

  const checks = {
    ...sources,
    ...runtimeChecks,
    changedFilesWithinAllowed: changes.changedFilesWithinAllowed,
    noForbiddenChanges: changes.noForbiddenChanges,
    noNewDependencies: changes.noNewDependencies,
  };
  const failed = Object.entries(checks).filter(([, value]) => value !== true);
  const result = {
    status: failed.length === 0 ? "PASS" : "FAIL",
    checks,
    failed: failed.map(([key]) => key),
    changedFiles: changes.changedFiles,
    screenshotManifest: manifestPath,
    screenshots,
  };

  if (failed.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error);
  console.error(JSON.stringify({ status: "FAIL", error: message, screenshotDir }, null, 2));
  process.exit(1);
});
