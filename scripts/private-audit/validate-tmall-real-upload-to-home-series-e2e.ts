import { File as NodeFile } from "node:buffer";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseExcelWorkbook } from "../../lib/etl/parse-excel";
import {
  detectFileType,
  runETLRuntime,
  type BIDataSet,
  type ETLSourceType,
  type UploadedFileDescriptor,
} from "../../lib/etl/runtime";

const ROOT = process.cwd();
const SAMPLE_DIR = process.env.TMALL_REAL_E2E_SAMPLE_DIR ?? path.join(ROOT, "private-samples/tmall-real-etl");
const REQUIRED_FILE_COUNT = Number(process.env.TMALL_REAL_E2E_REQUIRED_FILE_COUNT ?? "5");
const AUDIT_PORT = Number(process.env.TMALL_REAL_E2E_PORT ?? "3200");
const BASE_URL = process.env.TMALL_REAL_E2E_BASE_URL ?? `http://127.0.0.1:${AUDIT_PORT}`;
const UPLOAD_URL = `${BASE_URL.replace(/\/$/, "")}/upload`;
const PUBLIC_BASE_URL = BASE_URL.replace(/\/$/, "");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-tmall-real-upload-e2e-"));
const ENABLE_PERSISTENCE_REGRESSION = process.env.TMALL_REAL_E2E_PERSISTENCE_REGRESSION === "1";

type Status = "PASS" | "FAIL" | "BLOCKED";

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

interface RealFixturePlan {
  filePaths: string[];
  safeFileCodes: string[];
  detectedTypes: ETLSourceType[];
  dataset: BIDataSet;
  counts: {
    products: number;
    productMetrics: number;
    planMetrics: number;
    searchTotalKeywords: number;
    searchProductKeywords: number;
  };
  keyword: string;
  keywordSafeCode: string;
  productId: string;
  productIdSafeCode: string;
  seriesProductVisitors: number | null;
  missingProductVisitors: number | null;
  runtimeSummary: {
    filesReceived: number;
    filesParsed: number;
    filesFailed: number;
    rowsParsed: number;
    rowsTransformed: number;
    dedupedRecords: number;
  };
  issueCodes: string[];
}

const checks: Check[] = [];
const screenshots: ScreenshotRecord[] = [];
let finalStatus: Status = "FAIL";

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const assertCheck = (name: string, condition: boolean, details?: unknown) => {
  addCheck(name, condition, details);
  if (!condition) throw new Error(`${name} failed`);
};

const block = (name: string, details?: unknown): never => {
  addCheck(name, false, details);
  const error = new Error(`${name} blocked`);
  error.name = "AuditBlockedError";
  throw error;
};

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

const knownPriorBaselinePatterns = [
  "AGENTS.md",
  "docs/**",
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
  "components/visual-system/**",
  "lib/bi/**",
  "lib/etl/**",
  "lib/persistence/**",
  "lib/state/**",
  "scripts/private-audit/**",
];

const forbiddenChangePatterns = [
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "components/upload/history/**",
  "components/upload/quality/**",
  "components/store-board/**",
  "components/product-board/**",
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const allowedThisTaskPatterns = [
  "scripts/private-audit/validate-tmall-real-upload-to-home-series-e2e.ts",
  "components/upload/v1/upload-page-v1-dashboard.tsx",
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "lib/etl/runtime/**",
  "lib/bi/bi.data-source.ts",
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
  "NaN",
  "Infinity",
  "undefined",
];

const safeCode = (value: string | Buffer): string =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);

const normalizeText = (value: string): string => value.trim().toLowerCase();

const keywordMatches = (keyword: string, token: string): boolean => {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedToken = normalizeText(token);
  return !!normalizedKeyword && !!normalizedToken && (normalizedKeyword.includes(normalizedToken) || normalizedToken.includes(normalizedKeyword));
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });

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
  if (await waitForHttp200(UPLOAD_URL, 3000)) return null;
  const server = spawn("npm", ["run", "dev", "--", "--port", String(AUDIT_PORT)], { cwd: ROOT });
  server.stdout.on("data", () => undefined);
  server.stderr.on("data", () => undefined);
  if (!(await waitForHttp200(UPLOAD_URL, 45000))) {
    server.kill("SIGTERM");
    throw new Error("/upload did not become available");
  }
  return server;
};

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  readonly consoleErrors: string[] = [];
  readonly ignoredConsoleErrors: string[] = [];

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
      if (params?.entry?.level === "error") {
        const text = `${params.entry.url ?? "unknown"} ${params.entry.text ?? "log_error"}`;
        if (text.includes("/favicon.ico") && text.includes("404")) this.ignoredConsoleErrors.push(text);
        else this.consoleErrors.push(text);
      }
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
  for (let index = 0; index < 100; index += 1) {
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

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let index = 0; index < 60; index += 1) {
    const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await wait(100);
  }
  throw new Error("No Chrome page debugger URL found");
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

const waitForExpression = async (client: CdpClient, expression: string, timeoutMs = 18000): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate<boolean>(client, expression)) return;
    await wait(120);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
};

const navigateAndWait = async (client: CdpClient, route: string, selector: string) => {
  await client.send("Page.navigate", { url: `${PUBLIC_BASE_URL}${route}` });
  await waitForSelector(client, selector);
};

const waitForSelector = async (client: CdpClient, selector: string): Promise<void> => {
  const escaped = JSON.stringify(selector);
  await waitForExpression(client, `Boolean(document.querySelector(${escaped}))`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(300);
};

const currentRoute = async (client: CdpClient): Promise<string> =>
  evaluate<string>(client, "window.location.pathname");

const capture = async (client: CdpClient, name: string, viewport: string, pageStatus: string): Promise<ScreenshotRecord> => {
  const horizontalOverflow = await evaluate<boolean>(
    client,
    `(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.ceil(root.scrollWidth) > Math.ceil(root.clientWidth) + 1 ||
        Math.ceil(body.scrollWidth) > Math.ceil(root.clientWidth) + 1;
    })()`,
  );
  const invalidText = await evaluate<boolean>(client, `/NaN|Infinity|undefined/.test(document.body.innerText)`);
  if (invalidText) throw new Error(`Invalid numeric text appeared during ${name}`);
  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(screenshotDir, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: await currentRoute(client),
    viewport,
    screenshotPath,
    pageStatus,
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
  };
};

const scrollToSelector = async (client: CdpClient, selector: string) => {
  const escaped = JSON.stringify(selector);
  await evaluate<void>(
    client,
    `(() => {
      const target = document.querySelector(${escaped});
      if (!target) throw new Error('target missing');
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
    })()`,
  );
  await wait(250);
};

const setInputFiles = async (client: CdpClient, files: string[]) => {
  const doc = await client.send<{ root: { nodeId: number } }>("DOM.getDocument", { depth: -1, pierce: true });
  const input = await client.send<{ nodeId: number }>("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: "input[type=file][multiple]",
  });
  if (!input.nodeId) throw new Error("multiple file input not found");
  await client.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files });
};

const clickSelector = async (client: CdpClient, selector: string) => {
  const escaped = JSON.stringify(selector);
  await evaluate<void>(
    client,
    `(() => {
      const target = document.querySelector(${escaped});
      if (!target) throw new Error('click target missing');
      target.click();
    })()`,
  );
  await wait(250);
};

const clickByText = async (client: CdpClient, text: string, selector = "button, a") => {
  const escapedText = JSON.stringify(text);
  const escapedSelector = JSON.stringify(selector);
  await evaluate<void>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll(${escapedSelector}))
        .find((node) => node.textContent?.includes(${escapedText}) && !(node instanceof HTMLButtonElement && node.disabled));
      if (!target) throw new Error('text target missing');
      target.click();
    })()`,
  );
  await wait(350);
};

const setTextareaValue = async (client: CdpClient, selector: string, value: string) => {
  const escapedSelector = JSON.stringify(selector);
  const escapedValue = JSON.stringify(value);
  await evaluate<void>(
    client,
    `(() => {
      const target = document.querySelector(${escapedSelector});
      if (!(target instanceof HTMLTextAreaElement)) throw new Error('textarea missing');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(target, ${escapedValue});
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await wait(150);
};

const clickKpi = async (client: CdpClient, rootSelector: string, title: string) => {
  const escapedRoot = JSON.stringify(rootSelector);
  const escapedTitle = JSON.stringify(title);
  await evaluate<void>(
    client,
    `(() => {
      const root = document.querySelector(${escapedRoot}) ?? document;
      const target = Array.from(root.querySelectorAll('[data-kpi-title]')).find((node) => node.getAttribute('data-kpi-title') === ${escapedTitle});
      if (!target) throw new Error('kpi missing');
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      target.click();
    })()`,
  );
  await wait(350);
};

const setHomeCustomTimeRange = async (client: CdpClient, startDate: string, endDate: string) => {
  await clickSelector(client, "[data-testid='home-bi-time-range-popover'] > button");
  await clickByText(client, "自定义", "[data-testid='home-bi-time-range-popover'] button");
  const escapedStart = JSON.stringify(startDate);
  const escapedEnd = JSON.stringify(endDate);
  await evaluate<void>(
    client,
    `(() => {
      const root = document.querySelector("[data-testid='home-bi-time-range-popover']");
      if (!root) throw new Error('time range popover missing');
      const inputs = Array.from(root.querySelectorAll('input[type="date"]'));
      if (inputs.length < 2) throw new Error('custom date inputs missing');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(inputs[0], ${escapedStart});
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      setter?.call(inputs[1], ${escapedEnd});
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    })()`,
  );
  await waitForExpression(
    client,
    `document.querySelector("[data-testid='home-bi-time-range-popover']")?.textContent?.includes(${JSON.stringify(`${startDate} ~ ${endDate}`)}) === true`,
    8000,
  );
};

const ensureDemoLogin = async (client: CdpClient) => {
  await evaluate<void>(
    client,
    `(() => {
      window.localStorage.setItem('airburg:demo-session', JSON.stringify({
        account: 'audit@airburg.local',
        loggedInAt: '2026-06-24T00:00:00.000Z'
      }));
      window.dispatchEvent(new Event('airburg-storage-change'));
    })()`,
  );
  await client.send("Page.navigate", { url: UPLOAD_URL });
};

const readRealFilePaths = (): string[] => {
  if (!fs.existsSync(SAMPLE_DIR)) return [];
  return fs
    .readdirSync(SAMPLE_DIR)
    .filter((name) => /\.(xlsx?|csv)$/i.test(name))
    .map((name) => path.join(SAMPLE_DIR, name))
    .sort();
};

const makeNodeFile = (filePath: string, index: number): File => {
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const type = extension === ".csv" ? "text/csv" : "application/vnd.ms-excel";
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return new NodeFile([bytes], `real_tmall_upload_${index + 1}${extension}`, { type }) as unknown as File;
};

const chooseKeywordAndProduct = (dataset: BIDataSet): { keyword: string; productId: string; visitors: number | null } | null => {
  const envBrandWords = (process.env.BRAND_WORDS ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  const envKeyword = envBrandWords[0];
  const totalKeywords = dataset.searchTotalKeywords
    .map((row) => row.keyword.trim())
    .filter((keyword) => keyword.length >= 2);
  const productRows = dataset.searchProductKeywords.filter((row) => row.productId.trim() && row.keyword.trim());
  const candidates = envKeyword ? [envKeyword] : totalKeywords;

  for (const keyword of candidates) {
    const productRow = productRows.find((row) => keywordMatches(row.keyword, keyword));
    if (productRow) {
      return { keyword, productId: productRow.productId, visitors: productRow.visitors };
    }
  }

  const fallbackKeyword = totalKeywords[0] ?? productRows[0]?.keyword;
  const fallbackProduct = productRows[0]?.productId;
  if (fallbackKeyword && fallbackProduct) {
    return { keyword: fallbackKeyword, productId: fallbackProduct, visitors: productRows[0]?.visitors ?? null };
  }
  return null;
};

const sumProductKeywordVisitors = (dataset: BIDataSet, productId: string, keyword: string): number | null => {
  const values = dataset.searchProductKeywords
    .filter((row) => row.productId === productId && keywordMatches(row.keyword, keyword))
    .map((row) => row.visitors)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
};

const buildRealFixturePlan = async (): Promise<RealFixturePlan> => {
  const filePaths = readRealFilePaths();
  assertCheck("sampleDirectoryExists", fs.existsSync(SAMPLE_DIR), { sampleDir: SAMPLE_DIR });
  assertCheck("realFileCountMeetsRequirement", filePaths.length >= REQUIRED_FILE_COUNT, {
    fileCount: filePaths.length,
    requiredFileCount: REQUIRED_FILE_COUNT,
  });
  const privateStatus = git(["status", "--porcelain", "--", "private-samples"]);
  assertCheck("privateSamplesRemainIgnored", privateStatus.length === 0);

  const files = filePaths.map(makeNodeFile);
  const parsed = await Promise.all(files.map((file) => parseExcelWorkbook(file)));
  const detectedTypes = parsed.map((sheets) => detectFileType(sheets));
  const requiredTypes: ETLSourceType[] = [
    "product_metric",
    "plan_metric",
    "search_total",
    "search_product",
    "after_sales",
  ];
  for (const type of requiredTypes) {
    assertCheck(`realFileCoverage_${type}`, detectedTypes.includes(type), { detectedTypes });
  }

  const descriptors: UploadedFileDescriptor[] = files.map((file) => ({
    file,
    platformCode: "tmall",
    platformName: "天猫",
    storeId: "tmall-default-store",
    storeName: "天猫默认店铺",
  }));
  const runtime = await runETLRuntime(descriptors);
  const issueCodes = new Set([...runtime.issues, ...runtime.errorQueue].map((issue) => issue.code));
  assertCheck("planLevelAdPlanAccepted", !issueCodes.has("etl_after_sales_not_supported") && !issueCodes.has("etl_plan_summary_without_product_id_unsupported"), {
    issueCodes: Array.from(issueCodes).sort(),
    afterSalesMetrics: runtime.dataset.afterSalesMetrics.length,
    planLevelRows: runtime.dataset.planMetrics.filter((row) => !row.productId && !!row.planId).length,
  });
  const dataset = runtime.dataset;
  const counts = {
    products: dataset.products.length,
    productMetrics: dataset.productMetrics.length,
    planMetrics: dataset.planMetrics.length,
    searchTotalKeywords: dataset.searchTotalKeywords.length,
    searchProductKeywords: dataset.searchProductKeywords.length,
    afterSalesMetrics: dataset.afterSalesMetrics.length,
  };
  assertCheck("afterSalesSafeAggregationParsed", counts.afterSalesMetrics > 0, counts);
  assertCheck("runtimeProductMetricsParsed", counts.productMetrics > 0, counts);
  assertCheck("runtimeSearchTotalParsed", counts.searchTotalKeywords > 0, counts);
  assertCheck("runtimeSearchProductParsed", counts.searchProductKeywords > 0, counts);
  assertCheck("runtimePlanLevelRowsParsed", dataset.planMetrics.some((row) => !row.productId && !!row.planId), counts);

  const choice = chooseKeywordAndProduct(dataset);
  assertCheck("brandKeywordAndProductIdAvailable", !!choice, {
    searchTotalKeywords: counts.searchTotalKeywords,
    searchProductKeywords: counts.searchProductKeywords,
  });
  if (!choice) throw new Error("keyword choice missing");
  const productVisitors = sumProductKeywordVisitors(dataset, choice.productId, choice.keyword);
  const missingProductVisitors = sumProductKeywordVisitors(dataset, "__airburg_missing_product__", choice.keyword);
  assertCheck("seriesProductIdFirstPrecheck", productVisitors !== null && missingProductVisitors === null, {
    selectedProductSafeCode: safeCode(choice.productId),
    keywordSafeCode: safeCode(choice.keyword),
    productVisitorsStatus: productVisitors === null ? "no_match" : "calculated",
    missingProductVisitorsStatus: missingProductVisitors === null ? "no_match" : "calculated",
  });

  return {
    filePaths,
    safeFileCodes: filePaths.map((filePath) => safeCode(fs.readFileSync(filePath))),
    detectedTypes,
    dataset,
    counts,
    keyword: choice.keyword,
    keywordSafeCode: safeCode(choice.keyword),
    productId: choice.productId,
    productIdSafeCode: safeCode(choice.productId),
    seriesProductVisitors: productVisitors,
    missingProductVisitors,
    runtimeSummary: runtime.summary,
    issueCodes: Array.from(new Set(runtime.issues.map((issue) => issue.code))),
  };
};

const staticChecks = () => {
  const files = changedFiles();
  const packageChanged = files.filter((file) => file === "package.json" || file === "package-lock.json");
  assertCheck("noNewDependencies", packageChanged.length === 0, packageChanged);

  const privateSamplesChanged = git(["status", "--porcelain", "--", "private-samples"]);
  assertCheck("privateSamplesNotInGitStatus", privateSamplesChanged.length === 0);

  const forbidden = files.filter(
    (file) =>
      forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("noForbiddenChangesOutsideKnownBaseline", forbidden.length === 0, forbidden);

  const unexpected = files.filter(
    (file) =>
      !allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("changedFilesWithinTaskOrPriorBaseline", unexpected.length === 0, unexpected);
};

const pageTextHasSensitiveTokens = async (client: CdpClient): Promise<boolean> =>
  evaluate<boolean>(
    client,
    `(() => {
      const text = document.body.innerText;
      return ${JSON.stringify(sensitiveTokens)}.some((token) => text.includes(token));
    })()`,
  );

const assertNoSensitiveText = async (client: CdpClient, name: string) => {
  assertCheck(name, !(await pageTextHasSensitiveTokens(client)));
};

const getResultCountsFromPage = async (client: CdpClient) =>
  evaluate<{
    success: number;
    failed: number;
    skipped: number;
    statusText: string;
  }>(
    client,
    `(() => {
      const text = document.querySelector('[data-testid="upload-page-v2-result-summary"]')?.textContent ?? '';
      const read = (label) => {
        const match = text.match(new RegExp(label + '([0-9]+)'));
        return match ? Number(match[1]) : -1;
      };
      return {
        success: read('成功'),
        failed: read('失败'),
        skipped: read('skipped'),
        statusText: text.includes('导入成功') ? 'success' : text.includes('部分成功') ? 'partial' : text.includes('导入失败') ? 'failed' : 'unknown',
      };
    })()`,
  );

const kpiState = async (client: CdpClient, pageSelector: string, title: string) => {
  const escapedPage = JSON.stringify(pageSelector);
  const escapedTitle = JSON.stringify(title);
  return evaluate<{
    exists: boolean;
    selected: boolean;
    text: string;
    valueText: string;
    invalid: boolean;
  }>(
    client,
    `(() => {
      const page = document.querySelector(${escapedPage}) ?? document;
      const card = Array.from(page.querySelectorAll('[data-kpi-title]')).find((node) => node.getAttribute('data-kpi-title') === ${escapedTitle});
      const text = card?.textContent ?? '';
      const valueText = card?.querySelectorAll('p')?.[1]?.textContent?.trim() ?? '';
      return {
        exists: Boolean(card),
        selected: card?.getAttribute('aria-pressed') === 'true',
        text,
        valueText,
        invalid: /NaN|Infinity|undefined/.test(text),
      };
    })()`,
  );
};

const readActiveRuntimeSnapshotTotals = async (client: CdpClient) =>
  evaluate<{
    status: string;
    gmv: number;
    gsv: number;
    visitors: number;
    paidBuyers: number;
    adSpend: number;
    clicks: number;
    refundAmount: number;
    hasTargetsField: boolean;
  }>(
    client,
    `new Promise((resolve) => {
      const fail = (status) => resolve({ status, gmv: 0, gsv: 0, visitors: 0, paidBuyers: 0, adSpend: 0, clicks: 0, refundAmount: 0, hasTargetsField: false });
      const openRequest = indexedDB.open('airburg-runtime-dataset-v1');
      openRequest.onerror = () => fail('open_failed');
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const pointerTx = db.transaction('runtimeDatasetActivePointer', 'readonly');
        const pointerRequest = pointerTx.objectStore('runtimeDatasetActivePointer').get('active');
        pointerRequest.onerror = () => fail('pointer_failed');
        pointerRequest.onsuccess = () => {
          const activeDatasetId = pointerRequest.result?.activeDatasetId;
          if (!activeDatasetId) return fail('empty');
          const snapshotTx = db.transaction('runtimeDatasetSnapshots', 'readonly');
          const snapshotRequest = snapshotTx.objectStore('runtimeDatasetSnapshots').get(activeDatasetId);
          snapshotRequest.onerror = () => fail('snapshot_failed');
          snapshotRequest.onsuccess = () => {
            const snapshot = snapshotRequest.result;
            const dataset = snapshot?.dataset;
            if (!dataset) return fail('dataset_missing');
            const startDate = '2026-06-26';
            const endDate = '2026-06-30';
            const inRange = (row) => {
              const date = typeof row?.date === 'string' ? row.date.slice(0, 10) : '';
              return date >= startDate && date <= endDate;
            };
            const sum = (rows, key) => rows
              .filter(inRange)
              .reduce((total, row) => total + (Number.isFinite(row?.[key]) ? row[key] : 0), 0);
            resolve({
              status: 'ok',
              gmv: sum(dataset.productMetrics ?? [], 'gmv'),
              gsv: sum(dataset.productMetrics ?? [], 'gsv'),
              visitors: sum(dataset.productMetrics ?? [], 'visitors'),
              paidBuyers: sum(dataset.productMetrics ?? [], 'buyers'),
              adSpend: sum(dataset.planMetrics ?? [], 'spend'),
              clicks: sum(dataset.planMetrics ?? [], 'clicks'),
              refundAmount: sum(dataset.afterSalesMetrics ?? [], 'refundAmount'),
              hasTargetsField: Object.prototype.hasOwnProperty.call(dataset, 'targets'),
            });
          };
        };
      };
    })`,
  );

const chartLegendIncludes = async (client: CdpClient, panelSelector: string, expected: string) => {
  const escapedPanel = JSON.stringify(panelSelector);
  const escapedExpected = JSON.stringify(expected);
  return evaluate<boolean>(
    client,
    `(() => {
      const panel = document.querySelector(${escapedPanel});
      const text = panel?.textContent ?? '';
      return text.includes(${escapedExpected}) && Boolean(panel?.querySelector('[data-testid="bi-chart-legend"]'));
    })()`,
  );
};

const browserChecks = async (plan: RealFixturePlan) => {
  const server = await ensureServer();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-tmall-real-upload-profile-"));
  const port = 9900 + Math.floor(Math.random() * 500);
  const chrome = await launchChrome(port, profileDir);
  let client: CdpClient | null = null;
  try {
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("DOM.enable");
    await setViewport(client, 1440, 980);
    await client.send("Page.navigate", { url: UPLOAD_URL });
    await ensureDemoLogin(client);
    await waitForSelector(client, "[data-testid='upload-page-v1-dashboard']");
    assertCheck("uploadHttp200", await waitForHttp200(UPLOAD_URL, 3000));
    assertCheck("uploadHasMultipleInput", await evaluate<boolean>(client, "Boolean(document.querySelector('input[type=file][multiple]'))"));

    await setInputFiles(client, plan.filePaths);
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length >= 5`, 25000);
    const uploadState = await evaluate<{
      rowCount: number;
      coverageCount: number;
      requiredLabelsPresent: boolean;
      sensitiveText: boolean;
    }>(
      client,
      `(() => {
        const text = document.body.innerText;
        return {
          rowCount: document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length,
          coverageCount: document.querySelectorAll('[data-testid="upload-page-v2-coverage-card"]').length,
          requiredLabelsPresent: ['商品数据文件','商品经营报表','计划报表','总搜索词访客表','商品搜索词访客表','售后退货表'].every((label) => text.includes(label)),
          sensitiveText: ${JSON.stringify(sensitiveTokens)}.some((token) => text.includes(token)),
        };
      })()`,
    );
    assertCheck("uploadRecognitionListAppeared", uploadState.rowCount >= 5, uploadState);
    assertCheck("uploadSixTypeCoverageVisible", uploadState.coverageCount === 6 && uploadState.requiredLabelsPresent, uploadState);
    assertCheck("uploadNoSensitiveText", !uploadState.sensitiveText, uploadState);

    await scrollToSelector(client, "[data-testid='upload-page-v2-recognition-list']");
    screenshots.push(await capture(client, "upload-recognition-list", "1440x980", "files-selected"));
    await scrollToSelector(client, "[data-testid='upload-page-v2-coverage']");
    screenshots.push(await capture(client, "upload-coverage-status", "1440x980", "coverage"));

    await scrollToSelector(client, "[data-testid='upload-page-v2-import-actions']");
    await clickSelector(client, "[data-testid='upload-page-v2-import-button']");
    await waitForSelector(client, "[data-testid='upload-page-v2-result-summary']");
    await waitForExpression(client, `document.body.innerText.includes('导入成功') || document.body.innerText.includes('部分成功') || document.body.innerText.includes('导入失败')`, 25000);
    const resultCounts = await getResultCountsFromPage(client);
    assertCheck("uploadImportSucceededOrPartial", ["success", "partial"].includes(resultCounts.statusText), resultCounts);
    assertCheck("uploadResultStatusCountsVisible", resultCounts.success >= 0 && resultCounts.failed >= 0 && resultCounts.skipped >= 0, resultCounts);
    assertCheck("uploadResultHasSuccessfulFiles", resultCounts.success > 0, resultCounts);
    if (ENABLE_PERSISTENCE_REGRESSION) {
      assertCheck("uploadPersistenceSuccessVisible", await evaluate<boolean>(
        client,
        `document.body.innerText.includes('已保存本次安全聚合数据') && document.body.innerText.includes('刷新页面后可继续查看')`,
      ));
    }
    await scrollToSelector(client, "[data-testid='upload-page-v2-result-summary']");
    screenshots.push(await capture(client, "upload-import-result-summary", "1440x980", "import-result"));

    await clickByText(client, "查看经营首页", "a");
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    await waitForExpression(client, `window.location.pathname === '/home' && document.body.innerText.includes('ETL运行时数据')`, 12000).catch(() => {
      block("runtimeDatasetLostAfterHomeRouteTransition", {
        route: "/home",
        recommendation: "需要 Runtime Dataset Persistence V1，或保持同一 SPA runtime transition 的数据桥接。",
      });
    });
    assertCheck("homeReadsRuntimeETLDataset", await evaluate<boolean>(client, `document.body.innerText.includes('ETL运行时数据')`));
    await assertNoSensitiveText(client, "homeNoSensitiveText");
    await setHomeCustomTimeRange(client, "2026-06-26", "2026-06-30");
    const expectedHomeKpis = [
      { title: "GMV", pattern: /125,?596/ },
      { title: "GSV", pattern: /85,455\.96|85,456/ },
      { title: "去退费比", pattern: /13\.65%/ },
      { title: "直接成交占比", pattern: /63\.4%|63\.40%/ },
    ];
    for (const expected of expectedHomeKpis) {
      const state = await kpiState(client, "[data-testid='home-bi-dashboard']", expected.title);
      assertCheck(`homeKpiActualValue_${expected.title}`, state.exists && !state.invalid && expected.pattern.test(state.valueText), {
        valueText: state.valueText,
      });
    }
    const snapshotTotals = await readActiveRuntimeSnapshotTotals(client);
    assertCheck("publicActiveSnapshotTotalsStable", snapshotTotals.status === "ok" &&
      snapshotTotals.gmv === 125596 &&
      Math.abs(snapshotTotals.gsv - 85455.96) < 0.01 &&
      snapshotTotals.visitors === 143076 &&
      snapshotTotals.paidBuyers === 128 &&
      Math.abs(snapshotTotals.adSpend - 7625.95) < 0.01 &&
      snapshotTotals.clicks === 6692 &&
      Math.abs(snapshotTotals.refundAmount - 29602.18) < 0.01,
    snapshotTotals);
    assertCheck("publicActiveSnapshotHasNoTargetsField", snapshotTotals.status === "ok" && snapshotTotals.hasTargetsField === false, snapshotTotals);
    screenshots.push(await capture(client, "home-runtime-status", "1440x980", "runtime-etl"));

    if (ENABLE_PERSISTENCE_REGRESSION) {
      await client.send("Page.reload", { ignoreCache: true });
      await waitForSelector(client, "[data-testid='home-bi-dashboard']");
      await waitForExpression(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`, 15000);
      assertCheck("homeRestoresAfterRefresh", await evaluate<boolean>(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`));
      await assertNoSensitiveText(client, "homeRefreshNoSensitiveText");
      screenshots.push(await capture(client, "home-restored-after-refresh", "1440x980", "home-restored-refresh"));

      await client.send("Page.navigate", { url: "about:blank" });
      await wait(300);
      await navigateAndWait(client, "/home", "[data-testid='home-bi-dashboard']");
      await waitForExpression(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`, 15000);
      assertCheck("homeRestoresAfterReopen", await evaluate<boolean>(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`));
      screenshots.push(await capture(client, "home-restored-after-reopen", "1440x980", "home-restored-reopen"));
    }

    await clickSelector(client, "[data-testid='home-bi-brand-model-filter-button']");
    await waitForSelector(client, "[data-testid='home-bi-brand-model-filter-popover']");
    await setTextareaValue(client, "[data-testid='home-bi-brand-model-filter-popover-brand-words']", plan.keyword);
    screenshots.push(await capture(client, "home-brand-filter-popover", "1440x980", "brand-filter"));
    await clickByText(client, "保存", "[data-testid='home-bi-brand-model-filter-popover'] button");

    for (const title of ["品牌词访客", "品牌词支付人数", "GEO搜索占比"]) {
      await clickKpi(client, "[data-testid='home-bi-dashboard']", title);
      const state = await kpiState(client, "[data-testid='home-bi-dashboard']", title);
      assertCheck(`homeKpiSafe_${title}`, state.exists && state.selected && !state.invalid, {
        status: state.valueText === "--" ? "no_match_or_missing" : "calculated",
      });
      if (title === "品牌词访客") {
        assertCheck("homeBrandChartHasTotalLine", await chartLegendIncludes(client, "[data-testid='home-bi-chart-panel']", "品牌词合计"));
        await scrollToSelector(client, "[data-testid='home-bi-chart-panel']");
        screenshots.push(await capture(client, "home-brand-visitors-chart", "1440x980", "home-brand-visitors"));
      }
      if (title === "GEO搜索占比") {
        await scrollToSelector(client, "[data-testid='home-bi-chart-panel']");
        screenshots.push(await capture(client, "home-geo-search-share-chart", "1440x980", "home-geo"));
      }
    }

    await clickByText(client, "系列看板", "a");
    await waitForSelector(client, "[data-testid='series-board-v1-dashboard']");
    await waitForExpression(client, `window.location.pathname === '/series-board' && document.body.innerText.includes('ETL运行时数据')`, 12000).catch(() => {
      block("runtimeDatasetLostAfterSeriesRouteTransition", {
        route: "/series-board",
        recommendation: "需要 Runtime Dataset Persistence V1，或保持同一 SPA runtime transition 的数据桥接。",
      });
    });
    assertCheck("seriesReadsSameRuntimeETLDataset", await evaluate<boolean>(client, `document.body.innerText.includes('ETL运行时数据')`));

    if (ENABLE_PERSISTENCE_REGRESSION) {
      await navigateAndWait(client, "/series-board", "[data-testid='series-board-v1-dashboard']");
      await waitForExpression(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`, 15000);
      assertCheck("seriesReadsPersistedActiveDataset", await evaluate<boolean>(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`));
      await navigateAndWait(client, "/product-board", "[data-testid='product-board-v1-dashboard']");
      await waitForExpression(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`, 15000);
      assertCheck("productReadsPersistedActiveDataset", await evaluate<boolean>(client, `document.body.innerText.includes('已恢复上次安全聚合数据')`));
      await navigateAndWait(client, "/upload/history", "[data-testid='history-data-v1-page']");
      await waitForExpression(client, `document.body.innerText.includes('持久化安全聚合快照') && document.body.innerText.includes('activeDatasetId')`, 15000);
      assertCheck("historyShowsPersistedSafeRecord", await evaluate<boolean>(
        client,
        `document.body.innerText.includes('持久化安全聚合快照') && document.body.innerText.includes('sourceCoverage')`,
      ));
      await navigateAndWait(client, "/upload/quality", "[data-testid='upload-quality-v1-page']");
      await waitForExpression(client, `document.body.innerText.includes('安全问题中心') && document.body.innerText.includes('active dataset')`, 15000);
      assertCheck("qualityShowsPersistedSafeSummary", await evaluate<boolean>(
        client,
        `document.body.innerText.includes('active dataset') && document.body.innerText.includes('安全')`,
      ));
      await assertNoSensitiveText(client, "historyQualityNoSensitiveText");
      await navigateAndWait(client, "/series-board", "[data-testid='series-board-v1-dashboard']");
    }

    await clickByText(client, "系列设置", "button");
    await waitForSelector(client, "[data-testid='series-board-v1-series-settings']");
    await setTextareaValue(client, "[data-testid='series-board-v1-series-settings'] textarea", plan.productId);
    screenshots.push(await capture(client, "series-temp-series-settings", "1440x980", "series-settings"));
    await clickByText(client, "添加到当前系列商品清单", "[data-testid='series-board-v1-series-settings'] button");
    await waitForExpression(client, `document.body.innerText.includes('已维护 1 个商品ID') || document.body.innerText.includes('已维护 1 个商品')`, 12000);
    await clickByText(client, "关闭", "[data-testid='series-board-v1-series-settings'] button");

    await clickSelector(client, "[data-testid='series-board-v1-brand-model-filter-button']");
    await waitForSelector(client, "[data-testid='series-board-v1-brand-model-filter-popover']");
    await setTextareaValue(client, "[data-testid='series-board-v1-brand-model-filter-popover-brand-words']", plan.keyword);
    screenshots.push(await capture(client, "series-brand-filter-popover", "1440x980", "series-brand-filter"));
    await clickByText(client, "保存", "[data-testid='series-board-v1-brand-model-filter-popover'] button");

    for (const title of ["品牌词访客", "品牌词支付人数", "GEO搜索占比"]) {
      await clickKpi(client, "[data-testid='series-board-v1-dashboard']", title);
      const state = await kpiState(client, "[data-testid='series-board-v1-dashboard']", title);
      assertCheck(`seriesKpiSafe_${title}`, state.exists && state.selected && !state.invalid, {
        status: state.valueText === "--" ? "no_match_or_missing" : "calculated",
      });
      if (title === "品牌词访客") {
        assertCheck("seriesBrandChartExists", await evaluate<boolean>(client, `Boolean(document.querySelector("[data-testid='series-board-v1-chart-panel'] [data-testid='bi-chart-legend']"))`));
        await scrollToSelector(client, "[data-testid='series-board-v1-chart-panel']");
        screenshots.push(await capture(client, "series-brand-visitors-chart", "1440x980", "series-brand-visitors"));
      }
      if (title === "GEO搜索占比") {
        await scrollToSelector(client, "[data-testid='series-board-v1-chart-panel']");
        screenshots.push(await capture(client, "series-geo-search-share-chart", "1440x980", "series-geo"));
      }
    }
    assertCheck("seriesProductIdFirstRuntimePrecheck", plan.seriesProductVisitors !== null && plan.missingProductVisitors === null, {
      selectedProductSafeCode: plan.productIdSafeCode,
      keywordSafeCode: plan.keywordSafeCode,
    });

    await setViewport(client, 390, 900);
    await wait(300);
    screenshots.push(await capture(client, "series-390-runtime", "390x900", "series-mobile"));
    assertCheck("series390NoHorizontalOverflow", screenshots[screenshots.length - 1]?.horizontalOverflow === false);
    await clickByText(client, "经营首页", "a");
    await waitForSelector(client, "[data-testid='home-bi-dashboard']");
    screenshots.push(await capture(client, "home-390-runtime", "390x900", "home-mobile"));
    assertCheck("home390NoHorizontalOverflow", screenshots[screenshots.length - 1]?.horizontalOverflow === false);

    const businessStorageKeys = await evaluate<string[]>(
      client,
      `Object.keys(window.localStorage).filter((key) => key !== 'airburg:demo-session')`,
    );
    assertCheck("noBusinessLocalStorageWrites", businessStorageKeys.length === 0, businessStorageKeys);
    assertCheck("browserConsoleErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
  } finally {
    client?.close();
    try {
      chrome.kill("SIGTERM");
    } catch {
      // ignore cleanup failure
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Chrome can briefly retain cache handles; audit screenshots remain in screenshotDir.
    }
    try {
      server?.kill("SIGTERM");
    } catch {
      // ignore cleanup failure
    }
  }
};

const writeManifest = () => {
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ screenshots }, null, 2));
  return manifestPath;
};

const main = async () => {
  staticChecks();
  const plan = await buildRealFixturePlan();
  await browserChecks(plan);
  const manifestPath = writeManifest();
  addCheck("screenshotManifestCreated", fs.existsSync(manifestPath), manifestPath);
  const failed = checks.filter((check) => !check.pass);
  finalStatus = failed.length === 0 ? "PASS" : "FAIL";
  console.log(
    JSON.stringify(
      {
        status: finalStatus,
        realFilesUploaded: plan.filePaths.length,
        safeFileCodes: plan.safeFileCodes,
        detectedTypes: plan.detectedTypes,
        runtime: {
          summary: plan.runtimeSummary,
          counts: plan.counts,
          issueCodes: plan.issueCodes,
        },
        brandSelection: {
          keywordSafeCode: plan.keywordSafeCode,
          keywordLength: plan.keyword.length,
          productIdSafeCode: plan.productIdSafeCode,
          seriesProductVisitorsStatus: plan.seriesProductVisitors === null ? "no_match" : "calculated",
        },
        runtimeRouteLossDetected: false,
        persistenceRegression: ENABLE_PERSISTENCE_REGRESSION,
        persistenceTaskNeeded: false,
        screenshotManifest: manifestPath,
        checks,
        screenshots,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  const blocked = error instanceof Error && error.name === "AuditBlockedError";
  finalStatus = blocked ? "BLOCKED" : "FAIL";
  const manifestPath = writeManifest();
  console.log(
    JSON.stringify(
      {
        status: finalStatus,
        runtimeRouteLossDetected: checks.some((check) => check.name.includes("runtimeDatasetLost") && !check.pass),
        persistenceTaskNeeded: checks.some((check) => check.name.includes("runtimeDatasetLost") && !check.pass),
        screenshotManifest: manifestPath,
        checks,
        screenshots,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
