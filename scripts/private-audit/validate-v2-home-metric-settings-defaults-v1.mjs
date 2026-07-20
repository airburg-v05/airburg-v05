import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dashboard = fs.readFileSync(path.join(ROOT, "components/saas-v2/home/v2-home-dashboard.tsx"), "utf8");
const metricGrid = fs.readFileSync(path.join(ROOT, "components/saas-v2/home/v2-home-metric-grid.tsx"), "utf8");
const types = fs.readFileSync(path.join(ROOT, "types/v2/home.ts"), "utf8");

const checks = [
  {
    name: "metric-key-list-stays-17",
    pass:
      types.includes('"regionalFulfillmentRate",') &&
      (types.match(/"[^"]+",/g)?.length ?? 0) >= 17,
  },
  {
    name: "home-preference-key-bumped-to-v2",
    pass: dashboard.includes('const PREFERENCE_KEY = "airburg:v2-home:ui-preference:v2";'),
  },
  {
    name: "default-preference-starts-with-full-17-metrics",
    pass:
      dashboard.includes("visibleKeys: [...V2_HOME_METRIC_KEYS]") &&
      dashboard.includes("order: [...V2_HOME_METRIC_KEYS]"),
  },
  {
    name: "valid-non-empty-subset-is-preserved",
    pass:
      dashboard.includes("visibleKeys: uniqueVisibleKeys.length > 0 ? uniqueVisibleKeys : [...V2_HOME_METRIC_KEYS]") &&
      !dashboard.includes("coversAllVisibleMetrics"),
  },
  {
    name: "metric-settings-still-supports-checkbox-and-order-controls",
    pass:
      metricGrid.includes('data-testid="v2-home-metric-settings"') &&
      metricGrid.includes('type="checkbox"') &&
      metricGrid.includes("onOrderChange") &&
      metricGrid.includes("恢复默认"),
  },
];

const failed = checks.filter((check) => !check.pass);

if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
