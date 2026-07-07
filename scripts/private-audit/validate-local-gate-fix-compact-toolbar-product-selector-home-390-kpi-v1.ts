import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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

const ROOT = process.cwd();
const BASE_URL = process.env.LOCAL_GATE_FIX_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const checks: Check[] = [];

const requiredReadFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
] as const;

const citedProblemIds = [
  "PVM2-001",
  "PVM2-002",
  "PVM2-004",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-013",
] as const;

const requiredHomeKpis = ["GMV", "GSV", "投入产出比", "去退费比", "直接成交占比"] as const;
const forbiddenVisibleTokens = ["L1", "L2", "L3", "L4", "Primary", "Secondary", "Hidden KPI", "ProductRecord", "TrackedProductRecord"] as const;
const invalidTokens = ["NaN", "Infinity", "undefined"] as const;
const sensitiveTokens = ["rawRows", "previewRows", "warning 原文", "售后订单号", "退款编号", "交易号", "物流信息", "买家说明", "商家备注原文"] as const;
const forbiddenDirtyPrefixes = [
  "lib/etl/",
  "lib/bi/brand-model-semantic.ts",
  "lib/bi/bi.home-mapper.ts",
  "lib/bi/target-metric-definitions.ts",
  "lib/persistence/",
  "lib/state/",
  "lib/storage/",
  "lib/tmall/",
  "lib/v05/",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/",
  "private-samples/",
] as const;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gitStatusPathsSync = (): string[] => {
  const output = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) as string;
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.slice(3).trim();
      return rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
    });
};

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
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], { cwd: ROOT, stdio: "pipe" });
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
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  chrome.stdout.on("data", () => undefined);
  chrome.stderr.on("data", () => undefined);
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

const waitForKpiCount = async (client: CdpClient, selector: string, minCount: number): Promise<number> => {
  for (let index = 0; index < 100; index += 1) {
    const count = await evaluate<number>(client, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
    if (count >= minCount) return count;
    await wait(100);
  }
  return evaluate<number>(client, `document.querySelectorAll(${JSON.stringify(selector)}).length`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(200);
};

const click = async (client: CdpClient, selector: string) => {
  await waitForSelector(client, selector);
  await evaluate<void>(
    client,
    `document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))`,
  );
  await wait(300);
};

const runStaticChecks = () => {
  requiredReadFiles.forEach((relativePath) => addCheck(`read:${relativePath}`, exists(relativePath)));
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const home = read("components/home/home-bi-dashboard.tsx");
  const product = read("components/product-board/v1/product-board-v1-dashboard.tsx");

  addCheck("projectStateRead", projectState.includes("天猫 V1 内测排查版"));
  addCheck("problemIdsBound", citedProblemIds.every((problemId) => problemMatrix.includes(problemId)), citedProblemIds);
  addCheck("taskProtocolRead", protocol.includes("UI 只做展示和交互") && protocol.includes("全量 KPI 网格"));
  addCheck("uiBaselineRead", uiBaseline.includes("页面问题梳理第二版 · 全量 KPI 卡片网格基线"));
  addCheck("homeTimeRangePopoverSource", home.includes('testId="home-bi-time-range-popover"') && home.includes("home-bi-kpi-card"));
  addCheck("productRootSelectorSource", product.includes('data-testid="product-board-v1-dashboard"'));
  addCheck("productDoesNotRestoreAllProducts", !product.includes("所有宝贝"));

  const dirtyPaths = gitStatusPathsSync();
  const forbiddenDirtyPaths = dirtyPaths.filter((filePath) =>
    forbiddenDirtyPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix)) ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath),
  );
  addCheck("noForbiddenDirtyPaths", forbiddenDirtyPaths.length === 0, { dirtyPaths, forbiddenDirtyPaths });
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9482;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-local-gate-fix-chrome-"));
  const chrome = await launchChrome(port, profileDir);
  const client = await CdpClient.connect(await getDebuggerUrl(port));

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: BASE_URL.replace(/\/$/, "") });
    await wait(300);
    await evaluate<void>(
      client,
      `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "local-gate-fix@airburg.local", loggedInAt: "2026-07-06T00:00:00.000Z" }))`,
    );

    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await wait(800);

    for (const item of [
      { key: "day", label: "日" },
      { key: "week", label: "周" },
      { key: "month", label: "月" },
      { key: "custom", label: "自定义" },
    ] as const) {
      await click(client, `[data-testid='home-bi-time-range-popover-${item.key}-button']`);
      await waitForSelector(client, "[data-testid='home-bi-time-range-popover-panel']");
      const panel = await evaluate<{ mode: string | null; text: string }>(
        client,
        `(() => {
          const node = document.querySelector('[data-testid="home-bi-time-range-popover-panel"]');
          return { mode: node?.getAttribute('data-time-range-panel') || null, text: node?.textContent || '' };
        })()`,
      );
      addCheck(`home${item.key}PopoverSelector`, panel.mode === item.label && panel.text.length > 0, panel);
    }

    client.consoleErrors.length = 0;
    await setViewport(client, 390, 900);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await wait(800);
    const home390KpiCount = await waitForKpiCount(client, "[data-testid='home-bi-kpi-card']", 15);
    const home390KpiTitles = await evaluate<string[]>(
      client,
      `Array.from(document.querySelectorAll('[data-testid="home-bi-kpi-card"]')).map((node) => node.getAttribute("data-kpi-title") || "")`,
    );
    const home390FiveFieldLayout = await evaluate<boolean>(
      client,
      `Array.from(document.querySelectorAll('[data-testid="home-bi-kpi-card"]')).every((node) => {
        const text = node.textContent || "";
        return ["MTD目标","总目标","差值","完成率"].every((token) => text.includes(token)) && Boolean(node.getAttribute("data-kpi-five-field-layout"));
      })`,
    );
    const homeBodyText = await evaluate<string>(client, "document.body.innerText");
    const homeOverflow = await evaluate<boolean>(
      client,
      "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
    );
    addCheck("home390KpiCountAtLeast15", home390KpiCount >= 15, { home390KpiCount, home390KpiTitles });
    addCheck("home390RequiredKpisPresent", requiredHomeKpis.every((title) => home390KpiTitles.includes(title)), home390KpiTitles);
    addCheck("home390KpiFiveFieldLayout", home390FiveFieldLayout);
    addCheck("home390NoHorizontalOverflow", !homeOverflow);
    addCheck("home390ConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    addCheck("home390NoForbiddenVisibleTokens", forbiddenVisibleTokens.filter((token) => homeBodyText.includes(token)).length === 0);
    addCheck("home390NoInvalidText", invalidTokens.filter((token) => homeBodyText.includes(token)).length === 0);
    addCheck("home390NoSensitiveText", sensitiveTokens.filter((token) => homeBodyText.includes(token)).length === 0);

    client.consoleErrors.length = 0;
    await setViewport(client, 1440, 1000);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/product-board` });
    await waitForSelector(client, "[data-testid='product-board-v1-dashboard']");
    await wait(800);
    const productText = await evaluate<string>(client, "document.body.innerText");
    addCheck("productBoardRootSelector", true);
    addCheck("productBoardNoAllProducts", !productText.includes("所有宝贝"));
    addCheck("productBoardNoForbiddenEngineeringTokens", !productText.includes("ProductRecord") && !productText.includes("TrackedProductRecord"));
    addCheck("productBoardConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
  } finally {
    client.close();
    chrome.kill("SIGTERM");
    if (server) server.kill("SIGTERM");
  }
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

  const failedChecks = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({
    taskName: "LOCAL_GATE_FIX_COMPACT_TOOLBAR_PRODUCT_SELECTOR_AND_HOME_390_KPI_V1",
    status,
    checks,
    failedChecks,
    summary: {
      citedProblemIds,
      rootCauseClassification: {
        homeTimeRangePopoverSelector: "selector/runtime gate state mismatch; current UI selector is present",
        productBoardRootSelector: "selector/runtime gate state mismatch; current UI root selector is present",
        home390KpiCount: "validation runtime state mismatch; current mobile DOM exposes full KPI grid",
      },
    },
  }, null, 2));

  if (status !== "PASS") process.exitCode = 1;
};

main();
