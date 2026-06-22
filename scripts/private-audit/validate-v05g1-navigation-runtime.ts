import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE";
const DATABASE_NAME = "airburg-v05-g1-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";

const REQUIRED_NAV = [
  { label: "经营首页", href: "/home" },
  { label: "数据中心", href: "/upload" },
  { label: "店铺看板", href: "/store-board" },
  { label: "系列看板", href: "/series-board" },
  { label: "宝贝看板", href: "/product-board" },
  { label: "目标管理", href: "/targets" },
  { label: "安全数据", href: "/raw-data" },
] as const;

const DESKTOP_ROUTES = [
  ["desktop-login", "/login"],
  ["desktop-home", "/home"],
  ["desktop-upload", "/upload"],
  ["desktop-upload-history", "/upload/history"],
  ["desktop-upload-quality", "/upload/quality"],
  ["desktop-raw-data", "/raw-data"],
  ["desktop-targets", "/targets"],
  ["desktop-store-board", "/store-board"],
  ["desktop-series-board", "/series-board"],
  ["desktop-series-manage", "/series-board/manage"],
  ["desktop-product-board", "/product-board"],
  ["desktop-product-tracked", "/product-board/tracked"],
] as const;

const TABLET_ROUTES = [
  ["tablet-home", "/home"],
  ["tablet-upload", "/upload"],
  ["tablet-targets", "/targets"],
  ["tablet-store-board", "/store-board"],
  ["tablet-series-manage", "/series-board/manage"],
  ["tablet-product-tracked", "/product-board/tracked"],
] as const;

const MOBILE_ROUTES = [
  ["mobile-login", "/login"],
  ["mobile-home", "/home"],
  ["mobile-upload", "/upload"],
  ["mobile-upload-history", "/upload/history"],
  ["mobile-upload-quality", "/upload/quality"],
  ["mobile-raw-data", "/raw-data"],
  ["mobile-targets", "/targets"],
  ["mobile-store-board", "/store-board"],
  ["mobile-series-board", "/series-board"],
  ["mobile-series-manage", "/series-board/manage"],
  ["mobile-product-board", "/product-board"],
  ["mobile-product-tracked", "/product-board/tracked"],
] as const;

const ROUTES = [
  ...DESKTOP_ROUTES.map(([name, route]) => ({ name, route, width: 1440, height: 1000 })),
  ...TABLET_ROUTES.map(([name, route]) => ({ name, route, width: 768, height: 920 })),
  ...MOBILE_ROUTES.map(([name, route]) => ({ name, route, width: 390, height: 844 })),
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

const INTERNAL_TERMS = [
  "active pointer",
  "readback",
  "V2 staging",
  "legacy adapter",
  "第一阶段",
  "天猫数据分析 V1",
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
  method?: string;
  params?: Record<string, unknown>;
}

interface ChromeTarget {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface ScreenshotRecord {
  name: string;
  route: string;
  viewport: { width: number; height: number };
  path: string;
  sha256: string;
}

interface RouteAudit {
  name: string;
  route: string;
  viewport: { width: number; height: number };
  statusText: string;
  expectedActiveNav: string | null;
  activeNav: string | null;
  navLabels: string[];
  bodyTextLength: number;
  h1Count: number;
  horizontalOverflow: boolean;
  sensitiveLeak: boolean;
  internalTermLeak: boolean;
  invalidNumberLeak: boolean;
  screenshotPath: string;
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("free_port_unavailable"));
      });
    });
    server.on("error", reject);
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  throw new Error(`server_not_ready:${url}`);
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

const startNextDev = async (): Promise<{
  baseUrl: string;
  process: ChildProcess;
  restoreNextEnv: () => void;
}> => {
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
  private socket: WebSocket;
  private commandId = 0;
  private pending = new Map<number, (response: CdpResponse) => void>();
  readonly consoleEvents: string[] = [];
  readonly pageErrors: string[] = [];

  constructor(webSocketDebuggerUrl: string) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  connect = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("cdp_socket_error")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const response = JSON.parse(String(event.data)) as CdpResponse;
      if (typeof response.id === "number") {
        const callback = this.pending.get(response.id);
        if (callback) {
          this.pending.delete(response.id);
          callback(response);
        }
        return;
      }
      if (response.method === "Runtime.consoleAPICalled") {
        const params = response.params ?? {};
        const type = String(params.type ?? "");
        const args = Array.isArray(params.args) ? params.args : [];
        const text = args.map((arg) => String((arg as { value?: unknown; description?: string }).value ?? (arg as { description?: string }).description ?? "")).join(" ");
        if (["error", "warning", "warn"].includes(type)) {
          this.consoleEvents.push(`${type}:${text}`);
        }
      }
      if (response.method === "Runtime.exceptionThrown") {
        this.pageErrors.push(JSON.stringify(response.params ?? {}));
      }
    });
  };

  send = async (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const id = ++this.commandId;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message ?? `${method}_failed`));
          return;
        }
        resolve(response.result ?? {});
      });
      this.socket.send(payload);
    });
  };

  close = (): void => this.socket.close();
}

const launchChrome = async (baseUrl: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  profileDir: string;
}> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05g1-chrome-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--window-size=1440,1000",
    `${baseUrl}/login`,
  ], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const debugPort = await waitForDevToolsPort(profileDir);
  const target = await getPageTarget(debugPort);
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  return { client, process: child, profileDir };
};

const waitForReady = async (client: CdpClient): Promise<void> => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const result = await client.send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if ((result.result as { value?: string } | undefined)?.value === "complete") {
        await delay(500);
        return;
      }
    } catch {
      // keep waiting
    }
    await delay(100);
  }
  throw new Error("page_not_ready");
};

const navigate = async (client: CdpClient, url: string, width: number, height: number): Promise<void> => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 480,
  });
  await client.send("Page.navigate", { url });
  await waitForReady(client);
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const runtimeResult = result.result as { value?: T } | undefined;
  return runtimeResult?.value as T;
};

const setDemoSession = async (client: CdpClient): Promise<void> => {
  await evaluate<void>(
    client,
    `localStorage.setItem("airburg:demo-session", JSON.stringify({account:"g1-audit@airburg.local",loggedInAt:"2026-06-23T00:00:00.000Z"}));`,
  );
};

const expectedActiveNav = (route: string): string | null => {
  if (route.startsWith("/upload")) return "数据中心";
  if (route.startsWith("/series-board")) return "系列看板";
  if (route.startsWith("/product-board")) return "宝贝看板";
  if (route.startsWith("/home")) return "经营首页";
  if (route.startsWith("/store-board")) return "店铺看板";
  if (route.startsWith("/targets")) return "目标管理";
  if (route.startsWith("/raw-data")) return "安全数据";
  return null;
};

const auditPage = async (
  client: CdpClient,
  baseUrl: string,
  screenshotDir: string,
  item: (typeof ROUTES)[number],
): Promise<{ audit: RouteAudit; screenshot: ScreenshotRecord }> => {
  await navigate(client, `${baseUrl}${item.route}`, item.width, item.height);
  if (item.route !== "/login") {
    await setDemoSession(client);
    await navigate(client, `${baseUrl}${item.route}`, item.width, item.height);
  }

  const pageState = await evaluate<{
    bodyText: string;
    h1Count: number;
    scrollWidth: number;
    clientWidth: number;
    navLabels: string[];
    activeNav: string | null;
  }>(client, `(() => {
    const navLinks = Array.from(document.querySelectorAll('nav[aria-label="主导航"] a'));
    return {
      bodyText: document.body.innerText || "",
      h1Count: document.querySelectorAll("h1").length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      navLabels: navLinks.map((link) => (link.textContent || "").trim()),
      activeNav: (navLinks.find((link) => link.getAttribute("aria-current") === "page")?.textContent || null)
    };
  })()`);

  const screenshotResult = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const data = String(screenshotResult.data ?? "");
  const bytes = Buffer.from(data, "base64");
  const screenshotPath = path.join(screenshotDir, `${item.name}.png`);
  fs.writeFileSync(screenshotPath, bytes);
  const screenshotHash = sha256(bytes);

  const expected = expectedActiveNav(item.route);
  const bodyText = pageState.bodyText;
  const audit: RouteAudit = {
    name: item.name,
    route: item.route,
    viewport: { width: item.width, height: item.height },
    statusText: bodyText.slice(0, 120),
    expectedActiveNav: expected,
    activeNav: pageState.activeNav,
    navLabels: pageState.navLabels,
    bodyTextLength: bodyText.length,
    h1Count: pageState.h1Count,
    horizontalOverflow: pageState.scrollWidth > pageState.clientWidth + 2,
    sensitiveLeak: SENSITIVE_TERMS.some((term) => bodyText.includes(term)),
    internalTermLeak: INTERNAL_TERMS.some((term) => bodyText.includes(term)),
    invalidNumberLeak: /\b(?:NaN|Infinity|undefined)\b/.test(bodyText),
    screenshotPath,
  };

  return {
    audit,
    screenshot: {
      name: item.name,
      route: item.route,
      viewport: { width: item.width, height: item.height },
      path: screenshotPath,
      sha256: screenshotHash,
    },
  };
};

const deleteAuditDatabase = async (client: CdpClient, baseUrl: string): Promise<boolean> => {
  await navigate(client, `${baseUrl}/login`, 1440, 900);
  return evaluate<boolean>(client, `new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  })`);
};

const productionDatabaseVisible = async (client: CdpClient): Promise<boolean> =>
  evaluate<boolean>(client, `indexedDB.databases ? indexedDB.databases().then((dbs) => dbs.some((db) => db.name === ${JSON.stringify(PRODUCTION_DATABASE_NAME)})) : false`);

const main = async () => {
  let devProcess: ChildProcess | null = null;
  let chromeProcess: ChildProcess | null = null;
  let profileDir: string | null = null;
  let restoreNextEnv: (() => void) | null = null;
  let client: CdpClient | null = null;
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05g1-screenshots-"));

  try {
    const dev = await startNextDev();
    devProcess = dev.process;
    restoreNextEnv = dev.restoreNextEnv;
    const chrome = await launchChrome(dev.baseUrl);
    client = chrome.client;
    chromeProcess = chrome.process;
    profileDir = chrome.profileDir;

    const audits: RouteAudit[] = [];
    const screenshots: ScreenshotRecord[] = [];

    for (const item of ROUTES) {
      const result = await auditPage(client, dev.baseUrl, screenshotDir, item);
      audits.push(result.audit);
      screenshots.push(result.screenshot);
    }

    const auditDatabaseDeleted = await deleteAuditDatabase(client, dev.baseUrl);
    const productionDatabaseUntouched = !(await productionDatabaseVisible(client));
    const manifestPath = path.join(screenshotDir, "manifest.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          taskId: TASK_ID,
          databaseName: DATABASE_NAME,
          screenshotCount: screenshots.length,
          screenshots,
        },
        null,
        2,
      ),
    );

    const expectedNavLabels = REQUIRED_NAV.map((item) => item.label);
    const failedChecks = [
      screenshots.length >= 30 ? null : "screenshotCountAtLeast30",
      audits.every((audit) => audit.route === "/login" || audit.navLabels.join("|") === expectedNavLabels.join("|")) ? null : "navLabels",
      audits.every((audit) => audit.expectedActiveNav === null || audit.activeNav === audit.expectedActiveNav) ? null : "activeNav",
      audits.every((audit) => audit.bodyTextLength > 0) ? null : "bodyTextRendered",
      audits.every((audit) => audit.h1Count <= 1 || audit.route === "/login") ? null : "singlePrimaryHeading",
      audits.every((audit) => !audit.horizontalOverflow) ? null : "horizontalOverflow",
      audits.every((audit) => !audit.sensitiveLeak) ? null : "sensitiveLeak",
      audits.every((audit) => !audit.internalTermLeak) ? null : "internalTermLeak",
      audits.every((audit) => !audit.invalidNumberLeak) ? null : "invalidNumberLeak",
      client.consoleEvents.length === 0 ? null : "consoleWarningsOrErrors",
      client.pageErrors.length === 0 ? null : "pageErrors",
      auditDatabaseDeleted ? null : "auditDatabaseDeleted",
      productionDatabaseUntouched ? null : "productionDatabaseUntouched",
    ].filter(Boolean) as string[];

    const output = {
      status: failedChecks.length === 0 ? "PASS" : "FAIL",
      taskId: TASK_ID,
      databaseName: DATABASE_NAME,
      screenshotManifestPath: manifestPath,
      screenshotCount: screenshots.length,
      failedChecks,
      mobile390NoOverflow: audits
        .filter((audit) => audit.viewport.width === 390)
        .every((audit) => !audit.horizontalOverflow),
      tablet768NoOverflow: audits
        .filter((audit) => audit.viewport.width === 768)
        .every((audit) => !audit.horizontalOverflow),
      desktop1440NoOverflow: audits
        .filter((audit) => audit.viewport.width === 1440)
        .every((audit) => !audit.horizontalOverflow),
      privacyPass: audits.every((audit) => !audit.sensitiveLeak),
      numberSafetyPass: audits.every((audit) => !audit.invalidNumberLeak),
      consoleEvents: client.consoleEvents,
      pageErrors: client.pageErrors,
      auditDatabaseDeleted,
      productionDatabaseUntouched,
      routeAudits: audits.map((audit) => ({
        name: audit.name,
        route: audit.route,
        viewport: audit.viewport,
        expectedActiveNav: audit.expectedActiveNav,
        activeNav: audit.activeNav,
        horizontalOverflow: audit.horizontalOverflow,
        h1Count: audit.h1Count,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
    if (failedChecks.length > 0) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({
      status: "FAIL",
      taskId: TASK_ID,
      databaseName: DATABASE_NAME,
      screenshotManifestPath: null,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (client) client.close();
    await stopProcess(chromeProcess);
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    await stopProcess(devProcess);
    if (restoreNextEnv) restoreNextEnv();
  }
};

void main();
