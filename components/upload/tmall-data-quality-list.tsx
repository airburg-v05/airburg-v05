import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";

interface TmallDataQualityListProps {
  warnings: string[];
}

const categories = [
  {
    id: "source",
    label: "来源与解析",
    match: (warning: string) =>
      warning.includes("source_") ||
      warning.includes("parse_error") ||
      warning.includes("summary_rows") ||
      warning.includes("invalid_"),
  },
  {
    id: "date",
    label: "日期对齐",
    match: (warning: string) => warning.startsWith("date_alignment:"),
  },
  {
    id: "reconciliation",
    label: "推广核对",
    match: (warning: string) => warning.startsWith("reconciliation:"),
  },
  {
    id: "after_sales",
    label: "售后口径",
    match: (warning: string) => warning.startsWith("after_sales:"),
  },
];

export function TmallDataQualityList({ warnings }: TmallDataQualityListProps) {
  const grouped = categories.map((category) => ({
    ...category,
    warnings: warnings.filter(category.match),
  }));
  const uncategorized = warnings.filter((warning) => !categories.some((category) => category.match(warning)));

  return (
    <SectionCard
      title="数据质量提示"
      description="这些提示用于判断口径风险，不代表页面功能失败。"
      action={
        warnings.length > 0 ? (
          <StatusPill tone="warning">{warnings.length} 条提示</StatusPill>
        ) : (
          <StatusPill tone="success">暂无提示</StatusPill>
        )
      }
    >
      {warnings.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">当前聚合结果没有发现明显质量提示。</p>
      ) : (
        <div className="space-y-4">
          {grouped
            .filter((group) => group.warnings.length > 0)
            .map((group) => (
              <WarningGroup key={group.id} title={group.label} warnings={group.warnings} />
            ))}
          {uncategorized.length > 0 ? <WarningGroup title="其他提示" warnings={uncategorized} /> : null}
        </div>
      )}
    </SectionCard>
  );
}

function WarningGroup({ title, warnings }: { title: string; warnings: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {warnings.map((warning) => (
          <li key={warning}>{warningText(warning)}</li>
        ))}
      </ul>
    </div>
  );
}

function warningText(warning: string): string {
  if (warning.endsWith(":source_missing")) return "该来源未上传，依赖该来源的指标会缺失。";
  if (warning.endsWith(":source_unrecognized")) return "该来源表头未被识别为预期报表，请检查是否放错位置。";
  if (warning.endsWith(":invalid_date")) return "存在无法识别的日期，相关行不会进入按日期统计。";
  if (warning.endsWith(":invalid_id")) return "存在无法识别的商品 ID 或计划 ID，关联统计会受到影响。";
  if (warning.endsWith(":summary_rows_detected")) return "检测到合计/汇总行，当前解析结果已记录该风险。";
  if (warning.endsWith(":parse_error")) return "文件解析失败，该来源不会进入分析。";
  if (warning === "date_alignment:business_product_ad_product_no_simple_overlap") {
    return "生意参谋商品报表与商品推广报表没有简单日期重叠，跨源对比需要谨慎。";
  }
  if (warning === "date_alignment:ad_product_ad_plan_range_different") {
    return "商品推广报表与计划推广报表日期范围不同，推广金额核对可能出现口径差异。";
  }
  if (warning === "reconciliation:ad_report_difference") {
    return "计划报表与商品推广报表的花费或成交金额存在差异，按黄色口径提示处理。";
  }
  if (warning === "after_sales:unknown_status" || warning.endsWith(":unknown_after_sales_status")) {
    return "售后表存在未归类状态，售后状态分布需要复核。";
  }

  return "检测到一条数据质量提示，已隐藏具体内容，请复核上传文件日期和字段。";
}
