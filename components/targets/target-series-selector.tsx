"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TmallSeriesGroupStorageStatus } from "@/lib/storage/tmall-series-storage";
import type { TmallTargetSeriesOption } from "@/lib/tmall/view-models/target-page";

interface TargetSeriesSelectorProps {
  options: TmallTargetSeriesOption[];
  storageStatus: TmallSeriesGroupStorageStatus;
  value: string;
  onChange: (seriesId: string) => void;
}

const formatDateTime = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "--";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};

export function TargetSeriesSelector({
  options,
  storageStatus,
  value,
  onChange,
}: TargetSeriesSelectorProps) {
  const [keyword, setKeyword] = useState("");
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      normalizedKeyword
        ? options.filter((option) =>
          option.seriesName.toLowerCase().includes(normalizedKeyword) ||
            option.seriesId.toLowerCase().includes(normalizedKeyword),
        )
        : options,
    [normalizedKeyword, options],
  );

  if (storageStatus === "corrupted") {
    return (
      <SeriesSelectorNotice message="系列分组数据不可用，请先到系列看板检查系列分组。" />
    );
  }

  if (options.length === 0) {
    return (
      <SeriesSelectorNotice message="暂无系列，请先到系列看板创建系列。" />
    );
  }

  return (
    <div className="space-y-3">
      <input
        className="form-input"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜索系列名称或系列 ID"
      />

      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const selected = option.seriesId === value;
            return (
              <button
                key={option.seriesId}
                type="button"
                className={`block w-full rounded-lg border px-3 py-3 text-left transition ${
                  selected
                    ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                }`}
                onClick={() => onChange(option.seriesId)}
              >
                <span className="block min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {option.seriesName}
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-slate-500">
                    系列 ID：{option.seriesId}
                  </span>
                </span>
                <span className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                  <span>商品 ID 数量：{option.productCount}</span>
                  <span>最后更新：{formatDateTime(option.updatedAt || option.createdAt)}</span>
                </span>
              </button>
            );
          })
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            没有匹配的系列。
          </div>
        )}
      </div>
    </div>
  );
}

function SeriesSelectorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
      <p>{message}</p>
      <Link href="/series-board" className="mt-2 inline-flex font-semibold text-amber-900 underline">
        前往系列看板
      </Link>
    </div>
  );
}
