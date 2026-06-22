import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const TASK_ID = "V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE";
const DATABASE_NAME = "airburg-v05-b5-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";
const LEGACY_ANALYSIS_KEY = "airburg_tmall_analysis_v2";

const SAMPLE_FILES = [
  "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  "private-samples/tmall/after-sales/当日售后退货表.xlsx",
] as const;

const AFTER_SALES_SAMPLE = SAMPLE_FILES[3];

const SENSITIVE_FIELD_NAMES = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "操作人",
] as const;

const FORBIDDEN_PERSISTED_TOKENS = [
  "rawRows",
  "previewRows",
  "rawContent",
  "fileName",
  "warning 原文",
  "原始 warning",
  ...SENSITIVE_FIELD_NAMES,
] as const;

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

type CheckMap = Record<string, boolean>;

interface CdpResponse {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: {
    root?: { nodeId: number };
    nodeId?: number;
    result?: {
      type?: string;
      value?: unknown;
    };
  };
  error?: {
    message?: string;
  };
  exceptionDetails?: unknown;
}

interface ChromeTarget {
  type?: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface AuditState {
  activeDatasetId: string | null;
  metadataCount: number;
  journalCount: number;
  stores: Array<{ platformCode: string; storeId: string; storeName: string }>;
  importBatches: Array<{ platformCode: string; storeId: string; importBatchId: string }>;
  recordCounts: Record<string, number>;
  sharedProductIdCount: number;
  sharedPlanIdCount: number;
  serialized: string;
}

interface RuntimeEvidence {
  fileSelectionMethod: "DOM.setFileInputFiles";
  selectedFileCount: number;
  defaultImportStatus: string;
  secondImportStatus: string;
  duplicateStatus: string;
  conflictStatus: string;
  reimportStatus: string;
  defaultBatchId: string | null;
  secondBatchId: string | null;
  reimportBatchId: string | null;
  defaultStoreId: string | null;
  secondStoreId: string | null;
  historyBatchVisibleCount: number;
  drawerHasReimport: boolean;
  drawerHasQualityLink: boolean;
  qualityContextPass: boolean;
  qualityHasReimport: boolean;
  reimportReturnedToUpload: boolean;
  storePreselected: boolean;
  autoSubmitPrevented: boolean;
  safeReimportCreatedNewBatch: boolean;
  activePointerProtectedAfterDuplicate: boolean;
  activePointerProtectedAfterConflict: boolean;
  duplicateDidNotIncreaseBatches: boolean;
  duplicateDidNotIncreaseJournal: boolean;
  conflictDidNotIncreaseBatches: boolean;
  legacySavedForDefaultStore: boolean;
  secondStoreDidNotRewriteLegacy: boolean;
  conflictDidNotRewriteLegacy: boolean;
  activeDatasetHasTwoStores: boolean;
  sharedProductIdIsolated: boolean;
  sharedPlanIdIsolated: boolean;
  navigationPass: boolean;
  invalidParamsSafe: boolean;
  otherPagesPass: boolean;
  mobileOverflowPass: boolean;
  escapeCloseAndFocusReturn: boolean;
  privacyPass: boolean;
  numberSafetyPass: boolean;
  browserConsoleBusinessIssues: string[];
  auditDatabaseDeleted: boolean;
  tempProfileDeleted: boolean;
  productionDatabaseUntouched: boolean;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const createSampleFile = (relativePath: string): File => {
  const absolutePath = path.join(ROOT, relativePath);
  const buffer = fs.readFileSync(absolutePath);
  return new File([new Uint8Array(buffer)], path.basename(absolutePath));
};

const normalizeLeafValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const isCheckableSensitiveValue = (value: string): boolean => {
  const placeholders = new Set(["-", "--", "无", "暂无", "空", "null", "NULL", "0"]);
  return value.length >= 4 && !placeholders.has(value);
};

const collectSensitiveSourceValues = async (): Promise<Set<string>> => {
  const table = await parseTmallTableFile(createSampleFile(AFTER_SALES_SAMPLE));
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((header) => {
      const value = normalizeLeafValue(row[header]);
      if (value && isCheckableSensitiveValue(value)) values.add(value);
    });
  });
  return values;
};

const containsInvalidNumberText = (text: string): boolean =>
  /\bNaN\b|\bInfinity\b|\bundefined\b/.test(text);

const findChrome = (): string | null =>
  chromeCandidates.find((candidate) => fs.existsSync(candidate)) ?? null;

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

const stopProcess = async (child: ChildProcess | null): Promise<void> => {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5000),
  ]);
  if (!child.killed) child.kill("SIGKILL");
};

const startNextDev = async (): Promise<{
  baseUrl: string;
  process: ChildProcess;
  restoreNextEnv: () => void;
}> => {
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
  private socket: WebSocket;
  private commandId = 0;
  private pending = new Map<number, (response: CdpResponse) => void>();
  readonly browserIssues: string[] = [];

  constructor(webSocketDebuggerUrl: string) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onmessage = (event) => {
        const response = JSON.parse(String(event.data)) as CdpResponse;
        if (response.id) {
          this.pending.get(response.id)?.(response);
          this.pending.delete(response.id);
          return;
        }
        this.captureBrowserIssue(response);
      };
      this.socket.onerror = () => reject(new Error("cdp_websocket_error"));
      this.socket.onopen = () => resolve();
    });
  }

  private captureBrowserIssue(event: CdpResponse): void {
    if (event.method === "Log.entryAdded") {
      const entry = event.params?.entry as { level?: string; text?: string; url?: string } | undefined;
      const level = entry?.level ?? "";
      const text = entry?.text ?? "";
      const url = entry?.url ?? "";
      if ((level === "error" || level === "warning") && !url.includes("favicon.ico")) {
        this.browserIssues.push(`${level}:${text.slice(0, 180)}`);
      }
    }
    if (event.method === "Runtime.consoleAPICalled") {
      const params = event.params as { type?: string; args?: Array<{ value?: unknown; description?: string }> } | undefined;
      const type = params?.type ?? "";
      if (type === "error" || type === "warning") {
        const text = params?.args?.map((arg) => String(arg.value ?? arg.description ?? "")).join(" ") ?? "";
        if (!text.includes("favicon.ico")) this.browserIssues.push(`${type}:${text.slice(0, 180)}`);
      }
    }
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
    await this.send("Log.enable");
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    const expected = new URL(url);
    const expectedOrigin = JSON.stringify(expected.origin);
    const expectedPathname = JSON.stringify(expected.pathname.replace(/\/$/, "") || "/");
    const expectedSearch = JSON.stringify(expected.search);
    const expression = `
      (() => {
        const pathname = location.pathname.replace(/\\/$/, "") || "/";
        return location.origin === ${expectedOrigin} &&
          pathname === ${expectedPathname} &&
          location.search === ${expectedSearch};
      })()
    `;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(expression).catch(() => false);
      if (ok) break;
      await delay(200);
    }
    const arrived = await this.evaluate<boolean>(expression).catch(() => false);
    if (!arrived) throw new Error("navigation_url_timeout");
    await this.waitFor(() => document.readyState === "complete", 30000);
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

  async waitFor(predicate: () => boolean, timeoutMs = 30000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const source = `(${predicate.toString()})()`;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(source).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error("wait_for_timeout");
  }

  async waitForText(text: string, timeoutMs = 30000): Promise<void> {
    const escaped = JSON.stringify(text);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate<boolean>(`document.body.innerText.includes(${escaped})`).catch(() => false);
      if (ok) return;
      await delay(200);
    }
    throw new Error(`text_timeout:${text}`);
  }

  async clickButtonByText(text: string): Promise<boolean> {
    return this.evaluate<boolean>(`
      (() => {
        const target = [...document.querySelectorAll("button")]
          .find((button) => button.textContent && button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled);
        if (!target) return false;
        target.click();
        return true;
      })()
    `);
  }

  async clickFirstLinkByText(text: string): Promise<boolean> {
    return this.evaluate<boolean>(`
      (() => {
        const target = [...document.querySelectorAll("a")]
          .find((link) => link.textContent && link.textContent.trim() === ${JSON.stringify(text)});
        if (!target) return false;
        target.click();
        return true;
      })()
    `);
  }

  async getBodyText(): Promise<string> {
    return this.evaluate<string>("document.body.innerText");
  }

  async close(): Promise<void> {
    this.socket.close();
  }
}

const launchChrome = async (chromePath: string, baseUrl: string): Promise<{
  client: CdpClient;
  process: ChildProcess;
  userDataDir: string;
}> => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05b5-chrome-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--window-size=1280,900",
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    `${baseUrl}/login`,
  ], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
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
      const deleteResult = await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      });
      const databases = "databases" in indexedDB ? await indexedDB.databases() : [];
      const names = databases.map((database) => database.name).filter(Boolean);
      return {
        deleted: deleteResult === true && !names.includes(${JSON.stringify(DATABASE_NAME)}),
        productionUntouched: !names.includes(${JSON.stringify(PRODUCTION_DATABASE_NAME)}),
      };
    })()
  `, true);

const setFileInputFiles = async (client: CdpClient, files: readonly string[] = SAMPLE_FILES): Promise<number> => {
  const documentResponse = await client.send("DOM.getDocument", { depth: 1 });
  const rootNodeId = documentResponse.result?.root?.nodeId;
  if (!rootNodeId) throw new Error("dom_root_missing");
  const queryResponse = await client.send("DOM.querySelector", {
    nodeId: rootNodeId,
    selector: "#v05-batch-file-input",
  });
  const nodeId = queryResponse.result?.nodeId;
  if (!nodeId) throw new Error("file_input_missing");
  const absoluteFiles = files.map((relativeOrAbsolutePath) =>
    path.isAbsolute(relativeOrAbsolutePath)
      ? relativeOrAbsolutePath
      : path.join(ROOT, relativeOrAbsolutePath),
  );
  await client.send("DOM.setFileInputFiles", { nodeId, files: absoluteFiles });
  await client.evaluate<void>(`
    (() => {
      const input = document.querySelector("#v05-batch-file-input");
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
  return client.evaluate<number>("document.querySelector('#v05-batch-file-input')?.files?.length ?? 0");
};

const setInputValue = async (client: CdpClient, selector: string, value: string): Promise<void> => {
  await client.evaluate<void>(`
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
};

const selectValue = async (client: CdpClient, selector: string, value: string): Promise<void> => {
  await client.evaluate<void>(`
    (() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!select) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, ${JSON.stringify(value)});
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()
  `);
};

const importCurrentSelection = async (client: CdpClient, expectedStatus: string, timeoutMs = 120000): Promise<void> => {
  const clicked = await client.clickButtonByText("导入");
  if (!clicked) throw new Error(`import_button_missing:${expectedStatus}`);
  await client.waitForText("导入状态", timeoutMs);
  await client.waitForText(expectedStatus, timeoutMs);
};

const clearSelection = async (client: CdpClient): Promise<void> => {
  const clicked = await client.clickButtonByText("清空选择");
  if (!clicked) throw new Error("clear_selection_missing");
  await delay(300);
};

const currentResultContext = async (client: CdpClient): Promise<{
  historyHref: string | null;
  qualityHref: string | null;
  storeId: string | null;
  batchId: string | null;
}> => {
  const links = await client.evaluate<{ historyHref: string | null; qualityHref: string | null }>(`
    (() => {
      const links = [...document.querySelectorAll("a")];
      return {
        historyHref: links.find((item) => item.textContent?.trim() === "查看导入记录" && item.href.includes("/upload/history"))?.href ?? null,
        qualityHref: links.find((item) => item.textContent?.trim() === "查看数据质量" && item.href.includes("/upload/quality"))?.href ?? null,
      };
    })()
  `);
  const url = links.historyHref ? new URL(links.historyHref) : null;
  return {
    ...links,
    storeId: url?.searchParams.get("storeId") ?? null,
    batchId: url?.searchParams.get("batchId") ?? null,
  };
};

const inspectAuditState = async (client: CdpClient): Promise<AuditState> =>
  client.evaluate<AuditState>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const getAll = (storeName) => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      const getMetadata = (key) => new Promise((resolve, reject) => {
        const tx = db.transaction("metadata", "readonly");
        const request = tx.objectStore("metadata").get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
      });
      const activePointer = await getMetadata("activeDatasetPointer");
      const activeDatasetId = activePointer?.datasetId ?? null;
      const metadata = await getAll("datasetMetadata");
      const journal = await getAll("activationJournal");
      const stores = (await getAll("stores")).filter((item) => item.datasetId === activeDatasetId).map((item) => item.value);
      const importBatches = (await getAll("importBatches")).filter((item) => item.datasetId === activeDatasetId).map((item) => item.value);
      const businessProductFacts = (await getAll("businessProductFacts")).filter((item) => item.datasetId === activeDatasetId).map((item) => item.value);
      const adPlanFacts = (await getAll("adPlanFacts")).filter((item) => item.datasetId === activeDatasetId).map((item) => item.value);
      const recordStores = [
        "platforms",
        "stores",
        "importBatches",
        "importFiles",
        "businessProductFacts",
        "adProductFacts",
        "adPlanFacts",
        "afterSalesDailyAggregates",
        "afterSalesRangeAggregates",
        "afterSalesOperationalSnapshots",
        "afterSalesDistributionItems",
        "series",
        "trackedProducts",
        "targets",
        "legacyTargetCandidates",
        "migrationManifests",
      ];
      const recordCounts = {};
      for (const storeName of recordStores) {
        recordCounts[storeName] = (await getAll(storeName)).filter((item) => item.datasetId === activeDatasetId).length;
      }
      const defaultProducts = new Set(businessProductFacts.filter((fact) => fact.storeId === "tmall-default-store").map((fact) => fact.productId));
      const secondProducts = new Set(businessProductFacts.filter((fact) => fact.storeId !== "tmall-default-store").map((fact) => fact.productId));
      const defaultPlans = new Set(adPlanFacts.filter((fact) => fact.storeId === "tmall-default-store").map((fact) => fact.planId));
      const secondPlans = new Set(adPlanFacts.filter((fact) => fact.storeId !== "tmall-default-store").map((fact) => fact.planId));
      const sharedProductIdCount = [...defaultProducts].filter((id) => secondProducts.has(id)).length;
      const sharedPlanIdCount = [...defaultPlans].filter((id) => secondPlans.has(id)).length;
      const serialized = JSON.stringify({ activePointer, metadata, journal, stores, importBatches, recordCounts });
      db.close();
      return {
        activeDatasetId,
        metadataCount: metadata.length,
        journalCount: journal.length,
        stores,
        importBatches,
        recordCounts,
        sharedProductIdCount,
        sharedPlanIdCount,
        serialized,
      };
    })()
  `, true);

const tamperActiveDatasetForConflict = async (
  client: CdpClient,
  storeId: string,
  importBatchId: string,
): Promise<boolean> =>
  client.evaluate<boolean>(`
    (async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(${JSON.stringify(DATABASE_NAME)});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(["metadata", "importBatches", "businessProductFacts"], "readwrite");
      const metadataStore = tx.objectStore("metadata");
      const pointerEntry = await new Promise((resolve, reject) => {
        const request = metadataStore.get("activeDatasetPointer");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const activeDatasetId = pointerEntry?.value?.datasetId;
      if (!activeDatasetId) return false;
      const batchStore = tx.objectStore("importBatches");
      const batches = await new Promise((resolve, reject) => {
        const request = batchStore.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      for (const envelope of batches) {
        if (envelope.datasetId === activeDatasetId &&
          envelope.value?.storeId === ${JSON.stringify(storeId)} &&
          envelope.value?.importBatchId === ${JSON.stringify(importBatchId)}) {
          batchStore.delete(envelope.id);
        }
      }
      const factStore = tx.objectStore("businessProductFacts");
      const facts = await new Promise((resolve, reject) => {
        const request = factStore.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      const target = facts.find((envelope) =>
        envelope.datasetId === activeDatasetId &&
        envelope.value?.storeId === ${JSON.stringify(storeId)} &&
        envelope.value?.importBatchId === ${JSON.stringify(importBatchId)} &&
        typeof envelope.value?.gmv === "number"
      );
      if (!target) return false;
      target.value = { ...target.value, gmv: target.value.gmv + 1 };
      factStore.put(target);
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return true;
    })()
  `, true);

const createReimportFiles = (): string[] => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05b5-reimport-files-"));
  const files = SAMPLE_FILES.map((relativePath) => {
    const source = path.join(ROOT, relativePath);
    const target = path.join(dir, path.basename(relativePath));
    fs.copyFileSync(source, target);
    return target;
  });
  const adProduct = files[1]!;
  fs.appendFileSync(adProduct, "\n");
  return files;
};

const noWholePageOverflow = async (client: CdpClient, url: string): Promise<boolean> => {
  await client.navigate(url);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(500);
  const ok = await client.evaluate<boolean>(`
    Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1
  `);
  await client.send("Emulation.clearDeviceMetricsOverride");
  return ok;
};

const staticSourceChecks = (): { pass: boolean; checks: CheckMap } => {
  const upload = readText("app/(workspace)/upload/page.tsx") + readText("components/upload/batch-import/tmall-batch-import-workbench.tsx");
  const history = readText("app/(workspace)/upload/history/page.tsx") + readText("components/upload/import-history/import-history-client.tsx");
  const quality = readText("app/(workspace)/upload/quality/page.tsx") + readText("components/upload/data-quality/data-quality-client.tsx");
  const changedFiles = String(execFileSync("git", ["status", "--short"], { cwd: ROOT }))
    .split("\n")
    .map((line) => line.trim().replace(/^[MADRCU?! ]+\s+/, ""))
    .filter(Boolean);
  const forbiddenPrefixes = [
    "app/",
    "components/",
    "lib/",
    "types/",
    "package.json",
    "package-lock.json",
    "private-samples/",
  ];
  const allowedPrefixes = [
    "docs/project/current-task.json",
    "docs/project/v0.5-lock.json",
    "docs/releases/v0.5b-data-center-freeze.md",
    "docs/project/task-authorizations/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
    "docs/project/task-completions/V0.5B_5_FINAL_REGRESSION_AND_STAGE_FREEZE.json",
    "scripts/private-audit/validate-v05b-final-browser-runtime.ts",
    "scripts/private-audit/validate-v05b-final-regression-and-freeze.ts",
  ];
  const checks = {
    uploadHasBatchImport: upload.includes("批量选择文件") && upload.includes("#v05-batch-file-input".slice(1)),
    uploadRemovedLegacyFourCards: !upload.includes("开始四源分析") && !upload.includes("当前版本仅进行本地数据分析"),
    historyReadonlySource: !history.includes("重新导入") && !history.includes("dataCenterReimportHref"),
    qualityHasReimportSource: quality.includes("重新导入") && quality.includes("dataCenterReimportHref"),
    noForbiddenBusinessDiff: !changedFiles.some((file) =>
      forbiddenPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)) &&
      !allowedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
    ),
    noInternalTaskCopy: ![upload, history, quality].join("\n").includes("V0.5B_"),
  };
  return { pass: Object.values(checks).every(Boolean), checks };
};

const pageSafe = async (client: CdpClient, url: string): Promise<boolean> => {
  await client.navigate(url);
  const text = await client.getBodyText();
  return !/(Application error|TypeError|ReferenceError|Unhandled Runtime Error|NaN|Infinity|undefined)/.test(text);
};

const runRuntime = async (sensitiveValues: Set<string>): Promise<RuntimeEvidence> => {
  const auditDatabaseName: string = DATABASE_NAME;
  const productionDatabaseName: string = PRODUCTION_DATABASE_NAME;
  if (auditDatabaseName === productionDatabaseName) throw new Error("audit_database_must_not_be_production");
  const chromePath = findChrome();
  if (!chromePath) throw new Error("chrome_not_found");

  const next = await startNextDev();
  let chromeProcess: ChildProcess | null = null;
  let profileDir = "";
  let client: CdpClient | null = null;
  const tempFileDirs: string[] = [];
  let stage = "runtime_start";
  try {
    try {
    const launched = await launchChrome(chromePath, next.baseUrl);
    client = launched.client;
    chromeProcess = launched.process;
    profileDir = launched.userDataDir;

    stage = "login";
    await client.navigate(`${next.baseUrl}/login`);
    const loginClicked = await client.clickButtonByText("进入工作台");
    if (!loginClicked) throw new Error("login_button_missing");
    await client.waitFor(() => location.pathname === "/home", 30000);

    stage = "default_upload_prepare";
    await client.navigate(`${next.baseUrl}/upload`);
    const cleanStart = await deleteAuditDatabase(client);
    if (!cleanStart.productionUntouched) throw new Error("production_database_present_before_audit");

    const platformState = await client.evaluate<{
      tmallEnabled: boolean;
      closedPlatformsDisabled: boolean;
      defaultStoreSelected: boolean;
    }>(`
      (() => {
        const buttons = [...document.querySelectorAll("button")];
        const buttonByText = (text) => buttons.find((button) => button.textContent?.includes(text));
        return {
          tmallEnabled: buttonByText("天猫")?.disabled === false,
          closedPlatformsDisabled: ["京东", "拼多多", "抖音", "有赞"].every((text) => buttonByText(text)?.disabled === true),
          defaultStoreSelected: document.querySelector("#v05-store-select")?.value === "tmall-default-store",
        };
      })()
    `);
    if (!platformState.tmallEnabled || !platformState.closedPlatformsDisabled || !platformState.defaultStoreSelected) {
      throw new Error("platform_or_default_store_state_invalid");
    }

    stage = "default_file_detection";
    const selectedFileCount = await setFileInputFiles(client);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    stage = "default_import";
    await importCurrentSelection(client, "success");
    const defaultContext = await currentResultContext(client);
    if (!defaultContext.historyHref || !defaultContext.storeId || !defaultContext.batchId) {
      throw new Error("default_import_context_missing");
    }
    const legacyAfterDefault = await client.evaluate<string | null>(`localStorage.getItem(${JSON.stringify(LEGACY_ANALYSIS_KEY)})`);
    const legacyHashAfterDefault = legacyAfterDefault ? sha256(legacyAfterDefault) : null;
    const stateAfterDefault = await inspectAuditState(client);

    stage = "second_store_add";
    await setInputValue(client, "#v05-new-store-name", "天猫测试二店");
    const addStoreClicked = await client.clickButtonByText("添加");
    if (!addStoreClicked) throw new Error("add_second_store_button_missing");
    await client.waitForText("新店铺已加入本次导入", 30000);
    const secondStoreId = await client.evaluate<string | null>("document.querySelector('#v05-store-select')?.value ?? null");
    if (!secondStoreId || secondStoreId === "tmall-default-store") throw new Error("second_store_not_selected");

    stage = "second_import";
    await clearSelection(client);
    await setFileInputFiles(client);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    await importCurrentSelection(client, "success");
    const secondContext = await currentResultContext(client);
    if (!secondContext.historyHref || !secondContext.storeId || !secondContext.batchId) {
      throw new Error("second_import_context_missing");
    }
    const legacyAfterSecond = await client.evaluate<string | null>(`localStorage.getItem(${JSON.stringify(LEGACY_ANALYSIS_KEY)})`);
    const legacyHashAfterSecond = legacyAfterSecond ? sha256(legacyAfterSecond) : null;
    const stateAfterSecond = await inspectAuditState(client);

    stage = "duplicate_import";
    await clearSelection(client);
    await setFileInputFiles(client);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    await importCurrentSelection(client, "already_imported");
    const stateAfterDuplicate = await inspectAuditState(client);

    stage = "history_page";
    const historyClicked = await client.clickFirstLinkByText("查看导入记录");
    if (!historyClicked) throw new Error("history_link_missing_after_duplicate");
    await client.waitFor(() => location.pathname === "/upload/history", 30000);
    await client.waitForText("导入记录列表", 30000);
    await client.waitFor(() => document.querySelectorAll("tbody tr").length === 1, 30000);
    const historyBatchVisibleCount = await client.evaluate<number>("document.querySelectorAll('tbody tr').length");
    const detailClicked = await client.clickButtonByText("查看详情");
    if (!detailClicked) throw new Error("history_detail_button_missing");
    await client.waitForText("导入详情", 30000);
    const drawerText = await client.evaluate<string>("document.querySelector('[role=\"dialog\"]')?.innerText ?? ''");
    const drawerHasReimport = drawerText.includes("重新导入");
    const drawerHasQualityLink = drawerText.includes("查看当前批次质量");

    stage = "history_drawer_escape";
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    const closedByNativeEscape = await client.evaluate<boolean>(`!document.querySelector('[role="dialog"]')`).catch(() => false);
    if (!closedByNativeEscape) {
      await client.evaluate<void>(`
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }));
      `);
    }
    await client.waitFor(() => !document.querySelector('[role="dialog"]'), 30000);
    const escapeCloseAndFocusReturn = await client.evaluate<boolean>(`
      document.activeElement?.textContent?.trim() === "查看详情"
    `);

    stage = "quality_page";
    const detailClickedAgain = await client.clickButtonByText("查看详情");
    if (!detailClickedAgain) throw new Error("history_detail_button_missing_after_escape");
    await client.waitForText("导入详情", 30000);
    const qualityClicked = await client.clickFirstLinkByText("查看当前批次质量");
    if (!qualityClicked) throw new Error("quality_link_missing");
    await client.waitFor(() => location.pathname === "/upload/quality", 30000);
    await client.waitForText("质量问题列表", 30000);
    const qualityContextPass = await client.evaluate<boolean>(`
      (() => {
        const params = new URL(location.href).searchParams;
        return params.get("platform") === "tmall" &&
          params.get("storeId") === ${JSON.stringify(secondContext.storeId)} &&
          params.get("batchId") === ${JSON.stringify(secondContext.batchId)};
      })()
    `);
    const qualityText = await client.getBodyText();
    const qualityHasReimport = qualityText.includes("重新导入");

    stage = "reimport_page";
    const reimportClicked = await client.clickFirstLinkByText("重新导入");
    if (!reimportClicked) throw new Error("quality_reimport_link_missing");
    await client.waitFor(() => location.pathname === "/upload", 30000);
    await client.waitForText("本次重新导入会创建新批次", 30000);
    const uploadContext = await client.evaluate<{
      reimportReturnedToUpload: boolean;
      storePreselected: boolean;
      autoSubmitPrevented: boolean;
    }>(`
      (() => {
        const params = new URL(location.href).searchParams;
        const input = document.querySelector("#v05-batch-file-input");
        return {
          reimportReturnedToUpload:
            params.get("mode") === "reimport" &&
            params.get("platform") === "tmall" &&
            params.get("storeId") === ${JSON.stringify(secondContext.storeId)} &&
            params.get("sourceBatchId") === ${JSON.stringify(secondContext.batchId)},
          storePreselected: document.querySelector("#v05-store-select")?.value === ${JSON.stringify(secondContext.storeId)},
          autoSubmitPrevented:
            (input?.files?.length ?? 0) === 0 &&
            !document.body.innerText.includes("导入中...") &&
            !document.body.innerText.includes("导入状态"),
        };
      })()
    `);
    const reimportFiles = createReimportFiles();
    tempFileDirs.push(path.dirname(reimportFiles[0]!));
    stage = "safe_reimport_import";
    await setFileInputFiles(client, reimportFiles);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    await importCurrentSelection(client, "success");
    const reimportContext = await currentResultContext(client);
    const stateAfterReimport = await inspectAuditState(client);

    stage = "conflict_precondition";
    const pointerBeforeConflict = stateAfterReimport.activeDatasetId;
    const legacyBeforeConflict = await client.evaluate<string | null>(`localStorage.getItem(${JSON.stringify(LEGACY_ANALYSIS_KEY)})`);
    const legacyHashBeforeConflict = legacyBeforeConflict ? sha256(legacyBeforeConflict) : null;
    if (!secondContext.storeId || !secondContext.batchId) throw new Error("conflict_context_missing");
    const tampered = await tamperActiveDatasetForConflict(client, secondContext.storeId, secondContext.batchId);
    if (!tampered) throw new Error("conflict_precondition_failed");
    stage = "conflict_import";
    await client.navigate(`${next.baseUrl}/upload?platform=tmall&storeId=${encodeURIComponent(secondContext.storeId)}`);
    await client.waitForText("批量选择文件", 30000);
    await selectValue(client, "#v05-store-select", secondContext.storeId);
    await setFileInputFiles(client);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);
    await importCurrentSelection(client, "conflict");
    const stateAfterConflict = await inspectAuditState(client);
    const legacyAfterConflict = await client.evaluate<string | null>(`localStorage.getItem(${JSON.stringify(LEGACY_ANALYSIS_KEY)})`);
    const legacyHashAfterConflict = legacyAfterConflict ? sha256(legacyAfterConflict) : null;

    stage = "invalid_params_navigation";
    const invalidParamsSafe = await pageSafe(
      client,
      `${next.baseUrl}/upload/history?platform=bad&storeId=../../bad&batchId=%3Cscript%3E`,
    ) && await pageSafe(
      client,
      `${next.baseUrl}/upload/quality?platform=bad&storeId=../../bad&batchId=%3Cscript%3E`,
    );

    stage = "data_center_navigation";
    const navigationPass = await (async () => {
      await client.navigate(`${next.baseUrl}/upload`);
      const uploadNav = (await client.getBodyText()).includes("数据导入");
      await client.navigate(`${next.baseUrl}/upload/history`);
      const historyNav = (await client.getBodyText()).includes("导入记录");
      await client.navigate(`${next.baseUrl}/upload/quality`);
      const qualityNav = (await client.getBodyText()).includes("数据质量");
      return uploadNav && historyNav && qualityNav;
    })();

    stage = "other_pages";
    const otherPages = [
      "/login",
      "/home",
      "/raw-data",
      "/targets",
      "/store-board",
      "/series-board",
      "/product-board",
    ];
    let otherPagesPass = true;
    for (const page of otherPages) {
      otherPagesPass = (await pageSafe(client, `${next.baseUrl}${page}`)) && otherPagesPass;
    }

    stage = "mobile_overflow";
    const mobileUrls = [
      `${next.baseUrl}/upload`,
      `${next.baseUrl}/upload/history?platform=tmall&storeId=${encodeURIComponent(secondContext.storeId ?? "")}&batchId=${encodeURIComponent(secondContext.batchId ?? "")}`,
      `${next.baseUrl}/upload/quality?platform=tmall&storeId=${encodeURIComponent(secondContext.storeId ?? "")}&batchId=${encodeURIComponent(secondContext.batchId ?? "")}`,
      `${next.baseUrl}/home`,
      `${next.baseUrl}/product-board`,
    ];
    let mobileOverflowPass = true;
    for (const url of mobileUrls) {
      mobileOverflowPass = (await noWholePageOverflow(client, url)) && mobileOverflowPass;
    }

    stage = "privacy_scan";
    const historyText = await client.navigate(`${next.baseUrl}/upload/history?platform=tmall&storeId=${encodeURIComponent(secondContext.storeId ?? "")}&batchId=${encodeURIComponent(secondContext.batchId ?? "")}`).then(() => client!.getBodyText());
    const qualityTextForPrivacy = await client.navigate(`${next.baseUrl}/upload/quality?platform=tmall&storeId=${encodeURIComponent(secondContext.storeId ?? "")}&batchId=${encodeURIComponent(secondContext.batchId ?? "")}`).then(() => client!.getBodyText());
    const persistedText = stateAfterConflict.serialized;
    const checkedText = [historyText, qualityTextForPrivacy, persistedText].join("\n");
    const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => checkedText.includes(value)).length;
    const leakedFileNameCount = SAMPLE_FILES
      .map((relativePath) => path.basename(relativePath))
      .filter((fileName) => historyText.includes(fileName) || qualityTextForPrivacy.includes(fileName) || persistedText.includes(fileName))
      .length;
    const privacyPass =
      leakedSensitiveValueCount === 0 &&
      leakedFileNameCount === 0 &&
      !FORBIDDEN_PERSISTED_TOKENS.some((token) => checkedText.includes(token));
    const numberSafetyPass = !containsInvalidNumberText(checkedText);

    stage = "cleanup";
    const cleanup = await deleteAuditDatabase(client);

    return {
      fileSelectionMethod: "DOM.setFileInputFiles",
      selectedFileCount,
      defaultImportStatus: "success",
      secondImportStatus: "success",
      duplicateStatus: "already_imported",
      conflictStatus: "conflict",
      reimportStatus: "success",
      defaultBatchId: defaultContext.batchId,
      secondBatchId: secondContext.batchId,
      reimportBatchId: reimportContext.batchId,
      defaultStoreId: defaultContext.storeId,
      secondStoreId: secondContext.storeId,
      historyBatchVisibleCount,
      drawerHasReimport,
      drawerHasQualityLink,
      qualityContextPass,
      qualityHasReimport,
      reimportReturnedToUpload: uploadContext.reimportReturnedToUpload,
      storePreselected: uploadContext.storePreselected,
      autoSubmitPrevented: uploadContext.autoSubmitPrevented,
      safeReimportCreatedNewBatch:
        reimportContext.batchId !== null &&
        reimportContext.batchId !== secondContext.batchId,
      activePointerProtectedAfterDuplicate:
        stateAfterDuplicate.activeDatasetId === stateAfterSecond.activeDatasetId,
      activePointerProtectedAfterConflict:
        stateAfterConflict.activeDatasetId === pointerBeforeConflict,
      duplicateDidNotIncreaseBatches:
        stateAfterDuplicate.importBatches.length === stateAfterSecond.importBatches.length,
      duplicateDidNotIncreaseJournal:
        stateAfterDuplicate.journalCount === stateAfterSecond.journalCount,
      conflictDidNotIncreaseBatches:
        stateAfterConflict.importBatches.length === stateAfterReimport.importBatches.length - 1,
      legacySavedForDefaultStore:
        !!legacyHashAfterDefault && stateAfterDefault.activeDatasetId !== null,
      secondStoreDidNotRewriteLegacy:
        legacyHashAfterDefault === legacyHashAfterSecond,
      conflictDidNotRewriteLegacy:
        legacyHashBeforeConflict === legacyHashAfterConflict,
      activeDatasetHasTwoStores:
        stateAfterSecond.stores.some((store) => store.storeId === "tmall-default-store") &&
        stateAfterSecond.stores.some((store) => store.storeId === secondContext.storeId),
      sharedProductIdIsolated: stateAfterSecond.sharedProductIdCount > 0,
      sharedPlanIdIsolated: stateAfterSecond.sharedPlanIdCount > 0,
      navigationPass,
      invalidParamsSafe,
      otherPagesPass,
      mobileOverflowPass,
      escapeCloseAndFocusReturn,
      privacyPass,
      numberSafetyPass,
      browserConsoleBusinessIssues: client.browserIssues,
      auditDatabaseDeleted: cleanup.deleted,
      tempProfileDeleted: false,
      productionDatabaseUntouched: cleanup.productionUntouched,
    };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_runtime_error";
      throw new Error(`${stage}:${message}`);
    }
  } finally {
    try {
      if (client) {
        await deleteAuditDatabase(client).catch(() => null);
        await client.close();
      }
    } finally {
      await stopProcess(chromeProcess);
      await stopProcess(next.process);
      next.restoreNextEnv();
      if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
      tempFileDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
    }
  }
};

const main = async () => {
  const staticChecks = staticSourceChecks();
  const sensitiveValues = await collectSensitiveSourceValues();
  let runtime: RuntimeEvidence | null = null;
  let runtimeError: string | null = null;
  let tempProfileDeleted = false;

  try {
    runtime = await runRuntime(sensitiveValues);
    tempProfileDeleted = true;
    runtime.tempProfileDeleted = true;
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : "runtime_validation_failed";
  }

  const checks: CheckMap = {
    staticSourceChecks: staticChecks.pass,
    realBrowserSelectedFiles: runtime?.selectedFileCount === 4,
    defaultStoreImportSuccess: runtime?.defaultImportStatus === "success",
    secondStoreImportSuccess: runtime?.secondImportStatus === "success",
    duplicateAlreadyImported: runtime?.duplicateStatus === "already_imported",
    conflictDetected: runtime?.conflictStatus === "conflict",
    safeReimportSuccess: runtime?.reimportStatus === "success",
    safeReimportCreatedNewBatch: runtime?.safeReimportCreatedNewBatch === true,
    historyBatchShownOnce: runtime?.historyBatchVisibleCount === 1,
    historyDrawerReadonly: runtime?.drawerHasReimport === false && runtime?.drawerHasQualityLink === true,
    qualityContextPreserved: runtime?.qualityContextPass === true,
    qualityHasReimport: runtime?.qualityHasReimport === true,
    reimportReturnsToUpload: runtime?.reimportReturnedToUpload === true,
    reimportPreselectsStore: runtime?.storePreselected === true,
    reimportDoesNotAutoSubmit: runtime?.autoSubmitPrevented === true,
    activePointerProtectedAfterDuplicate: runtime?.activePointerProtectedAfterDuplicate === true,
    activePointerProtectedAfterConflict: runtime?.activePointerProtectedAfterConflict === true,
    duplicateDidNotIncreaseBatches: runtime?.duplicateDidNotIncreaseBatches === true,
    duplicateDidNotIncreaseJournal: runtime?.duplicateDidNotIncreaseJournal === true,
    conflictDidNotIncreaseBatches: runtime?.conflictDidNotIncreaseBatches === true,
    defaultLegacyCompatibilitySaved: runtime?.legacySavedForDefaultStore === true,
    secondStoreDoesNotRewriteLegacy: runtime?.secondStoreDidNotRewriteLegacy === true,
    conflictDoesNotRewriteLegacy: runtime?.conflictDidNotRewriteLegacy === true,
    activeDatasetHasTwoStores: runtime?.activeDatasetHasTwoStores === true,
    sharedProductIdIsolated: runtime?.sharedProductIdIsolated === true,
    sharedPlanIdIsolated: runtime?.sharedPlanIdIsolated === true,
    dataCenterNavigationPass: runtime?.navigationPass === true,
    invalidParamsSafe: runtime?.invalidParamsSafe === true,
    otherPagesPass: runtime?.otherPagesPass === true,
    mobile390NoWholePageOverflow: runtime?.mobileOverflowPass === true,
    escapeClosesDrawerAndReturnsFocus: runtime?.escapeCloseAndFocusReturn === true,
    privacyPass: runtime?.privacyPass === true,
    numberSafetyPass: runtime?.numberSafetyPass === true,
    consoleNoBusinessIssues: (runtime?.browserConsoleBusinessIssues.length ?? 1) === 0,
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted === true,
    tempProfileDeleted,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched === true,
  };

  const status = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
  const output = {
    status,
    taskId: TASK_ID,
    databaseName: DATABASE_NAME,
    fileSelectionMethod: runtime?.fileSelectionMethod ?? "DOM.setFileInputFiles",
    defaultImportStatus: runtime?.defaultImportStatus ?? null,
    secondImportStatus: runtime?.secondImportStatus ?? null,
    duplicateStatus: runtime?.duplicateStatus ?? null,
    conflictStatus: runtime?.conflictStatus ?? null,
    reimportStatus: runtime?.reimportStatus ?? null,
    defaultBatchIdPresent: !!runtime?.defaultBatchId,
    secondBatchIdPresent: !!runtime?.secondBatchId,
    reimportBatchIdPresent: !!runtime?.reimportBatchId,
    defaultStoreId: runtime?.defaultStoreId ?? null,
    secondStoreIdPresent: !!runtime?.secondStoreId,
    historyBatchVisibleCount: runtime?.historyBatchVisibleCount ?? 0,
    safeReimportCreatedNewBatch: runtime?.safeReimportCreatedNewBatch ?? false,
    activePointerProtectedAfterDuplicate: runtime?.activePointerProtectedAfterDuplicate ?? false,
    activePointerProtectedAfterConflict: runtime?.activePointerProtectedAfterConflict ?? false,
    privacyPass: runtime?.privacyPass ?? false,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    sensitiveSourceValueCount: sensitiveValues.size,
    browserConsoleBusinessIssues: runtime?.browserConsoleBusinessIssues ?? [],
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted ?? false,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched ?? false,
    staticChecks: staticChecks.checks,
    checks,
    runtimeError,
  };

  console.log(JSON.stringify(output, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

void main().then(() => {
  process.exit(process.exitCode ?? 0);
}).catch((error) => {
  console.log(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    errorCode: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exit(1);
});
