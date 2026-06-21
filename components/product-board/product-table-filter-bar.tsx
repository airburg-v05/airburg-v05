import type {
  TmallProductTableOperatingFilterKey,
  TmallProductTableOperatingFilterOption,
} from "@/lib/tmall/view-models/product-table-operating-filters";

interface ProductTableFilterBarProps {
  filters: TmallProductTableOperatingFilterOption[];
  activeFilter: TmallProductTableOperatingFilterKey;
  onFilterChange: (filter: TmallProductTableOperatingFilterKey) => void;
}

export function ProductTableFilterBar({
  filters,
  activeFilter,
  onFilterChange,
}: ProductTableFilterBarProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">运营筛选</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            筛选只影响当前表格展示，可与商品搜索同时生效。
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.key === activeFilter;

          return (
            <button
              key={filter.key}
              type="button"
              title={filter.description}
              onClick={() => onFilterChange(filter.key)}
              className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 transition ${
                active
                  ? "bg-blue-600 text-white ring-blue-600/20"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {filter.label}
              <span className={active ? "ml-1 text-blue-100" : "ml-1 text-slate-400"}>
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
