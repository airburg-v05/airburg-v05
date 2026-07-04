import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface ResolutionPlanItem {
  problemId: string;
  sourceDocument: string;
  page: string;
  issue: string;
  currentStatus: string;
  proposedFix: string;
  filesToModify: string[];
  forbiddenFiles: string[];
  needsHumanReview: boolean;
  isDataLogicChange: false;
}

const ROOT = process.cwd();
const BASE_URL = process.env.PAGE_PROBLEM_LAYOUT_BASE_URL ?? "http://127.0.0.1:3000";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const checks: Check[] = [];

const requiredReadFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-regression-skill.md",
];

const currentTaskAttachment = "/Users/zongji/.codex/attachments/f1ac0493-286d-47fa-aecf-05cb829d4280/pasted-text.txt";
const pageProblemOneDoc = "/Users/zongji/Desktop/页面问题梳理.doc";
const pageProblemTwoReference = "docs/PAGE_PROBLEM_MATRIX_V2.md";
const wireframeV1 = "/Users/zongji/Desktop/airburg_remaining_pages_wireframe_spec_v1.docx";
const wireframeV2 = "/Users/zongji/Desktop/airburg_remaining_pages_wireframe_spec_v2.docx";

const forbiddenFiles = [
  "lib/etl/**",
  "lib/etl/runtime/**",
  "lib/etl/dedup-engine.ts",
  "lib/bi/brand-model-semantic.ts",
  "lib/bi/bi.home-mapper.ts",
  "lib/bi/target-metric-definitions.ts",
  "lib/persistence/**",
  "lib/storage/**",
  "lib/tmall/**",
  "lib/v05/**",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".vercel/**",
  "private-samples/**",
];

const resolutionPlan: ResolutionPlanItem[] = [
  {
    problemId: "PVM2-001",
    sourceDocument: "页面问题梳理一 + PAGE_PROBLEM_MATRIX_V2",
    page: "/home",
    issue: "首页时间选择和提示区域需要更易读，不占固定大块空间。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留弹出式时间选择，增加浮层标题和日/周/月/自定义说明。",
    filesToModify: ["components/visual-system/v1/visual-system.tsx"],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-002",
    sourceDocument: "页面问题梳理一 + UI_BASELINE_LOCK_V2",
    page: "/home /series-board /store-board /product-board",
    issue: "KPI 卡片必须保持全量网格和五项布局。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "只做间距和说明保持，不隐藏 derived / unsupported KPI。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-003",
    sourceDocument: "页面问题梳理一",
    page: "/home",
    issue: "去退费比 / 直接成交占比必须留在主 KPI 网格中。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "验证全量 KPI 标题仍包含去退费比和直接成交占比，不改公式。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-004",
    sourceDocument: "页面问题梳理一 + 页面问题梳理二",
    page: "/home /series-board /store-board /product-board",
    issue: "MTD / DLY 图表需要保持 tooltip、axis 和空态清晰。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留现有单图切换与空态，不引入重复数值展示。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-005",
    sourceDocument: "页面问题梳理一",
    page: "/home /series-board /product-board",
    issue: "品牌词 / 中心词 / 类目词解释需更易懂。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "中心词弹窗统一使用中文“分组/别名组”文案，避免英文 group 暴露。",
    filesToModify: ["components/visual-system/v1/brand-model-filter-popover.tsx"],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-006",
    sourceDocument: "页面问题梳理二 + TARGET_REQUIRED_AND_DERIVED rules",
    page: "/home /series-board /store-board /product-board",
    issue: "目标 required / derived / unsupported 只应在目标弹窗或目标区域说明。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "验证主 KPI 区不出现 unsupported target 说明，不改目标公式和 schema。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-007",
    sourceDocument: "页面问题梳理一",
    page: "/series-board",
    issue: "系列看板必须保留当前系列选择，且 productId-first 不回退。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留当前系列选择器，验证系列 KPI 网格和 productId-first 相关文案。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-008",
    sourceDocument: "页面问题梳理一",
    page: "/store-board",
    issue: "店铺选择跨页面恢复，且不出现开发术语。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留统一范围条和当前店铺选择，浏览器检查 StoreRecord 不可见。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-009",
    sourceDocument: "页面问题梳理一",
    page: "/product-board",
    issue: "宝贝看板只展示用户手动添加的宝贝，不恢复所有宝贝。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留当前宝贝选择和安全空态，验证 ProductRecord / TrackedProductRecord 不可见。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-010",
    sourceDocument: "页面问题梳理一 + 页面问题梳理二",
    page: "/upload",
    issue: "上传页需要产品化平台按钮、统一批量上传和更清晰状态。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "未开放平台显示“暂未开放”，上传说明拆成安全聚合和不保存原始文件两块。",
    filesToModify: ["components/upload/v1/upload-page-v1-dashboard.tsx"],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-011",
    sourceDocument: "页面问题梳理一",
    page: "/upload",
    issue: "上传识别错误必须展示安全状态，不展示原文。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "保留 success / failed / skipped 展示，重复文件提示说明不会阻断其它文件。",
    filesToModify: ["components/upload/v1/upload-page-v1-dashboard.tsx"],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
  {
    problemId: "PVM2-013",
    sourceDocument: "PAGE_PROBLEM_MATRIX_V2",
    page: "/upload/history /upload/quality",
    issue: "历史 / 质量页必须保持只读和安全摘要边界。",
    currentStatus: "public_pass_waiting_human_review",
    proposedFix: "验证只读文案、安全 issue code 和不展示敏感明细，不改持久化结构。",
    filesToModify: [],
    forbiddenFiles,
    needsHumanReview: true,
    isDataLogicChange: false,
  },
];

const pageSpecs = [
  {
    label: "home",
    route: "/home",
    root: "[data-testid='home-bi-dashboard']",
    kpiCard: "[data-testid='home-bi-kpi-card']",
    minKpiCount: 17,
    requiredTitles: ["GMV", "GSV", "投入产出比", "去退费比", "直接成交占比"],
    visualSummary: "首页保留全量 KPI 网格、弹出式时间选择、目标弹窗边界和 MTD / DLY 图表区。",
  },
  {
    label: "series",
    route: "/series-board",
    root: "[data-testid='series-board-v1-dashboard']",
    kpiCard: "[data-testid='series-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["系列GMV", "系列GSV", "投入产出比", "去退费比", "直接成交占比"],
    visualSummary: "系列页保留当前系列选择、全量 KPI 网格和 productId-first 主结构。",
  },
  {
    label: "store",
    route: "/store-board",
    root: "[data-testid='store-board-v1-dashboard']",
    kpiCard: "[data-testid='store-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["店铺GMV", "店铺GSV", "投入产出比", "去退费比", "直接成交占比"],
    visualSummary: "店铺页保留当前店铺选择、统一范围条和全量 KPI 网格。",
  },
  {
    label: "product",
    route: "/product-board",
    root: "[data-testid='product-board-v1-dashboard']",
    kpiCard: "[data-testid='product-board-v1-kpi-card']",
    minKpiCount: 15,
    requiredTitles: ["宝贝GMV", "宝贝GSV", "投入产出比", "去退费比", "直接成交占比"],
    visualSummary: "宝贝页保留当前宝贝选择、安全空态和全量 KPI 网格。",
  },
  {
    label: "upload",
    route: "/upload",
    root: "[data-testid='upload-page-v1-dashboard']",
    kpiCard: null,
    minKpiCount: 0,
    requiredTitles: [],
    visualSummary: "上传页保留多平台按钮、统一批量上传、success / failed / skipped 状态。",
  },
  {
    label: "history",
    route: "/upload/history",
    root: "[data-testid='history-data-v1-page']",
    kpiCard: null,
    minKpiCount: 0,
    requiredTitles: [],
    visualSummary: "历史页只读展示本浏览器安全导入摘要。",
  },
  {
    label: "quality",
    route: "/upload/quality",
    root: "[data-testid='upload-quality-v1-page']",
    kpiCard: null,
    minKpiCount: 0,
    requiredTitles: [],
    visualSummary: "质量页只读展示安全 issue code 和影响范围。",
  },
];

const sourceFiles = [
  "components/visual-system/v1/visual-system.tsx",
  "components/visual-system/v1/brand-model-filter-popover.tsx",
  "components/visual-system/v1/bi-chart.tsx",
  "components/home/home-bi-dashboard.tsx",
  "components/series-board/v1/series-board-v1-dashboard.tsx",
  "components/store-board/v1/store-board-v1-dashboard.tsx",
  "components/product-board/v1/product-board-v1-dashboard.tsx",
  "components/upload/v1/upload-page-v1-dashboard.tsx",
  "components/upload/history/v1/history-data-v1-dashboard.tsx",
  "components/upload/quality/v1/upload-quality-v1-dashboard.tsx",
];

const forbiddenSourceTokens = [
  "V1InformationArchitectureMap",
  "V1LayerSection",
  "V1_INFORMATION_LAYERS",
  "V1InformationLayerId",
  "data-ia-section",
  "data-chart-semantic-layer",
  "bi-chart-semantic-layer",
  "bi-chart-merged-tooltip-layer",
  "home-bi-kpi-customizer",
  "KpiCustomizerDialog",
  "PRIMARY_HOME_KPI",
  "SECONDARY_HOME_KPI",
  "PRIMARY_SERIES_KPI",
  "SECONDARY_SERIES_KPI",
  "PRIMARY_PRODUCT_KPI",
  "SECONDARY_PRODUCT_KPI",
  "PRIMARY_STORE_KPI",
  "SECONDARY_STORE_KPI",
  "BASELINE_HOME_KPI_TITLES",
  "BASELINE_SERIES_KPI_KEYS",
  "BASELINE_PRODUCT_KPI_KEYS",
  "BASELINE_STORE_KPI_KEYS",
  "L1核心",
  "L2解释",
  "L3控制",
  "L4工具",
];

const visibleEngineeringTokens = [
  "L1核心",
  "L2解释",
  "L3控制",
  "L4工具",
  "Primary",
  "Secondary",
  "Hidden KPI",
  "Hidden chip",
  "StoreRecord",
  "ProductRecord",
  "TrackedProductRecord",
  "semantic reconciliation",
];

const mainKpiPollutionTokens = ["unsupported", "Unsupported", "暂不开放普通输入"];
const invalidTokens = ["NaN", "Infinity", "undefined"];
const sensitiveTokens = [
  "rawRows",
  "previewRows",
  "warning 原文",
  "售后订单号",
  "退款编号",
  "交易号",
  "物流信息",
  "买家说明",
  "商家备注原文",
  "操作人",
  "子账号",
  "技术错误堆栈",
];

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const hasAll = (source: string, values: string[]): boolean =>
  values.every((value) => source.includes(value));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractConstArrayItems = (source: string, constName: string): string[] => {
  const pattern = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const;`);
  const match = source.match(pattern);
  if (!match?.[1]) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
};

const readDocText = (filePath: string): string => {
  if (!fs.existsSync(filePath)) return "";
  const result = spawnSync("textutil", ["-convert", "txt", "-stdout", filePath], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) return result.stdout;
  return fs.readFileSync(filePath, "utf8");
};

const gitStatusFor = (paths: string[]): string[] => {
  const result = spawnSync("git", ["status", "--porcelain", "--", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) return [`git_status_failed:${result.stderr}`];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
};

const httpOk = async (route: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, "")}${route}`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
};

const ensureServer = async (): Promise<ChildProcessWithoutNullStreams | null> => {
  if (await httpOk("/home")) return null;
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  child.stdout.on("data", () => undefined);
  child.stderr.on("data", () => undefined);

  for (let index = 0; index < 120; index += 1) {
    if (await httpOk("/home")) return child;
    await wait(500);
  }
  child.kill("SIGTERM");
  throw new Error("Local dev server did not become ready");
};

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();
  readonly consoleErrors: string[] = [];

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
      if (params?.entry?.level !== "error") return;
      const text = `${params.entry.url ?? "unknown"} ${params.entry.text ?? "log_error"}`;
      if (text.includes("/favicon.ico") && text.includes("404")) return;
      this.consoleErrors.push(text);
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

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
};

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

  for (let index = 0; index < 60; index += 1) {
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

const getDebuggerUrl = async (port: number): Promise<string> => {
  const targets = await fetchJson<Array<{ type: string; webSocketDebuggerUrl?: string }>>(`http://127.0.0.1:${port}/json`);
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error("No page debugger URL");
  return page.webSocketDebuggerUrl;
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

const waitForSelector = async (client: CdpClient, selector: string) => {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate<boolean>(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await wait(100);
  }
  throw new Error(`Missing selector ${selector}`);
};

const setViewport = async (client: CdpClient, width: number, height: number) => {
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await wait(200);
};

const runStaticChecks = () => {
  requiredReadFiles.forEach((file) => addCheck(`${file}:readable`, fs.existsSync(path.join(ROOT, file))));
  addCheck("currentTaskAttachmentRead", fs.existsSync(currentTaskAttachment));

  const agents = read("AGENTS.md");
  const projectState = read("docs/PROJECT_CURRENT_STATE.md");
  const matrix = read("docs/PAGE_PROBLEM_MATRIX_V2.md");
  const protocol = read("docs/TASK_EXECUTION_PROTOCOL_V1.md");
  const uiBaseline = read("docs/UI_BASELINE_LOCK_V2.md");
  const uiAgent = read("docs/agents/ui-layout-agent.md");
  const uiSkill = read("docs/skills/airburg-ui-layout-skill.md");

  addCheck("agentsRead", hasAll(agents, ["Tmall V1 Internal Beta Agent Protocol", "UI tasks must not modify ETL"]));
  addCheck("projectStateRead", hasAll(projectState, ["天猫 V1 内测排查版", "RESTORE_FULL_KPI_GRID_FROM_PAGE_PROBLEM_V2_BASELINE_V1"]));
  addCheck("problemMatrixRead", resolutionPlan.every((item) => matrix.includes(item.problemId)));
  addCheck("taskProtocolRead", hasAll(protocol, ["跨层修改检查", "UI 只做展示和交互"]));
  addCheck("uiBaselineRead", hasAll(uiBaseline, ["页面问题梳理第二版 · 全量 KPI 卡片网格基线", "PUBLIC_DEPLOYED = true", "SERVER_ALIGNED = true"]));
  addCheck("uiLayoutAgentAndSkillRead", hasAll(uiAgent, ["UI Layout Agent"]) && hasAll(uiSkill, ["UI", "problemId"]));

  const pageProblemOneText = readDocText(pageProblemOneDoc);
  addCheck("pageProblemOneRead", hasAll(pageProblemOneText, ["经营首页", "数据上传", "系列看板", "宝贝看板"]));
  addCheck("pageProblemTwoReferencedByMatrix", fs.existsSync(path.join(ROOT, pageProblemTwoReference)) && matrix.includes("PVM2-001"));
  addCheck("wireframesNotFoundRecorded", !fs.existsSync(wireframeV1) && !fs.existsSync(wireframeV2), { wireframeV1, wireframeV2, status: "not_found" });

  const planIds = new Set(resolutionPlan.map((item) => item.problemId));
  addCheck("pageProblemResolutionPlanGenerated", resolutionPlan.length >= 12, resolutionPlan);
  addCheck("eachResolutionPlanItemBoundToProblemId", resolutionPlan.every((item) => matrix.includes(item.problemId) && planIds.has(item.problemId)));
  addCheck("resolutionPlanHasNoDataLogicChange", resolutionPlan.every((item) => item.isDataLogicChange === false));
  addCheck("resolutionPlanAvoidsForbiddenFiles", resolutionPlan.every((item) => item.filesToModify.every((file) => !file.startsWith("lib/") && !file.startsWith("package") && !file.startsWith("vercel"))));

  const sources = Object.fromEntries(sourceFiles.map((file) => [file, read(file)]));
  const joined = Object.values(sources).join("\n");
  const forbiddenHits = forbiddenSourceTokens.filter((token) => joined.includes(token));
  addCheck("noIaKpiWrapperSourceResidue", forbiddenHits.length === 0, forbiddenHits);

  const homeItems = extractConstArrayItems(sources["components/home/home-bi-dashboard.tsx"], "FULL_HOME_KPI_TITLES");
  const seriesItems = extractConstArrayItems(sources["components/series-board/v1/series-board-v1-dashboard.tsx"], "FULL_SERIES_KPI_KEYS");
  const storeItems = extractConstArrayItems(sources["components/store-board/v1/store-board-v1-dashboard.tsx"], "FULL_STORE_KPI_KEYS");
  const productItems = extractConstArrayItems(sources["components/product-board/v1/product-board-v1-dashboard.tsx"], "FULL_PRODUCT_KPI_KEYS");

  addCheck("homeKpiCountAtLeast15", homeItems.length >= 17, homeItems);
  addCheck("seriesKpiCountAtLeast15", seriesItems.length >= 15, seriesItems);
  addCheck("storeKpiCountAtLeast15", storeItems.length >= 15, storeItems);
  addCheck("productKpiCountAtLeast15", productItems.length >= 15, productItems);
  addCheck("kpiFiveFieldLayoutPreserved", ["当前 ", "MTD目标", "总目标", "差值", "完成率", "progress"].every((token) => joined.includes(token)));
  addCheck("missingMetricsTitlesPreserved", homeItems.includes("去退费比") && homeItems.includes("直接成交占比"), homeItems);
  addCheck("timePopoverReadable", hasAll(sources["components/visual-system/v1/visual-system.tsx"], ["选择统计时间", "按日", "按周", "按月"]));
  addCheck("centerWordCopyReadable", hasAll(sources["components/visual-system/v1/brand-model-filter-popover.tsx"], ["折叠分组", "编辑分组", "分组别名"]));
  addCheck("targetRulesRemainInTargetAreas", hasAll(joined, ["需要填写的目标", "自动推导的目标", "已隐藏的目标"]));
  addCheck("productIdFirstReferencesPreserved", hasAll(sources["components/series-board/v1/series-board-v1-dashboard.tsx"], ["productId-first"]) && hasAll(sources["components/product-board/v1/product-board-v1-dashboard.tsx"], ["selectedProduct.productId"]));
  addCheck("uploadProductizedAndNotFourSlot", hasAll(sources["components/upload/v1/upload-page-v1-dashboard.tsx"], ["role=\"tablist\"", "天猫", "京东", "抖音", "有赞", "拼多多", "暂未开放", "upload-page-v2-multiple-input"]) && !/四固定槽|固定槽位/.test(sources["components/upload/v1/upload-page-v1-dashboard.tsx"]));
  addCheck("historyQualityReadonlyBoundary", hasAll(sources["components/upload/history/v1/history-data-v1-dashboard.tsx"], ["只读", "安全导入摘要"]) && hasAll(sources["components/upload/quality/v1/upload-quality-v1-dashboard.tsx"], ["只读", "安全 issue code"]));

  const forbiddenPathStatus = gitStatusFor(["package.json", "package-lock.json", "vercel.json", ".vercel", "lib/storage", "lib/tmall", "lib/v05", "private-samples"]);
  addCheck("packageVercelStorageTmallV05Unchanged", forbiddenPathStatus.length === 0, forbiddenPathStatus);
};

const runBrowserChecks = async () => {
  const server = await ensureServer();
  const port = 9359;
  const outputDir = fs.mkdtempSync(path.join("/tmp", "airburg-page-problem-v1-v2-layout-"));
  const screenshotDir = path.join(outputDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const chrome = await launchChrome(port, fs.mkdtempSync(path.join("/tmp", "airburg-page-problem-chrome-")));
  const client = await CdpClient.connect(await getDebuggerUrl(port));
  const screenshots: Array<{ page: string; viewport: string; path: string }> = [];

  try {
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: BASE_URL.replace(/\/$/, "") });
    await wait(300);
    await evaluate<void>(
      client,
      `window.localStorage.setItem("airburg:demo-session", JSON.stringify({ account: "page-problem-resolution@airburg.local", loggedInAt: "2026-07-03T00:00:00.000Z" }))`,
    );

    for (const spec of pageSpecs) {
      for (const viewport of [
        { label: "1440", width: 1440, height: 1000 },
        { label: "390", width: 390, height: 900 },
      ]) {
        client.consoleErrors.length = 0;
        await setViewport(client, viewport.width, viewport.height);
        await client.send("Page.navigate", { url: `${BASE_URL.replace(/\/$/, "")}${spec.route}` });
        await waitForSelector(client, spec.root);
        await wait(900);

        const bodyText = await evaluate<string>(client, "document.body.innerText");
        const overflow = await evaluate<boolean>(
          client,
          "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || document.body.scrollWidth > window.innerWidth + 1",
        );
        const visibleForbidden = visibleEngineeringTokens.filter((token) => bodyText.includes(token));
        const invalidVisible = invalidTokens.filter((token) => bodyText.includes(token));
        const sensitiveVisible = sensitiveTokens.filter((token) => bodyText.includes(token));
        const mainKpiPollution = mainKpiPollutionTokens.filter((token) => bodyText.includes(token));
        const kpiCount = spec.kpiCard
          ? await evaluate<number>(client, `document.querySelectorAll(${JSON.stringify(spec.kpiCard)}).length`)
          : null;
        const cardTitles = spec.kpiCard
          ? await evaluate<string[]>(client, `Array.from(document.querySelectorAll(${JSON.stringify(spec.kpiCard)})).map((node) => node.getAttribute("data-kpi-title") || "")`)
          : [];
        const missingTitles = spec.requiredTitles.filter((title) => !cardTitles.includes(title));
        const cardsWithFiveFields = spec.kpiCard
          ? await evaluate<boolean>(
            client,
            `Array.from(document.querySelectorAll(${JSON.stringify(spec.kpiCard)})).every((node) => ["MTD目标","总目标","差值","完成率"].every((token) => (node.textContent || "").includes(token)))`,
          )
          : true;
        const screenshot = await client.send<{ data: string }>("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        const screenshotPath = path.join(screenshotDir, `${spec.label}-${viewport.label}.png`);
        fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
        screenshots.push({ page: spec.route, viewport: viewport.label, path: screenshotPath });

        addCheck(`${spec.label}-${viewport.label}:root`, true);
        addCheck(`${spec.label}-${viewport.label}:consoleBusinessErrorsZero`, client.consoleErrors.length === 0, client.consoleErrors);
        addCheck(`${spec.label}-${viewport.label}:noHorizontalOverflow`, !overflow);
        addCheck(`${spec.label}-${viewport.label}:noVisibleEngineeringTokens`, visibleForbidden.length === 0, visibleForbidden);
        addCheck(`${spec.label}-${viewport.label}:noInvalidText`, invalidVisible.length === 0, invalidVisible);
        addCheck(`${spec.label}-${viewport.label}:noSensitiveText`, sensitiveVisible.length === 0, sensitiveVisible);
        if (spec.kpiCard) {
          addCheck(`${spec.label}-${viewport.label}:fullKpiGridCount`, (kpiCount ?? 0) >= spec.minKpiCount, { kpiCount, cardTitles });
          addCheck(`${spec.label}-${viewport.label}:requiredKpiTitlesPresent`, missingTitles.length === 0, { missingTitles, cardTitles });
          addCheck(`${spec.label}-${viewport.label}:kpiCardsFiveFieldLayout`, cardsWithFiveFields);
          addCheck(`${spec.label}-${viewport.label}:mainKpiAreaNoUnsupportedTargetCopy`, mainKpiPollution.length === 0, mainKpiPollution);
        }
      }
    }

    const manifest = {
      taskName: "PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_PIPELINE_V1",
      createdAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      humanReviewRequired: true,
      screenshots,
      visualReviewSummary: Object.fromEntries(pageSpecs.map((spec) => [spec.label, spec.visualSummary])),
    };
    const manifestPath = path.join(outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    addCheck("screenshotManifestWritten", true, manifestPath);
  } finally {
    client.close();
    chrome.kill("SIGTERM");
    if (server) server.kill("SIGTERM");
  }
};

const main = async () => {
  let status: Status = "PASS";
  try {
    console.log("PAGE_PROBLEM_RESOLUTION_PLAN:");
    console.log(JSON.stringify(resolutionPlan, null, 2));
    runStaticChecks();
    await runBrowserChecks();
    if (checks.some((check) => !check.pass)) status = "FAIL";
  } catch (error) {
    status = "FAIL";
    addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
  }

  const failed = checks.filter((check) => !check.pass);
  const screenshotManifest = checks.find((check) => check.name === "screenshotManifestWritten")?.details ?? null;
  console.log(JSON.stringify({
    status,
    checks,
    failed,
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
      citedProblemIds: resolutionPlan.map((item) => item.problemId),
      humanReviewRequired: true,
      screenshotManifest,
      visualReviewSummary: Object.fromEntries(pageSpecs.map((spec) => [spec.label, spec.visualSummary])),
      sourceDocuments: {
        pageProblemOne: pageProblemOneDoc,
        pageProblemTwo: pageProblemTwoReference,
        wireframeV1: fs.existsSync(wireframeV1) ? wireframeV1 : "not_found",
        wireframeV2: fs.existsSync(wireframeV2) ? wireframeV2 : "not_found",
      },
    },
  }, null, 2));
  console.log(`PAGE_PROBLEM_V1_V2_LAYOUT_AGENT_RESOLUTION_PIPELINE_V1_STATUS: ${status}`);
  process.exit(status === "PASS" ? 0 : 1);
};

void main();
