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
const BASE_URL = process.env.BOARD_TOOLBAR_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-board-toolbar-sync-v1-"));
const manifestPath = path.join(screenshotDir, "manifest.json");
const checks: Check[] = [];
const screenshots: Array<{ name: string; path: string }> = [];

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
  "PVM2-006",
  "PVM2-007",
  "PVM2-008",
  "PVM2-009",
  "PVM2-013",
] as const;

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

const boardFiles = {
  series: "components/series-board/v1/series-board-v1-dashboard.tsx",
  store: "components/store-board/v1/store-board-v1-dashboard.tsx",
  product: "components/product-board/v1/product-board-v1-dashboard.tsx",
} as const;

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
const sensitiveTokens = ["rawRows", "previewRows", "warning 原文", "售后订单号", "退款编号", "交易号", "电话", "地址", "物流信息", "买家说明", "商家备注原文"] as const;

type InspectBoardConfig = {
  key: "home" | "series" | "store" | "product";
  route: string;
  root: string;
  control: string;
  toolbar: string;
  timeScope: string;
  time: string;
  scope: string;
  kpi: string;
  minKpi: number;
  scopeTokens: readonly string[];
};

const boardConfigs: InspectBoardConfig[] = [
  {
    key: "series",
    route: "/series-board",
    root: "series-board-v1-dashboard",
    control: "series-board-v1-control",
    toolbar: "series-board-v1-business-toolbar",
    timeScope: "series-board-v1-time-scope-toolbar",
    time: "series-board-v1-time-range-popover",
    scope: "series-board-v1-dimension-scope",
    kpi: "series-board-v1-kpi-card",
    minKpi: 15,
    scopeTokens: ["范围：", "当前系列", "商品ID"],
  },
  {
    key: "store",
    route: "/store-board",
    root: "store-board-v1-dashboard",
    control: "store-board-v1-control",
    toolbar: "store-board-v1-business-toolbar",
    timeScope: "store-board-v1-time-scope-toolbar",
    time: "store-board-v1-time-range-popover",
    scope: "store-board-v1-dimension-scope",
    kpi: "store-board-v1-kpi-card",
    minKpi: 15,
    scopeTokens: ["范围：", "不按系列筛选", "店铺内商品聚合"],
  },
  {
    key: "product",
    route: "/product-board",
    root: "product-board-v1-dashboard",
    control: "product-board-v1-control",
    toolbar: "product-board-v1-business-toolbar",
    timeScope: "product-board-v1-time-scope-toolbar",
    time: "product-board-v1-time-range-popover",
    scope: "product-board-v1-dimension-scope",
    kpi: "product-board-v1-kpi-card",
    minKpi: 15,
    scopeTokens: ["范围：", "单品视图"],
  },
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
  for (let index = 0; index < 120; index += 1) {
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

const noTextTokens = (text: string, tokens: readonly string[]) => tokens.filter((token) => text.includes(token));

const runStaticChecks = () => {
  requiredReadFiles.forEach((relativePath) => addCheck(`read:${relativePath}`, exists(relativePath)));
  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const problemMatrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const series = read(boardFiles.series);
  const store = read(boardFiles.store);
  const product = read(boardFiles.product);
  const visualSystem = read("components/visual-system/v1/visual-system.tsx");

  addCheck("agentsRead", agents.includes("Tmall V1 Internal Beta Agent Protocol") && agents.includes("docs/UI_BASELINE_LOCK_V2.md"));
  addCheck("projectStateRead", projectState.includes("天猫 V1 内测排查版"));
  addCheck("problemMatrixRead", citedProblemIds.every((problemId) => problemMatrix.includes(problemId)));
  addCheck("protocolRead", protocol.includes("UI 只做展示和交互"));
  addCheck("uiBaselineRead", uiBaseline.includes("全量 KPI 网格") && uiBaseline.includes("当前为 `17`"));
  addCheck("problemIdsBound", citedProblemIds.every((problemId) => [series, store, product].some((source) => source.includes(problemId))), citedProblemIds);

  addCheck("seriesNoLogoAndUsesCompactToolbar", !series.includes("V1LogoAccountButton") && series.includes("series-board-v1-business-toolbar"));
  addCheck("storeNoLogoAndUsesCompactToolbar", !store.includes("V1LogoAccountButton") && store.includes("store-board-v1-business-toolbar"));
  addCheck("productNoLogoAndUsesCompactToolbar", !product.includes("V1LogoAccountButton") && product.includes("product-board-v1-business-toolbar"));
  addCheck("seriesSplitTimeAndBreadcrumb", series.includes('variant="split"') && series.includes('data-scope-variant="breadcrumb"'));
  addCheck("storeSplitTimeAndBreadcrumb", store.includes('variant="split"') && store.includes('data-scope-variant="breadcrumb"'));
  addCheck("productSplitTimeAndBreadcrumb", product.includes('variant="split"') && product.includes('data-scope-variant="breadcrumb"'));
  addCheck("noDimensionScopeBarUsageOnBoards", !series.includes("V1DimensionScopeBar") && !store.includes("V1DimensionScopeBar") && !product.includes("V1DimensionScopeBar"));
  addCheck("compactPopoverShared", visualSystem.includes('data-compact-popover="true"') && !visualSystem.includes("当前仅调整页面统计范围，不改变数据源或 BI 计算口径"));

  const seriesKpis = extractConstArrayItems(series, "FULL_SERIES_KPI_KEYS");
  const storeKpis = extractConstArrayItems(store, "FULL_STORE_KPI_KEYS");
  const productKpis = extractConstArrayItems(product, "FULL_PRODUCT_KPI_KEYS");
  addCheck("seriesKpiCountAtLeast15", seriesKpis.length >= 15, seriesKpis);
  addCheck("storeKpiCountAtLeast15", storeKpis.length >= 15, storeKpis);
  addCheck("productKpiCountAtLeast15", productKpis.length >= 15, productKpis);
  addCheck("productDoesNotRestoreAllProducts", !product.includes("所有宝贝"));
  addCheck("seriesNoVisibleProductIdFirstCopy", !series.includes("productId-first"));

  const dirtyPaths = gitStatusPathsSync();
  const forbiddenDirtyPaths = dirtyPaths.filter((filePath) =>
    forbiddenDirtyPrefixes.some((prefix) => filePath === prefix || filePath.startsWith(prefix)) ||
    /\.(?:xls|xlsx|csv|pem|key)$/i.test(filePath),
  );
  addCheck("noForbiddenDirtyPaths", forbiddenDirtyPaths.length === 0, { dirtyPaths, forbiddenDirtyPaths });
};

const inspectBoard = async (client: CdpClient, config: InspectBoardConfig, width: number) => {
  client.consoleErrors.length = 0;
  await setViewport(client, width, width === 390 ? 900 : 1080);
  await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${config.route}` });
  await waitForSelector(client, `[data-testid="${config.root}"]`);
  await waitForSelector(client, `[data-testid="${config.control}"]`);
  await wait(1000);

  const prefix = `${config.key}-${width}`;
  const bodyText = await evaluate<string>(client, "document.body.innerText");
  const toolbarHeight = await evaluate<number>(client, `document.querySelector('[data-testid="${config.toolbar}"]')?.getBoundingClientRect().height || 0`);
  const timeScopeHeight = await evaluate<number>(client, `document.querySelector('[data-testid="${config.timeScope}"]')?.getBoundingClientRect().height || 0`);
  const timeButtons = await evaluate<string[]>(
    client,
    `Array.from(document.querySelectorAll('[data-testid="${config.time}"] > button')).map((node) => node.textContent?.trim() || '')`,
  );
  const scopeText = await evaluate<string>(client, `document.querySelector('[data-testid="${config.scope}"]')?.textContent || ''`);
  const scopeVariant = await evaluate<string | null>(client, `document.querySelector('[data-testid="${config.scope}"]')?.getAttribute('data-scope-variant') || null`);
  const hasScopeChipGrid = await evaluate<boolean>(client, `Boolean(document.querySelector('[data-testid="${config.scope}"] [data-dimension-scope]'))`);
  const kpiCount = await evaluate<number>(client, `document.querySelectorAll('[data-testid="${config.kpi}"]').length`);
  const fiveFieldLayout = await evaluate<boolean>(
    client,
    `Array.from(document.querySelectorAll('[data-testid="${config.kpi}"]')).every((node) => {
      const text = node.textContent || '';
      const title = node.getAttribute('title') || '';
      return title.includes('当前') && ['MTD目标','总目标','差值','完成率'].every((token) => text.includes(token));
    })`,
  );
  const horizontalOverflow = await evaluate<boolean>(
    client,
    "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
  );
  const forbiddenVisible = noTextTokens(bodyText, forbiddenVisibleTokens);
  const invalidVisible = noTextTokens(bodyText, invalidTokens);
  const sensitiveVisible = noTextTokens(bodyText, sensitiveTokens);
  const englishScopeLabels = /\b(?:PLATFORM|STORE|SERIES|PRODUCT)\b/.test(scopeText);

  addCheck(`${prefix}:consoleBusinessErrorsZero`, client.consoleErrors.length === 0, client.consoleErrors);
  addCheck(`${prefix}:toolbarCompact`, toolbarHeight <= (width === 390 ? 220 : 86), { toolbarHeight });
  addCheck(`${prefix}:timeScopeCompact`, timeScopeHeight <= (width === 390 ? 120 : 64), { timeScopeHeight });
  addCheck(`${prefix}:timeButtonsIndependent`, ["日", "周", "月", "自定义"].every((label) => timeButtons.includes(label)), timeButtons);
  addCheck(`${prefix}:scopeBreadcrumb`, scopeVariant === "breadcrumb" && !hasScopeChipGrid && config.scopeTokens.every((token) => scopeText.includes(token)), { scopeVariant, scopeText, hasScopeChipGrid });
  addCheck(`${prefix}:scopeNoEnglishLabels`, !englishScopeLabels, scopeText);
  addCheck(`${prefix}:kpiCountAtLeastBaseline`, kpiCount >= config.minKpi, { kpiCount });
  addCheck(`${prefix}:kpiFiveFieldLayout`, fiveFieldLayout);
  addCheck(`${prefix}:noVisibleEngineeringTokens`, forbiddenVisible.length === 0 && !/(^|\n)空(\n|$)/.test(bodyText), forbiddenVisible);
  addCheck(`${prefix}:noInvalidText`, invalidVisible.length === 0, invalidVisible);
  addCheck(`${prefix}:noSensitiveText`, sensitiveVisible.length === 0, sensitiveVisible);
  addCheck(`${prefix}:noHorizontalOverflow`, !horizontalOverflow);
  if (config.key === "product") addCheck(`${prefix}:noAllProducts`, !bodyText.includes("所有宝贝"));

  await captureScreenshot(client, `${config.key}-${width}`);
};

const inspectTimePopover = async (client: CdpClient, config: InspectBoardConfig) => {
  await setViewport(client, 1440, 1080);
  await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${config.route}` });
  await waitForSelector(client, `[data-testid="${config.root}"]`);
  await wait(700);
  await click(client, `[data-testid="${config.time}-day-button"]`);
  await waitForSelector(client, `[data-testid="${config.time}-panel"]`);
  const panel = await evaluate<{ mode: string | null; width: number; text: string }>(
    client,
    `(() => {
      const node = document.querySelector('[data-testid="${config.time}-panel"]');
      const rect = node?.getBoundingClientRect();
      return { mode: node?.getAttribute('data-time-range-panel') || null, width: rect?.width || 0, text: node?.textContent || '' };
    })()`,
  );
  const longCopy = ["当前仅调整页面统计范围", "不改变数据源", "选择单日日期"].filter((token) => panel.text.includes(token));
  addCheck(`${config.key}:dayPopoverCompact`, panel.mode === "日" && panel.width <= 322 && panel.text.includes("选择日期"), panel);
  addCheck(`${config.key}:dayPopoverActions`, ["清除", "今天", "确定", "取消"].every((token) => panel.text.includes(token)), panel.text);
  addCheck(`${config.key}:dayPopoverNoLongCopy`, longCopy.length === 0, longCopy);
  await captureScreenshot(client, `${config.key}-time-popover-1440`);
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9420;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-board-toolbar-chrome-"));
  const chrome = await launchChrome(port, profileDir);
  const client = await CdpClient.connect(await getDebuggerUrl(port));

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: BASE_URL.replace(/\/$/, "") });
    await wait(300);
    await evaluate<void>(client, `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "board-toolbar@airburg.local", loggedInAt: "2026-07-04T00:00:00.000Z" }))`);

    await inspectBoard(client, {
      key: "home",
      route: "/home",
      root: "home-bi-dashboard",
      control: "home-bi-controls",
      toolbar: "home-bi-business-toolbar",
      timeScope: "home-bi-time-scope-toolbar",
      time: "home-bi-time-range-popover",
      scope: "home-bi-dimension-scope",
      kpi: "home-bi-kpi-card",
      minKpi: 17,
      scopeTokens: ["范围：", "全局经营视图", "全部商品"],
    }, 1440);

    for (const config of boardConfigs) {
      await inspectBoard(client, config, 1440);
      await inspectTimePopover(client, config);
      await inspectBoard(client, config, 390);
    }
  } finally {
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ taskName: "BOARD_TOP_CONTROL_COMPACT_TOOLBAR_SYNC_FROM_HOME_V1", baseUrl: BASE_URL, screenshotDir, screenshots }, null, 2),
    );
    client.close();
    chrome.kill("SIGTERM");
    if (server) server.kill("SIGTERM");
  }
};

const main = async () => {
  runStaticChecks();
  await runBrowserChecks();
  const failedChecks = checks.filter((check) => !check.pass);
  const status: Status = failedChecks.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ taskName: "BOARD_TOP_CONTROL_COMPACT_TOOLBAR_SYNC_FROM_HOME_V1", status, checks, failedChecks, screenshotManifest: manifestPath }, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ taskName: "BOARD_TOP_CONTROL_COMPACT_TOOLBAR_SYNC_FROM_HOME_V1", status: "FAIL", error: message, screenshotManifest: manifestPath }, null, 2));
  process.exitCode = 1;
});
