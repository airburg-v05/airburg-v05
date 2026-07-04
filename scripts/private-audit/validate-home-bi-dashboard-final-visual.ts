import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.HOME_BI_AUDIT_BASE_URL ?? "http://localhost:3000";
const HOME_URL = `${BASE_URL.replace(/\/$/, "")}/home`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-bi-final-visual-"));

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

const allowedChangePatterns = [
  "app/(workspace)/home/page.tsx",
  "components/home/**",
  "lib/bi/**",
  "app/(workspace)/series-board/page.tsx",
  "components/series-board/v1/**",
  "app/(workspace)/store-board/page.tsx",
  "components/store-board/v1/**",
  "app/(workspace)/product-board/page.tsx",
  "components/product-board/v1/**",
  "app/(workspace)/upload/page.tsx",
  "components/upload/v1/**",
  "app/(workspace)/upload/history/page.tsx",
  "components/upload/history/v1/**",
  "app/(workspace)/upload/quality/page.tsx",
  "components/upload/quality/v1/**",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-v1-local-acceptance.ts",
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
  "components/visual-system/v1/**",
];

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

const navItems = [
  "经营首页",
  "系列看板",
  "店铺看板",
  "宝贝看板",
  "数据上传",
  "库存看板",
  "计划拆解",
  "历史数据",
  "AI顾问",
];

const kpiTitles = [
  "GMV",
  "GSV",
  "去退费比",
  "品牌词访客",
  "品牌词支付人数",
  "GEO搜索占比",
  "投入产出比",
  "退货率（总）",
  "发货退货率",
  "已签收退货率",
  "MTD周转",
  "同区履约率",
  "推广点击单价",
  "客单价",
  "转化率",
  "推广花费",
  "直接成交占比",
];

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
    const response = await fetch(HOME_URL, { signal: controller.signal });
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
    if (message.method === "Runtime.exceptionThrown") {
      this.consoleErrors.push("runtime_exception");
    }
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
    const pages = await fetchJson<Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await wait(100);
  }
  throw new Error("No Chrome page debugger URL found");
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send<{
    result?: { value?: T };
    exceptionDetails?: unknown;
  }>("Runtime.evaluate", {
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
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 390,
  });
  await wait(300);
};

const capture = async (
  client: CdpClient,
  name: string,
  viewport: string,
  status: string,
): Promise<ScreenshotRecord> => {
  const overflow = await evaluate<boolean>(
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
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: "/home",
    viewport,
    screenshotPath,
    pageStatus: status,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow: overflow,
  };
};

const clickByText = async (client: CdpClient, text: string) => {
  const escaped = JSON.stringify(text);
  await evaluate<void>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes(${escaped}));
      if (!target) throw new Error('button not found');
      target.click();
    })()`,
  );
  await wait(300);
};

const clickKpi = async (client: CdpClient, title: string) => {
  const escaped = JSON.stringify(title);
  await evaluate<void>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('[data-testid="home-bi-kpi-card"]'))
        .find((node) => node.getAttribute('data-kpi-title') === ${escaped});
      if (!target) throw new Error('kpi not found');
      target.click();
    })()`,
  );
  await wait(300);
};

const clickFirstSeriesKpiOrOpenPicker = async (client: CdpClient): Promise<"series_click" | "series_picker_empty"> => {
  const clicked = await evaluate<boolean>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('[data-testid="home-bi-kpi-card"]'))
        .find((node) => node.textContent?.includes('系列'));
      if (!target) return false;
      target.click();
      return true;
    })()`,
  );
  await wait(300);
  if (clicked) return "series_click";
  await clickByText(client, "系列自定义");
  await waitForSelector(client, '[data-testid="home-bi-series-picker-dialog"]');
  return "series_picker_empty";
};

const closeVisibleDialog = async (client: CdpClient) => {
  await evaluate<void>(
    client,
    `(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter((node) => node.textContent?.includes('关闭'));
      buttons.at(-1)?.click();
    })()`,
  );
  await wait(200);
};

const main = async () => {
  const component = read("components/home/home-bi-dashboard.tsx");
  const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
  const mapperSource = read("lib/bi/bi.home-mapper.ts");
  const visualSources = `${component}\n${visualSystemSource}`;
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)));
  const changedFilesWithinAllowed = changedFiles.every((file) =>
    allowedChangePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  const homeHttp200 = await waitForHttp200();
  const staticChecks = {
    navItemsExist: navItems.every((item) => visualSources.includes(item)),
    baseKpiTitlesComplete: kpiTitles.every((item) => `${component}\n${mapperSource}`.includes(item)),
    dynamicSeriesCards: component.includes("SeriesPickerDialog") && component.includes("home-bi-series-picker-dialog"),
    desktopFiveColumns: component.includes("xl:grid-cols-5"),
    gmvBlueHighlight: component.includes("bg-sky-50") || component.includes("bg-sky-100"),
    selectedRing: component.includes("ring-2 ring-blue-300") || component.includes("ring-4 ring-blue-300"),
    chartPanelsExist:
      (component.includes('data-testid="home-bi-chart-panel"') || component.includes('testId="home-bi-chart-panel"')) &&
      component.includes("home-bi-chart-mode-switch"),
    platformTargetPopoverExists: component.includes('data-testid="home-bi-platform-target-popover"'),
    productExcludeDialogExists: component.includes('data-testid="home-bi-product-exclude-dialog"'),
    changedFilesWithinAllowed,
    noForbiddenChanges: forbiddenChanged.length === 0,
    homeHttp200,
  };

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-bi-chrome-profile-"));
  const port = 9400 + Math.floor(Math.random() * 300);
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
      source: `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "visual-audit", loggedInAt: "2026-06-26T00:00:00.000Z" }));`,
    });
    await client.send("Page.navigate", { url: HOME_URL });
    await waitForSelector(client, '[data-testid="home-bi-dashboard"]');
    await wait(600);

    await setViewport(client, 1440, 1200);
    records.push(await capture(client, "home-1440", "1440x1200", "base"));

    await setViewport(client, 390, 1000);
    records.push(await capture(client, "home-390", "390x1000", "base"));

    await setViewport(client, 1440, 1200);
    await clickByText(client, "平台目标");
    await waitForSelector(client, '[data-testid="home-bi-platform-target-popover"]');
    records.push(await capture(client, "home-platform-target-popover", "1440x1200", "platform_target_open"));
    await closeVisibleDialog(client);

    await clickByText(client, "商品排除");
    await waitForSelector(client, '[data-testid="home-bi-product-exclude-dialog"]');
    records.push(await capture(client, "home-product-exclude-dialog", "1440x1200", "product_exclude_open"));
    await closeVisibleDialog(client);

    const seriesStatus = await clickFirstSeriesKpiOrOpenPicker(client);
    records.push(await capture(client, "home-series-dynamic-state", "1440x1200", seriesStatus));
    await closeVisibleDialog(client);

    await clickKpi(client, "退货率（总）");
    const returnLinesPresent = await evaluate<boolean>(
      client,
      `document.body.innerText.includes('总退货率') &&
       document.body.innerText.includes('发货退货率') &&
       document.body.innerText.includes('已签收退货率')`,
    );
    if (!returnLinesPresent) throw new Error("Return rate chart does not keep three lines");
    records.push(await capture(client, "home-return-rate-three-lines", "1440x1200", "return_rate_click"));
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
        route: "/home",
        createdAt: new Date().toISOString(),
        screenshotDir,
        screenshots: records,
        consoleErrors: capturedConsoleErrors,
        ignoredConsoleErrors,
        checks,
        forbiddenChanged,
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
  };
  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
