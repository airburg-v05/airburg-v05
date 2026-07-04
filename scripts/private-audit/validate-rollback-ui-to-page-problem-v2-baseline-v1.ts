import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL" | "BLOCKED";

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

const ROOT = process.cwd();
const BASE_URL = process.env.ROLLBACK_UI_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const checks: Check[] = [];

const requiredDocs = [
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
];

const citedProblemIds = [
  "PVM2-001",
  "PVM2-002",
  "PVM2-003",
  "PVM2-004",
  "PVM2-005",
  "PVM2-006",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-010",
  "PVM2-011",
  "PVM2-013",
];

const pages = [
  { label: "home", route: "/home", root: "[data-testid='home-bi-dashboard']" },
  { label: "series", route: "/series-board", root: "[data-testid='series-board-v1-dashboard']" },
  { label: "product", route: "/product-board", root: "[data-testid='product-board-v1-dashboard']" },
  { label: "store", route: "/store-board", root: "[data-testid='store-board-v1-dashboard']" },
  { label: "upload", route: "/upload", root: "[data-testid='upload-page-v1-dashboard']" },
];

const pageFiles = [
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "components/store-board/v1/store-board-v1-dashboard.tsx",
  "components/upload/v1/upload-page-v1-dashboard.tsx",
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
  "StoreRecord",
  "ProductRecord",
  "TrackedProductRecord",
];

const visibleEngineeringTokens = [
  "IA",
  "L1核心",
  "L2解释",
  "L3控制",
  "L4工具",
  "Primary",
  "Secondary",
  "Hidden",
  "目标 required / derived / unsupported",
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

const waitForSelector = async (client: CdpClient, selector: string) => {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await wait(100);
  }
  throw new Error(`Missing selector ${selector}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(200);
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9339;
  const profileDir = fs.mkdtempSync(path.join("/tmp", "airburg-rollback-ui-chrome-"));
  const chrome = await launchChrome(port, profileDir);
  const client = await CdpClient.connect(await getDebuggerUrl(port));

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: BASE_URL.replace(/\/$/, "") });
    await wait(400);
    await evaluate<void>(
      client,
      `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "rollback-ui-audit@airburg.local", loggedInAt: "2026-07-03T00:00:00.000Z" }))`,
    );

    for (const page of pages) {
      for (const viewport of [
        { name: "1440", width: 1440, height: 1000 },
        { name: "390", width: 390, height: 900 },
      ]) {
        client.consoleErrors.length = 0;
        await setViewport(client, viewport.width, viewport.height);
        await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${page.route}` });
        await waitForSelector(client, page.root);
        await wait(800);
        const text = await evaluate<string>(client, "document.body.innerText");
        const overflow = await evaluate<boolean>(
          client,
          "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1",
        );
        addCheck(`${page.label}-${viewport.name}-httpAndRoot`, true);
        addCheck(`${page.label}-${viewport.name}-noHorizontalOverflow`, !overflow);
        addCheck(`${page.label}-${viewport.name}-consoleBusinessErrorsZero`, client.consoleErrors.length === 0, client.consoleErrors);
        addCheck(`${page.label}-${viewport.name}-noInvalidText`, !invalidTokens.some((token) => text.includes(token)));
        addCheck(`${page.label}-${viewport.name}-noSensitiveText`, !sensitiveTokens.some((token) => text.includes(token)));
        addCheck(`${page.label}-${viewport.name}-noVisibleEngineeringLabels`, !visibleEngineeringTokens.some((token) => text.includes(token)));
      }
    }
  } finally {
    client.close();
    chrome.kill("SIGTERM");
    if (server) server.kill("SIGTERM");
  }
};

const runStaticChecks = () => {
  requiredDocs.forEach((doc) => addCheck(`${doc}Exists`, fs.existsSync(path.join(ROOT, doc))));
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const matrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  addCheck("projectStateContainsPublicEntries", hasAll(projectState, ["/home", "/series-board", "/product-board", "/store-board", "/upload"]));
  addCheck("taskProtocolContainsLayerChecks", hasAll(protocol, ["是否允许改 ETL", "是否允许改 BI", "是否允许改 Target", "是否允许改 UI"]));
  addCheck("problemMatrixCoversCitedIds", citedProblemIds.every((id) => matrix.includes(id)), citedProblemIds);

  const pageSource = Object.fromEntries(pageFiles.map((file) => [file, read(file)]));
  const joinedPages = Object.values(pageSource).join("\n");
  addCheck("pagesDoNotRenderInformationArchitectureMap", !/V1InformationArchitectureMap/.test(joinedPages));
  addCheck("pagesDoNotExposePrimarySecondaryHiddenCopy", !/Primary:|Secondary:|Hidden KPI|目标 required \/ derived \/ unsupported/.test(joinedPages));
  addCheck("pagesUseTimeRangePopover", pageFiles.slice(0, 4).every((file) => pageSource[file].includes("V1TimeRangePopover")));
  addCheck("homeKpiFiveItemLayout", hasAll(pageSource["components/home/home-bi-dashboard.tsx"], ["MTD目标", "总目标", "差值", "完成率", "card.mtdTarget"]));
  addCheck("seriesKpiFiveItemLayout", hasAll(pageSource["components/series-board/v1/series-board-v1-dashboard.tsx"], ["MTD目标", "总目标", "差值", "完成率", "card.mtdTarget"]));
  addCheck("productKpiFiveItemLayout", hasAll(pageSource["components/product-board/v1/product-board-v1-dashboard.tsx"], ["MTD目标", "总目标", "差值", "完成率", "card.mtdTarget"]));
  addCheck("storeKpiFiveItemLayout", hasAll(pageSource["components/store-board/v1/store-board-v1-dashboard.tsx"], ["MTD目标", "总目标", "差值", "完成率", "card.mtdTarget"]));
  addCheck("missingMetricsStillDisplayed", hasAll(joinedPages, ["去退费比", "直接成交占比"]));
  addCheck(
    "productSelectorManualOnly",
    hasAll(pageSource["components/product-board/v1/product-board-v1-dashboard.tsx"], [
      "const importedProducts = new Map",
      "tempProducts.forEach",
      "source: \"temp\"",
      "暂无宝贝，请先添加商品ID",
    ]),
  );
  addCheck("productDoesNotRestoreAllProductsOption", !pageSource["components/product-board/v1/product-board-v1-dashboard.tsx"].includes("所有宝贝"));
  addCheck("storeReadsDebugContext", hasAll(pageSource["components/store-board/v1/store-board-v1-dashboard.tsx"], ["loadCrossPageDebugContext", "saveCrossPageDebugContextPatch", "storeKeysFromDebugStoreIds"]));
  addCheck("uploadProductizedPlatformButtons", hasAll(pageSource["components/upload/v1/upload-page-v1-dashboard.tsx"], ["天猫", "京东", "抖音", "有赞", "拼多多", "role=\"tablist\""]));
  addCheck("uploadDoesNotUseFourFixedSlots", !/四固定槽|固定槽位/.test(pageSource["components/upload/v1/upload-page-v1-dashboard.tsx"]));
  addCheck("uploadShowsSafeIssueCodes", hasAll(pageSource["components/upload/v1/upload-page-v1-dashboard.tsx"], ["safeCode", "成功", "失败", "skipped"]));
  addCheck("targetRulesStayInPopovers", hasAll(joinedPages, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]));
  addCheck("noSensitiveRuntimeText", !sensitiveTokens.some((token) => joinedPages.includes(token)));
};

const main = async () => {
  let status: Status = "PASS";
  try {
    runStaticChecks();
    await runBrowserChecks();
    if (checks.some((check) => !check.pass)) status = "FAIL";
  } catch (error) {
    status = "FAIL";
    addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
  }

  const output = {
    status,
    citedProblemIds,
    checks,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(status === "PASS" ? 0 : 1);
};

void main();
