import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-d2-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const D1_COMPLETION = "docs/project/task-completions/V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT.json";

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
  desktopDefaultStore: string;
  desktopSecondStore: string;
  desktopWeekView: string;
  desktopMonthView: string;
  desktopCustomView: string;
  desktopProductTab: string;
  desktopSeriesTab: string;
  desktopAdAfterSalesTab: string;
  desktopHomeDrilldown: string;
  desktopLegacyFallback: string;
  desktopInvalidStore: string;
  desktopCorruptedState: string;
  desktopEmptyState: string;
  mobileDefaultStore: string;
  mobileSecondStore: string;
  mobileStoreSwitch: string;
  mobileMetrics: string;
  mobileTargetSummary: string;
  mobileTrend: string;
  mobileProductTab: string;
  mobileSeriesTab: string;
  mobileAdAfterSalesTab: string;
  mobileLegacyFallback: string;
  manifestPath: string;
}

interface RuntimeEvidence {
  selectedFileCount: number;
  firstImportSuccess: boolean;
  secondImportSuccess: boolean;
  homeSecondStoreLinkWorks: boolean;
  defaultStoreBoardWorks: boolean;
  secondStoreBoardWorks: boolean;
  storeSelectWorks: boolean;
  dayPeriodWorks: boolean;
  weekPeriodWorks: boolean;
  monthPeriodWorks: boolean;
  customPeriodWorks: boolean;
  customInvalidRangeSafe: boolean;
  trendTabsWork: boolean;
  focusTabsWork: boolean;
  defaultProductDrilldownSafe: boolean;
  defaultSeriesDrilldownSafe: boolean;
  nonDefaultProductDrilldownDisabled: boolean;
  nonDefaultSeriesDrilldownDisabled: boolean;
  nonDefaultQualityHrefWorks: boolean;
  refreshKeepsStore: boolean;
  historyNavigationWorks: boolean;
  mobileStoreSwitchWorks: boolean;
  oneMainTrendChart: boolean;
  mainRegionCountOk: boolean;
  targetAndUploadLinksWork: boolean;
  invalidStoreSafe: boolean;
  corruptedStateSafe: boolean;
  legacyFallbackWorks: boolean;
  emptyStateWorks: boolean;
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

const sha256File = (filePath: string): string => {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
};

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
    await delay(600);
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05d2-chrome-"));
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
      const date = document.querySelector("#store-board-business-date-select")?.value;
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

const setStoreSelectByLabel = async (client: CdpClient, labelPart: string): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const select = document.querySelector("#store-board-store-select");
      if (!select) return false;
      const option = [...select.options].find((item) => item.textContent?.includes(${JSON.stringify(labelPart)}));
      if (!option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, option.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `);

const getStoreOptionValueByLabel = async (client: CdpClient, labelPart: string): Promise<string | null> =>
  client.evaluate<string | null>(`
    (() => {
      const select = document.querySelector("#store-board-store-select");
      if (!select) return null;
      const option = [...select.options].find((item) => item.textContent?.includes(${JSON.stringify(labelPart)}));
      return option?.value ?? null;
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
    document.querySelectorAll('svg[aria-label="店铺主趋势图"]').length === 1 &&
    document.body.innerText.includes("最新值")
  `);
};

const focusTabsWork = async (client: CdpClient): Promise<boolean> => {
  const labels = ["商品表现", "系列进度", "推广与售后"];
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
    document.body.innerText.includes("商品表现") &&
    document.body.innerText.includes("系列进度") &&
    document.body.innerText.includes("推广与售后")
  `);
};

const setInvalidCustomDateRange = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const inputs = [...document.querySelectorAll('input[type="date"]')];
      if (inputs.length < 2) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(inputs[0], "2026-06-20");
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
      setter?.call(inputs[1], "2026-06-18");
      inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
      inputs[1].dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `);

const clickFocusTab = async (client: CdpClient, label: string): Promise<boolean> =>
  client.evaluate<boolean>(`
    (() => {
      const tab = [...document.querySelectorAll('[role="tab"]')]
        .find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
      if (!tab) return false;
      tab.click();
      return true;
    })()
  `);

const queryDrilldownState = async (client: CdpClient): Promise<{
  defaultProductLink: boolean;
  defaultSeriesLink: boolean;
  nonDefaultProductDisabled: boolean;
  nonDefaultSeriesDisabled: boolean;
  qualityHrefHasStore: boolean;
}> =>
  client.evaluate<{
    defaultProductLink: boolean;
    defaultSeriesLink: boolean;
    nonDefaultProductDisabled: boolean;
    nonDefaultSeriesDisabled: boolean;
    qualityHrefHasStore: boolean;
  }>(`
    (() => {
      const text = document.body.innerText;
      const expectedStoreId = new URLSearchParams(location.search).get("storeId") ?? "";
      const productLink = [...document.querySelectorAll('a[href^="/product-board"]')]
        .some((link) => (link.getAttribute("href") ?? "").includes("storeId=tmall-default-store"));
      const seriesLink = [...document.querySelectorAll('a[href^="/series-board"]')]
        .some((link) => (link.getAttribute("href") ?? "").includes("storeId=tmall-default-store"));
      const qualityHrefHasStore = [...document.querySelectorAll('a[href^="/upload/quality"]')]
        .some((link) => (link.getAttribute("href") ?? "").includes("storeId=" + expectedStoreId));
      return {
        defaultProductLink: productLink,
        defaultSeriesLink: seriesLink,
        nonDefaultProductDisabled: text.includes("商品看板待升级") && [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "商品看板待升级" && button.disabled),
        nonDefaultSeriesDisabled: text.includes("系列看板待升级") && [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "系列看板待升级" && button.disabled),
        qualityHrefHasStore,
      };
    })()
  `);

const corruptAuditPointer = async (client: CdpClient): Promise<boolean> =>
  client.evaluate<boolean>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction("metadata", "readwrite");
        tx.objectStore("metadata").put({
          key: "activeDatasetPointer",
          value: {
            schemaVersion: "airburg_storage_v2",
            pointerId: "default",
            state: "corrupted_for_d2_audit",
            datasetId: "corrupted-dataset",
            migrationManifestId: "corrupted-manifest",
            activatedAt: "2026-06-22T00:00:00.000Z"
          }
        });
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        return true;
      } finally {
        db.close();
      }
    })()
  `, true);

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

const waitForStoreBoardFocus = async (client: CdpClient, stage: string): Promise<void> => {
  try {
    await client.waitForText("店铺表现与优先入口", 45000);
  } catch (error) {
    throw new Error(`${stage}:${error instanceof Error ? error.message : "store_board_focus_missing"}`);
  }
};

const staticDependencyChecks = (): { d1CompletionValid: boolean } => {
  const completion = JSON.parse(readText(D1_COMPLETION)) as {
    taskId?: string;
    status?: string;
    completionCommit?: string;
    commandResults?: Array<{ status?: string }>;
  };
  return {
    d1CompletionValid:
      completion.taskId === "V0.5D_1_STORE_CONTEXT_AND_MULTI_STORE_BOARD_RELAYOUT" &&
      completion.status === "complete" &&
      typeof completion.completionCommit === "string" &&
      completion.completionCommit.length > 0 &&
      completion.commandResults?.every((result) => result.status === "PASS") === true,
  };
};

const runRuntime = async (sensitiveValues: Set<string>): Promise<RuntimeEvidence> => {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");
  const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05d2-store-screenshots-"));
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

    const screenshots: Partial<ScreenshotEvidence> = {};

    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=tmall-default-store`);
    await waitForStoreBoardFocus(client, "desktop_default_store");
    const defaultStoreBoardWorks = await client.evaluate<boolean>(`
      document.body.innerText.includes("天猫默认店铺") &&
      document.body.innerText.includes("店铺主趋势") &&
      document.body.innerText.includes("商品表现") &&
      document.body.innerText.includes("店铺目标进度") &&
      document.querySelector("#store-board-platform-select") &&
      document.querySelector("#store-board-store-select") &&
      document.querySelectorAll('svg[aria-label="店铺主趋势图"]').length === 1
    `);
    const secondStoreKey = await getStoreOptionValueByLabel(client, "天猫第二店铺");
    const secondStoreId = secondStoreKey?.split(":")[1] ?? null;
    if (!secondStoreId) throw new Error("second_store_option_missing");
    screenshots.desktopDefaultStore = await capture(client, screenshotDir, "desktopDefaultStore", 1440, 1000, false);
    let defaultProductDrilldownSafe = false;
    let defaultSeriesDrilldownSafe = false;
    const defaultProductState = await queryDrilldownState(client);
    defaultProductDrilldownSafe = defaultProductState.defaultProductLink;
    await clickFocusTab(client, "系列进度");
    const defaultSeriesState = await queryDrilldownState(client);
    defaultSeriesDrilldownSafe = defaultSeriesState.defaultSeriesLink;
    await clickFocusTab(client, "商品表现");

    const dayPeriodWorks = await selectPeriod(client, "日");
    const weekPeriodWorks = await selectPeriod(client, "周");
    screenshots.desktopWeekView = await capture(client, screenshotDir, "desktopWeekView", 1440, 1000, false);
    const monthPeriodWorks = await selectPeriod(client, "月");
    screenshots.desktopMonthView = await capture(client, screenshotDir, "desktopMonthView", 1440, 1000, false);
    const customPeriodButtonWorks = await selectPeriod(client, "自定义");
    const customRangeSet = await setCustomDateRangeToSelectedDate(client);
    const customPeriodWorks = customPeriodButtonWorks && customRangeSet &&
      await client.evaluate<boolean>("!document.body.innerText.includes('起始日期不能晚于结束日期')");
    screenshots.desktopCustomView = await capture(client, screenshotDir, "desktopCustomView", 1440, 1000, false);
    const invalidRangeSet = await setInvalidCustomDateRange(client);
    await client.waitForText("起始日期不能晚于结束日期", 30000);
    const customInvalidRangeSafe = invalidRangeSet && await client.evaluate<boolean>(
      "document.body.innerText.includes('起始日期不能晚于结束日期') && !document.body.innerText.includes('NaN')",
    );
    await selectPeriod(client, "日");

    const storeSelectWorks = await setStoreSelectByLabel(client, "天猫第二店铺");
    await client.waitForExpression(`location.search.includes(${JSON.stringify(`storeId=${secondStoreId}`)})`, 30000);
    await client.waitForText("天猫第二店铺", 45000);
    const secondStoreBoardWorks = await client.evaluate<boolean>(`
      document.body.innerText.includes("天猫第二店铺") &&
      document.body.innerText.includes("多店铺店铺数据") &&
      !document.body.innerText.includes("旧版单店数据")
    `);
    screenshots.desktopSecondStore = await capture(client, screenshotDir, "desktopSecondStore", 1440, 1000, false);
    const refreshUrlBefore = await client.evaluate<string>("location.href");
    await client.send("Page.reload", { ignoreCache: true });
    await client.waitForExpression(`location.href === ${JSON.stringify(refreshUrlBefore)}`, 30000);
    await client.waitForText("天猫第二店铺", 45000);
    const refreshKeepsStore = await client.evaluate<boolean>("document.body.innerText.includes('天猫第二店铺')");
    await client.evaluate<void>("history.back()");
    await client.waitForText("天猫默认店铺", 30000);
    await client.evaluate<void>("history.forward()");
    await client.waitForText("天猫第二店铺", 30000);
    const historyNavigationWorks = await client.evaluate<boolean>(
      `location.search.includes(${JSON.stringify(`storeId=${secondStoreId}`)}) && document.body.innerText.includes("天猫第二店铺")`,
    );
    await clickFocusTab(client, "商品表现");
    screenshots.desktopProductTab = await capture(client, screenshotDir, "desktopProductTab", 1440, 1000, false);
    const nonDefaultProductState = await queryDrilldownState(client);
    await clickFocusTab(client, "系列进度");
    screenshots.desktopSeriesTab = await capture(client, screenshotDir, "desktopSeriesTab", 1440, 1000, false);
    const nonDefaultSeriesState = await queryDrilldownState(client);
    await clickFocusTab(client, "推广与售后");
    screenshots.desktopAdAfterSalesTab = await capture(client, screenshotDir, "desktopAdAfterSalesTab", 1440, 1000, false);
    const adAfterSalesState = await queryDrilldownState(client);
    const trendTabsWorkResult = await trendTabsWork(client);
    const focusTabsWorkResult = await focusTabsWork(client);
    const oneMainTrendChart = await client.evaluate<boolean>(
      "document.querySelectorAll('svg[aria-label=\"店铺主趋势图\"]').length === 1",
    );
    const mainRegionCountOk = await client.evaluate<boolean>(`
      document.querySelectorAll('main section, main [data-section]').length <= 8 &&
      document.querySelectorAll('svg[aria-label="店铺主趋势图"]').length === 1
    `);

    const targetClicked = await client.clickLinkByText("目标设置");
    if (targetClicked) {
      await client.waitForExpression("location.pathname === '/targets'", 30000);
      await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=${encodeURIComponent(secondStoreId)}`);
      await waitForStoreBoardFocus(client, "after_targets_return");
    }
    const uploadClicked = await client.clickLinkByText("数据导入");
    if (uploadClicked) {
      await client.waitForExpression("location.pathname === '/upload'", 30000);
      await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=${encodeURIComponent(secondStoreId)}`);
      await waitForStoreBoardFocus(client, "after_upload_return");
    }
    const targetAndUploadLinksWork = targetClicked && uploadClicked;

    await client.navigate(`${next.baseUrl}/home`);
    await waitForStoreBoardFocus(client, "home_store_performance");
    const homeSecondStoreLinkWorks = await client.evaluate<boolean>(`
      (() => {
        const row = [...document.querySelectorAll("tbody tr")]
          .find((item) => item.textContent?.includes("天猫第二店铺"));
        const link = row?.querySelector("a[href^='/store-board']");
        if (!link) return false;
        const href = link.getAttribute("href") ?? "";
        if (!href.includes(${JSON.stringify(`storeId=${secondStoreId}`)})) return false;
        link.click();
        return true;
      })()
    `);
    if (homeSecondStoreLinkWorks) {
      await client.waitForExpression(`location.pathname === '/store-board' && location.search.includes(${JSON.stringify(`storeId=${secondStoreId}`)})`, 30000);
      await client.waitForText("天猫第二店铺", 45000);
    }
    screenshots.desktopHomeDrilldown = await capture(client, screenshotDir, "desktopHomeDrilldown", 1440, 1000, false);

    await client.setViewport(390, 844, true);
    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=tmall-default-store`);
    await waitForStoreBoardFocus(client, "mobile_default_store");
    screenshots.mobileDefaultStore = await capture(client, screenshotDir, "mobileDefaultStore", 390, 844, true);
    await client.evaluate<void>("document.querySelector('[aria-label=\"店铺核心指标\"]')?.scrollIntoView({ block: 'center' })");
    screenshots.mobileMetrics = await capture(client, screenshotDir, "mobileMetrics", 390, 844, true);
    await client.evaluate<void>("document.body.innerText.includes('店铺目标进度') && [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '商品表现')?.scrollIntoView({ block: 'center' })");
    screenshots.mobileTargetSummary = await capture(client, screenshotDir, "mobileTargetSummary", 390, 844, true);
    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=${encodeURIComponent(secondStoreId)}`);
    await waitForStoreBoardFocus(client, "mobile_second_store");
    screenshots.mobileSecondStore = await capture(client, screenshotDir, "mobileSecondStore", 390, 844, true);
    const mobileStoreSwitchWorked = await setStoreSelectByLabel(client, "天猫默认店铺");
    await client.waitForText("天猫默认店铺", 30000);
    screenshots.mobileStoreSwitch = await capture(client, screenshotDir, "mobileStoreSwitch", 390, 844, true);
    await client.evaluate<void>("document.querySelector('svg[aria-label=\"店铺主趋势图\"]')?.scrollIntoView({ block: 'center' })");
    screenshots.mobileTrend = await capture(client, screenshotDir, "mobileTrend", 390, 844, true);
    await clickFocusTab(client, "商品表现");
    screenshots.mobileProductTab = await capture(client, screenshotDir, "mobileProductTab", 390, 844, true);
    await clickFocusTab(client, "系列进度");
    screenshots.mobileSeriesTab = await capture(client, screenshotDir, "mobileSeriesTab", 390, 844, true);
    await clickFocusTab(client, "推广与售后");
    screenshots.mobileAdAfterSalesTab = await capture(client, screenshotDir, "mobileAdAfterSalesTab", 390, 844, true);
    const mobile390NoOverflow = await noWholePageOverflow(client);
    await client.clearViewport();

    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=missing-store`);
    await client.waitForText("当前店铺不可用", 45000);
    const invalidStoreSafe = await client.evaluate<boolean>(
      "document.body.innerText.includes('未找到当前店铺的数据') && !document.body.innerText.includes('天猫默认店铺') && !document.body.innerText.includes('Error:')",
    );
    screenshots.desktopInvalidStore = await capture(client, screenshotDir, "desktopInvalidStore", 1440, 1000, false);

    const corruptedInjected = await corruptAuditPointer(client);
    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=${encodeURIComponent(secondStoreId)}`);
    await client.waitForText("本地店铺数据不可安全读取", 45000);
    const corruptedStateSafe = corruptedInjected && await client.evaluate<boolean>(
      "!document.body.innerText.includes('天猫默认店铺') && !document.body.innerText.includes('Error:') && document.body.innerText.includes('查看数据质量')",
    );
    screenshots.desktopCorruptedState = await capture(client, screenshotDir, "desktopCorruptedState", 1440, 1000, false);

    const validSafety = await bodyIsSafe(client, sensitiveValues);

    await deleteAuditDatabase(client);
    await client.navigate(`${next.baseUrl}/store-board?platform=tmall&storeId=tmall-default-store`);
    await client.waitForText("旧版单店数据", 45000);
    screenshots.desktopLegacyFallback = await capture(client, screenshotDir, "desktopLegacyFallback", 1440, 1000, false);
    await client.setViewport(390, 844, true);
    screenshots.mobileLegacyFallback = await capture(client, screenshotDir, "mobileLegacyFallback", 390, 844, true);
    await client.clearViewport();
    const legacyFallbackWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('旧版单店数据') && document.body.innerText.includes('天猫默认店铺')",
    );

    await deleteAuditDatabase(client);
    await client.evaluate<void>(`
      localStorage.removeItem("airburg_tmall_analysis_v2");
      localStorage.removeItem("airburg_tmall_targets_v1");
      localStorage.removeItem("airburg_tmall_series_groups_v1");
    `);
    await client.navigate(`${next.baseUrl}/store-board`);
    await client.waitForText("当前没有店铺数据", 45000);
    screenshots.desktopEmptyState = await capture(client, screenshotDir, "desktopEmptyState", 1440, 1000, false);
    const emptyStateWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('数据导入') && !document.body.innerText.includes('Error:')",
    );

    const cleanup = await deleteAuditDatabase(client);
    const completedScreenshots = {
      ...(screenshots as Omit<ScreenshotEvidence, "manifestPath">),
      manifestPath: path.join(screenshotDir, "manifest.json"),
    };
    const screenshotManifest = {
      taskId: "V0.5D_2_STORE_BOARD_VISUAL_RUNTIME_AND_DRILLDOWN_CLOSURE",
      databaseName: DATABASE_NAME,
      screenshots: Object.entries(completedScreenshots)
        .filter(([key]) => key !== "manifestPath")
        .map(([key, filePath]) => ({
          key,
          filePath,
          viewport: key.startsWith("mobile") ? "390x844" : "1440x1000",
          sha256: sha256File(filePath),
        })),
    };
    fs.writeFileSync(completedScreenshots.manifestPath, JSON.stringify(screenshotManifest, null, 2));
    const noBusinessConsoleIssues = client.consoleMessages.every((message) =>
      message.includes("favicon.ico") || message.includes("Download the React DevTools"),
    );

    return {
      selectedFileCount: Math.min(selectedFileCount, selectedAgain),
      firstImportSuccess,
      secondImportSuccess,
      homeSecondStoreLinkWorks,
      defaultStoreBoardWorks,
      secondStoreBoardWorks,
      storeSelectWorks,
      dayPeriodWorks,
      weekPeriodWorks,
      monthPeriodWorks,
      customPeriodWorks,
      customInvalidRangeSafe,
      trendTabsWork: trendTabsWorkResult,
      focusTabsWork: focusTabsWorkResult,
      defaultProductDrilldownSafe,
      defaultSeriesDrilldownSafe,
      nonDefaultProductDrilldownDisabled: nonDefaultProductState.nonDefaultProductDisabled,
      nonDefaultSeriesDrilldownDisabled: nonDefaultSeriesState.nonDefaultSeriesDisabled,
      nonDefaultQualityHrefWorks: adAfterSalesState.qualityHrefHasStore,
      refreshKeepsStore,
      historyNavigationWorks,
      mobileStoreSwitchWorks: mobileStoreSwitchWorked,
      oneMainTrendChart,
      mainRegionCountOk,
      targetAndUploadLinksWork,
      invalidStoreSafe,
      corruptedStateSafe,
      legacyFallbackWorks,
      emptyStateWorks,
      mobile390NoOverflow,
      noBusinessConsoleIssues,
      privacyPass: validSafety.privacyPass,
      numberSafetyPass: validSafety.numberSafetyPass,
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
    d1CompletionValid: staticChecks.d1CompletionValid,
    realBrowserSelectedFourFiles: runtime?.selectedFileCount === 4,
    firstImportSuccess: runtime?.firstImportSuccess === true,
    secondImportSuccess: runtime?.secondImportSuccess === true,
    defaultStoreBoardWorks: runtime?.defaultStoreBoardWorks === true,
    secondStoreBoardWorks: runtime?.secondStoreBoardWorks === true,
    homeSecondStoreLinkWorks: runtime?.homeSecondStoreLinkWorks === true,
    storeSelectWorks: runtime?.storeSelectWorks === true,
    refreshKeepsStore: runtime?.refreshKeepsStore === true,
    historyNavigationWorks: runtime?.historyNavigationWorks === true,
    datePeriodsWork:
      runtime?.dayPeriodWorks === true &&
      runtime?.weekPeriodWorks === true &&
      runtime?.monthPeriodWorks === true &&
      runtime?.customPeriodWorks === true &&
      runtime?.customInvalidRangeSafe === true,
    trendTabsWork: runtime?.trendTabsWork === true,
    focusTabsWork: runtime?.focusTabsWork === true,
    defaultProductDrilldownSafe: runtime?.defaultProductDrilldownSafe === true,
    defaultSeriesDrilldownSafe: runtime?.defaultSeriesDrilldownSafe === true,
    nonDefaultProductDrilldownDisabled: runtime?.nonDefaultProductDrilldownDisabled === true,
    nonDefaultSeriesDrilldownDisabled: runtime?.nonDefaultSeriesDrilldownDisabled === true,
    nonDefaultQualityHrefWorks: runtime?.nonDefaultQualityHrefWorks === true,
    oneMainTrendChart: runtime?.oneMainTrendChart === true,
    mainRegionCountOk: runtime?.mainRegionCountOk === true,
    targetAndUploadLinksWork: runtime?.targetAndUploadLinksWork === true,
    invalidStoreSafe: runtime?.invalidStoreSafe === true,
    corruptedStateSafe: runtime?.corruptedStateSafe === true,
    legacyFallbackWorks: runtime?.legacyFallbackWorks === true,
    emptyStateWorks: runtime?.emptyStateWorks === true,
    mobileStoreSwitchWorks: runtime?.mobileStoreSwitchWorks === true,
    mobile390NoOverflow: runtime?.mobile390NoOverflow === true,
    noBusinessConsoleIssues: runtime?.noBusinessConsoleIssues === true,
    privacyPass: runtime?.privacyPass === true,
    numberSafetyPass: runtime?.numberSafetyPass === true,
    screenshotsExist: screenshotPaths.length >= 22 && screenshotPaths.every((filePath) => fs.existsSync(filePath)),
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted === true,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched === true,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05d2-store-board-visual-usability",
    databaseName: DATABASE_NAME,
    fileSelectionMethod: "DOM.setFileInputFiles",
    failedChecks,
    runtimeError,
    screenshotManifestPath: runtime?.screenshots.manifestPath ?? null,
    screenshotPaths,
    privacyPass: runtime?.privacyPass ?? false,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    mobile390NoOverflow: runtime?.mobile390NoOverflow ?? false,
    defaultStoreBoardWorks: runtime?.defaultStoreBoardWorks ?? false,
    secondStoreBoardWorks: runtime?.secondStoreBoardWorks ?? false,
    homeSecondStoreLinkWorks: runtime?.homeSecondStoreLinkWorks ?? false,
    focusTabsWork: runtime?.focusTabsWork ?? false,
    defaultProductDrilldownSafe: runtime?.defaultProductDrilldownSafe ?? false,
    nonDefaultProductDrilldownDisabled: runtime?.nonDefaultProductDrilldownDisabled ?? false,
    corruptedStateSafe: runtime?.corruptedStateSafe ?? false,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05d2-store-board-visual-usability",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
