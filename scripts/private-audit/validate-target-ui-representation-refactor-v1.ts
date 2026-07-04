import { execFileSync } from "node:child_process";

const output = execFileSync("npx", ["tsx", "scripts/private-audit/validate-target-system-simplification-v1.ts"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const parsed = JSON.parse(output) as { status?: string; checks?: unknown[] };
const result = {
  task: "TARGET_UI_REPRESENTATION_REFACTOR_V1",
  status: parsed.status === "PASS" ? "PASS" : "FAIL",
  delegatedValidator: "validate-target-system-simplification-v1.ts",
  checks: parsed.checks ?? [],
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "PASS" ? 0 : 1);
