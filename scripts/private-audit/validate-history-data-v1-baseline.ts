import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.HISTORY_DATA_V1_AUDIT_BASE_URL ?? "http://localhost:3000";
const PAGE_URL = `${BASE_URL.replace(/\/$/, "")}/upload/history`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-history-data-v1-"));

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
const sourceColumns = ["生意参谋商品经营表", "商品推广报表", "计划推广报表", "售后退货表"];
const requiredTexts = [
  "历史数据",
  "退出",
  "平台筛选",
  "店铺筛选",
  "开始日期",
  "结束日期",
  "来源类型筛选",
  "导入状态筛选",
  "搜索框",
  "已覆盖日期",
  "完整日期",
  "缺失日期",
  "重复 / 冲突提示",
  "数据完整性矩阵",
  "导入批次列表",
  "查看详情",
  "查看数据质量",
  "数据检查提示",
];

const forbiddenUiActionTexts = ["删除", "回滚", "强制覆盖", "重新导入", "修改历史记录", "清空数据"];
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
  "app/(workspace)/upload/history/page.tsx",
  "components/upload/history/**",
  "scripts/private-audit/validate-history-data-v1-baseline.ts",
];

const knownPriorBaselineChanges = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/product-board/v1/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/upload/quality/v1/**",
  "components/upload/v1/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-product-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-series-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-store-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
  "scripts/private-audit/validate-upload-quality-v1-baseline.ts",
  "scripts/private-audit/validate-core-pages-v1-local-acceptance.ts",
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
  const bodyText = await evaluate<string>(client, "document.body.innerText");
  if (/NaN|Infinity|undefined/.test(bodyText)) throw new Error(`Invalid numeric text appeared during ${name}`);
  for (const token of forbiddenPrivacyTexts) {
    if (bodyText.includes(token)) throw new Error(`Privacy token appeared during ${name}: ${token}`);
  }
  for (const token of forbiddenUiActionTexts) {
    if (bodyText.includes(token)) throw new Error(`Forbidden action token appeared during ${name}: ${token}`);
  }
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: "/upload/history",
    viewport,
    screenshotPath,
    pageStatus,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
  };
};

const clickFirstButtonText = async (client: CdpClient, text: string) => {
  const escaped = JSON.stringify(text);
  await evaluate<void>(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes(${escaped}));
      if (!button) throw new Error('button not found');
      button.click();
    })()`,
  );
  await wait(300);
};

const runBrowserAudit = async (): Promise<ScreenshotRecord[]> => {
  const port = 9644;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-history-data-v1-profile-"));
  const chrome = await launchChrome(port, profileDir);
  const screenshots: ScreenshotRecord[] = [];
  let client: CdpClient | null = null;
  try {
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");

    await setViewport(client, 1440, 1100);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/login` });
    await wait(500);
    await evaluate<void>(
      client,
      `localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "history-v1-audit", loggedInAt: "2026-06-27T00:00:00.000Z" }))`,
    );
    await client.send("Page.navigate", { url: PAGE_URL });
    await waitForSelector(client, "[data-testid='history-data-v1-page']");
    await wait(800);

    const text = await evaluate<string>(client, "document.body.innerText");
    [...navItems, ...requiredTexts, ...sourceColumns].forEach((item) => {
      if (!text.includes(item)) throw new Error(`Missing browser text: ${item}`);
    });

    screenshots.push(await capture(client, "history-data-1440", "1440x1100", "loaded"));
    screenshots.push(await capture(client, "history-data-filters", "1440x1100", "filters"));

    await waitForSelector(client, "[data-testid='history-v1-matrix']");
    screenshots.push(await capture(client, "history-data-matrix", "1440x1100", "matrix"));

    await clickFirstButtonText(client, "查看详情");
    await waitForSelector(client, "[data-testid='history-v1-detail-drawer']");
    screenshots.push(await capture(client, "history-data-drawer", "1440x1100", "drawer"));
    await clickFirstButtonText(client, "关闭");
    await wait(300);

    await waitForSelector(client, "[data-testid='history-v1-check-notice']");
    screenshots.push(await capture(client, "history-data-check-notice", "1440x1100", "check_notice"));

    await setViewport(client, 390, 1100);
    await wait(400);
    screenshots.push(await capture(client, "history-data-390", "390x1100", "mobile"));

    if (client.consoleErrors.length > 0) throw new Error(`Console errors: ${client.consoleErrors.join("; ")}`);
    if (screenshots.some((item) => item.horizontalOverflow)) throw new Error("Horizontal overflow detected");
    return screenshots;
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      await wait(300);
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
};

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const main = async () => {
  const page = read("app/(workspace)/upload/history/page.tsx");
  const component = read("components/upload/history/v1/history-data-v1-dashboard.tsx");
  const visualSystemSource = read("components/visual-system/v1/visual-system.tsx");
  const combined = `${page}\n${component}\n${visualSystemSource}`;

  assert(page.includes("HistoryDataV1Dashboard"), "history page must use V1 dashboard");
  [...navItems, ...requiredTexts, ...sourceColumns].forEach((item) => {
    assert(combined.includes(item), `missing required source text: ${item}`);
  });
  assert(combined.includes('activeLabel="历史数据"'), "history nav highlight missing");
  assert(combined.includes("DetailDrawer"), "batch detail drawer component missing");
  assert(combined.includes("/upload/quality"), "quality entry missing");
  assert(combined.includes("data-testid=\"history-v1-matrix\"") || combined.includes("data-testid=\"history-v1-matrix"), "matrix test id missing");

  for (const token of ["rawRows", "previewRows", "文件名历史", "warning 原文"]) {
    assert(!component.includes(token), `privacy token appeared in component: ${token}`);
  }
  for (const token of ["删除", "回滚", "强制覆盖", "重新导入", "修改历史记录", "清空数据"]) {
    assert(!component.includes(token), `forbidden action appeared in component: ${token}`);
  }
  assert(!/"NaN"|"Infinity"|"undefined"/.test(component), "invalid numeric literal text should not appear");

  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) =>
    strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assert(forbiddenChanged.length === 0, `forbidden files changed: ${forbiddenChanged.join(", ")}`);

  const unexpectedChanged = changedFiles.filter((file) => {
    const allowed = [...allowedForThisTask, ...knownPriorBaselineChanges].some((pattern) => matchesPattern(file, pattern));
    return !allowed;
  });
  assert(unexpectedChanged.length === 0, `unexpected changed files: ${unexpectedChanged.join(", ")}`);

  const response = await fetch(PAGE_URL);
  assert(response.ok, `/upload/history HTTP ${response.status}`);

  const screenshots = await runBrowserAudit();
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: "PASS",
        route: "/upload/history",
        screenshotDir,
        screenshots,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({
    status: "PASS",
    page: "/upload/history",
    screenshotManifest: manifestPath,
    screenshots,
    changedFiles,
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    message: error instanceof Error ? error.message : String(error),
    screenshotDir,
  }, null, 2));
  process.exit(1);
});
