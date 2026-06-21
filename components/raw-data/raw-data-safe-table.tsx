import type {
  RawDataSafeColumn,
  RawDataSafeRow,
  RawDataSafeSourceKey,
} from "@/lib/tmall/view-models/raw-data-safe-inspection";

interface RawDataSafeTableProps {
  sourceKey: RawDataSafeSourceKey;
  sourceLabel: string;
  columns: RawDataSafeColumn[];
  rows: RawDataSafeRow[];
  searchTerm: string;
  selectedDate: string | null;
}

const emptyMessage = ({
  searchTerm,
  selectedDate,
}: {
  searchTerm: string;
  selectedDate: string | null;
}): string => {
  if (searchTerm.trim()) return "当前筛选无结果。";
  if (!selectedDate) return "当前来源暂无数据。";
  return "当前日期暂无数据。";
};

export function RawDataSafeTable({
  sourceKey,
  sourceLabel,
  columns,
  rows,
  searchTerm,
  selectedDate,
}: RawDataSafeTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl bg-slate-50 px-4 text-center">
        <p className="text-sm font-semibold text-slate-900">
          {emptyMessage({ searchTerm, selectedDate })}
        </p>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          {sourceKey === "after_sales_safe"
            ? "售后页签只展示安全聚合结果，不展示任何个人、交易、配送或沟通类敏感明细。"
            : `请确认 ${sourceLabel} 在当前日期下是否有安全聚合数据。`}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="data-table min-w-[980px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50">序号</th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.align === "right" ? "text-right" : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              <td className="sticky left-0 bg-white font-medium text-slate-500">{rowIndex + 1}</td>
              {columns.map((column) => {
                const text = row.cells[column.key] ?? "--";

                return (
                  <td
                    key={`${row.id}-${column.key}`}
                    className={`${column.align === "right" ? "text-right" : ""} max-w-72 break-words`}
                    title={text}
                  >
                    {text || "--"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
