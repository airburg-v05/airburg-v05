import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const TASK_ID = "V0.5B_4_1_HISTORY_READONLY_BOUNDARY_AND_RUNTIME_EVIDENCE_CLOSURE";
const DATABASE_NAME = "airburg-v05-b41-audit";
const PRODUCTION_DATABASE_NAME = "airburg-v05";

const SAMPLE_FILES = [
  "private-samples/tmall/business-product/【生意参谋平台】商品_全部_2026-06-18_2026-06-18.xls",
  "private-samples/tmall/ad-product/商品报表_20260619_110309.csv",
  "private-samples/tmall/ad-plan/计划报表_20260619_110330.csv",
  "private-samples/tmall/after-sales/当日售后退货表.xlsx",
] as const;

const AFTER_SALES_SAMPLE = SAMPLE_FILES[3];

const HISTORY_CLIENT = "components/upload/import-history/import-history-client.tsx";
const QUALITY_CLIENT = "components/upload/data-quality/data-quality-client.tsx";

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

const FORBIDDEN_TEXT_TOKENS = [
  "rawRows",
  "previewRows",
  "fileName",
  "warning 原文",
  ...SENSITIVE_FIELD_NAMES,
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

interface RuntimeEvidence {
  fileSelectionMethod: "DOM.setFileInputFiles";
  selectedFileCount: number;
  importButtonClicked: boolean;
  importStatus: string;
  historyBatchVisibleCount: number;
  drawerHasReimport: boolean;
  drawerHasQualityLink: boolean;
  qualityContextPass: boolean;
  qualityHasReimport: boolean;
  reimportReturnedToUpload: boolean;
  storePreselected: boolean;
  autoSubmitPrevented: boolean;
  mobileOverflowPass: boolean;
  escapeCloseAndFocusReturn: boolean;
  privacyPass: boolean;
  numberSafetyPass: boolean;
  auditDatabaseDeleted: boolean;
  tempProfileDeleted: boolean;
  productionDatabaseUntouched: boolean;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const readText = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

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

  constructor(webSocketDebuggerUrl: string) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onmessage = (event) => {
        const response = JSON.parse(String(event.data)) as CdpResponse;
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
    if (!arrived) {
      const currentPath = await this.evaluate<string>(`
        location.origin + location.pathname + (location.search ? "?query" : "")
      `).catch(() => "unknown");
      throw new Error(`navigation_url_timeout:${currentPath}`);
    }
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

  async clickLinkByText(text: string): Promise<boolean> {
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05b41-chrome-"));
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

const deleteAuditDatabase = async (client: CdpClient): Promise<{ deleted: boolean; productionUntouched: boolean }> => {
  const result = await client.evaluate<{ deleted: boolean; productionUntouched: boolean }>(`
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
        deleted: deleteResult === true && !names.some((name) => String(name).startsWith(${JSON.stringify(DATABASE_NAME)})),
        productionUntouched: !names.includes(${JSON.stringify(PRODUCTION_DATABASE_NAME)}),
      };
    })()
  `, true);
  return result;
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

const staticSourceChecks = (): {
  historySourceReadonly: boolean;
  qualitySourceHasReimport: boolean;
  forbiddenBusinessDiff: boolean;
} => {
  const historySource = readText(HISTORY_CLIENT);
  const qualitySource = readText(QUALITY_CLIENT);
  const changedFiles = fs.existsSync(path.join(ROOT, ".git"))
    ? String(execFileSync("git", ["status", "--short"], { cwd: ROOT }))
        .split("\n")
        .map((line) => line.trim().replace(/^[MADRCU?! ]+\s+/, ""))
        .filter(Boolean)
    : [];
  const forbiddenPrefixes = [
    "lib/v05/import/",
    "lib/v05/import-history/",
    "lib/v05/data-quality/",
    "lib/v05/persistence/",
    "lib/v05/domain/",
    "lib/v05/migration/",
    "lib/storage/",
    "lib/tmall/",
    "app/(workspace)/home/",
    "app/(workspace)/store-board/",
    "app/(workspace)/series-board/",
    "app/(workspace)/product-board/",
    "package.json",
    "private-samples/",
  ];
  return {
    historySourceReadonly:
      !historySource.includes("重新导入") &&
      !historySource.includes("dataCenterReimportHref"),
    qualitySourceHasReimport:
      qualitySource.includes("重新导入") &&
      qualitySource.includes("dataCenterReimportHref"),
    forbiddenBusinessDiff: changedFiles.some((file) =>
      forbiddenPrefixes.some((prefix) => file.startsWith(prefix) || file === prefix),
    ),
  };
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
  let auditDeleted = false;
  let productionUntouched = false;
  try {
    const launched = await launchChrome(chromePath, next.baseUrl);
    client = launched.client;
    chromeProcess = launched.process;
    profileDir = launched.userDataDir;

    await client.navigate(`${next.baseUrl}/login`);
    const loginClicked = await client.clickButtonByText("进入工作台");
    if (!loginClicked) throw new Error("login_button_missing");
    await client.waitFor(() => location.pathname === "/home", 30000);

    await client.navigate(`${next.baseUrl}/upload`);
    const cleanStart = await deleteAuditDatabase(client);
    if (!cleanStart.productionUntouched) throw new Error("production_database_present_before_audit");

    const selectedFileCount = await setFileInputFiles(client);
    await client.waitForText("四类报表已完整识别，可以点击导入。", 45000);

    const importButtonClicked = await client.clickButtonByText("导入");
    if (!importButtonClicked) throw new Error("import_button_missing");
    await client.waitForText("导入状态", 120000);
    await client.waitForText("success", 120000);

    const historyHref = await client.evaluate<string | null>(`
      (() => {
        const link = [...document.querySelectorAll("a")]
          .find((item) => item.textContent?.trim() === "查看导入记录" && item.href.includes("/upload/history"));
        return link ? link.href : null;
      })()
    `);
    if (!historyHref) throw new Error("history_link_missing_after_import");

    const importedContext = new URL(historyHref);
    const importedStoreId = importedContext.searchParams.get("storeId");
    const importedBatchId = importedContext.searchParams.get("batchId");
    if (!importedStoreId || !importedBatchId) throw new Error("import_context_missing");

    const clickedHistory = await client.clickLinkByText("查看导入记录");
    if (!clickedHistory) throw new Error("history_click_failed");
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
    await client.waitFor(() => !document.querySelector('[role="dialog"]'), 30000);
    const escapeCloseAndFocusReturn = await client.evaluate<boolean>(`
      document.activeElement?.textContent?.trim() === "查看详情"
    `);

    const detailClickedAgain = await client.clickButtonByText("查看详情");
    if (!detailClickedAgain) throw new Error("history_detail_button_missing_after_escape");
    await client.waitForText("导入详情", 30000);
    const qualityClicked = await client.clickLinkByText("查看当前批次质量");
    if (!qualityClicked) throw new Error("quality_link_missing");
    await client.waitFor(() => location.pathname === "/upload/quality", 30000);
    await client.waitForText("质量问题列表", 30000);

    const qualityContextPass = await client.evaluate<boolean>(`
      (() => {
        const params = new URL(location.href).searchParams;
        return params.get("platform") === "tmall" &&
          params.get("storeId") === ${JSON.stringify(importedStoreId)} &&
          params.get("batchId") === ${JSON.stringify(importedBatchId)};
      })()
    `);
    const qualityText = await client.getBodyText();
    const qualityHasReimport = qualityText.includes("重新导入");

    const reimportClicked = await client.clickLinkByText("重新导入");
    if (!reimportClicked) throw new Error("quality_reimport_link_missing");
    await client.waitFor(() => location.pathname === "/upload", 30000);
    await client.waitForText("批量选择文件", 30000);
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
            params.get("storeId") === ${JSON.stringify(importedStoreId)} &&
            params.get("sourceBatchId") === ${JSON.stringify(importedBatchId)},
          storePreselected: document.querySelector("#v05-store-select")?.value === ${JSON.stringify(importedStoreId)},
          autoSubmitPrevented:
            (input?.files?.length ?? 0) === 0 &&
            !document.body.innerText.includes("导入中...") &&
            !document.body.innerText.includes("导入状态"),
        };
      })()
    `);

    const historyUrl = `${next.baseUrl}/upload/history?platform=tmall&storeId=${encodeURIComponent(importedStoreId)}&batchId=${encodeURIComponent(importedBatchId)}`;
    const qualityUrl = `${next.baseUrl}/upload/quality?platform=tmall&storeId=${encodeURIComponent(importedStoreId)}&batchId=${encodeURIComponent(importedBatchId)}`;
    const uploadUrl = `${next.baseUrl}/upload?mode=reimport&platform=tmall&storeId=${encodeURIComponent(importedStoreId)}&sourceBatchId=${encodeURIComponent(importedBatchId)}`;
    const mobileOverflowPass = (
      await noWholePageOverflow(client, historyUrl)
    ) && (
      await noWholePageOverflow(client, qualityUrl)
    ) && (
      await noWholePageOverflow(client, uploadUrl)
    );

    const historyText = await client.getBodyText();
    await client.navigate(qualityUrl);
    const qualityTextForPrivacy = await client.getBodyText();
    const uploadTextForPrivacy = await client.navigate(uploadUrl).then(() => client!.getBodyText());
    const checkedText = [historyText, qualityTextForPrivacy, uploadTextForPrivacy].join("\n");
    const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => checkedText.includes(value)).length;
    const leakedFileNameCount = SAMPLE_FILES
      .map((relativePath) => path.basename(relativePath))
      .filter((fileName) => historyText.includes(fileName) || qualityTextForPrivacy.includes(fileName))
      .length;
    const privacyPass =
      leakedSensitiveValueCount === 0 &&
      leakedFileNameCount === 0 &&
      !FORBIDDEN_TEXT_TOKENS.some((token) => checkedText.includes(token));
    const numberSafetyPass = !containsInvalidNumberText(checkedText);

    const cleanup = await deleteAuditDatabase(client);
    auditDeleted = cleanup.deleted;
    productionUntouched = cleanup.productionUntouched;

    return {
      fileSelectionMethod: "DOM.setFileInputFiles",
      selectedFileCount,
      importButtonClicked,
      importStatus: "success",
      historyBatchVisibleCount,
      drawerHasReimport,
      drawerHasQualityLink,
      qualityContextPass,
      qualityHasReimport,
      reimportReturnedToUpload: uploadContext.reimportReturnedToUpload,
      storePreselected: uploadContext.storePreselected,
      autoSubmitPrevented: uploadContext.autoSubmitPrevented,
      mobileOverflowPass,
      escapeCloseAndFocusReturn,
      privacyPass,
      numberSafetyPass,
      auditDatabaseDeleted: auditDeleted,
      tempProfileDeleted: false,
      productionDatabaseUntouched: productionUntouched,
    };
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

  const checks = {
    b4CompletionRecordStillExists: fs.existsSync(
      path.join(ROOT, "docs/project/task-completions/V0.5B_4_DATA_CENTER_NAVIGATION_AND_USABILITY_CLOSURE.json"),
    ),
    historySourceReadonly: staticChecks.historySourceReadonly,
    qualitySourceHasReimport: staticChecks.qualitySourceHasReimport,
    b2B3BusinessDiffUnchanged: !staticChecks.forbiddenBusinessDiff,
    realBrowserSelectedFiles: runtime?.selectedFileCount === 4,
    realBrowserClickedImport: runtime?.importButtonClicked === true,
    realImportSuccess: runtime?.importStatus === "success",
    historyBatchShownOnce: runtime?.historyBatchVisibleCount === 1,
    drawerReadonly: runtime?.drawerHasReimport === false && runtime?.drawerHasQualityLink === true,
    qualityContextPreserved: runtime?.qualityContextPass === true,
    qualityReimportEntryExists: runtime?.qualityHasReimport === true,
    reimportReturnsToUpload: runtime?.reimportReturnedToUpload === true,
    platformStorePreselected: runtime?.storePreselected === true,
    noAutoSubmit: runtime?.autoSubmitPrevented === true,
    mobile390NoWholePageOverflow: runtime?.mobileOverflowPass === true,
    escapeClosesDrawerAndReturnsFocus: runtime?.escapeCloseAndFocusReturn === true,
    privacyPass: runtime?.privacyPass === true,
    numberSafetyPass: runtime?.numberSafetyPass === true,
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
    selectedFileCount: runtime?.selectedFileCount ?? 0,
    historyBatchVisibleCount: runtime?.historyBatchVisibleCount ?? 0,
    drawerHasReimport: runtime?.drawerHasReimport ?? null,
    drawerHasQualityLink: runtime?.drawerHasQualityLink ?? null,
    qualityHasReimport: runtime?.qualityHasReimport ?? null,
    qualityContextPreserved: runtime?.qualityContextPass ?? null,
    reimportReturnedToUpload: runtime?.reimportReturnedToUpload ?? null,
    storePreselected: runtime?.storePreselected ?? null,
    noAutoSubmit: runtime?.autoSubmitPrevented ?? null,
    mobile390NoWholePageOverflow: runtime?.mobileOverflowPass ?? null,
    privacyPass: runtime?.privacyPass ?? false,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted ?? false,
    tempProfileDeleted,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched ?? false,
    sensitiveSourceValueCount: sensitiveValues.size,
    checks,
    runtimeError,
  };

  console.log(JSON.stringify(output, null, 2));
  if (status !== "PASS") process.exitCode = 1;
};

main().catch((error) => {
  console.log(JSON.stringify({
    status: "FAIL",
    taskId: TASK_ID,
    errorCode: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
