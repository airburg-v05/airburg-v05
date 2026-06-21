import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallSeriesProductRow } from "@/lib/tmall/view-models/series-board";
import { formatInteger, formatMoney, formatPercent, formatRoi } from "./series-format";

interface SeriesProductTableProps {
  rows: TmallSeriesProductRow[];
}

export function SeriesProductTable({ rows }: SeriesProductTableProps) {
  return (
    <SectionCard
      title="系列商品明细"
      description="已匹配商品展示真实指标；未匹配商品只展示商品 ID 和匹配状态。"
      action={<StatusPill tone={rows.length > 0 ? "info" : "neutral"}>{rows.length} 个商品 ID</StatusPill>}
    >
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="data-table min-w-[1280px]">
            <thead>
              <tr>
                <th className="min-w-72">商品名称</th>
                <th className="whitespace-nowrap">商品 ID</th>
                <th className="whitespace-nowrap">匹配状态</th>
                <th className="whitespace-nowrap">GMV</th>
                <th className="whitespace-nowrap">GSV</th>
                <th className="whitespace-nowrap">商品访客数</th>
                <th className="whitespace-nowrap">商品支付买家数</th>
                <th className="whitespace-nowrap">支付转化率</th>
                <th className="whitespace-nowrap">推广数据</th>
                <th className="whitespace-nowrap">推广花费</th>
                <th className="whitespace-nowrap">推广 ROI</th>
                <th className="whitespace-nowrap">成功退款金额</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId}>
                  <td className="min-w-72">
                    {row.productName ? (
                      <p className="max-w-72 truncate font-medium text-slate-800" title={row.productName}>
                        {row.productName}
                      </p>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{row.productId}</td>
                  <td className="whitespace-nowrap">
                    {row.matchStatus === "matched" ? "已匹配" : "当前日期未匹配"}
                  </td>
                  <td className="whitespace-nowrap">{formatMoney(row.gmv)}</td>
                  <td className="whitespace-nowrap">{formatMoney(row.gsv)}</td>
                  <td className="whitespace-nowrap">{formatInteger(row.visitors)}</td>
                  <td className="whitespace-nowrap">{formatInteger(row.paidBuyers)}</td>
                  <td className="whitespace-nowrap">{formatPercent(row.conversionRate)}</td>
                  <td className="whitespace-nowrap">{row.hasAdData ? "存在推广数据" : "暂无推广数据"}</td>
                  <td className="whitespace-nowrap">{row.hasAdData ? formatMoney(row.adSpend) : "--"}</td>
                  <td className="whitespace-nowrap">{row.hasAdData ? formatRoi(row.adRoi) : "--"}</td>
                  <td className="whitespace-nowrap">{formatMoney(row.refundSuccessAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
          <p className="text-sm font-semibold text-slate-900">当前系列还没有商品 ID</p>
          <p className="mt-2 text-sm text-slate-500">请在下方编辑系列并添加商品。</p>
        </div>
      )}
    </SectionCard>
  );
}
