import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-c3-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";

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

interface ScreenshotEntry {
  key: string;
  path: string;
  viewport: "desktop-1440" | "mobile-390";
  state: string;
  sha256: string;
}

interface RuntimeEvidence {
  selectedFileCount: number;
  defaultImportSuccess: boolean;
  secondImportSuccess: boolean;
  homeShowsTwoStores: boolean;
  allStoreMetricsVisible: boolean;
  defaultStoreFilterWorks: boolean;
  secondStoreFilterWorks: boolean;
  productStoreIsolationPass: boolean;
  planStoreIsolationPass: boolean;
  dayWorks: boolean;
  weekWorks: boolean;
  monthWorks: boolean;
  customWorks: boolean;
  invalidCustomRangeShowsError: boolean;
  trendTabsWork: boolean;
  oneMainTrendChart: boolean;
  defaultStoreDrilldownPass: boolean;
  secondStoreSafetyPass: boolean;
  secondStoreHistoryContextPass: boolean;
  legacyFallbackPass: boolean;
  legacyDoesNotWriteV2: boolean;
  emptyStatePass: boolean;
  corruptedStatePass: boolean;
  invalidParamsSafe: boolean;
  primaryLinksPass: boolean;
  otherPagesPass: boolean;
  mobile390Pass: boolean;
  noBusinessConsoleIssues: boolean;
  privacyPass: boolean;
  leakedSensitiveValueCount: number;
  numberSafetyPass: boolean;
  screenshotManifestPath: string;
  screenshotCount: number;
  auditDatabaseDeleted: boolean;
  productionDatabaseUntouched: boolean;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

  async screenshot(filePath: string): Promise<string> {
    const response = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const data = response.result?.data;
    if (!data) throw new Error("screenshot_data_missing");
    const bytes = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, bytes);
    return createHash("sha256").update(bytes).digest("hex");
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05c3-chrome-"));
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
  businessStoreCount: number;
  adPlanStoreCount: number;
}> =>
  client.evaluate<{
    activePointerExists: boolean;
    datasetMetadataCount: number;
    businessStoreCount: number;
    adPlanStoreCount: number;
  }>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const values = async (storeName) => {
        if (![...db.objectStoreNames].includes(storeName)) return [];
        return await new Promise((resolve) => {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result ?? []);
          req.onerror = () => resolve([]);
        });
      };
      try {
        const pointerRows = await values("metadata");
        const metadataRows = await values("datasetMetadata");
        const businessRows = await values("businessProductFacts");
        const adPlanRows = await values("adPlanFacts");
        const storeIds = (rows) => new Set(rows.map((row) => (row.value ?? row).storeId).filter(Boolean)).size;
        return {
          activePointerExists: pointerRows.some((row) => row.key === "activeDatasetPointer"),
          datasetMetadataCount: metadataRows.length,
          businessStoreCount: storeIds(businessRows),
          adPlanStoreCount: storeIds(adPlanRows)
        };
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
              datasetId: "missing-v05c3-dataset",
              migrationManifestId: "missing-v05c3-manifest",
              activatedAt: "2026-06-22T14:30:00+08:00"
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

const importCurrentSelection = async (client: CdpClient): Promise<boolean> => {
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
      setter?.call(input, "天猫第二店铺 - 很长店铺名用于移动端验收");
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

const setStoreSelect = async (client: CdpClient, labelPart: string | "all"): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const select = document.querySelector("#home-store-select");
      if (!select) return false;
      if (${JSON.stringify(labelPart)} === "all") {
        select.value = "all";
      } else {
        const option = [...select.options].find((item) => item.textContent?.includes(${JSON.stringify(labelPart)}));
        if (!option) return false;
        select.value = option.value;
      }
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

const setCustomRange = async (client: CdpClient, invalid = false): Promise<boolean> =>
  client.evaluate<boolean>(`
    (async () => {
      const date = document.querySelector("#home-business-date-select")?.value || "2026-06-18";
      const inputs = [...document.querySelectorAll('input[type="date"]')];
      if (inputs.length < 2) return false;
      const start = ${invalid} ? "2026-06-19" : date;
      const end = ${invalid} ? "2026-06-18" : date;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(inputs[0], start);
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      setter?.call(inputs[1], end);
      inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[1].dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `, true);

const trendTabsWork = async (client: CdpClient): Promise<boolean> => {
  for (const label of ["GMV", "GSV", "访客", "买家", "转化率", "推广花费"]) {
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
        .some((tab) => tab.textContent?.trim() === ${JSON.stringify(label)} && tab.getAttribute("aria-selected") === "true") &&
      document.body.innerText.includes("最新值")
    `, 30000);
  }
  return true;
};

const noWholePageOverflow = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(
    "Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1",
  );

const bodySafety = async (client: CdpClient, sensitiveValues: Set<string>) => {
  const bodyText = await client.getBodyText();
  const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => bodyText.includes(value)).length;
  return {
    privacyPass:
      leakedSensitiveValueCount === 0 &&
      SENSITIVE_FIELD_NAMES.every((fieldName) => !bodyText.includes(fieldName)),
    leakedSensitiveValueCount,
    numberSafetyPass: !containsInvalidNumberText(bodyText),
  };
};

const capture = async ({
  client,
  screenshotDir,
  entries,
  key,
  state,
  viewport,
}: {
  client: CdpClient;
  screenshotDir: string;
  entries: ScreenshotEntry[];
  key: string;
  state: string;
  viewport: "desktop-1440" | "mobile-390";
}): Promise<void> => {
  const [width, height, mobile] = viewport === "desktop-1440"
    ? [1440, 1000, false]
    : [390, 844, true];
  await client.setViewport(width, height, mobile);
  const filePath = path.join(screenshotDir, `${key}.png`);
  const sha256 = await client.screenshot(filePath);
  entries.push({ key, path: filePath, viewport, state, sha256 });
};

const runRuntime = async (sensitiveValues: Set<string>): Promise<RuntimeEvidence> => {
  const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
  if (!chromePath) throw new Error("chrome_not_found");
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05c3-home-screenshots-"));
  const screenshotEntries: ScreenshotEntry[] = [];
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
    if (!await client.clickButtonByText("进入工作台")) throw new Error("login_button_missing");
    await client.waitForExpression("location.pathname === '/home'", 30000);
    await deleteAuditDatabase(client);

    await client.navigate(`${next.baseUrl}/upload`);
    const selectedFileCount = await setFileInputFiles(client);
    const defaultImportSuccess = await importCurrentSelection(client);
    await addSecondStore(client);
    const selectedAgain = await setFileInputFiles(client);
    const secondImportSuccess = await importCurrentSelection(client);

    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("店铺表现与优先入口", 45000);
    const homeShowsTwoStores = await client.evaluate<boolean>(`
      document.body.innerText.includes("2 个店铺") &&
      document.body.innerText.includes("天猫默认店铺") &&
      document.body.innerText.includes("天猫第二店铺")
    `);
    const allStoreMetricsVisible = await client.evaluate<boolean>(`
      ["GMV", "GSV", "商品访客", "支付买家", "支付转化率", "推广花费"].every((text) =>
        document.body.innerText.includes(text)
      )
    `);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-all-stores", state: "all stores", viewport: "desktop-1440" });

    const isolation = await inspectAuditDatabase(client);
    const productStoreIsolationPass = isolation.businessStoreCount === 2;
    const planStoreIsolationPass = isolation.adPlanStoreCount === 2;

    const defaultStoreFilterWorks = await setStoreSelect(client, "天猫默认店铺");
    await delay(700);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-default-store", state: "default store", viewport: "desktop-1440" });
    const defaultStoreDrilldownPass = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")].find((item) => item.textContent?.includes("天猫默认店铺"));
        const link = row?.querySelector("a[href^='/store-board']");
        return !!link && link.getAttribute("href")?.includes("platform=tmall") && link.getAttribute("href")?.includes("storeId=tmall-default-store");
      })()
    `);

    const secondStoreFilterWorks = await setStoreSelect(client, "天猫第二店铺");
    await delay(700);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-second-store", state: "second store", viewport: "desktop-1440" });
    const secondStoreSafetyPass = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")].find((item) => item.textContent?.includes("天猫第二店铺"));
        if (!row) return false;
        const hasOldStoreBoard = !!row.querySelector("a[href^='/store-board']");
        const disabled = [...row.querySelectorAll("button")].some((button) =>
          button.disabled && button.textContent?.includes("店铺看板待升级") && button.title
        );
        return !hasOldStoreBoard && disabled;
      })()
    `);
    const secondStoreHistoryContextPass = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")].find((item) => item.textContent?.includes("天猫第二店铺"));
        const link = row?.querySelector("a[href^='/upload/history']");
        if (!link) return false;
        const href = link.getAttribute("href") ?? "";
        return href.includes("platform=tmall") && href.includes("storeId=") && href.includes("batchId=");
      })()
    `);

    await setStoreSelect(client, "all");
    const dayWorks = await selectPeriod(client, "日");
    const weekWorks = await selectPeriod(client, "周");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-week", state: "week period", viewport: "desktop-1440" });
    const monthWorks = await selectPeriod(client, "月");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-month", state: "month period", viewport: "desktop-1440" });
    const customButtonWorks = await selectPeriod(client, "自定义");
    const customRangeWorks = await setCustomRange(client, false);
    await delay(600);
    const customWorks = customButtonWorks && customRangeWorks && !containsInvalidNumberText(await client.getBodyText());
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-custom", state: "custom period", viewport: "desktop-1440" });
    await setCustomRange(client, true);
    await delay(600);
    const invalidCustomRangeShowsError = await client.evaluate<boolean>("document.body.innerText.includes('起始日期不能晚于结束日期')");
    await selectPeriod(client, "日");
    await delay(600);

    const oneMainTrendChart = await client.evaluate<boolean>(
      "document.querySelectorAll('svg[aria-label=\"首页主趋势图\"]').length === 1",
    );
    const trendTabsPass = await trendTabsWork(client);

    const targetLink = await client.clickLinkByText("目标设置");
    let importLink = false;
    if (targetLink) {
      await client.waitForExpression("location.pathname === '/targets'", 30000);
      await client.navigate(`${next.baseUrl}/home`);
      await client.waitForText("店铺表现与优先入口", 45000);
      importLink = await client.clickLinkByText("数据导入");
      if (importLink) await client.waitForExpression("location.pathname === '/upload'", 30000);
    }
    const primaryLinksPass = targetLink && importLink;

    await client.navigate(`${next.baseUrl}/home?platform=invalid&storeId=invalid&date=invalid`);
    await client.waitForText("首页", 30000);
    const invalidParamsSafe = !containsInvalidNumberText(await client.getBodyText());

    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("店铺表现与优先入口", 30000);
    await client.setViewport(390, 844, true);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-all-stores", state: "mobile all stores", viewport: "mobile-390" });
    await selectPeriod(client, "周");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-period", state: "mobile period controls", viewport: "mobile-390" });
    await client.evaluate<void>("document.querySelector('svg[aria-label=\"首页主趋势图\"]')?.scrollIntoView({ block: 'center' })");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-trend", state: "mobile trend", viewport: "mobile-390" });
    await client.evaluate<void>("document.querySelector('table')?.scrollIntoView({ block: 'center' })");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-store-performance", state: "mobile store performance", viewport: "mobile-390" });
    await setStoreSelect(client, "天猫第二店铺");
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-second-store", state: "mobile second store", viewport: "mobile-390" });
    const mobile390Pass = await noWholePageOverflow(client);
    await client.clearViewport();

    const validSafety = await bodySafety(client, sensitiveValues);
    const noBusinessConsoleIssues = client.consoleMessages.every((message) =>
      message.includes("favicon.ico") || message.includes("Download the React DevTools"),
    );

    await deleteAuditDatabase(client);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("旧版单店数据", 45000);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-legacy-fallback", state: "legacy fallback", viewport: "desktop-1440" });
    await client.setViewport(390, 844, true);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "mobile-legacy-fallback", state: "mobile legacy fallback", viewport: "mobile-390" });
    await client.clearViewport();
    const legacyFallbackPass = await client.evaluate<boolean>(
      "document.body.innerText.includes('旧版单店数据') && document.body.innerText.includes('天猫默认店铺') && !document.body.innerText.includes('missing-v05c3')",
    );
    const legacyInspection = await inspectAuditDatabase(client);
    const legacyDoesNotWriteV2 =
      !legacyInspection.activePointerExists && legacyInspection.datasetMetadataCount === 0;

    await deleteAuditDatabase(client);
    await client.evaluate<void>(`
      localStorage.removeItem("airburg_tmall_analysis_v2");
      localStorage.removeItem("airburg_tmall_targets_v1");
      localStorage.removeItem("airburg_tmall_series_groups_v1");
    `);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("当前没有经营数据", 45000);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-empty", state: "empty", viewport: "desktop-1440" });
    const emptyStatePass = await client.evaluate<boolean>(
      "document.body.innerText.includes('前往数据导入') && !document.body.innerText.includes('Error:')",
    );

    await createCorruptedPointer(client);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("本地经营数据不可安全读取", 45000);
    await capture({ client, screenshotDir, entries: screenshotEntries, key: "desktop-corrupted", state: "corrupted", viewport: "desktop-1440" });
    const corruptedStatePass = await client.evaluate<boolean>(
      "document.body.innerText.includes('查看数据质量') && !document.body.innerText.includes('missing-v05c3-dataset') && !document.body.innerText.includes('Error:')",
    );

    const pages = [
      "/login",
      "/upload",
      "/upload/history",
      "/upload/quality",
      "/raw-data",
      "/targets",
      "/store-board",
      "/series-board",
      "/product-board",
    ];
    let otherPagesPass = true;
    for (const page of pages) {
      await client.navigate(`${next.baseUrl}${page}`);
      const bodyText = await client.getBodyText();
      if (!bodyText.trim() || containsInvalidNumberText(bodyText)) otherPagesPass = false;
      await client.setViewport(390, 844, true);
      if (!await noWholePageOverflow(client)) otherPagesPass = false;
      await client.clearViewport();
    }

    const manifestPath = path.join(screenshotDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      databaseName: DATABASE_NAME,
      screenshotCount: screenshotEntries.length,
      screenshots: screenshotEntries,
    }, null, 2));

    const cleanup = await deleteAuditDatabase(client);
    return {
      selectedFileCount: Math.min(selectedFileCount, selectedAgain),
      defaultImportSuccess,
      secondImportSuccess,
      homeShowsTwoStores,
      allStoreMetricsVisible,
      defaultStoreFilterWorks,
      secondStoreFilterWorks,
      productStoreIsolationPass,
      planStoreIsolationPass,
      dayWorks,
      weekWorks,
      monthWorks,
      customWorks,
      invalidCustomRangeShowsError,
      trendTabsWork: trendTabsPass,
      oneMainTrendChart,
      defaultStoreDrilldownPass,
      secondStoreSafetyPass,
      secondStoreHistoryContextPass,
      legacyFallbackPass,
      legacyDoesNotWriteV2,
      emptyStatePass,
      corruptedStatePass,
      invalidParamsSafe,
      primaryLinksPass,
      otherPagesPass,
      mobile390Pass,
      noBusinessConsoleIssues,
      privacyPass: validSafety.privacyPass,
      leakedSensitiveValueCount: validSafety.leakedSensitiveValueCount,
      numberSafetyPass: validSafety.numberSafetyPass,
      screenshotManifestPath: manifestPath,
      screenshotCount: screenshotEntries.length,
      auditDatabaseDeleted: cleanup.deleted,
      productionDatabaseUntouched: cleanup.productionUntouched,
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
  const sensitiveValues = await collectSensitiveSourceValues();
  let runtime: RuntimeEvidence | null = null;
  let runtimeError: string | null = null;

  try {
    runtime = await runRuntime(sensitiveValues);
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : "runtime_validation_failed";
  }

  const checks = {
    selectedFourFiles: runtime?.selectedFileCount === 4,
    defaultImportSuccess: runtime?.defaultImportSuccess === true,
    secondImportSuccess: runtime?.secondImportSuccess === true,
    homeShowsTwoStores: runtime?.homeShowsTwoStores === true,
    allStoreMetricsVisible: runtime?.allStoreMetricsVisible === true,
    defaultStoreFilterWorks: runtime?.defaultStoreFilterWorks === true,
    secondStoreFilterWorks: runtime?.secondStoreFilterWorks === true,
    productStoreIsolationPass: runtime?.productStoreIsolationPass === true,
    planStoreIsolationPass: runtime?.planStoreIsolationPass === true,
    periodsWork:
      runtime?.dayWorks === true &&
      runtime?.weekWorks === true &&
      runtime?.monthWorks === true &&
      runtime?.customWorks === true &&
      runtime?.invalidCustomRangeShowsError === true,
    trendTabsWork: runtime?.trendTabsWork === true,
    oneMainTrendChart: runtime?.oneMainTrendChart === true,
    defaultStoreDrilldownPass: runtime?.defaultStoreDrilldownPass === true,
    secondStoreSafetyPass: runtime?.secondStoreSafetyPass === true,
    secondStoreHistoryContextPass: runtime?.secondStoreHistoryContextPass === true,
    legacyFallbackPass: runtime?.legacyFallbackPass === true,
    legacyDoesNotWriteV2: runtime?.legacyDoesNotWriteV2 === true,
    emptyStatePass: runtime?.emptyStatePass === true,
    corruptedStatePass: runtime?.corruptedStatePass === true,
    invalidParamsSafe: runtime?.invalidParamsSafe === true,
    primaryLinksPass: runtime?.primaryLinksPass === true,
    otherPagesPass: runtime?.otherPagesPass === true,
    mobile390Pass: runtime?.mobile390Pass === true,
    noBusinessConsoleIssues: runtime?.noBusinessConsoleIssues === true,
    privacyPass: runtime?.privacyPass === true && runtime?.leakedSensitiveValueCount === 0,
    numberSafetyPass: runtime?.numberSafetyPass === true,
    screenshotManifestPass:
      !!runtime?.screenshotManifestPath &&
      fs.existsSync(runtime.screenshotManifestPath) &&
      runtime.screenshotCount >= 15,
    cleanupPass: runtime?.auditDatabaseDeleted === true && runtime?.productionDatabaseUntouched === true,
  };

  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c-final-browser-runtime",
    databaseName: DATABASE_NAME,
    failedChecks,
    runtimeError,
    screenshotManifestPath: runtime?.screenshotManifestPath ?? null,
    screenshotCount: runtime?.screenshotCount ?? 0,
    privacyPass: runtime?.privacyPass ?? false,
    leakedSensitiveValueCount: runtime?.leakedSensitiveValueCount ?? null,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    mobile390Pass: runtime?.mobile390Pass ?? false,
    defaultStoreDrilldownPass: runtime?.defaultStoreDrilldownPass ?? false,
    secondStoreSafetyPass: runtime?.secondStoreSafetyPass ?? false,
    periods: runtime ? {
      dayWorks: runtime.dayWorks,
      weekWorks: runtime.weekWorks,
      monthWorks: runtime.monthWorks,
      customWorks: runtime.customWorks,
      invalidCustomRangeShowsError: runtime.invalidCustomRangeShowsError
    } : null,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched ?? false,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c-final-browser-runtime",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
