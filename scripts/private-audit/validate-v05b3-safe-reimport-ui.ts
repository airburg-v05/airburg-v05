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

const qualityPage = read("app/(workspace)/upload/quality/page.tsx");
const qualityClient = read("components/upload/data-quality/data-quality-client.tsx");
const uploadPage = read("app/(workspace)/upload/page.tsx");
const workbench = read("components/upload/batch-import/tmall-batch-import-workbench.tsx");
const buildQuality = read("lib/v05/data-quality/build-quality.ts");
const runtime = read("lib/v05/data-quality/browser-runtime.ts");
const reimportContext = read("lib/v05/data-quality/reimport-context.ts");
const combined = [
  qualityPage,
  qualityClient,
  uploadPage,
  workbench,
  buildQuality,
  runtime,
  reimportContext,
].join("\n");

const forbiddenSensitiveTerms = [
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
  { name: "quality_route_exists", pass: exists("app/(workspace)/upload/quality/page.tsx") },
  { name: "upload_has_quality_entry", pass: uploadPage.includes('href="/upload/quality"') && uploadPage.includes("数据质量") },
  { name: "return_upload_entry_exists", pass: qualityPage.includes('href="/upload"') && qualityPage.includes("返回数据导入") },
  { name: "filter_bar_exists", pass: qualityClient.includes("筛选数据质量问题") && ["平台", "店铺", "批次", "问题类型", "状态"].every((term) => qualityClient.includes(term)) },
  { name: "issue_list_exists", pass: qualityClient.includes("质量问题列表") && qualityClient.includes("IssueRow") },
  { name: "reimport_entry_exists", pass: qualityClient.includes("重新导入") && buildQuality.includes("/upload?mode=reimport") },
  { name: "upload_reimport_context_exists", pass: uploadPage.includes("parseReimportContext") && workbench.includes("本次重新导入会创建新批次，不会修改原批次") },
  { name: "no_delete_button", pass: !/(>删除<|删除批次|删除记录|deleteBatch)/.test(combined) },
  { name: "no_force_overwrite", pass: !/(强制覆盖|覆盖数据|forceOverwrite|overwriteBatch)/.test(combined) },
  { name: "no_manual_edit_entry", pass: !/(手工编辑|手工修正|编辑数据|manualEdit)/.test(combined) },
  { name: "no_raw_warning_copy", pass: !/(warning 原文|原始 warning|raw warning|rawWarning)/i.test(combined) },
  { name: "no_raw_file_output", pass: !/(fileName|rawRows|previewRows|文件名历史|文件路径)/.test([qualityPage, qualityClient, buildQuality, runtime].join("\n")) },
  { name: "no_sensitive_field_names_in_ui", pass: forbiddenSensitiveTerms.every((term) => ![qualityPage, qualityClient, buildQuality, runtime].join("\n").includes(term)) },
  { name: "no_direct_indexeddb_open", pass: !/indexedDB\.open|indexeddb\.open/i.test(combined) },
  { name: "uses_public_persistence_api", pass: ["inspectState", "listDatasetMetadata", "loadDataset", "getActivePointer", "loadActiveDataset"].every((term) => runtime.includes(term)) },
  { name: "three_main_regions", pass: qualityPage.includes("PageHeader") && qualityClient.includes("当前质量概览") && qualityClient.includes("筛选数据质量问题") && qualityClient.includes("质量问题列表") },
  { name: "mobile_safe_classes", pass: qualityClient.includes("min-w-0") && qualityClient.includes("grid gap") && qualityClient.includes("sm:grid-cols-2") },
  { name: "search_and_filter_copy", pass: qualityClient.includes("平台、店铺、批次、问题类型和搜索会同时生效") },
  { name: "no_ai_copy", pass: !/(^|[^A-Z])AI([^A-Z]|$)|千问|OpenAI|DashScope|百炼/.test(combined) },
];

const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  route: "/upload/quality",
  uploadRoute: "/upload",
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
