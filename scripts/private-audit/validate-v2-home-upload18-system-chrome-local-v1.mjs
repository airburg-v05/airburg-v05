import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SAMPLE_DIR = process.env.V2_HOME_SAMPLE_DIR ?? "/Users/zongji/Desktop/每日平台数据/天猫";
const PORT = Number(process.env.V2_HOME_E2E_PORT ?? "3000");
const BASE_URL = process.env.V2_HOME_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = process.env.V2_HOME_ARTIFACT_DIR
  ? path.resolve(process.env.V2_HOME_ARTIFACT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v2-home-upload18-local-"));
const PROFILE_DIR = process.env.V2_HOME_PROFILE_DIR
  ? path.resolve(process.env.V2_HOME_PROFILE_DIR)
  : null;
const CLEANUP_AFTER_REGRESSION = process.env.V2_HOME_CLEANUP_AFTER_REGRESSION === "1";

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const checks = [];
let currentStage = "bootstrap";

const check = (name, pass, details) => {
  checks.push({ name, pass, details });
  if (!pass) throw new Error(name);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        if ((response.statusCode ?? 500) >= 400) {
          response.resume();
          reject(new Error(`http_${response.statusCode}`));
          return;
        }
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });

const waitForHttp200 = async (url, timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return true;
    } catch {}
    await wait(250);
  }
  return false;
};

const ensureServer = async () => {
  if (await waitForHttp200(`${BASE_URL}/upload`, 3000)) return null;
  const server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (!(await waitForHttp200(`${BASE_URL}/upload`, 45000))) {
    server.kill("SIGTERM");
    throw new Error("local_server_unavailable");
  }
  return server;
};

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.consoleErrors = [];
    this.failedBusinessRequests = [];
    socket.addEventListener("message", (event) => this.onMessage(String(event.data)));
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new CdpClient(socket)), { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(message.error);
      else pending.resolve(message.result);
      return;
    }
    const waiters = this.eventWaiters.get(message.method);
    if (waiters?.length) {
      const waiter = waiters.shift();
      if (waiters.length === 0) this.eventWaiters.delete(message.method);
      waiter?.resolve(message.params);
    }
    if (message.method === "Runtime.exceptionThrown") this.consoleErrors.push("runtime_exception");
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      this.consoleErrors.push("console_error");
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      const text = `${message.params.entry.url ?? ""} ${message.params.entry.text ?? ""}`;
      if (!text.includes("favicon.ico")) this.consoleErrors.push("browser_log_error");
    }
    if (message.method === "Network.responseReceived") {
      const status = message.params?.response?.status ?? 0;
      const url = message.params?.response?.url ?? "";
      if (status >= 400 && !url.includes("favicon.ico")) this.failedBusinessRequests.push(`http_${status}`);
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitForEvent(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) ?? [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter.reject !== reject));
        reject(new Error(`cdp_event_timeout:${method}`));
      }, timeoutMs);
      const waiter = {
        resolve: (params) => {
          clearTimeout(timer);
          resolve(params);
        },
        reject,
      };
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push(waiter);
      this.eventWaiters.set(method, waiters);
    });
  }

  close() {
    this.socket.close();
  }
}

const launchChrome = async (profileDir) => {
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const activePortFile = path.join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if (chrome.exitCode !== null) throw new Error("chrome_exited_early");
      const portText = fs.readFileSync(activePortFile, "utf8").split("\n")[0]?.trim() ?? "";
      const port = Number(portText);
      if (!Number.isInteger(port) || port <= 0) throw new Error("missing_port");
      const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      if (!version?.Browser?.includes("Chrome") || !version?.webSocketDebuggerUrl) throw new Error("unexpected_cdp");
      return { chrome, port };
    } catch {
      await wait(100);
    }
  }
  chrome.kill("SIGTERM");
  throw new Error("chrome_remote_debugging_unavailable");
};

const debuggerUrl = async (port) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json`);
      const page = Array.isArray(pages) ? pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl) : null;
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(100);
  }
  throw new Error("chrome_page_target_missing");
};

const evaluate = async (client, expression) => {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error("browser_evaluation_failed");
  return response.result?.value;
};

const waitForExpression = async (client, expression, timeoutMs = 20000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(client, expression)) return;
    await wait(120);
  }
  throw new Error(`browser_state_timeout:${expression}`);
};

const routePath = (route) => route.split("?")[0];

const navigate = async (client, route, readySelector, timeoutMs = 60000) => {
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await waitForExpression(
    client,
    `window.location.pathname === ${JSON.stringify(routePath(route))} && Boolean(document.querySelector(${JSON.stringify(readySelector)}))`,
    timeoutMs,
  );
};

const reloadPage = async (client) => {
  const loadPromise = client.waitForEvent("Page.loadEventFired", 30000).catch(() => null);
  await client.send("Page.reload", { ignoreCache: false });
  await loadPromise;
  await waitForExpression(client, `document.readyState === "complete"`, 30000);
  await wait(300);
};

const waitForHomeReady = async (client, timeoutMs = 45000) => {
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-dashboard"], main'))`, timeoutMs);
  await waitForExpression(client, `!document.body.innerText.includes("正在读取经营数据…")`, timeoutMs);
};

const setViewport = async (client, width, height) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 390,
  });
  await wait(200);
};

const click = async (client, selector) => {
  await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) throw new Error("click_target_missing");
      element.click();
      return true;
    })()`,
  );
  await wait(200);
};

const clickText = async (client, text, selector = "button") => {
  await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((element) => {
        if (!(element instanceof HTMLElement)) return false;
        return (element.textContent ?? "").trim() === ${JSON.stringify(text)};
      });
      if (!(target instanceof HTMLElement)) throw new Error("click_text_target_missing");
      target.click();
      return true;
    })()`,
  );
  await wait(200);
};

const setControlValueByLabel = async (client, labelText, value) => {
  await evaluate(
    client,
    `(() => {
      const label = Array.from(document.querySelectorAll('label')).find((element) =>
        (element.textContent ?? '').includes(${JSON.stringify(labelText)}),
      );
      if (!(label instanceof HTMLElement)) throw new Error("form_label_missing");
      const control = label.querySelector('select, input');
      if (!(control instanceof HTMLSelectElement || control instanceof HTMLInputElement)) {
        throw new Error("form_control_missing");
      }
      const setter = control instanceof HTMLSelectElement
        ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  await wait(200);
};

const nativeClickText = async (client, text, selector = "button") => {
  const box = await evaluate(
    client,
    `(() => {
      const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((element) => {
        if (!(element instanceof HTMLElement)) return false;
        return (element.textContent ?? "").trim() === ${JSON.stringify(text)};
      });
      if (!(target instanceof HTMLElement)) throw new Error("native_click_text_target_missing");
      target.scrollIntoView({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    })()`,
  );
  if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) throw new Error("native_click_box_missing");
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await wait(200);
};

const nativeClickSelector = async (client, selector) => {
  const box = await evaluate(
    client,
    `(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!(target instanceof HTMLElement)) throw new Error("native_click_selector_target_missing");
      target.scrollIntoView({ block: "center", inline: "center" });
      const rect = target.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height,
      };
    })()`,
  );
  if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) throw new Error("native_click_box_missing");
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await wait(200);
};

const submitLoginAfterHydration = async (client) => {
  await waitForExpression(
    client,
    `Boolean(document.querySelector('form button[type="submit"], form button')) && document.readyState === "complete"`,
    30000,
  );
  await wait(1200);
  await click(client, "form button[type='submit'], form button");
};

const waitForLoginReady = async (client, timeoutMs = 12000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluate(
      client,
      `(() => ({
        pathname: window.location.pathname,
        search: window.location.search,
        hasSession: Boolean(window.localStorage.getItem("airburg:demo-session")),
      }))()`,
    );
    if (state.pathname === "/home" || state.hasSession) return state;
    await wait(150);
  }
  throw new Error("login_session_not_created");
};

const setInputFiles = async (client, filePaths, {
  clickTextValue = "选择文件",
  clickSelector = "button",
  inputSelector = '[data-testid="upload-page-v2-multiple-input"]',
  clickBySelector = false,
} = {}) => {
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  const chooserPromise = client.waitForEvent("Page.fileChooserOpened", 10000);
  if (clickBySelector) await nativeClickSelector(client, clickSelector);
  else await nativeClickText(client, clickTextValue, clickSelector);
  const chooser = await chooserPromise;
  if (!chooser?.backendNodeId) throw new Error("file_chooser_backend_node_missing");
  await client.send("DOM.setFileInputFiles", { backendNodeId: chooser.backendNodeId, files: filePaths });
  await client.send("Page.setInterceptFileChooserDialog", { enabled: false });
  return evaluate(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)}) || document.querySelector('input[type=file][multiple]');
      return input?.files?.length ?? -1;
    })()`,
  );
};

const importCounts = (client) =>
  evaluate(
    client,
    `(() => {
      const text = document.querySelector('[data-testid="upload-page-v2-result-summary"]')?.textContent ?? "";
      const read = (label) => Number(text.match(new RegExp(label + "：?([0-9]+)"))?.[1] ?? -1);
      return { success: read("成功"), failed: read("失败"), skipped: read("skipped") };
    })()`,
  );

const fourSourceFilePaths = (files) => {
  const find = (pattern) => files.find((filePath) => pattern.test(path.basename(filePath)));
  const selected = {
    businessProduct: find(/^【生意参谋平台】商品_全部_2026-06-30_2026-06-30\.xls$/),
    adProduct: find(/^商品报表_20260701_160039\.csv$/),
    adPlan: find(/^计划报表_20260701_160014\.csv$/),
    afterSales: find(/^4051124186_1782897394563_919\.xlsx$/),
  };
  const missing = Object.entries(selected).filter(([, filePath]) => !filePath).map(([key]) => key);
  check("v05FourSourceCandidateFilesAvailable", missing.length === 0, { selected, missing });
  return [selected.businessProduct, selected.adProduct, selected.adPlan, selected.afterSales];
};

const targetCenterPreconditionRegression = async (client) => {
  await setViewport(client, 1440, 1000);
  await navigate(client, "/v2/target-center", "main");
  await waitForExpression(client, `document.body.innerText.includes("目标管理") && document.body.innerText.includes("目标中心边界")`, 30000);
  const preconditionState = await evaluate(
    client,
    `(() => {
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({ text: (link.textContent ?? '').trim(), href: link.getAttribute('href') }));
      return {
        body: document.body.innerText,
        hasRuntimeButNoTargetFoundationCopy: document.body.innerText.includes("经营数据已导入，但目标中心数据底座尚未初始化") || document.body.innerText.includes("18 文件安全聚合数据"),
        hasFoundationAction: links.some((link) => link.text.includes("数据接入") && link.href?.startsWith("/v2/upload")),
        hasDataHealthAction: links.some((link) => link.text.includes("数据健康") && link.href?.startsWith("/v2/data-health")),
        hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
      };
    })()`,
  );
  check(
    "targetCenterExplainsRuntimeVsV05FoundationPrecondition",
    preconditionState.hasRuntimeButNoTargetFoundationCopy &&
      preconditionState.hasFoundationAction &&
      preconditionState.hasDataHealthAction &&
      preconditionState.hasDeleteButton === false,
    preconditionState,
  );
  return preconditionState;
};

const targetCenterWritableRegression = async (client) => {
  await navigate(client, "/v2/target-center", "main");
  await waitForExpression(client, `document.body.innerText.includes("目标管理") && document.body.innerText.includes("目标中心边界")`, 30000);
  const initialState = await evaluate(
    client,
    `(() => ({
      hasBoundary: document.body.innerText.includes("周、自定义和多月范围没有独立合同"),
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
      hasWriteTruthCopy: document.body.innerText.includes("点击保存后会写入当前浏览器的目标数据"),
    }))()`,
  );
  check("targetCenterBoundaryAndNoDelete", initialState.hasBoundary && initialState.hasDeleteButton === false, initialState);

  await clickText(client, "新建目标");
  await waitForExpression(client, `document.querySelector('[role="dialog"]')?.textContent?.includes("新建目标")`, 10000);
  const drawerCopy = await evaluate(client, `document.querySelector('[role="dialog"]')?.textContent ?? ""`);
  check("targetCenterTruthfulSaveCopy", String(drawerCopy).includes("点击保存后会写入当前浏览器的目标数据"), { drawerCopy });

  await setControlValueByLabel(client, "目标层级", "store");
  await waitForExpression(client, `document.querySelector('[role="dialog"]')?.textContent?.includes("平台和店铺")`, 10000);
  const storeScopeDrawerState = await evaluate(
    client,
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const labelCount = Array.from(dialog?.querySelectorAll('span') ?? []).filter((element) => (element.textContent ?? '').trim() === '平台和店铺').length;
      return {
        labelCount,
        drawerText: dialog?.textContent ?? '',
      };
    })()`,
  );
  check("targetCenterStoreScopeShowsSinglePlatformStoreLabel", storeScopeDrawerState.labelCount === 1, storeScopeDrawerState);

  await setControlValueByLabel(client, "指标", "conversionRate");
  await setControlValueByLabel(client, "目标值", "92%");
  await setControlValueByLabel(client, "父目标关系", "");
  await clickText(client, "保存目标", "[role='dialog'] button");
  await waitForExpression(
    client,
    `(() => {
      const text = document.body.innerText;
      return !document.querySelector('[role="dialog"]') ||
        text.includes("保存成功") ||
        text.includes("请明确选择独立目标") ||
        text.includes("目标值必须大于 0") ||
        text.includes("百分比目标需保存") ||
        text.includes("父目标不符合") ||
        text.includes("当前目标指标不在") ||
        text.includes("保存前数据校验失败") ||
        text.includes("当前数据已被其他操作更新") ||
        text.includes("本地保存");
    })()`,
    30000,
  );
  const saveAttemptState = await evaluate(
    client,
    `(() => ({
      body: document.body.innerText,
      hasSuccess: document.body.innerText.includes("保存成功"),
      hasPercentTarget: document.body.innerText.includes("92%"),
      dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
    }))()`,
  );
  check("targetCenterPercentTargetSaveSucceeds", saveAttemptState.hasSuccess && saveAttemptState.hasPercentTarget, saveAttemptState);

  await reloadPage(client);
  await waitForExpression(client, `document.body.innerText.includes("目标管理") && document.body.innerText.includes("92%")`, 30000);
  const savedState = await evaluate(
    client,
    `(() => ({
      hasPercentTarget: document.body.innerText.includes("92%"),
      hasPauseButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停'),
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
    }))()`,
  );
  check("targetCenterPercentTargetSavedAndReadBack", savedState.hasPercentTarget && savedState.hasPauseButton && savedState.hasDeleteButton === false, savedState);

  await clickText(client, "暂停");
  await waitForExpression(client, `document.body.innerText.includes("保存成功") && document.body.innerText.includes("重新启用")`, 30000);
  await reloadPage(client);
  await waitForExpression(client, `document.body.innerText.includes("目标管理") && document.body.innerText.includes("重新启用")`, 30000);
  const pausedState = await evaluate(
    client,
    `(() => ({
      hasPaused: document.body.innerText.includes("暂停"),
      hasReactivateButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '重新启用'),
      hasPercentTarget: document.body.innerText.includes("92%"),
    }))()`,
  );
  check("targetCenterPauseStateReadsBack", pausedState.hasReactivateButton && pausedState.hasPercentTarget, pausedState);

  await clickText(client, "重新启用");
  await waitForExpression(client, `document.body.innerText.includes("保存成功") && Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停')`, 30000);
  const reactivatedState = await evaluate(
    client,
    `(() => ({
      hasPauseButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停'),
      hasPercentTarget: document.body.innerText.includes("92%"),
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
    }))()`,
  );
  check("targetCenterReactivateKeepsTarget", reactivatedState.hasPauseButton && reactivatedState.hasPercentTarget && reactivatedState.hasDeleteButton === false, reactivatedState);
  return { initialState, savedState, pausedState, reactivatedState };
};

const targetFoundationImportRegression = async (client, files) => {
  const fourFiles = fourSourceFilePaths(files);
  await setViewport(client, 1440, 1200);
  await navigate(client, "/v2/upload", "[data-testid='v2-upload-target-foundation']");
  await waitForExpression(
    client,
    `document.body.innerText.includes("目标中心数据底座") && document.body.innerText.includes("用于目标设置的四源导入")`,
    30000,
  );
  const selectedFileCount = await setInputFiles(client, fourFiles, {
    clickSelector: "label[for='v05-batch-file-input']",
    inputSelector: "[data-testid='v05-batch-file-input']",
    clickBySelector: true,
  });
  check("v05FoundationInputReceivesFourSourceFiles", selectedFileCount === 4, { selectedFileCount, fourFiles });
  await waitForExpression(
    client,
    `(() => {
      const text = document.body.innerText;
      return text.includes("四类报表已完整识别，可以点击导入。") ||
        text.includes("文件识别未通过") ||
        text.includes("还缺少：") ||
        text.includes("存在重复来源") ||
        text.includes("存在未识别文件") ||
        text.includes("存在读取失败文件");
    })()`,
    120000,
  );
  const detectionState = await evaluate(
    client,
    `(() => ({
      body: document.body.innerText,
      hasCompleteMessage: document.body.innerText.includes("四类报表已完整识别，可以点击导入。"),
      hasBusinessProduct: document.body.innerText.includes("生意参谋商品表") && document.body.innerText.includes("已识别"),
      hasAdProduct: document.body.innerText.includes("商品推广报表") && document.body.innerText.includes("已识别"),
      hasAdPlan: document.body.innerText.includes("计划推广报表") && document.body.innerText.includes("已识别"),
      hasAfterSales: document.body.innerText.includes("售后退货表") && document.body.innerText.includes("已识别"),
    }))()`,
  );
  check(
    "v05FoundationFourSourcesDetected",
    detectionState.hasCompleteMessage &&
      detectionState.hasBusinessProduct &&
      detectionState.hasAdProduct &&
      detectionState.hasAdPlan &&
      detectionState.hasAfterSales,
    detectionState,
  );
  await clickText(client, "导入", "[data-testid='v2-upload-target-foundation'] button");
  await waitForExpression(client, `document.body.innerText.includes("导入完成，V2 数据集已激活。") || document.body.innerText.includes("这批文件已经导入过")`, 120000);
  const importState = await evaluate(
    client,
    `(() => ({
      body: document.body.innerText,
      hasHistoryLink: Array.from(document.querySelectorAll('[data-testid="v2-upload-target-foundation"] a')).some((link) => link.getAttribute('href')?.startsWith('/v2/upload/history')),
      hasQualityLink: Array.from(document.querySelectorAll('[data-testid="v2-upload-target-foundation"] a')).some((link) => link.getAttribute('href')?.startsWith('/v2/data-health')),
    }))()`,
  );
  check("v05FoundationImportActivatesDatasetAndKeepsV2Links", importState.hasHistoryLink && importState.hasQualityLink, importState);
  return { fourFiles, detectionState, importState };
};

const capture = async (client, name) => {
  const metrics = await client.send("Page.getLayoutMetrics");
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.ceil(metrics.contentSize.width),
      height: Math.min(12000, Math.ceil(metrics.contentSize.height)),
      scale: 1,
    },
  });
  const screenshotPath = path.join(ARTIFACT_DIR, `${name}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return screenshotPath;
};

const deleteIndexedDbDatabase = async (client, databaseName) =>
  evaluate(
    client,
    `new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(${JSON.stringify(databaseName)});
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    })`,
  );

const cleanupRuntimeAndDebugRecords = async (client) => {
  await navigate(client, "/v2/home", "main");
  const before = await evaluate(client, `indexedDB.databases ? indexedDB.databases().then((items) => items.map((item) => item.name).filter(Boolean).sort()) : []`);
  const runtimeDeleted = await deleteIndexedDbDatabase(client, "airburg-runtime-dataset-v1");
  const debugDeleted = await deleteIndexedDbDatabase(client, "airburg-debug-context-v1");
  const after = await evaluate(client, `indexedDB.databases ? indexedDB.databases().then((items) => items.map((item) => item.name).filter(Boolean).sort()) : []`);
  await reloadPage(client);
  await waitForHomeReady(client, 45000);
  const emptyHomeState = await evaluate(
    client,
    `(() => {
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({ text: (link.textContent ?? '').trim(), href: link.getAttribute('href') }));
      return {
        body: document.body.innerText,
        hasEmptyState: document.body.innerText.includes("当前尚未导入经营数据") ||
          document.body.innerText.includes("前往上传") ||
          document.body.innerText.includes("暂无可计算数据"),
        uploadCtaIsV2: links.some((link) => link.text.includes("前往上传") && link.href === "/v2/upload"),
        localStorageKeys: Object.keys(localStorage).sort(),
      };
    })()`,
  );
  check(
    "cleanupAfterRegressionKeepsHomeEmptyAndV2UploadCta",
    emptyHomeState.hasEmptyState === true && emptyHomeState.uploadCtaIsV2 === true,
    emptyHomeState,
  );
  return {
    before,
    after,
    runtimeDeleted,
    debugDeleted,
    preservedDatabases: after.filter((name) => ["airburg-target-drafts-v1", "airburg-v05"].includes(name)),
    preservedLocalStorageKeys: emptyHomeState.localStorageKeys.filter((key) => ["airburg:demo-session"].includes(key)),
    emptyHomeState,
  };
};

const filePaths = () =>
  fs
    .readdirSync(SAMPLE_DIR)
    .filter((name) => /\.(csv|xls|xlsx)$/i.test(name))
    .sort()
    .map((name) => path.join(SAMPLE_DIR, name));

const run = async () => {
  const server = await ensureServer();
  const profileDir = PROFILE_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "airburg-system-chrome-upload18-"));
  fs.mkdirSync(profileDir, { recursive: true });
  const launchedChrome = await launchChrome(profileDir);
  let client;
  let cleanupState = null;
  try {
    client = await CdpClient.connect(await debuggerUrl(launchedChrome.port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("DOM.enable");
    await client.send("Network.enable");

    const files = filePaths();
    check("real18FilesAvailable", files.length === 18, { count: files.length });

    currentStage = "home_empty_state";
    await setViewport(client, 1440, 1000);
    await navigate(client, "/v2/home", "main");
    await waitForExpression(client, `!document.body.innerText.includes("正在读取经营数据…")`, 30000);
    const emptyStateText = await evaluate(client, `document.body.innerText`);
    check(
      "v2HomeEmptyStateVisibleBeforeUpload",
      String(emptyStateText).includes("前往上传") || String(emptyStateText).includes("暂无可计算数据"),
      { emptyStateText },
    );

    currentStage = "login";
    await navigate(client, "/login", "button");
    await submitLoginAfterHydration(client);
    const loginState = await waitForLoginReady(client, 12000);
    if (loginState.pathname !== "/home") {
      await navigate(client, "/home", "main");
    }

    currentStage = "upload";
    await navigate(client, "/v2/upload", "[data-testid='upload-page-v1-dashboard']");
    await waitForExpression(client, `document.readyState === "complete"`, 30000);
    await wait(1500);
    const selectedFileCount = await setInputFiles(client, files);
    check("v2UploadInputReceives18Files", selectedFileCount === 18, { selectedFileCount });
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length === 18`, 120000);
    await click(client, "[data-testid='upload-page-v2-import-button']");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="upload-page-v2-result-summary"]'))`, 120000);
    const counts = await importCounts(client);
    check("upload18Counts", counts.success === 18 && counts.failed === 0 && counts.skipped === 0, counts);
    const uploadScreenshot = await capture(client, "upload-desktop");

    currentStage = "v2_home_desktop";
    await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 30000);
    const homeState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        dataHealthText: document.querySelector('[data-testid="v2-home-data-health-summary"]')?.textContent ?? "",
        toolbarText: document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent ?? "",
        hasUploadPrompt: document.body.innerText.includes("前往上传"),
      }))()`,
    );
    check("v2HomeShows17Metrics", homeState.metricCount === 17, homeState);
    check("v2HomeNoLongerShowsSafeSkip", String(homeState.dataHealthText).includes("安全跳过0"), homeState);
    check("v2HomeLeavesEmptyState", homeState.hasUploadPrompt === false, homeState);
    const homeDesktopScreenshot = await capture(client, "v2-home-desktop");

    currentStage = "metric_settings_customize";
    await clickText(client, "指标设置");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`, 10000);
    const metricSettingsCount = await evaluate(
      client,
      `document.querySelectorAll('[data-testid="v2-home-metric-settings"] input[type="checkbox"]').length`,
    );
    check("metricSettingsHas17Controls", metricSettingsCount === 17, { count: metricSettingsCount });
    await click(client, "[aria-label='显示投入产出比']");
    await click(client, "[aria-label='显示品牌词访客']");
    await click(client, "[aria-label='下移GMV']");
    await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 15`, 10000);
    const customizedMetricState = await evaluate(
      client,
      `(() => {
        const keys = Array.from(document.querySelectorAll('[data-metric-key]')).map((item) => item.getAttribute('data-metric-key'));
        return {
          count: keys.length,
          firstKey: keys[0] ?? null,
          hasAdRoi: keys.includes('adRoi'),
          hasBrandVisitors: keys.includes('brandVisitors'),
        };
      })()`,
    );
    check(
      "metricVisibilityAndOrderingInteractive",
      customizedMetricState.count === 15 &&
        customizedMetricState.firstKey === "gsv" &&
        customizedMetricState.hasAdRoi === false &&
        customizedMetricState.hasBrandVisitors === false,
      customizedMetricState,
    );

    currentStage = "refresh_restore_customized_metrics";
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 15`, 30000);
    const refreshedState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        dataHealthText: document.querySelector('[data-testid="v2-home-data-health-summary"]')?.textContent ?? "",
        firstMetricKey: document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') ?? null,
        hasAdRoi: Array.from(document.querySelectorAll('[data-metric-key]')).some((item) => item.getAttribute('data-metric-key') === 'adRoi'),
        hasBrandVisitors: Array.from(document.querySelectorAll('[data-metric-key]')).some((item) => item.getAttribute('data-metric-key') === 'brandVisitors'),
      }))()`,
    );
    check(
      "refreshPreservesMetricSubsetAndOrdering",
      refreshedState.metricCount === 15 &&
        String(refreshedState.dataHealthText).includes("安全跳过0") &&
        refreshedState.firstMetricKey === "gsv" &&
        refreshedState.hasAdRoi === false &&
        refreshedState.hasBrandVisitors === false,
      refreshedState,
    );

    currentStage = "metric_settings_reset";
    await clickText(client, "指标设置");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`, 10000);
    await clickText(client, "恢复默认", "[data-testid='v2-home-metric-settings'] button");
    await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 10000);
    const resetState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        firstMetricKey: document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') ?? null,
      }))()`,
    );
    check("resetRestores17Metrics", resetState.metricCount === 17 && resetState.firstMetricKey === "gmv", resetState);

    currentStage = "refresh_restore_reset_metrics";
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 30000);
    const resetRefreshedState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        firstMetricKey: document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') ?? null,
      }))()`,
    );
    check(
      "refreshAfterResetRestores17Metrics",
      resetRefreshedState.metricCount === 17 && resetRefreshedState.firstMetricKey === "gmv",
      resetRefreshedState,
    );

    currentStage = "v2_home_mobile";
    await setViewport(client, 390, 900);
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 17`, 30000);
    const mobileSafety = await evaluate(
      client,
      `(() => ({
        horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1,
        metricCount: document.querySelectorAll('[data-metric-key]').length,
      }))()`,
    );
    check("mobileHomeHasNoPageWideOverflow", mobileSafety.horizontalOverflow === false, mobileSafety);
    const homeMobileScreenshot = await capture(client, "v2-home-mobile");

    currentStage = "v2_target_center_runtime_precondition";
    const targetCenterPreconditionState = await targetCenterPreconditionRegression(client);

    currentStage = "v2_target_foundation_import";
    const targetFoundationState = await targetFoundationImportRegression(client, files);

    currentStage = "v2_target_center_writable_regression";
    const targetCenterWritableState = await targetCenterWritableRegression(client);

    if (CLEANUP_AFTER_REGRESSION) {
      currentStage = "cleanup_after_regression";
      cleanupState = await cleanupRuntimeAndDebugRecords(client);
    }

    check("consoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    check("networkBusinessErrorsZero", client.failedBusinessRequests.length === 0, client.failedBusinessRequests);

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          validator: "validate-v2-home-upload18-system-chrome-local-v1",
          checks,
          artifacts: {
            artifactDir: ARTIFACT_DIR,
            uploadScreenshot,
            homeDesktopScreenshot,
            homeMobileScreenshot,
          },
          counts,
          homeState,
          refreshedState,
          resetState,
          resetRefreshedState,
          mobileSafety,
          targetCenterPreconditionState,
          targetFoundationState,
          targetCenterWritableState,
          cleanupState,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: "FAIL",
          validator: "validate-v2-home-upload18-system-chrome-local-v1",
          stage: currentStage,
          checks,
          error: error instanceof Error ? error.message : String(error),
          artifactDir: ARTIFACT_DIR,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    try {
      client?.close();
    } catch {}
    try {
      launchedChrome.chrome.kill("SIGTERM");
    } catch {}
    try {
      server?.kill("SIGTERM");
    } catch {}
  }
};

await run();
