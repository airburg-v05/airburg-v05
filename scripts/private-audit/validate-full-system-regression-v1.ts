import { execFileSync } from "node:child_process";

type StepResult = {
  command: string;
  status: "PASS" | "FAIL" | "MISSING";
  details?: string;
};

const commands = [
  "scripts/private-audit/validate-tianmao-v1-refactor-pipeline-v2.ts",
  "scripts/private-audit/validate-tmall-after-sales-safe-aggregation-p1-v1.ts",
  "scripts/private-audit/validate-series-product-selection-p1-5-v1.ts",
  "scripts/private-audit/validate-brand-model-center-word-semantic-implementation-p2-v1.ts",
  "scripts/private-audit/validate-target-required-derived-metric-rules-implementation-v1.ts",
  "scripts/private-audit/validate-kpi-layer-restructure-v1.ts",
  "scripts/private-audit/validate-chart-semantic-layer-unification-v1.ts",
  "scripts/private-audit/validate-upload-page-productization-v1.ts",
];

const results: StepResult[] = [];

for (const script of commands) {
  try {
    execFileSync("test", ["-f", script], { cwd: process.cwd(), stdio: "ignore" });
  } catch {
    results.push({ command: script, status: "MISSING" });
    continue;
  }

  try {
    const output = execFileSync("npx", ["tsx", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    });
    results.push({ command: script, status: "PASS", details: output.slice(0, 800) });
  } catch (error) {
    results.push({
      command: script,
      status: "FAIL",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

const failed = results.filter((result) => result.status !== "PASS");
const result = {
  task: "FULL_SYSTEM_REGRESSION_V1",
  status: failed.length === 0 ? "PASS" : "FAIL",
  systemHealthScore: failed.length === 0 ? 100 : Math.max(0, 100 - failed.length * 12),
  noRegression: failed.length === 0 ? "PASS" : "FAIL",
  results,
  failed,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
