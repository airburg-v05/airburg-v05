interface TrendEmptyStateProps {
  title: string;
  description?: string;
}

export function TrendEmptyState({ title, description }: TrendEmptyStateProps) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description ? <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p> : null}
    </div>
  );
}
