"use client";

import { useState } from "react";
import { normalizeCenterWordGroups, normalizeCenterWordToken, parseKeywordTokens } from "@/lib/bi/brand-model-semantic";
import type { BrandModelFilter, CenterWordGroup } from "@/lib/bi/search-keyword.types";

interface BrandModelFilterPopoverProps {
  value?: BrandModelFilter;
  onSave: (value: BrandModelFilter) => void;
  onClear: () => void;
  onClose: () => void;
  testId?: string;
}

const toTextareaValue = (items: string[] | undefined): string => (items ?? []).join("\n");

const centerGroupId = (centerWord: string, index: number): string =>
  `center-${normalizeCenterWordToken(centerWord).replace(/[^A-Z0-9-]+/g, "-") || index}`;

const DEFAULT_CENTER_WORDS = ["P1", "P2", "P300", "ZEN"];

interface EditableCenterWordGroup extends CenterWordGroup {
  configured: boolean;
}

type CenterGroupPanelMode = "view" | "edit";

const toCenterWordGroups = (value?: BrandModelFilter): CenterWordGroup[] => {
  const groups =
    value?.centerWordGroups && value.centerWordGroups.length > 0
      ? normalizeCenterWordGroups(value.centerWordGroups)
      : normalizeCenterWordGroups((value?.modelWords ?? []).map((word, index) => ({
          id: centerGroupId(word, index),
          centerWord: word,
          aliases: [word],
        })));

  return groups;
};

const toEditableCenterWordGroups = (value?: BrandModelFilter): EditableCenterWordGroup[] => {
  const configuredGroups = toCenterWordGroups(value);
  const configuredByCenterWord = new Map(
    configuredGroups.map((group) => [normalizeCenterWordToken(group.centerWord), group]),
  );

  const defaultGroups = DEFAULT_CENTER_WORDS.map((centerWord, index) => {
    const configured = configuredByCenterWord.get(centerWord);
    configuredByCenterWord.delete(centerWord);
    return {
      id: configured?.id ?? centerGroupId(centerWord, index),
      centerWord,
      aliases: configured?.aliases?.length ? configured.aliases : [centerWord],
      configured: Boolean(configured),
    };
  });

  const customGroups = Array.from(configuredByCenterWord.values()).map((group) => ({
    ...group,
    configured: true,
  }));

  return [...defaultGroups, ...customGroups];
};

const parseAliasInput = (input: string, centerWord: string): string[] => {
  const normalizedCenterWord = normalizeCenterWordToken(centerWord);
  const aliases = input
    .split(/,|，|;|；|\n+/)
    .map((alias) => normalizeCenterWordToken(alias))
    .filter(Boolean);
  return Array.from(new Set([normalizedCenterWord, ...aliases].filter(Boolean)));
};

const groupAliasText = (group: EditableCenterWordGroup): string =>
  group.aliases.join("\n");

const groupAliasPreview = (group: EditableCenterWordGroup): string => {
  const aliases = group.aliases.slice(0, 3).join("、");
  const suffix = group.aliases.length > 3 ? ` 等 ${group.aliases.length} 个` : "";
  return aliases ? `${aliases}${suffix}` : "未配置别名";
};

const toCenterWordGroup = (group: EditableCenterWordGroup): CenterWordGroup => ({
  id: group.id,
  centerWord: group.centerWord,
  aliases: group.aliases,
});

export function BrandModelFilterPopover({
  value,
  onSave,
  onClear,
  onClose,
  testId = "brand-model-filter-popover",
}: BrandModelFilterPopoverProps) {
  const [brandWords, setBrandWords] = useState(toTextareaValue(value?.brandWords));
  const [centerWordGroups, setCenterWordGroups] = useState<EditableCenterWordGroup[]>(() => toEditableCenterWordGroups(value));
  const [activeGroupId, setActiveGroupId] = useState(() => {
    const groups = toEditableCenterWordGroups(value);
    return groups.find((group) => group.configured)?.id ?? groups[0]?.id ?? "";
  });
  const [groupPanelMode, setGroupPanelMode] = useState<CenterGroupPanelMode>("edit");
  const activeGroup = centerWordGroups.find((group) => group.id === activeGroupId) ?? centerWordGroups[0] ?? null;

  const updateActiveGroup = (nextGroup: EditableCenterWordGroup) => {
    setCenterWordGroups((groups) => groups.map((group) => (group.id === nextGroup.id ? nextGroup : group)));
  };

  const handleSelectGroup = (group: EditableCenterWordGroup, mode: CenterGroupPanelMode) => {
    setActiveGroupId(group.id);
    setGroupPanelMode(mode);
  };

  const handleActiveCenterWordChange = (nextCenterWordRaw: string) => {
    if (!activeGroup) return;
    const nextCenterWord = normalizeCenterWordToken(nextCenterWordRaw);
    updateActiveGroup({
      ...activeGroup,
      centerWord: nextCenterWord,
      aliases: parseAliasInput(groupAliasText(activeGroup), nextCenterWord),
      configured: true,
    });
  };

  const handleActiveAliasesChange = (nextAliasesRaw: string) => {
    if (!activeGroup) return;
    updateActiveGroup({
      ...activeGroup,
      aliases: parseAliasInput(nextAliasesRaw, activeGroup.centerWord),
      configured: true,
    });
  };

  const handleResetActiveGroup = () => {
    if (!activeGroup) return;
    updateActiveGroup({
      ...activeGroup,
      aliases: [activeGroup.centerWord],
      configured: false,
    });
  };

  const handleSave = () => {
    const nextCenterWordGroups = normalizeCenterWordGroups(
      centerWordGroups
        .filter((group) => group.configured)
        .map(toCenterWordGroup),
    );
    onSave({
      brandWords: parseKeywordTokens(brandWords),
      modelWords: nextCenterWordGroups.map((group) => group.centerWord),
      centerWordGroups: nextCenterWordGroups,
    });
  };

  const handleClear = () => {
    setBrandWords("");
    const nextGroups = toEditableCenterWordGroups({ brandWords: [], modelWords: [], centerWordGroups: [] });
    setCenterWordGroups(nextGroups);
    setActiveGroupId(nextGroups[0]?.id ?? "");
    setGroupPanelMode("edit");
    onClear();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section
        data-testid={testId}
        data-problem-ids="PVM2-005"
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">品牌词 / 中心词设置</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              品牌词和中心词为相加口径；同一搜索词同时命中多个词时只计入一次。
            </p>
          </div>
          <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <label className="block text-sm font-semibold text-slate-800">
            品牌词
            <textarea
              data-testid={`${testId}-brand-words`}
              className="mt-2 min-h-56 w-full rounded-xl border border-slate-200/80 p-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="支持多行粘贴，一行一个词"
              value={brandWords}
              onChange={(event) => setBrandWords(event.target.value)}
            />
          </label>
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">中心词 / 型号词</p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                折叠分组
              </span>
            </div>
            <div data-testid={`${testId}-center-word-groups`} className="grid gap-2 sm:grid-cols-2">
              {centerWordGroups.map((group) => {
                const active = group.id === activeGroup?.id;
                return (
                  <article
                    key={group.id}
                    data-testid={`${testId}-center-word-group-card`}
                    data-center-word={group.centerWord}
                    className={`rounded-xl border p-3 transition ${
                      active ? "border-blue-300 bg-blue-50/60" : "border-slate-200/80 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{group.centerWord}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500">{groupAliasPreview(group)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${group.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {group.configured ? "已配置" : "待配置"}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        onClick={() => handleSelectGroup(group, "view")}
                      >
                        查看
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        onClick={() => handleSelectGroup(group, "edit")}
                      >
                        编辑分组
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">安全边界 + 别名组</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1">别名组</span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1">不使用简单包含</span>
            <span>品牌词和中心词配置会保存在本浏览器的跨页面调试上下文；不会保存原始文件或敏感明细，也不会写入目标草稿。</span>
          </div>
          <div data-testid={`${testId}-center-word-group-panel`} className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-500">中心词别名组预览</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {activeGroup ? `${activeGroup.centerWord} 分组` : "暂无选中分组"}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-500">
                {groupPanelMode === "edit" ? "编辑分组" : "查看分组"}
              </span>
            </div>
            {!activeGroup ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                请选择 P1 / P2 / P300 / ZEN 等中心词分组。
              </div>
            ) : groupPanelMode === "edit" ? (
              <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
                <label className="block text-xs font-semibold text-slate-600">
                  分组名称
                  <input
                    data-testid={`${testId}-center-word-name`}
                    className="mt-1 w-full rounded-xl border border-slate-200/80 px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={activeGroup.centerWord}
                    onChange={(event) => handleActiveCenterWordChange(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  分组别名
                  <textarea
                    data-testid={`${testId}-model-words`}
                    data-center-word-groups="true"
                    className="mt-1 min-h-28 w-full rounded-xl border border-slate-200/80 p-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    placeholder={"只编辑当前分组，例如：\nP1\nKJ60F-P1\nKJ60P1"}
                    value={groupAliasText(activeGroup)}
                    onChange={(event) => handleActiveAliasesChange(event.target.value)}
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs font-semibold text-blue-700">
                  <span>示例：P1 分组可包含 P1、KJ60F-P1、KJ60P1；系统不会自动把 KJ500F-P1 算入 P1。</span>
                  <button type="button" className="rounded-lg border border-blue-200 bg-white px-2 py-1" onClick={handleResetActiveGroup}>
                    清空当前分组
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {activeGroup.aliases.map((alias) => (
                    <span key={`${activeGroup.id}-${alias}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {alias}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {activeGroup.configured ? "当前分组会参与中心词匹配。" : "当前分组仅作为分类占位，保存时不会写入。"}
                </p>
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500">命中预览只展示汇总线名称，不输出完整搜索词列表。</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>
            取消
          </button>
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={handleClear}>
            清空
          </button>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={handleSave}>
            保存
          </button>
        </div>
      </section>
    </div>
  );
}
