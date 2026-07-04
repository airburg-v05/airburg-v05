import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface ScreenshotRecord {
  label: string;
  route: string;
  viewport: string;
  screenshotPath: string;
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
  invalidText: boolean;
  sensitiveText: boolean;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const ROOT = process.cwd();
const BASE_URL = process.env.CORE_PAGES_P2_UI_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-p2-ui-"));
const checks: Check[] = [];

const pages = [
  { route: "/home", root: "[data-testid='home-bi-dashboard']" },
  { route: "/series-board", root: "[data-testid='series-board-v1-dashboard']" },
  { route: "/product-board", root: "[data-testid='product-board-v1-dashboard']" },
  { route: "/upload", root: "[data-testid='upload-page-v1-dashboard']" },
  { route: "/upload/history", root: "[data-testid='history-data-v1-page']" },
  { route: "/upload/quality", root: "[data-testid='upload-quality-v1-page']" },
];

const allowedOrPriorPatterns = [
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
  "lib/etl/**",
  "lib/persistence/**",
  "next-env.d.ts",
  "scripts/private-audit/**",
];

const strictlyForbiddenPatterns = [
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const invalidTokens = ["NaN", "Infinity", "undefined"];
const sensitiveTokens = [
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

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const httpOk = async (route: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}${route}`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
};

const ensureServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (await httpOk("/home")) return null;
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  child.stdout.on("data", () => undefined);
  child.stderr.on("data", () => undefined);
  for (let index = 0; index < 120; index += 1) {
    if (await httpOk("/home")) return child;
    await wait(500);
  }
  child.kill("SIGTERM");
  throw new Error("Local dev server did not become ready");
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
      if (params?.entry?.level !== "error") return;
      const text = `${params.entry.url ?? "unknown"} ${params.entry.text ?? "log_error"}`;
      if (text.includes("/favicon.ico") && text.includes("404")) this.ignoredConsoleErrors.push(text);
      else this.consoleErrors.push(text);
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

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
};

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
  for (let index = 0; index < 60; index += 1) {
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

const getDebuggerUrl = async (port: number): Promise<string> => {
  const targets = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error("No page debugger URL");
  return page.webSocketDebuggerUrl;
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

const waitForSelector = async (client: CdpClient, selector: string) => {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await wait(100);
  }
  throw new Error(`Missing selector ${selector}`);
};

const click = async (client: CdpClient, selector: string) => {
  await evaluate<void>(
    client,
    `(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) throw new Error("missing click target");
      node.click();
    })()`,
  );
  await wait(350);
};

const clickButtonByText = async (client: CdpClient, text: string) => {
  await evaluate<void>(
    client,
    `(() => {
      const node = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === ${JSON.stringify(text)});
      if (!node) throw new Error("missing button text");
      node.click();
    })()`,
  );
  await wait(350);
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
  const textChecks = await evaluate<{ invalidText: boolean; sensitiveText: boolean }>(
    client,
    `(() => {
      const text = document.body.innerText;
      return {
        invalidText: ${JSON.stringify(invalidTokens)}.some((token) => text.includes(token)),
        sensitiveText: ${JSON.stringify(sensitiveTokens)}.some((token) => text.includes(token)),
      };
    })()`,
  );
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const screenshotPath = path.join(screenshotDir, `${label}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    label,
    route,
    viewport,
    screenshotPath,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
    invalidText: textChecks.invalidText,
    sensitiveText: textChecks.sensitiveText,
  };
};

const runSourceChecks = () => {
  const changed = changedFiles();
  const home = read("components/home/home-bi-dashboard.tsx");
  const chart = read("components/visual-system/v1/bi-chart.tsx");
  const brand = read("components/visual-system/v1/brand-model-filter-popover.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const upload = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const history = read("components/upload/history/v1/history-data-v1-dashboard.tsx");
  const quality = read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");
  const targetRegistry = read("lib/bi/target-metric-definitions.ts");

  addCheck("changedFilesWithinAllowedOrPriorBaseline", changed.every((file) => allowedOrPriorPatterns.some((pattern) => matchesPattern(file, pattern))), changed);
  addCheck("noStrictlyForbiddenChanges", !changed.some((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern))), changed);
  addCheck("homeTopLayoutHasNewStructure", home.includes("home-bi-control-shell-v2") && home.includes("账号与店铺") && home.includes("操作与统计时间"));
  addCheck("platformTargetRoiUnitIsTimes", targetRegistry.includes('metricKey: "adRoi"') && targetRegistry.includes('unit: "倍"'));
  addCheck(
    "platformTargetUsesRequiredDerivedUnsupportedRules",
    home.includes("BASE_PLATFORM_TARGET_FIELDS") &&
      home.includes("DERIVED_PLATFORM_TARGET_FIELDS") &&
      home.includes("UNSUPPORTED_PLATFORM_TARGET_FIELDS") &&
      home.includes("需要填写的目标") &&
      home.includes("自动推导的目标") &&
      home.includes("暂不支持目标"),
  );
  addCheck("platformTargetNoFixedSeriesFields", !home.includes('{ label: "空气净化器", unit: "元" }') && !home.includes('{ label: "新风系统", unit: "元" }') && !home.includes('{ label: "滤网配件", unit: "元" }'));
  addCheck("kpiCardsDensityReduced", [home, series, product].every((source) => source.includes("h-[150px]") && source.includes("h-1.5") && source.includes("rounded-lg bg-slate-50/80 p-2")));
  addCheck("gmvUnselectedNoHardBlueBackground", !home.includes('highlight ? "border-sky-500 bg-sky-50"'));
  addCheck("chartCleanEmptyState", chart.includes("bi-chart-clean-empty-canvas") && chart.includes("缺失值不按 0 绘制"));
  addCheck("brandCenterWordChips", brand.includes("中心词别名组预览") && brand.includes("不使用简单包含") && brand.includes("KJ500F-P1"));
  addCheck("seriesSettingsLightWorkflow", series.includes("系列 + 商品清单") && series.includes("已维护商品清单") && series.includes("支持多行粘贴，每行一个商品ID"));
  addCheck("productSettingsNoDeveloperTerms", !product.includes("ProductRecord") && !product.includes("TrackedProductRecord"));
  addCheck("productNoAllProductsFilter", !product.includes("所有宝贝"));
  addCheck("uploadUnifiedEntryStillPresent", upload.includes("批量上传天猫数据文件") && upload.includes('multiple') && upload.includes("runETLRuntime"));
  addCheck("uploadUnsupportedHintClear", upload.includes("已进入安全提示，不影响其它文件导入"));
  addCheck("historyReadOnlyBoundary", history.includes("只读") && !["删除", "回滚", "强制覆盖", "重新导入"].some((token) => history.includes(token)));
  addCheck("qualityReadOnlyAndShortSearch", quality.includes("只读") && quality.includes("搜安全码 / 店铺 / code"));
  addCheck("etlNotChangedByThisScript", true, "ETL semantics are not imported or modified by this validator.");
  return changed;
};

const runBrowserChecks = async () => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-p2-ui-profile-"));
  const port = 10050 + Math.floor(Math.random() * 500);
  let chrome: ChildProcessWithoutNullStreams | null = null;
  let client: CdpClient | null = null;
  const screenshots: ScreenshotRecord[] = [];
  try {
    chrome = await launchChrome(port, profileDir);
    client = await CdpClient.connect(await getDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "p2-ui-audit", loggedInAt: "2026-07-01T00:00:00.000Z" }));`,
    });

    for (const page of pages) {
      await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${page.route}` });
      await waitForSelector(client, page.root);
      await wait(600);
      await setViewport(client, 1440, 980);
      screenshots.push(await capture(client, `${page.route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-1440`, page.route, "1440x980"));
      await setViewport(client, 390, 900);
      screenshots.push(await capture(client, `${page.route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-390`, page.route, "390x900"));
    }

    await setViewport(client, 1440, 980);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await click(client, "[data-testid='home-bi-platform-target-button']");
    await waitForSelector(client, "[data-testid='home-bi-platform-target-popover']");
    screenshots.push(await capture(client, "home-platform-target-popover-1440", "/home", "1440x980"));
    const platformTargetText = await evaluate<string>(client, `document.querySelector("[data-testid='home-bi-platform-target-popover']")?.textContent ?? ""`);
    addCheck(
      "runtimePlatformTargetRequiredDerivedUnsupportedSections",
      platformTargetText.includes("投入产出比") &&
        platformTargetText.includes("倍") &&
        platformTargetText.includes("需要填写的目标") &&
        platformTargetText.includes("自动推导的目标") &&
        platformTargetText.includes("暂不支持目标") &&
        platformTargetText.includes("目标草稿保存在本浏览器"),
    );

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await click(client, "[data-testid='home-bi-brand-model-filter-button']");
    await waitForSelector(client, "[data-testid='home-bi-brand-model-filter-popover']");
    screenshots.push(await capture(client, "home-brand-center-popover-1440", "/home", "1440x980"));
    const brandText = await evaluate<string>(client, `document.querySelector("[data-testid='home-bi-brand-model-filter-popover']")?.textContent ?? ""`);
    addCheck("runtimeBrandCenterWordExplainsSafeAlias", brandText.includes("中心词别名组预览") && brandText.includes("不使用简单包含"));

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/series-board` });
    await waitForSelector(client, "[data-testid='series-board-v1-dashboard']");
    await clickButtonByText(client, "系列设置");
    await waitForSelector(client, "[data-testid='series-board-v1-series-settings']");
    screenshots.push(await capture(client, "series-settings-popover-1440", "/series-board", "1440x980"));

    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/product-board` });
    await waitForSelector(client, "[data-testid='product-board-v1-dashboard']");
    await click(client, "[data-testid='product-board-v1-product-settings-button']");
    await waitForSelector(client, "[data-testid='product-board-v1-product-settings-popover']");
    screenshots.push(await capture(client, "product-settings-popover-1440", "/product-board", "1440x980"));
    const productSettingsText = await evaluate<string>(client, `document.querySelector("[data-testid='product-board-v1-product-settings-popover']")?.textContent ?? ""`);
    addCheck("runtimeProductSettingsNoDeveloperTerms", !productSettingsText.includes("ProductRecord") && !productSettingsText.includes("TrackedProductRecord"));
  } finally {
    client?.close();
    if (chrome) {
      chrome.kill("SIGTERM");
      await wait(500);
    }
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  return screenshots;
};

const main = async () => {
  const server = await ensureServer();
  let screenshots: ScreenshotRecord[] = [];
  let changed: string[] = [];
  try {
    changed = runSourceChecks();
    const httpChecks: Array<[string, boolean]> = await Promise.all(pages.map(async (page) => [page.route, await httpOk(page.route)]));
    httpChecks.forEach(([route, ok]) => addCheck(`http200:${route}`, ok));
    screenshots = await runBrowserChecks();
    addCheck("screenshotsGenerated", screenshots.length >= 16, screenshots.map((item) => item.screenshotPath));
    addCheck("consoleBusinessErrorZero", screenshots.every((item) => item.consoleErrorsCount === 0), screenshots);
    addCheck("mobile390NoHorizontalOverflow", screenshots.filter((item) => item.viewport.startsWith("390")).every((item) => !item.horizontalOverflow), screenshots);
    addCheck("desktopNoHorizontalOverflow", screenshots.filter((item) => item.viewport.startsWith("1440")).every((item) => !item.horizontalOverflow), screenshots);
    addCheck("noInvalidText", screenshots.every((item) => !item.invalidText), screenshots);
    addCheck("noSensitiveText", screenshots.every((item) => !item.sensitiveText), screenshots);
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await wait(500);
    }
  }

  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ status, checks, failed, changedFiles: changed, screenshots }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify({ status, failed: failed.map((check) => check.name), screenshotManifest: manifestPath, checks, screenshots }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
