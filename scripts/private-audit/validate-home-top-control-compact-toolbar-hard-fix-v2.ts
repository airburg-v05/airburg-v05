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

interface ScreenshotEntry {
  name: string;
  path: string;
}

const ROOT = process.cwd();
const BASE_URL = process.env.HOME_COMPACT_TOOLBAR_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const checks: Check[] = [];
const screenshots: ScreenshotEntry[] = [];
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-compact-toolbar-v2-"));
const manifestPath = path.join(screenshotDir, "manifest.json");

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

const citedProblemIds = ["PVM2-001", "PVM2-002", "PVM2-006", "PVM2-013"] as const;

const forbiddenDirtyPrefixes = [
  "components/upload/",
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

const requiredKpiTitles = [
  "GMV",
  "GSV",
  "投入产出比",
  "去退费比",
  "直接成交占比",
  "品牌词访客",
  "品牌词支付人数",
  "退货率（总）",
  "客单价",
  "转化率",
] as const;

const forbiddenVisibleTokens = [
  "LOGO",
  "L1",
  "L2",
  "L3",
  "L4",
  "Primary",
  "Secondary",
  "Hidden KPI",
  "StoreRecord",
  "ProductRecord",
  "TrackedProductRecord",
] as const;

const invalidTokens = ["NaN", "Infinity", "undefined"] as const;
const sensitiveTokens = ["rawRows", "previewRows", "warning 原文", "售后订单号", "退款编号", "交易号", "物流信息", "买家说明", "商家备注原文", "技术错误堆栈"] as const;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));
const hasAll = (source: string, tokens: readonly string[]): boolean => tokens.every((token) => source.includes(token));
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

const extractConstArrayItems = (source: string, constName: string): string[] => {
  const pattern = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const;`);
  const match = source.match(pattern);
  if (!match?.[1]) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
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

const click = async (client: CdpClient, selector: string) => {
  await waitForSelector(client, selector);
  await evaluate<void>(client, `document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))`);
  await wait(300);
};

const captureScreenshot = async (client: CdpClient, name: string) => {
  const result = await client.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const filePath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  screenshots.push({ name, path: filePath });
};

const runStaticChecks = () => {
  requiredReadFiles.forEach((relativePath) => addCheck(`read:${relativePath}`, exists(relativePath)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const home = read("components/home/home-bi-dashboard.tsx");
  const visualSystem = read("components/visual-system/v1/visual-system.tsx");

  addCheck("agentsRead", hasAll(agents, ["Tmall V1 Internal Beta Agent Protocol", "docs/UI_BASELINE_LOCK_V2.md"]));
  addCheck("projectStateRead", projectState.includes("天猫 V1 内测排查版"));
  addCheck("problemIdsBound", citedProblemIds.every((problemId) => problemMatrix.includes(problemId) && home.includes(problemId)), citedProblemIds);
  addCheck("protocolRead", hasAll(protocol, ["UI 只做展示和交互", "全量 KPI 网格"]));
  addCheck("uiBaselineRead", hasAll(uiBaseline, ["全量 KPI 网格", "当前为 `17`"]));

  const kpiTitles = extractConstArrayItems(home, "FULL_HOME_KPI_TITLES");
  addCheck("homeKpiCountAtLeast15", kpiTitles.length >= 15, kpiTitles);
  addCheck("homeKpiCountStill17", kpiTitles.length === 17, kpiTitles);
  addCheck("homeRequiredKpisPresent", requiredKpiTitles.every((title) => kpiTitles.includes(title)), kpiTitles);
  addCheck("homeFiveFieldLayoutSourcePresent", hasAll(home, ["当前值", "MTD目标", "总目标", "差值", "完成率", "progress"]));
  addCheck("homeLogoRemovedFromToolbar", !home.includes("home-bi-logo-button") && !home.includes("V1LogoAccountButton"));
  addCheck("homeCompactToolbarPresent", home.includes("home-bi-business-toolbar") && home.includes("home-bi-time-scope-toolbar"));
  addCheck("homeScopeBreadcrumbPresent", home.includes("scopeBreadcrumb") && home.includes('data-scope-variant="breadcrumb"'));
  addCheck("homeTimePopoverSplitVariant", home.includes('variant="split"') && visualSystem.includes('data-compact-popover="true"'));
  addCheck("timePopoverNoLongExplanation", !visualSystem.includes("当前仅调整页面统计范围，不改变数据源或 BI 计算口径") && !visualSystem.includes("选择单日日期"));
  addCheck("timePopoverHasCompactActions", hasAll(visualSystem, ["清除", "今天", "本周", "本月", "确定", "取消"]));

  const dirtyPaths = gitStatusPathsSync();
  const forbiddenDirtyPaths = dirtyPaths.filter((filePath) =>
    forbiddenDirtyPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix)) ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath),
  );
  addCheck("noForbiddenDirtyPaths", forbiddenDirtyPaths.length === 0, { dirtyPaths, forbiddenDirtyPaths });
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9412;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-compact-toolbar-chrome-"));
  const chrome = await launchChrome(port, profileDir);
  const client = await CdpClient.connect(await getDebuggerUrl(port));

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: BASE_URL.replace(/\/$/, "") });
    await wait(300);
    await evaluate<void>(client, `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "home-compact-toolbar@airburg.local", loggedInAt: "2026-07-04T00:00:00.000Z" }))`);

    client.consoleErrors.length = 0;
    await setViewport(client, 1440, 1080);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await wait(1000);

    const bodyText = await evaluate<string>(client, "document.body.innerText");
    const logoExists = await evaluate<boolean>(client, "Boolean(document.querySelector('[data-testid=\"home-bi-logo-button\"]'))");
    const businessHeight = await evaluate<number>(client, "document.querySelector('[data-testid=\"home-bi-business-toolbar\"]')?.getBoundingClientRect().height || 0");
    const timeScopeHeight = await evaluate<number>(client, "document.querySelector('[data-testid=\"home-bi-time-scope-toolbar\"]')?.getBoundingClientRect().height || 0");
    const controlHeight = await evaluate<number>(client, "document.querySelector('[data-testid=\"home-bi-controls\"]')?.getBoundingClientRect().height || 0");
    const timeButtons = await evaluate<string[]>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-time-range-popover\"] > button')).map((node) => node.textContent?.trim() || '')",
    );
    const scopeText = await evaluate<string>(client, "document.querySelector('[data-testid=\"home-bi-dimension-scope\"]')?.textContent || ''");
    const scopeVariant = await evaluate<string | null>(client, "document.querySelector('[data-testid=\"home-bi-dimension-scope\"]')?.getAttribute('data-scope-variant') || null");
    const kpiCount = await evaluate<number>(client, "document.querySelectorAll('[data-testid=\"home-bi-kpi-card\"]').length");
    const kpiTitles = await evaluate<string[]>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-kpi-card\"]')).map((node) => node.getAttribute('data-kpi-title') || '')",
    );
    const fiveFieldLayout = await evaluate<boolean>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-kpi-card\"]')).every((node) => ['当前值','MTD目标','总目标','差值','完成率'].every((token) => (node.textContent || '').includes(token)) && Boolean(node.getAttribute('data-kpi-five-field-layout')))",
    );
    const mainKpiText = await evaluate<string>(client, "document.querySelector('[data-testid=\"home-bi-kpi-section\"]')?.textContent || ''");
    const forbiddenVisible = forbiddenVisibleTokens.filter((token) => bodyText.includes(token));
    const invalidVisible = invalidTokens.filter((token) => bodyText.includes(token));
    const sensitiveVisible = sensitiveTokens.filter((token) => bodyText.includes(token));
    const missingKpis = requiredKpiTitles.filter((title) => !kpiTitles.includes(title));
    const horizontalOverflow1440 = await evaluate<boolean>(
      client,
      "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
    );

    addCheck("browser1440ConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    addCheck("browser1440LogoRemoved", !logoExists && !/\bLOGO\b/.test(bodyText) && !/(^|\n)空(\n|$)/.test(bodyText), { logoExists });
    addCheck("browser1440BusinessToolbarCompact", businessHeight <= 72, { businessHeight, controlHeight });
    addCheck("browser1440TimeScopeToolbarCompact", timeScopeHeight <= 56, { timeScopeHeight, controlHeight });
    addCheck("browser1440TimeButtonsIndependent", ["日", "周", "月", "自定义"].every((label) => timeButtons.includes(label)), timeButtons);
    addCheck("browser1440ScopeBreadcrumb", scopeVariant === "breadcrumb" && scopeText.includes("范围：") && scopeText.includes(" / "), { scopeVariant, scopeText });
    addCheck("browser1440ScopeNoEnglishLabels", !/\b(?:PLATFORM|STORE|SERIES|PRODUCT)\b/.test(scopeText), scopeText);
    addCheck("browser1440ScopeNotChipGrid", !Boolean(await evaluate<boolean>(client, "Boolean(document.querySelector('[data-testid=\"home-bi-dimension-scope\"] [data-dimension-scope]'))")));
    addCheck("browser1440HomeKpiCountAtLeast15", kpiCount >= 15, { kpiCount, kpiTitles });
    addCheck("browser1440HomeKpiCountStill17", kpiCount === 17, { kpiCount, kpiTitles });
    addCheck("browser1440RequiredKpisPresent", missingKpis.length === 0, { missingKpis, kpiTitles });
    addCheck("browser1440KpiFiveFieldLayout", fiveFieldLayout);
    addCheck("browser1440MainKpiNoTargetRulePollution", !hasAll(mainKpiText, ["自动推导的目标", "已隐藏的目标"]));
    addCheck("browser1440NoForbiddenVisibleTokens", forbiddenVisible.length === 0, forbiddenVisible);
    addCheck("browser1440NoInvalidText", invalidVisible.length === 0, invalidVisible);
    addCheck("browser1440NoSensitiveText", sensitiveVisible.length === 0, sensitiveVisible);
    addCheck("browser1440NoHorizontalOverflow", !horizontalOverflow1440);
    await captureScreenshot(client, "home-1440");
    await captureScreenshot(client, "home-toolbar-1440");

    const periodButtons = [
      { key: "day", label: "日", title: "选择日期", maxWidth: 322, mustInclude: ["清除", "今天", "确定", "取消"] },
      { key: "week", label: "周", title: "选择周", maxWidth: 342, mustInclude: ["本周", "确定", "取消"] },
      { key: "month", label: "月", title: "选择月份", maxWidth: 302, mustInclude: ["本月", "确定", "取消"] },
      { key: "custom", label: "自定义", title: "自定义范围", maxWidth: 382, mustInclude: ["开始日期", "结束日期", "确定", "取消"] },
    ] as const;
    for (const item of periodButtons) {
      await click(client, `[data-testid='home-bi-time-range-popover-${item.key}-button']`);
      await waitForSelector(client, "[data-testid='home-bi-time-range-popover-panel']");
      const panel = await evaluate<{ mode: string | null; width: number; text: string }>(
        client,
        `(() => {
          const node = document.querySelector('[data-testid="home-bi-time-range-popover-panel"]');
          const rect = node?.getBoundingClientRect();
          return { mode: node?.getAttribute('data-time-range-panel') || null, width: rect?.width || 0, text: node?.textContent || '' };
        })()`,
      );
      const longCopy = ["当前仅调整页面统计范围", "不改变数据源", "选择单日日期"].filter((token) => panel.text.includes(token));
      addCheck(`browser1440${item.key}CompactPopover`, panel.mode === item.label && panel.width <= item.maxWidth && panel.text.includes(item.title), panel);
      addCheck(`browser1440${item.key}PopoverNoLongCopy`, longCopy.length === 0, longCopy);
      addCheck(`browser1440${item.key}PopoverActions`, item.mustInclude.every((token) => panel.text.includes(token)), { expected: item.mustInclude, text: panel.text });
      await captureScreenshot(client, `home-time-${item.key}-compact-popover-1440`);
    }
    await click(client, "[data-testid='home-bi-time-range-popover-custom-button']");

    client.consoleErrors.length = 0;
    await setViewport(client, 390, 900);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await wait(1000);
    const horizontalOverflow390 = await evaluate<boolean>(
      client,
      "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
    );
    const mobileButtons = await evaluate<string[]>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-time-range-popover\"] > button')).map((node) => node.textContent?.trim() || '')",
    );
    await click(client, "[data-testid='home-bi-time-range-popover-day-button']");
    const mobilePanelExists = await evaluate<boolean>(client, "Boolean(document.querySelector('[data-testid=\"home-bi-time-range-popover-panel\"]'))");
    addCheck("browser390ConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    addCheck("browser390NoHorizontalOverflow", !horizontalOverflow390);
    addCheck("browser390TimeButtonsClickOpen", ["日", "周", "月", "自定义"].every((label) => mobileButtons.includes(label)) && mobilePanelExists, { mobileButtons, mobilePanelExists });
    await captureScreenshot(client, "home-390");
  } finally {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ taskName: "HOME_TOP_CONTROL_COMPACT_TOOLBAR_HARD_FIX_V2", baseUrl: BASE_URL, screenshotDir, screenshots }, null, 2),
    );
    client.close();
    chrome.kill("SIGTERM");
    if (server) server.kill("SIGTERM");
  }
};

const main = async () => {
  runStaticChecks();
  await runBrowserChecks();
  const failed = checks.filter((check) => !check.pass);
  const status: Status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ taskName: "HOME_TOP_CONTROL_COMPACT_TOOLBAR_HARD_FIX_V2", status, checks, failedChecks: failed, screenshotManifest: manifestPath }, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ taskName: "HOME_TOP_CONTROL_COMPACT_TOOLBAR_HARD_FIX_V2", status: "FAIL", error: message, screenshotManifest: manifestPath }, null, 2));
  process.exitCode = 1;
});
