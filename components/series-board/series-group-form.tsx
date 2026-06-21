"use client";

import { useMemo, useState } from "react";
import type { TmallSeriesGroup } from "@/lib/storage/tmall-series-storage";
import type { TmallSeriesProductOption } from "@/lib/tmall/view-models/series-board";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatInteger, formatMoney } from "./series-format";

interface SeriesGroupFormProps {
  products: TmallSeriesProductOption[];
  groups: TmallSeriesGroup[];
  editingGroup: TmallSeriesGroup | null;
  onSave: (input: {
    id?: string;
    name: string;
    description: string;
    productIds: string[];
  }) => void;
  onCancelEdit: () => void;
}

const nameWeight = (value: string): number =>
  [...value].reduce((total, char) => total + (char.charCodeAt(0) > 127 ? 2 : 1), 0);

export function SeriesGroupForm({
  products,
  groups,
  editingGroup,
  onSave,
  onCancelEdit,
}: SeriesGroupFormProps) {
  const [name, setName] = useState(editingGroup?.name ?? "");
  const [description, setDescription] = useState(editingGroup?.description ?? "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    editingGroup?.productIds.map(String) ?? [],
  );
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const trimmedName = name.trim();
  const tooLong = nameWeight(trimmedName) > 60;
  const duplicateName = groups.some(
    (group) =>
      group.id !== editingGroup?.id &&
      group.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  const visibleProducts = useMemo(
    () =>
      normalizedSearch
        ? products.filter((product) =>
            `${product.productName} ${product.productId}`.toLowerCase().includes(normalizedSearch),
          )
        : products,
    [normalizedSearch, products],
  );
  const productIdsInOtherGroups = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => group.id !== editingGroup?.id)
          .flatMap((group) => group.productIds.map(String)),
      ),
    [editingGroup?.id, groups],
  );
  const currentProductIds = new Set(products.map((product) => product.productId));
  const unmatchedSelectedProductIds = selectedProductIds.filter(
    (productId) => !currentProductIds.has(productId),
  );
  const canSave = trimmedName.length > 0 && !tooLong && selectedProductIds.length > 0;

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((item) => item !== productId)
        : [...current, productId],
    );
  };

  const handleSubmit = () => {
    if (!canSave) return;

    onSave({
      id: editingGroup?.id,
      name: trimmedName,
      description: description.trim(),
      productIds: [...new Set(selectedProductIds.map(String))],
    });
  };

  return (
    <SectionCard
      title={editingGroup ? "编辑系列" : "新建系列"}
      description="保存时只写入系列名称、描述和商品 ID，不保存商品名称或原始报表行。"
      action={<StatusPill tone={editingGroup ? "warning" : "info"}>{editingGroup ? "编辑中" : "新建"}</StatusPill>}
    >
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            系列名称
            <input
              className="form-input mt-2"
              value={name}
              maxLength={60}
              placeholder="例如：除醛核心款"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {tooLong ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              系列名称过长，请控制在 30 个中文字符或 60 个英文字符以内。
            </p>
          ) : null}
          {duplicateName ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              存在同名系列，请确认是否继续。
            </p>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            系列描述
            <textarea
              className="form-input mt-2 min-h-28 resize-y"
              value={description}
              placeholder="可填写系列定位、适用场景或运营备注"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
            已选择 {formatInteger(selectedProductIds.length)} 个商品。商品允许重复加入多个系列；如果商品已存在于其他系列，会在右侧列表提示。
          </div>

          {unmatchedSelectedProductIds.length > 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              当前编辑系列中有 {formatInteger(unmatchedSelectedProductIds.length)} 个商品 ID 未出现在当前日期商品池，保存时会继续保留。
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="primary-button"
              disabled={!canSave}
              onClick={handleSubmit}
            >
              {editingGroup ? "保存修改" : "创建系列"}
            </button>
            {editingGroup ? (
              <button type="button" className="secondary-button" onClick={onCancelEdit}>
                取消编辑
              </button>
            ) : null}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            搜索商品名称 / ID
            <input
              className="form-input mt-2"
              type="search"
              value={searchTerm}
              placeholder="输入商品名称或商品 ID"
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {visibleProducts.length > 0 ? (
              visibleProducts.map((product) => {
                const checked = selectedProductIds.includes(product.productId);
                const groupedElsewhere = productIdsInOtherGroups.has(product.productId);
                return (
                  <label
                    key={product.productId}
                    className={`block rounded-xl border bg-white p-3 transition ${
                      checked ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        className="mt-1 h-4 w-4"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(product.productId)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800" title={product.productName}>
                          {product.productName}
                        </p>
                        <p className="mt-1 whitespace-nowrap text-xs text-slate-500">
                          商品 ID：{product.productId}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>GMV：{formatMoney(product.gmv)}</span>
                          <span>访客：{formatInteger(product.visitors)}</span>
                        </div>
                        {groupedElsewhere ? (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            该商品已存在于其他系列，仍可重复加入。
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-slate-900">没有找到匹配商品</p>
                <p className="mt-2 text-sm text-slate-500">请换一个商品名称或商品 ID 关键词。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
