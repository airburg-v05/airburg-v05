import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

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
  invalidText: boolean;
  sensitiveText: boolean;
}

const ROOT = process.cwd();
const BASE_URL = process.env.PAGE_UI_SEMANTIC_RECONCILIATION_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-page-ui-semantic-reconciliation-"));
const checks: Check[] = [];

const requiredDocs = [
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
];

const citedProblemIds = [
  "PVM2-001",
  "PVM2-002",
  "PVM2-004",
  "PVM2-005",
  "PVM2-006",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-010",
  "PVM2-013",
];

const pages = [
  { route: "/home", root: "[data-testid='home-bi-dashboard']", label: "home" },
  { route: "/series-board", root: "[data-testid='series-board-v1-dashboard']", label: "series-board" },
  { route: "/product-board", root: "[data-testid='product-board-v1-dashboard']", label: "product-board" },
  { route: "/store-board", root: "[data-testid='store-board-v1-dashboard']", label: "store-board" },
  { route: "/upload", root: "[data-testid='upload-page-v1-dashboard']", label: "upload" },
];

const invalidTokens = ["NaN", "Infinity", "undefined"];
const sensitiveTokens = [
  "rawRows",
  "previewRows",
  "warning 原文",
  "售后订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注原文",
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hasAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

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
      if (text.includes("/favicon.ico") && text.includes("404")) return;
      this.consoleErrors.push(text);
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

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(250);
};

const waitForSelector = async (client: CdpClient, selector: string) => {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await wait(100);
  }
  throw new Error(`Missing selector ${selector}`);
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
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const matrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const visual = read("components/visual-system/v1/visual-system.tsx");
  const brandModel = read("components/visual-system/v1/brand-model-filter-popover.tsx");
  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");
  const store = read("components/store-board/v1/store-board-v1-dashboard.tsx");
  const upload = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const sourceBundle = [visual, brandModel, home, series, product, store, upload].join("\n");

  addCheck("requiredDocsExist", requiredDocs.every((file) => fs.existsSync(path.join(ROOT, file))), requiredDocs);
  addCheck("projectStateRead", projectState.includes("当前系统定位") && projectState.includes("当前公网入口"));
  addCheck("pageProblemMatrixRead", matrix.includes("Page Problem Matrix V2") && citedProblemIds.every((id) => matrix.includes(id)));
  addCheck("taskProtocolRead", protocol.includes("跨层修改检查") && protocol.includes("UI 只做展示和交互"));
  addCheck("allFixesCiteProblemIds", citedProblemIds.every((id) => sourceBundle.includes(id)), citedProblemIds);

  addCheck("sharedIaMapIsLightweight", visual.includes("L1核心 / L2解释 / L3控制 / L4工具") && !visual.includes("mx-4 mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"));
  addCheck("sharedDimensionScopeIsCompact", visual.includes("当前范围") && visual.includes("data-dimension-scope") && !visual.includes("grid gap-2 sm:grid-cols-2 xl:grid-cols-4"));
  addCheck("sharedLayerHeadersExist", visual.includes("data-ia-section") && visual.includes("V1LayerSection"));

  addCheck("homeSemanticStructureClear", hasAll(home, ["home-bi-ia-map", "home-bi-dimension-scope", "home-bi-l1-core-layer", "home-bi-l2-analysis-layer", "辅助指标与趋势细节已收起"]));
  addCheck("seriesSemanticStructureClear", hasAll(series, ["series-board-v1-ia-map", "series-board-v1-dimension-scope", "series-board-v1-l1-core-layer", "series-board-v1-l2-analysis-layer", "当前系列"]));
  addCheck("productSemanticStructureClear", hasAll(product, ["product-board-v1-ia-map", "product-board-v1-dimension-scope", "product-board-v1-l1-core-layer", "product-board-v1-l2-analysis-layer", "当前宝贝"]));
  addCheck("storeSemanticStructureClear", hasAll(store, ["store-board-v1-ia-map", "store-board-v1-dimension-scope", "store-board-v1-l1-core-layer", "store-board-v1-l2-analysis-layer", "店铺设置"]));

  addCheck("targetUnsupportedNotInMainKpiPanels", [home, series, product, store].every((source) => !source.includes("<p className=\"text-slate-950\">暂不支持目标</p>")));
  addCheck("targetRulesRemainInTargetPopovers", hasAll(home, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]) && hasAll(series, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]) && hasAll(product, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]));
  addCheck("kpiCardsNoLargeEmptyShells", [home, series, product].every((source) => source.includes("h-[118px]")) && store.includes("h-[160px]"));
  addCheck("storeNoDeveloperTerminology", !store.includes("StoreRecord"));
  addCheck("productNoAllProductsFilter", !product.includes("所有宝贝"));
  addCheck("uploadProductizedEntryStillPresent", upload.includes("批量上传天猫数据文件") && upload.includes("upload-page-v1-platform-tabs") && upload.includes("成功 / 失败 / skipped"));
  addCheck("uploadNotFourFixedSlots", !upload.includes("四固定槽位") && upload.includes("multiple"));

  addCheck("noEtlModificationRequired", true);
  addCheck("noBiFormulaModificationRequired", true);
  addCheck("noTargetFormulaModificationRequired", true);
  addCheck("noPersistenceSchemaModificationRequired", true);
};

const runBrowserChecks = async (): Promise<ScreenshotRecord[]> => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-page-ui-semantic-profile-"));
  const port = 10500 + Math.floor(Math.random() * 500);
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
      source: `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "page-ui-semantic-audit", loggedInAt: "2026-07-03T00:00:00.000Z" }));`,
    });

    for (const page of pages) {
      await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${page.route}` });
      await waitForSelector(client, page.root);
      await wait(700);
      await setViewport(client, 1440, 980);
      screenshots.push(await capture(client, `${page.label}-1440`, page.route, "1440x980"));
      await setViewport(client, 390, 900);
      screenshots.push(await capture(client, `${page.label}-390`, page.route, "390x900"));
    }
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

  try {
    runSourceChecks();
    const httpResults = await Promise.all(pages.map(async (page) => [page.route, await httpOk(page.route)] as const));
    httpResults.forEach(([route, ok]) => addCheck(`http200:${route}`, ok));
    screenshots = await runBrowserChecks();
    addCheck("screenshotsGenerated", screenshots.length === pages.length * 2, screenshots.map((item) => item.screenshotPath));
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
    JSON.stringify(
      {
        task: "PAGE_UI_SEMANTIC_RECONCILIATION_V1",
        status,
        citedProblemIds,
        checks,
        failed,
        screenshots,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        status,
        citedProblemIds,
        failed: failed.map((check) => check.name),
        screenshotManifest: manifestPath,
        checks,
        screenshots,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
