"use client";

import { useMemo, useState } from "react";
import type { TmallTargetProductOption } from "@/lib/tmall/view-models/target-page";
import { formatTargetValue } from "./target-format";

interface TargetProductSelectorProps {
  options: TmallTargetProductOption[];
  value: string;
  onChange: (productId: string) => void;
}

export function TargetProductSelector({
  options,
  value,
  onChange,
}: TargetProductSelectorProps) {
  const [keyword, setKeyword] = useState("");
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      normalizedKeyword
        ? options.filter((option) =>
          option.productName.toLowerCase().includes(normalizedKeyword) ||
            option.productId.toLowerCase().includes(normalizedKeyword),
        )
        : options,
    [normalizedKeyword, options],
  );

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        暂无商品池，请先上传天猫经营数据。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        className="form-input"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜索商品名称或商品 ID"
      />

      <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const selected = option.productId === value;
            return (
              <button
                key={option.productId}
                type="button"
                className={`block w-full rounded-lg border px-3 py-3 text-left transition ${
                  selected
                    ? "border-blue-300 bg-blue-50 ring-1 ring-blue-200"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                }`}
                onClick={() => onChange(option.productId)}
              >
                <span className="block min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950">
                    {option.productName}
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-slate-500">
                    商品 ID：{option.productId}
                  </span>
                </span>
                <span className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                  <span>GMV：{formatTargetValue(option.gmv, "currency")}</span>
                  <span>访客：{formatTargetValue(option.visitors, "integer")}</span>
                  <span>买家：{formatTargetValue(option.paidBuyers, "integer")}</span>
                </span>
              </button>
            );
          })
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            没有匹配的商品。
          </div>
        )}
      </div>
    </div>
  );
}
