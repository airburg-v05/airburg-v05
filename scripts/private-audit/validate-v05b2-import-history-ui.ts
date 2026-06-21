import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const historyPage = read("app/(workspace)/upload/history/page.tsx");
const uploadPage = read("app/(workspace)/upload/page.tsx");
const component = read("components/upload/import-history/import-history-client.tsx");
const runtime = read("lib/v05/import-history/browser-runtime.ts");
const buildHistory = read("lib/v05/import-history/build-history.ts");
const combined = [historyPage, uploadPage, component, runtime, buildHistory].join("\n");

const checks: Check[] = [
  { name: "upload_history_route_exists", pass: exists("app/(workspace)/upload/history/page.tsx") },
  { name: "upload_has_history_entry", pass: uploadPage.includes('href="/upload/history"') && uploadPage.includes("导入记录") },
  { name: "history_page_uses_client", pass: historyPage.includes("ImportHistoryClient") },
  { name: "filter_bar_exists", pass: component.includes("筛选导入记录") && component.includes("平台") && component.includes("店铺") && component.includes("数据状态") },
  { name: "table_exists", pass: component.includes("<table") && component.includes("导入记录列表") },
  { name: "detail_drawer_exists", pass: component.includes("ImportHistoryDrawer") && component.includes("导入详情") },
  { name: "drawer_close_button_exists", pass: component.includes("关闭") && component.includes("aria-label=\"关闭导入详情\"") },
  { name: "no_delete_button", pass: !/(>删除<|删除批次|删除记录)/.test(component) },
  { name: "no_rollback_action_button", pass: !/(>回滚<|执行回滚|回滚数据)/.test(component) },
  { name: "no_overwrite_button", pass: !/(>覆盖<|覆盖数据)/.test(component) },
  { name: "no_raw_file_column", pass: !component.includes("文件名") && !component.includes("文件路径") && !component.includes("rawRows") && !component.includes("previewRows") },
  { name: "no_direct_indexeddb_open", pass: !/indexedDB\.open|indexeddb\.open/i.test(combined) },
  { name: "uses_public_persistence_api", pass: ["listDatasetMetadata", "listActivationJournal", "getActivePointer", "loadDataset", "loadActiveDataset"].every((term) => runtime.includes(term)) },
  { name: "three_main_regions", pass: historyPage.includes("PageHeader") && component.includes("筛选导入记录") && component.includes("导入记录列表") },
  { name: "status_pages_supported", pass: ["正在读取导入记录", "暂无导入记录", "历史数据不可安全读取", "读取失败"].every((term) => component.includes(term)) },
  { name: "desktop_table_local_scroll", pass: component.includes("overflow-x-auto") && component.includes("min-w-[1180px]") },
  { name: "long_ids_truncate_monospace", pass: component.includes("font-mono") && component.includes("truncate") && component.includes("shortId") },
  { name: "drawer_mobile_full_width", pass: component.includes("w-full") && component.includes("sm:max-w-[560px]") },
  { name: "mobile_safe_classes", pass: component.includes("min-w-0") && component.includes("md:grid-cols-2") },
  { name: "duplicate_conflict_truth_copy", pass: component.includes("重复或冲突结果只在导入当次反馈，不生成新的历史批次") },
  { name: "no_ai_copy", pass: !/(^|[^A-Z])AI([^A-Z]|$)|千问|OpenAI|DashScope|百炼/.test(combined) },
];

const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  route: "/upload/history",
  uploadEntry: "/upload",
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
