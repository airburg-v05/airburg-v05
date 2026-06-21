import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface Check {
  name: string;
  pass: boolean;
}

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const pageSource = read("app/(workspace)/upload/page.tsx");
const componentSource = read("components/upload/batch-import/tmall-batch-import-workbench.tsx");
const contractsSource = read("lib/v05/import/contracts.ts");
const browserRuntimeSource = read("lib/v05/import/browser-runtime.ts");
const combined = [pageSource, componentSource, contractsSource, browserRuntimeSource].join("\n");

const forbiddenPageTerms = [
  "开始四源分析",
  "UploadDataQualityCenter",
  "TmallSourceUploadCard",
  "TmallUploadActions",
  "TmallSourceHealthGrid",
  "TmallDateAlignment",
  "TmallJoinQualityPanel",
  "TmallReconciliationCard",
  "TmallDataQualityList",
] as const;

const sectionPanelCount =
  (componentSource.match(/<section className="panel p-5">/g) ?? []).length;

const checks: Check[] = [
  {
    name: "upload_page_uses_batch_import_component",
    pass: pageSource.includes("TmallBatchImportWorkbench"),
  },
  {
    name: "old_upload_modules_not_imported",
    pass: forbiddenPageTerms.every((term) => !pageSource.includes(term)),
  },
  {
    name: "old_analyze_copy_removed",
    pass: !combined.includes("开始四源分析"),
  },
  {
    name: "three_main_panels",
    pass: sectionPanelCount === 3,
  },
  {
    name: "platforms_listed",
    pass: ["天猫", "京东", "拼多多", "抖音", "有赞"].every((label) => combined.includes(label)),
  },
  {
    name: "non_tmall_disabled_copy",
    pass: (contractsSource.match(/暂未开放/g) ?? []).length >= 4,
  },
  {
    name: "single_multiple_file_input",
    pass:
      (componentSource.match(/type="file"/g) ?? []).length === 1 &&
      componentSource.includes("multiple") &&
      componentSource.includes('accept=".csv,.xls,.xlsx"'),
  },
  {
    name: "drag_and_drop_supported",
    pass: componentSource.includes("onDragOver") && componentSource.includes("onDrop"),
  },
  {
    name: "main_button_is_import",
    pass: componentSource.includes('导入"') || componentSource.includes(">导入<"),
  },
  {
    name: "store_add_validation_present",
    pass:
      componentSource.includes("validateV05NewStoreName") &&
      browserRuntimeSource.includes("店铺名称需为 2 到 40 个字符") &&
      browserRuntimeSource.includes("同平台下已有同名店铺"),
  },
  {
    name: "new_store_not_persisted_until_success_copy",
    pass: componentSource.includes("导入成功后才会写入本地数据"),
  },
  {
    name: "batch_detection_used",
    pass: componentSource.includes("detectV05TmallBatchFiles"),
  },
  {
    name: "one_click_import_used",
    pass: componentSource.includes("runV05BrowserTmallBatchImport"),
  },
  {
    name: "temporary_file_name_only_ui",
    pass:
      componentSource.includes("title={file.fileName}") &&
      !read("lib/v05/import/tmall-import-mapper.ts").includes("fileName"),
  },
  {
    name: "no_long_quality_modules",
    pass: forbiddenPageTerms.every((term) => !combined.includes(term)),
  },
  {
    name: "responsive_mobile_safe_classes",
    pass:
      componentSource.includes("min-w-0") &&
      componentSource.includes("truncate") &&
      componentSource.includes("sm:w-auto"),
  },
  {
    name: "no_ai_copy",
    pass: !/(^|[^A-Z])AI([^A-Z]|$)|千问|OpenAI|DashScope|百炼/.test([pageSource, componentSource].join("\n")),
  },
];

const status = checks.every((check) => check.pass) ? "PASS" : "FAIL";

console.log(JSON.stringify({
  status,
  page: "app/(workspace)/upload/page.tsx",
  component: "components/upload/batch-import/tmall-batch-import-workbench.tsx",
  sectionPanelCount,
  forbiddenResiduals: forbiddenPageTerms.filter((term) => combined.includes(term)),
  checks,
}, null, 2));

if (status !== "PASS") process.exitCode = 1;
