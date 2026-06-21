import {
  AlertIcon,
  ArrowUpRightIcon,
  DatabaseIcon,
  ProductIcon,
  StoreIcon,
} from "@/components/icons";
import { MetricCard } from "@/components/ui/metric-card";
import type { TmallHomeOverview } from "@/lib/tmall/view-models/home-overview";
import { formatInteger, formatMoney, formatPercent, formatRoi } from "./tmall-format";

interface TmallMetricGridProps {
  overview: TmallHomeOverview;
}

export function TmallMetricGrid({ overview }: TmallMetricGridProps) {
  const metrics = overview.metrics;
  const businessMissing = !overview.sourceAvailability.business_product.hasSelectedDateData;
  const adMissing = !overview.sourceAvailability.ad_plan.hasSelectedDateData;

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="GMV"
          value={formatMoney(metrics.gmv)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · 支付金额合计"}
          icon={<StoreIcon className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          label="GSV"
          value={formatMoney(metrics.gsv)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · GMV - 成功退款金额"}
          icon={<DatabaseIcon className="h-5 w-5" />}
          tone="emerald"
        />
        <MetricCard
          label="成功退款金额"
          value={formatMoney(metrics.refundSuccessAmount)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · 成功退款金额合计"}
          icon={<AlertIcon className="h-5 w-5" />}
          tone="amber"
        />
        <MetricCard
          label="商品访客数"
          value={formatInteger(metrics.visitors)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · 商品访客数合计"}
          icon={<ProductIcon className="h-5 w-5" />}
          tone="violet"
        />
        <MetricCard
          label="商品支付买家数"
          value={formatInteger(metrics.paidBuyers)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · 商品支付买家数合计"}
          icon={<ProductIcon className="h-5 w-5" />}
          tone="slate"
        />
        <MetricCard
          label="支付转化率"
          value={formatPercent(metrics.conversionRate)}
          helper={businessMissing ? "生意参谋商品表 · 数据缺失" : "生意参谋商品表 · 支付买家数 ÷ 商品访客数"}
          icon={<ArrowUpRightIcon className="h-5 w-5" />}
          tone="blue"
        />
        <MetricCard
          label="推广花费"
          value={formatMoney(metrics.adSpend)}
          helper={adMissing ? "计划推广报表 · 数据缺失" : "计划推广报表 · 单日花费合计"}
          icon={<DatabaseIcon className="h-5 w-5" />}
          tone="amber"
        />
        <MetricCard
          label="推广投入产出比"
          value={formatRoi(metrics.adRoi)}
          helper={adMissing ? "计划推广报表 · 数据缺失" : "计划推广报表 · 成交金额 ÷ 推广花费"}
          icon={<ArrowUpRightIcon className="h-5 w-5" />}
          tone="emerald"
        />
      </section>
      <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700">
        成功退款金额按报表统计周期内的退款完成口径计算，可能包含历史支付订单。当前 GSV 表示“当期支付金额 - 当期成功退款金额”，不等同于同日订单最终净销售额。
      </p>
    </div>
  );
}
