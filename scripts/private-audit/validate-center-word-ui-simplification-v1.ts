import fs from "node:fs";
import path from "node:path";

type Status = "PASS" | "FAIL";

interface Check {
  name: string;
  pass: boolean;
  details?: unknown;
}

const ROOT = process.cwd();
const checks: Check[] = [];

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const addCheck = (name: string, pass: boolean, details?: unknown) => {
  checks.push({ name, pass, details });
};

const sourceHas = (source: string, snippets: string[]): boolean =>
  snippets.every((snippet) => source.includes(snippet));

const countMatches = (source: string, pattern: RegExp): number =>
  source.match(pattern)?.length ?? 0;

const run = () => {
  const popover = read("components/visual-system/v1/brand-model-filter-popover.tsx");
  const semantic = read("lib/bi/brand-model-semantic.ts");
  const debugPersistence = read("lib/persistence/debug-context-persistence.ts");

  addCheck("defaultCenterGroupsVisible", sourceHas(popover, ["DEFAULT_CENTER_WORDS", "\"P1\"", "\"P2\"", "\"P300\"", "\"ZEN\""]));
  addCheck("centerWordGroupsFoldedCards", sourceHas(popover, ["center-word-groups", "center-word-group-card", "折叠 group"]));
  addCheck("viewAndEditGroupOnly", sourceHas(popover, ["查看", "编辑 group", "CenterGroupPanelMode"]));
  addCheck("singleGroupEditPanel", sourceHas(popover, ["center-word-group-panel", "group 名称", "group 别名"]));
  addCheck("modelWordsTextareaStillCompatibilitySinglePanel", countMatches(popover, /data-testid=\{`\$\{testId\}-model-words`\}/g) === 1);
  addCheck("allAliasTextareaRemoved", !sourceHas(popover, ["toCenterGroupTextareaValue", "parseCenterWordGroupsInput", "每行一个别名组"]));
  addCheck("configuredGroupsOnlySaved", sourceHas(popover, [".filter((group) => group.configured)", "normalizeCenterWordGroups", "modelWords: nextCenterWordGroups.map"]));
  addCheck("unconfiguredDefaultGroupsNotSavedByDefault", sourceHas(popover, ["configured: Boolean(configured)", "当前 group 仅作为分类占位，保存时不会写入。"]));
  addCheck("p1SafetyCopyKept", sourceHas(popover, ["KJ60F-P1", "KJ60P1", "KJ500F-P1", "不使用简单包含"]));
  addCheck("privacyCopyKept", sourceHas(popover, ["不会保存原始文件或敏感明细", "不会写入目标草稿"]));
  addCheck("semanticResolverUnchangedByUiScript", sourceHas(semantic, ["safeCenterWordBoundaryMatch", "resolveBrandCenterMatch", "centerWordFilter"]));
  addCheck("debugContextStillPersistsCenterGroups", sourceHas(debugPersistence, ["centerWordGroups", "safeCenterWordGroups"]));
  addCheck("noRawSensitiveDisplay", !/rawRows|previewRows|订单号|退款编号|交易号|电话|地址|物流信息|买家说明|商家备注原文|操作人|子账号/.test(popover));
};

let status: Status = "PASS";
try {
  run();
  if (checks.some((check) => !check.pass)) status = "FAIL";
} catch (error) {
  status = "FAIL";
  addCheck("scriptExecution", false, error instanceof Error ? error.message : String(error));
}

console.log(JSON.stringify({
  status,
  taskId: "CENTER_WORD_UI_SIMPLIFICATION_V1",
  uiRules: {
    centerWordGroups: "folded_cards",
    defaultGroups: ["P1", "P2", "P300", "ZEN"],
    editing: "single_group_panel",
    aliases: "view_or_edit_selected_group_only",
    dataSemantics: "unchanged",
  },
  checks,
}, null, 2));

process.exit(status === "PASS" ? 0 : 1);
