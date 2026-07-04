import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.CORE_PAGES_V1_PLUS_QUALITY_AUDIT_BASE_URL ?? "http://localhost:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-plus-quality-"));

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface ScreenshotRecord {
  route: string;
  pageName: string;
  viewport: string;
  screenshotPath: string;
  http200: boolean;
  activeNavOk: boolean;
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
}

interface PageSpec {
  route: string;
  pageName: string;
  activeNav: string;
  rootSelector: string;
  navSelector: string;
  cardSelector?: string;
  expectedCardCount?: number;
  minCardCount?: number;
  sourceFiles: string[];
  requiredTexts: string[];
  sourceOnlyTexts?: string[];
  forbiddenTexts: string[];
}

const navItems = ["经营首页", "系列看板", "店铺看板", "宝贝看板", "数据上传", "库存看板", "计划拆解", "历史数据", "AI顾问"];

const sensitiveTokens = [
  "NaN",
  "Infinity",
  "undefined",
  "rawRows",
  "previewRows",
  "文件名历史",
  "warning 原文",
  "订单号",
  "退款编号",
  "交易号",
  "电话",
  "地址",
  "物流信息",
  "买家说明",
  "商家备注明细",
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const pageSpecs: PageSpec[] = [
  {
    route: "/home",
    pageName: "经营首页",
    activeNav: "经营首页",
    rootSelector: "[data-testid='home-bi-dashboard']",
    navSelector: "[data-testid='home-bi-nav-item']",
    cardSelector: "[data-testid='home-bi-kpi-card']",
    minCardCount: 17,
    sourceFiles: ["components/home/home-bi-dashboard.tsx", "lib/bi/bi.home-mapper.ts", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: [
      "目标店铺",
      "商品排除",
      "平台目标",
      "日",
      "周",
      "月",
      "自定义",
      "GMV",
      "直接成交占比",
      "MTD计划 VS 实际",
      "DLY参考图",
      "退货率（总）",
      "发货退货率",
      "已签收退货率",
    ],
    forbiddenTexts: [],
  },
  {
    route: "/series-board",
    pageName: "系列看板",
    activeNav: "系列看板",
    rootSelector: "[data-testid='series-board-v1-dashboard']",
    navSelector: "[data-testid='series-board-v1-nav-item']",
    cardSelector: "[data-testid='series-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/series-board/v1/series-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "系列设置", "商家备注", "系列目标", "系列GMV", "趋势图", "系列内商品贡献 TOP"],
    forbiddenTexts: ["商品排除", "平台目标", "系列目标进度大模块", "系列商品明细表大模块", "售后与推广概览大模块"],
  },
  {
    route: "/store-board",
    pageName: "店铺看板",
    activeNav: "店铺看板",
    rootSelector: "[data-testid='store-board-v1-dashboard']",
    navSelector: "[data-testid='store-board-v1-nav-item']",
    cardSelector: "[data-testid='store-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/store-board/v1/store-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "店铺设置", "店铺GMV", "DLY参考图", "店铺内商品贡献 TOP"],
    sourceOnlyTexts: ['testId="store-board-v1-chart-panel"'],
    forbiddenTexts: ["平台目标", "商品排除", "商家备注", "TOP商品大模块", "推广与售后大模块", "目标摘要大模块"],
  },
  {
    route: "/product-board",
    pageName: "宝贝看板",
    activeNav: "宝贝看板",
    rootSelector: "[data-testid='product-board-v1-dashboard']",
    navSelector: "[data-testid='product-board-v1-nav-item']",
    cardSelector: "[data-testid='product-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/product-board/v1/product-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "宝贝设置", "宝贝GMV", "DLY参考图", "单品流量漏斗"],
    sourceOnlyTexts: ['testId="product-board-v1-chart-panel"'],
    forbiddenTexts: ["平台目标", "商品排除", "商家备注", "系列目标", "推广表现大模块", "所属系列大模块", "售后风险大模块"],
  },
  {
    route: "/upload",
    pageName: "数据上传",
    activeNav: "数据上传",
    rootSelector: "[data-testid='upload-page-v1-dashboard']",
    navSelector: "[data-testid='upload-page-v1-nav-item']",
    sourceFiles: ["components/upload/v1/upload-page-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: [
      "目标店铺",
      "批量导入经营数据",
      "生意参谋商品经营表",
      "商品推广报表",
      "计划推广报表",
      "售后退货表",
      "批量导入",
      "清空本次选择",
      "剔除本批次重复文件",
    ],
    sourceOnlyTexts: ["导入成功"],
    forbiddenTexts: ["商品排除", "商家备注", "平台目标", "系列目标", "店铺目标", "宝贝目标", "KPI 卡片区", "趋势图区域"],
  },
  {
    route: "/upload/history",
    pageName: "历史数据",
    activeNav: "历史数据",
    rootSelector: "[data-testid='history-data-v1-page']",
    navSelector: "[data-testid='history-data-v1-page'] nav [aria-current], [data-testid='history-data-v1-page'] nav a, [data-testid='history-data-v1-page'] nav button",
    sourceFiles: ["components/upload/history/v1/history-data-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: [
      "平台筛选",
      "店铺筛选",
      "开始日期",
      "结束日期",
      "来源类型筛选",
      "导入状态筛选",
      "搜索框",
      "已覆盖日期",
      "完整日期",
      "缺失日期",
      "重复 / 冲突提示",
      "数据完整性矩阵",
      "生意参谋商品经营表",
      "商品推广报表",
      "计划推广报表",
      "售后退货表",
      "导入批次列表",
      "查看详情",
      "查看数据质量",
      "数据检查提示",
    ],
    forbiddenTexts: ["删除", "回滚", "强制覆盖", "重新导入", "修改历史记录", "清空数据"],
  },
  {
    route: "/upload/quality",
    pageName: "数据质量",
    activeNav: "数据上传",
    rootSelector: "[data-testid='upload-quality-v1-page']",
    navSelector: "[data-testid='upload-quality-v1-page'] nav [aria-current], [data-testid='upload-quality-v1-page'] nav a, [data-testid='upload-quality-v1-page'] nav button",
    sourceFiles: [
      "app/(workspace)/upload/quality/page.tsx",
      "components/upload/quality/v1/upload-quality-v1-dashboard.tsx",
      "components/visual-system/v1/visual-system.tsx",
    ],
    requiredTexts: [
      "平台筛选",
      "店铺筛选",
      "开始日期",
      "结束日期",
      "来源类型筛选",
      "问题类型筛选",
      "严重程度筛选",
      "搜索框",
      "高风险问题",
      "中风险问题",
      "低风险提示",
      "可进入看板状态",
      "质量问题列表",
      "质量影响矩阵",
      "去数据上传",
      "去历史数据",
    ],
    sourceOnlyTexts: ["详情抽屉", 'data-testid="upload-quality-v1-detail-drawer"'],
    forbiddenTexts: ["删除", "回滚", "覆盖", "强制覆盖", "重新导入", "直接修复", "修改历史记录", "清空数据"],
  },
];

const allowedBaselinePatterns = [
  "app/(workspace)/home/page.tsx",
  "components/home/**",
  "lib/bi/**",
  "app/(workspace)/series-board/page.tsx",
  "components/series-board/v1/**",
  "app/(workspace)/store-board/page.tsx",
  "components/store-board/v1/**",
  "app/(workspace)/product-board/page.tsx",
  "components/product-board/v1/**",
  "app/(workspace)/upload/page.tsx",
  "components/upload/v1/**",
  "app/(workspace)/upload/history/page.tsx",
  "components/upload/history/v1/**",
  "app/(workspace)/upload/quality/page.tsx",
  "components/upload/quality/v1/**",
  "scripts/private-audit/validate-home-bi-dashboard-ui.ts",
  "scripts/private-audit/validate-home-bi-real-data-binding.ts",
  "scripts/private-audit/validate-home-bi-dashboard-control-interaction.ts",
  "scripts/private-audit/validate-home-bi-dashboard-series-click-and-visual.ts",
  "scripts/private-audit/validate-home-bi-dashboard-final-visual.ts",
  "scripts/private-audit/validate-series-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-store-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-product-board-v1-sketch-baseline.ts",
  "scripts/private-audit/validate-upload-page-v1-simple-baseline.ts",
  "scripts/private-audit/validate-history-data-v1-baseline.ts",
  "scripts/private-audit/validate-upload-quality-v1-baseline.ts",
  "scripts/private-audit/validate-core-pages-v1-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-plus-upload-quality-local-acceptance.ts",
  "scripts/private-audit/validate-core-pages-v1-p0-interaction-layout-regression.ts",
  "scripts/private-audit/validate-core-pages-v1-p1-chart-system-and-single-product-board.ts",
  "scripts/private-audit/validate-core-pages-v1-visual-system-unification.ts",
  "scripts/private-audit/validate-core-pages-v1-pixel-level-refinement.ts",
  "components/visual-system/v1/**",
];

const strictlyForbiddenPatterns = [
  "app/(workspace)/targets/**",
  "app/(workspace)/raw-data/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const parseChangedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(
    new Set(
      [...diff.split("\n"), ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ).sort();
};

const fetchJson = <T>(url: string): Promise<T> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += String(chunk);
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  readonly consoleErrors: string[] = [];
  readonly ignoredConsoleErrors: string[] = [];

  private constructor(private readonly socket: WebSocket) {}

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener("open", () => resolve(client), { once: true });
      socket.addEventListener("error", (event) => reject(event), { once: true });
      socket.addEventListener("message", (event) => client.handleMessage(String(event.data)));
    });
  }

  close() {
    this.socket.close();
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as CdpMessage;
    if (message.id) {
      const callback = this.pending.get(message.id);
      if (!callback) return;
      this.pending.delete(message.id);
      if (message.error) callback.reject(message.error);
      else callback.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") this.consoleErrors.push("runtime_exception");
    if (message.method === "Runtime.consoleAPICalled") {
      const params = message.params as { type?: string } | undefined;
      if (params?.type === "error") this.consoleErrors.push("console_error");
    }
    if (message.method === "Log.entryAdded") {
      const params = message.params as { entry?: { level?: string; text?: string; url?: string } } | undefined;
      if (params?.entry?.level === "error") {
        const text = `${params.entry.url ?? "unknown"} ${params.entry.text ?? "log_error"}`;
        if (text.includes("/favicon.ico") && text.includes("404")) this.ignoredConsoleErrors.push(text);
        else this.consoleErrors.push(text);
      }
    }
  }

  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params: params ?? {} }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
    });
  }
}

const launchChrome = async (port: number, profileDir: string): Promise<ChildProcessWithoutNullStreams> => {
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  chrome.stderr.on("data", () => undefined);
  chrome.stdout.on("data", () => undefined);
  for (let index = 0; index < 50; index += 1) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return chrome;
    } catch {
      await wait(100);
    }
  }
  chrome.kill("SIGTERM");
  throw new Error("Chrome remote debugging did not start");
};

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let index = 0; index < 50; index += 1) {
    const pages = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
    const page = pages.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await wait(100);
  }
  throw new Error("No Chrome page debugger URL found");
};

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send<{ result?: { value?: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(`Evaluation failed: ${expression}`);
  return result.result?.value as T;
};

const waitForSelector = async (client: CdpClient, selector: string): Promise<void> => {
  const escaped = JSON.stringify(selector);
  for (let index = 0; index < 80; index += 1) {
    const exists = await evaluate<boolean>(client, `Boolean(document.querySelector(${escaped}))`);
    if (exists) return;
    await wait(100);
  }
  throw new Error(`Missing selector: ${selector}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(300);
};

const httpOk = async (route: string): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}${route}`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const textIncludesEvery = (text: string, values: string[]): string[] => values.filter((value) => !text.includes(value));

const visibleText = async (client: CdpClient): Promise<string> => evaluate<string>(client, "document.body.innerText");

const navSnapshot = async (client: CdpClient, spec: PageSpec): Promise<{ items: string[]; active: string }> => {
  const selector = JSON.stringify(spec.navSelector);
  return evaluate<{ items: string[]; active: string }>(
    client,
    `(() => {
      const nodes = Array.from(document.querySelectorAll(${selector}));
      const items = nodes.map((node) => node.textContent?.trim() || "").filter(Boolean);
      const active = nodes.find((node) => node.getAttribute("aria-current") === "page")?.textContent?.trim() || "";
      return { items, active };
    })()`,
  );
};

const hasHorizontalOverflow = async (client: CdpClient): Promise<boolean> =>
  evaluate<boolean>(
    client,
    `(() => {
      const root = document.documentElement;
      const body = document.body;
      return Math.ceil(root.scrollWidth) > Math.ceil(root.clientWidth) + 1 ||
        Math.ceil(body.scrollWidth) > Math.ceil(root.clientWidth) + 1;
    })()`,
  );

const capture = async (client: CdpClient, spec: PageSpec, viewport: string, http200: boolean): Promise<ScreenshotRecord> => {
  const text = await visibleText(client);
  const nav = await navSnapshot(client, spec);
  const horizontalOverflow = await hasHorizontalOverflow(client);
  const navText = nav.items.join("\n");
  const missingNav = textIncludesEvery(navText, navItems);
  const missingRequired = textIncludesEvery(text, spec.requiredTexts);
  const forbiddenVisible = [...sensitiveTokens, ...spec.forbiddenTexts].filter((token) => text.includes(token));
  if (spec.cardSelector && (spec.expectedCardCount || spec.minCardCount)) {
    const selector = JSON.stringify(spec.cardSelector);
    const cardCount = await evaluate<number>(client, `document.querySelectorAll(${selector}).length`);
    if (spec.expectedCardCount) {
      assert(cardCount === spec.expectedCardCount, `${spec.route} expected ${spec.expectedCardCount} KPI cards, got ${cardCount}`);
    }
    if (spec.minCardCount) {
      assert(cardCount >= spec.minCardCount, `${spec.route} expected at least ${spec.minCardCount} KPI cards, got ${cardCount}`);
    }
  }
  assert(missingNav.length === 0, `${spec.route} missing nav: ${missingNav.join(", ")}`);
  assert(text.includes(spec.pageName), `${spec.route} missing page title: ${spec.pageName}`);
  assert(nav.active.includes(spec.activeNav), `${spec.route} active nav mismatch: ${nav.active}`);
  assert(missingRequired.length === 0, `${spec.route} missing required text: ${missingRequired.join(", ")}`);
  assert(forbiddenVisible.length === 0, `${spec.route} forbidden visible text: ${forbiddenVisible.join(", ")}`);
  assert(!horizontalOverflow, `${spec.route} ${viewport} horizontal overflow`);

  const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const safeName = spec.route === "/" ? "root" : spec.route.replace(/\//g, "-").replace(/^-/, "");
  const screenshotPath = path.join(screenshotDir, `${safeName}-${viewport.replace("x", "-")}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return {
    route: spec.route,
    pageName: spec.pageName,
    viewport,
    screenshotPath,
    http200,
    activeNavOk: nav.active.includes(spec.activeNav),
    consoleErrorsCount: client.consoleErrors.length,
    horizontalOverflow,
  };
};

const runBrowserAudit = async (): Promise<ScreenshotRecord[]> => {
  const port = 9724 + Math.floor(Math.random() * 250);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-plus-profile-"));
  const chrome = await launchChrome(port, profileDir);
  let client: CdpClient | null = null;
  const screenshots: ScreenshotRecord[] = [];
  try {
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await setViewport(client, 1440, 1100);
    await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}/login` });
    await wait(500);
    await evaluate<void>(
      client,
      `localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "core-pages-v1-plus-audit", loggedInAt: "2026-06-27T00:00:00.000Z" }))`,
    );

    for (const spec of pageSpecs) {
      const ok = await httpOk(spec.route);
      assert(ok, `${spec.route} HTTP not OK`);
      await setViewport(client, 1440, 1100);
      await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${spec.route}` });
      await waitForSelector(client, spec.rootSelector);
      await wait(500);
      screenshots.push(await capture(client, spec, "1440x1100", ok));

      await setViewport(client, 390, 1100);
      await wait(400);
      screenshots.push(await capture(client, spec, "390x1100", ok));
    }

    assert(client.consoleErrors.length === 0, `console errors: ${client.consoleErrors.join("; ")}`);
    return screenshots;
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      await wait(300);
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
};

const checkSource = () => {
  for (const spec of pageSpecs) {
    const source = spec.sourceFiles.map(read).join("\n");
    for (const item of [...navItems, ...spec.requiredTexts, ...(spec.sourceOnlyTexts ?? [])]) {
      assert(source.includes(item), `${spec.route} source missing ${item}`);
    }
    for (const item of spec.forbiddenTexts) {
      assert(!source.includes(item), `${spec.route} source contains forbidden token ${item}`);
    }
  }
};

const checkWorktree = () => {
  const nextEnvStatus = git(["status", "--porcelain", "--", "next-env.d.ts"]);
  assert(!nextEnvStatus, "next-env.d.ts is modified; restore it before running checkpoint");
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)));
  const unexpectedChanged = changedFiles.filter((file) => !allowedBaselinePatterns.some((pattern) => matchesPattern(file, pattern)));
  assert(forbiddenChanged.length === 0, `forbidden files changed: ${forbiddenChanged.join(", ")}`);
  assert(unexpectedChanged.length === 0, `unexpected changed files: ${unexpectedChanged.join(", ")}`);
  return changedFiles;
};

const main = async () => {
  const changedFiles = checkWorktree();
  checkSource();
  const screenshots = await runBrowserAudit();
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        status: "PASS",
        screenshotDir,
        screenshots,
        changedFiles,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(JSON.stringify({
    status: "PASS",
    pages: pageSpecs.map((spec) => spec.route),
    screenshotManifest: manifestPath,
    screenshots,
    changedFiles,
  }, null, 2));
};

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    message: error instanceof Error ? error.message : String(error),
    screenshotDir,
  }, null, 2));
  process.exit(1);
});
