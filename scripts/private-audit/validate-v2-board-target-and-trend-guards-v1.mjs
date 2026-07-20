import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const dashboards = {
  series: read("components/saas-v2/series/v2-series-board-dashboard.tsx"),
  store: read("components/saas-v2/store/v2-store-board-dashboard.tsx"),
  product: read("components/saas-v2/product/v2-product-board-dashboard.tsx"),
};

const checks = Object.entries(dashboards).flatMap(([name, source]) => ([
  {
    name: `${name}UsesOwnPropertyTrendMetricGuard`,
    pass: source.includes("Object.prototype.hasOwnProperty.call(TREND_LABELS, value)"),
  },
  {
    name: `${name}DoesNotPromoteTotalTargetAsMtdTarget`,
    pass: source.includes('mtdTarget: "--"') && !source.includes("mtdTarget: target ?"),
  },
  {
    name: `${name}UsesSegmentedTrendPaths`,
    pass: source.includes("const buildTrendSegments = ({") &&
      source.includes("segments.push({ linePath, areaPath })") &&
      !source.includes("const path = values.reduce"),
  },
]));

const failed = checks.filter((check) => !check.pass);

console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-board-target-and-trend-guards-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
