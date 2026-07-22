import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const dashboard = fs.readFileSync(path.join(ROOT, "components/saas-v2/home/v2-home-dashboard.tsx"), "utf8");
const metricGrid = fs.readFileSync(path.join(ROOT, "components/saas-v2/home/v2-home-metric-grid.tsx"), "utf8");
const types = fs.readFileSync(path.join(ROOT, "types/v2/home.ts"), "utf8");

const checks = [
  {
    name: "truth-contract-keeps-19-and-commercial-display-keeps-16",
    pass:
      types.includes('"visitors",') &&
      types.includes('"paidBuyers",') &&
      types.includes('"regionalFulfillmentRate",') &&
      types.includes('metricKey !== "mtdTurnover"') &&
      types.includes('metricKey !== "regionalFulfillmentRate"'),
  },
  {
    name: "home-preference-is-brand-scoped",
    pass: dashboard.includes('const PREFERENCE_KEY_PREFIX = "airburg:v2-home:ui-preference:v3:";'),
  },
  {
    name: "default-preference-starts-with-commercial-16-metrics",
    pass:
      dashboard.includes("visibleKeys: [...V2_HOME_DISPLAY_METRIC_KEYS]") &&
      dashboard.includes("order: [...V2_HOME_DISPLAY_METRIC_KEYS]"),
  },
  {
    name: "valid-non-empty-subset-is-preserved",
    pass:
      dashboard.includes("visibleKeys: uniqueVisibleKeys.length > 0 ? uniqueVisibleKeys : [...V2_HOME_DISPLAY_METRIC_KEYS]") &&
      !dashboard.includes("coversAllVisibleMetrics"),
  },
  {
    name: "retired-visible-metrics-migrate-to-real-growth-drivers",
    pass:
      dashboard.includes('if (value === "mtdTurnover") return "visitors";') &&
      dashboard.includes('if (value === "regionalFulfillmentRate") return "paidBuyers";'),
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
