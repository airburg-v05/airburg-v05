import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import defaultXlsx, * as XLSX from "xlsx";

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const OFFICIAL_SHEETJS_TARBALL = "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz";
const POSTCSS_BLOCKER_STATUS = "BLOCKED_BY_UPSTREAM_STABLE_FIX_LOW_CURRENT_EXPOSURE";

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

const checks = [];

const addCheck = (name, pass, details = undefined) => {
  checks.push({ name, pass, details });
};

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const rootLock = packageLock.packages?.[""];
const xlsxLock = packageLock.packages?.["node_modules/xlsx"];

addCheck(
  "xlsxDependencyUsesOfficialSheetJs0203Tarball",
  packageJson.dependencies?.xlsx === OFFICIAL_SHEETJS_TARBALL &&
    rootLock?.dependencies?.xlsx === OFFICIAL_SHEETJS_TARBALL &&
    xlsxLock?.version === "0.20.3" &&
    xlsxLock?.resolved === OFFICIAL_SHEETJS_TARBALL,
  {
    packageJson: packageJson.dependencies?.xlsx,
    packageLockRoot: rootLock?.dependencies?.xlsx,
    lockVersion: xlsxLock?.version,
    lockResolved: xlsxLock?.resolved,
  },
);

const cjsXlsx = require("xlsx");
addCheck(
  "xlsxImportApiCompatible",
  XLSX.version === "0.20.3" &&
    cjsXlsx.version === "0.20.3" &&
    typeof XLSX.read === "function" &&
    typeof defaultXlsx.read === "function" &&
    typeof cjsXlsx.read === "function" &&
    typeof XLSX.utils?.sheet_to_json === "function" &&
    typeof XLSX.write === "function",
  {
    esmNamespaceVersion: XLSX.version,
    esmDefaultVersion: defaultXlsx.version ?? null,
    cjsVersion: cjsXlsx.version,
    hasRead: typeof XLSX.read,
    hasDefaultRead: typeof defaultXlsx.read,
    hasSheetToJson: typeof XLSX.utils?.sheet_to_json,
    hasWrite: typeof XLSX.write,
  },
);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.json_to_sheet([
    { 日期: "2026-07-01", 计划ID: "plan-001", 花费: 12.34 },
    { 日期: "2026-07-02", 计划ID: "plan-002", 花费: 56.78 },
  ]),
  "计划报表",
);
const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
const fromBuffer = XLSX.read(buffer, { type: "buffer", cellDates: false });
const fromArray = XLSX.read(new Uint8Array(buffer).buffer, { type: "array", cellDates: false });
const bufferRows = XLSX.utils.sheet_to_json(fromBuffer.Sheets["计划报表"], { defval: "", raw: false });
const arrayRows = XLSX.utils.sheet_to_json(fromArray.Sheets["计划报表"], { defval: "", raw: false });

addCheck(
  "xlsxReadWriteWorkbookSmokePasses",
  Array.isArray(bufferRows) &&
    Array.isArray(arrayRows) &&
    bufferRows.length === 2 &&
    arrayRows.length === 2 &&
    bufferRows[0]?.["计划ID"] === "plan-001" &&
    arrayRows[1]?.["花费"] === "56.78",
  { bufferRows, arrayRows },
);

const auditJson = (() => {
  try {
    return JSON.parse(execFileSync("npm", ["audit", "--json"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    const output = error?.stdout ? String(error.stdout) : "{}";
    return JSON.parse(output);
  }
})();

const vulnerabilities = auditJson.vulnerabilities ?? {};
const xlsxVulnerability = vulnerabilities.xlsx;
const highOrCritical = Object.values(vulnerabilities).filter((item) => item?.severity === "high" || item?.severity === "critical");
const remainingNames = Object.keys(vulnerabilities).sort();
const nextFix = vulnerabilities.next?.fixAvailable;
const postcssFix = vulnerabilities.postcss?.fixAvailable;

addCheck(
  "npmAuditHasNoXlsxHighOrCriticalAfterUpgrade",
  !xlsxVulnerability && highOrCritical.length === 0,
  {
    metadata: auditJson.metadata?.vulnerabilities,
    remainingNames,
    highOrCritical: highOrCritical.map((item) => item?.name ?? item?.severity),
  },
);

addCheck(
  "remainingPostcssModeratesAreUpstreamNextOnly",
  remainingNames.join("|") === "next|postcss" &&
    vulnerabilities.next?.severity === "moderate" &&
    vulnerabilities.postcss?.severity === "moderate" &&
    vulnerabilities.postcss?.range === "<8.5.10" &&
    nextFix?.name === "next" &&
    nextFix?.version === "9.3.3" &&
    nextFix?.isSemVerMajor === true &&
    postcssFix?.name === "next" &&
    postcssFix?.version === "9.3.3" &&
    postcssFix?.isSemVerMajor === true,
  {
    status: POSTCSS_BLOCKER_STATUS,
    remainingNames,
    nextFix,
    postcssFix,
    postcssRange: vulnerabilities.postcss?.range,
  },
);

addCheck(
  "packageDoesNotForceNextCanaryOrOverrideInternalPostcss",
  packageJson.dependencies?.next === "16.2.9" &&
    !String(packageJson.dependencies?.next ?? "").includes("canary") &&
    !String(packageJson.dependencies?.next ?? "").includes("preview") &&
    !packageJson.overrides?.postcss &&
    !packageJson.resolutions?.postcss,
  {
    next: packageJson.dependencies?.next,
    overrides: packageJson.overrides ?? null,
    resolutions: packageJson.resolutions ?? null,
  },
);

const sourceRoots = ["app", "components", "lib"];
const productionFiles = [];
const collectProductionFiles = (directory) => {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectProductionFiles(fullPath);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) productionFiles.push(fullPath);
  }
};
sourceRoots.forEach((root) => collectProductionFiles(path.join(ROOT, root)));

const riskyPatterns = [
  { name: "directPostcssImport", regex: /(?:from\s+["']postcss["']|require\(["']postcss["']\))/ },
  { name: "dangerouslySetInnerHTML", regex: /dangerouslySetInnerHTML/ },
  { name: "styleTagLiteral", regex: /<style[\s>]/i },
  { name: "styleInnerHTML", regex: /style\.innerHTML/ },
  { name: "styleTextContent", regex: /style\.textContent/ },
  { name: "cssText", regex: /\.cssText\b/ },
  { name: "cssInsertRule", regex: /\.insertRule\(/ },
  { name: "cssStyleSheetConstructor", regex: /new\s+CSSStyleSheet\(/ },
  { name: "userCssOrCustomCss", regex: /\b(userCss|userCSS|customCss|customCSS|cssInput|inputCss)\b/ },
];

const riskyFindings = productionFiles.flatMap((filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  return riskyPatterns.flatMap((pattern) => pattern.regex.test(content)
    ? [{ file: path.relative(ROOT, filePath), pattern: pattern.name }]
    : []);
});

addCheck(
  "postcssCurrentExposureHasNoUserCssOrDynamicStyleStringifySurface",
  riskyFindings.length === 0,
  {
    status: POSTCSS_BLOCKER_STATUS,
    scannedRoots: sourceRoots,
    fileCount: productionFiles.length,
    riskyFindings,
  },
);

const failed = checks.filter((check) => !check.pass);
const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-xlsx-security-and-postcss-exposure-v1",
  officialSheetJsTarball: OFFICIAL_SHEETJS_TARBALL,
  postcssStatus: POSTCSS_BLOCKER_STATUS,
  npmAuditMetadata: auditJson.metadata?.vulnerabilities,
  failed,
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exit(1);
