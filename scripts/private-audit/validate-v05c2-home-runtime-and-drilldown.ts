import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-c2-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const C1_COMPLETION = "docs/project/task-completions/V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT.json";

const SAMPLE_FILES = [
  "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  "private-samples/tmall/after-sales/当日售后退货表.xlsx",
] as const;

const SENSITIVE_FIELD_NAMES = [
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

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

interface CdpResponse {
  id?: number;
  result?: {
    root?: { nodeId: number };
    nodeId?: number;
    data?: string;
    result?: { value?: unknown };
  };
  error?: { message?: string };
  exceptionDetails?: unknown;
}

interface ChromeTarget {
  type?: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface ScreenshotEvidence {
  desktopAllStores: string;
  desktopDefaultStore: string;
  desktopSecondStore: string;
  desktopLegacyFallback: string;
  desktopEmptyState: string;
  desktopCorruptedState: string;
  mobileAllStores: string;
  mobilePeriodControls: string;
  mobileStorePerformance: string;
  mobileLegacyFallback: string;
  manifestPath: string;
}

interface RuntimeEvidence {
  selectedFileCount: number;
  firstImportSuccess: boolean;
  secondImportSuccess: boolean;
  twoStoresVisible: boolean;
  allStoresMetricsVisible: boolean;
  defaultStoreFilterWorks: boolean;
  secondStoreFilterWorks: boolean;
  defaultStoreDrilldownWorks: boolean;
  secondStoreBoardDisabled: boolean;
  secondStoreHistoryContextWorks: boolean;
  dayPeriodWorks: boolean;
  weekPeriodWorks: boolean;
  monthPeriodWorks: boolean;
  customPeriodWorks: boolean;
  trendTabsWork: boolean;
  oneMainTrendChart: boolean;
  targetSettingsLinkWorks: boolean;
  dataImportLinkWorks: boolean;
  invalidParamsSafe: boolean;
  legacyFallbackWorks: boolean;
  legacyDoesNotCreateActiveDataset: boolean;
  emptyStateWorks: boolean;
  corruptedStateWorks: boolean;
  mobile390NoOverflow: boolean;
  noBusinessConsoleIssues: boolean;
  privacyPass: boolean;
  numberSafetyPass: boolean;
  auditDatabaseDeleted: boolean;
  productionDatabaseUntouched: boolean;
  screenshots: ScreenshotEvidence;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

const createSampleFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length >= 4 ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectSensitiveSourceValues = async (): Promise<Set<string>> => {
  const table = await parseTmallTableFile(createSampleFile(SAMPLE_FILES[3]));
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((fieldName) => {
      const value = normalizeLeafValue(row[fieldName]);
      if (value && !["--", "暂无", "null", "NULL"].includes(value)) values.add(value);
    });
  });
  return values;
};

const containsInvalidNumberText = (text: string): boolean =>
  /\bNaN\b|\bInfinity\b|\bundefined\b/.test(text);

const getFreePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("free_port_unavailable"));
      });
    });
  });

const waitForServer = async (url: string): Promise<void> => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error("next_dev_server_unavailable");
};

const stopProcess = async (child: ChildProcess | null): Promise<void> => {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5000),
  ]);
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
  private readonly socket: WebSocket;
  private commandId = 0;
  private readonly pending = new Map<number, (response: CdpResponse) => void>();
  readonly consoleMessages: string[] = [];

  constructor(webSocketDebuggerUrl: string) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onmessage = (event) => {
        const response = JSON.parse(String(event.data)) as CdpResponse & {
          method?: string;
          params?: { type?: string; args?: Array<{ value?: unknown }> };
        };
        if (response.method === "Runtime.consoleAPICalled") {
          const message = response.params?.args?.map((arg) => String(arg.value ?? "")).join(" ");
          if (response.params?.type === "error" || response.params?.type === "warning") {
            this.consoleMessages.push(message ?? response.params.type);
          }
        }
        if (!response.id) return;
        this.pending.get(response.id)?.(response);
        this.pending.delete(response.id);
      };
      this.socket.onerror = () => reject(new Error("cdp_websocket_error"));
      this.socket.onopen = () => resolve();
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<CdpResponse> {
    this.commandId += 1;
    const id = this.commandId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cdp_timeout:${method}`));
      }, 30000);
      this.pending.set(id, (response) => {
        clearTimeout(timeout);
        if (response.error) reject(new Error(`cdp_error:${method}:${response.error.message ?? "unknown"}`));
        else resolve(response);
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async enable(): Promise<void> {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    const expected = new URL(url);
    await this.waitForExpression(`
      (() => location.origin === ${JSON.stringify(expected.origin)} &&
        location.pathname === ${JSON.stringify(expected.pathname)} &&
        location.search === ${JSON.stringify(expected.search)})()
    `, 30000);
    await this.waitForExpression("document.readyState === 'complete'", 30000);
    await delay(500);
  }

  async evaluate<T>(expression: string, awaitPromise = false): Promise<T> {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (response.exceptionDetails) throw new Error("runtime_evaluate_exception");
    return response.result?.result?.value as T;
  }

  async waitForExpression(expression: string, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(expression).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error(`wait_for_expression_timeout:${expression.slice(0, 90)}`);
  }

  async waitForText(text: string, timeoutMs = 30000): Promise<void> {
    await this.waitForExpression(`document.body.innerText.includes(${JSON.stringify(text)})`, timeoutMs);
  }

  async clickButtonByText(text: string): Promise<boolean> {
    return this.evaluate<boolean>(`
      (() => {
        const target = [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === ${JSON.stringify(text)} && !button.disabled);
        if (!target) return false;
        target.click();
        return true;
      })()
    `);
  }

  async clickLinkByText(text: string): Promise<boolean> {
    return this.evaluate<boolean>(`
      (() => {
        const target = [...document.querySelectorAll("a")]
          .find((link) => link.textContent?.trim() === ${JSON.stringify(text)});
        if (!target) return false;
        target.click();
        return true;
      })()
    `);
  }

  async setViewport(width: number, height: number, mobile: boolean): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await delay(500);
  }

  async clearViewport(): Promise<void> {
    await this.send("Emulation.clearDeviceMetricsOverride");
    await delay(300);
  }

  async screenshot(filePath: string): Promise<void> {
    const response = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const data = response.result?.data;
    if (!data) throw new Error("screenshot_data_missing");
    fs.writeFileSync(filePath, Buffer.from(data, "base64"));
  }

  async getBodyText(): Promise<string> {
    return this.evaluate<string>("document.body.innerText");
  }

  close(): void {
    this.socket.close();
  }
}

const launchChrome = async (chromePath: string, baseUrl: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
}> => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05c2-chrome-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--window-size=1440,1000",
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    `${baseUrl}/login`,
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const debugPort = await waitForDevToolsPort(userDataDir);
  const target = await getPageTarget(debugPort);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.enable();
  return { client, process: child, userDataDir };
};

const deleteAuditDatabase = async (client: CdpClient): Promise<{ deleted: boolean; productionUntouched: boolean }> =>
  client.evaluate<{ deleted: boolean; productionUntouched: boolean }>(`
    (async () => {
      const deleted = await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      });
      const databases = "databases" in indexedDB ? await indexedDB.databases() : [];
      const names = databases.map((database) => database.name).filter(Boolean);
      return {
        deleted: deleted === true && !names.includes(${JSON.stringify(DATABASE_NAME)}),
        productionUntouched: !names.includes(${JSON.stringify(PRODUCTION_DATABASE_NAME)}),
      };
    })()
  `, true);

const inspectAuditDatabase = async (client: CdpClient): Promise<{
  activePointerExists: boolean;
  datasetMetadataCount: number;
}> =>
  client.evaluate<{ activePointerExists: boolean; datasetMetadataCount: number }>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const storeNames = [...db.objectStoreNames];
        if (!storeNames.includes("metadata")) return { activePointerExists: false, datasetMetadataCount: 0 };
        const pointer = await new Promise((resolve) => {
          const tx = db.transaction("metadata", "readonly");
          const req = tx.objectStore("metadata").get("activeDatasetPointer");
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        });
        const metadataCount = storeNames.includes("datasetMetadata")
          ? await new Promise((resolve) => {
              const tx = db.transaction("datasetMetadata", "readonly");
              const req = tx.objectStore("datasetMetadata").count();
              req.onsuccess = () => resolve(req.result ?? 0);
              req.onerror = () => resolve(0);
            })
          : 0;
        return { activePointerExists: !!pointer, datasetMetadataCount: Number(metadataCount) };
      } finally {
        db.close();
      }
    })()
  `, true);

const createCorruptedPointer = async (client: CdpClient): Promise<void> => {
  await client.evaluate<void>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)}, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("metadata")) db.createObjectStore("metadata", { keyPath: "key" });
          if (!db.objectStoreNames.contains("datasetMetadata")) db.createObjectStore("datasetMetadata", { keyPath: "datasetId" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("metadata", "readwrite");
          tx.objectStore("metadata").put({
            key: "activeDatasetPointer",
            value: {
              schemaVersion: "airburg_storage_v2",
              pointerId: "active",
              state: "v2_active",
              datasetId: "missing-v05c2-dataset",
              migrationManifestId: "missing-v05c2-manifest",
              activatedAt: "2026-06-22T13:40:00+08:00"
            }
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    })()
  `, true);
};

const setFileInputFiles = async (client: CdpClient): Promise<number> => {
  const documentResponse = await client.send("DOM.getDocument", { depth: 1 });
  const rootNodeId = documentResponse.result?.root?.nodeId;
  if (!rootNodeId) throw new Error("dom_root_missing");
  const queryResponse = await client.send("DOM.querySelector", {
    nodeId: rootNodeId,
    selector: "#v05-batch-file-input",
  });
  const nodeId = queryResponse.result?.nodeId;
  if (!nodeId) throw new Error("file_input_missing");
  const files = SAMPLE_FILES.map((relativePath) => path.join(ROOT, relativePath));
  await client.send("DOM.setFileInputFiles", { nodeId, files });
  await client.evaluate<void>(`
    (() => {
      const input = document.querySelector("#v05-batch-file-input");
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
  return client.evaluate<number>("document.querySelector('#v05-batch-file-input')?.files?.length ?? 0");
};

const importCurrentUploadSelection = async (client: CdpClient): Promise<boolean> => {
  await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
  const clicked = await client.clickButtonByText("导入");
  if (!clicked) return false;
  await client.waitForText("success", 120000);
  return true;
};

const addSecondStore = async (client: CdpClient): Promise<void> => {
  await client.evaluate<void>(`
    (() => {
      const input = document.querySelector("#v05-new-store-name");
      if (!input) throw new Error("new_store_input_missing");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "天猫第二店铺");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()
  `);
  await client.waitForExpression(`
    [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.trim() === "添加" && !button.disabled)
  `, 30000);
  const clicked = await client.clickButtonByText("添加");
  if (!clicked) throw new Error("add_store_button_missing");
  await client.waitForText("新店铺已加入本次导入", 30000);
};

const setStoreSelectByLabel = async (client: CdpClient, labelPart: string): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const select = document.querySelector("#home-store-select");
      if (!select) return false;
      const option = [...select.options].find((item) => item.textContent?.includes(${JSON.stringify(labelPart)}));
      if (!option) return false;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `);

const setStoreSelectAll = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const select = document.querySelector("#home-store-select");
      if (!select) return false;
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `);

const selectPeriod = async (client: CdpClient, label: string): Promise<boolean> => {
  const clicked = await client.clickButtonByText(label);
  if (!clicked) return false;
  await client.waitForExpression(`
    [...document.querySelectorAll("button")]
      .some((button) => button.textContent?.trim() === ${JSON.stringify(label)} && button.getAttribute("aria-pressed") === "true")
  `, 30000);
  return true;
};

const setCustomDateRangeToSelectedDate = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const date = document.querySelector("#home-business-date-select")?.value;
      const inputs = [...document.querySelectorAll('input[type="date"]')];
      if (!date || inputs.length < 2) return false;
      inputs.forEach((input) => {
        input.value = date;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return true;
    })()
  `);

const trendTabsWork = async (client: CdpClient): Promise<boolean> => {
  const labels = ["GMV", "GSV", "访客", "买家", "转化率", "推广花费"];
  for (const label of labels) {
    const clicked = await client.evaluate<boolean>(`
      (() => {
        const target = [...document.querySelectorAll('[role="tab"]')]
          .find((tab) => tab.textContent?.trim() === ${JSON.stringify(label)});
        if (!target) return false;
        target.click();
        return true;
      })()
    `);
    if (!clicked) return false;
    await client.waitForExpression(`
      [...document.querySelectorAll('[role="tab"]')]
        .some((tab) => tab.textContent?.trim() === ${JSON.stringify(label)} && tab.getAttribute("aria-selected") === "true")
    `, 30000);
  }
  return client.evaluate<boolean>(`
    document.querySelectorAll('svg[aria-label="首页主趋势图"]').length === 1 &&
    document.body.innerText.includes("最新值")
  `);
};

const noWholePageOverflow = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(
    "Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1",
  );

const capture = async (
  client: CdpClient,
  screenshotDir: string,
  key: keyof Omit<ScreenshotEvidence, "manifestPath">,
  width: number,
  height: number,
  mobile: boolean,
): Promise<string> => {
  await client.setViewport(width, height, mobile);
  await delay(600);
  const filePath = path.join(screenshotDir, `${key}.png`);
  await client.screenshot(filePath);
  return filePath;
};

const bodyIsSafe = async (client: CdpClient, sensitiveValues: Set<string>): Promise<{
  privacyPass: boolean;
  numberSafetyPass: boolean;
}> => {
  const bodyText = await client.getBodyText();
  const privacyPass =
    SENSITIVE_FIELD_NAMES.every((fieldName) => !bodyText.includes(fieldName)) &&
    [...sensitiveValues].every((value) => !bodyText.includes(value));
  return {
    privacyPass,
    numberSafetyPass: !containsInvalidNumberText(bodyText),
  };
};

const staticDependencyChecks = (): { c1CompletionValid: boolean } => {
  const completion = JSON.parse(readText(C1_COMPLETION)) as {
    taskId?: string;
    status?: string;
    completionCommit?: string;
  };
  return {
    c1CompletionValid:
      completion.taskId === "V0.5C_1_HOME_COMMAND_CENTER_RELAYOUT" &&
      completion.status === "complete" &&
      typeof completion.completionCommit === "string" &&
      completion.completionCommit.length > 0,
  };
};

const runRuntime = async (sensitiveValues: Set<string>): Promise<RuntimeEvidence> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05c2-home-screenshots-"));
  const next = await startNextDev();
  let chromeProcess: ChildProcess | null = null;
  let profileDir = "";
  let client: CdpClient | null = null;

  try {
    const launched = await launchChrome(chromePath, next.baseUrl);
    client = launched.client;
    chromeProcess = launched.process;
    profileDir = launched.userDataDir;

    await client.navigate(`${next.baseUrl}/login`);
    const loginClicked = await client.clickButtonByText("进入工作台");
    if (!loginClicked) throw new Error("login_button_missing");
    await client.waitForExpression("location.pathname === '/home'", 30000);
    await deleteAuditDatabase(client);

    await client.navigate(`${next.baseUrl}/upload`);
    const selectedFileCount = await setFileInputFiles(client);
    const firstImportSuccess = await importCurrentUploadSelection(client);

    await addSecondStore(client);
    const selectedAgain = await setFileInputFiles(client);
    const secondImportSuccess = await importCurrentUploadSelection(client);

    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("店铺表现与优先入口", 45000);
    const twoStoresVisible = await client.evaluate<boolean>(`
      document.body.innerText.includes("2 个店铺") &&
      document.body.innerText.includes("天猫默认店铺") &&
      document.body.innerText.includes("天猫第二店铺")
    `);
    const allStoresMetricsVisible = await client.evaluate<boolean>(`
      document.body.innerText.includes("GMV") &&
      document.body.innerText.includes("GSV") &&
      document.body.innerText.includes("商品访客") &&
      document.body.innerText.includes("支付买家") &&
      document.body.innerText.includes("支付转化率") &&
      document.body.innerText.includes("推广花费")
    `);
    const screenshots: Partial<ScreenshotEvidence> = {};
    screenshots.desktopAllStores = await capture(client, screenshotDir, "desktopAllStores", 1440, 1000, false);

    const defaultStoreFilterWorks = await setStoreSelectByLabel(client, "天猫默认店铺");
    await delay(800);
    screenshots.desktopDefaultStore = await capture(client, screenshotDir, "desktopDefaultStore", 1440, 1000, false);
    const defaultStoreDrilldownWorks = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((item) => item.textContent?.includes("天猫默认店铺"));
        const link = row?.querySelector("a[href^='/store-board']");
        return !!link && link.getAttribute("href")?.includes("storeId=tmall-default-store");
      })()
    `);
    const defaultClicked = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((item) => item.textContent?.includes("天猫默认店铺"));
        const link = row?.querySelector("a[href^='/store-board']");
        if (!link) return false;
        link.click();
        return true;
      })()
    `);
    if (defaultClicked) {
      await client.waitForExpression("location.pathname === '/store-board'", 30000);
      await client.navigate(`${next.baseUrl}/home`);
      await client.waitForText("店铺表现与优先入口", 45000);
    }

    const secondStoreFilterWorks = await setStoreSelectByLabel(client, "天猫第二店铺");
    await delay(800);
    screenshots.desktopSecondStore = await capture(client, screenshotDir, "desktopSecondStore", 1440, 1000, false);
    const secondStoreBoardDisabled = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((item) => item.textContent?.includes("天猫第二店铺"));
        if (!row) return false;
        const hasStoreBoardLink = !!row.querySelector("a[href^='/store-board']");
        const disabled = [...row.querySelectorAll("button")]
          .some((button) => button.disabled && button.textContent?.includes("店铺看板待升级"));
        return !hasStoreBoardLink && disabled;
      })()
    `);
    const secondStoreHistoryContextWorks = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((item) => item.textContent?.includes("天猫第二店铺"));
        const link = row?.querySelector("a[href^='/upload/history']");
        if (!link) return false;
        const href = link.getAttribute("href") ?? "";
        if (!href.includes("platform=tmall") || !href.includes("storeId=") || !href.includes("batchId=")) return false;
        link.click();
        return true;
      })()
    `);
    if (secondStoreHistoryContextWorks) {
      await client.waitForExpression("location.pathname === '/upload/history'", 30000);
      await client.waitForExpression("location.search.includes('platform=tmall') && location.search.includes('storeId=')", 30000);
      await client.navigate(`${next.baseUrl}/home`);
      await client.waitForText("店铺表现与优先入口", 45000);
    }

    const dayPeriodWorks = await selectPeriod(client, "日");
    const weekPeriodWorks = await selectPeriod(client, "周");
    const monthPeriodWorks = await selectPeriod(client, "月");
    const customPeriodButtonWorks = await selectPeriod(client, "自定义");
    const customRangeSet = await setCustomDateRangeToSelectedDate(client);
    await delay(800);
    const customPeriodWorks = customPeriodButtonWorks && customRangeSet &&
      await client.evaluate<boolean>("!document.body.innerText.includes('起始日期不能晚于结束日期')");

    await setStoreSelectAll(client);
    await selectPeriod(client, "日");
    await delay(800);
    const oneMainTrendChart = await client.evaluate<boolean>(
      "document.querySelectorAll('svg[aria-label=\"首页主趋势图\"]').length === 1",
    );
    const trendTabsWorkResult = await trendTabsWork(client);

    const targetSettingsLinkWorks = await client.clickLinkByText("目标设置");
    if (targetSettingsLinkWorks) {
      await client.waitForExpression("location.pathname === '/targets'", 30000);
      await client.navigate(`${next.baseUrl}/home`);
      await client.waitForText("店铺表现与优先入口", 45000);
    }
    const dataImportLinkWorks = await client.clickLinkByText("数据导入");
    if (dataImportLinkWorks) {
      await client.waitForExpression("location.pathname === '/upload'", 30000);
      await client.navigate(`${next.baseUrl}/home`);
      await client.waitForText("店铺表现与优先入口", 45000);
    }

    await setStoreSelectAll(client);
    await delay(500);
    await client.setViewport(390, 844, true);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("店铺表现与优先入口", 45000);
    screenshots.mobileAllStores = await capture(client, screenshotDir, "mobileAllStores", 390, 844, true);
    await selectPeriod(client, "自定义");
    screenshots.mobilePeriodControls = await capture(client, screenshotDir, "mobilePeriodControls", 390, 844, true);
    await client.evaluate<void>("document.querySelector('table')?.scrollIntoView({ block: 'center' })");
    screenshots.mobileStorePerformance = await capture(client, screenshotDir, "mobileStorePerformance", 390, 844, true);
    const mobile390NoOverflow = await noWholePageOverflow(client);
    await client.clearViewport();

    await client.navigate(`${next.baseUrl}/home?platform=invalid&storeId=invalid&date=not-a-date`);
    await client.waitForText("首页", 30000);
    const invalidParamsSafe = !containsInvalidNumberText(await client.getBodyText());

    const afterValidSafety = await bodyIsSafe(client, sensitiveValues);
    const noBusinessConsoleIssues = client.consoleMessages.every((message) =>
      message.includes("favicon.ico") || message.includes("Download the React DevTools"),
    );

    await deleteAuditDatabase(client);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("旧版单店数据", 45000);
    screenshots.desktopLegacyFallback = await capture(client, screenshotDir, "desktopLegacyFallback", 1440, 1000, false);
    await client.setViewport(390, 844, true);
    screenshots.mobileLegacyFallback = await capture(client, screenshotDir, "mobileLegacyFallback", 390, 844, true);
    await client.clearViewport();
    const legacyFallbackWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('旧版单店数据') && document.body.innerText.includes('天猫默认店铺')",
    );
    const legacyInspection = await inspectAuditDatabase(client);
    const legacyDoesNotCreateActiveDataset =
      !legacyInspection.activePointerExists && legacyInspection.datasetMetadataCount === 0;

    await deleteAuditDatabase(client);
    await client.evaluate<void>(`
      localStorage.removeItem("airburg_tmall_analysis_v2");
      localStorage.removeItem("airburg_tmall_targets_v1");
      localStorage.removeItem("airburg_tmall_series_groups_v1");
    `);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("当前没有经营数据", 45000);
    screenshots.desktopEmptyState = await capture(client, screenshotDir, "desktopEmptyState", 1440, 1000, false);
    const emptyStateWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('前往数据导入') && !document.body.innerText.includes('Error:')",
    );

    await createCorruptedPointer(client);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("本地经营数据不可安全读取", 45000);
    screenshots.desktopCorruptedState = await capture(client, screenshotDir, "desktopCorruptedState", 1440, 1000, false);
    const corruptedStateWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('查看数据质量') && !document.body.innerText.includes('missing-v05c2-dataset')",
    );

    const cleanup = await deleteAuditDatabase(client);
    const screenshotEvidence = screenshots as Omit<ScreenshotEvidence, "manifestPath">;
    const manifestPath = path.join(screenshotDir, "manifest.json");
    const completedScreenshots = { ...screenshotEvidence, manifestPath };
    fs.writeFileSync(manifestPath, JSON.stringify(completedScreenshots, null, 2));

    return {
      selectedFileCount: Math.min(selectedFileCount, selectedAgain),
      firstImportSuccess,
      secondImportSuccess,
      twoStoresVisible,
      allStoresMetricsVisible,
      defaultStoreFilterWorks,
      secondStoreFilterWorks,
      defaultStoreDrilldownWorks: defaultStoreDrilldownWorks && defaultClicked,
      secondStoreBoardDisabled,
      secondStoreHistoryContextWorks,
      dayPeriodWorks,
      weekPeriodWorks,
      monthPeriodWorks,
      customPeriodWorks,
      trendTabsWork: trendTabsWorkResult,
      oneMainTrendChart,
      targetSettingsLinkWorks,
      dataImportLinkWorks,
      invalidParamsSafe,
      legacyFallbackWorks,
      legacyDoesNotCreateActiveDataset,
      emptyStateWorks,
      corruptedStateWorks,
      mobile390NoOverflow,
      noBusinessConsoleIssues,
      privacyPass: afterValidSafety.privacyPass,
      numberSafetyPass: afterValidSafety.numberSafetyPass,
      auditDatabaseDeleted: cleanup.deleted,
      productionDatabaseUntouched: cleanup.productionUntouched,
      screenshots: completedScreenshots,
    };
  } finally {
    try {
      if (client) {
        await deleteAuditDatabase(client).catch(() => null);
        client.close();
      }
    } finally {
      await stopProcess(chromeProcess);
      await stopProcess(next.process);
      next.restoreNextEnv();
      if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
};

const main = async () => {
  const staticChecks = staticDependencyChecks();
  const sensitiveValues = await collectSensitiveSourceValues();
  let runtime: RuntimeEvidence | null = null;
  let runtimeError: string | null = null;

  try {
    runtime = await runRuntime(sensitiveValues);
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : "runtime_validation_failed";
  }

  const screenshotPaths = runtime?.screenshots
    ? Object.values(runtime.screenshots).filter((value): value is string => typeof value === "string")
    : [];
  const checks = {
    c1CompletionValid: staticChecks.c1CompletionValid,
    realBrowserSelectedFourFiles: runtime?.selectedFileCount === 4,
    firstImportSuccess: runtime?.firstImportSuccess === true,
    secondImportSuccess: runtime?.secondImportSuccess === true,
    twoStoresVisible: runtime?.twoStoresVisible === true,
    allStoresMetricsVisible: runtime?.allStoresMetricsVisible === true,
    defaultStoreFilterWorks: runtime?.defaultStoreFilterWorks === true,
    secondStoreFilterWorks: runtime?.secondStoreFilterWorks === true,
    defaultStoreDrilldownWorks: runtime?.defaultStoreDrilldownWorks === true,
    secondStoreBoardDisabled: runtime?.secondStoreBoardDisabled === true,
    secondStoreHistoryContextWorks: runtime?.secondStoreHistoryContextWorks === true,
    datePeriodsWork:
      runtime?.dayPeriodWorks === true &&
      runtime?.weekPeriodWorks === true &&
      runtime?.monthPeriodWorks === true &&
      runtime?.customPeriodWorks === true,
    trendTabsWork: runtime?.trendTabsWork === true,
    oneMainTrendChart: runtime?.oneMainTrendChart === true,
    primaryLinksWork:
      runtime?.targetSettingsLinkWorks === true &&
      runtime?.dataImportLinkWorks === true,
    invalidParamsSafe: runtime?.invalidParamsSafe === true,
    legacyFallbackWorks: runtime?.legacyFallbackWorks === true,
    legacyDoesNotCreateActiveDataset: runtime?.legacyDoesNotCreateActiveDataset === true,
    emptyStateWorks: runtime?.emptyStateWorks === true,
    corruptedStateWorks: runtime?.corruptedStateWorks === true,
    mobile390NoOverflow: runtime?.mobile390NoOverflow === true,
    noBusinessConsoleIssues: runtime?.noBusinessConsoleIssues === true,
    privacyPass: runtime?.privacyPass === true,
    numberSafetyPass: runtime?.numberSafetyPass === true,
    screenshotsExist: screenshotPaths.length >= 11 && screenshotPaths.every((filePath) => fs.existsSync(filePath)),
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted === true,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched === true,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c2-home-runtime-and-drilldown",
    databaseName: DATABASE_NAME,
    fileSelectionMethod: "DOM.setFileInputFiles",
    failedChecks,
    runtimeError,
    screenshotManifestPath: runtime?.screenshots.manifestPath ?? null,
    screenshotPaths,
    privacyPass: runtime?.privacyPass ?? false,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    mobile390NoOverflow: runtime?.mobile390NoOverflow ?? false,
    defaultStoreDrilldownWorks: runtime?.defaultStoreDrilldownWorks ?? false,
    secondStoreBoardDisabled: runtime?.secondStoreBoardDisabled ?? false,
    secondStoreHistoryContextWorks: runtime?.secondStoreHistoryContextWorks ?? false,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c2-home-runtime-and-drilldown",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
