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
const BASE_URL = process.env.HOME_TOP_CONTROL_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const checks: Check[] = [];
const screenshots: ScreenshotEntry[] = [];
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-top-control-"));
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
  "components/series-board/",
  "components/store-board/",
  "components/product-board/",
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

const sensitiveTokens = [
  "rawRows",
  "previewRows",
  "warning 原文",
  "售后订单号",
  "退款编号",
  "交易号",
  "物流信息",
  "买家说明",
  "商家备注原文",
  "技术错误堆栈",
] as const;

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, ...(details === undefined ? {} : { details }) });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const hasAll = (source: string, tokens: readonly string[]): boolean =>
  tokens.every((token) => source.includes(token));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gitStatusPathsSync = (): string[] => {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }) as string;
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
  await evaluate<void>(
    client,
    `document.querySelector(${JSON.stringify(selector)})?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))`,
  );
  await wait(350);
};

const captureScreenshot = async (client: CdpClient, name: string) => {
  const result = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  const filePath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  screenshots.push({ name, path: filePath });
};

const runStaticChecks = () => {
  requiredReadFiles.forEach((relativePath) => {
    addCheck(`read:${relativePath}`, exists(relativePath));
  });

  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const uiLayoutAgent = read("docs/agents/ui-layout-agent.md");
  const uiLayoutSkill = read("docs/skills/airburg-ui-layout-skill.md");
  const home = read("components/home/home-bi-dashboard.tsx");
  const visualSystem = read("components/visual-system/v1/visual-system.tsx");

  addCheck("agentsRead", hasAll(agents, ["Tmall V1 Internal Beta Agent Protocol", "docs/UI_BASELINE_LOCK_V2.md"]));
  addCheck("projectStateRead", hasAll(projectState, ["天猫 V1 内测排查版", "Home layout polish"]));
  addCheck("problemIdsBound", citedProblemIds.every((problemId) => problemMatrix.includes(problemId) && home.includes(problemId)), citedProblemIds);
  addCheck("protocolRead", hasAll(protocol, ["UI 只做展示和交互", "全量 KPI 网格"]));
  addCheck("uiBaselineRead", hasAll(uiBaseline, ["全量 KPI 网格", "当前为 `17`", "不展示 `L1`"]));
  addCheck("uiLayoutAgentRead", hasAll(uiLayoutAgent, ["Do not hide KPI cards", "Do not edit BI formulas"]));
  addCheck("uiLayoutSkillRead", hasAll(uiLayoutSkill, ["Do not modify ETL", "Missing values display"]));

  const kpiTitles = extractConstArrayItems(home, "FULL_HOME_KPI_TITLES");
  addCheck("homeKpiCountAtLeast15", kpiTitles.length >= 15, kpiTitles);
  addCheck("homeKpiCountStill17", kpiTitles.length === 17, kpiTitles);
  addCheck("homeRequiredKpisPresent", requiredKpiTitles.every((title) => kpiTitles.includes(title)), kpiTitles);
  addCheck("homeFiveFieldLayoutSourcePresent", hasAll(home, ["当前值", "MTD目标", "总目标", "差值", "完成率", "progress"]));
  addCheck("homeLogoUsesCompactSize", home.includes('size="compact"') && visualSystem.includes('data-logo-size={size}'));
  addCheck("homeTimeRangeSplitVariant", home.includes('variant="split"') && visualSystem.includes('data-time-range-variant="split"'));
  addCheck("homeTimeButtonsIndependent", visualSystem.includes('(["日", "周", "月", "自定义"] as const).map((period)') && visualSystem.includes("data-time-range-panel"));
  addCheck("homeScopeBarCompactVariant", home.includes('variant="compact"') && visualSystem.includes('data-scope-variant="compact"'));
  addCheck("homeScopeBarChineseLabels", hasAll(visualSystem, ["平台", "店铺", "系列", "商品"]) && home.includes("全局经营视图") && home.includes("全部商品"));
  addCheck("targetRulesStayInPopover", home.includes("home-bi-platform-target-popover") && !home.includes("Hidden KPI chip"));

  const dirtyPaths = gitStatusPathsSync();
  const forbiddenDirtyPaths = dirtyPaths.filter((filePath) =>
    forbiddenDirtyPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix)) ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath),
  );
  addCheck("noForbiddenDirtyPaths", forbiddenDirtyPaths.length === 0, { dirtyPaths, forbiddenDirtyPaths });
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9411;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-home-top-control-chrome-"));
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
      `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "home-top-control@airburg.local", loggedInAt: "2026-07-04T00:00:00.000Z" }))`,
    );

    client.consoleErrors.length = 0;
    await setViewport(client, 1440, 1080);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/home` });
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await wait(1000);

    const bodyText = await evaluate<string>(client, "document.body.innerText");
    const logoSize = await evaluate<{ width: number; height: number; label: string | null }>(
      client,
      `(() => {
        const node = document.querySelector('[data-testid="home-bi-logo-button"]');
        const rect = node?.getBoundingClientRect();
        return { width: rect?.width || 0, height: rect?.height || 0, label: node?.textContent || null };
      })()`,
    );
    const timeButtons = await evaluate<string[]>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-time-range-popover\"] > button')).map((node) => node.textContent?.trim() || '')",
    );
    const scopeText = await evaluate<string>(client, "document.querySelector('[data-testid=\"home-bi-dimension-scope\"]')?.textContent || ''");
    const scopeVariant = await evaluate<string | null>(client, "document.querySelector('[data-testid=\"home-bi-dimension-scope\"]')?.getAttribute('data-scope-variant') || null");
    const scopeHeight = await evaluate<number>(client, "document.querySelector('[data-testid=\"home-bi-dimension-scope\"]')?.getBoundingClientRect().height || 0");
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
    addCheck("browser1440LogoCompact", logoSize.width <= 56 && logoSize.height <= 56 && logoSize.label !== "LOGO", logoSize);
    addCheck("browser1440TimeButtonsIndependent", ["日", "周", "月", "自定义"].every((label) => timeButtons.includes(label)), timeButtons);
    addCheck("browser1440ScopeChineseCompact", scopeVariant === "compact" && scopeHeight <= 72, { scopeVariant, scopeHeight, scopeText });
    addCheck("browser1440ScopeNoEnglishLabels", !/\b(?:PLATFORM|STORE|SERIES|PRODUCT)\b/.test(scopeText), scopeText);
    addCheck("browser1440ScopeNaturalChinese", hasAll(scopeText, ["当前范围", "平台：", "店铺：", "系列：", "商品："]), scopeText);
    addCheck("browser1440HomeKpiCountAtLeast15", kpiCount >= 15, { kpiCount, kpiTitles });
    addCheck("browser1440HomeKpiCountStill17", kpiCount === 17, { kpiCount, kpiTitles });
    addCheck("browser1440RequiredKpisPresent", missingKpis.length === 0, { missingKpis, kpiTitles });
    addCheck("browser1440KpiFiveFieldLayout", fiveFieldLayout);
    const targetRulePollution = ["需要填写的目标", "自动推导的目标", "已隐藏的目标", "unsupported", "Unsupported"].filter((token) => mainKpiText.includes(token));
    addCheck("browser1440MainKpiNoTargetRulePollution", targetRulePollution.length === 0, targetRulePollution);
    addCheck("browser1440NoForbiddenVisibleTokens", forbiddenVisible.length === 0, forbiddenVisible);
    addCheck("browser1440NoInvalidText", invalidVisible.length === 0, invalidVisible);
    addCheck("browser1440NoSensitiveText", sensitiveVisible.length === 0, sensitiveVisible);
    addCheck("browser1440NoHorizontalOverflow", !horizontalOverflow1440);
    await captureScreenshot(client, "home-1440");
    await captureScreenshot(client, "home-scope-bar-1440");

    const periodButtons = [
      { key: "day", label: "日" },
      { key: "week", label: "周" },
      { key: "month", label: "月" },
      { key: "custom", label: "自定义" },
    ] as const;
    for (const item of periodButtons) {
      await click(client, `[data-testid='home-bi-time-range-popover-${item.key}-button']`);
      await waitForSelector(client, "[data-testid='home-bi-time-range-popover-panel']");
      const panelMode = await evaluate<string | null>(client, "document.querySelector('[data-testid=\"home-bi-time-range-popover-panel\"]')?.getAttribute('data-time-range-panel') || null");
      addCheck(`browser1440${item.key}TimePanelExists`, panelMode === item.label, { expected: item.label, panelMode });
      await captureScreenshot(client, `home-time-${item.key}-popover-1440`);
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
    const mobileTimeButtons = await evaluate<string[]>(
      client,
      "Array.from(document.querySelectorAll('[data-testid=\"home-bi-time-range-popover\"] > button')).map((node) => node.textContent?.trim() || '')",
    );
    await click(client, "[data-testid='home-bi-time-range-popover-day-button']");
    const mobilePanelExists = await evaluate<boolean>(client, "Boolean(document.querySelector('[data-testid=\"home-bi-time-range-popover-panel\"]'))");
    addCheck("browser390ConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    addCheck("browser390NoHorizontalOverflow", !horizontalOverflow390);
    addCheck("browser390TimeButtonsClickOnlyAvailable", ["日", "周", "月", "自定义"].every((label) => mobileTimeButtons.includes(label)) && mobilePanelExists, { mobileTimeButtons, mobilePanelExists });
    await captureScreenshot(client, "home-390");
  } finally {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          taskName: "HOME_TOP_CONTROL_AND_SCOPE_BAR_POLISH_V1",
          baseUrl: BASE_URL,
          screenshotDir,
          screenshots,
        },
        null,
        2,
      ),
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
  const output = {
    taskName: "HOME_TOP_CONTROL_AND_SCOPE_BAR_POLISH_V1",
    status,
    checks,
    failedChecks: failed,
    screenshotManifest: manifestPath,
  };

  console.log(JSON.stringify(output, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ taskName: "HOME_TOP_CONTROL_AND_SCOPE_BAR_POLISH_V1", status: "FAIL", error: message, screenshotManifest: manifestPath }, null, 2));
  process.exitCode = 1;
});
