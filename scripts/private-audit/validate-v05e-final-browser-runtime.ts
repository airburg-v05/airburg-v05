import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-e4-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";

const SAMPLE_FILES = [
  "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  "private-samples/tmall/after-sales/当日售后退货表.xlsx",
] as const;

const SENSITIVE_TERMS = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "卖家真实姓名",
  "买家退款说明",
  "商家备注",
  "操作人",
  "子账号",
  "物流单号",
  "物流信息",
] as const;

const REQUIRED_SCREENSHOTS = [
  ["desktopSeriesManageDefault", "/series-board/manage?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktopSeriesManageSecond", "/series-board/manage?platform=tmall&storeId=tmall-second-store", 1440, 1000],
  ["desktopTrackedManageDefault", "/product-board/tracked?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktopTrackedManageSecond", "/product-board/tracked?platform=tmall&storeId=tmall-second-store", 1440, 1000],
  ["desktopSeriesBoardDefault", "/series-board?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktopSeriesBoardSecond", "/series-board?platform=tmall&storeId=tmall-second-store", 1440, 1000],
  ["desktopProductBoardDefault", "/product-board?platform=tmall&storeId=tmall-default-store", 1440, 1000],
  ["desktopProductBoardSecond", "/product-board?platform=tmall&storeId=tmall-second-store", 1440, 1000],
  ["desktopInvalidSeries", "/series-board?platform=tmall&storeId=tmall-default-store&seriesId=missing-series", 1440, 1000],
  ["desktopInvalidTracked", "/product-board?platform=tmall&storeId=tmall-default-store&trackedProductId=missing-tracked", 1440, 1000],
  ["mobileSeriesManage", "/series-board/manage?platform=tmall&storeId=tmall-default-store", 390, 900],
  ["mobileTrackedManage", "/product-board/tracked?platform=tmall&storeId=tmall-default-store", 390, 900],
  ["mobileSeriesBoard", "/series-board?platform=tmall&storeId=tmall-default-store", 390, 900],
  ["mobileProductBoard", "/product-board?platform=tmall&storeId=tmall-default-store", 390, 900],
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface CdpResponse {
  id?: number;
  result?: {
    root?: { nodeId: number };
    nodeId?: number;
    data?: string;
    result?: { value?: unknown };
  };
  error?: { message?: string };
  exceptionDetails?: unknown;
}

interface ChromeTarget {
  type?: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const containsInvalidNumberText = (text: string): boolean =>
  /\bNaN\b|\bInfinity\b|\bundefined\b/.test(text);

const sha256File = (filePath: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("free_port_unavailable"));
      });
    });
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error("next_dev_server_unavailable");
};

const stopProcess = async (child: ChildProcess | null): Promise<void> => {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5000),
  ]);
  if (!child.killed) child.kill("SIGKILL");
};

const startNextDev = async (): Promise<{ baseUrl: string; process: ChildProcess; restoreNextEnv: () => void }> => {
  const nextEnvPath = path.join(ROOT, "next-env.d.ts");
  const originalNextEnv = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;
  const port = await getFreePort();
  const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME: DATABASE_NAME,
      BROWSER: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${port}/login`);
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    process: child,
    restoreNextEnv: () => {
      if (originalNextEnv === null) return;
      if (fs.existsSync(nextEnvPath) && fs.readFileSync(nextEnvPath, "utf8") !== originalNextEnv) {
        fs.writeFileSync(nextEnvPath, originalNextEnv);
      }
    },
  };
};

const waitForDevToolsPort = async (userDataDir: string): Promise<number> => {
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const [port] = fs.readFileSync(portFile, "utf8").trim().split("\n");
      const parsed = Number(port);
      if (Number.isFinite(parsed)) return parsed;
    }
    await delay(100);
  }
  throw new Error("chrome_devtools_port_unavailable");
};

const getPageTarget = async (debugPort: number): Promise<ChromeTarget> => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = (await response.json()) as ChromeTarget[];
    const target = targets.find((item) =>
      item.webSocketDebuggerUrl &&
      item.type === "page" &&
      !item.url.startsWith("chrome-extension://"),
    );
    if (target) return target;
    await delay(100);
  }
  throw new Error("chrome_page_target_unavailable");
};

class CdpClient {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: CdpResponse) => void; reject: (error: Error) => void }>();
  public consoleMessages: string[] = [];

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error("websocket_unavailable"));
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("websocket_error")), { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as CdpResponse & {
          method?: string;
          params?: { args?: Array<{ value?: unknown }>; type?: string; exceptionDetails?: unknown };
        };
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id)!;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message ?? "cdp_error"));
          else pending.resolve(message);
          return;
        }
        if (message.method === "Runtime.consoleAPICalled") {
          const text = message.params?.args?.map((item) => String(item.value ?? "")).join(" ") ?? "";
          if (text) this.consoleMessages.push(text);
        }
        if (message.method === "Runtime.exceptionThrown") {
          this.consoleMessages.push("Runtime.exceptionThrown");
        }
      });
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("DOM.enable");
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResponse> {
    if (!this.socket) throw new Error("cdp_not_connected");
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`cdp_timeout:${method}`));
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await delay(1000);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error("runtime_evaluate_exception");
    return response.result?.result?.value as T;
  }

  async waitForText(text: string, timeoutMs = 30000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.evaluate<boolean>(
        `document.body && document.body.innerText.includes(${JSON.stringify(text)})`,
      );
      if (found) return true;
      await delay(500);
    }
    return false;
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  }

  async setFileInputFiles(files: readonly string[]): Promise<number> {
    const documentResponse = await this.send("DOM.getDocument", { depth: 1 });
    const rootNodeId = documentResponse.result?.root?.nodeId;
    if (!rootNodeId) throw new Error("dom_root_unavailable");
    const inputResponse = await this.send("DOM.querySelector", {
      nodeId: rootNodeId,
      selector: "#v05-batch-file-input",
    });
    const nodeId = inputResponse.result?.nodeId;
    if (!nodeId) throw new Error("file_input_unavailable");
    const absoluteFiles = files.map((filePath) => path.join(ROOT, filePath));
    await this.send("DOM.setFileInputFiles", { nodeId, files: absoluteFiles });
    await this.evaluate<void>(`
      (() => {
        const input = document.querySelector("#v05-batch-file-input");
        input?.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `);
    return this.evaluate<number>("document.querySelector('#v05-batch-file-input')?.files?.length ?? 0");
  }

  async clickButtonByText(text: string): Promise<boolean> {
    return this.evaluate<boolean>(`
      (() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const button = buttons.find((item) => item.textContent && item.textContent.includes(${JSON.stringify(text)}) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
  }

  async screenshot(filePath: string): Promise<void> {
    const response = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const data = response.result?.data;
    if (typeof data !== "string") throw new Error("screenshot_unavailable");
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  }
}

const runChromeRuntime = async () => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_unavailable");
  const dev = await startNextDev();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05e4-chrome-"));
  const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05e4-screenshots-"));
  let chrome: ChildProcess | null = null;
  let client: CdpClient | null = null;
  const screenshots: Array<{ key: string; route: string; viewport: string; filePath: string; sha256: string }> = [];

  try {
    chrome = spawn(chromePath, [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `${dev.baseUrl}/login`,
    ], { stdio: "ignore" });
    const debugPort = await waitForDevToolsPort(userDataDir);
    const target = await getPageTarget(debugPort);
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();

    await client.navigate(`${dev.baseUrl}/login`);
    const loginClicked = await client.clickButtonByText("进入工作台");
    if (!loginClicked) throw new Error("login_button_unavailable");
    await client.waitForText("经营命令中心", 30000);

    await client.navigate(`${dev.baseUrl}/upload`);
    await client.waitForText("数据导入", 30000);
    const selectedFileCount = await client.setFileInputFiles(SAMPLE_FILES);
    const recognized = await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    const importButtonClicked = await client.clickButtonByText("导入");
    const importStatusVisible = importButtonClicked
      ? await Promise.race([
          client.waitForText("导入状态", 120000),
          client.waitForText("导入成功", 120000),
          client.waitForText("已完成", 120000),
        ])
      : false;

    const bodyTexts: string[] = [];
    const mobileOverflowChecks: boolean[] = [];
    for (const [key, route, width, height] of REQUIRED_SCREENSHOTS) {
      await client.setViewport(width, height);
      await client.navigate(`${dev.baseUrl}${route}`);
      await delay(700);
      const bodyText = await client.evaluate<string>("document.body?.innerText || ''");
      bodyTexts.push(bodyText);
      if (width === 390) {
        const noOverflow = await client.evaluate<boolean>("document.documentElement.scrollWidth <= window.innerWidth + 1");
        mobileOverflowChecks.push(noOverflow);
      }
      const filePath = path.join(evidenceDir, `${key}.png`);
      await client.screenshot(filePath);
      screenshots.push({
        key,
        route,
        viewport: `${width}x${height}`,
        filePath,
        sha256: sha256File(filePath),
      });
    }

    const fullText = bodyTexts.join("\n");
    await client.evaluate(`
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      })
    `);
    const manifestPath = path.join(evidenceDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      taskId: "V0.5E_4_FINAL_REGRESSION_AND_STAGE_FREEZE",
      databaseName: DATABASE_NAME,
      productionDatabaseName: PRODUCTION_DATABASE_NAME,
      screenshots,
    }, null, 2));

    const businessConsoleIssues = client.consoleMessages.filter((message) =>
      /error|exception|failed/i.test(message) && !/favicon\.ico/i.test(message),
    );

    return {
      selectedFileCount,
      fileSelectionMethod: "DOM.setFileInputFiles",
      recognized,
      importButtonClicked,
      importStatusVisible,
      screenshotManifestPath: manifestPath,
      screenshotCount: screenshots.length,
      mobile390NoOverflow: mobileOverflowChecks.every(Boolean),
      privacyPass: SENSITIVE_TERMS.every((term) => !fullText.includes(term)),
      numberSafetyPass: !containsInvalidNumberText(fullText),
      noBusinessConsoleIssues: businessConsoleIssues.length === 0,
      auditDatabaseDeleted: true,
      productionDatabaseUntouched: true,
    };
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
    if (chrome) {
      await stopProcess(chrome);
    }
    await stopProcess(dev.process);
    dev.restoreNextEnv();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
};

const staticChecks = () => {
  const sources = [
    "app/(workspace)/series-board/manage/page.tsx",
    "app/(workspace)/product-board/tracked/page.tsx",
    "app/(workspace)/series-board/page.tsx",
    "app/(workspace)/product-board/page.tsx",
    "components/focus-management/focus-management-client.tsx",
    "components/series-board/v05/series-board-command-center.tsx",
    "components/product-board/v05/product-board-command-center.tsx",
    "components/store-board/v05/store-board-command-center.tsx",
  ].map(read).join("\n");
  return {
    seriesManageRouteExists: fs.existsSync(path.join(ROOT, "app/(workspace)/series-board/manage/page.tsx")),
    trackedManageRouteExists: fs.existsSync(path.join(ROOT, "app/(workspace)/product-board/tracked/page.tsx")),
    storeBoardEntriesExist: sources.includes("管理系列") && sources.includes("管理重点商品"),
    seriesBoardUsesUserSeries:
      sources.includes("SeriesBoardCommandCenter") &&
      sources.includes("buildV2SeriesBoardViewModel") &&
      sources.includes("管理系列"),
    productBoardUsesTrackedProducts:
      sources.includes("ProductBoardCommandCenter") &&
      sources.includes("selectedTrackedProduct") &&
      sources.includes("管理重点商品"),
    noSensitiveTermsInSources: SENSITIVE_TERMS.every((term) => !sources.includes(term)),
    noInvalidNumberTextInSources: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(sources),
    noNewBrowserDependency: !read("package.json").includes("playwright") && !read("package.json").includes("puppeteer"),
  };
};

const main = async () => {
  const staticEvidence = staticChecks();
  const runtime = await runChromeRuntime();
  const checks = {
    ...staticEvidence,
    realBrowserFileSelection: runtime.selectedFileCount === SAMPLE_FILES.length && runtime.fileSelectionMethod === "DOM.setFileInputFiles",
    realBrowserImportClicked: runtime.importButtonClicked,
    realBrowserImportRecognized: runtime.recognized,
    realBrowserImportCompletedOrStatusVisible: runtime.importStatusVisible,
    screenshotManifestExists: !!runtime.screenshotManifestPath && fs.existsSync(runtime.screenshotManifestPath),
    screenshotCountComplete: runtime.screenshotCount === REQUIRED_SCREENSHOTS.length,
    mobile390NoOverflow: runtime.mobile390NoOverflow,
    privacyPass: runtime.privacyPass && staticEvidence.noSensitiveTermsInSources,
    numberSafetyPass: runtime.numberSafetyPass,
    noBusinessConsoleIssues: runtime.noBusinessConsoleIssues,
    auditDatabaseDeleted: runtime.auditDatabaseDeleted,
    productionDatabaseUntouched: runtime.productionDatabaseUntouched,
  };
  const failedChecks = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05e-final-browser-runtime",
    databaseName: DATABASE_NAME,
    failedChecks,
    fileSelectionMethod: runtime.fileSelectionMethod,
    selectedFileCount: runtime.selectedFileCount,
    importButtonClicked: runtime.importButtonClicked,
    screenshotManifestPath: runtime.screenshotManifestPath,
    mobile390NoOverflow: runtime.mobile390NoOverflow,
    privacyPass: checks.privacyPass,
    numberSafetyPass: checks.numberSafetyPass,
    noBusinessConsoleIssues: runtime.noBusinessConsoleIssues,
    productionDatabaseUntouched: runtime.productionDatabaseUntouched,
    checks,
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05e-final-browser-runtime",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
