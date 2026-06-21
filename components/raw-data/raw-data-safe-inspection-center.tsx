import Link from "next/link";
import { RawDataSafeTable } from "@/components/raw-data/raw-data-safe-table";
import { RawDataSourceTabs } from "@/components/raw-data/raw-data-source-tabs";
import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import {
  filterRawDataSafeRows,
  type RawDataSafeInspectionViewModel,
  type RawDataSafeSourceKey,
} from "@/lib/tmall/view-models/raw-data-safe-inspection";

interface RawDataSafeInspectionCenterProps {
  inspection: RawDataSafeInspectionViewModel;
  activeSource: RawDataSafeSourceKey;
  searchTerm: string;
  onSourceChange: (source: RawDataSafeSourceKey) => void;
  onSearchTermChange: (searchTerm: string) => void;
  onDateChange: (date: string | null) => void;
}

const statusTone: Record<RawDataSafeInspectionViewModel["status"], "success" | "warning" | "danger" | "neutral"> = {
  normal: "success",
  watch: "warning",
  risk: "danger",
  empty: "neutral",
};

const quickLinks = [
  { href: "/upload", label: "返回上传页" },
  { href: "/home", label: "查看首页" },
  { href: "/store-board", label: "查看店铺看板" },
  { href: "/product-board", label: "查看宝贝看板" },
];

function SummaryValue({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value ?? "--"}
      </p>
    </div>
  );
}

export function RawDataSafeInspectionCenter({
  inspection,
  activeSource,
  searchTerm,
  onSourceChange,
  onSearchTermChange,
  onDateChange,
}: RawDataSafeInspectionCenterProps) {
  const activeTab =
    inspection.sourceTabs.find((tab) => tab.key === activeSource) ??
    inspection.sourceTabs[0];
  const activeSourceKey = activeTab?.key ?? "business_product";
  const sourceRows = inspection.rowsBySource[activeSourceKey] ?? [];
  const filteredRows = filterRawDataSafeRows({ rows: sourceRows, searchTerm });
  const columns = inspection.columnsBySource[activeSourceKey];
  const parsedSourceCount = inspection.sourceTabs.filter((tab) =>
    tab.statusLabel === "已解析" || tab.statusLabel === "无数据",
  ).length;
  const canRenderSafeTable = !inspection.isEmpty && !!inspection.analysisTimestamp;

  return (
    <div className="space-y-6">
      <SectionCard
        title="原始数据安全查看中心"
        description="按来源、日期和关键词查看安全聚合数据，用于复核上传结果和辅助排查数据质量提示。"
        action={<StatusPill tone={statusTone[inspection.status]}>{inspection.statusLabel}</StatusPill>}
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-950">
                  {inspection.isEmpty ? "暂无可查看数据" : "当前展示安全聚合结果"}
                </p>
                <p className="mt-2 break-words text-sm leading-6 text-blue-800">
                  售后页签只展示安全汇总，不展示任何个人、交易、配送或沟通类敏感明细。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {quickLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="secondary-button bg-white/80">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryValue label="分析状态" value={inspection.statusLabel} />
            <SummaryValue label="最近分析时间" value={inspection.analysisTimestamp} />
            <SummaryValue label="当前选中日期" value={inspection.selectedDate} />
            <SummaryValue label="可用日期数量" value={inspection.availableDates.length} />
            <SummaryValue label="四源解析数量" value={`${parsedSourceCount} / 4`} />
            <SummaryValue label="质量提示" value={`${inspection.dataQualityWarningCount} 条`} />
          </div>

          {inspection.safeWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-900">数据质量 warning 摘要</p>
                <StatusPill tone="warning">{inspection.safeWarnings.length} 条</StatusPill>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
                {inspection.safeWarnings.map((warning, index) => (
                  <p key={`${warning}-${index}`} className="break-words rounded-lg bg-white/70 px-3 py-2">
                    {warning}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">查看筛选</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
              <label className="block min-w-0" htmlFor="raw-data-date">
                <span className="text-xs font-medium text-slate-500">经营日期</span>
                <select
                  id="raw-data-date"
                  name="rawDataDate"
                  value={inspection.selectedDate ?? ""}
                  disabled={inspection.availableDates.length === 0}
                  onChange={(event) => onDateChange(event.target.value || null)}
                  className="form-input mt-2"
                >
                  {inspection.availableDates.length > 0 ? (
                    inspection.availableDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))
                  ) : (
                    <option value="">暂无可用日期</option>
                  )}
                </select>
              </label>

              <label className="block min-w-0" htmlFor="raw-data-search">
                <span className="text-xs font-medium text-slate-500">搜索</span>
                <input
                  id="raw-data-search"
                  name="rawDataSearch"
                  value={searchTerm}
                  onChange={(event) => onSearchTermChange(event.target.value)}
                  className="form-input mt-2"
                  placeholder="搜索商品名称、商品 ID、计划名称或计划 ID"
                />
              </label>
            </div>
          </div>
        </div>
      </SectionCard>

      {canRenderSafeTable ? (
        <SectionCard
          title="安全字段表格"
          description="只展示当前来源、当前日期、当前搜索条件下的安全字段。"
          action={<StatusPill tone={filteredRows.length > 0 ? "info" : "neutral"}>{filteredRows.length} 行</StatusPill>}
        >
          <div className="space-y-4">
            <RawDataSourceTabs
              tabs={inspection.sourceTabs}
              activeSource={activeSourceKey}
              onSourceChange={onSourceChange}
            />
            <RawDataSafeTable
              sourceKey={activeSourceKey}
              sourceLabel={activeTab?.label ?? "当前来源"}
              columns={columns}
              rows={filteredRows}
              searchTerm={searchTerm}
              selectedDate={inspection.selectedDate}
            />
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              <div className="space-y-2">
                {inspection.notices.map((notice) => (
                  <p key={notice} className="break-words">
                    {notice}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-slate-900">
              {inspection.status === "risk" ? "本地分析结果不可用" : "暂无可查看数据"}
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              {inspection.notices[0] ?? "请先在上传页完成本地四源分析。"}
            </p>
            <Link href="/upload" className="primary-button mt-5">
              返回上传页
            </Link>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
