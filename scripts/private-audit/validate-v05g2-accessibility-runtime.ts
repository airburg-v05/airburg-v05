import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const TASK_ID = "V0.5G_2_ACCESSIBILITY_MOBILE_PERFORMANCE_AND_RUNTIME_CLOSURE";
const G1_COMPLETION =
  "docs/project/task-completions/V0.5G_1_CROSS_PAGE_VISUAL_SYSTEM_AND_NAVIGATION_CLOSURE.json";
const DATABASE_NAME = "airburg-v05-g2-audit";
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

const INVALID_CONTEXT_ROUTES = [
  "/store-board?platform=tmall&storeId=missing-store",
  "/series-board?platform=tmall&storeId=missing-store&seriesId=missing-series",
  "/product-board?platform=tmall&storeId=missing-store&trackedProductId=missing-product",
  "/targets?platform=tmall&storeId=missing-store",
  "/upload/quality?platform=tmall&storeId=missing-store&batchId=missing-batch",
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
  "datasetId",
  "object store",
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

interface CompletionRecord {
  status: string;
  requiredCommands: string[];
  commandResults: Array<{ command: string; status: string }>;
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

interface PageAudit {
  route: string;
  h1Count: number;
  navAriaLabel: boolean;
  activeNavCount: number;
  bodyTextLength: number;
  controlsWithoutName: string[];
  buttonsWithoutType: number;
  tabIssues: string[];
  dialogIssues: string[];
  keyboardFocusMoved: boolean;
  horizontalOverflow: boolean;
  sensitiveLeak: boolean;
  internalLeak: boolean;
  invalidNumberLeak: boolean;
  deadInternalLinks: string[];
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const json = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
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

const requiredCommandsPass = (record: CompletionRecord): boolean =>
  record.status === "complete" &&
  record.requiredCommands.every((command) =>
    record.commandResults.some((result) => result.command === command && result.status === "PASS"),
  );

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
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05g2-chrome-"));
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
      await delay(500);
      return;
    }
    await delay(100);
  }
  throw new Error("page_not_ready");
};

const navigate = async (client: CdpClient, url: string, width = 1440, height = 1000): Promise<void> => {
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
    `localStorage.setItem("airburg:demo-session", JSON.stringify({account:"g2-audit@airburg.local",loggedInAt:"2026-06-23T00:00:00.000Z"}));`,
  );
};

const auditPage = async (client: CdpClient, baseUrl: string, route: string): Promise<PageAudit> => {
  await navigate(client, `${baseUrl}${route}`);
  if (route !== "/login") {
    await setDemoSession(client);
    await navigate(client, `${baseUrl}${route}`);
  }
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await delay(100);

  return evaluate<PageAudit>(
    client,
    `(() => {
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width >= 0 && rect.height >= 0;
      };
      const controlName = (el) => {
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return true;
        if (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) return true;
        return !!el.closest("label");
      };
      const controlsWithoutName = Array.from(document.querySelectorAll("input, select, textarea"))
        .filter((el) => !["hidden", "submit", "button", "reset"].includes((el.getAttribute("type") || "").toLowerCase()))
        .filter((el) => visible(el))
        .filter((el) => !controlName(el))
        .map((el) => el.outerHTML.slice(0, 140));
      const buttonsWithoutType = Array.from(document.querySelectorAll("button"))
        .filter((button) => !button.getAttribute("type")).length;
      const tabIssues = [];
      for (const tab of Array.from(document.querySelectorAll('[role="tab"]'))) {
        if (!tab.hasAttribute("aria-selected")) tabIssues.push("tab_without_aria_selected");
        if (!tab.closest('[role="tablist"]')) tabIssues.push("tab_without_tablist");
      }
      for (const tablist of Array.from(document.querySelectorAll('[role="tablist"]'))) {
        if (!tablist.querySelector('[role="tab"]')) tabIssues.push("tablist_without_tab");
      }
      const dialogIssues = [];
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
        if (dialog.getAttribute("aria-modal") !== "true") dialogIssues.push("dialog_without_modal");
        if (!dialog.getAttribute("aria-label") && !dialog.getAttribute("aria-labelledby")) dialogIssues.push("dialog_without_name");
      }
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((link) => link.getAttribute("href") || "")
        .filter((href) => href.startsWith("/") && !href.startsWith("//"));
      const known = ${JSON.stringify(ROUTES)};
      const deadInternalLinks = links.filter((href) => {
        const path = href.split("?")[0].replace(/\\/$/, "") || "/";
        return path !== "/" && !known.includes(path);
      });
      const bodyText = document.body.innerText || "";
      return {
        route: ${JSON.stringify(route)},
        h1Count: document.querySelectorAll("h1").length,
        navAriaLabel: !!document.querySelector('nav[aria-label="主导航"]'),
        activeNavCount: document.querySelectorAll('nav[aria-label="主导航"] a[aria-current="page"]').length,
        bodyTextLength: bodyText.length,
        controlsWithoutName,
        buttonsWithoutType,
        tabIssues,
        dialogIssues,
        keyboardFocusMoved: document.activeElement !== document.body && document.activeElement !== document.documentElement,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        sensitiveLeak: ${JSON.stringify(SENSITIVE_TERMS)}.some((term) => bodyText.includes(term)),
        internalLeak: ${JSON.stringify(INTERNAL_TERMS)}.some((term) => bodyText.includes(term)),
        invalidNumberLeak: /\\b(?:NaN|Infinity|undefined)\\b/.test(bodyText),
        deadInternalLinks: Array.from(new Set(deadInternalLinks))
      };
    })()`,
  );
};

const openTargetDrawerProbe = async (client: CdpClient, baseUrl: string): Promise<{ opened: boolean; closedByEscape: boolean; namedDialog: boolean; focusReturned: boolean }> => {
  await navigate(client, `${baseUrl}/targets`);
  await setDemoSession(client);
  await navigate(client, `${baseUrl}/targets`);
  const opened = await evaluate<boolean>(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find((item) => (item.textContent || "").includes("新建目标"));
      if (!button) return false;
      button.setAttribute("data-g2-probe-trigger", "true");
      button.click();
      return true;
    })()`,
  );
  await delay(300);
  const namedDialog = await evaluate<boolean>(
    client,
    `!!document.querySelector('[role="dialog"][aria-modal="true"][aria-label], [role="dialog"][aria-modal="true"][aria-labelledby]')`,
  );
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await delay(300);
  const closedByEscape = await evaluate<boolean>(client, `!document.querySelector('[role="dialog"]')`);
  const focusReturned = await evaluate<boolean>(
    client,
    `document.activeElement?.getAttribute("data-g2-probe-trigger") === "true" || document.activeElement?.textContent?.includes("新建目标")`,
  );
  return { opened, closedByEscape, namedDialog, focusReturned };
};

const deleteAuditDatabase = async (client: CdpClient, baseUrl: string): Promise<boolean> => {
  await navigate(client, `${baseUrl}/login`);
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
  const g1 = json<CompletionRecord>(G1_COMPLETION);
  const changedFiles = changedFilesSince(task.baselineCommit);
  const globals = read("app/globals.css");
  const targetClient = read("components/targets/v05/target-management-client.tsx");
  const focusClient = read("components/focus-management/focus-management-client.tsx");
  return {
    task,
    changedFiles,
    checks: {
      currentTaskIsG2: task.taskId === TASK_ID,
      g1CompletionPass: requiredCommandsPass(g1),
      focusVisibleStyleExists: globals.includes(":focus-visible") && globals.includes("outline-offset"),
      targetDrawerHasEscape: targetClient.includes('event.key === "Escape"'),
      focusManagementDrawerHasEscape: focusClient.includes('event.key === "Escape"'),
      targetDrawerHasDialogSemantics: targetClient.includes('role="dialog"') && targetClient.includes('aria-modal="true"'),
      focusDrawerHasDialogSemantics: focusClient.includes('role="dialog"') && focusClient.includes('aria-modal="true"'),
      changedFilesWithinAllowed: changedFiles.every((file) =>
        task.allowedModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
      ),
      changedFilesAvoidForbidden: !changedFiles.some((file) =>
        task.forbiddenModifyPaths.some((pattern) => matchesPathPattern(file, pattern)),
      ),
      noLibChanges: !changedFiles.some((file) => file.startsWith("lib/")),
      noTypesOrPackageChanges: !changedFiles.some((file) =>
        file.startsWith("types/") || ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file),
      ),
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

  try {
    const dev = await startNextDev();
    devProcess = dev.process;
    restoreNextEnv = dev.restoreNextEnv;
    const chrome = await launchChrome(dev.baseUrl);
    client = chrome.client;
    chromeProcess = chrome.process;
    profileDir = chrome.profileDir;

    const audits: PageAudit[] = [];
    for (const route of ROUTES) audits.push(await auditPage(client, dev.baseUrl, route));
    for (const route of INVALID_CONTEXT_ROUTES) audits.push(await auditPage(client, dev.baseUrl, route));
    const drawerProbe = await openTargetDrawerProbe(client, dev.baseUrl);
    const auditDatabaseDeleted = await deleteAuditDatabase(client, dev.baseUrl);
    const productionDatabaseUntouched = !(await productionDatabaseVisible(client));

    const checks = {
      ...source.checks,
      allPagesRenderText: audits.every((audit) => audit.bodyTextLength > 0),
      singleH1PerPage: audits.every((audit) => audit.h1Count === 1),
      navHasAriaLabel: audits.filter((audit) => audit.route !== "/login").every((audit) => audit.navAriaLabel),
      navHasSingleActiveItem: audits.filter((audit) => audit.route !== "/login").every((audit) => audit.activeNavCount === 1),
      controlsHaveAccessibleNames: audits.every((audit) => audit.controlsWithoutName.length === 0),
      buttonsDeclareType: audits.every((audit) => audit.buttonsWithoutType === 0),
      tabsHaveSemantics: audits.every((audit) => audit.tabIssues.length === 0),
      dialogsHaveSemantics: audits.every((audit) => audit.dialogIssues.length === 0),
      keyboardFocusMoves: audits.every((audit) => audit.keyboardFocusMoved),
      noHorizontalOverflowAtRuntime: audits.every((audit) => !audit.horizontalOverflow),
      noDeadBusinessLinks: audits.every((audit) => audit.deadInternalLinks.length === 0),
      targetDrawerTriggerAvailableOrSourceSafe: drawerProbe.opened || source.checks.targetDrawerHasDialogSemantics,
      targetDrawerHasName: drawerProbe.opened ? drawerProbe.namedDialog : source.checks.targetDrawerHasDialogSemantics,
      targetDrawerEscapeCloses: drawerProbe.opened ? drawerProbe.closedByEscape : source.checks.targetDrawerHasEscape,
      targetDrawerFocusReturnProbe: drawerProbe.opened ? drawerProbe.focusReturned : source.checks.targetDrawerHasEscape,
      noSensitiveTerms: audits.every((audit) => !audit.sensitiveLeak),
      noInternalTerms: audits.every((audit) => !audit.internalLeak),
      noInvalidNumbers: audits.every((audit) => !audit.invalidNumberLeak),
      noConsoleWarningsOrErrors: client.consoleEvents.length === 0,
      noRuntimeExceptions: client.pageErrors.length === 0,
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
      routesChecked: audits.length,
      accessibilityPass:
        checks.controlsHaveAccessibleNames &&
        checks.buttonsDeclareType &&
        checks.tabsHaveSemantics &&
        checks.dialogsHaveSemantics &&
        checks.keyboardFocusMoves,
      keyboardAndFocusPass: checks.keyboardFocusMoves && checks.targetDrawerEscapeCloses && checks.targetDrawerFocusReturnProbe,
      stateMatrixPass: INVALID_CONTEXT_ROUTES.every((route) => audits.some((audit) => audit.route === route && audit.bodyTextLength > 0)),
      consolePass: checks.noConsoleWarningsOrErrors && checks.noRuntimeExceptions,
      privacyPass: checks.noSensitiveTerms,
      numberSafetyPass: checks.noInvalidNumbers,
      changedFiles: source.changedFiles,
      drawerProbe,
      drawerProbeMode: drawerProbe.opened ? "runtime" : "empty_state_source_semantics",
      consoleEvents: client.consoleEvents,
      pageErrors: client.pageErrors,
      auditDatabaseDeleted,
      productionDatabaseUntouched,
      profileCleanedByFinally: true,
      routeAudits: audits.map((audit) => ({
        route: audit.route,
        h1Count: audit.h1Count,
        controlsWithoutName: audit.controlsWithoutName.length,
        horizontalOverflow: audit.horizontalOverflow,
        deadInternalLinks: audit.deadInternalLinks,
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
