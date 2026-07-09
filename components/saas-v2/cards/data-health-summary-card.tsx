import { SafeIssueCodeBadge } from "@/components/saas-v2/badges/safe-issue-code-badge";

export function DataHealthSummaryCard() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">数据覆盖健康</h2>
          <p className="mt-1 text-sm text-slate-500">覆盖日历、缺失、重复、skipped 和不可计算原因。</p>
        </div>
        <SafeIssueCodeBadge code="PREVIEW_PENDING" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {["缺失数据", "重复上传", "skipped 文件", "指标不可计算"].map((item) => (
          <div key={item} className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">{item}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">等待 active dataset 后显示安全摘要。</p>
          </div>
        ))}
      </div>
    </section>
  );
}
