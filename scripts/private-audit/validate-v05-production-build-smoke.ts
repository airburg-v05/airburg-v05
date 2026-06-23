import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_4_POST_FREEZE_RELEASE_HANDOFF_AND_DEPLOYMENT_READINESS";
const DATABASE_NAME = "airburg-v05-release-handoff-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";

const ROUTES = [
  "/login",
  "/home",
  "/upload",
  "/upload/history",
  "/upload/quality",
  "/raw-data",
  "/targets",
  "/store-board",
  "/series-board",
  "/series-board/manage",
  "/product-board",
  "/product-board/tracked",
] as const;

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

const FORBIDDEN_RUNTIME_TERMS = ["NaN", "Infinity", "undefined"] as const;

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
  method?: string;
  params?: Record<string, unknown>;
}

interface ChromeTarget {
  type?: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const findChrome = (): string | null => chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

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
    server.on("error", reject);
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error("production_server_unavailable");
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
  readonly consoleMessages: string[] = [];
  readonly pageErrors: string[] = [];

  constructor(private readonly wsUrl: string) {}

  async connect(): Promise<void> {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      if (!this.socket) return reject(new Error("websocket_unavailable"));
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("websocket_error")), { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as CdpResponse & {
          params?: { args?: Array<{ value?: unknown; description?: string }>; type?: string };
        };
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id)!;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message ?? "cdp_error"));
          else pending.resolve(message);
          return;
        }
        if (message.method === "Runtime.consoleAPICalled") {
          const type = String(message.params?.type ?? "");
          const text = message.params?.args?.map((item) => String(item.value ?? item.description ?? "")).join(" ") ?? "";
          if (["error", "warning", "warn"].includes(type)) this.consoleMessages.push(`${type}:${text}`);
        }
        if (message.method === "Runtime.exceptionThrown") {
          this.pageErrors.push("Runtime.exceptionThrown");
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
      }, 45000);
    });
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
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

  async setViewport(width: number, height: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 480,
    });
  }

  async navigate(baseUrl: string, route: string, width = 1440, height = 1000): Promise<void> {
    await this.setViewport(width, height);
    await this.send("Page.navigate", { url: `${baseUrl}${route}` });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const ready = await this.evaluate<string>("document.readyState");
      if (ready === "complete") {
        await delay(500);
        return;
      }
      await delay(100);
    }
    throw new Error(`page_not_ready:${route}`);
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
}

const buildProduction = (): boolean => {
  execFileSync("npm", ["run", "build"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME: DATABASE_NAME },
  });
  return true;
};

const startProduction = async (): Promise<{ baseUrl: string; process: ChildProcess }> => {
  const port = await getFreePort();
  const child = spawn("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME: DATABASE_NAME },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/login`);
  return { baseUrl, process: child };
};

const launchChrome = async (baseUrl: string): Promise<{ client: CdpClient; process: ChildProcess; userDataDir: string }> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_unavailable");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05-release-handoff-chrome-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    `${baseUrl}/login`,
  ], { stdio: "ignore" });
  const debugPort = await waitForDevToolsPort(userDataDir);
  const target = await getPageTarget(debugPort);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  return { client, process: child, userDataDir };
};

const deleteAuditDatabase = async (client: CdpClient): Promise<{ auditDeleted: boolean; productionUntouched: boolean }> =>
  client.evaluate<{ auditDeleted: boolean; productionUntouched: boolean }>(`
    (async () => {
      const auditDeleted = await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      });
      const databases = "databases" in indexedDB ? await indexedDB.databases() : [];
      const names = databases.map((database) => database.name).filter(Boolean);
      return {
        auditDeleted: auditDeleted === true && !names.includes(${JSON.stringify(DATABASE_NAME)}),
        productionUntouched: !names.includes(${JSON.stringify(PRODUCTION_DATABASE_NAME)})
      };
    })()
  `);

const pageAudit = async (client: CdpClient, baseUrl: string, route: string, width: number, height: number) => {
  await client.navigate(baseUrl, route, width, height);
  const result = await client.evaluate<{
    bodyText: string;
    horizontalOverflow: boolean;
    resourceIssueCount: number;
    staticResourceIssueCount: number;
  }>(`
    (() => {
      const bodyText = document.body?.innerText || "";
      const resourceIssues = performance.getEntriesByType("resource")
        .filter((entry) => {
          const item = entry;
          const name = item.name || "";
          const responseStatus = item.responseStatus || 200;
          return responseStatus >= 400 && !name.includes("favicon.ico");
        });
      const staticResourceIssues = resourceIssues.filter((entry) => /_next|\\.css|\\.js|font/i.test(entry.name || ""));
      return {
        bodyText,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        resourceIssueCount: resourceIssues.length,
        staticResourceIssueCount: staticResourceIssues.length
      };
    })()
  `);
  return { route, width, height, ...result };
};

const main = async () => {
  let server: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  let client: CdpClient | null = null;
  let userDataDir: string | null = null;

  try {
    const buildPass = buildProduction();
    const started = await startProduction();
    server = started.process;
    const chromeRuntime = await launchChrome(started.baseUrl);
    client = chromeRuntime.client;
    chrome = chromeRuntime.process;
    userDataDir = chromeRuntime.userDataDir;

    await client.navigate(started.baseUrl, "/login");
    const loginClicked = await client.clickButtonByText("进入工作台");
    const homeAfterLogin = loginClicked ? await client.waitForText("经营命令中心", 30000) : false;

    await client.navigate(started.baseUrl, "/upload");
    await client.waitForText("数据导入", 30000);
    const selectedFileCount = await client.setFileInputFiles(SAMPLE_FILES);
    const recognized = await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    const importButtonClicked = await client.clickButtonByText("导入");
    const importCompleted = importButtonClicked
      ? await Promise.race([
          client.waitForText("导入状态", 180000),
          client.waitForText("导入成功", 180000),
          client.waitForText("success", 180000),
        ])
      : false;

    const desktopAudits = [];
    const mobileAudits = [];
    for (const route of ROUTES) {
      desktopAudits.push(await pageAudit(client, started.baseUrl, route, 1440, 1000));
      mobileAudits.push(await pageAudit(client, started.baseUrl, route, 390, 844));
    }
    const allText = [...desktopAudits, ...mobileAudits].map((audit) => audit.bodyText).join("\\n");
    const storage = await deleteAuditDatabase(client);
    const businessConsoleIssues = client.consoleMessages.filter((message) =>
      /error|exception|warning|warn/i.test(message) && !/favicon\\.ico/i.test(message),
    );

    const checks = {
      productionBuildPass: buildPass,
      productionServerStarted: true,
      loginPageOpened: desktopAudits.some((audit) => audit.route === "/login" && audit.bodyText.length > 0),
      loginToWorkbench: loginClicked && homeAfterLogin,
      uploadPageOpened: desktopAudits.some((audit) => audit.route === "/upload" && audit.bodyText.includes("数据导入")),
      realFileSelection: selectedFileCount === SAMPLE_FILES.length,
      realImportRecognized: recognized,
      realImportClicked: importButtonClicked,
      realImportCompleted: importCompleted,
      allTwelvePagesDesktopOpen: desktopAudits.length === ROUTES.length && desktopAudits.every((audit) => audit.bodyText.length > 0),
      allTwelvePagesMobileOpen: mobileAudits.length === ROUTES.length && mobileAudits.every((audit) => audit.bodyText.length > 0),
      staticResourcesLoad: [...desktopAudits, ...mobileAudits].every((audit) => audit.staticResourceIssueCount === 0),
      noBusiness404: [...desktopAudits, ...mobileAudits].every((audit) => audit.resourceIssueCount === 0),
      noBusinessConsoleIssues: businessConsoleIssues.length === 0,
      noRuntimeException: client.pageErrors.length === 0,
      noHydrationError: !client.consoleMessages.some((message) => /hydration/i.test(message)),
      noInvalidNumbers: FORBIDDEN_RUNTIME_TERMS.every((term) => !allText.includes(term)),
      mobile390NoOverflow: mobileAudits.every((audit) => !audit.horizontalOverflow),
      desktop1440StructureNormal: desktopAudits.every((audit) => !audit.horizontalOverflow),
      mainNavigationUsable: allText.includes("首页") && allText.includes("数据导入") && allText.includes("目标"),
      indexedDbAuditCreatedAndDeleted: storage.auditDeleted,
      productionDatabaseUntouched: storage.productionUntouched,
      privacyPass: SENSITIVE_TERMS.every((term) => !allText.includes(term)),
      rawDataSafe: desktopAudits.some((audit) => audit.route === "/raw-data" && audit.bodyText.includes("安全")),
      tempProfileWillBeCleaned: Boolean(userDataDir),
    };

    const failedChecks = Object.entries(checks)
      .filter(([, pass]) => !pass)
      .map(([name]) => name);

    console.log(JSON.stringify({
      status: failedChecks.length === 0 ? "PASS" : "FAIL",
      taskId: TASK_ID,
      databaseName: DATABASE_NAME,
      productionDatabaseName: PRODUCTION_DATABASE_NAME,
      failedChecks,
      selectedFileCount,
      fileSelectionMethod: "DOM.setFileInputFiles",
      importCompleted,
      routesChecked: ROUTES.length,
      productionBuildPass: checks.productionBuildPass,
      productionServerStarted: checks.productionServerStarted,
      auditDatabaseDeleted: storage.auditDeleted,
      productionDatabaseUntouched: storage.productionUntouched,
      mobile390NoOverflow: checks.mobile390NoOverflow,
      privacyPass: checks.privacyPass,
      numberSafetyPass: checks.noInvalidNumbers,
      consolePass: checks.noBusinessConsoleIssues && checks.noRuntimeException,
      staticResourcesLoad: checks.staticResourcesLoad,
      tempProfileCleanedByFinally: true,
      consoleMessages: client.consoleMessages,
      pageErrors: client.pageErrors,
      desktopAudits: desktopAudits.map(({ route, horizontalOverflow, resourceIssueCount }) => ({ route, horizontalOverflow, resourceIssueCount })),
      mobileAudits: mobileAudits.map(({ route, horizontalOverflow, resourceIssueCount }) => ({ route, horizontalOverflow, resourceIssueCount })),
    }, null, 2));

    if (failedChecks.length > 0) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      status: "FAIL",
      taskId: TASK_ID,
      databaseName: DATABASE_NAME,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (client) await client.close().catch(() => undefined);
    await stopProcess(chrome);
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
    await stopProcess(server);
  }
};

void main();
