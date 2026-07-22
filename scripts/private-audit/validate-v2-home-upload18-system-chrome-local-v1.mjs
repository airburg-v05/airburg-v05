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

const setControlValueBySelector = async (client, selector, value) => {
  await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
        throw new Error("form_control_missing");
      }
      const setter = control instanceof HTMLSelectElement
        ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
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
  await client.send("DOM.enable");
  const documentNode = await client.send("DOM.getDocument", { depth: -1, pierce: true });
  const inputNode = await client.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector: inputSelector,
  });
  if (inputNode.nodeId) {
    await client.send("DOM.setFileInputFiles", { nodeId: inputNode.nodeId, files: filePaths });
  } else {
    await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
    const chooserPromise = client.waitForEvent("Page.fileChooserOpened", 10000);
    if (clickBySelector) await nativeClickSelector(client, clickSelector);
    else await nativeClickText(client, clickTextValue, clickSelector);
    const chooser = await chooserPromise;
    if (!chooser?.backendNodeId) throw new Error("file_chooser_backend_node_missing");
    await client.send("DOM.setFileInputFiles", { backendNodeId: chooser.backendNodeId, files: filePaths });
    await client.send("Page.setInterceptFileChooserDialog", { enabled: false });
  }
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
      const skipped = read("跳过");
      return { success: read("成功"), failed: read("失败"), skipped: skipped >= 0 ? skipped : read("skipped") };
    })()`,
  );

const targetCenterPreconditionRegression = async (client) => {
  await setViewport(client, 1440, 1000);
  await navigate(client, "/v2/target-center", "[data-testid='v2-brand-target-center']");
  await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
  const preconditionState = await evaluate(
    client,
    `(() => {
      const main = document.querySelector('main');
      const buttons = Array.from(main?.querySelectorAll('button') ?? []);
      return {
        body: main?.textContent ?? '',
        hasIndependentCopy: (main?.textContent ?? '').includes("目标设置独立于数据上传"),
        hasAutoDerivedCopy: (main?.textContent ?? '').includes("自动推导目标"),
        brandEnabled: buttons.some((button) => (button.textContent ?? '').trim() === '品牌' && !button.disabled),
        storeDisabled: buttons.some((button) => (button.textContent ?? '').trim() === '店铺' && button.disabled),
        hasSaveButton: buttons.some((button) => (button.textContent ?? '').trim() === '保存目标'),
        hasAutoSaveStatus: Boolean(main?.querySelector('[data-testid="v2-target-auto-save-status"]')),
        hasUploadFoundationCopy: (main?.textContent ?? '').includes("目标中心数据底座"),
        hasDeleteButton: buttons.some((button) => (button.textContent ?? '').trim() === '删除'),
      };
    })()`,
  );
  check(
    "targetCenterUsesAutosaveWithoutRedundantUploadOrDerivedSections",
    preconditionState.hasIndependentCopy === false &&
      preconditionState.hasAutoDerivedCopy === false &&
      preconditionState.brandEnabled &&
      preconditionState.storeDisabled &&
      preconditionState.hasSaveButton === false &&
      preconditionState.hasAutoSaveStatus &&
      preconditionState.hasUploadFoundationCopy === false &&
      preconditionState.hasDeleteButton === false,
    preconditionState,
  );
  return preconditionState;
};

const targetCenterWritableRegression = async (client) => {
  await navigate(client, "/v2/target-center", "[data-testid='v2-brand-target-center']");
  await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
  await setControlValueBySelector(client, 'input[type="month"]', "2026-06");
  await waitForExpression(client, `document.body.innerText.includes("2026年06月")`, 10000);
  const initialState = await evaluate(
    client,
    `(() => ({
      hasBoundary: document.body.innerText.includes("目标设置独立于数据上传") || document.body.innerText.includes("不需要额外上传“目标底座”"),
      hasAutoDerivedCopy: document.body.innerText.includes("自动推导目标"),
      hasManualSave: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '保存目标'),
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
      hasBrandInput: Boolean(document.querySelector('#v2-target-brand-conversionRate')),
    }))()`,
  );
  check("targetCenterMonthEditorIsCompactAndAutosaveOnly", initialState.hasBoundary === false && initialState.hasAutoDerivedCopy === false && initialState.hasManualSave === false && initialState.hasDeleteButton === false && initialState.hasBrandInput, initialState);

  await setControlValueBySelector(client, "#v2-target-brand-gmv", "300000");
  await setControlValueBySelector(client, "#v2-target-brand-conversionRate", "92");
  await waitForExpression(
    client,
    `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') === 'saved' && document.body.innerText.includes("已自动保存 2 项品牌目标")`,
    30000,
  );
  const saveAttemptState = await evaluate(
    client,
    `(() => ({
      body: document.body.innerText,
      hasSuccess: document.body.innerText.includes("2026年06月 · 已自动保存 2 项品牌目标"),
      saveState: document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') ?? null,
      gmvValue: document.querySelector('#v2-target-brand-gmv')?.value ?? null,
      percentValue: document.querySelector('#v2-target-brand-conversionRate')?.value ?? null,
    }))()`,
  );
  check("targetCenterJuneTargetsAutosaveSucceeds", saveAttemptState.hasSuccess && saveAttemptState.saveState === "saved" && saveAttemptState.gmvValue === "300000" && saveAttemptState.percentValue === "92", saveAttemptState);

  await reloadPage(client);
  await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
  await setControlValueBySelector(client, 'input[type="month"]', "2026-06");
  await waitForExpression(client, `document.querySelector('#v2-target-brand-gmv')?.value === "300000" && document.querySelector('#v2-target-brand-conversionRate')?.value === "92"`, 30000);
  const savedState = await evaluate(
    client,
    `(() => ({
      gmvValue: document.querySelector('#v2-target-brand-gmv')?.value ?? null,
      percentValue: document.querySelector('#v2-target-brand-conversionRate')?.value ?? null,
      hasPauseButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停此目标'),
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
    }))()`,
  );
  check("targetCenterJuneTargetsSavedAndReadBack", savedState.gmvValue === "300000" && savedState.percentValue === "92" && savedState.hasPauseButton && savedState.hasDeleteButton === false, savedState);

  await setControlValueBySelector(client, "#v2-target-brand-gmv", "");
  await waitForExpression(
    client,
    `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') === 'saved' && document.body.innerText.includes("清除 1 项")`,
    30000,
  );
  await reloadPage(client);
  await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
  await setControlValueBySelector(client, 'input[type="month"]', "2026-06");
  await waitForExpression(client, `document.querySelector('#v2-target-brand-gmv')?.value === "" && document.querySelector('#v2-target-brand-conversionRate')?.value === "92"`, 30000);
  const clearedState = await evaluate(
    client,
    `(() => ({
      gmvValue: document.querySelector('#v2-target-brand-gmv')?.value ?? null,
      percentValue: document.querySelector('#v2-target-brand-conversionRate')?.value ?? null,
    }))()`,
  );
  check("targetCenterClearedMetricDeletesOnlyThatRecord", clearedState.gmvValue === "" && clearedState.percentValue === "92", clearedState);

  await setControlValueBySelector(client, "#v2-target-brand-gmv", "300000");
  await waitForExpression(
    client,
    `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') === 'saved' && document.querySelector('#v2-target-brand-gmv')?.value === "300000"`,
    30000,
  );

  await clickText(client, "暂停此目标");
  await waitForExpression(client, `document.body.innerText.includes("目标状态已更新。") && document.body.innerText.includes("重新启用")`, 30000);
  await reloadPage(client);
  await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
  await setControlValueBySelector(client, 'input[type="month"]', "2026-06");
  await waitForExpression(client, `document.body.innerText.includes("目标中心") && document.body.innerText.includes("重新启用")`, 30000);
  const pausedState = await evaluate(
    client,
    `(() => ({
      hasReactivateButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '重新启用'),
      percentValue: document.querySelector('#v2-target-brand-conversionRate')?.value ?? null,
    }))()`,
  );
  check("targetCenterPauseStateReadsBack", pausedState.hasReactivateButton && pausedState.percentValue === "92", pausedState);

  await clickText(client, "重新启用");
  await waitForExpression(client, `document.body.innerText.includes("目标状态已更新。") && Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停此目标')`, 30000);
  const reactivatedState = await evaluate(
    client,
    `(() => ({
      hasPauseButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '暂停此目标'),
      percentValue: document.querySelector('#v2-target-brand-conversionRate')?.value ?? null,
      hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
    }))()`,
  );
  check("targetCenterReactivateKeepsTarget", reactivatedState.hasPauseButton && reactivatedState.percentValue === "92" && reactivatedState.hasDeleteButton === false, reactivatedState);
  const screenshot = await capture(client, "v2-target-center-autosave-desktop");
  return { initialState, savedState, clearedState, pausedState, reactivatedState, screenshot };
};

const uploadTargetFoundationRemovedRegression = async (client) => {
  await navigate(client, "/v2/upload", "[data-testid='upload-page-v1-dashboard']");
  await waitForExpression(client, `document.readyState === "complete"`, 30000);
  await waitForExpression(
    client,
    `document.body.innerText.includes("当前真实文件适配器只开放天猫") && document.body.innerText.includes("京东/抖音仍需独立授权与字段验证")`,
    30000,
  );
  const state = await evaluate(
    client,
    `(() => ({
      hasTargetFoundation: Boolean(document.querySelector('[data-testid="v2-upload-target-foundation"]')) || document.body.innerText.includes("目标中心数据底座"),
      replaceChecked: Boolean(Array.from(document.querySelectorAll('input[type="radio"]')).find((input) => input.checked && input.closest('label')?.textContent?.includes("替换当前品牌数据"))),
      hasAdapterBoundary: document.body.innerText.includes("当前真实文件适配器只开放天猫") && document.body.innerText.includes("京东/抖音仍需独立授权与字段验证"),
    }))()`,
  );
  check("v2UploadRemovesTargetFoundationAndDefaultsToReplace", state.hasTargetFoundation === false && state.replaceChecked && state.hasAdapterBoundary, state);
  return state;
};

const homeCustomComparisonRegression = async (client) => {
  await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
  await waitForHomeReady(client, 45000);
  await click(client, '[data-testid="v2-custom-date-trigger"]');
  await waitForExpression(client, `Boolean(document.querySelector('#v2-home-custom-start')) && Boolean(document.querySelector('#v2-home-custom-end'))`, 10000);
  const currentRange = await evaluate(
    client,
    `(() => ({
      start: document.querySelector('#v2-home-custom-start')?.value ?? '',
      end: document.querySelector('#v2-home-custom-end')?.value ?? '',
    }))()`,
  );
  await setControlValueBySelector(client, "#v2-home-custom-start", currentRange.start);
  await setControlValueBySelector(client, "#v2-home-custom-end", currentRange.end);
  await clickText(client, "应用", "[data-testid='v2-home-toolbar'] button");
  await waitForExpression(client, `!document.querySelector('#v2-home-custom-start')`, 10000);
  const customState = await evaluate(
    client,
    `(() => {
      const custom = document.querySelector('[data-testid="v2-custom-date-trigger"]');
      return {
        start: ${JSON.stringify(currentRange.start)},
        end: ${JSON.stringify(currentRange.end)},
        active: custom?.className.includes('text-blue-700') ?? false,
        hasWhiteBlock: custom?.className.includes('bg-white') || custom?.className.includes('shadow'),
        outsidePresetGroup: custom?.closest('[data-testid="v2-time-presets"]') === null,
      };
    })()`,
  );
  check("homeCustomRangeIsSeparateAndHasNoTrailingWhiteBlock", customState.active && customState.hasWhiteBlock === false && customState.outsidePresetGroup && Boolean(customState.start) && Boolean(customState.end), customState);

  await clickText(client, "环比", "[aria-label='指标区间对比'] button");
  await waitForExpression(client, `Array.from(document.querySelectorAll('[aria-label="指标区间对比"] button')).some((button) => (button.textContent ?? '').trim() === '环比' && button.getAttribute('aria-pressed') === 'true')`, 10000);
  const previousPeriodState = await evaluate(
    client,
    `(() => ({
      pressed: Array.from(document.querySelectorAll('[aria-label="指标区间对比"] button')).some((button) => (button.textContent ?? '').trim() === '环比' && button.getAttribute('aria-pressed') === 'true'),
      hasMetricCopy: document.querySelector('[data-metric-key="gmv"]')?.textContent?.includes('环比') ?? false,
      hasReferenceCopy: document.body.innerText.includes('环比参考期'),
    }))()`,
  );
  check("homePreviousPeriodControlHasTruthfulReferenceState", previousPeriodState.pressed && previousPeriodState.hasMetricCopy && previousPeriodState.hasReferenceCopy, previousPeriodState);

  await clickText(client, "同比", "[aria-label='指标区间对比'] button");
  await waitForExpression(client, `Array.from(document.querySelectorAll('[aria-label="指标区间对比"] button')).some((button) => (button.textContent ?? '').trim() === '同比' && button.getAttribute('aria-pressed') === 'true')`, 10000);
  const yoyState = await evaluate(
    client,
    `(() => ({
      pressed: Array.from(document.querySelectorAll('[aria-label="指标区间对比"] button')).some((button) => (button.textContent ?? '').trim() === '同比' && button.getAttribute('aria-pressed') === 'true'),
      hasMetricCopy: document.querySelector('[data-metric-key="gmv"]')?.textContent?.includes('同比') ?? false,
      hasReferenceCopy: document.body.innerText.includes('同比参考期'),
    }))()`,
  );
  check("homeYoyControlHasTruthfulReferenceState", yoyState.pressed && yoyState.hasMetricCopy && yoyState.hasReferenceCopy, yoyState);
  await clickText(client, "关闭", "[aria-label='指标区间对比'] button");
  return { customState, previousPeriodState, yoyState };
};

const homeCrossMonthTargetRegression = async (client) => {
  await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
  await waitForHomeReady(client, 45000);
  await clickText(client, "周", "[data-testid='v2-home-toolbar'] button");
  await waitForExpression(
    client,
    `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes("2026-06-29 ~ 2026-07-05")`,
    30000,
  );
  await waitForExpression(client, `document.querySelector('[data-metric-key="gmv"]')?.getAttribute('data-target-state') === 'ready'`, 30000);
  const state = await evaluate(
    client,
    `(() => {
      const card = document.querySelector('[data-metric-key="gmv"]');
      const label = card?.getAttribute('aria-label') ?? '';
      const valueFromLabel = (prefix) => {
        const raw = label.match(new RegExp(prefix + ' ([^，]+)'))?.[1] ?? '';
        const parsed = Number(raw.replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      };
      return {
        range: document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent ?? '',
        targetState: card?.getAttribute('data-target-state') ?? null,
        mtdTarget: valueFromLabel('MTD目标'),
        totalTargetMissing: label.includes('总目标 --'),
      };
    })()`,
  );
  check(
    "homeCrossMonthRangeLoadsJuneTargetByOverlap",
    state.range.includes("2026-06-29 ~ 2026-07-05") &&
      state.targetState === "ready" &&
      state.mtdTarget === 20000 &&
      state.totalTargetMissing,
    state,
  );
  return state;
};

const unifiedRouteRegression = async (client) => {
  const specs = [
    { route: "/v2/series-board", selector: "[data-testid='v2-series-board-dashboard']", name: "series" },
    { route: "/v2/store-board", selector: "[data-testid='v2-store-board-dashboard']", name: "store" },
    { route: "/v2/product-board", selector: "[data-testid='v2-product-board-dashboard']", name: "product" },
    { route: "/v2/data-health", selector: "[data-testid='v2-runtime-data-health']", name: "dataHealth" },
    { route: "/v2/upload/history", selector: "[data-testid='v2-runtime-import-history']", name: "history" },
  ];
  const states = {};
  for (const spec of specs) {
    await navigate(client, spec.route, spec.selector);
    await waitForExpression(client, `!document.body.innerText.includes("正在读取")`, 45000);
    const state = await evaluate(
      client,
      `(() => ({
        pathname: window.location.pathname,
        hasReadySelector: Boolean(document.querySelector(${JSON.stringify(spec.selector)})),
        hasUploadPrompt: Array.from(document.querySelectorAll('main a')).some((link) => (link.textContent ?? '').includes('前往数据接入')),
        hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
        hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
        body: document.querySelector('main')?.textContent ?? '',
      }))()`,
    );
    check(`unifiedRuntimeRoute.${spec.name}`, state.pathname === spec.route && state.hasReadySelector && state.hasUploadPrompt === false, state);
    states[spec.name] = state;
  }
  check("dataHealthAndHistoryUseActiveRuntimeSnapshot", states.dataHealth.body.includes("当前活动") && states.history.body.includes("当前活动"), {
    dataHealth: states.dataHealth.body,
    history: states.history.body,
  });
  return states;
};

const seriesConfigurationRegression = async (client, brandGmv) => {
  await navigate(client, "/v2/series-board", "[data-testid='v2-brand-series-manager']");
  for (let index = 1; index <= 6; index += 1) {
    await clickText(client, "新建系列", "[data-testid='v2-brand-series-manager'] button");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-series-editor"]'))`, 10000);
    await setControlValueBySelector(client, '[data-testid="v2-series-editor"] input[placeholder="例如：P1 经典系列"]', `E2E系列${index}`);
    await evaluate(
      client,
      `(() => {
        const textarea = document.querySelector('[data-testid="v2-series-editor"] textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('series_textarea_missing');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(textarea, '824014970181');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
    );
    await clickText(client, "加载并绑定", "[data-testid='v2-series-editor'] button");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-brand-series-manager"]')?.textContent?.includes("${index} 个系列")`, 30000);
  }
  const managerState = await evaluate(
    client,
    `(() => {
      const manager = document.querySelector('[data-testid="v2-brand-series-manager"]');
      const library = document.querySelector('[data-testid="v2-series-library"]');
      return {
        body: manager?.textContent ?? '',
        libraryText: library?.textContent ?? '',
        cardCount: library?.querySelectorAll('article').length ?? 0,
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        hasVisitors: Boolean(document.querySelector('[data-metric-key="visitors"]')),
        hasPaidBuyers: Boolean(document.querySelector('[data-metric-key="paidBuyers"]')),
        hasUnavailablePlaceholders:
          Boolean(document.querySelector('[data-metric-key="mtdTurnover"]')) ||
          Boolean(document.querySelector('[data-metric-key="regionalFulfillmentRate"]')),
        hasAnalysisLens: Boolean(document.querySelector('[data-testid="v2-series-analysis-lens"]')),
        hasStoreBreakdown: Boolean(document.querySelector('[data-testid="v2-series-store-breakdown"]')),
        hasBrandSeriesBreakdownCopy: document.body.innerText.includes('品牌系列拆解'),
        hasHomeChart: Boolean(document.querySelector('[data-testid="v2-home-chart"]')),
        hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
        hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
        hasLegacySections: ['当前系列概览', '系列商品贡献', '系列目标进度', '系列搜索表现', '数据状态与健康提示'].some((text) => document.body.innerText.includes(text)),
        hasUploadPrompt: Array.from(document.querySelectorAll('main a')).some((link) => (link.textContent ?? '').includes('前往数据接入')),
      };
    })()`,
  );
  check(
    "seriesCenterUsesPastedIdsAndHomeAlignedDecisionSurface",
    managerState.body.includes("6 个系列") &&
      managerState.cardCount === 6 &&
      managerState.metricCount === 16 &&
      managerState.hasVisitors &&
      managerState.hasPaidBuyers &&
      managerState.hasUnavailablePlaceholders === false &&
      managerState.hasAnalysisLens &&
      managerState.hasStoreBreakdown === false &&
      managerState.hasBrandSeriesBreakdownCopy === false &&
      managerState.hasHomeChart &&
      managerState.hasDayMode &&
      managerState.hasDlyMode === false &&
      managerState.hasLegacySections === false &&
      managerState.hasUploadPrompt === false,
    managerState,
  );
  const seriesDesktopScreenshot = await capture(client, "v2-series-desktop");

  await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
  await waitForHomeReady(client, 45000);
  const rangeBrandGmvBeforeSeriesSelection = await homeGmvValue(client);
  await clickText(client, "指标设置");
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`, 10000);
  for (let index = 1; index <= 5; index += 1) {
    await click(client, `[aria-label="首页展示E2E系列${index}"]`);
  }
  await waitForExpression(client, `Boolean(document.querySelector('[aria-label="首页展示E2E系列6"]')?.disabled)`, 10000);
  await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");
  await waitForExpression(client, `document.querySelectorAll('[data-testid="v2-home-selected-series"] a').length === 5`, 30000);
  const homeBrandGmv = await homeGmvValue(client);
  const homeSeriesState = await evaluate(
    client,
    `(() => ({
      hasTopSeriesFilter: Boolean(document.querySelector('[data-testid="v2-home-series-filter"]')),
      selectedSeriesCards: document.querySelectorAll('[data-testid="v2-home-selected-series"] a').length,
      selectedSeriesText: document.querySelector('[data-testid="v2-home-selected-series"]')?.textContent ?? '',
    }))()`,
  );
  check(
    "homeSeriesSelectionStaysInMetricSettingsAndPreservesBrandMetrics",
    homeSeriesState.hasTopSeriesFilter === false &&
      homeSeriesState.selectedSeriesCards === 5 &&
      homeSeriesState.selectedSeriesText.includes("E2E系列1") &&
      homeSeriesState.selectedSeriesText.includes("E2E系列5") &&
      !homeSeriesState.selectedSeriesText.includes("E2E系列6") &&
      typeof homeBrandGmv === "number" &&
      typeof rangeBrandGmvBeforeSeriesSelection === "number" &&
      Math.abs(homeBrandGmv - rangeBrandGmvBeforeSeriesSelection) < 0.01,
    { ...homeSeriesState, homeBrandGmv, rangeBrandGmvBeforeSeriesSelection, originalFullRangeBrandGmv: brandGmv },
  );
  return { managerState, homeSeriesState, homeBrandGmv, seriesDesktopScreenshot };
};

const manualProductRegression = async (client) => {
  await navigate(client, "/v2/product-board", "[data-testid='v2-brand-product-manager']");
  await clickText(client, "添加商品", "[data-testid='v2-brand-product-manager'] button");
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-product-editor"]'))`, 10000);
  await setControlValueBySelector(client, '[data-testid="v2-product-editor"] input[placeholder="手动粘贴商品 ID"]', "824014970181");
  await setControlValueBySelector(client, '[data-testid="v2-product-name-input"]', "E2E手动商品");
  const imagePath = path.join(ARTIFACT_DIR, "e2e-product-square.png");
  fs.writeFileSync(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z7NwAAAAASUVORK5CYII=", "base64"));
  const imageFileCount = await setInputFiles(client, [imagePath], { inputSelector: '[data-testid="v2-product-image-input"]' });
  check("manualProductSquareImageInputReceivesFile", imageFileCount === 1, { imageFileCount });
  await waitForExpression(client, `document.querySelector('[data-testid="v2-brand-product-manager"]')?.textContent?.includes("方图已裁切为 1:1")`, 10000);
  await clickText(client, "加载并保存", "[data-testid='v2-product-editor'] button");
  await waitForExpression(client, `document.querySelectorAll('[data-testid="v2-product-library"] article').length === 1`, 30000);
  await waitForExpression(client, `document.querySelectorAll('[data-testid="v2-product-metrics"] [data-metric-key]').length === 16`, 30000);
  const state = await evaluate(
    client,
    `(() => ({
      cardCount: document.querySelectorAll('[data-testid="v2-product-library"] article').length,
      selectorCount: document.querySelectorAll('[data-testid="v2-brand-product-manager"] select option').length,
      metricCount: document.querySelectorAll('[data-testid="v2-product-metrics"] [data-metric-key]').length,
      hasImage: Boolean(document.querySelector('[data-testid="v2-product-library"] article img')),
      hasEdit: Array.from(document.querySelectorAll('[data-testid="v2-product-library"] button')).some((button) => (button.textContent ?? '').trim() === '编辑'),
      hasDelete: Array.from(document.querySelectorAll('[data-testid="v2-product-library"] button')).some((button) => (button.textContent ?? '').trim() === '删除'),
      body: document.querySelector('[data-testid="v2-product-library"]')?.textContent ?? '',
    }))()`,
  );
  check(
    "manualProductCenterUsesOneExplicitProductWithSquareCardAndFullMetrics",
    state.cardCount === 1 && state.selectorCount === 1 && state.metricCount === 16 && state.hasImage && state.hasEdit && state.hasDelete && state.body.includes("E2E手动商品"),
    state,
  );
  const screenshot = await capture(client, "v2-product-manual-desktop");
  return { ...state, screenshot };
};

const scopedTargetRegression = async (client) => {
  const switchToFullJuneRange = async () => {
    await clickText(client, "月", "[data-testid='v2-home-toolbar'] button");
    await waitForExpression(
      client,
      `document.querySelector('[data-testid="v2-home-toolbar"]')?.innerText.includes('2026-06-01 ~ 2026-06-30')`,
      30000,
    );
  };

  const setScopeTarget = async (scopeLabel, scopeKey, value) => {
    await navigate(client, "/v2/target-center", "[data-testid='v2-brand-target-center']");
    await waitForExpression(
      client,
      `Array.from(document.querySelectorAll('[data-testid="v2-brand-target-center"] button')).some((button) => (button.textContent ?? '').trim() === ${JSON.stringify(scopeLabel)} && !button.disabled)`,
      30000,
    );
    await clickText(client, scopeLabel, "[data-testid='v2-brand-target-center'] button");
    await waitForExpression(client, `Boolean(document.querySelector('#v2-target-${scopeKey}-gmv'))`, 30000);
    await setControlValueBySelector(client, 'input[type="month"]', "2026-06");
    await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') !== 'loading'`, 30000);
    await setControlValueBySelector(client, `#v2-target-${scopeKey}-gmv`, String(value));
    await waitForExpression(client, `document.querySelector('[data-testid="v2-target-auto-save-status"]')?.getAttribute('data-save-state') === 'saved' && document.body.innerText.includes("已自动保存") && document.body.innerText.includes(${JSON.stringify(`${scopeLabel}目标`)})`, 30000);
    return evaluate(
      client,
      `(() => ({
        month: document.querySelector('input[type="month"]')?.value ?? null,
        dataMonthVisible: document.body.innerText.includes('经营数据最新月份 2026-06'),
        value: document.querySelector('#v2-target-${scopeKey}-gmv')?.value ?? null,
        selectedSeriesId: ${JSON.stringify(scopeKey)} === 'series' ? Array.from(document.querySelectorAll('select')).at(-1)?.value ?? null : null,
      }))()`,
    );
  };

  const storeTarget = await setScopeTarget("店铺", "platform", 200000);
  await navigate(client, "/v2/store-board", "[data-testid='v2-store-board-dashboard']");
  await switchToFullJuneRange();
  await waitForExpression(client, `document.querySelector('[data-testid="v2-store-metrics"] [data-metric-key="gmv"]')?.getAttribute('data-target-state') === 'ready'`, 30000);
  const storeState = await evaluate(client, `(() => ({
    metricCount: document.querySelectorAll('[data-testid="v2-store-metrics"] [data-metric-key]').length,
    targetLabel: document.querySelector('[data-testid="v2-store-metrics"] [data-metric-key="gmv"]')?.getAttribute('aria-label') ?? '',
    hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
    hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
  }))()`);
  check("storeTargetAppearsOnFullMetricSurface", storeTarget.month === "2026-06" && storeTarget.dataMonthVisible && storeState.metricCount === 16 && storeState.targetLabel.includes("总目标 200,000") && storeState.hasDayMode && storeState.hasDlyMode === false, { storeTarget, storeState });

  const seriesTarget = await setScopeTarget("系列", "series", 100000);
  if (!seriesTarget.selectedSeriesId) throw new Error("series_target_selection_missing");
  await navigate(client, `/v2/series-board?seriesId=${encodeURIComponent(seriesTarget.selectedSeriesId)}`, "[data-testid='v2-series-board-dashboard']");
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-series-metrics"]'))`, 30000);
  const brandSeriesTargetState = await evaluate(
    client,
    `(() => ({
      targetState: document.querySelector('[data-testid="v2-series-metrics"] [data-metric-key="gmv"]')?.getAttribute('data-target-state') ?? null,
      targetText: document.querySelector('[data-testid="v2-series-metrics"] [data-metric-key="gmv"]')?.textContent ?? '',
      scopeText: document.querySelector('[data-testid="v2-series-metrics"]')?.textContent ?? '',
      hasStoreBreakdown: Boolean(document.querySelector('[data-testid="v2-series-store-breakdown"]')),
    }))()`,
  );
  check(
    "brandSeriesSummaryDoesNotMergeStoreTargets",
      brandSeriesTargetState.targetState === "empty" &&
      brandSeriesTargetState.targetText.includes("不合并单店目标") &&
      brandSeriesTargetState.scopeText.includes("品牌汇总") &&
      brandSeriesTargetState.hasStoreBreakdown === false,
    brandSeriesTargetState,
  );
  await click(client, '[data-testid="v2-series-analysis-lens"] [aria-label="单店拆解"]');
  await waitForExpression(
    client,
    `window.location.search.includes('lens=store') && Boolean(document.querySelector('[data-testid="v2-home-toolbar"] input[type="radio"]:checked'))`,
    30000,
  );
  await switchToFullJuneRange();
  await waitForExpression(client, `document.querySelector('[data-testid="v2-series-metrics"] [data-metric-key="gmv"]')?.getAttribute('data-target-state') === 'ready'`, 30000);
  const seriesState = await evaluate(client, `(() => ({
    targetLabel: document.querySelector('[data-testid="v2-series-metrics"] [data-metric-key="gmv"]')?.getAttribute('aria-label') ?? '',
    hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
    hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
  }))()`);
  check("seriesTargetAppearsForMatchingJuneSeries", seriesTarget.month === "2026-06" && seriesState.targetLabel.includes("总目标 100,000") && seriesState.hasDayMode && seriesState.hasDlyMode === false, { seriesTarget, seriesState });

  const productTarget = await setScopeTarget("商品", "product", 50000);
  await navigate(client, "/v2/product-board", "[data-testid='v2-product-board-dashboard']");
  await switchToFullJuneRange();
  await waitForExpression(client, `document.querySelector('[data-testid="v2-product-metrics"] [data-metric-key="gmv"]')?.getAttribute('data-target-state') === 'ready'`, 30000);
  const productState = await evaluate(client, `(() => ({
    targetLabel: document.querySelector('[data-testid="v2-product-metrics"] [data-metric-key="gmv"]')?.getAttribute('aria-label') ?? '',
    hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
    hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
  }))()`);
  check("manualProductTargetAppearsForMatchingJuneProduct", productTarget.month === "2026-06" && productState.targetLabel.includes("总目标 50,000") && productState.hasDayMode && productState.hasDlyMode === false, { productTarget, productState });

  return { storeTarget, storeState, seriesTarget, seriesState, productTarget, productState };
};

const homeGmvValue = async (client) => evaluate(
  client,
  `(() => {
    const value = document.querySelector('[data-metric-key="gmv"] p[title]')?.getAttribute('title') ?? '';
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  })()`,
);

const appendSecondStoreRegression = async (client, files) => {
  await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
  await waitForHomeReady(client, 45000);
  const firstGmv = await homeGmvValue(client);
  check("secondStoreBaselineUsesBrandScope", typeof firstGmv === "number" && firstGmv > 0, {
    firstGmv,
  });

  await navigate(client, "/v2/upload", "[data-testid='upload-page-v1-dashboard']");
  await waitForExpression(client, `document.readyState === "complete"`, 30000);
  await wait(500);
  await setControlValueBySelector(client, 'input[placeholder="店铺名称"]', "E2E第二店");
  await setControlValueBySelector(client, 'input[placeholder^="店铺 ID"]', "e2e-store-2");
  await clickText(client, "添加并选择");
  await waitForExpression(client, `document.body.innerText.includes("新店铺已选为本次上传目标")`, 10000);
  const preUploadState = await evaluate(
    client,
    `(() => ({
      selectedStore: document.querySelector('select')?.value ?? null,
      appendChecked: Boolean(Array.from(document.querySelectorAll('input[type="radio"]')).find((input) => input.checked && input.closest('label')?.textContent?.includes("追加店铺/批次"))),
    }))()`,
  );
  check("secondStoreDefaultsToExplicitAppend", preUploadState.selectedStore === "tmall::e2e-store-2" && preUploadState.appendChecked, preUploadState);
  const selectedFileCount = await setInputFiles(client, files);
  check("secondStoreUploadReceives18Files", selectedFileCount === 18, { selectedFileCount });
  await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length === 18`, 120000);
  await click(client, "[data-testid='upload-page-v2-import-button']");
  await waitForExpression(client, `Boolean(document.querySelector('[data-testid="upload-page-v2-result-summary"]'))`, 120000);
  const counts = await importCounts(client);
  check("secondStoreUpload18Counts", counts.success === 18 && counts.failed === 0 && counts.skipped === 0, counts);

  await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
  await waitForHomeReady(client, 45000);
  await waitForExpression(client, `document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent?.includes("全部店铺 (2)")`, 30000);
  const secondGmv = await homeGmvValue(client);
  const state = await evaluate(
    client,
    `(() => ({
      toolbar: document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent ?? '',
      storeCheckboxes: document.querySelectorAll('[data-testid="v2-home-toolbar"] details input[type="checkbox"]').length,
    }))()`,
  );
  const expected = typeof firstGmv === "number" ? firstGmv * 2 : null;
  const tolerance = expected === null ? null : Math.max(0.02, Math.abs(expected) * 0.000001);
  check("twoStoreHomeAggregatesWithoutCrossStoreDedup", expected !== null && secondGmv !== null && Math.abs(secondGmv - expected) <= tolerance && state.storeCheckboxes === 2, {
    firstGmv,
    secondGmv,
    expected,
    tolerance,
    ...state,
  });

  await navigate(client, "/v2/data-health", "[data-testid='v2-runtime-data-health']");
  const healthState = await evaluate(
    client,
    `(() => ({
      body: document.querySelector('main')?.textContent ?? '',
      snapshotRows: document.querySelectorAll('[data-testid="v2-runtime-data-health"] section:last-child > div:last-child > div').length,
    }))()`,
  );
  check("appendStrategyAndSnapshotAuditVisible", healthState.body.includes("追加导入") && healthState.body.includes("append") && healthState.body.includes("仅审计"), healthState);
  return { preUploadState, counts, firstGmv, secondGmv, healthState };
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

    currentStage = "v2_target_center_without_operating_data";
    const targetCenterPreconditionState = await targetCenterPreconditionRegression(client);
    const targetCenterWritableState = await targetCenterWritableRegression(client);

    currentStage = "v2_upload_target_foundation_removed";
    const uploadTargetFoundationState = await uploadTargetFoundationRemovedRegression(client);

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
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 16`, 30000);
    const homeState = await evaluate(
      client,
      `(() => {
        const conversionCard = document.querySelector('[data-metric-key="conversionRate"]');
        const gmvCard = document.querySelector('[data-metric-key="gmv"]');
        return {
          metricCount: document.querySelectorAll('[data-metric-key]').length,
          dataHealthText: document.querySelector('[data-testid="v2-home-data-health-summary"]')?.textContent ?? "",
          toolbarText: document.querySelector('[data-testid="v2-home-toolbar"]')?.textContent ?? "",
          hasUploadPrompt: document.body.innerText.includes("前往上传"),
          conversionLabel: conversionCard?.getAttribute('aria-label') ?? '',
          gmvLabel: gmvCard?.getAttribute('aria-label') ?? '',
          hasBrandKeywordPaidShare: Boolean(document.querySelector('[data-metric-key="brandKeywordPaidShare"]')),
          visitorsValue: document.querySelector('[data-metric-key="visitors"] p[title]')?.getAttribute('title') ?? '',
          paidBuyersValue: document.querySelector('[data-metric-key="paidBuyers"] p[title]')?.getAttribute('title') ?? '',
          hasUnavailablePlaceholders:
            Boolean(document.querySelector('[data-metric-key="mtdTurnover"]')) ||
            Boolean(document.querySelector('[data-metric-key="regionalFulfillmentRate"]')),
          hasDayMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DAY'),
          hasDlyMode: Array.from(document.querySelectorAll('[data-testid="v2-home-chart"] button')).some((button) => (button.textContent ?? '').trim() === 'DLY'),
        };
      })()`,
    );
    check(
      "v2HomeShowsBalanced16RealMetricSurface",
      homeState.metricCount === 16 &&
        homeState.hasBrandKeywordPaidShare === false &&
        homeState.hasUnavailablePlaceholders === false &&
        homeState.hasDayMode &&
        homeState.hasDlyMode === false &&
        homeState.visitorsValue === "143,076" &&
        homeState.paidBuyersValue === "128",
      homeState,
    );
    check(
      "v2HomeTrendFooterHealthRowRemoved",
      homeState.dataHealthText === "",
      homeState,
    );
    check("v2HomeLeavesEmptyState", homeState.hasUploadPrompt === false, homeState);
    check("v2HomeRateTargetIsNotDayProrated", homeState.conversionLabel.includes("MTD目标 92%"), homeState);
    check(
      "v2HomeAdditiveTargetProgressUsesDisplayedStageTarget",
      homeState.gmvLabel.includes("MTD目标 50,000") &&
        homeState.gmvLabel.includes("差值 +75,596") &&
        homeState.gmvLabel.includes("完成率 251.19%"),
      homeState,
    );
    const firstStoreGmv = await homeGmvValue(client);
    check("v2HomeGmvIsNumericAfterUpload", typeof firstStoreGmv === "number" && firstStoreGmv > 0, { firstStoreGmv });
    await click(client, '[data-metric-key="conversionRate"]');
    await waitForExpression(client, `document.querySelector('#v2-home-chart-primary')?.value === 'conversionRate' && document.querySelector('[data-metric-key="conversionRate"]')?.getAttribute('aria-pressed') === 'true'`, 30000);
    const homeMetricChartSyncState = await evaluate(
      client,
      `(() => ({
        primaryMetric: document.querySelector('#v2-home-chart-primary')?.value ?? null,
        conversionSelected: document.querySelector('[data-metric-key="conversionRate"]')?.getAttribute('aria-pressed') ?? null,
      }))()`,
    );
    check("homeMetricCardSynchronizesTrendPrimaryMetric", homeMetricChartSyncState.primaryMetric === "conversionRate" && homeMetricChartSyncState.conversionSelected === "true", homeMetricChartSyncState);
    const homeDesktopScreenshot = await capture(client, "v2-home-desktop");

    currentStage = "v2_home_custom_and_comparison";
    const homeInteractionState = await homeCustomComparisonRegression(client);

    currentStage = "v2_home_cross_month_target";
    const homeCrossMonthTargetState = await homeCrossMonthTargetRegression(client);

    currentStage = "v2_unified_runtime_routes";
    const unifiedRouteState = await unifiedRouteRegression(client);

    currentStage = "v2_series_configuration";
    const seriesConfigurationState = await seriesConfigurationRegression(client, firstStoreGmv);

    currentStage = "v2_manual_product_configuration";
    const manualProductState = await manualProductRegression(client);

    currentStage = "v2_scoped_target_visibility";
    const scopedTargetState = await scopedTargetRegression(client);

    await navigate(client, "/v2/home", "[data-testid='v2-home-dashboard']");
    await waitForHomeReady(client, 45000);

    currentStage = "metric_settings_customize";
    await clickText(client, "指标设置");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-home-metric-settings"]'))`, 10000);
    const metricSettingsCount = await evaluate(
      client,
      `document.querySelectorAll('[data-testid="v2-home-metric-settings"] input[aria-label^="显示"]').length`,
    );
    check("metricSettingsHas16MetricControls", metricSettingsCount === 16, { count: metricSettingsCount });
    await click(client, "[aria-label='显示投入产出比']");
    await click(client, "[aria-label='显示品牌词访客']");
    await click(client, "[aria-label='下移GMV']");
    await clickText(client, "完成", "[data-testid='v2-home-metric-settings'] button");
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 14`, 10000);
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
      customizedMetricState.count === 14 &&
        customizedMetricState.firstKey === "gsv" &&
        customizedMetricState.hasAdRoi === false &&
        customizedMetricState.hasBrandVisitors === false,
      customizedMetricState,
    );

    currentStage = "refresh_restore_customized_metrics";
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 14`, 30000);
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
      refreshedState.metricCount === 14 &&
        refreshedState.dataHealthText === "" &&
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
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 16`, 10000);
    const resetState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        firstMetricKey: document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') ?? null,
      }))()`,
    );
    check("resetRestores16Metrics", resetState.metricCount === 16 && resetState.firstMetricKey === "gmv", resetState);

    currentStage = "refresh_restore_reset_metrics";
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 16`, 30000);
    const resetRefreshedState = await evaluate(
      client,
      `(() => ({
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        firstMetricKey: document.querySelector('[data-metric-key]')?.getAttribute('data-metric-key') ?? null,
      }))()`,
    );
    check(
      "refreshAfterResetRestores16Metrics",
      resetRefreshedState.metricCount === 16 && resetRefreshedState.firstMetricKey === "gmv",
      resetRefreshedState,
    );

    currentStage = "v2_home_mobile";
    await setViewport(client, 390, 900);
    await reloadPage(client);
    await waitForHomeReady(client, 45000);
    await waitForExpression(client, `document.querySelectorAll('[data-metric-key]').length === 16`, 30000);
    const mobileSafety = await evaluate(
      client,
      `(() => ({
        horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1,
        metricCount: document.querySelectorAll('[data-metric-key]').length,
      }))()`,
    );
    check("mobileHomeHasNoPageWideOverflow", mobileSafety.horizontalOverflow === false, mobileSafety);
    const homeMobileScreenshot = await capture(client, "v2-home-mobile");

    currentStage = "v2_decision_boards_mobile";
    const mobileBoardSafety = {};
    for (const spec of [
      { name: "series", route: "/v2/series-board", selector: "[data-testid='v2-series-board-dashboard']" },
      { name: "store", route: "/v2/store-board", selector: "[data-testid='v2-store-board-dashboard']" },
      { name: "product", route: "/v2/product-board", selector: "[data-testid='v2-product-board-dashboard']" },
    ]) {
      await navigate(client, spec.route, spec.selector);
      await waitForExpression(client, `!document.body.innerText.includes("\u6b63\u5728\u8bfb\u53d6")`, 45000);
      const state = await evaluate(
        client,
        `(() => ({
          pathname: window.location.pathname,
          horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1,
        }))()`,
      );
      check(`mobileDecisionBoard.${spec.name}`, state.pathname === spec.route && state.horizontalOverflow === false, state);
      mobileBoardSafety[spec.name] = state;
    }

    currentStage = "v2_second_store_append";
    const appendSecondStoreState = await appendSecondStoreRegression(client, files);

    if (CLEANUP_AFTER_REGRESSION) {
      currentStage = "cleanup_after_regression";
      cleanupState = await cleanupRuntimeAndDebugRecords(client);
    }

    check("consoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    check("networkBusinessErrorsZero", client.failedBusinessRequests.length === 0, client.failedBusinessRequests);

    const result = {
      status: "PASS",
      validator: "validate-v2-home-upload18-system-chrome-local-v1",
      checks,
      artifacts: {
        artifactDir: ARTIFACT_DIR,
        uploadScreenshot,
        homeDesktopScreenshot,
        homeMobileScreenshot,
        seriesDesktopScreenshot: seriesConfigurationState.seriesDesktopScreenshot,
        targetCenterScreenshot: targetCenterWritableState.screenshot,
      },
      counts,
      homeState,
      homeMetricChartSyncState,
      refreshedState,
      resetState,
      resetRefreshedState,
      mobileSafety,
      firstStoreGmv,
      homeInteractionState,
      homeCrossMonthTargetState,
      unifiedRouteState,
      seriesConfigurationState,
      manualProductState,
      scopedTargetState,
      mobileBoardSafety,
      targetCenterPreconditionState,
      targetCenterWritableState,
      uploadTargetFoundationState,
      appendSecondStoreState,
      cleanupState,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const result = {
      status: "FAIL",
      validator: "validate-v2-home-upload18-system-chrome-local-v1",
      stage: currentStage,
      checks,
      error: error instanceof Error ? error.message : String(error),
      artifactDir: ARTIFACT_DIR,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.error(JSON.stringify(result, null, 2));
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
