import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.V2_TARGET_DIAG_PORT ?? "3000");
const BASE_URL = process.env.V2_TARGET_DIAG_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = process.env.V2_TARGET_DIAG_ARTIFACT_DIR
  ? path.resolve(process.env.V2_TARGET_DIAG_ARTIFACT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "airburg-v2-target-diag-"));
const PROFILE_DIR = process.env.V2_TARGET_DIAG_PROFILE_DIR
  ? path.resolve(process.env.V2_TARGET_DIAG_PROFILE_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "airburg-system-chrome-target-diag-"));

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

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
  if (await waitForHttp200(`${BASE_URL}/v2/home`, 3000)) return null;
  const server = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (!(await waitForHttp200(`${BASE_URL}/v2/home`, 45000))) {
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
    if (message.method === "Runtime.exceptionThrown") {
      const description =
        message.params?.exceptionDetails?.exception?.description ??
        message.params?.exceptionDetails?.text ??
        "runtime_exception";
      this.consoleErrors.push(String(description).slice(0, 500));
    }
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
      if (status >= 400 && !url.includes("favicon.ico")) this.failedBusinessRequests.push(`${status}:${url}`);
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

const launchChrome = async () => {
  const chrome = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${PROFILE_DIR}`,
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const activePortFile = path.join(PROFILE_DIR, "DevToolsActivePort");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if (chrome.exitCode !== null) throw new Error("chrome_exited_early");
      const portText = fs.readFileSync(activePortFile, "utf8").split("\n")[0]?.trim() ?? "";
      const port = Number(portText);
      if (!Number.isInteger(port) || port <= 0) throw new Error("missing_port");
      const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      if (!version?.webSocketDebuggerUrl) throw new Error("unexpected_cdp");
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

const setViewport = async (client, width, height) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 390,
  });
};

const navigate = async (client, route) => {
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await waitForExpression(client, `window.location.pathname === ${JSON.stringify(route)} && document.readyState === "complete"`, 30000);
  await wait(1500);
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

const pageState = async (client, selector = "body") =>
  evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const text = element instanceof HTMLElement ? element.innerText : document.body.innerText;
      const forbidden = ["V0.5F", "schema", "TARGET CENTER", "BLOCKED_BY_MISSING_CONTRACT", "safe warning code", "问题 code", "安全短码", "active dataset"];
      return {
        pathname: window.location.pathname,
        readyState: document.readyState,
        text,
        textSnippet: text.slice(0, 2000),
        hasForbiddenBusinessCopy: forbidden.filter((token) => text.includes(token)),
      };
    })()`,
  );

const run = async () => {
  const server = await ensureServer();
  const chrome = await launchChrome();
  let client;
  const checks = [];
  const check = (name, pass, details = undefined) => {
    checks.push({ name, pass, details });
    if (!pass) throw new Error(name);
  };

  try {
    client = await CdpClient.connect(await debuggerUrl(chrome.port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await setViewport(client, 1440, 1000);

    await navigate(client, "/v2/target-center");
    const targetState = await pageState(client);
    const targetScreenshot = await capture(client, "target-center-desktop");
    check(
      "targetCenterDirectRouteRendersBusinessState",
      targetState.text.includes("目标中心") &&
        targetState.text.includes("目标设置说明") &&
        targetState.hasForbiddenBusinessCopy.length === 0,
      targetState,
    );

    await navigate(client, "/v2/upload");
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-upload-target-foundation"]'))`, 30000);
    const uploadTargetState = await pageState(client, "[data-testid='v2-upload-target-foundation']");
    const uploadScreenshot = await capture(client, "upload-target-foundation-desktop");
    check(
      "uploadTargetFoundationRendersCurrentBusinessCopy",
      uploadTargetState.text.includes("目标中心数据底座") &&
        uploadTargetState.text.includes("下方四类报表用于初始化目标中心") &&
        uploadTargetState.text.includes("批量选择文件") &&
        uploadTargetState.hasForbiddenBusinessCopy.length === 0,
      uploadTargetState,
    );

    check("targetDiagnosticConsoleErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    check("targetDiagnosticNetworkErrorsZero", client.failedBusinessRequests.length === 0, client.failedBusinessRequests);

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          validator: "diagnose-v2-target-center-system-chrome-v1",
          checks,
          artifacts: {
            artifactDir: ARTIFACT_DIR,
            targetScreenshot,
            uploadScreenshot,
          },
          profileDir: PROFILE_DIR,
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
          validator: "diagnose-v2-target-center-system-chrome-v1",
          error: error instanceof Error ? error.message : String(error),
          checks,
          consoleErrors: client?.consoleErrors ?? [],
          failedBusinessRequests: client?.failedBusinessRequests ?? [],
          artifactDir: ARTIFACT_DIR,
          profileDir: PROFILE_DIR,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    client?.close();
    chrome.chrome.kill("SIGTERM");
    server?.kill("SIGTERM");
  }
};

await run();
