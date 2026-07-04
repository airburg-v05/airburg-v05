import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
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
const BASE_URL = process.env.FULL_KPI_GRID_BASE_URL ?? "http://127.0.0.1:3000";
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

const sourceFiles = [
  "components/visual-system/v1/visual-system.tsx",
  "components/visual-system/v1/bi-chart.tsx",
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "components/store-board/v1/store-board-v1-dashboard.tsx",
  "components/upload/v1/upload-page-v1-dashboard.tsx",
];

const pageSpecs = [
  {
    label: "home",
    route: "/home",
    root: "[data-testid='home-bi-dashboard']",
    kpiCard: "[data-testid='home-bi-kpi-card']",
    minKpiCount: 17,
    requiredTitles: ["GMV", "GSV", "投入产出比", "去退费比", "直接成交占比"],
  },
  {
    label: "series",
    route: "/series-board",
    root: "[data-testid='series-board-v1-dashboard']",
    kpiCard: "[data-testid='series-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["系列GMV", "系列GSV", "投入产出比", "去退费比", "直接成交占比"],
  },
  {
    label: "product",
    route: "/product-board",
    root: "[data-testid='product-board-v1-dashboard']",
    kpiCard: "[data-testid='product-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["宝贝GMV", "宝贝GSV", "投入产出比", "去退费比", "直接成交占比"],
  },
  {
    label: "store",
    route: "/store-board",
    root: "[data-testid='store-board-v1-dashboard']",
    kpiCard: "[data-testid='store-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["店铺GMV", "店铺GSV", "投入产出比", "去退费比", "直接成交占比"],
  },
  {
    label: "upload",
    route: "/upload",
    root: "[data-testid='upload-page-v1-dashboard']",
    kpiCard: null,
    minKpiCount: 0,
    requiredTitles: [],
  },
];

const forbiddenSourceTokens = [
  "V1InformationArchitectureMap",
  "V1LayerSection",
  "V1_INFORMATION_LAYERS",
  "V1InformationLayerId",
  "data-ia-section",
  "data-chart-semantic-layer",
  "bi-chart-semantic-layer",
  "bi-chart-merged-tooltip-layer",
  "home-bi-kpi-customizer",
  "KpiCustomizerDialog",
  "PRIMARY_HOME_KPI",
  "SECONDARY_HOME_KPI",
  "PRIMARY_SERIES_KPI",
  "SECONDARY_SERIES_KPI",
  "PRIMARY_PRODUCT_KPI",
  "SECONDARY_PRODUCT_KPI",
  "PRIMARY_STORE_KPI",
  "SECONDARY_STORE_KPI",
  "BASELINE_HOME_KPI_TITLES",
  "BASELINE_SERIES_KPI_KEYS",
  "BASELINE_PRODUCT_KPI_KEYS",
  "BASELINE_STORE_KPI_KEYS",
  "L1核心",
  "L2解释",
  "L3控制",
  "L4工具",
  "核心经营层",
  "分析解释层",
  "工具层",
];

const visibleEngineeringTokens = [
  "L1核心",
  "L2解释",
  "L3控制",
  "L4工具",
  "Primary",
  "Secondary",
  "Hidden KPI",
  "StoreRecord",
  "ProductRecord",
  "TrackedProductRecord",
  "semantic reconciliation",
];

const mainKpiPollutionTokens = [
  "已隐藏的目标",
  "暂不开放普通输入",
  "unsupported",
  "Unsupported",
];

const invalidTokens = ["NaN", "Infinity", "undefined"];
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
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const hasAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const runStaticChecks = () => {
  requiredDocs.forEach((doc) => addCheck(`${doc}:exists`, fs.existsSync(path.join(ROOT, doc))));
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const matrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");

  addCheck("projectStateRead", hasAll(projectState, ["天猫 V1 内测排查版", "/home", "/series-board", "/product-board", "/store-board", "/upload"]));
  addCheck("problemMatrixCitedIdsRead", citedProblemIds.every((id) => matrix.includes(id)), citedProblemIds);
  addCheck("taskProtocolRead", hasAll(protocol, ["跨层修改检查", "UI 只做展示和交互", "Target 只作为 overlay"]));

  const sources = Object.fromEntries(sourceFiles.map((file) => [file, read(file)]));
  const joined = Object.values(sources).join("\n");
  const forbiddenHits = forbiddenSourceTokens.filter((token) => joined.includes(token));
  addCheck("noIaKpiSemanticWrapperSourceResidue", forbiddenHits.length === 0, forbiddenHits);

  const homeItems = extractConstArrayItems(sources["components/home/home-bi-dashboard.tsx"], "FULL_HOME_KPI_TITLES");
  const seriesItems = extractConstArrayItems(sources["components/series-board/v1/series-board-v1-dashboard.tsx"], "FULL_SERIES_KPI_KEYS");
  const productItems = extractConstArrayItems(sources["components/product-board/v1/product-board-v1-dashboard.tsx"], "FULL_PRODUCT_KPI_KEYS");
  const storeItems = extractConstArrayItems(sources["components/store-board/v1/store-board-v1-dashboard.tsx"], "FULL_STORE_KPI_KEYS");

  addCheck("homeFullKpiGridCount", homeItems.length >= 17, homeItems);
  addCheck("seriesFullKpiGridCount", seriesItems.length >= 15, seriesItems);
  addCheck("productFullKpiGridCount", productItems.length >= 15, productItems);
  addCheck("storeFullKpiGridCount", storeItems.length >= 15, storeItems);
  addCheck("homeRequiredMetricsInGrid", ["GMV", "GSV", "投入产出比", "去退费比", "直接成交占比"].every((title) => homeItems.includes(title)), homeItems);
  addCheck("seriesRequiredMetricsInGrid", ["seriesGmv", "seriesGsv", "adRoi", "adSpendRateAfterRefund", "directSalesShare"].every((key) => seriesItems.includes(key)), seriesItems);
  addCheck("productRequiredMetricsInGrid", ["productGmv", "productGsv", "adRoi", "adSpendRateAfterRefund", "directSalesShare"].every((key) => productItems.includes(key)), productItems);
  addCheck("storeRequiredMetricsInGrid", ["storeGmv", "storeGsv", "adRoi", "refundFeeRatio", "directSalesShare"].every((key) => storeItems.includes(key)), storeItems);

  const pageSources = [
    sources["components/home/home-bi-dashboard.tsx"],
    sources["components/series-board/v1/series-board-v1-dashboard.tsx"],
    sources["components/product-board/v1/product-board-v1-dashboard.tsx"],
    sources["components/store-board/v1/store-board-v1-dashboard.tsx"],
  ].join("\n");
  addCheck("kpiCardsUseFiveFieldLayout", ["当前 ", "MTD目标", "总目标", "差值", "完成率", "progress"].every((token) => pageSources.includes(token)));
  addCheck("targetExplanationsStayInPopovers", hasAll(pageSources, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]));
  addCheck("seriesMainKpiNoUnsupportedHelper", !sources["components/series-board/v1/series-board-v1-dashboard.tsx"].includes("暂不支持目标，当前仅展示实际值"));
  addCheck("uploadProductizedAndNotFourSlot", hasAll(sources["components/upload/v1/upload-page-v1-dashboard.tsx"], ["role=\"tablist\"", "天猫", "京东", "抖音", "有赞", "拼多多", "upload-page-v2-multiple-input"]) && !/四固定槽|固定槽位/.test(sources["components/upload/v1/upload-page-v1-dashboard.tsx"]));
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9349;
  const profileDir = fs.mkdtempSync(path.join("/tmp", "airburg-full-kpi-grid-chrome-"));
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
      `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "full-kpi-grid@airburg.local", loggedInAt: "2026-07-03T00:00:00.000Z" }))`,
    );

    for (const spec of pageSpecs) {
      for (const viewport of [
        { label: "1440", width: 1440, height: 1000 },
        { label: "390", width: 390, height: 900 },
      ]) {
        client.consoleErrors.length = 0;
        await setViewport(client, viewport.width, viewport.height);
        await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${spec.route}` });
        await waitForSelector(client, spec.root);
        await wait(800);

        const bodyText = await evaluate<string>(client, "document.body.innerText");
        const overflow = await evaluate<boolean>(
          client,
          "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
        );
        const visibleForbidden = visibleEngineeringTokens.filter((token) => bodyText.includes(token));
        const invalidVisible = invalidTokens.filter((token) => bodyText.includes(token));
        const sensitiveVisible = sensitiveTokens.filter((token) => bodyText.includes(token));
        const mainKpiPollution = mainKpiPollutionTokens.filter((token) => bodyText.includes(token));
        const kpiCount = spec.kpiCard
          ? await evaluate<number>(client, `document.querySelectorAll(${JSON.stringify(spec.kpiCard)}).length`)
          : null;
        const cardTitles = spec.kpiCard
          ? await evaluate<string[]>(client, `Array.from(document.querySelectorAll(${JSON.stringify(spec.kpiCard)})).map((node) => node.getAttribute("data-kpi-title") || "")`)
          : [];
        const missingTitles = spec.requiredTitles.filter((title) => !cardTitles.includes(title));
        const cardsWithFiveFields = spec.kpiCard
          ? await evaluate<boolean>(
            client,
            `Array.from(document.querySelectorAll(${JSON.stringify(spec.kpiCard)})).every((node) => ["MTD目标","总目标","差值","完成率"].every((token) => (node.textContent || "").includes(token)))`,
          )
          : true;

        addCheck(`${spec.label}-${viewport.label}:root`, true);
        addCheck(`${spec.label}-${viewport.label}:consoleBusinessErrorsZero`, client.consoleErrors.length === 0, client.consoleErrors);
        addCheck(`${spec.label}-${viewport.label}:noHorizontalOverflow`, !overflow);
        addCheck(`${spec.label}-${viewport.label}:noVisibleEngineeringTokens`, visibleForbidden.length === 0, visibleForbidden);
        addCheck(`${spec.label}-${viewport.label}:noInvalidText`, invalidVisible.length === 0, invalidVisible);
        addCheck(`${spec.label}-${viewport.label}:noSensitiveText`, sensitiveVisible.length === 0, sensitiveVisible);
        if (spec.kpiCard) {
          addCheck(`${spec.label}-${viewport.label}:fullKpiGridCount`, (kpiCount ?? 0) >= spec.minKpiCount, { kpiCount, cardTitles });
          addCheck(`${spec.label}-${viewport.label}:requiredKpiTitlesPresent`, missingTitles.length === 0, { missingTitles, cardTitles });
          addCheck(`${spec.label}-${viewport.label}:kpiCardsFiveFieldLayout`, cardsWithFiveFields);
          addCheck(`${spec.label}-${viewport.label}:mainKpiAreaNoUnsupportedTargetCopy`, mainKpiPollution.length === 0, mainKpiPollution);
        }
      }
    }
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

  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({
    status,
    checks,
    failed,
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
      citedProblemIds,
      expectedKpiCounts: {
        home: ">=17",
        series: ">=15",
        product: ">=15",
        store: ">=15",
      },
    },
  }, null, 2));
  console.log(`RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_V1_STATUS: ${status}`);
  process.exit(status === "PASS" ? 0 : 1);
};

void main();
