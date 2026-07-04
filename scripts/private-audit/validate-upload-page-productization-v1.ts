import fs from "node:fs";
import path from "node:path";

type Check = {
  name: string;
  pass: boolean;
  detail?: unknown;
};

const root = process.cwd();
const uploadPagePath = path.join(root, "components/upload/v1/upload-page-v1-dashboard.tsx");
const source = fs.readFileSync(uploadPagePath, "utf8");
const checks: Check[] = [];

const addCheck = (name: string, pass: boolean, detail?: unknown) => {
  checks.push({ name, pass, detail });
};

const platformOptionsBlock = source.match(/const PLATFORM_OPTIONS = \[[\s\S]*?\];/)?.[0] ?? "";
const resultSummaryBlock = source.match(/function ResultSummary\([\s\S]*?export function UploadPageV1Dashboard/)?.[0] ?? "";
const recognitionBlock = source.match(/function RecognitionList\([\s\S]*?function ResultSummary/)?.[0] ?? "";

addCheck("uploadPageSourceExists", source.length > 0, { uploadPagePath });
addCheck("platformTabsExist", source.includes('data-testid="upload-page-v1-platform-tabs"') && source.includes('role="tablist"'));
addCheck("tmallTabOpen", /code:\s*"tmall"[\s\S]*?name:\s*"天猫"[\s\S]*?open:\s*true/.test(platformOptionsBlock));
addCheck("jdTabDisabled", /code:\s*"jd"[\s\S]*?name:\s*"京东"[\s\S]*?open:\s*false/.test(platformOptionsBlock));
addCheck("douyinTabDisabled", /code:\s*"douyin"[\s\S]*?name:\s*"抖音"[\s\S]*?open:\s*false/.test(platformOptionsBlock));
addCheck("youzanTabDisabled", /code:\s*"youzan"[\s\S]*?name:\s*"有赞"[\s\S]*?open:\s*false/.test(platformOptionsBlock));
addCheck("pddTabDisabled", /code:\s*"pdd"[\s\S]*?name:\s*"拼多多"[\s\S]*?open:\s*false/.test(platformOptionsBlock));
addCheck("fivePlatformTabsOnly", ["tmall", "jd", "douyin", "youzan", "pdd"].every((code) => platformOptionsBlock.includes(`code: "${code}"`)), platformOptionsBlock);
addCheck("disabledPlatformButtons", source.includes("disabled={!platform.open}") && source.includes("disabled"));

addCheck("productStatusTypeExists", source.includes('type ProductUploadStatus = "成功" | "失败" | "skipped"'));
addCheck("productStatusMapperExists", source.includes("const productStatusFor"));
addCheck("productStatusSummaryExists", source.includes("const summarizeProductStatuses"));
addCheck(
  "recognitionOnlyUsesProductStatuses",
  recognitionBlock.includes("productStatusFor(item)") &&
    recognitionBlock.includes("data-product-status") &&
    recognitionBlock.includes("{productStatus}"),
);
addCheck(
  "resultSummaryOnlyShowsProductStatusCounts",
  resultSummaryBlock.includes("statusCounts.success") &&
    resultSummaryBlock.includes("statusCounts.failed") &&
    resultSummaryBlock.includes("statusCounts.skipped") &&
    !/成功识别文件数|商品数量|商品经营指标数量|计划指标数量|总搜索词数量|商品搜索词数量|售后聚合数量|安全提示数量|去重数量/.test(resultSummaryBlock),
);

addCheck("noRawRowsLiteralInUploadPage", !source.includes("rawRows"));
addCheck("noPreviewRowsLiteralInUploadPage", !source.includes("previewRows"));
addCheck("noWarningOriginalCopyInUploadPage", !source.includes("warning 原文"));
addCheck("noTechnicalRecognitionColumns", !/Sheet \/ 行数|安全提示<\/th>|重复<\/th>|大小<\/th>/.test(source));
addCheck("noTechnicalDuplicateRuleCopy", !source.includes("size / lastModified / type"));
addCheck("noOldUploadSummaryLabels", !/待导入文件|重复文件：|识别失败：|缺失类型：/.test(source));
addCheck("noDeveloperResultDatasetCounts", !/ETL 数据集|商品经营指标数量|计划指标数量|总搜索词数量|商品搜索词数量/.test(source));

addCheck("runETLRuntimeStillCalled", source.includes("runETLRuntime("));
addCheck("runtimeDatasetPersistenceStillCalled", source.includes("saveRuntimeDatasetSnapshot("));
addCheck("multipleFileInputStillExists", source.includes("type=\"file\"") && source.includes("multiple"));
addCheck("uploadEntryStillUnified", source.includes("批量上传天猫数据文件") && source.includes("选择文件") && source.includes("批量导入"));
addCheck("uploadIaToolLayerExists", source.includes('activeLayer="L4"') && source.includes('testId="upload-page-v1-l4-tool-layer"'));

const failed = checks.filter((check) => !check.pass);
const result = {
  task: "UPLOAD_PAGE_PRODUCTIZATION_V1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  checks,
  failed,
};

console.log(JSON.stringify(result, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
