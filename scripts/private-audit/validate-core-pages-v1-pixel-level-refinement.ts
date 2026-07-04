import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = process.env.CORE_PAGES_V1_PIXEL_AUDIT_BASE_URL ?? "http://localhost:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-pixel-refinement-"));

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
  navOk: boolean;
  activeNavOk: boolean;
  topbarOk: boolean;
  backgroundOk: boolean;
  maxWidthOk: boolean;
  cardStyleOk: boolean;
  buttonStyleOk: boolean;
  statusStyleOk: boolean;
  requiredTextOk: boolean;
  cardCountOk: boolean;
  sensitiveLeaks: string[];
  consoleErrorsCount: number;
  horizontalOverflow: boolean;
}

interface PageSpec {
  route: string;
  pageName: string;
  activeNav: string;
  rootSelector: string;
  cardSelector?: string;
  expectedCardCount?: number;
  sourceFiles: string[];
  requiredTexts: string[];
}

interface ExtraShotSpec {
  route: string;
  label: string;
  actionText: string;
  waitForText: string;
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
    cardSelector: "[data-testid='home-bi-kpi-card']",
    expectedCardCount: 17,
    sourceFiles: ["components/home/home-bi-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "商品排除", "平台目标", "MTD参考图", "DLY参考图"],
  },
  {
    route: "/series-board",
    pageName: "系列看板",
    activeNav: "系列看板",
    rootSelector: "[data-testid='series-board-v1-dashboard']",
    cardSelector: "[data-testid='series-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/series-board/v1/series-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "系列设置", "商家备注", "系列目标", "系列内商品贡献 TOP"],
  },
  {
    route: "/store-board",
    pageName: "店铺看板",
    activeNav: "店铺看板",
    rootSelector: "[data-testid='store-board-v1-dashboard']",
    cardSelector: "[data-testid='store-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/store-board/v1/store-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "店铺设置", "店铺GMV", "店铺内商品贡献 TOP"],
  },
  {
    route: "/product-board",
    pageName: "宝贝看板",
    activeNav: "宝贝看板",
    rootSelector: "[data-testid='product-board-v1-dashboard']",
    cardSelector: "[data-testid='product-board-v1-kpi-card']",
    expectedCardCount: 15,
    sourceFiles: ["components/product-board/v1/product-board-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "宝贝设置", "宝贝GMV", "单品流量漏斗"],
  },
  {
    route: "/upload",
    pageName: "数据上传",
    activeNav: "数据上传",
    rootSelector: "[data-testid='upload-page-v1-dashboard']",
    sourceFiles: ["components/upload/v1/upload-page-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["目标店铺", "批量导入经营数据", "生意参谋商品经营表", "商品推广报表", "计划推广报表", "售后退货表"],
  },
  {
    route: "/upload/history",
    pageName: "历史数据",
    activeNav: "历史数据",
    rootSelector: "[data-testid='history-data-v1-page']",
    sourceFiles: ["components/upload/history/v1/history-data-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["平台筛选", "店铺筛选", "数据完整性矩阵", "导入批次列表", "查看数据质量"],
  },
  {
    route: "/upload/quality",
    pageName: "数据质量",
    activeNav: "数据上传",
    rootSelector: "[data-testid='upload-quality-v1-page']",
    sourceFiles: ["components/upload/quality/v1/upload-quality-v1-dashboard.tsx", "components/visual-system/v1/visual-system.tsx"],
    requiredTexts: ["平台筛选", "店铺筛选", "质量问题列表", "质量影响矩阵", "去数据上传", "去历史数据"],
  },
];

const extraShots: ExtraShotSpec[] = [
  { route: "/home", label: "home-platform-target-popover", actionText: "平台目标", waitForText: "设置平台目标" },
  { route: "/home", label: "home-product-exclude-dialog", actionText: "商品排除", waitForText: "商品ID" },
  { route: "/series-board", label: "series-settings-popover", actionText: "系列设置", waitForText: "商品ID" },
  { route: "/store-board", label: "store-settings-popover", actionText: "店铺设置", waitForText: "添加店铺" },
  { route: "/product-board", label: "product-settings-popover", actionText: "宝贝设置", waitForText: "添加宝贝" },
  { route: "/upload/history", label: "history-detail-drawer", actionText: "查看详情", waitForText: "批次详情" },
  { route: "/upload/quality", label: "quality-detail-drawer", actionText: "查看详情", waitForText: "问题基础信息" },
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
  "components/visual-system/v1/**",
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
  "scripts/private-audit/validate-core-pages-v1-visual-system-unification.ts",
  "scripts/private-audit/validate-core-pages-v1-pixel-level-refinement.ts",
  "scripts/private-audit/validate-core-pages-v1-p0-interaction-layout-regression.ts",
  "scripts/private-audit/validate-core-pages-v1-p1-chart-system-and-single-product-board.ts",
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

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const matchesPattern = (file: string, pattern: string): boolean => {
  if (file === pattern) return true;
  if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -3));
  return false;
};

const parseChangedFiles = (): string[] => {
  const diff = git(["-c", "core.quotepath=false", "diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return Array.from(new Set([...diff.split("\n"), ...untracked.split("\n")].map((line) => line.trim()).filter(Boolean))).sort();
};

const fetchStatus = (url: string): Promise<number> =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      })
      .on("error", reject);
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isIgnorableConsoleText = (text: string): boolean =>
  text.includes("favicon.ico") ||
  text.includes("404") ||
  text.includes("net::ERR_ABORTED") ||
  text.includes("A preload for");

const launchChrome = async (port: number, profileDir: string): Promise<ChildProcess> => {
  const chrome = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--headless=new",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  await wait(900);
  return chrome;
};

const getPageDebuggerUrl = async (port: number): Promise<string> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await new Promise<Array<{ type: string; webSocketDebuggerUrl?: string }>>((resolve, reject) => {
        http
          .get(`http://127.0.0.1:${port}/json`, (response) => {
            let body = "";
            response.on("data", (chunk) => {
              body += String(chunk);
            });
            response.on("end", () => resolve(JSON.parse(body)));
          })
          .on("error", reject);
      });
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      await wait(200);
    }
  }
  throw new Error("Chrome debugger was not available");
};

class CdpClient {
  private id = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  private handlers = new Map<string, Array<(params: unknown) => void>>();

  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(message.error);
        else pending?.resolve(message.result);
        return;
      }
      if (message.method) this.handlers.get(message.method)?.forEach((handler) => handler(message.params));
    });
  }

  static connect(url: string): Promise<CdpClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => resolve(new CdpClient(ws)));
      ws.addEventListener("error", reject);
    });
  }

  on(method: string, handler: (params: unknown) => void) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

const evaluate = async <T>(client: CdpClient, expression: string): Promise<T> => {
  const result = await client.send<{ result: { value: T } }>("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
};

const waitForSelector = async (client: CdpClient, selector: string) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const exists = await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (exists) return;
    await wait(100);
  }
  throw new Error(`Missing selector ${selector}`);
};

const waitForText = async (client: CdpClient, text: string) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const exists = await evaluate<boolean>(client, `document.body.innerText.includes(${JSON.stringify(text)})`);
    if (exists) return;
    await wait(100);
  }
  throw new Error(`Missing text ${text}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
};

const captureScreenshot = async (client: CdpClient, filename: string): Promise<string> => {
  const result = await client.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const screenshotPath = path.join(screenshotDir, filename);
  fs.writeFileSync(screenshotPath, Buffer.from(result.data, "base64"));
  return screenshotPath;
};

const inspectPage = async (client: CdpClient, spec: PageSpec, viewport: string): Promise<Omit<ScreenshotRecord, "screenshotPath" | "http200" | "consoleErrorsCount">> =>
  evaluate(client, `(() => {
    const root = document.querySelector(${JSON.stringify(spec.rootSelector)});
    const text = document.body.innerText || "";
    const navText = Array.from(document.querySelectorAll('aside nav a, aside nav button')).map((node) => node.textContent?.trim()).filter(Boolean);
    const activeItems = Array.from(document.querySelectorAll('aside nav [aria-current="page"]')).map((node) => node.textContent?.trim() || "");
    const headers = Array.from(document.querySelectorAll('header'));
    const mainCanvas = Array.from(document.querySelectorAll('[class*="max-w-[1440px]"], [class*="max-w-\\\\[1440px\\\\]"]'));
    const roundedBorderCards = Array.from(document.querySelectorAll('[class*="rounded-xl"][class*="border"]'));
    const styledButtons = Array.from(document.querySelectorAll('button, a')).filter((node) => {
      const cls = String(node.getAttribute('class') || '');
      return cls.includes('rounded-xl') && (cls.includes('border') || cls.includes('bg-slate-950') || cls.includes('bg-blue-500'));
    });
    const cards = ${JSON.stringify(spec.cardSelector)} ? Array.from(document.querySelectorAll(${JSON.stringify(spec.cardSelector ?? "")})) : [];
    const statusLike = Array.from(document.querySelectorAll('[class*="bg-emerald"], [class*="bg-amber"], [class*="bg-rose"], [class*="bg-blue"], [class*="bg-slate"]')).filter((node) => {
      const cls = String(node.getAttribute('class') || '');
      return cls.includes('rounded') && (cls.includes('text-') || cls.includes('border'));
    });
    const rootBg = root ? getComputedStyle(root).backgroundColor : "";
    const badTokens = ${JSON.stringify(sensitiveTokens)}.filter((token) => text.includes(token));
    return {
      route: ${JSON.stringify(spec.route)},
      pageName: ${JSON.stringify(spec.pageName)},
      viewport: ${JSON.stringify(viewport)},
      navOk: ${JSON.stringify(navItems)}.every((item) => navText.includes(item)),
      activeNavOk: activeItems.some((item) => item.includes(${JSON.stringify(spec.activeNav)})),
      topbarOk: headers.some((header) => Boolean(header.textContent?.includes(${JSON.stringify(spec.pageName)}) && header.textContent?.includes('退出'))),
      backgroundOk: rootBg === 'rgb(245, 247, 251)',
      maxWidthOk: mainCanvas.length > 0,
      cardStyleOk: roundedBorderCards.length >= 4,
      buttonStyleOk: styledButtons.length >= 3,
      statusStyleOk: statusLike.length >= 2,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      requiredTextOk: ${JSON.stringify(spec.requiredTexts)}.every((item) => text.includes(item)),
      cardCountOk: ${JSON.stringify(spec.expectedCardCount ?? null)} === null || cards.length === ${JSON.stringify(spec.expectedCardCount ?? null)},
      sensitiveLeaks: badTokens,
    };
  })()`);

const sourceChecks = () => {
  const changedFiles = parseChangedFiles();
  const forbiddenChanged = changedFiles.filter((file) => strictlyForbiddenPatterns.some((pattern) => matchesPattern(file, pattern)));
  const unexpectedChanged = changedFiles.filter((file) => !allowedBaselinePatterns.some((pattern) => matchesPattern(file, pattern)));
  const visualSource = read("components/visual-system/v1/visual-system.tsx");
  const allSources = pageSpecs.flatMap((spec) => spec.sourceFiles).map(read).join("\n") + `\n${visualSource}`;
  const requiredSourceChecks = {
    sharedVisualComponentExists:
      visualSource.includes("V1Sidebar") &&
      visualSource.includes("V1TopBar") &&
      visualSource.includes("V1StatusBadge") &&
      visualSource.includes("v1CardClass"),
    unifiedSidebarWidth: visualSource.includes("w-[232px]"),
    unifiedTopbarHeight: visualSource.includes("h-12"),
    unifiedBackground: allSources.includes("bg-[#F5F7FB]"),
    unifiedMaxWidth: allSources.includes("max-w-[1440px]"),
    lightCardBorders:
      allSources.includes("border-slate-200/80") &&
      !allSources.includes("border-2 border-slate-900") &&
      !allSources.includes("border-black"),
    lightShadowSystem:
      visualSource.includes("shadow-[0_1px_3px_rgba(15,23,42,0.06)]") &&
      allSources.includes("shadow-[0_1px_3px_rgba(15,23,42,0.06)]") &&
      !allSources.includes("shadow-2xl") &&
      !allSources.includes("shadow-xl") &&
      !allSources.includes("shadow-sm"),
    restrainedTypography: !allSources.includes("font-black") && !allSources.includes("font-bold"),
    refinedKpiSelection: allSources.includes("ring-2 ring-blue-300 ring-offset-2 ring-offset-white"),
    refinedChartFrames: allSources.includes("bg-slate-50/80") && !allSources.includes('stroke="#94a3b8"'),
    refinedDialogs: allSources.includes("shadow-[0_24px_70px_rgba(15,23,42,0.18)]"),
    noForbiddenChanged: forbiddenChanged.length === 0,
    noUnexpectedChanged: unexpectedChanged.length === 0,
    noNewDependencies: !git(["diff", "--name-only", "--", "package.json", "package-lock.json"]),
  };
  return { changedFiles, forbiddenChanged, unexpectedChanged, requiredSourceChecks };
};

const main = async () => {
  const source = sourceChecks();
  const httpResults = Object.fromEntries(await Promise.all(pageSpecs.map(async (spec) => [spec.route, await fetchStatus(`${BASE_URL}${spec.route}`)])));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "airburg-core-pages-v1-visual-profile-"));
  const port = 9700 + Math.floor(Math.random() * 300);
  let chrome: ChildProcess | null = null;
  let client: CdpClient | null = null;
  const screenshots: ScreenshotRecord[] = [];
  const extraScreenshots: Array<{ label: string; route: string; screenshotPath: string }> = [];
  const consoleErrors: string[] = [];

  try {
    chrome = await launchChrome(port, profileDir);
    client = await CdpClient.connect(await getPageDebuggerUrl(port));
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "visual-system-audit", loggedInAt: "2026-06-27T00:00:00.000Z" }));
        window.localStorage.setItem("airburg_tmall_analysis_v2", JSON.stringify({
          analysisTimestamp: "2026-06-27T00:00:00.000Z",
          dataQualityWarnings: ["safe_source_missing", "safe_metric_unavailable"],
          overview: { selectedDate: "2026-06-27", risks: { dataQualityWarningCount: 2 } }
        }));
      `,
    });
    client.on("Runtime.exceptionThrown", (params) => consoleErrors.push(JSON.stringify(params)));
    client.on("Log.entryAdded", (params: unknown) => {
      const entry = (params as { entry?: { level?: string; text?: string } }).entry;
      const text = entry?.text ?? "log error";
      if (entry?.level === "error" && !isIgnorableConsoleText(text)) consoleErrors.push(text);
    });
    client.on("Runtime.consoleAPICalled", (params: unknown) => {
      const event = params as { type?: string; args?: Array<{ value?: unknown; description?: string }> };
      if (event.type === "error") consoleErrors.push(event.args?.map((arg) => String(arg.value ?? arg.description ?? "")).join(" ") ?? "console error");
    });

    for (const spec of pageSpecs) {
      for (const viewportSpec of [
        { label: "1440x1100", width: 1440, height: 1100 },
        { label: "390x1100", width: 390, height: 1100 },
      ]) {
        await setViewport(client, viewportSpec.width, viewportSpec.height);
        await client.send("Page.navigate", { url: `${BASE_URL}${spec.route}` });
        await waitForSelector(client, spec.rootSelector);
        await wait(450);
        const inspection = await inspectPage(client, spec, viewportSpec.label);
        const screenshotPath = await captureScreenshot(client, `${spec.route.replaceAll("/", "-").replace(/^-/, "") || "root"}-${viewportSpec.width}-1100.png`);
        screenshots.push({
          ...inspection,
          screenshotPath,
          http200: httpResults[spec.route] === 200,
          consoleErrorsCount: consoleErrors.length,
        });
      }
    }

    for (const shot of extraShots) {
      await setViewport(client, 1440, 1100);
      await client.send("Page.navigate", { url: `${BASE_URL}${shot.route}` });
      const spec = pageSpecs.find((item) => item.route === shot.route);
      if (!spec) throw new Error(`Missing page spec for ${shot.route}`);
      await waitForSelector(client, spec.rootSelector);
      await wait(450);
      const clicked = await evaluate<boolean>(
        client,
        `(() => {
          const target = Array.from(document.querySelectorAll('button, a')).find((node) => node.textContent?.includes(${JSON.stringify(shot.actionText)}));
          if (!target) return false;
          target.click();
          return true;
        })()`,
      );
      if (!clicked) throw new Error(`Could not click ${shot.actionText} on ${shot.route}`);
      await waitForText(client, shot.waitForText);
      await wait(250);
      const screenshotPath = await captureScreenshot(client, `${shot.label}.png`);
      extraScreenshots.push({ label: shot.label, route: shot.route, screenshotPath });
    }
  } finally {
    client?.close();
    chrome?.kill("SIGTERM");
    await wait(400);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      await wait(800);
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    }
  }

  const screenshotFailures = screenshots.filter(
    (record) =>
      !record.http200 ||
      !record.navOk ||
      !record.activeNavOk ||
      !record.topbarOk ||
      !record.backgroundOk ||
      !record.maxWidthOk ||
      !record.cardStyleOk ||
      !record.buttonStyleOk ||
      !record.statusStyleOk ||
      !record.requiredTextOk ||
      !record.cardCountOk ||
      record.sensitiveLeaks.length > 0 ||
      record.horizontalOverflow ||
      record.consoleErrorsCount > 0,
  );
  const sourceFailures = Object.entries(source.requiredSourceChecks).filter(([, passed]) => !passed).map(([name]) => name);
  const failedChecks = [
    ...sourceFailures.map((name) => `source:${name}`),
    ...screenshotFailures.map((record) => `runtime:${record.route}:${record.viewport}`),
    ...(extraScreenshots.length === extraShots.length ? [] : ["extraScreenshotsIncomplete"]),
  ];

  const output = {
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    failedChecks,
    screenshotDir,
    screenshots,
    extraScreenshots,
    source,
  };
  const manifestPath = path.join(screenshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(output, null, 2));
  process.stdout.write(`${JSON.stringify({ ...output, manifestPath }, null, 2)}\n`);
  if (output.status !== "PASS") process.exitCode = 1;
};

void main();
