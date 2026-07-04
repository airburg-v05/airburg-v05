import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.UPLOAD_PAGE_V1_AUDIT_BASE_URL ?? "http://localhost:3000";
const PAGE_URL = `${BASE_URL.replace(/\/$/, "")}/upload`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-page-v1-"));

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
const fileCards = ["生意参谋商品经营表", "商品推广报表", "计划推广报表", "售后退货表"];

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
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: "/upload",
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
      const target = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes(${escaped}));
      if (!target) throw new Error('button not found');
      target.click();
    })()`,
  );
  await wait(400);
};

const setFileInput = async (client: CdpClient, selector: string, filePath: string) => {
  const documentResult = await client.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: -1, pierce: true });
  const queryResult = await client.send<{ nodeId: number }>("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector,
  });
  if (!queryResult.nodeId) throw new Error(`Missing file input: ${selector}`);
  await client.send("DOM.setFileInputFiles", {
    nodeId: queryResult.nodeId,
    files: [filePath],
  });
  await evaluate<void>(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await wait(500);
};

const main = async () => {
  const page = read("app/(workspace)/upload/page.tsx");
  const component = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
  const visualSources = `${component}\n${visualSystemSource}`;
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)));
  const http200 = await waitForHttp200();
  const staticChecks = {
    pageUsesV1: page.includes("UploadPageV1Dashboard"),
    navItemsExist: navItems.every((item) => visualSources.includes(item)),
    uploadHighlighted: component.includes('activeLabel="数据上传"'),
    topbarExists: component.includes('title="数据上传"') && visualSystemSource.includes("退出"),
    targetStoreExists: component.includes("目标店铺"),
    batchImportExists: component.includes("批量导入经营数据"),
    fileCardsExist: fileCards.every((item) => component.includes(item)),
    actionButtonsExist: component.includes("批量导入") && component.includes("清空本次选择"),
    duplicateNoticeExists: component.includes("重复文件") && component.includes("已剔除重复文件"),
    noDashboardControls:
      !component.includes("商品排除") &&
      !component.includes("商家备注") &&
      !component.includes("平台目标") &&
      !component.includes("系列目标") &&
      !component.includes("店铺目标") &&
      !component.includes("宝贝目标") &&
      !component.includes("统计时间") &&
      !component.includes("KPI 卡片") &&
      !component.includes("趋势图"),
    noInvalidSourceText:
      !['"NaN"', "'NaN'", "`NaN`", '"Infinity"', "'Infinity'", "`Infinity`", '"undefined"', "'undefined'", "`undefined`"].some(
        (token) => component.includes(token),
      ),
    noForbiddenChanges: forbiddenChanged.length === 0,
    noNewDependencies: !git(["diff", "--name-only", "--", "package.json", "package-lock.json"]),
    http200,
  };

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-page-v1-profile-"));
  const sampleFile = path.join(screenshotDir, "sample-business.csv");
  const sampleFileTwo = path.join(screenshotDir, "sample-business-next.csv");
  fs.writeFileSync(sampleFile, "safe,audit\n1,2\n", "utf8");
  fs.writeFileSync(sampleFileTwo, "safe,audit\n3,4\n", "utf8");
  const port = 9700 + Math.floor(Math.random() * 300);
  let chrome: ChildProcessWithoutNullStreams | null = null;
  let client: CdpClient | null = null;
  let capturedConsoleErrors: string[] = [];
  let ignoredConsoleErrors: string[] = [];
  const screenshots: ScreenshotRecord[] = [];

  try {
    chrome = await launchChrome(port, profileDir);
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("DOM.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "upload-v1-audit", loggedInAt: "2026-06-27T00:00:00.000Z" }));`,
    });
    await client.send("Page.navigate", { url: PAGE_URL });
    await waitForSelector(client, '[data-testid="upload-page-v1-dashboard"]');
    await wait(600);

    await setViewport(client, 1440, 1200);
    screenshots.push(await capture(client, "upload-page-1440", "1440x1200", "base"));

    await setViewport(client, 390, 1000);
    screenshots.push(await capture(client, "upload-page-390", "390x1000", "base"));

    await setViewport(client, 1440, 1200);
    await evaluate<void>(
      client,
      `document.querySelector('[data-testid="upload-page-v1-target-store"]')?.focus();`,
    );
    screenshots.push(await capture(client, "upload-page-target-store", "1440x1200", "target_store_focus"));

    await setFileInput(client, 'input[data-source-type="businessProduct"]', sampleFile);
    screenshots.push(await capture(client, "upload-page-file-selected", "1440x1200", "file_selected"));

    await setFileInput(client, 'input[data-source-type="businessProduct"]', sampleFile);
    const duplicateVisible = await evaluate<boolean>(client, `document.body.innerText.includes('已剔除重复文件')`);
    if (!duplicateVisible) throw new Error("Duplicate notice is not visible");
    screenshots.push(await capture(client, "upload-page-duplicate-removed", "1440x1200", "duplicate_removed"));

    await setFileInput(client, 'input[data-source-type="businessProduct"]', sampleFileTwo);
    await clickByText(client, "批量导入");
    await waitForSelector(client, '[data-testid="upload-page-v1-result"]');
    screenshots.push(await capture(client, "upload-page-import-result", "1440x1200", "import_result"));
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
    screenshotCount: screenshots.length === 6,
    mobile390NoOverflow: screenshots.find((record) => record.viewport.startsWith("390"))?.horizontalOverflow === false,
    desktopNoOverflow: screenshots.filter((record) => record.viewport.startsWith("1440")).every((record) => !record.horizontalOverflow),
    consoleErrorZero: screenshots.every((record) => record.consoleErrorsCount === 0),
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name);
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ route: "/upload", screenshotDir, screenshots, checks, forbiddenChanged, consoleErrors: capturedConsoleErrors, ignoredConsoleErrors }, null, 2),
    "utf8",
  );

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    screenshotManifest: manifestPath,
    screenshots,
    checks,
    forbiddenChanged,
    consoleErrors: capturedConsoleErrors,
    ignoredConsoleErrors,
  };
  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
