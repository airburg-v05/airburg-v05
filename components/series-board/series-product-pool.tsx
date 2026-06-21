"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallSeriesProductOption } from "@/lib/tmall/view-models/series-board";
import { formatInteger, formatMoney, formatPercent } from "./series-format";

interface SeriesProductPoolProps {
  products: TmallSeriesProductOption[];
}

export function SeriesProductPool({ products }: SeriesProductPoolProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProducts = useMemo(
    () =>
      normalizedSearch
        ? products.filter((product) =>
            `${product.productName} ${product.productId}`.toLowerCase().includes(normalizedSearch),
          )
        : products,
    [normalizedSearch, products],
  );

  return (
    <SectionCard
      title="当前日期商品池"
      description="展示当前经营日期全部商品，默认按 GMV 降序排列。"
      action={<StatusPill tone={filteredProducts.length > 0 ? "info" : "neutral"}>{filteredProducts.length} 个商品</StatusPill>}
    >
      <label className="mb-4 block text-sm font-medium text-slate-700">
        搜索商品名称 / ID
        <input
          className="form-input mt-2"
          type="search"
          value={searchTerm}
          placeholder="输入商品名称或商品 ID"
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>

      {filteredProducts.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="data-table min-w-[1040px]">
            <thead>
              <tr>
                <th className="min-w-72">商品名称</th>
                <th className="whitespace-nowrap">商品 ID</th>
                <th className="whitespace-nowrap">GMV</th>
                <th className="whitespace-nowrap">GSV</th>
                <th className="whitespace-nowrap">商品访客数</th>
                <th className="whitespace-nowrap">商品支付买家数</th>
                <th className="whitespace-nowrap">支付转化率</th>
                <th className="whitespace-nowrap">已加入系列状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.productId}>
                  <td className="min-w-72">
                    <p className="max-w-72 truncate font-medium text-slate-800" title={product.productName}>
                      {product.productName}
                    </p>
                  </td>
                  <td className="whitespace-nowrap">{product.productId}</td>
                  <td className="whitespace-nowrap">{formatMoney(product.gmv)}</td>
                  <td className="whitespace-nowrap">{formatMoney(product.gsv)}</td>
                  <td className="whitespace-nowrap">{formatInteger(product.visitors)}</td>
                  <td className="whitespace-nowrap">{formatInteger(product.paidBuyers)}</td>
                  <td className="whitespace-nowrap">{formatPercent(product.conversionRate)}</td>
                  <td className="whitespace-nowrap">
                    {product.hasBeenGrouped ? "已加入系列" : "未加入系列"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
          <p className="text-sm font-semibold text-slate-900">没有找到匹配商品</p>
          <p className="mt-2 text-sm text-slate-500">请换一个商品名称或商品 ID 关键词。</p>
        </div>
      )}
    </SectionCard>
  );
}
