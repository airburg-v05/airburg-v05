"use client";

import type { TmallProductOption } from "@/lib/tmall/view-models/product-board";

interface ProductToolbarProps {
  availableDates: string[];
  selectedDate: string | null;
  products: TmallProductOption[];
  selectedProductId: string | null;
  searchTerm: string;
  onDateChange: (date: string) => void;
  onProductChange: (productId: string) => void;
  onSearchChange: (searchTerm: string) => void;
}

export function ProductToolbar({
  availableDates,
  selectedDate,
  products,
  selectedProductId,
  searchTerm,
  onDateChange,
  onProductChange,
  onSearchChange,
}: ProductToolbarProps) {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((product) =>
        `${product.productName} ${product.productId}`.toLowerCase().includes(normalizedSearch),
      )
    : products;
  const selectedInFilteredProducts = filteredProducts.some((product) => product.productId === selectedProductId);

  return (
    <section className="panel p-5">
      <div className="grid gap-4 lg:grid-cols-[0.7fr_1fr_1fr]">
        <label className="text-sm font-medium text-slate-700">
          经营日期
          <select
            className="form-input mt-2"
            value={selectedDate ?? ""}
            onChange={(event) => onDateChange(event.target.value)}
            disabled={availableDates.length <= 1}
          >
            {availableDates.length > 0 ? (
              availableDates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))
            ) : (
              <option value="">暂无日期</option>
            )}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          当前商品
          <select
            className="form-input mt-2 truncate"
            value={selectedInFilteredProducts ? selectedProductId ?? "" : ""}
            onChange={(event) => {
              if (event.target.value) onProductChange(event.target.value);
            }}
            disabled={filteredProducts.length === 0}
          >
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.productName} · ID {product.productId}
                </option>
              ))
            ) : (
              <option value="">未找到匹配商品</option>
            )}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          搜索商品名称 / ID
          <input
            className="form-input mt-2"
            type="search"
            value={searchTerm}
            placeholder="输入商品名称或商品 ID"
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
        当前版本按单日经营日期展示，多日趋势和月份目标将在后续阶段接入。当前阶段：日均 GMV = 当前日期 GMV。
      </p>
    </section>
  );
}
