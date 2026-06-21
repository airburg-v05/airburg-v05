import { SectionCard } from "@/components/ui/section-card";
import { StatusPill } from "@/components/ui/status-pill";
import { TMALL_SOURCE_LABELS } from "@/lib/tmall/source-types";
import type {
  TmallAnalysisDisplayResult,
  TmallDateRange,
  TmallSourceHealth,
  TmallSourceStatus,
  TmallSourceType,
} from "@/types/tmall";

interface TmallSourceHealthGridProps {
  result: TmallAnalysisDisplayResult;
}

const sourceOrder: TmallSourceType[] = [
  "business_product",
  "ad_product",
  "ad_plan",
  "after_sales",
];

const statusView: Record<
  TmallSourceStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  parsed: { label: "已解析", tone: "success" },
  missing: { label: "未上传", tone: "neutral" },
  unknown: { label: "未识别", tone: "warning" },
  error: { label: "解析失败", tone: "danger" },
};

const formatDateRange = (range: TmallDateRange): string => {
  if (!range.start) return "--";
  if (!range.end || range.end === range.start) return range.start;
  return `${range.start} 至 ${range.end}`;
};

export function TmallSourceHealthGrid({ result }: TmallSourceHealthGridProps) {
  return (
    <SectionCard
      title="四源文件健康度"
      description="只展示文件元数据和解析质量，不展示原始明细。"
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {sourceOrder.map((sourceType) => (
          <HealthCard
            key={sourceType}
            health={result.sourceHealth[sourceType]}
            dateRange={result.dateRanges[sourceType]}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function HealthCard({
  health,
  dateRange,
}: {
  health: TmallSourceHealth;
  dateRange: TmallDateRange;
}) {
  const view = statusView[health.status];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {health.expectedSourceType ? TMALL_SOURCE_LABELS[health.expectedSourceType] : "未知来源"}
          </p>
          <p className="mt-1 break-words text-xs text-slate-500">{health.fileName ?? "未选择文件"}</p>
        </div>
        <StatusPill tone={view.tone}>{view.label}</StatusPill>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <HealthMeta label="编码" value={health.encoding ?? "--"} />
        <HealthMeta label="表头行" value={health.headerRowNumber === null ? "--" : `第 ${health.headerRowNumber} 行`} />
        <HealthMeta label="数据行" value={`${health.rowCount} 行`} />
        <HealthMeta label="日期范围" value={formatDateRange(dateRange)} />
        <HealthMeta label="缺失字段" value={health.missingRequiredFields.length ? health.missingRequiredFields.join("、") : "无"} />
        <HealthMeta label="警告数量" value={`${health.warningTypes.length} 条`} />
      </div>
    </article>
  );
}

function HealthMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-700">{value}</p>
    </div>
  );
}
