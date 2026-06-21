import { StatusPill } from "@/components/ui/status-pill";
import type {
  RawDataSafeSourceKey,
  RawDataSafeSourceTab,
} from "@/lib/tmall/view-models/raw-data-safe-inspection";

interface RawDataSourceTabsProps {
  tabs: RawDataSafeSourceTab[];
  activeSource: RawDataSafeSourceKey;
  onSourceChange: (source: RawDataSafeSourceKey) => void;
}

const statusTone = (tab: RawDataSafeSourceTab): "success" | "warning" | "danger" | "neutral" => {
  if (tab.available) return "success";
  if (tab.statusLabel === "缺失" || tab.statusLabel === "暂无") return "neutral";
  if (tab.statusLabel === "无数据") return "warning";
  return "danger";
};

export function RawDataSourceTabs({
  tabs,
  activeSource,
  onSourceChange,
}: RawDataSourceTabsProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">四源数据</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            切换来源只影响当前页面展示，不读取售后原始明细。
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === activeSource;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSourceChange(tab.key)}
              className={`min-w-0 rounded-full px-3 py-2 text-xs font-semibold ring-1 transition ${
                active
                  ? "bg-blue-600 text-white ring-blue-600/20"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              <span className="break-words">{tab.label}</span>
              <span className={active ? "ml-1 text-blue-100" : "ml-1 text-slate-400"}>
                {tab.count}
              </span>
              <span className="ml-2 inline-flex align-middle">
                <StatusPill tone={statusTone(tab)}>{tab.statusLabel}</StatusPill>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
