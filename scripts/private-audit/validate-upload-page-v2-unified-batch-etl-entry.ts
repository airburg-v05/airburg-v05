import { File as NodeFile } from "node:buffer";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseExcelWorkbook } from "../../lib/etl/parse-excel";
import { detectFileType, runETLRuntime } from "../../lib/etl/runtime";

const ROOT = process.cwd();
const AUDIT_PORT = Number(process.env.UPLOAD_PAGE_V2_AUDIT_PORT ?? "3000");
const BASE_URL = process.env.UPLOAD_PAGE_V2_AUDIT_BASE_URL ?? `http://127.0.0.1:${AUDIT_PORT}`;
const PAGE_URL = `${BASE_URL.replace(/\/$/, "")}/upload`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TASK_BASELINE_HEAD = "5880332865e46eddf1d78c3d5fbcd1ea5505f1ad";
const TASK_COMPLETION_HEAD = "640028371cc4baba777f84b82950caff50e08edb";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-page-v2-"));
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-page-v2-fixtures-"));

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
};

const assertCheck = (name: string, condition: boolean, details?: unknown) => {
  addCheck(name, condition, details);
  if (!condition) throw new Error(`${name} failed`);
};

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const changedFiles = (): string[] => {
  const diff = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--name-only",
    TASK_BASELINE_HEAD,
    TASK_COMPLETION_HEAD,
    "--",
  ]);
  return Array.from(
    new Set(
      diff.split("\n")
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

const forbiddenChangePatterns = [
  "components/home/**",
  "components/series-board/**",
  "components/store-board/**",
  "components/product-board/**",
  "components/upload/history/**",
  "components/upload/quality/**",
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

const knownPriorBaselinePatterns = [
  "app/(workspace)/home/page.tsx",
  "app/(workspace)/series-board/page.tsx",
  "app/(workspace)/store-board/page.tsx",
  "app/(workspace)/product-board/page.tsx",
  "app/(workspace)/upload/history/page.tsx",
  "app/(workspace)/upload/quality/page.tsx",
  "components/home/**",
  "components/series-board/v1/**",
  "components/store-board/v1/**",
  "components/product-board/v1/**",
  "app/(workspace)/upload/page.tsx",
  "components/upload/v1/**",
  "components/upload/history/v1/**",
  "components/upload/quality/v1/**",
  "components/visual-system/**",
  "lib/bi/**",
  "lib/persistence/**",
  "scripts/private-audit/**",
];

const allowedThisTaskPatterns = [
  "components/upload/v1/upload-page-v1-dashboard.tsx",
  "components/upload/v2/**",
  "lib/etl/**",
  "scripts/private-audit/validate-upload-page-v2-unified-batch-etl-entry.ts",
  "scripts/private-audit/validate-tmall-etl-runtime-engine-v1.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
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

const coverageLabels = [
  "商品数据文件",
  "商品经营报表",
  "计划报表",
  "总搜索词访客表",
  "商品搜索词访客表",
  "售后退货表",
];

const makeWorkbookBuffer = (rows: Record<string, unknown>[]) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Sheet1");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const bytes = new Uint8Array(buffer.length);
  bytes.set(buffer);
  return { buffer, bytes };
};

const makeBrowserFixture = (filename: string, rows: Record<string, unknown>[]) => {
  const { buffer, bytes } = makeWorkbookBuffer(rows);
  const filePath = path.join(fixtureDir, filename);
  fs.writeFileSync(filePath, buffer);
  const stamp = new Date("2026-06-24T00:00:00.000Z");
  fs.utimesSync(filePath, stamp, stamp);
  const file = new NodeFile([bytes], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }) as unknown as File;
  return { filePath, file };
};

const fixtures = () => {
  const productDimension = makeBrowserFixture("product-dimension.xlsx", [
    { "商品ID": "P1", "商品名称": "空气堡 P1" },
    { "商品ID": "P2", "商品名称": "空气堡 P2" },
  ]);
  const productMetric = makeBrowserFixture("product-metric.xlsx", [
    { "商品ID": "P1", "商品名称": "空气堡 P1", "日期": "2026-06-24", GMV: 100, GSV: 90, "访客": 10, "支付买家": 2 },
    { "商品ID": "P1", "商品名称": "空气堡 P1", "日期": "2026-06-24", GMV: 999, GSV: 999, "访客": 999, "支付买家": 999 },
  ]);
  const productMetricDuplicatePath = path.join(fixtureDir, "product-metric-duplicate.xlsx");
  fs.copyFileSync(productMetric.filePath, productMetricDuplicatePath);
  const stamp = new Date("2026-06-24T00:00:00.000Z");
  fs.utimesSync(productMetricDuplicatePath, stamp, stamp);
  const planMetric = makeBrowserFixture("plan-metric.xlsx", [
    { "商品ID": "P1", "日期": "2026-06-24", "推广花费": 10, "点击": 5, ROI: 2.5 },
  ]);
  const searchTotal = makeBrowserFixture("search-total.xlsx", [
    { "搜索词": "空气净化器", "访客": 30, "支付买家": 3, GMV: 300 },
  ]);
  const searchProduct = makeBrowserFixture("search-product.xlsx", [
    { "商品ID": "P1", "搜索词": "空气堡", "访客": 12, "支付买家": 1 },
  ]);
  return {
    files: [productDimension.file, productMetric.file, planMetric.file, searchTotal.file, searchProduct.file],
    paths: [productDimension.filePath, productMetric.filePath, productMetricDuplicatePath, planMetric.filePath, searchTotal.filePath, searchProduct.filePath],
  };
};

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        if ((response.statusCode ?? 500) >= 400) {
          response.resume();
          reject(new Error("CDP endpoint unavailable"));
          return;
        }
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp200 = async (timeoutMs = 30000): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(PAGE_URL, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {
      await wait(500);
    }
  }
  return false;
};

const ensureServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (await waitForHttp200(3000)) return null;
  const server = spawn("npm", ["run", "dev", "--", "--port", String(AUDIT_PORT)], { cwd: ROOT });
  server.stdout.on("data", () => undefined);
  server.stderr.on("data", () => undefined);
  if (!(await waitForHttp200(30000))) {
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
  for (let index = 0; index < 80; index += 1) {
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
  throw new Error("Chrome remote debugging did not start");
};

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let index = 0; index < 50; index += 1) {
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

const waitForSelector = async (client: CdpClient, selector: string): Promise<void> => {
  const escaped = JSON.stringify(selector);
  for (let index = 0; index < 100; index += 1) {
    const exists = await evaluate<boolean>(client, `Boolean(document.querySelector(${escaped}))`);
    if (exists) return;
    await wait(100);
  }
  throw new Error(`Missing selector: ${selector}`);
};

const waitForExpression = async (client: CdpClient, expression: string): Promise<void> => {
  for (let index = 0; index < 140; index += 1) {
    if (await evaluate<boolean>(client, expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(250);
};

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
    route: "/upload",
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
      target.scrollIntoView({ block: 'start', inline: 'nearest' });
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

const clickByText = async (client: CdpClient, text: string) => {
  const escaped = JSON.stringify(text);
  await evaluate<void>(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes(${escaped}) && !node.disabled);
      if (!target) throw new Error('button not found');
      target.click();
    })()`,
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
  await client.send("Page.navigate", { url: PAGE_URL });
};

const staticChecks = () => {
  const source = read("components/upload/v1/upload-page-v1-dashboard.tsx");
  assertCheck("sourceContainsUnifiedUploadTitle", source.includes("批量上传天猫数据文件"));
  assertCheck("sourceContainsMultipleFileInput", /type=\"file\"[\s\S]*multiple|multiple[\s\S]*type=\"file\"/.test(source));
  assertCheck("sourceDoesNotRenderOldFourFixedCards", !/upload-page-v1-file-card|upload-page-v1-file-input-business|upload-page-v1-file-input-ad-product|upload-page-v1-file-input-ad-plan|upload-page-v1-file-input-after-sales/.test(source));
  for (const label of coverageLabels) {
    assertCheck(`sourceContainsCoverage_${label}`, source.includes(label));
  }
  assertCheck("sourceCallsRunETLRuntime", source.includes("runETLRuntime("));
  assertCheck("sourceDisplaysSearchCounts", source.includes("searchTotalKeywords") && source.includes("searchProductKeywords"));
  assertCheck("sourceDoesNotWriteLocalStorageOrIndexedDB", !/localStorage\.setItem|indexedDB\.open/.test(source));

  const packageChanged = changedFiles().filter((file) => file === "package.json" || file === "package-lock.json");
  assertCheck("noNewDependencies", packageChanged.length === 0, packageChanged);
  const forbidden = changedFiles().filter(
    (file) =>
      forbiddenChangePatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("noForbiddenChangesOutsideKnownBaseline", forbidden.length === 0, forbidden);
  const unexpected = changedFiles().filter(
    (file) =>
      !allowedThisTaskPatterns.some((pattern) => matchesPattern(file, pattern)) &&
      !knownPriorBaselinePatterns.some((pattern) => matchesPattern(file, pattern)),
  );
  assertCheck("changedFilesWithinTaskOrPriorBaseline", unexpected.length === 0, unexpected);
};

const etlChecks = async () => {
  const { files } = fixtures();
  const parsed = await Promise.all(files.map((file) => parseExcelWorkbook(file)));
  const detected = parsed.map((sheets) => detectFileType(sheets));
  const expectedTypes = ["product_dimension", "product_metric", "plan_metric", "search_total", "search_product"] as const;
  assertCheck("etlDetectsFiveTypes", expectedTypes.every((type) => detected.includes(type)), detected);
  const runtimeResult = await runETLRuntime(files);
  assertCheck("runtimeSupportsFiveFiles", runtimeResult.summary.filesParsed === 5, runtimeResult.summary);
  assertCheck("runtimeSearchTotalOutput", runtimeResult.dataset.searchTotalKeywords.length > 0, runtimeResult.dataset.searchTotalKeywords.length);
  assertCheck("runtimeSearchProductOutput", runtimeResult.dataset.searchProductKeywords.length > 0, runtimeResult.dataset.searchProductKeywords.length);
  assertCheck("runtimeDedupPreventsDuplicateGmv", runtimeResult.dataset.productMetrics.length === 1 && runtimeResult.dataset.productMetrics[0]?.gmv === 100, runtimeResult.dataset.productMetrics);
};

const browserChecks = async () => {
  const server = await ensureServer();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-upload-page-v2-chrome-"));
  const launchedChrome = await launchChrome(profileDir);
  const { chrome, port } = launchedChrome;
  let client: CdpClient | null = null;
  try {
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("DOM.enable");
    await setViewport(client, 1440, 980);
    await client.send("Page.navigate", { url: PAGE_URL });
    await ensureDemoLogin(client);
    await waitForSelector(client, "[data-testid='upload-page-v1-dashboard']");
    assertCheck("uploadHttp200", await waitForHttp200(3000));
    screenshots.push(await capture(client, "upload-1440-initial", "1440x980", "initial"));

    await setViewport(client, 390, 900);
    await wait(300);
    screenshots.push(await capture(client, "upload-390-initial", "390x900", "mobile"));
    assertCheck("mobile390NoHorizontalOverflow", screenshots[screenshots.length - 1]?.horizontalOverflow === false);

    await setViewport(client, 1440, 980);
    await scrollToSelector(client, "[data-testid='upload-page-v1-control']");
    const { paths } = fixtures();
    await setInputFiles(client, paths);
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length >= 6`);
    const browserState = await evaluate<{
      multipleInput: boolean;
      itemCount: number;
      skippedItem: boolean;
      coverageCount: number;
      oldFourSlotCards: number;
      requiredLabelsPresent: boolean;
      sensitiveText: boolean;
    }>(
      client,
      `(() => {
        const text = document.body.innerText;
        return {
          multipleInput: Boolean(document.querySelector('input[type=file][multiple]')),
          itemCount: document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length,
          skippedItem: Boolean(document.querySelector('[data-product-status="skipped"]')) && text.includes('skipped'),
          coverageCount: document.querySelectorAll('[data-testid="upload-page-v2-coverage-card"]').length,
          oldFourSlotCards: document.querySelectorAll('[data-testid="upload-page-v1-file-card"]').length,
          requiredLabelsPresent: ${JSON.stringify(coverageLabels)}.every((label) => text.includes(label)),
          sensitiveText: ${JSON.stringify(sensitiveTokens)}.some((token) => text.includes(token)),
        };
      })()`,
    );
    assertCheck("browserHasMultipleInput", browserState.multipleInput, browserState);
    assertCheck("browserRecognitionListGenerated", browserState.itemCount >= 6, browserState);
    assertCheck("browserDuplicateFileDeduped", browserState.skippedItem, browserState);
    assertCheck("browserSixCoverageCards", browserState.coverageCount === 6 && browserState.requiredLabelsPresent, browserState);
    assertCheck("browserOldFixedCardsRemoved", browserState.oldFourSlotCards === 0, browserState);
    assertCheck("browserNoSensitiveTokens", !browserState.sensitiveText, browserState);

    await scrollToSelector(client, "[data-testid='upload-page-v2-recognition-list']");
    screenshots.push(await capture(client, "upload-recognition-list", "1440x980", "files-selected"));
    await scrollToSelector(client, "[data-testid='upload-page-v2-coverage']");
    screenshots.push(await capture(client, "upload-coverage-status", "1440x980", "coverage"));
    await scrollToSelector(client, "[data-testid='upload-page-v2-import-actions']");
    screenshots.push(await capture(client, "upload-duplicate-notice", "1440x980", "duplicate-notice"));

    await clickByText(client, "批量导入");
    await waitForSelector(client, "[data-testid='upload-page-v2-result-summary']");
    await waitForExpression(client, `document.body.innerText.includes('成功') && document.body.innerText.includes('失败') && document.body.innerText.includes('skipped')`);
    await scrollToSelector(client, "[data-testid='upload-page-v2-result-summary']");
    screenshots.push(await capture(client, "upload-import-result-summary", "1440x980", "import-result"));
    assertCheck("browserConsoleErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
  } finally {
    client?.close();
    try {
      chrome.kill("SIGTERM");
    } catch {
      // ignore cleanup failure in audit runner
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {
      // Chrome can briefly retain cache handles after shutdown; screenshots/results remain valid.
    }
    try {
      server?.kill("SIGTERM");
    } catch {
      // ignore cleanup failure in audit runner
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
  await etlChecks();
  await browserChecks();
  const manifestPath = writeManifest();
  addCheck("screenshotManifestCreated", fs.existsSync(manifestPath), manifestPath);
  const failed = checks.filter((check) => !check.pass);
  const status = failed.length === 0 ? "PASS" : "FAIL";
  console.log(JSON.stringify({ status, screenshotManifest: manifestPath, checks, screenshots }, null, 2));
  if (failed.length > 0) process.exit(1);
};

main().catch((error) => {
  addCheck("unhandledAuditError", false, error instanceof Error ? error.message : String(error));
  const manifestPath = writeManifest();
  console.log(JSON.stringify({ status: "FAIL", screenshotManifest: manifestPath, checks, screenshots }, null, 2));
  process.exit(1);
});
