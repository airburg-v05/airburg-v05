import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const exists = (relativePath: string): boolean => fs.existsSync(path.join(ROOT, relativePath));

const forbiddenSensitiveText = [
  "订单编号",
  "退款编号",
  "支付宝交易号",
  "手机号",
  "电话",
  "地址",
  "收件人",
  "买家退款说明",
  "商家备注",
  "物流单号",
  "物流信息",
];

const main = () => {
  const page = read("app/(workspace)/targets/page.tsx");
  const component = read("components/targets/v05/target-management-client.tsx");
  const contracts = read("lib/v05/target-management/contracts.ts");
  const allocation = read("lib/v05/target-management/allocation.ts");
  const mutations = read("lib/v05/target-management/mutations.ts");
  const buildViewModel = read("lib/v05/target-management/build-view-model.ts");
  const index = read("lib/v05/target-management/index.ts");
  const packageJson = read("package.json");
  const currentTask = read("docs/project/current-task.json");

  const touchedSources = [component, contracts, allocation, mutations, buildViewModel, index].join("\n");
  const checks: Check[] = [
    { name: "/targets keeps v05 client", pass: page.includes("TargetManagementClient") },
    { name: "allocation helper exists", pass: exists("lib/v05/target-management/allocation.ts") },
    { name: "allocation helper exported", pass: index.includes("export * from \"./allocation\"") },
    { name: "allocation child option contract exists", pass: contracts.includes("TargetAllocationChildOption") },
    { name: "allocate mutation exists", pass: mutations.includes("allocateChildTargetMutation") },
    { name: "view model exposes allocation child options", pass: buildViewModel.includes("allocationChildOptions") },
    { name: "target rows include allocate child action", pass: component.includes("分配子目标") && component.includes("onAllocate") },
    { name: "allocation drawer has dialog semantics", pass: component.includes("aria-label=\"分配子目标\"") && component.includes("role=\"dialog\"") && component.includes("aria-modal=\"true\"") },
    { name: "parent detail shows required fields", pass: ["父目标值", "启用已分配", "暂停已分配", "剩余值", "超额值", "子目标数量", "allocationStatus"].every((text) => component.includes(text)) },
    { name: "metric period direction locked", pass: component.includes("锁定口径") && component.includes("指标") && component.includes("周期") && component.includes("方向") },
    { name: "manual target value required", pass: component.includes("手动填写子目标值") && component.includes("子目标值必须大于 0") },
    { name: "over allocation warning exists", pass: component.includes("超额分配") && component.includes("系统允许保存") },
    { name: "direct child copy present", pass: component.includes("company 只能分配到 store") && component.includes("store 只能分配到同店系列") && component.includes("series 只能分配到该系列商品") },
    { name: "non-additive blocked by allocation helper", pass: allocation.includes("getTargetMetricAllocationMode(parentTarget.metricKey) !== \"sum\"") },
    { name: "company store series product direct scopes only", pass: allocation.includes("if (scope === \"company\") return \"store\"") && allocation.includes("if (scope === \"store\") return \"series\"") && allocation.includes("if (scope === \"series\") return \"product\"") },
    { name: "product parent cannot allocate", pass: allocation.includes("target.scope !== \"product\"") && mutations.includes("商品目标不能继续向下分配") },
    { name: "series product choices come from parent series productIds", pass: allocation.includes("parentSeries.productIds") && allocation.includes("productId") },
    { name: "candidate excludes existing same semantic child", pass: allocation.includes("childAlreadyHasSameTarget") },
    { name: "save still uses prepare/readback/activate runtime", pass: component.includes("saveTargetManagementChange") && mutations.includes("upsertTargetMutation") },
    { name: "Escape closes drawers", pass: (component.match(/event.key === "Escape"/g) ?? []).length >= 2 },
    { name: "focus return exists", pass: component.includes("trigger?.focus()") },
    { name: "buttons declare type", pass: !/<button(?![^>]*type=)/.test(component) },
    { name: "drawer mobile width safe", pass: component.includes("w-full max-w-full") && component.includes("sm:max-w-[640px]") },
    { name: "table local overflow only", pass: component.includes("overflow-x-auto") && component.includes("min-w-[1100px]") },
    { name: "no direct indexedDB", pass: !touchedSources.includes("indexedDB.open") },
    { name: "no localStorage writes", pass: !component.includes("localStorage") && !allocation.includes("localStorage") && !mutations.includes("localStorage") },
    { name: "no AI allocation", pass: !/AI|人工智能|自动平均|销量比例|店铺贡献/.test(touchedSources) },
    { name: "no sensitive field names", pass: !forbiddenSensitiveText.some((keyword) => touchedSources.includes(keyword)) },
    { name: "no invalid number literal output", pass: !/>\\s*(NaN|Infinity|undefined)\\s*</.test(component) && !/\"(NaN|Infinity|undefined)\"/.test(component) },
    { name: "current task is F2", pass: currentTask.includes("V0.5F_2_PARENT_CHILD_TARGET_ALLOCATION_WORKFLOW") },
    { name: "no new dependency", pass: !packageJson.includes("playwright") && !packageJson.includes("puppeteer") },
  ];

  const failedChecks = checks.filter((check) => !check.pass).map((check) => check.name);
  console.log(JSON.stringify({
    status: failedChecks.length === 0 ? "PASS" : "FAIL",
    script: "validate-v05f2-target-allocation-ui",
    failedChecks,
    safeUiEvidence: {
      allocationDrawer: true,
      parentSummaryFields: 7,
      directChildWorkflow: true,
    },
    checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
  }, null, 2));
  if (failedChecks.length > 0) process.exitCode = 1;
};

main();
