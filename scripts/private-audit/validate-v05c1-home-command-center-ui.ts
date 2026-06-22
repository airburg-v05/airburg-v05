import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseTmallTableFile } from "../../lib/tmall/parsers/table-parser";

const ROOT = process.cwd();
const DATABASE_NAME = "airburg-v05-c1-audit";
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

const INTERNAL_TERMS = [
  "V2 staging",
  "active pointer",
  "readback",
  "legacy adapter",
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

interface RuntimeEvidence {
  selectedFileCount: number;
  firstImportSuccess: boolean;
  secondImportSuccess: boolean;
  homeTwoStoresVisible: boolean;
  periodControlsWork: boolean;
  platformStoreFiltersWork: boolean;
  legacyFallbackWorks: boolean;
  emptyStateWorks: boolean;
  mobile390NoOverflow: boolean;
  otherPagesOpen: boolean;
  privacyPass: boolean;
  numberSafetyPass: boolean;
  auditDatabaseDeleted: boolean;
  productionDatabaseUntouched: boolean;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

const collectSensitiveSourceValues = async (): Promise<Set<string>> => {
  const table = await parseTmallTableFile(createSampleFile(SAMPLE_FILES[3]));
  const values = new Set<string>();
  table.rows.forEach((row) => {
    SENSITIVE_FIELD_NAMES.forEach((fieldName) => {
      const value = normalizeLeafValue(row[fieldName]);
      if (value && value.length >= 4 && !["--", "暂无", "null", "NULL"].includes(value)) values.add(value);
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
    const expression = `
      (() => location.origin === ${JSON.stringify(expected.origin)} &&
        location.pathname === ${JSON.stringify(expected.pathname)} &&
        location.search === ${JSON.stringify(expected.search)})()
    `;
    await this.waitForExpression(expression, 30000);
    await this.waitForExpression("document.readyState === 'complete'", 30000);
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
    throw new Error(`wait_for_expression_timeout:${expression.slice(0, 80)}`);
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v05c1-chrome-"));
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

const noWholePageOverflow = async (client: CdpClient, url: string): Promise<boolean> => {
  await client.navigate(url);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(800);
  const ok = await client.evaluate<boolean>(
    "Math.ceil(document.documentElement.scrollWidth) <= Math.ceil(document.documentElement.clientWidth) + 1",
  );
  await client.send("Emulation.clearDeviceMetricsOverride");
  return ok;
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

const staticSourceChecks = () => {
  const page = readText("app/(workspace)/home/page.tsx");
  const commandCenter = readText("components/home/v05/home-command-center.tsx");
  const trend = readText("components/home/v05/home-main-trend.tsx");
  const oldModules = [
    "HomeWorkbenchOverview",
    "HomeSectionNav",
    "TmallGlobalDataStatusGuide",
    "TmallMetricGrid",
    "TmallProductRanking",
    "TmallRiskList",
    "TmallQualitySummary",
  ];
  const componentSource = fs
    .readdirSync(path.join(ROOT, "components/home/v05"))
    .map((file) => readText(`components/home/v05/${file}`))
    .join("\n");

  return {
    usesCommandCenter: page.includes("HomeCommandCenter"),
    oldLongModulesNotRendered: oldModules.every((name) => !page.includes(name)),
    oneMainTrendSvg: (trend.match(/<svg/g) ?? []).length === 1,
    metricCardsCapped: readText("components/home/v05/home-metric-grid.tsx").includes("slice(0, 6)"),
    dataStatusLightweight: commandCenter.includes("HomeDataStatus") && !page.includes("TmallQualitySummary"),
    noInternalTerms: INTERNAL_TERMS.every((term) => !componentSource.includes(term) && !page.includes(term)),
  };
};

const runRuntime = async (sensitiveValues: Set<string>): Promise<RuntimeEvidence> => {
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
    const homeTwoStoresVisible = await client.evaluate<boolean>(`
      document.body.innerText.includes("2 个店铺") &&
      document.querySelectorAll("table tbody tr").length >= 2
    `);

    const periodControlsWork = await client.evaluate<boolean>(`
      (() => {
        const click = (text) => {
          const button = [...document.querySelectorAll("button")]
            .find((item) => item.textContent?.trim() === text);
          button?.click();
          return !!button;
        };
        return click("周") && click("月") && click("自定义");
      })()
    `);
    await client.waitForText("请选择完整的起始日期和结束日期", 30000);

    const platformStoreFiltersWork = await client.evaluate<boolean>(`
      (() => {
        const platform = document.querySelector("#home-platform-select");
        const store = document.querySelector("#home-store-select");
        if (!platform || !store) return false;
        platform.value = "tmall";
        platform.dispatchEvent(new Event("change", { bubbles: true }));
        const second = [...store.options].find((option) => option.textContent?.includes("天猫第二店铺"));
        if (!second) return false;
        store.value = second.value;
        store.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()
    `);

    const mobile390NoOverflow = await noWholePageOverflow(client, `${next.baseUrl}/home`);
    const homeText = await client.getBodyText();
    const leakedSensitiveValueCount = [...sensitiveValues].filter((value) => homeText.includes(value)).length;
    const privacyPass =
      leakedSensitiveValueCount === 0 &&
      !SENSITIVE_FIELD_NAMES.some((fieldName) => homeText.includes(fieldName));
    const numberSafetyPass = !containsInvalidNumberText(homeText);

    const fallbackCleanup = await deleteAuditDatabase(client);
    productionUntouched = fallbackCleanup.productionUntouched;
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("旧版单店数据", 45000);
    const legacyFallbackWorks = await client.evaluate<boolean>(
      "document.body.innerText.includes('旧版单店数据') && !document.body.innerText.includes('active pointer')",
    );

    await deleteAuditDatabase(client);
    await client.evaluate<void>(`
      localStorage.removeItem("airburg_tmall_analysis_v2");
      localStorage.removeItem("airburg_tmall_targets_v1");
      localStorage.removeItem("airburg_tmall_series_groups_v1");
    `);
    await client.navigate(`${next.baseUrl}/home`);
    await client.waitForText("当前没有经营数据", 45000);
    const emptyStateWorks = await client.evaluate<boolean>("document.body.innerText.includes('前往数据导入')");

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
    let otherPagesOpen = true;
    for (const page of pages) {
      await client.navigate(`${next.baseUrl}${page}`);
      const bodyText = await client.getBodyText();
      if (!bodyText.trim()) otherPagesOpen = false;
    }

    const cleanup = await deleteAuditDatabase(client);
    auditDeleted = cleanup.deleted;
    productionUntouched = productionUntouched && cleanup.productionUntouched;

    return {
      selectedFileCount: Math.min(selectedFileCount, selectedAgain),
      firstImportSuccess,
      secondImportSuccess,
      homeTwoStoresVisible,
      periodControlsWork,
      platformStoreFiltersWork,
      legacyFallbackWorks,
      emptyStateWorks,
      mobile390NoOverflow,
      otherPagesOpen,
      privacyPass,
      numberSafetyPass,
      auditDatabaseDeleted: auditDeleted,
      productionDatabaseUntouched: productionUntouched,
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
  const staticChecks = staticSourceChecks();
  const sensitiveValues = await collectSensitiveSourceValues();
  let runtime: RuntimeEvidence | null = null;
  let runtimeError: string | null = null;

  try {
    runtime = await runRuntime(sensitiveValues);
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : "runtime_validation_failed";
  }

  const checks = {
    ...staticChecks,
    realBrowserSelectedFourFiles: runtime?.selectedFileCount === 4,
    firstStoreImportSuccess: runtime?.firstImportSuccess === true,
    secondStoreImportSuccess: runtime?.secondImportSuccess === true,
    homeShowsTwoStores: runtime?.homeTwoStoresVisible === true,
    periodControlsWork: runtime?.periodControlsWork === true,
    platformStoreFiltersWork: runtime?.platformStoreFiltersWork === true,
    legacyFallbackWorks: runtime?.legacyFallbackWorks === true,
    emptyStateWorks: runtime?.emptyStateWorks === true,
    mobile390NoOverflow: runtime?.mobile390NoOverflow === true,
    otherPagesOpen: runtime?.otherPagesOpen === true,
    privacyPass: runtime?.privacyPass === true,
    numberSafetyPass: runtime?.numberSafetyPass === true,
    auditDatabaseDeleted: runtime?.auditDatabaseDeleted === true,
    productionDatabaseUntouched: runtime?.productionDatabaseUntouched === true,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([name]) => name);
  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05c1-home-command-center-ui",
    databaseName: DATABASE_NAME,
    fileSelectionMethod: "DOM.setFileInputFiles",
    failedChecks,
    runtimeError,
    selectedFileCount: runtime?.selectedFileCount ?? 0,
    firstImportSuccess: runtime?.firstImportSuccess ?? false,
    secondImportSuccess: runtime?.secondImportSuccess ?? false,
    privacyPass: runtime?.privacyPass ?? false,
    numberSafetyPass: runtime?.numberSafetyPass ?? false,
    mobile390NoOverflow: runtime?.mobile390NoOverflow ?? false,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    script: "validate-v05c1-home-command-center-ui",
    error: error instanceof Error ? error.message : "unknown_error",
  }, null, 2));
  process.exitCode = 1;
});
