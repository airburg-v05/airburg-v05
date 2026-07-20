import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const pageSource = read("app/(workspace-v2)/v2/target-center/page.tsx");
const clientSource = read("components/targets/v05/target-management-client.tsx");

const checks = [
  {
    name: "V2TargetCenterPageUsesRoutedClient",
    pass: pageSource.includes('<RoutedTargetManagementClient routeVariant="v2" />'),
  },
  {
    name: "TargetManagementClientSupportsRouteVariant",
    pass:
      clientSource.includes("type DataCenterRouteVariant") &&
      clientSource.includes("function TargetManagementPageInner({ routeVariant }: { routeVariant: DataCenterRouteVariant })"),
  },
  {
    name: "TargetManagementClientRemapsLegacyPrimaryActionsForV2",
    pass:
      clientSource.includes('if (href === "/upload") return dataCenterHref("upload", null, { routeVariant });') &&
      clientSource.includes('if (href === "/upload/quality") return dataCenterHref("quality", null, { routeVariant });') &&
      clientSource.includes('if (href === "/home") return "/v2/home";'),
  },
  {
    name: "LegacyDefaultBehaviorRemainsAvailable",
    pass:
      clientSource.includes('<TargetManagementPageInner routeVariant="legacy" />') &&
      clientSource.includes('routeVariant = "legacy"'),
  },
];

const failed = checks.filter((check) => !check.pass);

console.log(JSON.stringify({
  status: failed.length === 0 ? "PASS" : "FAIL",
  script: "validate-v2-target-center-routing-variant-v1",
  failedChecks: failed.map((check) => ({ name: check.name })),
  checks: Object.fromEntries(checks.map((check) => [check.name, check.pass])),
}, null, 2));

if (failed.length > 0) {
  process.exitCode = 1;
}
