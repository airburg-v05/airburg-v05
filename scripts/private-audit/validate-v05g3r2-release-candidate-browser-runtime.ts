import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE";
const DATABASE_NAME = "airburg-v05-g3r2-audit";
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

const VIEWPORTS = [
  { key: "mobile390", width: 390, height: 844 },
  { key: "tablet768", width: 768, height: 920 },
  { key: "desktop1440", width: 1440, height: 1000 },
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

const FORBIDDEN_RUNTIME_TERMS = [
  "NaN",
  "Infinity",
  "undefined",
  "用计划推广补齐",
  "使用计划推广补齐",
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface CurrentTask {
  taskId: string;
  baselineCommit: string;
  allowedModifyPaths: string[];
  forbiddenModifyPaths: string[];
}

interface CdpResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
  method?: string;
  params?: Record<string, unknown>;
}

interface ChromeTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface ScreenshotRecord {
  key: string;
  route: string;
  viewport: string;
  pageState: string;
  filePath: string;
  sha256: string;
  bytes: number;
  sensitiveCheckPass: boolean;
  numberSafetyPass: boolean;
}

interface LayoutAudit {
  route: string;
  viewport: string;
  scrollWidth: number;
  clientWidth: number;
  horizontalOverflow: boolean;
  tableOverflowContained: boolean;
  navOverflowContained: boolean;
  actionReachable: boolean;
  longTextSafe: boolean;
  durationMs: number;
  transferSize: number;
  bodyTextLength: number;
  sensitiveLeak: boolean;
  invalidNumberLeak: boolean;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const json = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const toPosix = (value: string): string => value.split(path.sep).join("/");

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedFile === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  return false;
};

const changedFilesSince = (commit: string): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", commit, "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean)),
  ).sort();
};

const findChrome = (): string | null => chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

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
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), delay(5000)]);
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
        const text = args
          .map((arg) => String((arg as { value?: unknown; description?: string }).value ?? (arg as { description?: string }).description ?? ""))
          .join(" ");
        if (["error", "warning", "warn"].includes(type)) this.consoleEvents.push(`${type}:${text}`);
      }
      if (response.method === "Runtime.exceptionThrown") {
        this.pageErrors.push(JSON.stringify(response.params ?? {}));
      }
    });
  };

  send = async (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
    const id = ++this.commandId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message ?? `${method}_failed`));
          return;
        }
        resolve(response.result ?? {});
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  };

  close = (): void => this.socket.close();
}

const launchChrome = async (baseUrl: string): Promise<{ client: CdpClient; process: ChildProcess; profileDir: string }> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05g3r2-chrome-"));
  const child = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--window-size=1440,1000",
      `${baseUrl}/login`,
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  const debugPort = await waitForDevToolsPort(profileDir);
  const target = await getPageTarget(debugPort);
  const client = new CdpClient(target.webSocketDebuggerUrl!);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  return { client, process: child, profileDir };
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return (result.result as { value?: T } | undefined)?.value as T;
};

const waitForReady = async (client: CdpClient): Promise<void> => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await evaluate<string>(client, "document.readyState");
    if (ready === "complete") {
      await delay(450);
      return;
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

const setDemoSession = async (client: CdpClient): Promise<void> => {
  await evaluate<void>(
    client,
    `localStorage.setItem("airburg:demo-session", JSON.stringify({account:"g3r2-release-audit@airburg.local",loggedInAt:"2026-06-23T00:00:00.000Z"}));`,
  );
};

const auditLayout = async (
  client: CdpClient,
  baseUrl: string,
  route: string,
  viewport: (typeof VIEWPORTS)[number],
  screenshotDir: string,
): Promise<{ audit: LayoutAudit; screenshot: ScreenshotRecord }> => {
  await navigate(client, `${baseUrl}${route}`, viewport.width, viewport.height);
  if (route !== "/login") {
    await setDemoSession(client);
    await navigate(client, `${baseUrl}${route}`, viewport.width, viewport.height);
  }

  const audit = await evaluate<LayoutAudit>(
    client,
    `(() => {
      const bodyText = document.body.innerText || "";
      const tables = Array.from(document.querySelectorAll("table"));
      const tableOverflowContained = tables.every((table) => {
        const parent = table.parentElement;
        if (!parent) return true;
        const style = window.getComputedStyle(parent);
        return table.scrollWidth <= parent.clientWidth + 2 || ["auto", "scroll"].includes(style.overflowX);
      });
      const navs = Array.from(document.querySelectorAll("nav, [aria-label*=导航], [role=tablist]"));
      const navOverflowContained = navs.every((nav) => {
        const style = window.getComputedStyle(nav);
        return nav.scrollWidth <= nav.clientWidth + 2 || ["auto", "scroll"].includes(style.overflowX);
      });
      const actions = Array.from(document.querySelectorAll("a,button")).filter((el) => {
        const text = (el.textContent || "").trim();
        return /目标设置|数据导入|管理|保存|取消|返回|查看/.test(text);
      });
      const actionReachable = actions.length === 0 || actions.some((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height >= 30 && rect.left < window.innerWidth && rect.right > 0;
      });
      const textNodes = Array.from(document.querySelectorAll("p,span,a,button,td,th,h1,h2,h3,label"));
      const longTextSafe = textNodes.every((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width <= window.innerWidth + 2;
      });
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        route: ${JSON.stringify(route)},
        viewport: ${JSON.stringify(viewport.key)},
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        tableOverflowContained,
        navOverflowContained,
        actionReachable,
        longTextSafe,
        durationMs: nav ? Math.round(nav.duration) : 0,
        transferSize: nav ? Math.round(nav.transferSize || 0) : 0,
        bodyTextLength: bodyText.length,
        sensitiveLeak: ${JSON.stringify(SENSITIVE_TERMS)}.some((term) => bodyText.includes(term)),
        invalidNumberLeak: ${JSON.stringify(FORBIDDEN_RUNTIME_TERMS)}.some((term) => bodyText.includes(term))
      };
    })()`,
  );

  const screenshotResult = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(String(screenshotResult.data ?? ""), "base64");
  const key = `${viewport.key}-${route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root"}`;
  const filePath = path.join(screenshotDir, `${key}.png`);
  fs.writeFileSync(filePath, bytes);
  return {
    audit,
    screenshot: {
      key,
      route,
      viewport: `${viewport.width}x${viewport.height}`,
      pageState: audit.bodyTextLength > 0 ? "rendered" : "empty",
      filePath,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      sensitiveCheckPass: !audit.sensitiveLeak,
      numberSafetyPass: !audit.invalidNumberLeak,
    },
  };
};

const clickInteractionProbe = async (client: CdpClient, baseUrl: string): Promise<{ tabSwitchPass: boolean; periodSwitchPass: boolean; mobileMenuPass: boolean }> => {
  await navigate(client, `${baseUrl}/home`, 390, 844);
  await setDemoSession(client);
  await navigate(client, `${baseUrl}/home`, 390, 844);
  const mobileMenuPass = await evaluate<boolean>(
    client,
    `(async () => {
      const open = Array.from(document.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "打开菜单");
      if (!open) return false;
      open.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const opened = !!document.querySelector('[aria-label="关闭菜单"]');
      const close = Array.from(document.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "关闭菜单");
      close?.click();
      return opened;
    })()`,
  );
  await navigate(client, `${baseUrl}/store-board`, 1440, 1000);
  await setDemoSession(client);
  await navigate(client, `${baseUrl}/store-board`, 1440, 1000);
  const periodSwitchPass = await evaluate<boolean>(
    client,
    `(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const week = buttons.find((button) => (button.textContent || "").trim() === "周");
      if (!week) return true;
      week.click();
      return true;
    })()`,
  );
  const tabSwitchPass = await evaluate<boolean>(
    client,
    `(() => {
      const tab = Array.from(document.querySelectorAll('[role="tab"], button')).find((item) => /GSV|访客|推广/.test(item.textContent || ""));
      if (!tab) return true;
      tab.click();
      return true;
    })()`,
  );
  return { tabSwitchPass, periodSwitchPass, mobileMenuPass };
};

const deleteAuditDatabase = async (client: CdpClient, baseUrl: string): Promise<boolean> => {
  await navigate(client, `${baseUrl}/login`, 1440, 900);
  return evaluate<boolean>(
    client,
    `new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    })`,
  );
};

const productionDatabaseVisible = async (client: CdpClient): Promise<boolean> =>
  evaluate<boolean>(
    client,
    `indexedDB.databases ? indexedDB.databases().then((dbs) => dbs.some((db) => db.name === ${JSON.stringify(PRODUCTION_DATABASE_NAME)})) : false`,
  );

const sourceChecks = () => {
  const task = json<CurrentTask>("docs/project/current-task.json");
  const changedFiles = changedFilesSince(task.baselineCommit);
  return {
    task,
    changedFiles,
    checks: {
      currentTaskIsG3R2: task.taskId === TASK_ID,
      changedFilesWithinAllowed: changedFiles.every((file) =>
        task.allowedModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
      ),
      changedFilesAvoidForbidden: !changedFiles.some((file) =>
        task.forbiddenModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
      ),
      noDependencyChanges: !changedFiles.some((file) =>
        ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file),
      ),
      noBusinessLibChanges: !changedFiles.some((file) => file.startsWith("lib/") || file.startsWith("types/")),
    },
  };
};

const main = async () => {
  const source = sourceChecks();
  let devProcess: ChildProcess | null = null;
  let chromeProcess: ChildProcess | null = null;
  let profileDir: string | null = null;
  let restoreNextEnv: (() => void) | null = null;
  let client: CdpClient | null = null;
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05g3r2-screenshots-"));

  try {
    const dev = await startNextDev();
    devProcess = dev.process;
    restoreNextEnv = dev.restoreNextEnv;
    const chrome = await launchChrome(dev.baseUrl);
    client = chrome.client;
    chromeProcess = chrome.process;
    profileDir = chrome.profileDir;

    const audits: LayoutAudit[] = [];
    const screenshots: ScreenshotRecord[] = [];
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        const result = await auditLayout(client, dev.baseUrl, route, viewport, screenshotDir);
        audits.push(result.audit);
        screenshots.push(result.screenshot);
      }
    }
    const interactionProbe = await clickInteractionProbe(client, dev.baseUrl);
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
    const manifestHash = sha256(fs.readFileSync(manifestPath));
    const screenshotFilesRetained = screenshots.every((record) => fs.existsSync(record.filePath));
    const auditDatabaseDeleted = await deleteAuditDatabase(client, dev.baseUrl);
    const productionDatabaseUntouched = !(await productionDatabaseVisible(client));

    const checks = {
      ...source.checks,
      allRoutesAtAllViewports: audits.length === ROUTES.length * VIEWPORTS.length,
      screenshotEvidenceCreated: screenshots.length === ROUTES.length * VIEWPORTS.length && fs.existsSync(manifestPath),
      screenshotFilesRetained,
      desktop1440CoversAllPages:
        screenshots.filter((item) => item.viewport === "1440x1000").length === ROUTES.length,
      mobile390CoversAllPages:
        screenshots.filter((item) => item.viewport === "390x844").length === ROUTES.length,
      tablet768CoversComplexPages:
        screenshots.filter((item) => item.viewport === "768x920").length >= 6,
      mobile390NoOverflow: audits.filter((audit) => audit.viewport === "mobile390").every((audit) => !audit.horizontalOverflow),
      tablet768NoOverflow: audits.filter((audit) => audit.viewport === "tablet768").every((audit) => !audit.horizontalOverflow),
      desktop1440NoOverflow: audits.filter((audit) => audit.viewport === "desktop1440").every((audit) => !audit.horizontalOverflow),
      tablesContainOverflow: audits.every((audit) => audit.tableOverflowContained),
      navsContainOverflow: audits.every((audit) => audit.navOverflowContained),
      primaryActionsReachable: audits.every((audit) => audit.actionReachable),
      longTextSafe: audits.every((audit) => audit.longTextSafe),
      noSlowNavigationOutliers: audits.every((audit) => audit.durationMs < 15000),
      noSensitiveTerms: audits.every((audit) => !audit.sensitiveLeak),
      noInvalidNumbers: audits.every((audit) => !audit.invalidNumberLeak),
      noConsoleWarningsOrErrors: client.consoleEvents.length === 0,
      noRuntimeExceptions: client.pageErrors.length === 0,
      interactionProbePass:
        interactionProbe.mobileMenuPass && interactionProbe.periodSwitchPass && interactionProbe.tabSwitchPass,
      auditDatabaseDeleted,
      productionDatabaseUntouched,
    };

    const failedChecks = Object.entries(checks)
      .filter(([, pass]) => !pass)
      .map(([name]) => name);

    const output = {
      status: failedChecks.length === 0 ? "PASS" : "FAIL",
      taskId: TASK_ID,
      databaseName: DATABASE_NAME,
      failedChecks,
      screenshotManifestPath: manifestPath,
      screenshotManifestSha256: manifestHash,
      screenshotCount: screenshots.length,
      screenshotFilesRetained,
      mobile390NoOverflow: checks.mobile390NoOverflow,
      tablet768NoOverflow: checks.tablet768NoOverflow,
      desktop1440NoOverflow: checks.desktop1440NoOverflow,
      performancePass: checks.noSlowNavigationOutliers && interactionProbe.mobileMenuPass,
      privacyPass: checks.noSensitiveTerms,
      numberSafetyPass: checks.noInvalidNumbers,
      consolePass: checks.noConsoleWarningsOrErrors && checks.noRuntimeExceptions,
      auditDatabaseDeleted,
      productionDatabaseUntouched,
      changedFiles: source.changedFiles,
      interactionProbe,
      consoleEvents: client.consoleEvents,
      pageErrors: client.pageErrors,
      audits: audits.map((audit) => ({
        route: audit.route,
        viewport: audit.viewport,
        horizontalOverflow: audit.horizontalOverflow,
        durationMs: audit.durationMs,
      })),
    };

    console.log(JSON.stringify(output, null, 2));
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
    if (client) client.close();
    await stopProcess(chromeProcess);
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    await stopProcess(devProcess);
    if (restoreNextEnv) restoreNextEnv();
  }
};

void main();
