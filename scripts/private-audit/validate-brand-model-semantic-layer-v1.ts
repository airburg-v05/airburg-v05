import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  aggregateSearchProductKeywords,
  aggregateSearchTotalKeywords,
  buildBrandModelMatch,
  hasBrandModelTokens,
  parseKeywordTokens,
} from "../../lib/bi/brand-model-semantic";
import { loadHomeBIDataSource } from "../../lib/bi/bi.data-source";
import { buildHomeBIViewModel } from "../../lib/bi/bi.home-view-model";
import { createDefaultBIState } from "../../lib/bi/bi.store";
import {
  clearRuntimeBIDataSet,
  setRuntimeBIDataSet,
  type BIDataSet,
} from "../../lib/etl/runtime";
import type { BIHomeDataSource } from "../../lib/bi/bi.data-source";

const ROOT = process.cwd();
const AUDIT_PORT = Number(process.env.BRAND_MODEL_AUDIT_PORT ?? "3100");
const BASE_URL = process.env.BRAND_MODEL_AUDIT_BASE_URL ?? `http://127.0.0.1:${AUDIT_PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-brand-model-semantic-"));

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

interface ScreenshotRecord {
  route: string;
  viewport: string;
  screenshotPath: string;
  pageStatus: string;
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
}

const checks: Check[] = [];
const screenshots: ScreenshotRecord[] = [];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(`${name} failed`);
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const allowedPriorBaselinePatterns = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "components/upload/v1/**",
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/v1/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const strictlyForbiddenPatterns = [
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const sensitiveTokens = [
  "rawRows",
  "previewRows",
  "文件名历史",
  "warning 原文",
  "订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注明细",
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const containsInvalidOutput = (value: unknown): boolean => {
  const seen = new Set<unknown>();
  const visit = (item: unknown): boolean => {
    if (item && typeof item === "object") {
      if (seen.has(item)) return false;
      seen.add(item);
      return Object.values(item).some(visit);
    }
    if (typeof item === "number") return !Number.isFinite(item);
    if (typeof item === "string") return /NaN|Infinity|undefined/.test(item);
    return false;
  };
  return visit(value);
};

const baseDataSet = (): BIDataSet => ({
  products: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      productId: "p1",
      name: "空气堡 P1",
      brandWord: null,
      modelWord: null,
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      productId: "p2",
      name: "空气堡 P2",
      brandWord: null,
      modelWord: null,
    },
  ],
  productMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", productId: "p1", date: "2026-06-24", gmv: 1000, gsv: 900, visitors: 100, buyers: 10 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", productId: "p2", date: "2026-06-24", gmv: 500, gsv: 450, visitors: 50, buyers: 5 },
  ],
  planMetrics: [
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", productId: "p1", date: "2026-06-24", spend: 100, clicks: 20, roi: 2.5 },
  ],
  searchTotalKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", keyword: "空气堡 P1", visitors: 10, buyers: 2, gmv: 200 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", keyword: "空气堡 P1", visitors: 999, buyers: 999, gmv: 999 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", keyword: "P1 空气净化器", visitors: 5, buyers: 1, gmv: 100 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", keyword: "竞品", visitors: 20, buyers: 4, gmv: 300 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s2", storeName: "店铺二", date: "2026-06-24", keyword: "空气堡 P1", visitors: 7, buyers: 1, gmv: 70 },
  ],
  searchProductKeywords: [
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", productId: "p1", keyword: "空气堡 P1", visitors: 6, buyers: 1 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", productId: "p1", keyword: "空气堡 P1", visitors: 999, buyers: 999 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s1", storeName: "店铺一", date: "2026-06-24", productId: "p2", keyword: "空气堡 P1", visitors: 4, buyers: 1 },
    { platformCode: "tmall", platformName: "天猫", storeId: "s2", storeName: "店铺二", date: "2026-06-24", productId: "p1", keyword: "空气堡 P1", visitors: 8, buyers: 1 },
  ],
  afterSalesMetrics: [],
});

const buildSyntheticSource = (): BIHomeDataSource => ({
  mode: "v2_valid",
  selectedDate: "2026-06-24",
  safeWarnings: [],
  notices: ["synthetic safe source"],
  points: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p1",
      productName: "空气堡 P1",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10, adSpend: 100, adRevenue: 250, adClicks: 20 },
    },
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: null,
      seriesName: null,
      productId: "p2",
      productName: "空气堡 P2",
      businessDate: "2026-06-24",
      metrics: { gmv: 500, gsv: 450, visitors: 50, paidBuyers: 5 },
    },
  ],
  seriesPoints: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: "series-air",
      seriesName: "空气净化器",
      productId: "p1",
      productName: "空气堡 P1",
      businessDate: "2026-06-24",
      metrics: { gmv: 1000, gsv: 900, visitors: 100, paidBuyers: 10, adSpend: 100, adRevenue: 250, adClicks: 20 },
    },
  ],
  seriesDefinitions: [
    {
      platformCode: "tmall",
      platformName: "天猫",
      storeId: "s1",
      storeName: "店铺一",
      seriesId: "series-air",
      seriesName: "空气净化器",
      productIds: ["p1"],
    },
  ],
  searchTotalKeywords: baseDataSet().searchTotalKeywords.map((row) => ({ ...row, date: null })),
  searchProductKeywords: baseDataSet().searchProductKeywords.map((row) => ({ ...row, date: null })),
  targets: [],
  dataStatus: {
    mode: "v2_valid",
    label: "synthetic",
    storeCount: 1,
    platformCount: 1,
    hasRealData: true,
    safeWarnings: [],
  },
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp200 = async (url: string, timeoutMs = 30000): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {
      await wait(500);
    }
  }
  return false;
};

const ensureServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (await waitForHttp200(`${BASE_URL}/login`, 3000)) return null;
  const server = spawn("npm", ["run", "dev", "--", "--port", String(AUDIT_PORT)], { cwd: ROOT });
  server.stdout.on("data", () => undefined);
  server.stderr.on("data", () => undefined);
  if (!(await waitForHttp200(`${BASE_URL}/login`, 30000))) {
    server.kill("SIGTERM");
    throw new Error("dev server did not become available");
  }
  return server;
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

  private handleMessage(data: string) {
    const message = JSON.parse(data) as CdpMessage;
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error) pending.reject(message.error);
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const params = message.params as { type?: string; args?: Array<{ value?: unknown; description?: string }> };
      if (params.type === "error") {
        this.consoleErrors.push(params.args?.map((arg) => String(arg.value ?? arg.description ?? "")).join(" ") ?? "console error");
      }
    }
    if (message.method === "Log.entryAdded") {
      const params = message.params as { entry?: { level?: string; text?: string } };
      if (params.entry?.level === "error") this.consoleErrors.push(params.entry.text ?? "log error");
    }
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{ result?: { value?: unknown }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(`Runtime.evaluate failed: ${JSON.stringify(result.exceptionDetails)}`);
    return result.result?.value as T;
  }

  async navigate(url: string, width: number, height: number) {
    this.consoleErrors.length = 0;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 430,
    });
    await this.send("Page.navigate", { url });
    await wait(1500);
  }

  async screenshot(filePath: string) {
    const result = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  }

  close() {
    this.socket.close();
  }
}

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          resolve(JSON.parse(body) as T);
        });
      })
      .on("error", reject);
  });

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let index = 0; index < 80; index += 1) {
    const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await wait(100);
  }
  throw new Error("No Chrome page debugger URL found");
};

const launchChrome = async (): Promise<{ client: CdpClient; process: ChildProcessWithoutNullStreams; profileDir: string }> => {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-brand-model-chrome-"));
  const debugPort = 9800 + Math.floor(Math.random() * 700);
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  chrome.stdout.on("data", () => undefined);
  chrome.stderr.on("data", () => undefined);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    try {
      await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
      const client = await CdpClient.connect(await getPageDebuggerUrl(debugPort));
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      await client.send("Log.enable");
      return { client, process: chrome, profileDir };
    } catch {
      await wait(300);
    }
  }
  chrome.kill("SIGTERM");
  throw new Error("Chrome did not start");
};

const clickByText = async (client: CdpClient, text: string) => {
  await client.evaluate(`
    (() => {
      const target = Array.from(document.querySelectorAll("button, a")).find((item) => (item.textContent || "").trim().includes(${JSON.stringify(text)}));
      if (!target) throw new Error("missing clickable text: ${text}");
      target.click();
    })()
  `);
  await wait(500);
};

const setTextareaValue = async (client: CdpClient, selector: string, value: string) => {
  await client.evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("missing textarea: ${selector}");
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()
  `);
};

const capture = async (
  client: CdpClient,
  route: string,
  viewport: string,
  fileName: string,
  pageStatus: string,
) => {
  const screenshotPath = path.join(screenshotDir, fileName);
  await client.screenshot(screenshotPath);
  const horizontalOverflow = await client.evaluate<boolean>(
    `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`,
  );
  screenshots.push({
    route,
    viewport,
    screenshotPath,
    pageStatus,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
  });
};

const removeDirWithRetry = async (dir: string) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await wait(300);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
};

const runDataChecks = async () => {
  const filter = { brandWords: ["空气堡", "空气堡"], modelWords: ["P1"] };
  const tokens = parseKeywordTokens([" 空气堡 ", "空气堡", "P1"]);
  addCheck("tokensTrimAndDedupe", tokens.length === 2 && tokens.includes("空气堡") && tokens.includes("p1"), tokens);

  const dataset = baseDataSet();
  const totalRows = dataset.searchTotalKeywords
    .filter((row) => row.storeId === "s1")
    .map((row) => ({ ...row, date: null }));
  const totalAggregate = aggregateSearchTotalKeywords(totalRows, filter);
  addCheck("unionNotIntersection", buildBrandModelMatch({ keyword: "P1" }, filter).matches);
  addCheck("sameKeywordBrandAndModelCountedOnce", totalAggregate.visitors === 15 && totalAggregate.buyers === 3, totalAggregate);

  const productRows = dataset.searchProductKeywords
    .filter((row) => row.storeId === "s1")
    .map((row) => ({ ...row, date: null }));
  const productAggregate = aggregateSearchProductKeywords(productRows, filter, ["p1"]);
  addCheck("seriesProductDedupByProductKeyword", productAggregate.visitors === 6 && productAggregate.buyers === 1, productAggregate);
  addCheck("noTokensMeansNoMatch", !hasBrandModelTokens({ brandWords: [], modelWords: [] }));

  const source = buildSyntheticSource();
  const baseState = {
    ...createDefaultBIState(),
    selectedStores: ["s1"],
    selectedMetric: "GMV",
    brandModelFilter: filter,
    timeRange: { mode: "day" as const, startDate: "2026-06-24", endDate: "2026-06-24" },
  };
  const vm = buildHomeBIViewModel(source, baseState);
  const noFilterVm = buildHomeBIViewModel(source, { ...baseState, brandModelFilter: { brandWords: [], modelWords: [] } });
  const gmvWithFilter = vm.kpiCards.find((card) => card.title === "GMV")?.value;
  const gmvWithoutFilter = noFilterVm.kpiCards.find((card) => card.title === "GMV")?.value;
  addCheck("globalKpisUnaffectedByBrandFilter", gmvWithFilter === gmvWithoutFilter && gmvWithFilter === "1,500", { gmvWithFilter, gmvWithoutFilter });
  addCheck("homeBrandVisitorsFromSearchTotal", vm.kpiCards.find((card) => card.title === "品牌词访客")?.rawValue === 15);
  addCheck("homeBrandBuyersFromSearchTotal", vm.kpiCards.find((card) => card.title === "品牌词支付人数")?.rawValue === 3);
  addCheck("homeGeoSearchShare", vm.kpiCards.find((card) => card.title === "GEO搜索占比")?.value === "20%");
  addCheck("emptyFilterShowsPrompt", noFilterVm.kpiCards.find((card) => card.title === "品牌词访客")?.description === "请先设置品牌词 / 中心词");

  const brandChart = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "品牌词访客" });
  addCheck("homeBrandTrendHasTotalLine", brandChart.mtdChartModel.lines.some((line) => line.name === "品牌词合计"));
  addCheck("homeBrandTrendMaxFourLines", brandChart.mtdChartModel.lines.length <= 4, brandChart.mtdChartModel.lines.map((line) => line.name));
  const geoChart = buildHomeBIViewModel(source, { ...baseState, selectedMetric: "GEO搜索占比" });
  addCheck("homeGeoTrendMainLine", geoChart.mtdChartModel.lines.some((line) => line.name === "GEO搜索占比"));
  addCheck("noInvalidOutput", !containsInvalidOutput(vm) && !containsInvalidOutput(brandChart) && !containsInvalidOutput(geoChart));

  setRuntimeBIDataSet(dataset);
  const runtimeSource = await loadHomeBIDataSource();
  clearRuntimeBIDataSet();
  addCheck("dataSourceExposesSearchTotalKeywords", runtimeSource.searchTotalKeywords.length === dataset.searchTotalKeywords.length, runtimeSource.searchTotalKeywords.length);
  addCheck("dataSourceExposesSearchProductKeywords", runtimeSource.searchProductKeywords.length === dataset.searchProductKeywords.length, runtimeSource.searchProductKeywords.length);
};

const runStaticChecks = () => {
  const files = changedFiles();
  addCheck(
    "changedFilesWithinKnownBaseline",
    files.every((file) => allowedPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern))),
    files,
  );
  addCheck(
    "strictForbiddenPathsUnchanged",
    !files.some((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern))),
    files,
  );

  const home = read("components/home/home-bi-dashboard.tsx");
  const series = read("components/series-board/v1/series-board-v1-dashboard.tsx");
  const mapper = read("lib/bi/bi.home-mapper.ts");
  const dataSource = read("lib/bi/bi.data-source.ts");
  const popover = read("components/visual-system/v1/brand-model-filter-popover.tsx");
  const upload = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  const history = read("components/upload/history/v1/history-data-v1-dashboard.tsx");
  const quality = read("components/upload/quality/v1/upload-quality-v1-dashboard.tsx");

  addCheck("homeHasBrandModelButton", home.includes("品牌词筛选") && home.includes("home-bi-brand-model-filter-button"));
  addCheck("seriesHasBrandModelButton", series.includes("品牌词筛选") && series.includes("series-board-v1-brand-model-filter-button"));
  addCheck("popoverHasBrandAndModelInputs", popover.includes("品牌词 / 中心词设置") && popover.includes("品牌词") && popover.includes("中心词 / 型号词"));
  addCheck("dataSourceMapsSearchKeywords", dataSource.includes("searchTotalKeywords") && dataSource.includes("searchProductKeywords") && dataSource.includes("normalizeETLSearchTotalKeywords"));
  addCheck("homeMapperUsesSemanticLayer", mapper.includes("aggregateSearchTotalKeywords") && mapper.includes("aggregateSearchProductMetricByDate"));
  addCheck("seriesUsesProductFirstSemanticLayer", series.includes("scopedSearchProductKeywords") && series.includes("aggregateSearchProductKeywords"));
  addCheck("noStorageWritesInBrandFeature", ![home, series, popover, mapper].some((source) =>
    /(?:window\.)?(?:localStorage|indexedDB)\s*\./.test(source) ||
    /(?:window\.)?(?:localStorage|indexedDB)\s*\[/.test(source),
  ));
  addCheck("uploadHistoryQualityNotBrandModified", ![upload, history, quality].some((source) => source.includes("BrandModelFilterPopover") || source.includes("品牌词筛选")));
  addCheck("noSensitiveTextInFeatureFiles", ![home, series, mapper, popover].some((source) => sensitiveTokens.some((token) => source.includes(token))));
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  let chrome: { client: CdpClient; process: ChildProcessWithoutNullStreams; profileDir: string } | null = null;
  try {
    chrome = await launchChrome();
    const { client } = chrome;

    await client.navigate(`${BASE_URL}/login`, 1440, 900);
    await clickByText(client, "进入工作台");
    await wait(1000);

    await client.navigate(`${BASE_URL}/home`, 1440, 900);
    addCheck("homeHttp200", await waitForHttp200(`${BASE_URL}/home`, 5000));
    addCheck("homeBrandButtonInDom", await client.evaluate<boolean>(`!!document.querySelector("[data-testid='home-bi-brand-model-filter-button']")`));
    await capture(client, "/home", "1440px", "home-1440.png", "ready");
    await clickByText(client, "品牌词筛选");
    addCheck("homePopoverInDom", await client.evaluate<boolean>(`!!document.querySelector("[data-testid='home-bi-brand-model-filter-popover']")`));
    await setTextareaValue(client, "[data-testid='home-bi-brand-model-filter-popover-brand-words']", "空气堡");
    await setTextareaValue(client, "[data-testid='home-bi-brand-model-filter-popover-model-words']", "P1");
    await capture(client, "/home", "1440px", "home-brand-popover.png", "popover");
    await clickByText(client, "保存");
    await clickByText(client, "品牌词访客");
    await capture(client, "/home", "1440px", "home-brand-visitors-chart.png", "brand_visitors_chart");
    addCheck("homeBrandTotalLegendInDom", await client.evaluate<boolean>(`document.body.innerText.includes("品牌词合计")`));
    await clickByText(client, "品牌词支付人数");
    await capture(client, "/home", "1440px", "home-brand-buyers-chart.png", "brand_buyers_chart");
    await clickByText(client, "GEO搜索占比");
    await capture(client, "/home", "1440px", "home-geo-chart.png", "geo_chart");

    await client.navigate(`${BASE_URL}/series-board`, 1440, 900);
    addCheck("seriesHttp200", await waitForHttp200(`${BASE_URL}/series-board`, 5000));
    addCheck("seriesBrandButtonInDom", await client.evaluate<boolean>(`!!document.querySelector("[data-testid='series-board-v1-brand-model-filter-button']")`));
    await capture(client, "/series-board", "1440px", "series-1440.png", "ready");
    await clickByText(client, "品牌词筛选");
    addCheck("seriesPopoverInDom", await client.evaluate<boolean>(`!!document.querySelector("[data-testid='series-board-v1-brand-model-filter-popover']")`));
    await setTextareaValue(client, "[data-testid='series-board-v1-brand-model-filter-popover-brand-words']", "空气堡");
    await setTextareaValue(client, "[data-testid='series-board-v1-brand-model-filter-popover-model-words']", "P1");
    await capture(client, "/series-board", "1440px", "series-brand-popover.png", "popover");
    await clickByText(client, "保存");
    await clickByText(client, "品牌词访客");
    await capture(client, "/series-board", "1440px", "series-brand-visitors-chart.png", "brand_visitors_chart");
    await clickByText(client, "GEO搜索占比");
    await capture(client, "/series-board", "1440px", "series-geo-chart.png", "geo_chart");

    await client.navigate(`${BASE_URL}/home`, 390, 900);
    await capture(client, "/home", "390px", "home-390.png", "mobile");
    await client.navigate(`${BASE_URL}/series-board`, 390, 900);
    await capture(client, "/series-board", "390px", "series-390.png", "mobile");

    addCheck("browserConsoleErrorZero", client.consoleErrors.length === 0, client.consoleErrors);
    addCheck("browserNoHorizontalOverflow", screenshots.every((record) => !record.horizontalOverflow), screenshots);
    addCheck("screenshotsCreated", screenshots.length >= 10 && screenshots.every((record) => fs.existsSync(record.screenshotPath)), screenshots);
  } finally {
    if (chrome) {
      chrome.client.close();
      chrome.process.kill("SIGTERM");
      await wait(800);
      if (chrome.process.exitCode === null) chrome.process.kill("SIGKILL");
      await removeDirWithRetry(chrome.profileDir);
    }
    if (server) server.kill("SIGTERM");
  }
};

const main = async () => {
  await runDataChecks();
  runStaticChecks();
  await runBrowserChecks();

  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: "PASS",
        task: "BRAND_MODEL_SEMANTIC_LAYER_V1_FOR_HOME_AND_SERIES",
        screenshotDir,
        screenshots,
        checks,
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ status: "PASS", checks, screenshotManifest: manifestPath }, null, 2));
};

main().catch((error) => {
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: "FAIL",
        error: error instanceof Error ? error.message : String(error),
        screenshots,
        checks,
      },
      null,
      2,
    ),
  );
  console.error(error);
  console.error(`screenshotManifest=${manifestPath}`);
  process.exitCode = 1;
});
