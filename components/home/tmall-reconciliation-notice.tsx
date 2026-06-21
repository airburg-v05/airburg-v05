import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import type { TmallHomeOverview } from "@/lib/tmall/view-models/home-overview";

interface TmallReconciliationNoticeProps {
  overview: TmallHomeOverview;
}

export function TmallReconciliationNotice({ overview }: TmallReconciliationNoticeProps) {
  const reconciliation = overview.reconciliation;

  if (!reconciliation || reconciliation.reconciliationStatus === "matched") {
    return null;
  }

  if (reconciliation.reconciliationStatus === "missing_comparable_dates") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        当前日期缺少可对比的商品推广或计划推广数据。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <StatusPill tone="warning">口径提醒</StatusPill>
        <p>
          计划推广报表与商品推广报表存在金额口径差异，店铺推广总量当前采用计划推广报表。
        </p>
      </div>
      <Link href="/upload" className="secondary-button bg-white px-3 py-2 text-xs text-amber-800">
        查看数据质量
      </Link>
    </div>
  );
}
