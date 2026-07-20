import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.SAAS_V2_E2E_PORT ?? "3000");
const BASE_URL = process.env.SAAS_V2_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = process.env.SAAS_V2_ARTIFACT_DIR
  ? path.resolve(process.env.SAAS_V2_ARTIFACT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "airburg-saas-v2-ten-route-"));
const PROFILE_DIR = process.env.SAAS_V2_PROFILE_DIR
  ? path.resolve(process.env.SAAS_V2_PROFILE_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "airburg-saas-v2-ten-route-profile-"));
const CLEANUP_RUNTIME_DEBUG = process.env.SAAS_V2_CLEANUP_RUNTIME_DEBUG === "1";
const LEGACY_RUNTIME_COMPATIBILITY_KEY = "airburg_tmall_analysis_v2";

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const routeFilter = new Set(
  (process.env.SAAS_V2_ROUTE_FILTER ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const allRoutes = [
  { path: "/v2/home", ready: "main", label: "v2-home" },
  { path: "/v2/series-board", ready: "main", label: "v2-series-board" },
  { path: "/v2/store-board", ready: "main", label: "v2-store-board" },
  { path: "/v2/product-board", ready: "main", label: "v2-product-board" },
  { path: "/v2/upload", ready: "[data-testid='upload-page-v1-dashboard']", label: "v2-upload" },
  { path: "/v2/upload/history", ready: "main", label: "v2-upload-history" },
  { path: "/v2/data-health", ready: "main", label: "v2-data-health" },
  { path: "/v2/target-center", ready: "main", label: "v2-target-center" },
  { path: "/v2/search-assets", ready: "[data-testid='v2-search-assets-workspace']", label: "v2-search-assets" },
  { path: "/v2/exclusion-rules", ready: "[data-testid='v2-exclusion-rules-workspace']", label: "v2-exclusion-rules" },
];

const routes = routeFilter.size > 0 ? allRoutes.filter((route) => routeFilter.has(route.path)) : allRoutes;

if (routes.length === 0) {
  throw new Error(`empty_route_filter:${Array.from(routeFilter).join(",")}`);
}

const forbiddenCopy = [
  "V2 preview routes only",
  "Dataset: preview pending",
  "本地 preview",
  "不写入真实数据",
  "不改变 Target",
  "debug-context",
  "legacy BI state",
  "persistence schema",
  "route contract",
  "BLOCKED_BY_MISSING_CONTRACT",
  "V0.5F",
  "TARGET CENTER",
  "Airburg Business Workspace",
  "品牌经营分析工作区",
  "safe issue code",
];

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

const isLocalBaseUrl = () => /\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE_URL);

const ensureServer = async () => {
  if (await waitForHttp200(`${BASE_URL}/v2/home`, 3000)) return null;
  if (!isLocalBaseUrl()) throw new Error(`remote_base_url_unavailable:${BASE_URL}`);
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
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") this.consoleErrors.push("console_error");
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

const setViewport = async (client, width, height) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 430,
  });
  await wait(200);
};

const routePath = (route) => route.split("?")[0];

const navigate = async (client, route, readySelector) => {
  await client.send("Page.navigate", { url: `${BASE_URL}${route}` });
  await waitForExpression(
    client,
    `window.location.pathname === ${JSON.stringify(routePath(route))} && Boolean(document.querySelector(${JSON.stringify(readySelector)}))`,
    30000,
  );
  await waitForExpression(client, `document.readyState === "complete"`, 30000);
  await wait(350);
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

const inspectRoute = async (client, route) => {
  await navigate(client, route.path, route.ready);
  const state = await evaluate(
    client,
    `(() => {
      const text = document.body.innerText;
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({
        text: (link.textContent ?? '').replace(/\\s+/g, ' ').trim(),
        href: link.getAttribute('href'),
      }));
      return {
        pathname: window.location.pathname,
        title: document.title,
        bodyText: text,
        hasMain: Boolean(document.querySelector('main')),
        hasV2Topbar: text.includes("空气堡经营工作区") || window.location.pathname === "/v2/home",
        hasV2PageHeader: Boolean(document.querySelector('[data-testid="saas-v2-compact-page-header"]')) || window.location.pathname === "/v2/home",
        hasForbiddenCopy: ${JSON.stringify(forbiddenCopy)}.filter((token) => text.includes(token)),
        horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1,
        links,
      };
    })()`,
  );
  const screenshot = await capture(client, `${route.label}-desktop`);
  const details = {
    pathname: state.pathname,
    title: state.title,
    hasMain: state.hasMain,
    hasV2Topbar: state.hasV2Topbar,
    hasV2PageHeader: state.hasV2PageHeader,
    hasForbiddenCopy: state.hasForbiddenCopy,
    horizontalOverflow: state.horizontalOverflow,
    linkCount: state.links.length,
    nonV2Links: state.links.filter((link) => link.href && !link.href.startsWith("/v2")).slice(0, 10),
    screenshot,
  };
  check(`${route.label}DesktopReachable`, state.pathname === route.path && state.hasMain, details);
  check(`${route.label}UsesTruthfulV2ShellCopy`, state.hasV2Topbar && state.hasV2PageHeader && state.hasForbiddenCopy.length === 0, details);
  check(`${route.label}DesktopNoWideOverflow`, state.horizontalOverflow === false, details);
  return details;
};

const inspectRouteMobile = async (client, route) => {
  await navigate(client, route.path, route.ready);
  const state = await evaluate(
    client,
    `(() => ({
      pathname: window.location.pathname,
      horizontalOverflow: Math.ceil(document.documentElement.scrollWidth) > Math.ceil(document.documentElement.clientWidth) + 1,
      bodyText: document.body.innerText,
      emptyStatePrimaryCtas: Array.from(document.querySelectorAll('[data-testid="safe-empty-state-primary-cta"]')).map((link) => ({
        text: (link.textContent ?? '').replace(/\\s+/g, ' ').trim(),
        href: link.getAttribute('href'),
      })),
    }))()`,
  );
  const screenshot = await capture(client, `${route.label}-mobile`);
  const details = { ...state, screenshot, bodyText: undefined };
  check(`${route.label}MobileReachable`, state.pathname === route.path, details);
  check(`${route.label}MobileNoWideOverflow`, state.horizontalOverflow === false, details);
  if (["/v2/series-board", "/v2/store-board", "/v2/product-board"].includes(route.path)) {
    check(
      `${route.label}MobileEmptyStateCtaPointsToV2Upload`,
      state.emptyStatePrimaryCtas.length === 1 &&
        state.emptyStatePrimaryCtas[0]?.text === "前往数据接入" &&
        state.emptyStatePrimaryCtas[0]?.href === "/v2/upload",
      state.emptyStatePrimaryCtas,
    );
  }
  if (route.path === "/v2/search-assets") {
    await evaluate(
      client,
      `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((item) => /开始配置|编辑搜索资产/.test((item.textContent ?? '').trim()));
        button?.click();
        return Boolean(button);
      })()`,
    );
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-search-assets-filter-popover"]'))`, 10000);
    const modalState = await evaluate(
      client,
      `(() => {
        const dialog = document.querySelector('[data-testid="v2-search-assets-filter-popover"]');
        const content = document.querySelector('[data-testid="v2-search-assets-filter-popover-scrollable-content"]');
        const footer = document.querySelector('[data-testid="v2-search-assets-filter-popover-fixed-footer"]');
        const cards = Array.from(document.querySelectorAll('[data-testid="v2-search-assets-filter-popover-center-word-group-card"]'));
        const buttons = Array.from(dialog?.querySelectorAll('button') ?? []).map((button) => (button.textContent ?? '').replace(/\\s+/g, ' ').trim());
        const footerRect = footer?.getBoundingClientRect();
        const contentStyle = content ? getComputedStyle(content) : null;
        return {
          hasDialog: Boolean(dialog),
          documentScrollHeight: document.documentElement.scrollHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          hasScrollableContent: contentStyle ? /(auto|scroll)/.test(contentStyle.overflowY) : false,
          footerVisible: footerRect ? footerRect.bottom <= window.innerHeight + 1 && footerRect.top >= 0 : false,
          cardCount: cards.length,
          duplicateActionButtons: buttons.filter((text) => text === '查看' || text === '编辑分组').length,
          hasFooterActions: ['取消', '清空', '保存'].every((text) => buttons.includes(text)),
        };
      })()`,
    );
    const modalScreenshot = await capture(client, "v2-search-assets-mobile-modal");
    check(
      "v2SearchAssetsMobile390ModalFooterReachable",
      modalState.hasDialog &&
        modalState.viewportWidth === 390 &&
        modalState.viewportHeight === 844 &&
        modalState.documentScrollWidth <= modalState.viewportWidth + 1 &&
        modalState.hasScrollableContent &&
        modalState.footerVisible &&
        modalState.cardCount >= 4 &&
        modalState.duplicateActionButtons === 0 &&
        modalState.hasFooterActions,
      { ...modalState, modalScreenshot },
    );
    await evaluate(client, `document.querySelector('[data-testid="v2-search-assets-filter-popover"] button')?.click()`);
  }
  return details;
};

const emptyBoardPrimaryCtaPointsToV2Upload = (state) => {
  const matchingLinks = state.links.filter((link) => link.text === "前往数据接入" && link.href === "/v2/upload");
  return matchingLinks.length === 1 && state.emptyStatePrimaryCtaCount === 1;
};

const routeSpecificChecks = async (client) => {
  const state = await evaluate(
    client,
    `(() => {
      const text = document.body.innerText;
      const links = Array.from(document.querySelectorAll('a')).map((link) => ({ text: (link.textContent ?? '').trim(), href: link.getAttribute('href') }));
      return {
        path: window.location.pathname,
        text,
        links,
        metricCount: document.querySelectorAll('[data-metric-key]').length,
        emptyStatePrimaryCtaCount: document.querySelectorAll('[data-testid="safe-empty-state-primary-cta"]').length,
        hasUploadTargetFoundation: Boolean(document.querySelector('[data-testid="v2-upload-target-foundation"]')),
        targetDrawerLabelCount: Array.from(document.querySelectorAll('[role="dialog"] span')).filter((element) => (element.textContent ?? '').trim() === '平台和店铺').length,
        hasDeleteButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent ?? '').trim() === '删除'),
      };
    })()`,
  );
  if (state.path === "/v2/home") {
    const hasV2UploadCta = state.links.some((link) => link.text.includes("前往上传") && link.href === "/v2/upload");
    check(
      "v2HomeEitherShows17MetricsOrSafeEmptyV2UploadCta",
      state.metricCount === 17 || hasV2UploadCta,
      { metricCount: state.metricCount, hasV2UploadCta },
    );
  }
  if (state.path === "/v2/series-board") {
    check(
      "v2SeriesBoardEmptyStateIsCompactWhenNoRuntimeData",
      state.text.includes("暂无系列数据") &&
        emptyBoardPrimaryCtaPointsToV2Upload(state) &&
        !state.text.includes("GMV--") &&
        !state.text.includes("趋势--") &&
        !state.text.includes("目标达成--"),
      { text: state.text.slice(0, 1200), links: state.links, emptyStatePrimaryCtaCount: state.emptyStatePrimaryCtaCount },
    );
  }
  if (state.path === "/v2/store-board") {
    check(
      "v2StoreBoardEmptyStateIsCompactWhenNoRuntimeData",
      state.text.includes("暂无店铺数据") &&
        emptyBoardPrimaryCtaPointsToV2Upload(state) &&
        !state.text.includes("GMV--") &&
        !state.text.includes("趋势--") &&
        !state.text.includes("目标达成--"),
      { text: state.text.slice(0, 1200), links: state.links, emptyStatePrimaryCtaCount: state.emptyStatePrimaryCtaCount },
    );
  }
  if (state.path === "/v2/product-board") {
    check(
      "v2ProductBoardEmptyStateIsCompactWhenNoRuntimeData",
      state.text.includes("暂无重点商品数据") &&
        emptyBoardPrimaryCtaPointsToV2Upload(state) &&
        !state.text.includes("GMV--") &&
        !state.text.includes("趋势--") &&
        !state.text.includes("目标达成--"),
      { text: state.text.slice(0, 1200), links: state.links, emptyStatePrimaryCtaCount: state.emptyStatePrimaryCtaCount },
    );
  }
  if (state.path === "/v2/upload") {
    check(
      "v2UploadKeepsV2LayoutAndFourSourceSection",
      state.hasUploadTargetFoundation &&
        state.text.includes("18 文件入口") &&
        state.text.includes("目标中心数据底座") &&
        state.text.includes("下方四类报表用于初始化目标中心") &&
        !state.text.includes("V0.5F"),
      { hasUploadTargetFoundation: state.hasUploadTargetFoundation },
    );
  }
  if (state.path === "/v2/data-health") {
    check(
      "v2DataHealthLinksStayInV2",
      state.links.some((link) => link.href === "/v2/upload") || state.links.some((link) => link.href === "/v2/home"),
      state.links,
    );
  }
  if (state.path === "/v2/target-center") {
    check(
      "v2TargetCenterBoundaryNoHardDelete",
      state.text.includes("目标设置说明") &&
        state.text.includes("暂停") &&
        state.text.includes("重新启用") &&
        !state.text.includes("TARGET CENTER") &&
        !state.text.includes("V0.5F") &&
        !state.text.includes("schema") &&
        state.hasDeleteButton === false,
      { hasDeleteButton: state.hasDeleteButton },
    );
  }
  if (state.path === "/v2/search-assets") {
    check(
      "v2SearchAssetsBusinessCopyNoRawEngineeringTerms",
      state.text.includes("首页、系列看板和商品看板") &&
        !["debug-context", "legacy BI state", "persistence schema", "route contract", "BLOCKED_BY_MISSING_CONTRACT", "mock"].some((token) => state.text.includes(token)),
      {},
    );
    await evaluate(
      client,
      `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((item) => /开始配置|编辑搜索资产/.test((item.textContent ?? '').trim()));
        button?.click();
        return Boolean(button);
      })()`,
    );
    await waitForExpression(client, `Boolean(document.querySelector('[data-testid="v2-search-assets-filter-popover"]'))`, 10000);
    const modalState = await evaluate(
      client,
      `(() => {
        const dialog = document.querySelector('[data-testid="v2-search-assets-filter-popover"]');
        const content = document.querySelector('[data-testid="v2-search-assets-filter-popover-scrollable-content"]');
        const footer = document.querySelector('[data-testid="v2-search-assets-filter-popover-fixed-footer"]');
        const cards = Array.from(document.querySelectorAll('[data-testid="v2-search-assets-filter-popover-center-word-group-card"]'));
        const buttons = Array.from(dialog?.querySelectorAll('button') ?? []).map((button) => (button.textContent ?? '').replace(/\\s+/g, ' ').trim());
        const footerRect = footer?.getBoundingClientRect();
        const contentStyle = content ? getComputedStyle(content) : null;
        return {
          hasDialog: Boolean(dialog),
          hasScrollableContent: contentStyle ? /(auto|scroll)/.test(contentStyle.overflowY) : false,
          footerVisible: footerRect ? footerRect.bottom <= window.innerHeight + 1 && footerRect.top >= 0 : false,
          cardCount: cards.length,
          duplicateActionButtons: buttons.filter((text) => text === '查看' || text === '编辑分组').length,
          hasFooterActions: ['取消', '清空', '保存'].every((text) => buttons.includes(text)),
          documentScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      })()`,
    );
    check(
      "v2SearchAssetsModalFocusedScrollableFixedFooter",
      modalState.hasDialog &&
        modalState.hasScrollableContent &&
        modalState.footerVisible &&
        modalState.cardCount >= 4 &&
        modalState.duplicateActionButtons === 0 &&
        modalState.hasFooterActions &&
        modalState.documentScrollWidth <= modalState.viewportWidth + 1,
      modalState,
    );
    await evaluate(client, `document.querySelector('[data-testid="v2-search-assets-filter-popover"] button')?.click()`);
  }
  if (state.path === "/v2/exclusion-rules") {
    check(
      "v2ExclusionRulesSafeBlockedWithoutMockControls",
      state.text.includes("排除规则暂未开放") &&
        state.text.includes("当前页面只保留规划状态") &&
        !["debug-context", "legacy BI state", "persistence schema", "route contract", "BLOCKED_BY_MISSING_CONTRACT", "mock"].some((token) => state.text.includes(token)),
      {},
    );
  }
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
  const legacyRuntimeCompatibilityRemoved = await evaluate(
    client,
    `(() => {
      const key = ${JSON.stringify(LEGACY_RUNTIME_COMPATIBILITY_KEY)};
      const existed = localStorage.getItem(key) !== null;
      localStorage.removeItem(key);
      return existed;
    })()`,
  );
  const after = await evaluate(client, `indexedDB.databases ? indexedDB.databases().then((items) => items.map((item) => item.name).filter(Boolean).sort()) : []`);
  await client.send("Page.reload", { ignoreCache: false });
  await waitForExpression(client, `document.readyState === "complete"`, 30000);
  await waitForExpression(client, `!document.body.innerText.includes("正在读取经营数据…")`, 45000);
  const state = await evaluate(
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
  const screenshot = await capture(client, "v2-home-after-runtime-debug-cleanup");
  check(
    "postRegressionCleanupRemovesRuntimeDebugAndKeepsV2HomeEmpty",
    state.hasEmptyState === true && state.uploadCtaIsV2 === true,
    state,
  );
  return {
    before,
    after,
    runtimeDeleted,
    debugDeleted,
    legacyRuntimeCompatibilityRemoved,
    preservedDatabases: after.filter((name) => ["airburg-target-drafts-v1", "airburg-v05"].includes(name)),
    preservedLocalStorageKeys: state.localStorageKeys.filter((key) => key === "airburg:demo-session"),
    screenshot,
    state,
  };
};

const run = async () => {
  const server = await ensureServer();
  const launchedChrome = await launchChrome();
  let client;
  let cleanupState = null;
  const desktop = [];
  const mobile = [];
  try {
    client = await CdpClient.connect(await debuggerUrl(launchedChrome.port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");

    await setViewport(client, 1440, 1000);
    for (const route of routes) {
      currentStage = `desktop:${route.path}`;
      desktop.push(await inspectRoute(client, route));
      await routeSpecificChecks(client);
    }

    await setViewport(client, 390, 844);
    for (const route of routes) {
      currentStage = `mobile:${route.path}`;
      mobile.push(await inspectRouteMobile(client, route));
    }

    if (CLEANUP_RUNTIME_DEBUG) {
      currentStage = "cleanup_runtime_debug";
      await setViewport(client, 1440, 1000);
      cleanupState = await cleanupRuntimeAndDebugRecords(client);
    }

    check("tenRouteConsoleBusinessErrorsZero", client.consoleErrors.length === 0, client.consoleErrors);
    check("tenRouteNetworkBusinessErrorsZero", client.failedBusinessRequests.length === 0, client.failedBusinessRequests);

    const result = {
      status: "PASS",
      validator: "validate-saas-v2-ten-route-system-chrome-v1",
      baseUrl: BASE_URL,
      artifactDir: ARTIFACT_DIR,
      profileDir: PROFILE_DIR,
      checks,
      desktop,
      mobile,
      cleanupState,
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "summary.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const result = {
      status: "FAIL",
      validator: "validate-saas-v2-ten-route-system-chrome-v1",
      baseUrl: BASE_URL,
      stage: currentStage,
      artifactDir: ARTIFACT_DIR,
      profileDir: PROFILE_DIR,
      checks,
      error: error instanceof Error ? error.message : String(error),
    };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "summary.json"), JSON.stringify(result, null, 2));
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
