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
  const activeGroup = centerWordGroups.find((group) => group.id === activeGroupId) ?? centerWordGroups[0] ?? null;

  const updateActiveGroup = (nextGroup: EditableCenterWordGroup) => {
    setCenterWordGroups((groups) => groups.map((group) => (group.id === nextGroup.id ? nextGroup : group)));
  };

  const handleSelectGroup = (group: EditableCenterWordGroup) => {
    setActiveGroupId(group.id);
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
    onClear();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-4">
      <section
        data-testid={testId}
        data-problem-ids="PVM2-005"
        role="dialog"
        aria-modal="true"
        className="flex h-[min(760px,calc(100vh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">品牌词 / 中心词设置</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              品牌词和中心词为相加口径；同一搜索词同时命中多个词时只计入一次。
            </p>
          </div>
          <button type="button" className="rounded-xl border border-slate-200/80 px-2 py-1 text-sm" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" data-testid={`${testId}-scrollable-content`}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <label className="block text-sm font-semibold text-slate-800">
              品牌词
              <textarea
                data-testid={`${testId}-brand-words`}
                className="mt-2 min-h-40 w-full rounded-xl border border-slate-200/80 p-3 text-sm font-semibold outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 md:min-h-64"
                placeholder="支持多行粘贴，一行一个词"
                value={brandWords}
                onChange={(event) => setBrandWords(event.target.value)}
              />
            </label>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">中心词分组</p>
              <p className="mt-1 text-xs text-slate-500">选择一个分组后，在下方集中编辑名称和别名。</p>
              <div data-testid={`${testId}-center-word-groups`} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-2">
                {centerWordGroups.map((group) => {
                  const active = group.id === activeGroup?.id;
                  return (
                    <button
                      key={group.id}
                      data-testid={`${testId}-center-word-group-card`}
                      data-center-word={group.centerWord}
                      type="button"
                      className={`min-w-0 rounded-xl border p-3 text-left transition ${
                        active ? "border-blue-300 bg-blue-50/70" : "border-slate-200/80 bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => handleSelectGroup(group)}
                    >
                      <span className="block truncate text-sm font-semibold text-slate-950">{group.centerWord}</span>
                      <span className="mt-1 block truncate text-xs text-slate-500">{groupAliasPreview(group)}</span>
                      <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${group.configured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {group.configured ? "已配置" : "待配置"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div data-testid={`${testId}-center-word-group-panel`} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-950">
                {activeGroup ? `编辑 ${activeGroup.centerWord}` : "编辑中心词分组"}
              </h3>
              <p className="mt-1 text-xs text-slate-500">一次只编辑一个分组；保存后用于搜索相关指标归因。</p>
            </div>
            {!activeGroup ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                请选择 P1 / P2 / P300 / ZEN 等中心词分组。
              </div>
            ) : (
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
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs font-semibold text-blue-700 md:col-span-2">
                  <span>示例：P1 分组可包含 P1、KJ60F-P1、KJ60P1。</span>
                  <button type="button" className="rounded-lg border border-blue-200 bg-white px-2 py-1" onClick={handleResetActiveGroup}>
                    清空当前分组
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-5" data-testid={`${testId}-fixed-footer`}>
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={onClose}>
            取消
          </button>
          <button type="button" className="rounded-xl border border-slate-200/80 px-4 py-2 text-sm font-semibold" onClick={handleClear}>
            清空
          </button>
          <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={handleSave}>
            保存
          </button>
        </footer>
      </section>
    </div>
  );
}
