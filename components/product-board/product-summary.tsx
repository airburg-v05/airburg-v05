import { ProductIcon } from "@/components/icons";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallProductBoardOverview } from "@/lib/tmall/view-models/product-board";

interface ProductSummaryProps {
  overview: TmallProductBoardOverview;
}

export function ProductSummary({ overview }: ProductSummaryProps) {
  const product = overview.selectedProduct;

  if (!product) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-500">当前经营日期没有可分析商品。</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="当前商品信息">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <ProductIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{product.productName}</h2>
            <p className="mt-1 break-all text-xs text-slate-500">商品 ID：{product.productId}</p>
            <p className="mt-2 text-xs text-slate-500">
              当前经营日期：{overview.selectedDate ?? "--"} · 当前日期商品总数：{overview.products.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusPill tone="info">GMV 排名第 {product.rank}</StatusPill>
          <StatusPill tone={product.hasAdData ? "success" : "neutral"}>
            {product.hasAdData ? "存在商品推广数据" : "暂无推广数据"}
          </StatusPill>
          <StatusPill tone={product.hasAfterSalesData ? "warning" : "neutral"}>
            {product.hasAfterSalesData ? "存在售后汇总" : "暂无售后汇总"}
          </StatusPill>
        </div>
      </div>
    </SectionCard>
  );
}
