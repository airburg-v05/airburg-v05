import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const uploadPage = read("app/(workspace)/upload/page.tsx");
const historyPage = read("app/(workspace)/upload/history/page.tsx");
const qualityPage = read("app/(workspace)/upload/quality/page.tsx");
const nav = read("components/upload/data-center/data-center-nav.tsx");
const contextBar = read("components/upload/data-center/data-center-context-bar.tsx");
const workbench = read("components/upload/batch-import/tmall-batch-import-workbench.tsx");
const historyClient = read("components/upload/import-history/import-history-client.tsx");
const qualityClient = read("components/upload/data-quality/data-quality-client.tsx");
const context = read("lib/v05/data-center/context.ts");
const dataCenterSources = [nav, contextBar, context].join("\n");
const pageSources = [uploadPage, historyPage, qualityPage, workbench, historyClient, qualityClient].join("\n");

const sensitiveFieldNames = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "卖家电话",
  "卖家手机",
  "卖家退货地址",
  "物流单号",
  "物流信息",
  "买家退款说明",
  "商家备注",
  "审核操作人",
  "退款操作人",
  "子账号",
  "卖家真实姓名",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "操作人",
] as const;

const checks: Check[] = [
  { name: "three_page_responsibilities_visible", pass: uploadPage.includes("一次批量选择报表文件并导入") && historyPage.includes("导入批次") && qualityPage.includes("数据缺口") },
  { name: "shared_context_explains_safe_scope", pass: contextBar.includes("不传递文件名、原始字段或敏感明细") },
  { name: "upload_closure_links_exist", pass: workbench.includes("查看导入记录") && workbench.includes("查看数据质量") },
  { name: "history_closure_drawer_links_exist", pass: historyClient.includes("查看当前批次质量") && historyClient.includes("重新导入") },
  { name: "quality_closure_links_exist", pass: qualityClient.includes("查看导入记录") && qualityClient.includes("重新导入") && qualityClient.includes("返回数据导入") },
  { name: "unified_safe_states_exist", pass: historyClient.includes("正在读取导入记录") && historyClient.includes("历史数据不可安全读取") && qualityClient.includes("本地数据状态不可安全读取") },
  { name: "drawer_accessible_dialog", pass: historyClient.includes("role=\"dialog\"") && historyClient.includes("aria-modal=\"true\"") && historyClient.includes("aria-labelledby") },
  { name: "drawer_keyboard_escape", pass: historyClient.includes("event.key === \"Escape\"") && historyClient.includes("addEventListener(\"keydown\"") },
  { name: "drawer_focus_return", pass: historyClient.includes("lastTriggerRef") && historyClient.includes("focus()") },
  { name: "nav_keyboard_focus_visible", pass: nav.includes("focus:outline-none") && nav.includes("focus:ring-2") },
  { name: "mobile_nav_no_page_overflow", pass: nav.includes("overflow-x-auto") && nav.includes("min-w-max") },
  { name: "mobile_cards_safe", pass: [workbench, historyClient, qualityClient].every((source) => source.includes("min-w-0") && source.includes("truncate")) },
  { name: "tables_local_scroll", pass: historyClient.includes("overflow-x-auto") && historyClient.includes("min-w-[1180px]") },
  { name: "invalid_query_safe_fallback", pass: context.includes("SAFE_TOKEN_PATTERN") && context.includes("EMPTY_DATA_CENTER_CONTEXT") },
  { name: "no_storage_for_navigation_context", pass: !/localStorage|sessionStorage/.test(dataCenterSources) },
  { name: "no_ai_copy", pass: !/(^|[^A-Z])AI([^A-Z]|$)|千问|OpenAI|DashScope|百炼/.test(pageSources) },
  { name: "no_internal_storage_terms_visible", pass: !/(Storage V2|Active V2|Legacy 兼容|V2 导入批次|V2 安全元数据|V2 staging|readback)/.test(pageSources) },
  { name: "no_destructive_actions", pass: !/(>删除<|删除批次|删除记录|执行回滚|强制覆盖|手工编辑|manualEdit)/.test(pageSources) },
  { name: "no_sensitive_field_names", pass: sensitiveFieldNames.every((term) => !pageSources.includes(term)) },
  { name: "invalid_numbers_are_safely_formatted", pass: workbench.includes("? value.toLocaleString") && historyClient.includes("Number.isNaN") && !/>NaN<|>Infinity<|>undefined</.test(pageSources) },
  { name: "no_raw_rows_or_preview_rows", pass: !/rawRows|previewRows|原始明细|原始 rows/.test(pageSources) },
  { name: "quality_warning_safe_copy", pass: qualityClient.includes("当前仅展示安全分类、数量和修复建议") },
  { name: "history_safe_copy", pass: historyClient.includes("详情仅展示安全聚合、状态和计数") },
  { name: "reimport_path_does_not_autosubmit", pass: workbench.includes("本次重新导入会创建新批次，不会修改原批次") && !/autoSubmit|自动提交/.test(workbench) },
];

const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  checkedPages: ["/upload", "/upload/history", "/upload/quality"],
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
