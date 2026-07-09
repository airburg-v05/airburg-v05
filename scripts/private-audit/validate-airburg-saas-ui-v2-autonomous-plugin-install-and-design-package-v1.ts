import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "AGENTS.md",
  "docs/PROJECT_CURRENT_STATE.md",
  "docs/PAGE_PROBLEM_MATRIX_V2.md",
  "docs/TASK_EXECUTION_PROTOCOL_V1.md",
  "docs/UI_BASELINE_LOCK_V2.md",
  "docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md",
  "docs/product-blueprint-v2/PLUGIN_AVAILABILITY_REPORT_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/PRODUCT_DESIGN_PROTOTYPE_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2.md",
  "docs/product-blueprint-v2/AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PREPLAN.md",
];

const requiredAgentSkillFiles = [
  "docs/agents/state-agent.md",
  "docs/agents/problem-matrix-agent.md",
  "docs/agents/layer-gatekeeper-agent.md",
  "docs/agents/ui-layout-agent.md",
  "docs/agents/data-integrity-agent.md",
  "docs/agents/bi-semantic-agent.md",
  "docs/agents/target-agent.md",
  "docs/agents/deploy-agent.md",
  "docs/agents/qa-screenshot-agent.md",
  "docs/skills/airburg-task-execution-skill.md",
  "docs/skills/airburg-ui-layout-skill.md",
  "docs/skills/airburg-data-integrity-skill.md",
  "docs/skills/airburg-deploy-skill.md",
  "docs/skills/airburg-regression-skill.md",
];

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const file of [...requiredFiles, ...requiredAgentSkillFiles]) {
  assert(existsSync(path.join(root, file)), `missing required file: ${file}`);
}

const pluginReport = read("docs/product-blueprint-v2/PLUGIN_AVAILABILITY_REPORT_FOR_AIRBURG_SAAS_V2.md");
const prototypeReport = read("docs/product-blueprint-v2/PRODUCT_DESIGN_PROTOTYPE_FOR_AIRBURG_SAAS_V2.md");
const licenseAudit = read("docs/product-blueprint-v2/OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2.md");
const preplan = read("docs/product-blueprint-v2/AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PREPLAN.md");
const blueprint = read("docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md");

assert(pluginReport.includes("PLUGIN_AVAILABILITY_REPORT"), "plugin report marker missing");
for (const name of [
  "Product Design plugin",
  "Build Web Apps plugin",
  "Vercel plugin",
  "Canva integration / plugin",
  "Figma integration / plugin",
]) {
  assert(pluginReport.includes(name), `plugin report missing ${name}`);
}

for (const field of [
  "installed",
  "enabled",
  "available",
  "installationAttempted",
  "canUseForPrototype",
  "canUseForImplementation",
  "canUseForPreviewDeploy",
  "requiresExternalAuth",
  "authStatus",
  "recommendedUsage",
  "risk",
  "decision",
]) {
  assert(pluginReport.includes(field), `plugin report missing field ${field}`);
}

assert(
  prototypeReport.includes("PRODUCT_DESIGN_PLUGIN_UNAVAILABLE_AFTER_INSTALL_ATTEMPT"),
  "prototype report missing unavailable marker",
);
assert(prototypeReport.includes("template_first_fallback"), "prototype report missing fallback");
assert(prototypeReport.includes("APPROVE_DESIGN_PACKAGE_V2"), "prototype report missing next token");

for (const name of [
  "shadcn/ui blocks",
  "Tremor",
  "TailAdmin React",
  "Flowbite React Admin Dashboard",
  "shadcn-admin",
  "Material Tailwind Dashboard React",
  "GPL visual reference case",
]) {
  assert(licenseAudit.includes(name), `license audit missing ${name}`);
}

for (const field of [
  "templateName",
  "sourceUrl",
  "license",
  "licenseEvidence",
  "commercialUseAllowed",
  "codeCopyAllowed",
  "dependenciesRequired",
  "suitablePages",
  "strengths",
  "risks",
  "recommendation",
]) {
  assert(licenseAudit.includes(field), `license audit missing field ${field}`);
}

assert(licenseAudit.includes("GPL-3.0"), "license audit missing GPL-3.0 reference");
assert(licenseAudit.includes("visual_reference_only"), "license audit missing visual_reference_only");
assert(licenseAudit.includes("Do not copy GPL"), "license audit missing GPL no-copy warning");

for (const route of [
  "/v2/home",
  "/v2/series-board",
  "/v2/store-board",
  "/v2/product-board",
  "/v2/upload",
  "/v2/data-health",
  "/v2/target-center",
  "/v2/search-assets",
  "/v2/exclusion-rules",
]) {
  assert(preplan.includes(route), `preplan missing ${route}`);
}

assert(preplan.includes("PREPLAN_ONLY"), "preplan status missing");
assert(preplan.includes("template_first_fallback"), "preplan missing recommended fallback");
assert(preplan.includes("requires_user_confirmation"), "preplan missing dependency confirmation marker");
assert(preplan.includes("does not require dependency changes"), "preplan must not require dependency changes");
assert(preplan.includes("APPROVE_DESIGN_PACKAGE_V2"), "preplan missing next token");

assert(
  blueprint.includes("AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1"),
  "blueprint missing execution record",
);

const status = execFileSync("git", ["status", "--porcelain", "-uall"], {
  cwd: root,
  encoding: "utf8",
});

const changedFiles = status
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.replace(/^.. /, ""));

const forbiddenPatterns = [
  /^app\//,
  /^components\//,
  /^lib\//,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^vercel\.json$/,
  /^\.vercel\//,
  /^private-samples\//,
  /^.*\.(xls|xlsx|csv|pem|key)$/i,
];

const forbiddenChanges = changedFiles.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);

assert(forbiddenChanges.length === 0, `forbidden changed files: ${forbiddenChanges.join(", ")}`);

const createdV2Pages = changedFiles.filter(
  (file) => file.startsWith("app/(workspace-v2)/") || file.startsWith("components/saas-v2/"),
);

assert(createdV2Pages.length === 0, `unexpected V2 implementation files: ${createdV2Pages.join(", ")}`);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      requiredDocs: requiredFiles.length,
      agentSkillDocs: requiredAgentSkillFiles.length,
      changedFiles: changedFiles.length,
      forbiddenChanges: 0,
      createdV2Pages: 0,
      nextRequiredExternalChecks: ["npm run lint", "npm run build"],
    },
    null,
    2,
  ),
);
