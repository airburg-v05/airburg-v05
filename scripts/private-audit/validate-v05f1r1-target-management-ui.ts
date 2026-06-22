import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
  detail?: string | number | boolean | null;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = <T>(relativePath: string): T => JSON.parse(read(relativePath)) as T;
const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const component = read("components/targets/v05/target-management-client.tsx");
const page = read("app/(workspace)/targets/page.tsx");
const runtime = read("lib/v05/target-management/browser-runtime.ts");
const datasetUpdate = read("lib/v05/target-management/dataset-update.ts");
const packageJson = read("package.json");
const f0Completion = readJson<{ status: string; commandResults: Array<{ status: string }> }>(
  "docs/project/task-completions/V0.5F_0_TARGET_HIERARCHY_CONTRACT_AND_STORAGE_READINESS.json",
);
const changedFiles = git(["diff", "--name-only"]).split("\n").filter(Boolean);
const allowedPrefixes = [
  "app/(workspace)/targets/page.tsx",
  "components/targets/v05/",
  "lib/v05/target-management/",
  "lib/v05/index.ts",
  "scripts/private-audit/validate-v05f1r1-target-management-data.ts",
  "scripts/private-audit/validate-v05f1r1-target-management-ui.ts",
  "docs/project/current-task.json",
  "docs/project/task-authorizations/V0.5F_1_R1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER.json",
];
const forbiddenChanged = changedFiles.filter((file) => !allowedPrefixes.some((allowed) => file === allowed || file.startsWith(allowed)));
const sensitiveTerms = ["订单编号", "退款编号", "支付宝交易号", "手机号", "地址", "买家退款说明", "商家备注", "物流信息"];
const invalidDisplayPattern = />(?:NaN|Infinity|undefined)</;

const checks: Check[] = [
  { name: "F0 completion valid", pass: f0Completion.status === "complete" && f0Completion.commandResults.every((item) => item.status === "PASS") },
  { name: "targets page only renders v05 client", pass: page.includes("TargetManagementClient") && !page.includes("TargetForm") && !page.includes("TargetList") },
  { name: "old legacy target storage not used", pass: !page.includes("TMALL_TARGET_STORAGE_KEY") && !component.includes("TMALL_TARGET_STORAGE_KEY") && !component.includes("saveTmallTargets") },
  { name: "drawer role exists", pass: component.includes('role="dialog"') && component.includes("aria-modal") },
  { name: "explicit parent choice required", pass: component.includes("__unset__") && component.includes("请选择父目标关系") },
  { name: "parent options use F0 helper", pass: component.includes("buildTargetParentOptions") },
  { name: "no hard delete UI", pass: !component.includes("删除目标") && !component.includes("onDelete") && !component.includes("deleteTarget") },
  { name: "pause and reactivate UI exists", pass: component.includes("暂停") && component.includes("重新启用") },
  { name: "cancel text exists", pass: component.includes(">取消<") || component.includes("取消") },
  { name: "buttons have type", pass: !/<button(?![^>]*type=)/.test(component) },
  { name: "form labels exist", pass: component.includes("目标层级") && component.includes("父目标关系") && component.includes("目标值") },
  { name: "drawer focus return exists", pass: component.includes("focus()") && component.includes("lastTriggerRef") },
  { name: "escape close exists", pass: component.includes('event.key === "Escape"') },
  { name: "unsaved confirmation exists", pass: component.includes("未保存修改") },
  { name: "table local horizontal scroll exists", pass: component.includes("overflow-x-auto") },
  { name: "390 drawer width safe", pass: component.includes("w-full max-w-full") && component.includes("sm:max-w-[640px]") },
  { name: "runtime uses public persistence store", pass: runtime.includes("IndexedDbV2PersistenceStore") && !page.includes("indexedDB.open") && !component.includes("indexedDB.open") },
  { name: "runtime closes store", pass: runtime.includes("store.close()") },
  { name: "prepare/readback/activate chain exists", pass: datasetUpdate.includes("prepareDataset") && datasetUpdate.includes("readBackAndValidateV2Dataset") && datasetUpdate.includes("activatePreparedV2Dataset") },
  { name: "expectedCurrentDatasetId conflict path exists", pass: datasetUpdate.includes("active_dataset_conflict") && datasetUpdate.includes("expectedCurrentDatasetId") },
  { name: "no AI integration", pass: !component.includes("AI") && !component.includes("千问") && !component.includes("OpenAI") },
  { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
  { name: "no sensitive term in sources", pass: sensitiveTerms.every((term) => !component.includes(term) && !page.includes(term)) },
  { name: "no invalid number display literal in sources", pass: !invalidDisplayPattern.test(component) && !invalidDisplayPattern.test(page) },
  { name: "only allowed paths changed", pass: forbiddenChanged.length === 0, detail: forbiddenChanged.join(",") || null },
];

const failed = checks.filter((check) => !check.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  task: "V0.5F_1_R1_HIERARCHICAL_TARGET_ALLOCATION_AND_TARGET_DRAWER",
  checks,
  safeCounts: {
    changedFiles: changedFiles.length,
    forbiddenChanged: forbiddenChanged.length,
    failed: failed.length,
  },
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
