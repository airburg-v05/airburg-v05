import { SectionCard } from "@/components/ui/section-card";
import type {
  TmallProductFocusEntryItem,
  TmallProductFocusEntryViewModel,
} from "@/lib/tmall/view-models/product-focus-entry";

interface ProductFocusEntryProps {
  focusEntry: TmallProductFocusEntryViewModel;
  onSelectProduct: (productId: string) => void;
}

interface ProductFocusGroupProps {
  title: string;
  description: string;
  emptyMessage: string;
  items: TmallProductFocusEntryItem[];
  onSelectProduct: (productId: string) => void;
}

function EmptyFocusEntryState() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">
        当前经营日期没有可用于快速切换的商品数据。
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
        请先确认四源分析结果包含当前日期的商品经营数据。
      </p>
    </div>
  );
}

function ProductFocusItem({
  item,
  onSelectProduct,
}: {
  item: TmallProductFocusEntryItem;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectProduct(item.productId)}
      className={`w-full rounded-xl border px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 ${
        item.isSelected
          ? "border-blue-300 bg-blue-50 shadow-sm"
          : "border-slate-100 bg-white"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                tag === "当前查看"
                  ? "bg-blue-600 text-white ring-blue-600/20"
                  : "bg-slate-100 text-slate-600 ring-slate-500/10"
              }`}
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-5 text-slate-950">
            {item.productName}
          </p>
          <p className="mt-1 break-all text-xs leading-5 text-slate-400">
            商品 ID：{item.productId}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {item.metrics.map((metric) => (
            <div key={`${item.productId}-${metric.label}`} className="min-w-0">
              <p className="text-xs text-slate-400">{metric.label}</p>
              <p className="mt-0.5 break-words text-xs font-semibold text-slate-700">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function ProductFocusGroup({
  title,
  description,
  emptyMessage,
  items,
  onSelectProduct,
}: ProductFocusGroupProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        <p className="text-xs font-semibold text-slate-500">{items.length} / 5</p>
      </div>

      {items.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <ProductFocusItem
              key={`${title}-${item.productId}`}
              item={item}
              onSelectProduct={onSelectProduct}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

function SelectedProductCard({
  item,
  onSelectProduct,
}: {
  item: TmallProductFocusEntryItem | null;
  onSelectProduct: (productId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">当前已选商品</p>
          <p className="mt-1 text-xs leading-5 text-blue-700">
            查看当前商品详情状态，不跳转页面。
          </p>
        </div>
        <span className="w-fit rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
          当前查看
        </span>
      </div>

      {item ? (
        <div className="mt-4">
          <ProductFocusItem item={item} onSelectProduct={onSelectProduct} />
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white px-2 py-1 text-slate-600">
              有经营数据
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-slate-600">
              {item.hasAdData ? "有推广数据" : "暂无推广数据"}
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-slate-600">
              {item.hasAfterSalesData ? "有售后记录" : "暂无售后记录"}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-blue-100 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
          当前还没有选中的商品。
        </p>
      )}
    </div>
  );
}

export function ProductFocusEntry({
  focusEntry,
  onSelectProduct,
}: ProductFocusEntryProps) {
  return (
    <SectionCard
      title="重点商品入口"
      description="基于当前经营日期的商品经营、推广和售后聚合数据，快速选择优先查看的商品。"
    >
      {focusEntry.isEmpty ? <EmptyFocusEntryState /> : null}

      {!focusEntry.isEmpty ? (
        <div className="space-y-4">
          <SelectedProductCard
            item={focusEntry.selectedProduct}
            onSelectProduct={onSelectProduct}
          />

          <div className="grid gap-4 xl:grid-cols-3">
            <ProductFocusGroup
              title="销售 TOP 商品"
              description="按当前经营日期 GMV 从高到低排序。"
              emptyMessage="当前经营日期暂无销售 TOP 商品。"
              items={focusEntry.salesTopProducts}
              onSelectProduct={onSelectProduct}
            />
            <ProductFocusGroup
              title="推广重点商品"
              description="只展示商品推广报表中存在数据的商品。"
              emptyMessage="当前经营日期暂无商品推广数据，不按 0 计算。"
              items={focusEntry.adFocusProducts}
              onSelectProduct={onSelectProduct}
            />
            <ProductFocusGroup
              title="售后需关注商品"
              description="只展示商品级安全聚合售后指标。"
              emptyMessage="当前经营日期暂无需要重点展示的售后商品。"
              items={focusEntry.afterSalesFocusProducts}
              onSelectProduct={onSelectProduct}
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
            <div className="space-y-2">
              {focusEntry.notices.map((notice) => (
                <p key={notice}>{notice}</p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
