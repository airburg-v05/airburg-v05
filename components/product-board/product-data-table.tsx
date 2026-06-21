"use client";

import { useMemo, useState } from "react";
import { ProductTableFilterBar } from "@/components/product-board/product-table-filter-bar";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallProductTableRow } from "@/lib/tmall/view-models/product-board";
import {
  buildTmallProductTableOperatingFilters,
  filterTmallProductTableRows,
  type TmallProductTableOperatingFilterKey,
  type TmallProductTableOperatingRowTag,
} from "@/lib/tmall/view-models/product-table-operating-filters";
import { formatInteger, formatMoney, formatPercent, formatRoi } from "./product-format";

const formatTableRoi = (value: number | null): string => {
  if (value === null || !Number.isFinite(value) || value <= 0) return "--";
  return formatRoi(value);
};

interface ProductDataTableProps {
  rows: TmallProductTableRow[];
  searchTerm: string;
  selectedProductId: string | null;
  onSelectProduct: (productId: string) => void;
}

export function ProductDataTable({
  rows,
  searchTerm,
  selectedProductId,
  onSelectProduct,
}: ProductDataTableProps) {
  const [activeFilter, setActiveFilter] =
    useState<TmallProductTableOperatingFilterKey>("all");
  const operatingFilters = useMemo(
    () => buildTmallProductTableOperatingFilters(rows, selectedProductId),
    [rows, selectedProductId],
  );
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const rowsFilteredByOperation = useMemo(
    () =>
      filterTmallProductTableRows(
        rows,
        activeFilter,
        operatingFilters.salesTopProductIds,
      ),
    [activeFilter, operatingFilters.salesTopProductIds, rows],
  );
  const filteredRows = normalizedSearch
    ? rowsFilteredByOperation.filter((row) =>
        `${row.productName} ${row.productId}`.toLowerCase().includes(normalizedSearch),
      )
    : rowsFilteredByOperation;
  const activeFilterLabel =
    operatingFilters.filters.find((filter) => filter.key === activeFilter)?.label ?? "全部商品";
  const emptyMessage =
    normalizedSearch || activeFilter !== "all"
      ? "当前筛选条件下暂无商品。"
      : "当前经营日期暂无商品。";

  return (
    <SectionCard
      title="当前日期商品列表"
      description="支持按运营状态筛选当前日期商品；筛选只影响表格展示，不改变原始数据。"
      action={<StatusPill tone={filteredRows.length > 0 ? "info" : "neutral"}>{filteredRows.length} 个商品</StatusPill>}
    >
      <div className="space-y-4">
        <ProductTableFilterBar
          filters={operatingFilters.filters}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="data-table min-w-[1320px]">
              <thead>
                <tr>
                  <th className="min-w-80">商品名称</th>
                  <th className="whitespace-nowrap">商品 ID</th>
                  <th className="whitespace-nowrap">GMV</th>
                  <th className="whitespace-nowrap">GSV</th>
                  <th className="whitespace-nowrap">商品访客数</th>
                  <th className="whitespace-nowrap">商品支付买家数</th>
                  <th className="whitespace-nowrap">支付转化率</th>
                  <th className="whitespace-nowrap">推广数据</th>
                  <th className="whitespace-nowrap">推广花费</th>
                  <th className="whitespace-nowrap">商品推广 ROI</th>
                  <th className="whitespace-nowrap">成功退款金额</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const selected = row.productId === selectedProductId;
                  const rowTags = operatingFilters.rowTagsByProductId[row.productId] ?? [];

                  return (
                    <tr
                      key={row.productId}
                      className={`${selected ? "bg-blue-50" : ""} cursor-pointer hover:bg-blue-50/70`}
                      onClick={() => onSelectProduct(row.productId)}
                    >
                      <td className="min-w-80">
                        <div className="max-w-80 space-y-2">
                          <button
                            type="button"
                            className="block max-w-80 truncate text-left font-medium text-blue-700 hover:text-blue-900"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectProduct(row.productId);
                            }}
                            title={row.productName}
                          >
                            {row.productName}
                          </button>
                          <ProductRowTags tags={rowTags} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-slate-500">{row.productId}</td>
                      <td className="whitespace-nowrap">{formatMoney(row.gmv)}</td>
                      <td className="whitespace-nowrap">{formatMoney(row.gsv)}</td>
                      <td className="whitespace-nowrap">{formatInteger(row.visitors)}</td>
                      <td className="whitespace-nowrap">{formatInteger(row.paidBuyers)}</td>
                      <td className="whitespace-nowrap">{formatPercent(row.conversionRate)}</td>
                      <td className="whitespace-nowrap">{row.hasAdData ? "存在推广数据" : "暂无推广数据"}</td>
                      <td className="whitespace-nowrap">{row.hasAdData ? formatMoney(row.adSpend) : "--"}</td>
                      <td className="whitespace-nowrap">{row.hasAdData ? formatTableRoi(row.adRoi) : "--"}</td>
                      <td className="whitespace-nowrap">{formatMoney(row.refundSuccessAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-slate-50 px-4 text-center">
            <p className="text-sm font-semibold text-slate-900">{emptyMessage}</p>
            <p className="mt-2 text-sm text-slate-500">
              当前筛选：{activeFilterLabel}
              {normalizedSearch ? ` · 搜索：${searchTerm.trim()}` : ""}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          <div className="space-y-2">
            {operatingFilters.notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

const tagToneClasses: Record<TmallProductTableOperatingRowTag["tone"], string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/10",
};

function ProductRowTags({ tags }: { tags: TmallProductTableOperatingRowTag[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex max-w-80 flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${tagToneClasses[tag.tone]}`}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}
