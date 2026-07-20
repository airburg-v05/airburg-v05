import type { ReactNode } from "react";

interface DataTableV2Props {
  title: string;
  description: string;
  columns: string[];
  rows: ReactNode[][];
  action?: ReactNode;
}

export function DataTableV2({ title, description, columns, rows, action }: DataTableV2Props) {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[620px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
