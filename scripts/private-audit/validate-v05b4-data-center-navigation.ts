import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

interface CommandResult {
  command: string;
  status: "PASS" | "FAIL";
}

interface TaskCompletionRecord {
  taskId: string;
  status: string;
  commandResults: CommandResult[];
}

interface CurrentTask {
  taskId: string;
  allowedModifyPaths: string[];
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const exists = (relativePath: string): boolean =>
  fs.existsSync(path.join(ROOT, relativePath));

const git = (args: string[]): string =>
  execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const toPosix = (value: string): string => value.split(path.sep).join("/");

const matchesPathPattern = (file: string, pattern: string): boolean => {
  const normalizedFile = toPosix(file);
  const normalizedPattern = toPosix(pattern);
  if (normalizedFile === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) return normalizedFile.startsWith(normalizedPattern.slice(0, -3));
  return false;
};

const pathAllowed = (file: string, patterns: string[]): boolean =>
  patterns.some((pattern) => matchesPathPattern(file, pattern));

const changedFiles = (): string[] => {
  const status = git(["status", "--porcelain"]);
  if (!status.trim()) return [];
  return status
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((file) => (file.includes(" -> ") ? file.split(" -> ").pop()! : file))
    .map((file) => file.replace(/^"|"$/g, ""));
};

const parseJson = <T>(relativePath: string): T =>
  JSON.parse(read(relativePath)) as T;

const currentTask = parseJson<CurrentTask>("docs/project/current-task.json");
const b3Completion = parseJson<TaskCompletionRecord>(
  "docs/project/task-completions/V0.5B_3_DATA_QUALITY_AND_SAFE_REIMPORT_CENTER.json",
);

const uploadPage = read("app/(workspace)/upload/page.tsx");
const historyPage = read("app/(workspace)/upload/history/page.tsx");
const qualityPage = read("app/(workspace)/upload/quality/page.tsx");
const nav = read("components/upload/data-center/data-center-nav.tsx");
const contextBar = read("components/upload/data-center/data-center-context-bar.tsx");
const state = read("components/upload/data-center/data-center-state.tsx");
const context = read("lib/v05/data-center/context.ts");
const navigation = read("lib/v05/data-center/navigation.ts");
const workbench = read("components/upload/batch-import/tmall-batch-import-workbench.tsx");
const historyClient = read("components/upload/import-history/import-history-client.tsx");
const qualityClient = read("components/upload/data-quality/data-quality-client.tsx");
const combinedDataCenter = [nav, contextBar, state, context, navigation].join("\n");
const combinedPages = [uploadPage, historyPage, qualityPage, workbench, historyClient, qualityClient].join("\n");

const changed = changedFiles();
const forbiddenUrlTerms = [
  "fileName",
  "rawRows",
  "previewRows",
  "safeDescription",
  "suggestion",
  "sourceValues",
  "afterSalesRaw",
] as const;

const checks: Check[] = [
  { name: "current_task_is_b4", pass: currentTask.taskId === "V0.5B_4_DATA_CENTER_NAVIGATION_AND_USABILITY_CLOSURE" },
  { name: "b3_dependency_complete", pass: b3Completion.taskId === "V0.5B_3_DATA_QUALITY_AND_SAFE_REIMPORT_CENTER" && b3Completion.status === "complete" },
  { name: "b3_commands_all_pass", pass: b3Completion.commandResults.length > 0 && b3Completion.commandResults.every((result) => result.status === "PASS") },
  { name: "nav_files_exist", pass: ["components/upload/data-center/data-center-nav.tsx", "components/upload/data-center/data-center-context-bar.tsx", "lib/v05/data-center/context.ts", "lib/v05/data-center/navigation.ts"].every(exists) },
  { name: "three_pages_use_shared_nav", pass: [uploadPage, historyPage, qualityPage].every((source) => source.includes("DataCenterNav") && source.includes("DataCenterContextBar")) },
  { name: "nav_items_are_three_pages", pass: ["数据导入", "导入记录", "数据质量"].every((label) => navigation.includes(label)) },
  { name: "nav_uses_next_link", pass: nav.includes("next/link") && nav.includes("href={dataCenterHref") },
  { name: "nav_active_state_accessible", pass: nav.includes("aria-label=\"数据中心导航\"") && nav.includes("aria-current") },
  { name: "nav_mobile_local_scroll", pass: nav.includes("overflow-x-auto") && nav.includes("min-w-max") },
  { name: "platform_context_supported", pass: context.includes("platform") && context.includes("SUPPORTED_PLATFORM_CODES") },
  { name: "store_context_supported", pass: context.includes("storeId") && context.includes("dataCenterStoreKey") },
  { name: "batch_context_supported", pass: context.includes("batchId") && context.includes("sourceBatchId") },
  { name: "invalid_params_filtered", pass: context.includes("SAFE_TOKEN_PATTERN") && context.includes("isSafeDataCenterToken") },
  { name: "no_local_storage_context", pass: !/localStorage|sessionStorage/.test(combinedDataCenter) },
  { name: "no_sensitive_values_in_url_context", pass: forbiddenUrlTerms.every((term) => !context.includes(term)) },
  { name: "upload_receives_initial_context", pass: uploadPage.includes("parseDataCenterSearchParams") && uploadPage.includes("initialContext={dataCenterContext}") && workbench.includes("initialContext") },
  { name: "upload_success_links_preserve_context", pass: workbench.includes('dataCenterHref("history"') && workbench.includes('dataCenterHref("quality"') && workbench.includes("result.importBatchId") },
  { name: "history_filters_from_context", pass: historyClient.includes("buildInitialFilters") && historyClient.includes("parseDataCenterSearchParams") && historyClient.includes("dataCenterStoreKey") },
  { name: "history_detail_to_quality_path", pass: historyClient.includes("查看当前批次质量") && historyClient.includes('dataCenterHref("quality"') },
  { name: "quality_filters_from_context", pass: qualityClient.includes("buildInitialFilters") && qualityClient.includes("parseDataCenterSearchParams") && qualityClient.includes("importBatchId: context.batchId") },
  { name: "quality_to_history_and_reimport_paths", pass: qualityClient.includes('dataCenterHref("history"') && qualityClient.includes("dataCenterReimportHref") },
  { name: "no_delete_rollback_or_overwrite_actions", pass: !/(>删除<|删除批次|执行回滚|>回滚<|强制覆盖|覆盖数据|forceOverwrite|overwriteBatch)/.test(combinedPages) },
  { name: "changed_files_within_authorized_scope", pass: changed.every((file) => pathAllowed(file, currentTask.allowedModifyPaths)) },
];

const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  taskId: currentTask.taskId,
  sharedNav: ["数据导入", "导入记录", "数据质量"],
  changedFiles: changed,
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
