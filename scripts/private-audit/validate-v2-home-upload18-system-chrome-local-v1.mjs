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
const ARTIFACT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v2-home-upload18-local-"));

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

const navigate = async (client, route, readySelector) => {
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await waitForExpression(client, `Boolean(document.querySelector(${JSON.stringify(readySelector)}))`, 30000);
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

const setInputFiles = async (client, filePaths) => {
  const documentResult = await client.send("DOM.getDocument", { depth: -1, pierce: true });
  const input = await client.send("DOM.querySelector", {
    nodeId: documentResult.root.nodeId,
    selector: "input[type=file][multiple]",
  });
  if (!input?.nodeId) throw new Error("multiple_file_input_missing");
  await client.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: filePaths });
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

const filePaths = () =>
  fs
    .readdirSync(SAMPLE_DIR)
    .filter((name) => /\.(csv|xls|xlsx)$/i.test(name))
    .sort()
    .map((name) => path.join(SAMPLE_DIR, name));

const run = async () => {
  const server = await ensureServer();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-system-chrome-upload18-"));
  const launchedChrome = await launchChrome(profileDir);
  let client;
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
    await navigate(client, "/upload", "[data-testid='upload-page-v1-dashboard']");
    await setInputFiles(client, files);
    await waitForExpression(client, `document.querySelectorAll('[data-testid="upload-page-v2-recognition-item"]').length === 18`, 30000);
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
    await client.send("Page.reload", { ignoreCache: false });
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
    await client.send("Page.reload", { ignoreCache: false });
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
    await client.send("Page.reload", { ignoreCache: false });
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
