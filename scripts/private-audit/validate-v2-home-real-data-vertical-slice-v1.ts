import { File as NodeFile } from "node:buffer";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  runETLRuntime,
  type BIDataSet,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";

const ROOT = process.cwd();
const SAMPLE_DIR = process.env.V2_HOME_SAMPLE_DIR ?? "/Users/zongji/Desktop/每日平台数据/天猫";
const PORT = Number(process.env.V2_HOME_E2E_PORT ?? "3010");
const BASE_URL = process.env.V2_HOME_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const VISUAL_ROUND = process.env.V2_HOME_VISUAL_ROUND ?? "round2";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TASK_BASELINE_HEAD = "1311533c86acd2ce5470096b36f1ab1f4e23353b";
const TASK_COMPLETION_HEAD = "e3037c51ae40936268d6e580f8c3ac5046e8ba1b";
const ARTIFACT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), `airburg-v2-home-${VISUAL_ROUND}-`));

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
  name: string;
  route: string;
  viewport: string;
  path: string;
  horizontalOverflow: boolean;
}

interface RuntimePlan {
  filePaths: string[];
  dataset: BIDataSet;
  productId: string;
  expectedIssueCodes: string[];
}

interface BrowserResult {
  importCounts: { success: number; failed: number; skipped: number };
  duplicateImportCounts: { success: number; failed: number; skipped: number };
  totals: {
    gmv: number;
    gsv: number;
    visitors: number;
    paidBuyers: number;
    adSpend: number;
    clicks: number;
    refundAmount: number;
    hasTargetsField: boolean;
  };
  metricCount: number;
  keySeriesCount: number;
  consoleErrors: number;
  failedBusinessRequests: number;
  desktopLayout: {
    regionCount: number;
    toolbarHeight: number;
    kpiColumnCount: number;
    kpiRowCount: number;
    kpiHeightMin: number;
    kpiHeightMax: number;
    keySeriesHeight: number;
    chartHeight: number;
    visibleExplanationCount: number;
    engineeringTextCount: number;
    shadowedKpiCount: number;
    dataHealthCount: number;
    safeSkippedCount: number;
  };
  mobileLayout: {
    kpiColumnCount: number;
    overlappingKpiCellCount: number;
    metricDialogInViewport: boolean;
    operatingMenuInViewport: boolean;
  };
  screenshots: ScreenshotRecord[];
}

const checks: Check[] = [];
const screenshots: ScreenshotRecord[] = [];
let currentStage = "source_checks";

const check = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(`${name} failed`);
};

const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp200 = async (url: string, timeoutMs: number): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return true;
    } catch {
      await wait(250);
    }
  }
  return false;
};

const ensureServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (await waitForHttp200(`${BASE_URL}/v2/home`, 2500)) return null;
  const server = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)],
    { cwd: ROOT },
  );
  server.stdout.on("data", () => undefined);
  server.stderr.on("data", () => undefined);
  if (!(await waitForHttp200(`${BASE_URL}/v2/home`, 45000))) {
    server.kill("SIGTERM");
    throw new Error("local V2 server unavailable");
  }
  return server;
};

const sourceChecks = () => {
  const page = read("app/(workspace-v2)/v2/home/page.tsx");
  const dashboard = read("components/saas-v2/home/v2-home-dashboard.tsx");
  const adapter = read("lib/v2/home/v2-home-adapter.ts");
  const types = read("types/v2/home.ts");
  const contract = JSON.parse(read("docs/project/V2_HOME_DATA_CONTRACT.json")) as { metrics: unknown[] };
  const routeMatrix = JSON.parse(read("docs/project/ROUTE_DATA_SOURCE_MATRIX.json")) as {
    routes: Array<{ route: string; isStaticShell: boolean; isDataBound: boolean; status: string }>;
  };
  const projectSsot = JSON.parse(read("docs/project/PROJECT_SSOT.json")) as {
    currentTask: { taskId: string; status: string };
    tracks: { saasUiV2: Record<string, unknown> };
  };
  const evidence = JSON.parse(read("docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1/evidence.json")) as {
    status: string;
    visualAccepted: boolean;
    visualReviewStatus: string;
    humanReviewRequired: boolean;
  };
  const currentTaskPointer = JSON.parse(read("docs/project/current-task.json")) as { taskId: string };

  check("v2HomeReadsOneDashboardBoundary", page.includes("V2HomeDashboard") && !/lib\/(bi|etl|persistence|v05)/.test(page));
  check("dashboardReadsOnlyV2Adapter", dashboard.includes("@/lib/v2/home/v2-home-adapter") && !/lib\/(bi|etl|persistence|v05)/.test(dashboard));
  check(
    "adapterOwnsCanonicalCompatibilityReads",
    ["loadHomeBIDataSource", "loadActiveRuntimeDatasetSnapshot", "loadCrossPageDebugContext", "loadActiveTargetDrafts"]
      .every((token) => adapter.includes(token)),
  );
  check("typedAdapterContractExists", types.includes("V2HomeViewModel") && types.includes("V2HomeTargetOverlay"));
  check("all17MetricsContractMapped", contract.metrics.length === 17 && adapter.includes("V2_HOME_METRIC_KEYS.map"));
  check("brandKeywordPaidShareNotGeoAlias", adapter.includes("brandKeywordPaidShare") && !adapter.includes("geoSearchShare"));
  check("actualTargetSeparation", adapter.includes("targetDrafts: {}") && adapter.includes("targetOverlayForMetric"));
  check("runtimeTargetMutationAbsent", !/saveRuntimeDataset|appendRuntime|targets\s*:/.test(adapter));
  const v2HomeRoute = routeMatrix.routes.find((route) => route.route === "/v2/home");
  const otherV2Routes = routeMatrix.routes.filter((route) => route.route.startsWith("/v2/") && route.route !== "/v2/home");
  check(
    "v2HomeStateRecordedInSsot",
    projectSsot.currentTask.taskId === "V2_HOME_REAL_DATA_VERTICAL_SLICE_V1" &&
      projectSsot.currentTask.status === "LOCAL_E2E_PASS" &&
      projectSsot.tracks.saasUiV2.status === "HOME_VERTICAL_SLICE_LOCAL_E2E_PASS" &&
      projectSsot.tracks.saasUiV2.visualAccepted === false &&
      projectSsot.tracks.saasUiV2.humanAccepted === false,
  );
  check(
    "v2HomeOnlyDataBoundRouteInMatrix",
    v2HomeRoute?.isDataBound === true && v2HomeRoute.isStaticShell === false && v2HomeRoute.status === "LOCAL_E2E_PASS",
  );
  check(
    "otherV2RoutesRemainStaticInMatrix",
    otherV2Routes.length === 8 && otherV2Routes.every((route) => route.isStaticShell && !route.isDataBound),
  );
  check(
    "humanReviewStatusNotOverclaimed",
    evidence.status === "LOCAL_E2E_PASS" &&
      evidence.visualAccepted === false &&
      evidence.visualReviewStatus === "PENDING_HUMAN_REVIEW" &&
      evidence.humanReviewRequired === true,
  );
  check("currentTaskPointerStillNamesAuthorizedTask", currentTaskPointer.taskId === "V2_HOME_REAL_DATA_VERTICAL_SLICE_V1");
  const changedPaths = execFileSync("git", ["diff", "--name-only", TASK_BASELINE_HEAD, TASK_COMPLETION_HEAD, "--"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  const allowedExactPaths = new Set([
    "app/(workspace-v2)/v2/home/page.tsx",
    "docs/project/PROJECT_SSOT.json",
    "docs/project/ROUTE_DATA_SOURCE_MATRIX.json",
  ]);
  const allowedPrefixes = [
    "components/saas-v2/",
    "lib/v2/",
    "types/v2/",
    "docs/project/tasks/V2_HOME_REAL_DATA_VERTICAL_SLICE_V1/",
    "scripts/private-audit/",
  ];
  const outOfContract = changedPaths.filter(
    (changedPath) => !allowedExactPaths.has(changedPath) && !allowedPrefixes.some((prefix) => changedPath.startsWith(prefix)),
  );
  check("allStageBChangesWithinTaskContract", outOfContract.length === 0, { count: outOfContract.length });
  check("legacyV1RoutesUnmodified", !changedPaths.some((changedPath) => changedPath.startsWith("app/(workspace)/") || changedPath.startsWith("components/home/") || changedPath.startsWith("components/series-board/") || changedPath.startsWith("components/store-board/") || changedPath.startsWith("components/product-board/") || changedPath.startsWith("components/upload/")));
  check("otherV2PageFilesUnmodified", !changedPaths.some((changedPath) => changedPath.startsWith("app/(workspace-v2)/v2/") && changedPath !== "app/(workspace-v2)/v2/home/page.tsx"));
  const protectedStatus = execFileSync(
    "git",
    ["status", "--porcelain", "--", "package.json", "package-lock.json", "vercel.json"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  check("packageAndVercelUnmodifiedByTask", protectedStatus.length === 0);
  check("generatedBuildNoiseAbsent", !fs.existsSync(path.join(ROOT, "tsconfig.tsbuildinfo")));
};

const realFilePaths = (): string[] => {
  if (!fs.existsSync(SAMPLE_DIR)) return [];
  return fs.readdirSync(SAMPLE_DIR)
    .filter((name) => /\.(xlsx?|csv)$/i.test(name))
    .map((name) => path.join(SAMPLE_DIR, name))
    .sort();
};

const makeSafeNodeFile = (filePath: string, index: number): File => {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new NodeFile([bytes], `safe_input_${index + 1}${extension}`, {
    type: extension === ".csv" ? "text/csv" : "application/vnd.ms-excel",
  }) as unknown as File;
};

const buildRuntimePlan = async (): Promise<RuntimePlan> => {
  const filePaths = realFilePaths();
  check("real18FilesAvailable", filePaths.length === 18, { count: filePaths.length });
  const files = filePaths.map(makeSafeNodeFile);
  const descriptors: UploadedFileDescriptor[] = files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));
  const runtime = await runETLRuntime(descriptors);
  const productId = runtime.dataset.productMetrics.find((row) => row.productId.trim())?.productId
    ?? runtime.dataset.products.find((row) => row.productId.trim())?.productId
    ?? "";
  check("runtimePlanHasProductId", productId.length > 0);
  check("runtimePlanSafeSkippedPresent", runtime.issues.some((issue) => issue.code === "etl_plan_summary_without_product_id_unsupported"));
  return {
    filePaths,
    dataset: runtime.dataset,
    productId,
    expectedIssueCodes: Array.from(new Set(runtime.issues.map((issue) => issue.code))).sort(),
  };
};

const fetchJson = <T>(url: string): Promise<T> => new Promise((resolve, reject) => {
  http.get(url, (response) => {
    if ((response.statusCode ?? 500) >= 400) {
      response.resume();
      reject(new Error("CDP endpoint unavailable"));
      return;
    }
    let body = "";
    response.on("data", (chunk) => { body += String(chunk); });
    response.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch (error) {
        reject(error);
      }
    });
  }).on("error", reject);
});

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  readonly consoleErrors: string[] = [];
  readonly failedBusinessRequests: string[] = [];

  private constructor(private readonly socket: WebSocket) {}

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolve(client), { once: true });
      socket.addEventListener("error", reject, { once: true });
      socket.addEventListener("message", (event) => client.onMessage(String(event.data)));
    });
  }

  private onMessage(raw: string) {
    const message = JSON.parse(raw) as CdpMessage;
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(message.error);
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") this.consoleErrors.push("runtime_exception");
    if (message.method === "Runtime.consoleAPICalled") {
      const params = message.params as { type?: string } | undefined;
      if (params?.type === "error") this.consoleErrors.push("console_error");
    }
    if (message.method === "Log.entryAdded") {
      const params = message.params as { entry?: { level?: string; text?: string; url?: string } } | undefined;
      if (params?.entry?.level === "error") {
        const text = `${params.entry.url ?? ""} ${params.entry.text ?? ""}`;
        if (!text.includes("favicon.ico")) this.consoleErrors.push("browser_log_error");
      }
    }
    if (message.method === "Network.responseReceived") {
      const params = message.params as { response?: { status?: number; url?: string } } | undefined;
      const status = params?.response?.status ?? 0;
      const url = params?.response?.url ?? "";
      if (status >= 400 && !url.includes("favicon.ico")) this.failedBusinessRequests.push(`http_${status}`);
    }
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }

  close() {
    this.socket.close();
  }
}

const launchChrome = async (
  profileDir: string,
): Promise<{ chrome: ChildProcessWithoutNullStreams; port: number }> => {
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => undefined);
  chrome.stdout.on("data", () => undefined);
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if (chrome.exitCode !== null) throw new Error("Chrome exited before CDP was ready");
      const activePort = fs.readFileSync(activePortFile, "utf8").split("\n")[0]?.trim() ?? "";
      const port = Number(activePort);
      if (!Number.isInteger(port) || port <= 0) throw new Error("Chrome CDP port missing");
      const version = await fetchJson<{ Browser?: string; webSocketDebuggerUrl?: string }>(
        `http://127.0.0.1:${port}/json/version`,
      );
      if (!version.Browser?.includes("Chrome") || !version.webSocketDebuggerUrl) {
        throw new Error("Unexpected CDP endpoint");
      }
      return { chrome, port };
    } catch {
      await wait(100);
    }
  }
  chrome.kill("SIGTERM");
  throw new Error("Chrome remote debugging unavailable");
};

const debuggerUrl = async (port: number): Promise<string> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(
        `http://127.0.0.1:${port}/json`,
      );
      if (Array.isArray(pages)) {
        const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome may still be publishing the first page target.
    }
    await wait(100);
  }
  throw new Error("Chrome page target missing");
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const response = await client.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error("browser evaluation failed");
  return response.result?.value as T;
};

const waitForExpression = async (client: CdpClient, expression: string, timeoutMs = 20000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate<boolean>(client, expression)) return;
    await wait(120);
  }
  throw new Error("browser state timeout");
};

const navigate = async (client: CdpClient, route: string, readySelector: string) => {
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await waitForExpression(client, `Boolean(document.querySelector(${JSON.stringify(readySelector)}))`, 20000);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 390,
  });
  await wait(200);
};

const setInputFiles = async (client: CdpClient, filePaths: string[]) => {
  const documentResult = await client.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: -1, pierce: true });
  const input = await client.send<{ nodeId: number }>("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector: "input[type=file][multiple]",
  });
  if (!input.nodeId) throw new Error("multiple file input missing");
  await client.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: filePaths });
};

const click = async (client: CdpClient, selector: string) => {
  await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error('click target missing');
    element.click();
  })()`);
  await wait(200);
};

const clickText = async (client: CdpClient, text: string, selector = "button, a") => {
  await evaluate(client, `(() => {
    const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
      .find((element) => element.textContent?.trim().includes(${JSON.stringify(text)}) && !(element instanceof HTMLButtonElement && element.disabled));
    if (!(target instanceof HTMLElement)) throw new Error('text target missing');
    target.click();
  })()`);
  await wait(250);
};

const setTextarea = async (client: CdpClient, selector: string, value: string) => {
  await evaluate(client, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!(target instanceof HTMLTextAreaElement)) throw new Error('textarea missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(target, ${JSON.stringify(value)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(150);
};

const selectValue = async (client: CdpClient, selector: string, value: string) => {
  await evaluate(client, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!(target instanceof HTMLSelectElement)) throw new Error('select missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(target, ${JSON.stringify(value)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(250);
};

const scrollTo = async (client: CdpClient, selector: string) => {
  await evaluate(client, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!(target instanceof HTMLElement)) throw new Error('scroll target missing');
    target.scrollIntoView({ block: 'start', inline: 'nearest' });
  })()`);
  await wait(250);
};

const setDateInput = async (client: CdpClient, index: number, value: string) => {
  await evaluate(client, `(() => {
    const inputs = document.querySelectorAll('[data-testid="v2-home-toolbar"] input[type="date"]');
    const target = inputs[${index}];
    if (!(target instanceof HTMLInputElement)) throw new Error('date input missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(target, ${JSON.stringify(value)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await wait(250);
};

const importCounts = (client: CdpClient) => evaluate<{ success: number; failed: number; skipped: number }>(client, `(() => {
  const text = document.querySelector('[data-testid="upload-page-v2-result-summary"]')?.textContent ?? '';
  const read = (label) => Number(text.match(new RegExp(label + '：?([0-9]+)'))?.[1] ?? -1);
  return { success: read('成功'), failed: read('失败'), skipped: read('skipped') };
})()`);

const configureRealSeries = async (client: CdpClient, productId: string) => {
  currentStage = "series_navigate";
  await navigate(client, "/series-board", "[data-testid='series-board-v1-dashboard']");
  await waitForExpression(
    client,
    `document.body.innerText.includes('ETL运行时数据') || document.body.innerText.includes('已恢复上次安全聚合数据')`,
    15000,
  );
  currentStage = "series_settings_open";
  await clickText(client, "系列设置", "button");
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="series-board-v1-series-settings"]'))`);
  currentStage = "series_product_add";
  await setTextarea(client, "[data-testid='series-board-v1-series-settings'] textarea", productId);
  await clickText(client, "添加到当前系列商品清单", "[data-testid='series-board-v1-series-settings'] button");
  await wait(800);
  const addState = await evaluate<{
    removeActionCount: number;
    textareaCleared: boolean;
    storeSelected: boolean;
    maintainedCountVisible: boolean;
  }>(client, `(() => {
    const root = document.querySelector('[data-testid="series-board-v1-series-settings"]');
    const textarea = root?.querySelector('textarea');
    const storeSelect = root?.querySelectorAll('select')?.[1];
    return {
      removeActionCount: Array.from(root?.querySelectorAll('button') ?? []).filter((button) => button.textContent?.trim() === '移除').length,
      textareaCleared: textarea instanceof HTMLTextAreaElement && textarea.value.length === 0,
      storeSelected: storeSelect instanceof HTMLSelectElement && storeSelect.value.length > 0,
      maintainedCountVisible: /已维护\s*1\s*个商品/.test(document.body.innerText)
    };
  })()`);
  check("realSeriesConfigurationSaved", addState.removeActionCount > 0 && addState.textareaCleared, addState);
  currentStage = "series_settings_close";
  await clickText(client, "关闭", "[data-testid='series-board-v1-series-settings'] button");
};

const seedPlatformTargets = async (client: CdpClient) => {
  const seeded = await evaluate<boolean>(client, `new Promise((resolve) => {
    const request = indexedDB.open('airburg-target-drafts-v1', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('targetDrafts')) request.result.createObjectStore('targetDrafts', { keyPath: 'targetId' });
    };
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const now = new Date().toISOString();
      const values = [
        ['gmv', 160000, '元'],
        ['gsv', 120000, '元'],
        ['adRoi', 6, '倍'],
        ['refundRate', 0.2, '%'],
        ['averageOrderValue', 1000, '元'],
        ['conversionRate', 0.01, '%'],
        ['directTransactionShare', 0.7, '%']
      ];
      const tx = db.transaction('targetDrafts', 'readwrite');
      const store = tx.objectStore('targetDrafts');
      values.forEach(([metricKey, targetValue, unit]) => store.put({
        schemaVersion: 1,
        targetId: 'v2-home-e2e:' + metricKey,
        scope: 'platform',
        platformCode: 'tmall',
        storeId: 'tmall-default-store',
        seriesId: null,
        productId: null,
        month: '2026-06',
        metricKey,
        targetValue,
        unit,
        createdAt: now,
        updatedAt: now,
        status: 'active'
      }));
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    };
  })`);
  check("safePlatformTargetsSeededForReadback", seeded);
};

const snapshotTotals = (client: CdpClient) => evaluate<BrowserResult["totals"]>(client, `new Promise((resolve) => {
  const fail = () => resolve({ gmv: 0, gsv: 0, visitors: 0, paidBuyers: 0, adSpend: 0, clicks: 0, refundAmount: 0, hasTargetsField: true });
  const open = indexedDB.open('airburg-runtime-dataset-v1');
  open.onerror = fail;
  open.onsuccess = () => {
    const db = open.result;
    const pointer = db.transaction('runtimeDatasetActivePointer', 'readonly').objectStore('runtimeDatasetActivePointer').get('active');
    pointer.onerror = fail;
    pointer.onsuccess = () => {
      const activeId = pointer.result?.activeDatasetId;
      if (!activeId) return fail();
      const request = db.transaction('runtimeDatasetSnapshots', 'readonly').objectStore('runtimeDatasetSnapshots').get(activeId);
      request.onerror = fail;
      request.onsuccess = () => {
        const dataset = request.result?.dataset;
        if (!dataset) return fail();
        const inRange = (row) => typeof row?.date === 'string' && row.date.slice(0, 10) >= '2026-06-26' && row.date.slice(0, 10) <= '2026-06-30';
        const sum = (rows, key) => (rows ?? []).filter(inRange).reduce((total, row) => total + (Number.isFinite(row?.[key]) ? row[key] : 0), 0);
        resolve({
          gmv: sum(dataset.productMetrics, 'gmv'),
          gsv: sum(dataset.productMetrics, 'gsv'),
          visitors: sum(dataset.productMetrics, 'visitors'),
          paidBuyers: sum(dataset.productMetrics, 'buyers'),
          adSpend: sum(dataset.planMetrics, 'spend'),
          clicks: sum(dataset.planMetrics, 'clicks'),
          refundAmount: sum(dataset.afterSalesMetrics, 'refundAmount'),
          hasTargetsField: Object.prototype.hasOwnProperty.call(dataset, 'targets')
        });
      };
    };
  };
})`);

const pageSafety = (client: CdpClient) => evaluate<{
  invalidText: boolean;
  sensitiveText: boolean;
  horizontalOverflow: boolean;
}>(client, `(() => {
  const text = document.body.innerText;
  const sensitive = ['rawRows','previewRows','warning 原文','订单号原文','退款编号原文','物流原文','买家说明原文','商家备注原文'];
  return {
    invalidText: /NaN|Infinity|undefined/.test(text),
    sensitiveText: sensitive.some((token) => text.includes(token)),
    horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1
  };
})()`);

const capture = async (client: CdpClient, name: string, viewport: string, fullPage = true) => {
  const safety = await pageSafety(client);
  const captureParams: Record<string, unknown> = { format: "png", captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await client.send<{ contentSize: { width: number; height: number } }>("Page.getLayoutMetrics");
    captureParams.clip = {
      x: 0,
      y: 0,
      width: Math.ceil(metrics.contentSize.width),
      height: Math.min(12000, Math.ceil(metrics.contentSize.height)),
      scale: 1,
    };
  }
  const result = await client.send<{ data: string }>("Page.captureScreenshot", captureParams);
  const screenshotPath = path.join(ARTIFACT_DIR, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(result.data, "base64"));
  screenshots.push({
    name,
    route: await evaluate<string>(client, "window.location.pathname"),
    viewport,
    path: screenshotPath,
    horizontalOverflow: safety.horizontalOverflow,
  });
};

const browserChecks = async (plan: RuntimePlan): Promise<BrowserResult> => {
  const server = await ensureServer();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v2-home-profile-"));
  const launchedChrome = await launchChrome(profileDir);
  const { chrome, port: debugPort } = launchedChrome;
  let client: CdpClient | null = null;
  try {
    client = await CdpClient.connect(await debuggerUrl(debugPort));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("DOM.enable");
    await client.send("Network.enable");
    await setViewport(client, 1440, 1000);
    currentStage = "login_seed";
    await client.send("Page.navigate", { url: `${BASE_URL}/login` });
    await waitForExpression(client, "Boolean(document.querySelector('button'))");
    await evaluate(client, `(() => {
      localStorage.setItem('airburg:demo-session', JSON.stringify({ account: 'v2-home-audit', loggedInAt: new Date().toISOString() }));
    })()`);

    currentStage = "upload_navigate";
    await navigate(client, "/upload", "[data-testid='upload-page-v1-dashboard']");
    currentStage = "upload_select_files";
    await setInputFiles(client, plan.filePaths);
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length === 18`, 30000);
    currentStage = "upload_import";
    await click(client, "[data-testid='upload-page-v2-import-button']");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="upload-page-v2-result-summary"]'))`, 30000);
    const firstImport = await importCounts(client);
    check("realUploadRecognitionCounts", firstImport.success === 17 && firstImport.failed === 0 && firstImport.skipped === 1, firstImport);

    await configureRealSeries(client, plan.productId);
    currentStage = "target_seed";
    await seedPlatformTargets(client);
    currentStage = "v2_home_initial_load";
    await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 20000);

    const metricState = await evaluate<{
      metricCount: number;
      gmv: string;
      gsv: string;
      spendRate: string;
      directShare: string;
      brandShare: string;
      targetBound: boolean;
      dateRangeCorrect: boolean;
      seriesCount: number;
      chartDates: string;
      dataHealthText: string;
    }>(client, `(() => {
      const card = (key) => document.querySelector('[data-metric-key="' + key + '"]')?.textContent ?? '';
      return {
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        gmv: card('gmv'),
        gsv: card('gsv'),
        spendRate: card('adSpendRateAfterRefund'),
        directShare: card('directTransactionShare'),
        brandShare: card('brandKeywordPaidShare'),
        targetBound: card('gmv').includes('160,000') && !card('gmv').includes('总目标--'),
        dateRangeCorrect: document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-26 ~ 2026-06-30') === true,
        seriesCount: document.querySelectorAll('[data-testid="v2-home-key-series"] a[href^="/v2/series-board?"]').length,
        chartDates: document.querySelector('[data-testid="v2-home-chart"]')?.textContent ?? '',
        dataHealthText: document.querySelector('[data-testid="v2-home-data-health-summary"]')?.textContent ?? ''
      };
    })()`);
    check("v2Home17MetricsVisible", metricState.metricCount === 17, { metricCount: metricState.metricCount });
    check("v2HomeCoreValuesVisible", /125,596/.test(metricState.gmv) && /85,455\.96/.test(metricState.gsv));
    check("v2HomeMissingMetricsValuesVisible", metricState.spendRate.includes("13.65%") && /63\.4(?:0)?%/.test(metricState.directShare));
    check("brandKeywordPaidShareExplicitPending", metricState.brandShare.includes("--") && !metricState.brandShare.includes("GEO"));
    check("targetOverlayBoundWithoutActualMutation", metricState.targetBound);
    check("defaultBusinessRangeStable", metricState.dateRangeCorrect);
    check("realConfiguredKeySeriesRestored", metricState.seriesCount > 0, { count: metricState.seriesCount });
    check("chartCoversBusinessDates", ["6/26", "6/27", "6/28", "6/29", "6/30"].every((date) => metricState.chartDates.includes(date)));
    check("persistedSafeSkippedCountMatchesUpload", metricState.dataHealthText.includes("安全跳过1"), {
      expected: firstImport.skipped,
    });

    await clickText(client, "自定义", "[data-testid='v2-home-toolbar'] summary");
    await setDateInput(client, 0, "2026-06-26");
    await setDateInput(client, 1, "2026-07-01");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-26 ~ 2026-07-01') === true`);
    check(
      "multiMonthRangeDoesNotReuseSingleMonthTarget",
      await evaluate<boolean>(client, `document.querySelector('[data-metric-key="gmv"]')?.getAttribute('aria-label')?.includes('总目标 --') === true`),
    );
    await setDateInput(client, 1, "2026-06-30");
    await waitForExpression(client, `document.querySelector('[data-metric-key="gmv"]')?.getAttribute('aria-label')?.includes('总目标 160,000') === true`);
    check("singleMonthTargetRestoresAfterRangeReturn", true);
    await clickText(client, "自定义", "[data-testid='v2-home-toolbar'] summary");

    const desktopLayout = await evaluate<BrowserResult["desktopLayout"]>(client, `(() => {
      const dashboard = document.querySelector('[data-testid="v2-home-dashboard"]');
      const toolbar = document.querySelector('[data-testid="v2-home-toolbar"]');
      const grid = document.querySelector('[data-testid="v2-home-metric-grid"]');
      const cells = Array.from(document.querySelectorAll('[data-kpi-cell="true"]'));
      const heights = cells.map((cell) => cell.getBoundingClientRect().height);
      const rowTops = Array.from(new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))));
      const bodyText = document.body.innerText;
      const engineeringTokens = ['Preview pending', 'STATIC_SHELL', 'DATA_BOUND', 'LOCAL_E2E_PASS', 'PENDING_IMPLEMENTATION', 'StoreRecord', 'ProductRecord', 'TrackedProductRecord', 'rawRows', 'previewRows', 'warning 原文'];
      const visibleExplanations = Array.from(document.querySelectorAll('[data-home-explanation]')).filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const shadowedKpiCount = cells.filter((cell) => {
        const shadow = getComputedStyle(cell).boxShadow;
        return shadow !== 'none' && shadow !== '';
      }).length;
      return {
        regionCount: dashboard?.querySelectorAll(':scope > [data-home-region]').length ?? 0,
        toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
        kpiColumnCount: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        kpiRowCount: rowTops.length,
        kpiHeightMin: heights.length ? Math.min(...heights) : 0,
        kpiHeightMax: heights.length ? Math.max(...heights) : 0,
        keySeriesHeight: document.querySelector('[data-testid="v2-home-key-series"]')?.getBoundingClientRect().height ?? 0,
        chartHeight: document.querySelector('[data-testid="v2-home-chart"]')?.getBoundingClientRect().height ?? 0,
        visibleExplanationCount: visibleExplanations.length,
        engineeringTextCount: engineeringTokens.filter((token) => bodyText.includes(token)).length,
        shadowedKpiCount,
        dataHealthCount: document.querySelector('[data-testid="v2-home-data-health-summary"]')?.children.length ?? 0,
        safeSkippedCount: Number(Array.from(document.querySelector('[data-testid="v2-home-data-health-summary"]')?.children ?? [])
          .find((item) => item.textContent?.includes('安全跳过'))?.textContent?.match(/[0-9]+/)?.[0] ?? -1)
      };
    })()`);
    check("homeHasExactlyFourPrimaryRegions", desktopLayout.regionCount === 4, desktopLayout);
    check("desktopToolbarWithin104Px", desktopLayout.toolbarHeight <= 108, { height: desktopLayout.toolbarHeight });
    check("desktopKpiMatrixUsesSixColumnsAndThreeRows", desktopLayout.kpiColumnCount === 6 && desktopLayout.kpiRowCount === 3, desktopLayout);
    check("kpiCellsHaveStableHeight", desktopLayout.kpiHeightMax - desktopLayout.kpiHeightMin <= 8, desktopLayout);
    check("keySeriesPanelIsCompact", desktopLayout.keySeriesHeight >= 120 && desktopLayout.keySeriesHeight <= 152, { height: desktopLayout.keySeriesHeight });
    check("trendPanelUsesReferenceHeight", desktopLayout.chartHeight >= 360 && desktopLayout.chartHeight <= 450, { height: desktopLayout.chartHeight });
    check("persistentExplanationLimitRespected", desktopLayout.visibleExplanationCount <= 2, desktopLayout);
    check("engineeringCopyAbsentFromHome", desktopLayout.engineeringTextCount === 0, desktopLayout);
    check("kpiCellsHaveNoIndividualShadow", desktopLayout.shadowedKpiCount === 0, desktopLayout);
    check("dataHealthIsFourCountSummary", desktopLayout.dataHealthCount === 4, desktopLayout);
    check("dataHealthSafeSkippedCountIsOne", desktopLayout.safeSkippedCount === firstImport.skipped, desktopLayout);
    check("homeOmitsFullConfigurationSurfaces", await evaluate<boolean>(client, `(() => {
      const dashboard = document.querySelector('[data-testid="v2-home-dashboard"]');
      return Boolean(dashboard) && dashboard.querySelectorAll('form, table, textarea').length === 0;
    })()`));

    const totals = await snapshotTotals(client);
    check(
      "realCoreReconciliation",
      totals.gmv === 125596 &&
        Math.abs(totals.gsv - 85455.96) < 0.01 &&
        totals.visitors === 143076 &&
        totals.paidBuyers === 128 &&
        Math.abs(totals.adSpend - 7625.95) < 0.01 &&
        totals.clicks === 6692 &&
        Math.abs(totals.refundAmount - 29602.18) < 0.01,
      totals,
    );
    check("runtimeDatasetHasNoTargets", totals.hasTargetsField === false);

    currentStage = "v2_home_interactions";
    await capture(client, `${VISUAL_ROUND}-home-1440`, "1440x1000");
    await capture(client, `${VISUAL_ROUND}-first-viewport-1440`, "1440x1000", false);
    await scrollTo(client, "[data-testid='v2-home-metric-grid']");
    await capture(client, `${VISUAL_ROUND}-kpi-grid-1440`, "1440x1000", false);
    await scrollTo(client, "[data-testid='v2-home-key-series']");
    await capture(client, `${VISUAL_ROUND}-key-series-1440`, "1440x1000", false);
    await scrollTo(client, "[data-testid='v2-home-chart']");
    await evaluate(client, `(() => {
      const hitArea = document.querySelector('[data-testid="v2-home-chart"] svg rect[fill="transparent"]');
      if (!(hitArea instanceof SVGElement)) throw new Error('chart hit area missing');
      hitArea.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      hitArea.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()`);
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-chart"]')?.textContent?.includes('2026-06-26') === true`);
    check("chartHoverTooltipResponds", true);
    await capture(client, `${VISUAL_ROUND}-mtd-chart-1440`, "1440x1000", false);

    await scrollTo(client, "[data-testid='v2-home-toolbar']");
    await clickText(client, "指标设置", "button");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`);
    const settingCount = await evaluate<number>(client, `document.querySelectorAll('[data-testid="v2-home-metric-settings"] input[type="checkbox"]').length`);
    check("metricSettingsHas17RealControls", settingCount === 17, { count: settingCount });
    await click(client, "[aria-label='显示GMV']");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 16`);
    await click(client, "[aria-label='显示GMV']");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`);
    await click(client, "[aria-label='下移GMV']");
    const reordered = await evaluate<boolean>(client, `document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') === 'gsv'`);
    check("metricVisibilityAndOrderingInteractive", reordered);
    await clickText(client, "恢复默认", "[data-testid='v2-home-metric-settings'] button");
    await capture(client, `${VISUAL_ROUND}-metric-settings-1440`, "1440x1000", false);
    await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");

    await click(client, "[data-testid='v2-home-operating-settings'] > summary");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-operating-settings"]')?.hasAttribute('open') === true`);
    const operatingActions = await evaluate<string[]>(client, `Array.from(document.querySelectorAll('[data-testid="v2-home-operating-settings"] nav a')).map((item) => item.textContent?.trim() ?? '')`);
    check("operatingSettingsContainsFourRequiredActions", ["重点系列", "商品排除", "搜索资产", "目标中心"].every((item) => operatingActions.includes(item)), operatingActions);
    await capture(client, `${VISUAL_ROUND}-operating-settings-1440`, "1440x1000", false);
    await click(client, "[data-testid='v2-home-operating-settings'] > summary");
    check("operatingSettingsCloses", await evaluate<boolean>(client, `document.querySelector('[data-testid="v2-home-operating-settings"]')?.hasAttribute('open') === false`));

    await clickText(client, "DLY", "[data-testid='v2-home-chart'] button");
    await waitForExpression(client, `Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => button.textContent?.trim() === 'DLY' && button.className.includes('text-blue-700'))`);
    await scrollTo(client, "[data-testid='v2-home-chart']");
    await capture(client, `${VISUAL_ROUND}-dly-chart-1440`, "1440x1000", false);
    await selectValue(client, "#v2-home-chart-primary", "adSpend");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-chart"]')?.textContent?.includes('推广花费') === true`);
    await selectValue(client, "#v2-home-chart-pair", "ad-spend-roi");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-chart"]')?.textContent?.includes('推广花费') === true`);
    const pairState = await evaluate<boolean>(client, `(() => {
      const text = document.querySelector('[data-testid="v2-home-chart"]')?.textContent ?? '';
      return text.includes('推广花费') && text.includes('ROI') && Boolean(document.querySelector('[data-testid="v2-home-chart"] svg'));
    })()`);
    check("allowedDualMetricPairWorks", pairState);
    await selectValue(client, "#v2-home-chart-pair", "none");
    await waitForExpression(client, `!document.querySelector('[data-testid="v2-home-chart-right-legend"]')`);
    check("singleMetricModeWorks", true);
    await selectValue(client, "#v2-home-chart-pair", "ad-spend-roi");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-chart-right-legend"]'))`);

    await scrollTo(client, "[data-testid='v2-home-toolbar']");
    await clickText(client, "日", "[data-testid='v2-home-toolbar'] button");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-30 ~ 2026-06-30') === true`);
    await clickText(client, "周", "[data-testid='v2-home-toolbar'] button");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-29 ~ 2026-07-05') === true`);
    await clickText(client, "月", "[data-testid='v2-home-toolbar'] button");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-01 ~ 2026-06-30') === true`);
    await clickText(client, "自定义", "[data-testid='v2-home-toolbar'] summary");
    await setDateInput(client, 0, "2026-06-26");
    await setDateInput(client, 1, "2026-06-30");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-26 ~ 2026-06-30') === true`);
    await setDateInput(client, 1, "2027-07-01");
    await waitForExpression(client, `document.body.innerText.includes('自定义时间范围最长 1 年')`);
    check("dayWeekMonthCustomAndMaxYearWork", true);
    check(
      "invalidCustomRangeNotPersisted",
      await evaluate<boolean>(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes('2026-06-26 ~ 2026-06-30') === true`),
    );
    currentStage = "v2_home_comparison";
    await selectValue(client, "#v2-home-comparison", "previous_period");
    await waitForExpression(client, `document.body.innerText.includes('当前范围暂无可比数据')`);
    check("comparisonDoesNotFabricate", await evaluate<boolean>(client, `document.body.innerText.includes('当前范围暂无可比数据')`));

    currentStage = "v2_home_refresh";
    await client.send("Page.reload", { ignoreCache: true });
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 20000);
    const restoredStateExpression = `(() => {
      const text = document.body.innerText;
      return text.includes('125,596') && text.includes('160,000') && text.includes('2026-06-26 ~ 2026-06-30') && document.querySelectorAll('[data-testid="v2-home-key-series"] a').length > 0;
    })()`;
    await waitForExpression(client, restoredStateExpression, 20000);
    check("refreshRestoresDatasetContextTargetsAndSeries", true);

    currentStage = "v2_home_reopen";
    await client.send("Page.navigate", { url: "about:blank" });
    await wait(150);
    await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 20000);
    await waitForExpression(client, restoredStateExpression, 20000);
    check("reopenRestoresActiveDataset", true);

    currentStage = "v2_home_mobile";
    await setViewport(client, 390, 900);
    await wait(250);
    const mobileSafety = await pageSafety(client);
    check("mobile390NoHorizontalOverflow", !mobileSafety.horizontalOverflow, mobileSafety);
    const mobileBaseLayout = await evaluate<Pick<BrowserResult["mobileLayout"], "kpiColumnCount" | "overlappingKpiCellCount">>(client, `(() => {
      const grid = document.querySelector('[data-testid="v2-home-metric-grid"]');
      const cards = Array.from(document.querySelectorAll('[data-kpi-cell="true"]'));
      const overlaps = cards.filter((card) => {
        const rows = Array.from(card.children).map((child) => child.getBoundingClientRect());
        return rows.some((row, index) => index > 0 && row.top < rows[index - 1].bottom - 1);
      });
      return {
        kpiColumnCount: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        overlappingKpiCellCount: overlaps.length
      };
    })()`);
    check("mobileKpiMatrixUsesTwoColumns", mobileBaseLayout.kpiColumnCount === 2, mobileBaseLayout);
    check("mobileKpiRowsDoNotOverlap", mobileBaseLayout.overlappingKpiCellCount === 0, mobileBaseLayout);
    await clickText(client, "指标设置", "button");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`);
    const metricDialogInViewport = await evaluate<boolean>(client, `(() => {
      const dialog = document.querySelector('[data-testid="v2-home-metric-settings"]');
      if (!(dialog instanceof HTMLElement)) return false;
      const rect = dialog.getBoundingClientRect();
      return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    })()`);
    check("mobileMetricDialogStaysInViewport", metricDialogInViewport);
    await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");
    await click(client, "[data-testid='v2-home-operating-settings'] > summary");
    const operatingMenuInViewport = await evaluate<boolean>(client, `(() => {
      const menu = document.querySelector('[data-testid="v2-home-operating-settings"] nav');
      if (!(menu instanceof HTMLElement)) return false;
      const rect = menu.getBoundingClientRect();
      return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
    })()`);
    check("mobileOperatingMenuStaysInViewport", operatingMenuInViewport);
    await click(client, "[data-testid='v2-home-operating-settings'] > summary");
    await capture(client, `${VISUAL_ROUND}-home-390`, "390x900");
    const mobileLayout: BrowserResult["mobileLayout"] = {
      ...mobileBaseLayout,
      metricDialogInViewport,
      operatingMenuInViewport,
    };

    currentStage = "duplicate_import";
    await setViewport(client, 1440, 1000);
    await navigate(client, "/upload", "[data-testid='upload-page-v1-dashboard']");
    await setInputFiles(client, plan.filePaths);
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length === 18`, 30000);
    await click(client, "[data-testid='upload-page-v2-import-button']");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="upload-page-v2-result-summary"]'))`, 30000);
    const secondImport = await importCounts(client);
    const totalsAfterDuplicate = await snapshotTotals(client);
    check(
      "duplicateImportDoesNotDouble",
      totalsAfterDuplicate.gmv === totals.gmv &&
        Math.abs(totalsAfterDuplicate.gsv - totals.gsv) < 0.01 &&
        totalsAfterDuplicate.visitors === totals.visitors &&
        totalsAfterDuplicate.paidBuyers === totals.paidBuyers,
      { duplicateImportCounts: secondImport },
    );

    currentStage = "final_safety";
    await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 20000);
    const finalSafety = await pageSafety(client);
    check("pageHasNoInvalidNumericText", !finalSafety.invalidText);
    check("pageHasNoSensitiveText", !finalSafety.sensitiveText);
    check("browserConsoleBusinessErrorsZero", client.consoleErrors.length === 0, { count: client.consoleErrors.length });
    check("failedBusinessRequestsZero", client.failedBusinessRequests.length === 0, { count: client.failedBusinessRequests.length });

    return {
      importCounts: firstImport,
      duplicateImportCounts: secondImport,
      totals,
      metricCount: metricState.metricCount,
      keySeriesCount: metricState.seriesCount,
      consoleErrors: client.consoleErrors.length,
      failedBusinessRequests: client.failedBusinessRequests.length,
      desktopLayout,
      mobileLayout,
      screenshots,
    };
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    await wait(200);
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    server?.kill("SIGTERM");
  }
};

const run = async () => {
  currentStage = "source_checks";
  sourceChecks();
  currentStage = "runtime_plan";
  const plan = await buildRuntimePlan();
  currentStage = "browser_checks";
  const browser = await browserChecks(plan);
  const routeResults = await Promise.all([
    "/v2/store-board",
    "/v2/series-board",
    "/v2/product-board",
    "/v2/upload",
    "/v2/data-health",
    "/v2/target-center",
    "/v2/search-assets",
    "/v2/exclusion-rules",
  ].map(async (route) => ({ route, status: (await fetch(`${BASE_URL}${route}`)).status })));
  check("otherV2RoutesSmokeOnly", routeResults.every((item) => item.status === 200), routeResults);

  const failed = checks.filter((item) => !item.pass);
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({
    status: failed.length === 0 ? "PASS" : "FAIL",
    visualRound: VISUAL_ROUND,
    realFileCount: plan.filePaths.length,
    expectedIssueCodes: plan.expectedIssueCodes,
    checks,
    browser,
    screenshots,
  }, null, 2));
  console.log(JSON.stringify({
    status: failed.length === 0 ? "PASS" : "FAIL",
    checks: checks.map((item) => ({ name: item.name, pass: item.pass, details: item.details })),
    manifestPath,
    realFileCount: plan.filePaths.length,
    importCounts: browser.importCounts,
    duplicateImportCounts: browser.duplicateImportCounts,
    totals: browser.totals,
    metricCount: browser.metricCount,
    keySeriesCount: browser.keySeriesCount,
    consoleErrors: browser.consoleErrors,
  }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
};

run().catch((error) => {
  const manifestPath = path.join(ARTIFACT_DIR, "manifest.json");
  const safeError = error instanceof Error ? error.message : "unknown_error";
  fs.writeFileSync(manifestPath, JSON.stringify({
    visualRound: VISUAL_ROUND,
    status: "FAIL",
    safeError,
    stage: currentStage,
    checks,
    screenshots,
  }, null, 2));
  console.error(JSON.stringify({
    status: "FAIL",
    safeError,
    stage: currentStage,
    checks,
    manifestPath,
  }, null, 2));
  process.exitCode = 1;
});
