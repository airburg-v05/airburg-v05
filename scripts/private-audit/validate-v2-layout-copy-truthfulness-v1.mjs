import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const topbar = read("components/saas-v2/layout/saas-v2-topbar.tsx");
const pageHeader = read("components/saas-v2/layout/saas-v2-page-header.tsx");

const checks = [
  {
    name: "topbar-uses-neutral-chinese-status-copy",
    pass:
      topbar.includes("空气堡经营工作区") &&
      topbar.includes("数据范围与状态以当前页面为准") &&
      topbar.includes("品牌：空气堡") &&
      topbar.includes("平台：天猫"),
  },
  {
    name: "topbar-removes-preview-pending-facts",
    pass:
      !topbar.includes("V2 preview routes only") &&
      !topbar.includes("Legacy V1 routes remain unchanged") &&
      !topbar.includes("Dataset: preview pending") &&
      !topbar.includes("Brand: 空气堡") &&
      !topbar.includes("Platform: 天猫"),
  },
  {
    name: "page-header-uses-compact-business-route-copy",
    pass:
      pageHeader.includes('data-testid="saas-v2-compact-page-header"') &&
      pageHeader.includes("系列中心") &&
      pageHeader.includes("目标中心") &&
      pageHeader.includes("返回首页"),
  },
  {
    name: "page-header-removes-no-write-preview-guarantees",
    pass:
      !pageHeader.includes("本地 preview 工作区") &&
      !pageHeader.includes("不写入真实数据") &&
      !pageHeader.includes("不改变 ETL / BI / Target / Persistence") &&
      !pageHeader.includes("Airburg Business Workspace") &&
      !pageHeader.includes("品牌经营分析工作区"),
  },
];

const failed = checks.filter((item) => !item.pass);

const result = {
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-layout-copy-truthfulness-v1",
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exit(1);
